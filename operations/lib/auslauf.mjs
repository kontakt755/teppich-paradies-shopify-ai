/**
 * Auslauf-Pruefung: gibt es, was wir verkaufen, beim Lieferanten noch?
 *
 * Inhaberregel 2026-10-13 (AGENTS.md, Produktdaten): Ausgelaufenes wird nie
 * angezeigt. Diese Datei rechnet nur - kein Netz, kein Schreibzugriff. Das
 * Abrufen macht operations/scripts/auslauf-pruefen.mjs, das Archivieren ein
 * Mensch bzw. eine Sitzung nach Gegenprobe. Der Lauf archiviert nie selbst:
 * eine Stoerung beim Lieferanten saehe sonst aus wie ein Massenauslauf.
 */

/** Woerter, an denen ein Lieferant Auslauf kenntlich macht. Wortgrenzen, sonst trifft "...verkauf" in Markennamen. */
export const AUSLAUF_HINWEIS = /\b(auslauf\w*|nicht mehr (lieferbar|verf[üu]gbar|erh[äa]ltlich)|ausverkauft|discontinued|abverkauf)\b/i;

/**
 * Wie die Lieferanten ein fehlendes Produkt melden (beobachtet 13.10.2026):
 * C antwortet mit 500, D mit 410 ("Produkt nicht gefunden"), E mit 404.
 * A hat keine Produktseiten je Artikelnummer - dort entscheidet die Schnellsuche.
 */
export const FEHLT_CODES = {
  C: [404, 410, 500],
  D: [404, 410],
  E: [404, 410],
};

/** Ueber diesem Anteil (Fehler oder "fehlt") gilt ein Lieferant als gestoert, nicht als ausgelaufen. */
export const AUSFALL_GRENZE = 0.05;

/** Lieferanten, die online pruefbar sind. B hat nur Kataloge und Datenlisten. */
export const PRUEFBAR = ['A', 'C', 'D', 'E'];

/**
 * Pruefziele aus dem Lexikon-Export ($TP_PRIVAT_DIR/lexikon/produkte.json).
 * Archivierte Produkte zaehlen nicht - die sind schon weg.
 * A: je Artikelnummer; C/D/E: je Lieferantenseite (mehrere Breiten teilen sich eine Seite).
 */
export function pruefziele(produkte = []) {
  const ziele = { A: new Map(), C: new Map(), D: new Map(), E: new Map() };
  const ohneOnline = new Map();
  for (const p of produkte) {
    if (p.status === 'ARCHIVED') continue;
    for (const v of p.varianten || []) {
      const e = v.einkauf || {};
      const lf = e.lieferant;
      if (!lf) continue;
      if (lf === 'A') {
        if (!e.artikelnummer) continue;
        const z = ziele.A.get(e.artikelnummer) || { kennung: e.artikelnummer, handles: new Set() };
        z.handles.add(p.handle);
        ziele.A.set(e.artikelnummer, z);
      } else if (ziele[lf] && e.url) {
        const kennung = lf === 'C' ? e.artikelnummer : e.farbnummer;
        const z = ziele[lf].get(e.url) || { kennung: kennung || null, url: e.url, handles: new Set() };
        z.handles.add(p.handle);
        ziele[lf].set(e.url, z);
      } else {
        ohneOnline.set(lf, (ohneOnline.get(lf) || 0) + 1);
      }
    }
  }
  const liste = m => [...m.values()].map(z => ({ ...z, handles: [...z.handles].sort() }));
  return {
    A: liste(ziele.A), C: liste(ziele.C), D: liste(ziele.D), E: liste(ziele.E),
    ohneOnline: Object.fromEntries([...ohneOnline].sort()),
  };
}

/** Sichtbarer Seitentext ohne Skripte, Stile und Fusszeile (die nennt Markennamen und Aktionen). */
export function seitenText(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Eine abgerufene Lieferantenseite bewerten.
 * @returns {{ergebnis: 'ok'|'fehlt'|'hinweis'|'verdacht'|'fehler', grund?: string}}
 *   fehlt     Seite meldet "nicht gefunden" - Auslauf, nach Gegenprobe archivieren
 *   hinweis   Seite da, nennt aber Auslauf/Abverkauf
 *   verdacht  Seite da, unsere Kennung (Artikel-/Farbnummer) steht nicht drauf
 *   fehler    Netz, Zeitueberschreitung, unerwarteter Status - sagt nichts ueber den Artikel
 */
export function bewerteSeite(lieferant, { code, body = '', kennung = null } = {}) {
  if (!code) return { ergebnis: 'fehler', grund: 'keine Antwort' };
  if ((FEHLT_CODES[lieferant] || [404, 410]).includes(code)) return { ergebnis: 'fehlt', grund: `HTTP ${code}` };
  if (code !== 200) return { ergebnis: 'fehler', grund: `HTTP ${code}` };
  const text = seitenText(body);
  const m = text.match(new RegExp(`.{0,60}${AUSLAUF_HINWEIS.source}.{0,60}`, 'i'));
  if (m) return { ergebnis: 'hinweis', grund: m[0].trim() };
  if (kennung && !String(body).toLowerCase().includes(String(kennung).toLowerCase())) {
    return { ergebnis: 'verdacht', grund: `Kennung ${kennung} steht nicht auf der Seite` };
  }
  return { ergebnis: 'ok' };
}

/** Schnellsuche von A: exakter Treffer der Artikelnummer auf irgendeiner Seite. */
export function bewerteSuche({ gefunden, fehler } = {}) {
  if (fehler) return { ergebnis: 'fehler', grund: fehler };
  return gefunden ? { ergebnis: 'ok' } : { ergebnis: 'fehlt', grund: 'Schnellsuche findet die Artikelnummer nicht' };
}

/**
 * Ergebnisse eines Lieferanten zusammenfassen. Ab AUSFALL_GRENZE Fehler oder
 * Fehlmeldungen gilt der Lauf fuer diesen Lieferanten als gestoert: dann wird
 * nichts als Befund gemeldet, sondern der Ausfall.
 */
export function zusammenfassen(lieferant, eintraege = [], { grenze = AUSFALL_GRENZE } = {}) {
  const zahl = art => eintraege.filter(e => e.ergebnis === art).length;
  const geprueft = eintraege.length;
  const fehler = zahl('fehler');
  const fehlt = zahl('fehlt');
  const anteil = n => (geprueft ? n / geprueft : 0);
  const ausfall = geprueft === 0
    ? 'nichts geprueft'
    : anteil(fehler) > grenze ? `${fehler} von ${geprueft} Abrufen gescheitert`
    : anteil(fehlt) > grenze ? `${fehlt} von ${geprueft} angeblich weg - eher eine Umstellung beim Lieferanten`
    : null;
  const befunde = ausfall ? [] : eintraege
    .filter(e => ['fehlt', 'hinweis', 'verdacht'].includes(e.ergebnis))
    .map(e => ({ lieferant, ergebnis: e.ergebnis, kennung: e.kennung ?? null, url: e.url ?? null, handles: e.handles || [], grund: e.grund || null }));
  return { lieferant, geprueft, ok: zahl('ok'), fehlt, hinweis: zahl('hinweis'), verdacht: zahl('verdacht'), fehler, ausfall, befunde };
}

/** Gesamtstand fuer status.json und das Control Center. */
export function gesamtStand(teile = [], { ohneOnline = {}, geprueftAm, dauerSek = null } = {}) {
  const lieferanten = Object.fromEntries(teile.map(t => [t.lieferant, { ...t, befunde: undefined }]));
  const befunde = teile.flatMap(t => t.befunde);
  const ausfaelle = teile.filter(t => t.ausfall).map(t => ({ lieferant: t.lieferant, grund: t.ausfall }));
  const ampel = befunde.some(b => b.ergebnis === 'fehlt') ? 'rot' : befunde.length || ausfaelle.length ? 'gelb' : 'gruen';
  return { geprueftAm, dauerSek, ampel, lieferanten, ohneOnline, ausfaelle, befunde };
}

/*
 * Neuheiten (zweite Haelfte der Inhaberregel: "danach nach neuen Produkten schauen").
 * Artikelnummern von A haben die Form <Stamm><Breite?>_<Farbe>, z. B. CVANDANTE3_A80:
 * Stamm CVANDANTE, Breite 3, Farbe A80. Die Schnellsuche nach dem Stamm liefert alle
 * Breiten und Farben dieser Linie - was davon nicht im Shop steht, ist ein Kandidat.
 */

/** Stamm einer Artikelnummer von A, oder null ohne Farbteil (Zubehoer, Sammelnummern). */
export function artikelStamm(nr) {
  const m = String(nr || '').match(/^([^_]+)_./);
  if (!m) return null;
  // Nur eine einzelne Ziffer hinter Buchstaben ist die Breite (CVTEST3 = 300 cm);
  // mehrstellige Ziffern sind Teil der Produktnummer (PAR5895, HOME30C).
  return m[1].replace(/(\D)\d$/, '$1') || null;
}

/** Gehoert die Nummer zu diesem Stamm? Hoechstens eine Breitenziffer darf dazwischen stehen. */
export function gehoertZuStamm(nr, stamm) {
  const s = stamm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${s}\\d?_.`).test(String(nr || ''));
}

/**
 * Staemme der aktiven A-Artikel und alle uns bekannten Nummern (auch archivierte:
 * die sind bewusst weg und keine Neuheit).
 */
export function neuheitenZiele(produkte = []) {
  const staemme = new Set();
  const bekannt = new Set();
  for (const p of produkte) {
    for (const v of p.varianten || []) {
      const e = v.einkauf || {};
      if (e.lieferant !== 'A' || !e.artikelnummer) continue;
      bekannt.add(e.artikelnummer);
      if (p.status === 'ARCHIVED') continue;
      const s = artikelStamm(e.artikelnummer);
      if (s) staemme.add(s);
    }
  }
  return { staemme: [...staemme].sort(), bekannt };
}

/** Treffer der Schnellsuche zu einem Stamm -> Artikel, die wir nicht fuehren. */
export function neueArtikel(stamm, treffer = [], bekannt = new Set()) {
  const gesehen = new Set();
  const neu = [];
  for (const t of treffer) {
    const nr = t.material_number;
    if (!gehoertZuStamm(nr, stamm) || bekannt.has(nr) || gesehen.has(nr)) continue;
    gesehen.add(nr);
    neu.push({ stamm, nr, name: String(t.name || '').replace(/\s+/g, ' ').trim() });
  }
  return neu;
}

/**
 * Nur melden, was seit dem letzten Lauf dazugekommen ist: Artikel, die wir bewusst
 * nicht fuehren (andere Breite, Auslauflinie), stuenden sonst jede Woche wieder da.
 * Ohne Vorlauf ist alles Grundbestand und nichts "neu".
 */
export function neuSeitVorlauf(kandidaten = [], vorlauf = null) {
  if (!Array.isArray(vorlauf)) return [];
  const alt = new Set(vorlauf.map(k => k.nr));
  return kandidaten.filter(k => !alt.has(k.nr));
}
