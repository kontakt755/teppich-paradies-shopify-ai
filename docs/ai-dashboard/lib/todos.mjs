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

import { musterText, musterHerkunftText } from './bestellinhalt.mjs';
import { vorgangsLink } from './vorgangslink.mjs';
import { lieferterminFaellig, beschaffungText, uebernahmeText } from './beschaffung.mjs';

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

// Muster aus dem eigenen Bestand ("haben wir da") - Spiegel von operations/lib/musterherkunft.mjs.
const ROUTEN_OHNE_LIEFERANT = ['SAMPLE_STOCK', 'SAMPLE_CUT'];
function musterEigen(p) {
  if (!p?.istMuster) return false;
  if (p.musterHerkunft === 'eigen_versand' || p.musterHerkunft === 'eigen_vorbei') return true;
  if (p.musterHerkunft === 'lieferant') return false;
  return ROUTEN_OHNE_LIEFERANT.includes(p.route) || ROUTEN_OHNE_LIEFERANT.includes(p.musterRoute);
}
const ortVon = z => { const o = z?.auftrag?.details?.lieferadresse?.ort; return o && o !== '–' ? o : null; };
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
  return z.kundenSchluessel ? vorgangsLink('kunden', { kunde: z.kundenSchluessel, auftrag: z.orderId }) : vorgangsLink('kunden', { tab: 'bestellungen', auftrag: z.orderId });
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
  const eigen = mit(null).filter(x => musterEigen(x.p));
  const unbestellt = mit(null).filter(x => !musterEigen(x.p));
  if (eigen.length && !unbestellt.length) {
    const vorbei = eigen.every(x => x.p.musterHerkunft === 'eigen_vorbei');
    return { spalte: 'wir', art: 'muster_eigen', schritt: vorbei ? 'Muster vorbeibringen' : 'Muster verschicken', alterTage: seitBestellung, positionen: eigen };
  }
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
  // orderIds mit faelliger Nachfrage (lib/muster-nachfassen.mjs): die Muster liegen beim Kunden,
  // aber jetzt sind wir mit der Nachfrage dran - also nicht mehr "Kunde ist dran".
  const nachfassen = opt.nachfassen instanceof Set ? opt.nachfassen : new Set(opt.nachfassen || []);
  for (const b of laufendeBestellungen(quellen.bestellzeilen, k.statusAlle)) {
    let lage = lageVon(b, k);
    if (lage.spalte === 'kunde' && nachfassen.has(b.z.orderId)) lage = { ...lage, spalte: 'wir', art: 'nachfassen', schritt: 'Muster nachfassen' };
    const lieferanten = [...new Set((lage.positionen || []).map(x => x.p.lieferant).filter(Boolean))];
    spalten[lage.spalte].push({
      id: `auftrag:${b.z.orderId}`,
      orderId: b.z.orderId,
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
  const eigeneMuster = new Map(); // orderId -> Muster aus eigenem Bestand, noch nicht beim Kunden
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
        knopf: { text: 'Klären', href: vorgangsLink('einkauf', { auftrag: z.orderId }) },
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
        knopf: { text: 'Zurückrufen', href: vorgangsLink('kunden', { auftrag: z.orderId, tab: 'rueckrufe' }) },
      });
      // Erst anrufen, dann bestellen ("Beratung gewünscht - vor Einkauf anrufen"): solange der
      // Rueckruf faellig ist, erscheint die Bestellung nicht zusaetzlich unter "bestellen".
      continue;
    }
    if (!istBezahlt(z)) continue;   // unbezahlt: der Kunde ist dran, nichts zu bestellen
    for (const x of offen) {
      const status = x.eintrag?.status || null;
      const pos = { ...x, z, seitBestellung };
      if (lieferterminFaellig(x.eintrag, k.heute)) {
        todos.push({ id: `liefertermin:${z.orderId}:${x.p.lineItemId}`, art: 'liefertermin', bereich: 'laden', ton: 'crit', alterTage: tageSeit(x.eintrag.beschaffung.liefertermin, k.jetzt), titel: `Bestätigter Liefertermin überschritten: ${z.orderName}`, kontext: [x.p.titel, beschaffungText(x.eintrag), uebernahmeText(x.eintrag)].filter(Boolean).join(' · '), knopf: { text: 'Nachhaken', href: vorgangsLink('einkauf', { auftrag: z.orderId, af: 'bestellt' }) } });
        continue;
      }
      // "Haben wir da": nicht beim Lieferanten bestellen, sondern vorbeibringen bzw. verschicken.
      if (!status && musterEigen(x.p)) sammle(eigeneMuster, z.orderId, pos);
      else if (!status) sammle(bestellen, `${x.p.lieferant ?? UNGEKLAERT}|${x.p.istMuster ? 'muster' : 'ware'}`, pos);
      else if (status === 'bestellt') {
        const tage = tageSeit(x.eintrag.bestelltAm, k.jetzt);
        if (!x.eintrag?.beschaffung?.liefertermin && tage !== null && tage >= k.schwellen.nachhakenTage) sammle(nachhaken, x.p.lieferant ?? UNGEKLAERT, { ...pos, tage });
      } else if (status === 'geliefert') {
        const tage = tageSeit(x.eintrag.geliefertAm, k.jetzt);
        const id = `rausgeben:${z.orderId}`;
        const vorhanden = todos.find(t => t.id === id);
        if (vorhanden) { vorhanden.alterTage = Math.max(vorhanden.alterTage ?? 0, tage ?? 0); vorhanden.ton = tonNachAlter(vorhanden.alterTage, ...FRISTEN.rausgeben); continue; }
        todos.push({
          id, art: 'rausgeben', bereich: 'laden', ton: tonNachAlter(tage, ...FRISTEN.rausgeben), alterTage: tage,
          titel: `${x.p.istMuster ? 'Muster' : 'Ware'} ist da – an ${kundeVon(z)} rausgeben`,
          kontext: [z.orderName, x.p.istMuster ? musterText([x.p]) : x.p.titel, tage !== null ? `liegt ${seitText(tage)} bei uns` : null].filter(Boolean).join(' · '),
          knopf: { text: 'Rausgeben', href: vorgangsLink('einkauf', { auftrag: z.orderId, af: 'eingetroffen' }) },
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
  // Muster mit Produkt und Farben statt "3 Positionen" (Inhaber 2026-10-13: klipp und klar,
  // ohne Klick). Lange Listen werden gekuerzt - der ganze Text steht in der Bestellliste.
  const musterKurz = positionen => {
    const text = musterText(positionen.map(x => x.p));
    return text.length > 120 ? `${text.slice(0, 117).replace(/[\s,·:]+\S*$/, '')} …` : text;
  };

  for (const [key, positionen] of bestellen) {
    const [lieferant, art] = key.split('|');
    const tage = Math.max(...positionen.map(x => x.seitBestellung ?? 0));
    todos.push({
      id: `bestellen:${key}`, art: 'bestellen', bereich: 'laden', ton: tonNachAlter(tage, ...FRISTEN.bestellen), alterTage: tage,
      titel: `${art === 'muster' ? 'Muster' : 'Ware'} bei ${k.lieferantName(lieferant)} bestellen`,
      kontext: [kundenKurz(positionen), art === 'muster' ? musterKurz(positionen) : wasKurz(positionen), `bezahlt, Bestellung ${vorText(tage)}`].join(' · '),
      knopf: { text: 'Bestellen', href: einkaufLink(lieferant) },
    });
  }
  for (const [orderId, positionen] of eigeneMuster) {
    const z = positionen[0].z;
    const tage = Math.max(...positionen.map(x => x.seitBestellung ?? 0));
    const vorbei = positionen.every(x => x.p.musterHerkunft === 'eigen_vorbei');
    todos.push({
      id: `muster-eigen:${orderId}`, art: 'muster_eigen', bereich: 'laden', ton: tonNachAlter(tage, ...FRISTEN.bestellen), alterTage: tage,
      titel: vorbei ? `Muster vorbeibringen bei ${kundeVon(z)}` : `Muster verschicken an ${kundeVon(z)}`,
      kontext: [ortVon(z), z.orderName, musterKurz(positionen), musterHerkunftText(positionen.map(x => x.p)) || 'aus eigenem Bestand'].filter(Boolean).join(' · '),
      // Ein Klick traegt "Kunde hat Muster" ein (Zeitleiste); der Server setzt die Uebergabe mit.
      // Nur wenn ALLE Muster der Bestellung aus dem eigenen Bestand kommen - sonst stuende
      // "Kunde hat Muster" da, obwohl andere Muster noch beim Lieferanten liegen: dann in die Akte.
      knopf: (z.auftrag?.positionen || []).filter(p => p.istMuster).every(musterEigen)
        ? { text: 'Erledigt – Kunde hat Muster', schritt: { orderId, aktion: 'kunde_hat_muster' }, href: kundenLink(z) }
        : { text: 'Ansehen', href: kundenLink(z) },
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
      knopf: { text: 'Nachfassen', href: vorgangsLink('kunden', { fall: f.schluessel }) },
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

/** Die Shop-Wache laeuft stuendlich; ein aelterer Stand sagt nichts ueber den Shop von jetzt. */
export const SHOPWACHE_STUMM_STUNDEN = 3;

/** Shop-Wache: nur wenn sie etwas meldet - oder sich seit Stunden nicht mehr gemeldet hat. */
function ausShopwache(quellen, jetzt) {
  const d = quellen.shopwache;
  if (!d || !d.verfuegbar) return [];
  const stunden = d.geprueftAm ? (jetzt.getTime() - new Date(d.geprueftAm).getTime()) / 3_600_000 : null;
  // Frueher stand dieser Hinweis in den eingeklappten "Weiteren Uebersichten" auf Heute -
  // dort sah ihn niemand. Eine stumme Wache meldet auch keinen kaputten Shop.
  if (d.ampel === 'gruen' && stunden !== null && stunden > SHOPWACHE_STUMM_STUNDEN) {
    return [{
      id: 'shopwache', art: 'shopwache', bereich: 'website', ton: 'warn', alterTage: tageSeit(d.geprueftAm, jetzt),
      titel: 'Shop-Wache meldet sich nicht',
      kontext: `letzte Prüfung vor ${Math.floor(stunden)} Stunden – sie läuft sonst stündlich`,
      knopf: { text: 'Prüfen', href: '#/shopwache' },
    }];
  }
  if (!['rot', 'gelb'].includes(d.ampel)) return [];
  const befunde = d.befunde || [];
  return [{
    id: 'shopwache', art: 'shopwache', bereich: 'website', ton: d.ampel === 'rot' ? 'crit' : 'warn', alterTage: tageSeit(d.geprueftAm, jetzt),
    titel: d.ampel === 'rot' ? 'Shop-Wache: der Shop hat ein Problem' : 'Shop-Wache meldet Auffälligkeiten',
    kontext: [befunde[0]?.titel, befunde.length > 1 ? `+${befunde.length - 1} weitere` : null].filter(Boolean).join(' · ') || 'Befund ansehen',
    knopf: { text: 'Prüfen', href: '#/shopwache' },
  }];
}

/**
 * Tailscale am Mac mini: ohne laufendes Tailscale ist das Control Center von unterwegs
 * (Handy, zu Hause) nicht erreichbar. Der Server fragt `tailscale status` nur ab
 * (operations/lib/tailscale.mjs) und liefert das Ergebnis mit der Shop-Wache aus.
 * Text an einer Stelle: To-do, Shop-Wache und Systemzustand sagen dasselbe.
 */
export function tailscaleHinweis(stand) {
  if (stand?.status === 'gestoppt') {
    return {
      titel: 'Tailscale ist aus – von unterwegs ist das Control Center nicht erreichbar',
      handlung: 'Am Mac mini oben rechts in der Menüleiste auf das Tailscale-Symbol klicken und „Connect“ wählen.',
    };
  }
  if (stand?.status === 'abgemeldet') {
    return {
      titel: 'Tailscale ist abgemeldet – von unterwegs ist das Control Center nicht erreichbar',
      handlung: 'Am Mac mini das Tailscale-Symbol in der Menüleiste öffnen und mit dem Firmenkonto anmelden („Log in“).',
    };
  }
  return null;
}

function ausTailscale(quellen) {
  const h = tailscaleHinweis(quellen.shopwache?.tailscale);
  if (!h) return [];
  return [{
    id: 'tailscale', art: 'tailscale', bereich: 'website', ton: 'warn', alterTage: null,
    titel: h.titel, kontext: h.handlung,
    knopf: { text: 'Ansehen', href: '#/shopwache' },
  }];
}

/** Die Auslauf-Pruefung laeuft montags; ab 9 Tagen ohne neuen Stand ist sie ausgefallen. */
export const AUSLAUF_STUMM_TAGE = 9;

/**
 * Auslauf-Pruefung (Inhaberregel 2026-10-13: Ausgelaufenes wird nie angezeigt).
 * Kommt mit der Shop-Wache (quellen.shopwache.auslauf). Meldet Befunde, gestoerte
 * Lieferanten und eine Pruefung, die sich nicht mehr meldet - archiviert wird nach Gegenprobe.
 */
function ausAuslauf(quellen, jetzt) {
  const d = quellen.shopwache?.auslauf;
  if (!d?.geprueftAm) return [];
  const tage = tageSeit(d.geprueftAm, jetzt);
  const basis = { id: 'auslauf', art: 'auslauf', bereich: 'website', alterTage: tage, knopf: { text: 'Lexikon', href: '#/lexikon' } };
  const befunde = d.befunde || [];
  const weg = befunde.filter(b => b.ergebnis === 'fehlt');
  if (befunde.length) {
    const handles = [...new Set(befunde.flatMap(b => b.handles || []))];
    return [{
      ...basis, ton: weg.length ? 'crit' : 'warn',
      knopf: { text: 'Im Lexikon', href: `#/lexikon?${new URLSearchParams({ lq: handles[0] || '' })}` },
      titel: weg.length
        ? `Auslauf: ${weg.length} Artikel beim Lieferanten nicht mehr gefunden`
        : `Auslauf-Prüfung: ${befunde.length} ${befunde.length === 1 ? 'Seite' : 'Seiten'} auffällig`,
      kontext: [
        handles.slice(0, 3).join(', '), handles.length > 3 ? `+${handles.length - 3} weitere` : null,
        'gegenprüfen, dann archivieren (AGENTS.md)',
      ].filter(Boolean).join(' · '),
    }];
  }
  if (d.ausfaelle?.length) {
    return [{
      ...basis, ton: 'warn',
      titel: `Auslauf-Prüfung: Lieferant ${d.ausfaelle.map(a => a.lieferant).join(', ')} nicht prüfbar`,
      kontext: d.ausfaelle[0].grund,
    }];
  }
  if (tage !== null && tage >= AUSLAUF_STUMM_TAGE) {
    return [{ ...basis, ton: 'warn', titel: 'Auslauf-Prüfung meldet sich nicht', kontext: `letzter Lauf vor ${tage} Tagen – sie läuft sonst montags` }];
  }
  return [];
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
    ...ausAuslauf(quellen, k.jetzt),
    ...ausTailscale(quellen),
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
 *   shopwache      /api/shopwache/status, nur beim Inhaber gefuellt (mit `auslauf`)
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
