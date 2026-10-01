/**
 * To-dos und "Wer wartet auf was" fuer die Startseite "Heute".
 *
 * Nichts wird hier erfasst oder gespeichert: jedes To-do ist aus Daten abgeleitet, die es
 * schon gibt (Bestellungen samt Auftragsfluss, Rueckrufe, Angebote, Team-Aufgaben,
 * Freigaben, Shop-Wache). Verschwindet die Ursache, verschwindet das To-do.
 *
 * Reine Funktionen ohne DOM und ohne Netz - die Eingaben sind die Antworten der
 * vorhandenen /api-Endpunkte, so wie sie der Browser bekommt. Zustaendigkeit und Rechte
 * rechnet weiterhin der Server (operations/lib/organisation.mjs): jede Team-Aufgabe kommt
 * mit `technisch`, `darfAendern` und `dringlichkeit` an; hier wird das nur ausgewertet.
 */

const TAG_MS = 86400000;
const UNGEKLAERT = 'UNGEKLAERT';
const BEZAHLT = ['PAID', 'PARTIALLY_REFUNDED'];

/** Wartezeit beim Lieferanten: ab 7 Tagen nachhaken, ab 14 Tagen ist es ein Problem
 * (operations/lib/lieferanten.mjs fuehrt dieselben Werte; /api/einkauf/lieferanten liefert sie mit). */
export const SCHWELLEN = Object.freeze({ nachhakenTage: 7, problemTage: 14 });

/** Ab wann ein To-do gelb bzw. rot wird, je Art. Ein Rueckrufwunsch altert schneller als eine Lieferung. */
export const FRISTEN = Object.freeze({
  bestellen: [3, 7],     // bezahlt, aber noch nicht beim Lieferanten bestellt
  rueckruf: [2, 7],      // Kunde wartet auf einen Anruf
  rausgeben: [7, 14],    // Ware liegt bei uns
  angebot: [7, 14],      // Angebot ohne Antwort
});

export const SICHTEN = Object.freeze(['inhaber', 'laden', 'website']);
export const SICHT_LABEL = Object.freeze({ inhaber: 'Inhaber', laden: 'Laden', website: 'Website' });

const TON_RANG = { crit: 0, warn: 1, '': 2 };

export function tageSeit(iso, jetzt = new Date()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const tage = Math.floor((jetzt.getTime() - t) / TAG_MS);
  return tage >= 0 ? tage : 0;
}

/** '' (normal), 'warn' (gelb) oder 'crit' (rot) nach Alter in Tagen. */
export function tonNachAlter(tage, warnAb = SCHWELLEN.nachhakenTage, critAb = SCHWELLEN.problemTage) {
  if (tage === null || tage === undefined) return '';
  if (tage >= critAb) return 'crit';
  if (tage >= warnAb) return 'warn';
  return '';
}

/** "heute", "1 Tag", "5 Tage" - fuer die Alters-Marke. */
export function alterText(tage) {
  if (tage === null || tage === undefined) return '';
  return tage === 0 ? 'heute' : tage === 1 ? '1 Tag' : `${tage} Tage`;
}

const seitText = tage => (tage === 0 ? 'seit heute' : tage === 1 ? 'seit 1 Tag' : `seit ${tage} Tagen`);
const vorText = tage => (tage === 0 ? 'heute' : tage === 1 ? 'gestern' : `vor ${tage} Tagen`);
const mehrzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;
const gleichePerson = (a, b) => Boolean(a && b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** Tagesdatum JJJJ-MM-TT in lokaler Zeit - Wiedervorlagen und Fristen sind Kalendertage. */
function alsTag(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Rot vor Gelb vor normal, darin das Aelteste zuerst. Stabil: Gleiches bleibt in Eingangsreihenfolge. */
export function sortiereTodos(todos) {
  return todos
    .map((t, i) => [t, i])
    .sort(([a, ai], [b, bi]) => (TON_RANG[a.ton] ?? 2) - (TON_RANG[b.ton] ?? 2)
      || (b.alterTage ?? -1) - (a.alterTage ?? -1)
      || ai - bi)
    .map(([t]) => t);
}

// ---------------------------------------------------------------- Bestellungen

function standVon(statusAlle, orderId, lineItemId) {
  return statusAlle?.[`${orderId}::${lineItemId}`] || null;
}

/** Noch nicht abgeschlossene, nachverfolgbare Positionen einer Bestellung samt Auftragsfluss-Stand. */
function offenePositionen(auftrag, statusAlle) {
  return (auftrag?.positionen || [])
    .filter(p => p.lineItemId && (p.menge ?? 1) > 0)
    .map(p => ({ p, eintrag: standVon(statusAlle, auftrag.id, p.lineItemId) }))
    .filter(x => x.eintrag?.status !== 'erledigt');
}

/** Echte, laufende Bestellungen: nicht Test, nicht storniert, in Shopify noch offen, mit offener Position. */
function laufendeBestellungen(bestellzeilen, statusAlle) {
  return (bestellzeilen || [])
    .filter(z => z?.auftrag && !z.testbestellung && !z.storniert && z.offen)
    .map(z => ({ z, a: z.auftrag, offen: offenePositionen(z.auftrag, statusAlle) }))
    .filter(x => x.offen.length);
}

const kundeVon = z => z.kundenname || z.orderName || 'Kunde';
const istBezahlt = z => BEZAHLT.includes(String(z.zahlungsstatus));
const artWort = positionen => (positionen.every(x => x.p.istMuster) ? 'Muster' : 'Ware');

function rueckrufFaellig(r, heute) {
  if (!r || r.testbestellung || r.status === 'erledigt') return false;
  if (r.status === 'angerufen') return Boolean(r.wiedervorlage && r.wiedervorlage <= heute);
  return !r.wiedervorlage || r.wiedervorlage <= heute;
}

/** Einkauf mit aufgeklappter Karte des Lieferanten (#/einkauf?lf=…); ohne Zuordnung die ganze Liste. */
function einkaufLink(lieferant) {
  return lieferant && lieferant !== UNGEKLAERT ? `#/einkauf?lf=${encodeURIComponent(lieferant)}` : '#/einkauf';
}

function kundenLink(z) {
  return z.kundenSchluessel ? `#/kunden?kunde=${encodeURIComponent(z.kundenSchluessel)}` : '#/kunden?tab=bestellungen';
}

/**
 * Wo steht eine laufende Bestellung - und wer ist dran? Der schwaechste Schritt aller
 * offenen Positionen bestimmt die Lage (wie fortschritt() in operations/lib/bestellliste.mjs).
 */
function lageVon({ z, a, offen }, { statusAlle, rueckrufJeOrder, heute, jetzt, schwellen }) {
  const seitBestellung = tageSeit(z.datum, jetzt);
  if (a.ampel === 'rot') return { spalte: 'wir', art: 'blockiert', schritt: 'Zuerst klären', alterTage: seitBestellung };
  if (rueckrufFaellig(rueckrufJeOrder.get(z.orderId), heute)) return { spalte: 'wir', art: 'rueckruf', schritt: 'Zurückrufen', alterTage: seitBestellung };
  if (!istBezahlt(z)) return { spalte: 'kunde', art: 'zahlung', schritt: 'Zahlung offen', alterTage: seitBestellung };
  const mit = status => offen.filter(x => (x.eintrag?.status || null) === status);
  const unbestellt = mit(null);
  if (unbestellt.length) return { spalte: 'wir', art: 'bestellen', schritt: `${artWort(unbestellt)} bestellen`, alterTage: seitBestellung, positionen: unbestellt };
  const maxTage = (liste, feld) => liste.reduce((m, x) => Math.max(m, tageSeit(x.eintrag?.[feld], jetzt) ?? 0), 0);
  const bestellt = mit('bestellt');
  if (bestellt.length) {
    const tage = maxTage(bestellt, 'bestelltAm');
    return tage >= schwellen.nachhakenTage
      ? { spalte: 'wir', art: 'nachhaken', schritt: 'Nachhaken', alterTage: tage, positionen: bestellt }
      : { spalte: 'lieferant', art: 'bestellt', schritt: `${artWort(bestellt)} bestellt`, alterTage: tage, positionen: bestellt };
  }
  const geliefert = mit('geliefert');
  if (geliefert.length) return { spalte: 'wir', art: 'rausgeben', schritt: 'An Kunden rausgeben', alterTage: maxTage(geliefert, 'geliefertAm'), positionen: geliefert };
  const raus = mit('raus');
  return { spalte: 'kunde', art: 'raus', schritt: `${artWort(raus)} beim Kunden`, alterTage: maxTage(raus, 'rausAm'), positionen: raus };
}

function kontext(quellen, opt) {
  const jetzt = opt.jetzt || new Date();
  const statusAlle = quellen.statusAlle || {};
  const schwellen = { ...SCHWELLEN, ...(quellen.schwellen || {}) };
  const rueckrufJeOrder = new Map((quellen.rueckrufe || []).map(r => [r.orderId, r]));
  const lieferantName = opt.lieferantName || (id => (id === UNGEKLAERT || !id ? 'Lieferant nicht zugeordnet' : `Lieferant ${id}`));
  const klartext = opt.klartext || (h => h);
  return { jetzt, heute: alsTag(jetzt), statusAlle, schwellen, rueckrufJeOrder, lieferantName, klartext };
}

/**
 * "Wer wartet auf was": jede laufende Bestellung genau einmal, in der Spalte dessen, der
 * als Naechstes etwas tun muss. Dazu offene Angebote - dort ist der Kunde dran.
 *
 * @returns {{wir: object[], lieferant: object[], kunde: object[], gesamt: number}}
 */
export function werWartet(quellen = {}, opt = {}) {
  const k = kontext(quellen, opt);
  const spalten = { wir: [], lieferant: [], kunde: [] };
  for (const b of laufendeBestellungen(quellen.bestellzeilen, k.statusAlle)) {
    const lage = lageVon(b, k);
    const lieferanten = [...new Set((lage.positionen || []).map(x => x.p.lieferant).filter(Boolean))];
    spalten[lage.spalte].push({
      id: `auftrag:${b.z.orderId}`,
      name: kundeVon(b.z),
      schritt: lage.schritt,
      zusatz: lieferanten.length === 1 ? k.lieferantName(lieferanten[0]) : b.z.orderName,
      alterTage: lage.alterTage,
      ton: tonNachAlter(lage.alterTage, k.schwellen.nachhakenTage, k.schwellen.problemTage),
      href: kundenLink(b.z),
    });
  }
  for (const f of quellen.faelle || []) {
    for (const p of (f.punkte || []).filter(x => x.quelle === 'angebot')) {
      spalten.kunde.push({
        id: `angebot:${f.schluessel}:${p.bezug ?? ''}`,
        name: f.name || 'Kunde',
        schritt: 'Angebot offen',
        zusatz: p.bezug || 'Angebot',
        alterTage: p.tage ?? null,
        ton: tonNachAlter(p.tage, k.schwellen.nachhakenTage, k.schwellen.problemTage),
        href: '#/kunden?tab=angebote',
      });
    }
  }
  for (const liste of Object.values(spalten)) liste.sort((a, b) => (b.alterTage ?? -1) - (a.alterTage ?? -1));
  return { ...spalten, gesamt: spalten.wir.length + spalten.lieferant.length + spalten.kunde.length };
}

// ---------------------------------------------------------------- To-dos

function ausBestellungen(quellen, k) {
  const todos = [];
  const bestellen = new Map();   // lieferant|art -> Positionen, noch nicht beim Lieferanten bestellt
  const nachhaken = new Map();   // lieferant -> Positionen, zu lange bestellt
  const sammle = (map, key, wert) => { if (!map.has(key)) map.set(key, []); map.get(key).push(wert); };

  for (const b of laufendeBestellungen(quellen.bestellzeilen, k.statusAlle)) {
    const { z, a, offen } = b;
    const seitBestellung = tageSeit(z.datum, k.jetzt);
    if (a.ampel === 'rot') {
      // Blockiert ("Zuerst klären"): solange etwas fehlt, kann niemand bestellen - darum
      // erscheinen die Positionen dieser Bestellung nicht zusaetzlich unter "bestellen".
      todos.push({
        id: `blockiert:${z.orderId}`, art: 'blockiert', bereich: 'laden', ton: 'crit', alterTage: seitBestellung,
        titel: `Zuerst klären: ${z.orderName}`,
        kontext: [kundeVon(z), ...(a.hinweise || []).slice(0, 2).map(k.klartext)].join(' · '),
        knopf: { text: 'Klären', href: '#/einkauf' },
      });
      continue;
    }
    const rueckruf = k.rueckrufJeOrder.get(z.orderId);
    if (rueckrufFaellig(rueckruf, k.heute)) {
      todos.push({
        id: `rueckruf:${z.orderId}`, art: 'rueckruf', bereich: 'laden',
        ton: tonNachAlter(seitBestellung, ...FRISTEN.rueckruf), alterTage: seitBestellung,
        titel: `Zurückrufen: ${rueckruf.kundenname && rueckruf.kundenname !== '–' ? rueckruf.kundenname : kundeVon(z)}`,
        kontext: [rueckruf.thema, z.orderName, rueckruf.wunschzeit ? `Wunschzeit ${rueckruf.wunschzeit}` : null,
          rueckruf.status === 'nicht_erreicht' ? 'zuletzt nicht erreicht' : null,
          rueckruf.telefon ? null : 'keine Telefonnummer'].filter(Boolean).join(' · '),
        knopf: { text: 'Zurückrufen', href: '#/kunden?tab=rueckrufe' },
      });
      // Erst anrufen, dann bestellen ("Beratung gewünscht - vor Einkauf anrufen"): solange der
      // Rueckruf faellig ist, erscheint die Bestellung nicht zusaetzlich unter "bestellen".
      continue;
    }
    if (!istBezahlt(z)) continue;   // unbezahlt: der Kunde ist dran, nichts zu bestellen
    for (const x of offen) {
      const status = x.eintrag?.status || null;
      const pos = { ...x, z, seitBestellung };
      if (!status) sammle(bestellen, `${x.p.lieferant ?? UNGEKLAERT}|${x.p.istMuster ? 'muster' : 'ware'}`, pos);
      else if (status === 'bestellt') {
        const tage = tageSeit(x.eintrag.bestelltAm, k.jetzt);
        if (tage !== null && tage >= k.schwellen.nachhakenTage) sammle(nachhaken, x.p.lieferant ?? UNGEKLAERT, { ...pos, tage });
      } else if (status === 'geliefert') {
        const tage = tageSeit(x.eintrag.geliefertAm, k.jetzt);
        const id = `rausgeben:${z.orderId}`;
        const vorhanden = todos.find(t => t.id === id);
        if (vorhanden) { vorhanden.alterTage = Math.max(vorhanden.alterTage ?? 0, tage ?? 0); vorhanden.ton = tonNachAlter(vorhanden.alterTage, ...FRISTEN.rausgeben); continue; }
        todos.push({
          id, art: 'rausgeben', bereich: 'laden', ton: tonNachAlter(tage, ...FRISTEN.rausgeben), alterTage: tage,
          titel: `${x.p.istMuster ? 'Muster' : 'Ware'} ist da – an ${kundeVon(z)} rausgeben`,
          kontext: [z.orderName, x.p.titel, tage !== null ? `liegt ${seitText(tage)} bei uns` : null].filter(Boolean).join(' · '),
          knopf: { text: 'Rausgeben', href: '#/einkauf?af=unterwegs' },
        });
      }
    }
  }

  const kundenKurz = positionen => {
    const namen = [...new Set(positionen.map(x => kundeVon(x.z)))];
    return namen.length > 2 ? `${namen.slice(0, 2).join(', ')} +${namen.length - 2}` : namen.join(', ');
  };
  const wasKurz = positionen => (positionen.length === 1
    ? [positionen[0].p.kundenmenge, positionen[0].p.titel].filter(Boolean).join(' ')
    : mehrzahl(positionen.length, 'Position', 'Positionen'));

  for (const [key, positionen] of bestellen) {
    const [lieferant, art] = key.split('|');
    const tage = Math.max(...positionen.map(x => x.seitBestellung ?? 0));
    todos.push({
      id: `bestellen:${key}`, art: 'bestellen', bereich: 'laden', ton: tonNachAlter(tage, ...FRISTEN.bestellen), alterTage: tage,
      titel: `${art === 'muster' ? 'Muster' : 'Ware'} bei ${k.lieferantName(lieferant)} bestellen`,
      kontext: [kundenKurz(positionen), wasKurz(positionen), `bezahlt, Bestellung ${vorText(tage)}`].join(' · '),
      knopf: { text: 'Bestellen', href: einkaufLink(lieferant) },
    });
  }
  for (const [lieferant, positionen] of nachhaken) {
    const tage = Math.max(...positionen.map(x => x.tage));
    todos.push({
      id: `nachhaken:${lieferant}`, art: 'nachhaken', bereich: 'laden',
      ton: tage >= k.schwellen.problemTage ? 'crit' : 'warn', alterTage: tage,
      titel: `${artWort(positionen)} ${seitText(tage)} bestellt – noch nicht da`,
      kontext: [k.lieferantName(lieferant), kundenKurz(positionen), wasKurz(positionen)].join(' · '),
      knopf: { text: 'Nachhaken', href: einkaufLink(lieferant) },
    });
  }
  return todos;
}

/** Offene Faelle, die nicht schon an einer Bestellung haengen: Angebote, die seit einer Woche ohne Antwort sind. */
function ausFaellen(quellen) {
  const todos = [];
  for (const f of quellen.faelle || []) {
    const angebote = (f.punkte || []).filter(p => p.quelle === 'angebot' && (p.tage ?? 0) >= FRISTEN.angebot[0]);
    if (!angebote.length) continue;
    const tage = Math.max(...angebote.map(p => p.tage ?? 0));
    todos.push({
      id: `angebot:${f.schluessel}`, art: 'angebot', bereich: 'laden', ton: tonNachAlter(tage, ...FRISTEN.angebot), alterTage: tage,
      titel: `Angebot nachfassen: ${f.name || 'Kunde'}`,
      kontext: [angebote.map(p => p.bezug).filter(Boolean).join(', ') || 'Angebot', `${seitText(tage)} ohne Antwort`,
        f.telefon ? null : (f.email ? 'nur E-Mail hinterlegt' : 'kein Kontakt hinterlegt')].filter(Boolean).join(' · '),
      knopf: { text: 'Nachfassen', href: '#/kunden?tab=angebote' },
    });
  }
  return todos;
}

const AUFGABE_RUHT = ['DONE', 'WAITING', 'DEFERRED'];

/** Faellige und ueberfaellige Team-Aufgaben; `dringlichkeit` hat der Server schon berechnet. */
function ausAufgaben(quellen, { ich, jetzt }) {
  const todos = [];
  for (const e of quellen.aufgaben || []) {
    if (e.typ !== 'TASK' || AUFGABE_RUHT.includes(e.status)) continue;
    if (!['ueberfaellig', 'jetzt'].includes(e.dringlichkeit)) continue;
    const ueberfaellig = e.dringlichkeit === 'ueberfaellig';
    const tage = ueberfaellig && e.faellig ? tageSeit(`${e.faellig}T00:00:00`, jetzt) : 0;
    const meine = gleichePerson(e.verantwortlich, ich);
    // Ohne Namen: Technisches liegt bei dem, der Website und Shop macht; alles andere beim
    // Team - sofern der Server es zum Uebernehmen freigibt (darfAendern).
    const frei = !e.verantwortlich && (e.technisch || e.darfAendern !== false);
    todos.push({
      id: `aufgabe:${e.id}`, art: 'aufgabe', bereich: e.technisch ? 'website' : 'laden',
      ton: ueberfaellig ? 'crit' : 'warn', alterTage: tage,
      titel: e.titel || 'Aufgabe',
      kontext: [e.bereich, ueberfaellig ? `überfällig ${seitText(tage)}` : (e.prioritaet === 'URGENT' && e.faellig !== alsTag(jetzt) ? 'dringend' : 'heute fällig'),
        e.verantwortlich && !meine ? `bei ${e.verantwortlich}` : (!e.verantwortlich ? 'noch niemandem zugewiesen' : null)].filter(Boolean).join(' · '),
      knopf: { text: 'Öffnen', href: `#/organisation?oid=${encodeURIComponent(e.id)}` },
      fuerMich: meine || frei, meine,
    });
  }
  return todos;
}

/** Freigaben aus den Entwicklungsaufgaben (GitHub): wartet auf die Entscheidung des Inhabers. */
function ausFreigaben(quellen, jetzt) {
  return (quellen.freigaben || [])
    .filter(t => t.open !== false && (t.status === 'freigabe' || (t.status === 'review' && (!t.reviewer || t.reviewer === 'mensch'))))
    .map(t => {
      const tage = tageSeit(t.updatedAt, jetzt);
      return {
        id: `freigabe:${t.number}`, art: 'freigabe', bereich: 'buero', ton: t.overdue ? 'crit' : '', alterTage: tage,
        titel: `Freigabe: ${t.title}`,
        kontext: [t.status === 'review' ? 'Ergebnis prüfen' : 'wartet auf deine Entscheidung', tage !== null ? `wartet ${seitText(tage)}` : null].filter(Boolean).join(' · '),
        knopf: { text: 'Ansehen & freigeben', aufgabe: t.number },
      };
    });
}

/** Shop-Wache: nur wenn sie etwas meldet. */
function ausShopwache(quellen, jetzt) {
  const d = quellen.shopwache;
  if (!d || !d.verfuegbar || !['rot', 'gelb'].includes(d.ampel)) return [];
  const befunde = d.befunde || [];
  return [{
    id: 'shopwache', art: 'shopwache', bereich: 'website', ton: d.ampel === 'rot' ? 'crit' : 'warn', alterTage: tageSeit(d.geprueftAm, jetzt),
    titel: d.ampel === 'rot' ? 'Shop-Wache: der Shop hat ein Problem' : 'Shop-Wache meldet Auffälligkeiten',
    kontext: [befunde[0]?.titel, befunde.length > 1 ? `+${befunde.length - 1} weitere` : null].filter(Boolean).join(' · ') || 'Befund ansehen',
    knopf: { text: 'Prüfen', href: '#/shopwache' },
  }];
}

/** Alle ableitbaren To-dos, unsortiert und ohne Blick auf die Rolle. */
function alleTodos(quellen, opt) {
  const k = kontext(quellen, opt);
  return [
    ...ausBestellungen(quellen, k),
    ...ausFaellen(quellen),
    ...ausAufgaben(quellen, { ich: opt.ich, jetzt: k.jetzt }),
    ...ausFreigaben(quellen, k.jetzt),
    ...ausShopwache(quellen, k.jetzt),
  ];
}

function fuerSicht(todos, sicht, alle) {
  const meins = t => alle || t.fuerMich !== false;
  if (sicht === 'laden') return todos.filter(t => t.bereich === 'laden' && meins(t));
  if (sicht === 'website') return todos.filter(t => t.bereich === 'website' && meins(t));
  // Inhaber: Freigaben, alles Rote - egal bei wem es liegt - und die eigenen faelligen Aufgaben.
  return todos.filter(t => t.bereich === 'buero' || t.ton === 'crit' || t.meine);
}

/**
 * Die To-do-Liste fuer eine Sicht.
 *
 * @param {object} quellen
 *   bestellzeilen  /api/kunden/bestellungen   -> zeilen (je Bestellung, mit `auftrag`)
 *   statusAlle     /api/einkauf/auftragsstatus -> positionen ("orderId::lineItemId" -> Stand)
 *   schwellen      /api/einkauf/lieferanten    -> schwellen {nachhakenTage, problemTage}
 *   rueckrufe      /api/kunden/rueckrufe       -> zeilen
 *   faelle         /api/kunden/faelle          -> faelle
 *   aufgaben       /api/org/liste?bereich=alle-aufgaben -> eintraege
 *   freigaben      Entwicklungsaufgaben (issues.json), nur beim Inhaber gefuellt
 *   shopwache      /api/shopwache/status, nur beim Inhaber gefuellt
 * @param {object} opt
 *   sicht          'inhaber' | 'laden' | 'website'
 *   ich            Kuerzel des angemeldeten Benutzers
 *   alle           true: nicht auf die eigene Zustaendigkeit einschraenken (Inhaber schaut in Laden/Website)
 *   lieferantName  id -> Anzeigename (aus den Stammdaten), klartext: Hinweis -> lesbarer Satz
 */
export function leiteTodosAb(quellen = {}, opt = {}) {
  const sicht = SICHTEN.includes(opt.sicht) ? opt.sicht : 'inhaber';
  return sortiereTodos(fuerSicht(alleTodos(quellen, opt), sicht, Boolean(opt.alle)));
}

/** Zahlen fuer die Sprungfelder des Inhabers: was liegt im Laden, was bei der Website - bei wem auch immer. */
export function zaehleTodos(quellen = {}, opt = {}) {
  const todos = alleTodos(quellen, opt);
  return { laden: fuerSicht(todos, 'laden', true).length, website: fuerSicht(todos, 'website', true).length };
}

/**
 * Welche Startseite bekommt jemand? Es gibt dafuer keine eigene Rolle: der Inhaber (und der
 * Notzugang ohne Benutzerliste) sieht die Inhaber-Sicht. Ein Mitarbeiter gilt als "Website",
 * wenn die Mehrheit seiner offenen, ihm zugewiesenen Aufgaben in den technischen Bereichen
 * liegt (TECHNISCHE_BEREICHE, vom Server als `technisch` mitgegeben) - sonst als "Laden".
 */
export function sichtFuer(benutzer, aufgaben = []) {
  if (!benutzer || !benutzer.rolle || benutzer.rolle === 'inhaber') return 'inhaber';
  const ich = benutzer.kuerzel || benutzer.name;
  const meine = aufgaben.filter(e => e.typ === 'TASK' && e.status !== 'DONE' && gleichePerson(e.verantwortlich, ich));
  const technisch = meine.filter(e => e.technisch).length;
  return technisch * 2 > meine.length ? 'website' : 'laden';
}
