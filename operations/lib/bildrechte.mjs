// Bildrechte-Verzeichnis: eine Zeile je Produktbild (Shopify MediaImage).
// Konzept: docs/weiterentwicklung/bilder.md. Das Verzeichnis liegt nur lokal
// ($TP_PRIVAT_DIR/bildrechte/bildrechte.csv), weil Quellen und Lizenzen
// Lieferantennamen enthalten koennen - nie im Repository.
//
// Grundregel: Rechte werden nie angenommen. Ein Bild, ueber das noch niemand
// entschieden hat, steht auf "ungeklaert". Der Dateiname liefert hoechstens
// einen Hinweis auf die Herkunft ("quelle_vermutet"), nie einen Rechte-Status.
// Von Hand gepflegte Spalten bleiben beim naechsten Abruf erhalten.

export const SPALTEN = Object.freeze([
  'media_id', 'produkt_handle', 'produkt_titel', 'produkttyp', 'position', 'datei', 'breite', 'hoehe',
  'alt', 'bildtyp', 'quelle_vermutet',
  // ab hier von Hand gepflegt - der Abruf ueberschreibt sie nie
  'quelle', 'urheber', 'lizenz', 'beleg', 'bearbeitet', 'quellenangabe_pflicht', 'status', 'geprueft_von', 'geprueft_am', 'notiz',
]);

export const HANDSPALTEN = Object.freeze(['quelle', 'urheber', 'lizenz', 'beleg', 'bearbeitet', 'quellenangabe_pflicht', 'status', 'geprueft_von', 'geprueft_am', 'notiz']);
// Gepflegte Werte (Stand 14.10.): freigegeben = Inhaberfreigabe je Quelle,
// nein = nicht nutzen, entfernt / "entfernt (...)" = Bild vom Produkt geloest.
// Ein Wert, den diese Liste nicht kennt, wuerde beim naechsten Abruf auf
// ungeklaert zurueckgesetzt - neue Werte deshalb hier eintragen.
export const STATUS = Object.freeze(['ungeklaert', 'geprueft', 'freigegeben', 'gesperrt', 'nein', 'entfernt']);

/** Bekannter Status? "entfernt (Dublette)" u. Ae. zaehlen als entfernt. */
export function statusGueltig(s) {
  const wert = String(s ?? '').trim();
  return STATUS.includes(wert) || /^entfernt\b/i.test(wert);
}
export const BILDTYPEN = Object.freeze(['produkt', 'detail', 'struktur', 'raum', 'raumki', 'hersteller', 'herstellerbearb', 'marketing', 'rest']);
export const MINDESTBREITE = 1200;

/** Dateiname ohne Pfad, Query und die von Shopify angehaengte UUID. */
export function dateiname(url) {
  const roh = decodeURIComponent(String(url ?? '').split('?')[0].split('/').pop() ?? '');
  return roh.replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\.[a-z0-9]+$)/i, '');
}

/**
 * Bildtyp aus dem Namensschema <produkt>_<farbe>_<bildtyp>_<nn>.<endung>
 * (docs/weiterentwicklung/bilder.md) oder aus bekannten Altmustern.
 * Liefert '' wenn nichts belegt ist - geraten wird nicht.
 */
export function bildtypAusName(name) {
  const n = String(name ?? '').toLowerCase();
  const teile = n.replace(/\.[a-z0-9]+$/, '').split('_');
  if (teile.length >= 3) {
    const kandidat = teile.find((t) => BILDTYPEN.includes(t));
    if (kandidat) return kandidat;
  }
  if (/raumansicht|raumbild|[-_]raum[-_.]/.test(n)) return 'raum';
  if (/[-_]kante[-_.]|[-_]detail[-_.]/.test(n)) return 'detail';
  if (/[-_]struktur[-_.]/.test(n)) return 'struktur';
  return '';
}

/** Hinweis auf die Herkunft nur aus belegten Namensmustern; sonst leer. */
export function quelleVermutet(name) {
  const n = String(name ?? '').toLowerCase();
  if (/^products_\d+\./.test(n)) return 'Export Lieferant (Dateiname products_<nr>)';
  if (/raumansicht/.test(n)) return 'Raumbild-Import Lieferant (Dateiname *-raumansicht)';
  if (/[-_](ki|seedream)[-_.]|beispieldarstellung/.test(n)) return 'KI-generiert (Dateiname)';
  return '';
}

/** Haelt der Dateiname das Schema produkt_farbe_bildtyp_nn ein? */
export function nameNachSchema(name) {
  return /^[a-z0-9-]+_[a-z0-9-]+_[a-z]+(_sp-\d{4})?_\d{2}\.(jpe?g|png|webp|avif)$/.test(String(name ?? ''));
}

/** Eine Zeile aus einem Produkt und einem MediaImage-Knoten der Admin API. */
export function zeileAusMedium(produkt, medium, position) {
  const name = dateiname(medium?.image?.url);
  return {
    media_id: medium?.id ?? '',
    produkt_handle: produkt?.handle ?? '',
    produkt_titel: produkt?.title ?? '',
    produkttyp: produkt?.productType ?? '',
    position: String(position),
    datei: name,
    breite: String(medium?.image?.width ?? ''),
    hoehe: String(medium?.image?.height ?? ''),
    alt: medium?.alt ?? '',
    bildtyp: bildtypAusName(name),
    quelle_vermutet: quelleVermutet(name),
    quelle: '', urheber: '', lizenz: '', beleg: '', bearbeitet: '', quellenangabe_pflicht: '',
    status: 'ungeklaert', geprueft_von: '', geprueft_am: '', notiz: '',
  };
}

/** Alle Bildzeilen aus Produktknoten ({handle,title,productType,media:{nodes}}). */
export function zeilenAusProdukten(produkte) {
  const zeilen = [];
  for (const p of produkte ?? []) {
    let pos = 0;
    for (const m of p?.media?.nodes ?? []) {
      if (!m?.image) continue; // Videos, 3D-Modelle: nicht Teil des Bildverzeichnisses
      pos += 1;
      zeilen.push(zeileAusMedium(p, m, pos));
    }
  }
  return zeilen;
}

/**
 * Fuehrt den frischen Abruf mit dem vorhandenen Verzeichnis zusammen.
 * Schluessel ist die Shopify-Media-ID. Handspalten kommen aus dem alten Stand;
 * ein ungueltiger Status wird zu "ungeklaert" (lieber einmal zu oft pruefen).
 * Bilder, die es in Shopify nicht mehr gibt, bleiben mit Notiz erhalten,
 * damit eine dokumentierte Lizenz nicht still verschwindet.
 */
export function zusammenfuehren(alt, neu) {
  const bisher = new Map((alt ?? []).filter((z) => z.media_id).map((z) => [z.media_id, z]));
  const ergebnis = [];
  const gesehen = new Set();
  for (const z of neu ?? []) {
    const vorher = bisher.get(z.media_id);
    const zeile = { ...z };
    if (vorher) {
      for (const s of HANDSPALTEN) zeile[s] = vorher[s] ?? '';
      if (vorher.bildtyp && !z.bildtyp) zeile.bildtyp = vorher.bildtyp;
    }
    if (!statusGueltig(zeile.status)) zeile.status = 'ungeklaert';
    gesehen.add(z.media_id);
    ergebnis.push(zeile);
  }
  for (const [id, z] of bisher) {
    if (gesehen.has(id)) continue;
    const notiz = z.notiz?.includes('nicht mehr in Shopify') ? z.notiz : [z.notiz, 'nicht mehr in Shopify'].filter(Boolean).join('; ');
    ergebnis.push({ ...z, notiz });
  }
  return ergebnis;
}

/** Pruefliste fuer Mensch und Dashboard - zaehlt nur, was vom Soll abweicht. */
export function auswerten(zeilen) {
  const aktiv = (zeilen ?? []).filter((z) => !istEntfernt(z));
  const zahl = (f) => aktiv.filter(f).length;
  return {
    bilder: aktiv.length,
    produkte: new Set(aktiv.map((z) => z.produkt_handle)).size,
    ungeklaert: zahl((z) => PRUEFUNG.ungeklaert(z)),
    gesperrt: zahl((z) => z.status === 'gesperrt' || z.status === 'nein'),
    zuKlein: zahl((z) => Number(z.breite) > 0 && Number(z.breite) < MINDESTBREITE),
    ohneAlt: zahl((z) => !String(z.alt ?? '').trim()),
    ohneBildtyp: zahl((z) => !z.bildtyp),
    nameNichtNachSchema: zahl((z) => !nameNachSchema(z.datei)),
    nichtMehrInShopify: (zeilen ?? []).filter((z) => String(z.notiz ?? '').includes('nicht mehr in Shopify')).length,
    entfernt: (zeilen ?? []).filter((z) => /^entfernt/i.test(String(z.status ?? '').trim())).length,
  };
}

// --- Pruefliste fuer das Control Center (Ansicht "Bildrechte", nur lesend) ---
//
// Ungeklaert ist nur, was ausdruecklich so markiert ist oder gar keinen Status
// hat - jede andere Eintragung ist eine dokumentierte Entscheidung (gilt auch
// fuer auswerten()).

export const PRUEFLISTEN = Object.freeze(['ungeklaert', 'zu-klein', 'ohne-alt']);
export const OHNE_WARENGRUPPE = 'ohne Warengruppe';

/** Vom Produkt geloest oder nicht mehr in Shopify: gehoert in keine Arbeitsliste. */
export function istEntfernt(z) {
  return /^entfernt/i.test(String(z?.status ?? '').trim()) || String(z?.notiz ?? '').includes('nicht mehr in Shopify');
}

const PRUEFUNG = {
  ungeklaert: (z) => { const s = String(z.status ?? '').trim(); return s === '' || s === 'ungeklaert'; },
  'zu-klein': (z) => Number(z.breite) > 0 && Number(z.breite) < MINDESTBREITE,
  'ohne-alt': (z) => !String(z.alt ?? '').trim(),
};

/**
 * Zaehler aller drei Listen, Warengruppen der gewaehlten Liste und eine Seite
 * daraus. Sortiert nach Warengruppe, Produkt und Bildposition, damit die Bilder
 * eines Produkts beieinander stehen.
 */
export function prueflisten(zeilen, { liste = 'ungeklaert', gruppe = '', page = 1, pageSize = 25 } = {}) {
  const aktiv = (zeilen ?? []).filter((z) => !istEntfernt(z));
  const name = PRUEFLISTEN.includes(liste) ? liste : 'ungeklaert';
  const zaehler = Object.fromEntries(PRUEFLISTEN.map((l) => [l, aktiv.filter(PRUEFUNG[l]).length]));
  const warengruppe = (z) => String(z.produkttyp ?? '').trim() || OHNE_WARENGRUPPE;
  const treffer = aktiv.filter(PRUEFUNG[name]);
  const jeGruppe = new Map();
  for (const z of treffer) jeGruppe.set(warengruppe(z), (jeGruppe.get(warengruppe(z)) ?? 0) + 1);
  const gruppen = [...jeGruppe].map(([g, anzahl]) => ({ gruppe: g, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl || a.gruppe.localeCompare(b.gruppe, 'de'));
  const gewaehlt = gruppe && jeGruppe.has(gruppe) ? gruppe : '';
  const auswahl = (gewaehlt ? treffer.filter((z) => warengruppe(z) === gewaehlt) : treffer)
    .sort((a, b) => warengruppe(a).localeCompare(warengruppe(b), 'de')
      || String(a.produkt_titel ?? '').localeCompare(String(b.produkt_titel ?? ''), 'de')
      || Number(a.position) - Number(b.position));
  const size = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const pages = Math.max(Math.ceil(auswahl.length / size), 1);
  const p = Math.min(Math.max(Math.trunc(Number(page)) || 1, 1), pages);
  return {
    liste: name,
    zaehler,
    // Ohne erfasste Breite kann "zu klein" nichts sagen - die Zahl erklaert die Luecke.
    breiteUnbekannt: aktiv.filter((z) => !(Number(z.breite) > 0)).length,
    gruppen,
    gruppe: gewaehlt,
    count: auswahl.length,
    page: p,
    pageSize: size,
    pages,
    items: auswahl.slice((p - 1) * size, p * size).map((z) => ({
      titel: z.produkt_titel || z.produkt_handle || '(ohne Titel)',
      handle: z.produkt_handle || '',
      gruppe: warengruppe(z),
      position: Number(z.position) || null,
      datei: z.datei || '',
      breite: Number(z.breite) || null,
      hoehe: Number(z.hoehe) || null,
      hinweis: z.quelle_vermutet || '',
    })),
  };
}

// --- CSV (Semikolon, wie es Excel/Numbers auf deutschen Rechnern oeffnet) ---

function feld(wert) {
  const s = String(wert ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function alsCsv(zeilen) {
  return [SPALTEN.join(';'), ...(zeilen ?? []).map((z) => SPALTEN.map((s) => feld(z[s])).join(';'))].join('\n') + '\n';
}

export function ausCsv(text) {
  const zeilen = [];
  let feldText = '';
  let reihe = [];
  let inAnf = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inAnf) {
      if (c === '"' && s[i + 1] === '"') { feldText += '"'; i += 1; } else if (c === '"') inAnf = false; else feldText += c;
    } else if (c === '"') inAnf = true;
    else if (c === ';') { reihe.push(feldText); feldText = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      reihe.push(feldText); feldText = '';
      if (reihe.some((x) => x !== '')) zeilen.push(reihe);
      reihe = [];
    } else feldText += c;
  }
  if (feldText !== '' || reihe.length) { reihe.push(feldText); if (reihe.some((x) => x !== '')) zeilen.push(reihe); }
  if (!zeilen.length) return [];
  const kopf = zeilen[0];
  return zeilen.slice(1).map((r) => Object.fromEntries(kopf.map((k, i) => [k, r[i] ?? ''])));
}
