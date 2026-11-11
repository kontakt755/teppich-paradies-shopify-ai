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
import { lieferterminFaellig, beschaffungText, uebernahmeText, lieferantenStand, werktageSeit, NACHFASSEN_WERKTAGE } from './beschaffung.mjs';
import { LEISTUNG_LABEL, QUELLE_LABEL, STATUS_LABEL, serviceOffen, serviceLink } from './serviceanfragen.mjs';
import { verzugAmpel, kundenErinnerung } from './auftrags-ablauf.mjs';
import { WARTESCHWELLEN, tageMitBezug } from './ampel.mjs';
import { sichereUrl } from './akquise.mjs';
import { entscheidungsGruppen } from './model.mjs';
import { lieferantName as lieferantAnzeige, werktageZwischen } from './einkauf-lieferanten.mjs';
import { belegMarke } from './lieferbelege.mjs';
import { istLagerware, selbstStand } from './lieferweg.mjs';
import { ohneGesperrteKlaerung } from './einkauf-uebersicht.mjs';

const TAG_MS = 86400000;
const UNGEKLAERT = 'UNGEKLAERT';
const BEZAHLT = ['PAID', 'PARTIALLY_REFUNDED'];

/** Wartezeit beim Lieferanten: ab 7 Tagen nachhaken, ab 14 Tagen ist es ein Problem - die eine
 * Schwelle aus lib/ampel.mjs (/api/einkauf/lieferanten liefert sie mit). */
export const SCHWELLEN = WARTESCHWELLEN;

/** Ab wann ein To-do gelb bzw. rot wird, je Art. Ein Rueckrufwunsch altert schneller als eine Lieferung. */
export const FRISTEN = Object.freeze({
  bestellen: [3, 7],     // Muster bezahlt, aber noch nicht beim Lieferanten bestellt
  ware_bestellen: [1, 3], // Ware bezahlt, aber kein Status und kein Beleg (03.11.: 838 € lagen 4 Tage)
  bestaetigung: [3, 7],  // Ware als bestellt markiert, aber keine AB und kein Lieferschein zugeordnet
  lieferschein: [0, 4],  // Lieferschein da, Ware noch nicht als eingetroffen oder raus markiert
  rueckruf: [2, 7],      // Kunde wartet auf einen Anruf
  rausgeben: [2, 5],     // Ware liegt bei uns (03.11.: 7/14 Tage liessen 10 Muster liegen)
  angebot: [7, 14],      // Angebot ohne Antwort
  service: [1, 3],       // neue Service-Anfrage, noch niemand hat sich gemeldet
  kunde_antwortet: [14, 21], // Ansicht Laden: Kunde ist dran (Empfang, Rueckmeldung) und meldet sich nicht
  laden_aufgabe: [1, 2], // Ansicht Laden: von Hand angelegte Aufgabe (Rolle schneiden, Rechnung kontrollieren ...)
  laden_mail: [1, 2],    // Ansicht Laden: Mail an das Laden-Postfach, noch nicht beantwortet
});

// 'alles' ist die Vereinigung aller Bereiche (Inhaber-Chip "Alles"). 'inhaber' bleibt die
// fruehere Fokus-Sicht (Freigaben, Rotes, Eigenes) fuer alte Links - der Chip "Alles" zeigte
// sie bis 2026-10-19 und verschwieg damit normale Laden-Arbeit (Codex-Audit).
export const SICHTEN = Object.freeze(['inhaber', 'laden', 'website', 'alles']);
export const SICHT_LABEL = Object.freeze({ inhaber: 'Inhaber', laden: 'Laden', website: 'Website', alles: 'Alles' });

/**
 * Haengt ein Muster laenger als so viele Werktage aus demselben Grund bei der Musterautomatik, ist es
 * ein Problem: am 31.10. standen 17 Muster still, ohne dass eine Aufgabe entstand.
 */
export const MUSTER_KLAER_WERKTAGE = 1;

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

/**
 * "heute", "1 Tag", "5 Tage" - fuer die Alters-Marke. Mit `bezug` (To-do-Feld `alterBezug`, #1996) nennt die
 * Marke, seit wann gezaehlt wird: "17 Tage beim Lieferanten", "Liegt seit 8 Tagen hier", "Kunde wartet 17 Tage"
 * (lib/ampel.mjs tageMitBezug) - dieselben Worte wie im Einkauf und in der Packstation.
 */
export function alterText(tage, bezug = null) {
  return tageMitBezug(tage, bezug);
}

const seitText = tage => (tage === 0 ? 'seit heute' : tage === 1 ? 'seit 1 Tag' : `seit ${tage} Tagen`);
const vorText = tage => (tage === 0 ? 'heute' : tage === 1 ? 'gestern' : `vor ${tage} Tagen`);
const mehrzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;
const gleichePerson = (a, b) => Boolean(a && b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** Tagesdatum JJJJ-MM-TT in lokaler Zeit - Wiedervorlagen und Fristen sind Kalendertage. */
export function alsTag(d) {
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

/**
 * Echte, laufende Bestellungen: nicht Test, nicht storniert, in Shopify noch offen, mit offener Position.
 * Gesperrte Muster (`z.gesperrteMuster`) sind kein "ohne Großhändler-ID" - dieselbe Bereinigung wie im
 * Einkauf (ohneGesperrteKlaerung). Sonst stand auf Heute "Zuerst klären" fuer ein Muster, das nie bestellt
 * wird, und das To-do "Muster nicht lieferbar" entstand gar nicht (Review 06.11.2026, #1996).
 */
function laufendeBestellungen(bestellzeilen, statusAlle) {
  return (bestellzeilen || [])
    .filter(z => z?.auftrag && !z.testbestellung && !z.storniert && z.offen)
    .map(z => ({ z, a: ohneGesperrteKlaerung(z.auftrag, new Set(z.gesperrteMuster || []), p => standVon(statusAlle, p.orderId, p.lineItemId)), offen: offenePositionen(z.auftrag, statusAlle) }))
    .filter(x => x.offen.length);
}

const kundeVon = z => z.kundenname || z.orderName || 'Kunde';

/**
 * Titel, Kontext, Alter, Ton und Schluessel des To-dos "… ist da – rausgeben" aus seinen Teilen (je
 * eingetroffener Position einer). Eine Funktion fuer Aufbau und Rest (rausgebenOhne), damit beides
 * gleich klingt: Titel und Text nach der ersten Position, das Alter nach der aeltesten. Die
 * Lagermuster gehen nur mit, wenn die erste Position ein Muster ist.
 */
function rausgebenFelder(r) {
  const erste = r.teile[0];
  const alterTage = r.teile.length === 1 ? erste.tage : Math.max(...r.teile.map(t => t.tage ?? 0));
  const dazu = erste.istMuster ? r.lagermuster : null;
  return {
    ton: tonNachAlter(alterTage, ...FRISTEN.rausgeben), alterTage, alterBezug: 'hier',
    schluessel: [...r.teile.map(t => t.schluessel), ...(dazu?.schluessel || [])],
    titel: `${erste.istMuster ? 'Muster' : 'Ware'} ist da – an ${r.kunde} rausgeben`,
    // Wie lange es hier liegt, sagt die Marke ("Liegt seit 8 Tagen hier") - nicht noch einmal im Text.
    kontext: [r.orderName, erste.text, dazu?.text].filter(Boolean).join(' · '),
  };
}

/**
 * Das To-do "rausgeben" ohne die Positionen in `gedeckt` (Schluessel "<orderId>::<lineItemId>", z. B.
 * was "Von uns abschicken" schon zeigt). null, wenn nichts uebrig bleibt; andere To-dos unveraendert.
 * Vorher fiel das To-do nur weg, wenn ALLE Positionen gedeckt waren - in einem Auftrag mit Ware und
 * Muster stand die Ware dann zweimal auf der Seite.
 */
export function rausgebenOhne(todo, gedeckt) {
  const r = todo?.art === 'rausgeben' ? todo.rausgeben : null;
  if (!r || !gedeckt?.size) return todo;
  const teile = r.teile.filter(t => !gedeckt.has(t.schluessel));
  if (teile.length === r.teile.length) return todo;
  if (!teile.length) return null;
  const rest = { ...r, teile };
  return { ...todo, ...rausgebenFelder(rest), rausgeben: rest };
}

/**
 * Neueste AB und neuester Lieferschein je Bestellung und Lieferant aus dem Beleg-Abgleich; Storno zaehlt
 * nicht als bestellt. Je Lieferant, weil die AB von A nichts ueber die Ware von B sagt.
 */
const belegSchluessel = (orderId, lieferant) => `${orderId}|${lieferant}`;
function sammleBeleg(jeLieferant, zeile) {
  if (zeile?.nurMuster || (!zeile?.ab && !zeile?.lieferschein)) return;
  const schluessel = belegSchluessel(zeile.orderId, zeile.lieferant);
  const bisher = jeLieferant.get(schluessel) || { ab: null, lieferschein: null };
  const neuer = (a, b) => (!a ? b : !b ? a : (String(a.datum) >= String(b.datum) ? a : b));
  jeLieferant.set(schluessel, { ab: neuer(bisher.ab, zeile.ab), lieferschein: neuer(bisher.lieferschein, zeile.lieferschein) });
}

// Muster aus dem eigenen Bestand ("haben wir da") - Spiegel von operations/lib/musterherkunft.mjs.
const ROUTEN_OHNE_LIEFERANT = ['SAMPLE_STOCK', 'SAMPLE_CUT'];
function musterEigen(p) {
  if (!p?.istMuster) return false;
  if (p.musterHerkunft === 'eigen_versand' || p.musterHerkunft === 'eigen_vorbei') return true;
  if (p.musterHerkunft === 'lieferant') return false;
  return ROUTEN_OHNE_LIEFERANT.includes(p.route) || ROUTEN_OHNE_LIEFERANT.includes(p.musterRoute);
}
/**
 * Gemischte Musterbestellung (Inhaber 2026-10-15): alles geht zusammen raus, sobald die Muster
 * vom Lieferanten da sind. True, solange ein Muster der Bestellung noch beim Lieferanten aussteht
 * (nicht bestellt oder bestellt). Spiegel von wartetAufLieferant() in operations/lib/musterlager.mjs.
 */
function lieferantMusterAusstehend(offen) {
  return offen.some(x => x.p.istMuster && !musterEigen(x.p) && (!x.eintrag?.status || x.eintrag.status === 'bestellt'));
}
const ortVon = z => { const o = z?.auftrag?.details?.lieferadresse?.ort; return o && o !== '–' ? o : null; };
const istBezahlt = z => BEZAHLT.includes(String(z.zahlungsstatus));
const artWort = positionen => (positionen.every(x => x.p.istMuster) ? 'Muster' : 'Ware');

/**
 * Werktage, seit ein Muster aus demselben Grund bei der Musterautomatik haengt - nur wenn es laenger als
 * MUSTER_KLAER_WERKTAGE sind, sonst null. Eine Regel fuer das rote To-do hier und die Packstation (Ampel).
 */
export function automatikHaengtWerktage(seit, jetzt = new Date()) {
  const werktage = werktageZwischen(seit, jetzt);
  return werktage !== null && werktage > MUSTER_KLAER_WERKTAGE ? werktage : null;
}

/** Klaerfall der Musterautomatik, wenn diese Position zu lange aus demselben Grund haengt - sonst null. */
function haengtBeiAutomatik(z, lineItemId, jetzt) {
  const fall = z.musterAutomatik?.klaeren?.find(e => e.lineItemIds?.includes(lineItemId));
  const werktage = fall ? automatikHaengtWerktage(fall.seit, jetzt) : null;
  return werktage !== null ? { grund: fall.grund, seit: fall.seit, werktage } : null;
}

export function rueckrufFaellig(r, heute) {
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
  // Lagerware (lib/lieferweg.mjs): wir schneiden selbst zu - nie "bestellen", nie "nachhaken",
  // auch nicht als Altfall auf "bestellt" (vor dem 06.11.2026).
  const ausLager = offen.filter(x => selbstStand(x.p, x.eintrag) === 'zuschneiden');
  const unbestellt = mit(null).filter(x => !musterEigen(x.p) && !istLagerware(x.p, x.eintrag));
  // Gemischt: Lagermuster gehen mit den Lieferanten-Mustern raus - solange die ausstehen oder
  // schon da sind, ist der Schritt "bestellt" bzw. "rausgeben", nicht "verschicken".
  const lieferantMusterDa = mit('geliefert').some(x => x.p.istMuster);
  if (eigen.length && !unbestellt.length && !lieferantMusterAusstehend(offen) && !lieferantMusterDa) {
    const vorbei = eigen.every(x => x.p.musterHerkunft === 'eigen_vorbei');
    return { spalte: 'wir', art: 'muster_eigen', schritt: vorbei ? 'Muster vorbeibringen' : 'Muster verschicken', alterTage: seitBestellung, positionen: eigen };
  }
  // Nur angefragt (Preis/Verfuegbarkeit beim Lieferanten): der Lieferant ist dran - ab 2 Werktagen ohne Antwort wieder wir.
  const angefragt = unbestellt.filter(x => !x.p.istMuster && x.eintrag?.beschaffung?.anfrage);
  if (unbestellt.length && angefragt.length === unbestellt.length) {
    const nachfassen = angefragt.some(x => lieferantenStand(x.eintrag, { jetzt }).nachfassen);
    return nachfassen ? { spalte: 'wir', art: 'anfrage_nachfassen', schritt: 'Anfrage beim Lieferanten nachfassen', alterTage: seitBestellung, positionen: angefragt }
      : { spalte: 'lieferant', art: 'angefragt', schritt: 'Lieferant angefragt', alterTage: seitBestellung, positionen: angefragt };
  }
  if (unbestellt.length) return { spalte: 'wir', art: 'bestellen', schritt: `${artWort(unbestellt)} bestellen`, alterTage: seitBestellung, positionen: unbestellt };
  if (ausLager.length) return { spalte: 'wir', art: 'zuschneiden', schritt: 'Aus eigenem Lager zuschneiden', alterTage: seitBestellung, positionen: ausLager };
  const maxTage = (liste, feld) => liste.reduce((m, x) => Math.max(m, tageSeit(x.eintrag?.[feld], jetzt) ?? 0), 0);
  const bestellt = mit('bestellt').filter(x => !istLagerware(x.p, x.eintrag));
  if (bestellt.length) {
    // Bestaetigter Liefertermin: vorher ist der Lieferant dran, danach wir - dieselbe Regel wie
    // das To-do "Liefertermin ueberschritten" und wartetage() im Einkauf. Bis 2026-10-19 stand
    // hier trotz Termin in der Zukunft "Nachhaken".
    const faellig = bestellt.filter(x => lieferterminFaellig(x.eintrag, heute));
    if (faellig.length) return { spalte: 'wir', art: 'liefertermin', schritt: 'Liefertermin überschritten', alterTage: Math.max(...faellig.map(x => tageSeit(x.eintrag.beschaffung.liefertermin, jetzt) ?? 0)), positionen: faellig };
    const ohneTermin = bestellt.filter(x => !x.eintrag?.beschaffung?.liefertermin);
    if (!ohneTermin.length) {
      const termin = bestellt.map(x => x.eintrag.beschaffung.liefertermin).sort().at(-1);
      return { spalte: 'lieferant', art: 'bestellt', schritt: `${artWort(bestellt)} kommt bis ${termin.split('-').reverse().join('.')}`, termin, alterTage: null, positionen: bestellt };
    }
    const tage = maxTage(ohneTermin, 'bestelltAm');
    // Verzug: ab 7 Tagen ohne Wareneingang nachhaken (lib/ampel.mjs, wie im Einkauf "Je Auftrag").
    return ohneTermin.some(x => verzugAmpel(x.eintrag, jetzt) !== null)
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
  // Ohne Stammdaten (Tests, Pages): dieselbe Ersatzanzeige wie ueberall - "Lieferant A" bzw. "Lieferant nicht zugeordnet".
  const lieferantName = opt.lieferantName || (id => lieferantAnzeige(id));
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
      liefertermin: lage.termin || null,
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
  // Rot vor Gelb vor normal, darin das Aelteste zuerst - wie sortiereTodos.
  for (const liste of Object.values(spalten)) liste.sort((a, b) => (TON_RANG[a.ton] ?? 2) - (TON_RANG[b.ton] ?? 2) || (b.alterTage ?? -1) - (a.alterTage ?? -1));
  return { ...spalten, gesamt: spalten.wir.length + spalten.lieferant.length + spalten.kunde.length };
}

// ---------------------------------------------------------------- To-dos

/**
 * Bestellungen eines To-dos (`orderIds`): die Shop-Uebersicht laesst eine Bestellung, die schon rot unter
 * "Probleme" steht, aus "Alte Bestellungen aufräumen" weg und haengt dort Abschliessen/Laeuft noch an (#1996).
 */
const orderIdsVon = positionen => [...new Set(positionen.map(x => x.z?.orderId).filter(Boolean))];
/**
 * Positionen eines Muster-To-dos als "orderId::lineItemId" (`musterSchluessel`): die Shop-Uebersicht laesst genau
 * diese Klaerfaelle aus dem Block "Musterautomatik" weg - nicht nach Alter geraten, was oben rot steht (#1996).
 */
const musterSchluesselVon = positionen => positionen.map(x => `${x.z?.orderId}::${x.p?.lineItemId}`);

function ausBestellungen(quellen, k) {
  const todos = [];
  const bestellen = new Map();   // lieferant|art -> Muster, noch nicht beim Lieferanten bestellt
  const wareBestellen = new Map(); // orderId -> Ware ohne Status: je Bestellung, kein Kunde verschwindet in "+3"
  const ohneBestaetigung = new Map(); // orderId -> Ware als bestellt markiert, keine AB (weder Beleg noch Vermerk)
  const angefragt = new Map();   // orderId -> Ware beim Lieferanten angefragt, noch nicht bestellt
  const abAbweichung = new Map(); // orderId -> AB geprueft, weicht aber ab (Menge, Masse, Lieferweg, Zuschlaege)
  const gesperrt = new Map();    // orderId -> Muster, die der Lieferant nicht mehr liefern kann
  const belegeJeLieferant = new Map();
  for (const b of quellen.belegZeilen || []) sammleBeleg(belegeJeLieferant, b);
  const belegZu = (orderId, lieferant) => belegeJeLieferant.get(belegSchluessel(orderId, lieferant));
  const nachhaken = new Map();   // lieferant -> Positionen, zu lange bestellt
  const eigeneMuster = new Map(); // orderId -> Muster aus eigenem Bestand, noch nicht beim Kunden
  const haengend = new Map();    // Grund der Musterautomatik -> Muster, die zu lange daran haengen
  const wartenAufLieferant = new Set(); // orderIds: eigene Muster gehen mit denen vom Lieferanten raus
  const sammle = (map, key, wert) => { if (!map.has(key)) map.set(key, []); map.get(key).push(wert); };

  for (const b of laufendeBestellungen(quellen.bestellzeilen, k.statusAlle)) {
    const { z, a, offen } = b;
    const seitBestellung = tageSeit(z.datum, k.jetzt);
    if (a.ampel === 'rot') {
      // Blockiert ("Zuerst klären"): solange etwas fehlt, kann niemand bestellen - darum
      // erscheinen die Positionen dieser Bestellung nicht zusaetzlich unter "bestellen".
      todos.push({
        id: `blockiert:${z.orderId}`, orderIds: [z.orderId], art: 'blockiert', bereich: 'laden', ton: 'crit', alterTage: seitBestellung, alterBezug: 'kunde',
        titel: `Zuerst klären: ${z.orderName}`,
        kontext: [kundeVon(z), ...(a.hinweise || []).slice(0, 2).map(k.klartext)].join(' · '),
        knopf: { text: 'Klären', href: vorgangsLink('einkauf', { auftrag: z.orderId }) },
      });
      continue;
    }
    const rueckruf = k.rueckrufJeOrder.get(z.orderId);
    if (rueckrufFaellig(rueckruf, k.heute)) {
      todos.push({
        id: `rueckruf:${z.orderId}`, orderIds: [z.orderId], art: 'rueckruf', bereich: 'laden',
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
    if (lieferantMusterAusstehend(offen)) wartenAufLieferant.add(z.orderId);
    for (const x of offen) {
      const status = x.eintrag?.status || null;
      const pos = { ...x, z, seitBestellung };
      // Kommt nicht mehr: vor allen anderen Schritten, sonst wartet "bestellt" hier ewig.
      if ((z.gesperrteMuster || []).includes(x.p.lineItemId) && (!status || status === 'bestellt')) {
        sammle(gesperrt, z.orderId, pos);
        continue;
      }
      if (lieferterminFaellig(x.eintrag, k.heute)) {
        todos.push({ id: `liefertermin:${z.orderId}:${x.p.lineItemId}`, orderIds: [z.orderId], art: 'liefertermin', bereich: 'laden', ton: 'crit', alterTage: tageSeit(x.eintrag.beschaffung.liefertermin, k.jetzt), titel: `Bestätigter Liefertermin überschritten: ${z.orderName}`, kontext: [x.p.titel, beschaffungText(x.eintrag), uebernahmeText(x.eintrag)].filter(Boolean).join(' · '), knopf: { text: 'Nachhaken', href: vorgangsLink('einkauf', { auftrag: z.orderId, af: 'bestellt' }) } });
        continue;
      }
      // Lagerware: kein "bestellen", kein "Nachhaken", kein "kein Beleg" - zugeschnitten und
      // verschickt wird ueber "Von uns abschicken" auf Heute. Erst "bei uns" wird es "rausgeben".
      if (istLagerware(x.p, x.eintrag) && (!status || status === 'bestellt')) continue;
      // "Haben wir da": nicht beim Lieferanten bestellen, sondern vorbeibringen bzw. verschicken.
      const haengt = !status && !musterEigen(x.p) ? haengtBeiAutomatik(z, x.p.lineItemId, k.jetzt) : null;
      if (haengt) sammle(haengend, haengt.grund, { ...pos, ...haengt });
      else if (!status && musterEigen(x.p)) sammle(eigeneMuster, z.orderId, pos);
      else if (!status && x.p.istMuster) sammle(bestellen, `${x.p.lieferant ?? UNGEKLAERT}|muster`, pos);
      else if (!status && x.eintrag?.beschaffung?.anfrage) sammle(angefragt, z.orderId, pos);
      else if (!status) sammle(wareBestellen, z.orderId, pos);
      else if (status === 'bestellt') {
        const tage = tageSeit(x.eintrag.bestelltAm, k.jetzt);
        const termin = x.eintrag?.beschaffung?.liefertermin;
        const verzug = termin ? null : verzugAmpel(x.eintrag, k.jetzt);
        if (!x.p.istMuster && lieferantenStand(x.eintrag, { jetzt: k.jetzt }).abweichungen.length) sammle(abAbweichung, z.orderId, pos);
        if (verzug) sammle(nachhaken, x.p.lieferant ?? UNGEKLAERT, { ...pos, tage, ampel: verzug });
        // Nur wenn die Belege geladen sind: ohne sie ist "kein Beleg" nicht belegt. Ab 2 Werktagen ohne AB
        // nachfassen (Inhaber 06.11.2026, vorher 3 Kalendertage); eine eingegangene, ungepruefte AB meldet
        // der Belegbereich ("Auftragsbestaetigung pruefen"), eine gepruefte AB beendet das Nachfassen.
        else if (!x.p.istMuster && !x.p.eigenleistung && !termin && !x.eintrag?.beschaffung?.ab && quellen.belegZeilen
          && (werktageSeit(x.eintrag.bestelltAm, k.jetzt) ?? 0) >= NACHFASSEN_WERKTAGE && !belegZu(z.orderId, x.p.lieferant)) {
          sammle(ohneBestaetigung, z.orderId, { ...pos, tage, werktage: werktageSeit(x.eintrag.bestelltAm, k.jetzt) });
        }
      } else if (status === 'geliefert') {
        const tage = tageSeit(x.eintrag.geliefertAm, k.jetzt);
        const id = `rausgeben:${z.orderId}`;
        const teil = { schluessel: `${z.orderId}::${x.p.lineItemId}`, istMuster: Boolean(x.p.istMuster), text: x.p.istMuster ? musterText([x.p]) : x.p.titel, tage };
        const vorhanden = todos.find(t => t.id === id);
        if (vorhanden) { vorhanden.rausgeben.teile.push(teil); Object.assign(vorhanden, rausgebenFelder(vorhanden.rausgeben)); continue; }
        // Gemischt: die Lagermuster derselben Bestellung gehen mit den Mustern raus.
        // Wie bisher nur, wenn das To-do mit einem Muster beginnt (sonst stuenden sie zusaetzlich unter "eigene Muster").
        const ausLager = x.p.istMuster ? offen.filter(y => !y.eintrag?.status && musterEigen(y.p) && y.p.musterHerkunft !== 'eigen_vorbei').map(y => y.p) : [];
        if (ausLager.length) wartenAufLieferant.add(z.orderId);
        // Teile je Position: die Shop-Uebersicht nimmt heraus, was "Von uns abschicken" schon zeigt
        // (rausgebenOhne) - eine Sache genau einmal auf der Seite, auch in gemischten Auftraegen.
        const rausgeben = { kunde: kundeVon(z), orderName: z.orderName, teile: [teil],
          lagermuster: ausLager.length ? { schluessel: ausLager.map(p => `${z.orderId}::${p.lineItemId}`),
            text: `zusammen mit ${musterHerkunftText(ausLager) || 'Mustern aus eigenem Bestand'}: ${musterText(ausLager)}` } : null };
        todos.push({
          id, orderIds: [z.orderId], art: 'rausgeben', bereich: 'laden', ...rausgebenFelder(rausgeben), rausgeben,
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
      id: `bestellen:${key}`, orderIds: orderIdsVon(positionen), art: 'bestellen', bereich: 'laden', ton: tonNachAlter(tage, ...FRISTEN.bestellen), alterTage: tage,
      titel: `${art === 'muster' ? 'Muster' : 'Ware'} bei ${k.lieferantName(lieferant)} bestellen`,
      kontext: [kundenKurz(positionen), art === 'muster' ? musterKurz(positionen) : wasKurz(positionen), `bezahlt, Bestellung ${vorText(tage)}`].join(' · '),
      knopf: { text: 'Bestellen', href: einkaufLink(lieferant) },
    });
  }
  for (const [orderId, alle] of wareBestellen) {
    const z = alle[0].z;
    const fuer = `${z.orderName} ${kundeVon(z)}`;
    const belegt = new Map();
    const positionen = [];
    for (const x of alle) {
      if (belegZu(orderId, x.p.lieferant)) sammle(belegt, x.p.lieferant, x);
      else positionen.push(x);
    }
    const mehrereLieferanten = new Set(alle.map(x => x.p.lieferant)).size > 1;
    // Per Mail bestellt, nicht abgehakt: eigene Zeile je Lieferant, denn der Schritt ist ein anderer - und
    // sie darf wirklich unbestellte Ware nicht unter lauter Scheinarbeit verstecken.
    for (const [lieferant, teil] of belegt) {
      const beleg = belegZu(orderId, lieferant);
      // Ein Avis kuendigt die Lieferung nur an: keine Frist, die Ware kann noch gar nicht da sein
      const lsTage = beleg.lieferschein?.art === 'lieferschein' ? tageSeit(beleg.lieferschein.datum, k.jetzt) : null;
      todos.push({
        id: `bestellen:${orderId}:ware:${lieferant}`, orderIds: [orderId], art: 'bestellen', bereich: 'laden',
        ton: lsTage !== null ? tonNachAlter(lsTage, ...FRISTEN.lieferschein) : 'warn', alterTage: lsTage ?? Math.max(...teil.map(x => x.seitBestellung ?? 0)),
        titel: `Laut Beleg bestellt, im Einkauf abhaken: ${fuer}`,
        kontext: [mehrereLieferanten ? k.lieferantName(lieferant) : null, wasKurz(teil), belegMarke(beleg.ab), belegMarke(beleg.lieferschein), lsTage !== null && lsTage >= FRISTEN.lieferschein[1] ? `${seitText(lsTage)} Lieferschein, noch nicht raus` : null].filter(Boolean).join(' · '),
        knopf: { text: 'Ansehen', href: vorgangsLink('einkauf', { auftrag: orderId }) },
      });
    }
    if (!positionen.length) continue;
    const tage = Math.max(...positionen.map(x => x.seitBestellung ?? 0));
    const lieferanten = [...new Set(positionen.map(x => x.p.lieferant).filter(l => l && l !== UNGEKLAERT))];
    const wer = lieferanten.length === 1 ? `bei ${k.lieferantName(lieferanten[0])} ` : '';
    todos.push({
      id: `bestellen:${orderId}:ware`, orderIds: [orderId], art: 'bestellen', bereich: 'laden', ton: tonNachAlter(tage, ...FRISTEN.ware_bestellen), alterTage: tage,
      titel: `Ware ${wer}bestellen: ${fuer}`,
      kontext: [wasKurz(positionen), `bezahlt, Bestellung ${vorText(tage)}`, quellen.belegZeilen ? 'kein zugeordneter Beleg' : null].filter(Boolean).join(' · '),
      knopf: { text: 'Bestellen', href: lieferanten.length === 1 ? einkaufLink(lieferanten[0]) : vorgangsLink('einkauf', { auftrag: orderId }) },
    });
  }
  for (const [orderId, positionen] of ohneBestaetigung) {
    const z = positionen[0].z;
    const tage = Math.max(...positionen.map(x => x.tage ?? 0));
    const lieferanten = [...new Set(positionen.map(x => x.p.lieferant).filter(l => l && l !== UNGEKLAERT))];
    const werktage = Math.max(...positionen.map(x => x.werktage ?? 0));
    todos.push({
      id: `keine-bestaetigung:${orderId}`, orderIds: [orderId], art: 'keine_bestaetigung', bereich: 'laden', ton: tonNachAlter(tage, 0, FRISTEN.bestaetigung[1]), alterTage: tage,
      titel: `AB fehlt – beim Lieferanten nachfassen: ${z.orderName} ${kundeVon(z)}`,
      kontext: [lieferanten.map(l => k.lieferantName(l)).join(', '), wasKurz(positionen), `bestellt vor ${werktage} Werktagen`, 'keine Auftragsbestätigung'].filter(Boolean).join(' · '),
      knopf: { text: 'Ansehen', href: vorgangsLink('einkauf', { auftrag: orderId, af: 'bestellt' }) },
    });
  }
  for (const [orderId, positionen] of angefragt) {
    const z = positionen[0].z;
    const stand = positionen.map(x => lieferantenStand(x.eintrag, { jetzt: k.jetzt }));
    const nachfassen = stand.some(st => st.nachfassen);
    const anfragen = [...new Set(positionen.map(x => x.eintrag.beschaffung.anfrage.lieferant).filter(Boolean))];
    todos.push({
      id: `anfrage:${orderId}`, orderIds: [orderId], art: 'anfrage', bereich: 'laden', ton: nachfassen ? 'warn' : '', alterTage: Math.max(...stand.map(st => st.werktage ?? 0)),
      titel: `${nachfassen ? 'Anfrage nachfassen' : 'Lieferant angefragt, Antwort offen'}: ${z.orderName} ${kundeVon(z)}`,
      kontext: [anfragen.join(', '), wasKurz(positionen), `angefragt am ${positionen.map(x => x.eintrag.beschaffung.anfrage.am).sort()[0].split('-').reverse().join('.')}`].filter(Boolean).join(' · '),
      knopf: { text: 'Ansehen', href: vorgangsLink('einkauf', { auftrag: orderId }) },
    });
  }
  for (const [orderId, positionen] of abAbweichung) {
    const z = positionen[0].z;
    todos.push({
      id: `ab-abweichung:${orderId}`, orderIds: [orderId], art: 'ab_abweichung', bereich: 'laden', ton: 'warn', alterTage: tageSeit(positionen[0].eintrag.beschaffung.ab.geprueftAm, k.jetzt),
      titel: `AB weicht ab – mit dem Lieferanten klären: ${z.orderName} ${kundeVon(z)}`,
      kontext: [wasKurz(positionen), ...positionen.map(x => beschaffungText(x.eintrag))].filter(Boolean).join(' · '),
      knopf: { text: 'Ansehen', href: vorgangsLink('einkauf', { auftrag: orderId, af: 'bestellt' }) },
    });
  }
  for (const [orderId, positionen] of gesperrt) {
    const z = positionen[0].z;
    todos.push({
      id: `muster-gesperrt:${orderId}`, orderIds: [orderId], musterSchluessel: musterSchluesselVon(positionen), art: 'muster_gesperrt', bereich: 'laden', ton: 'crit', alterBezug: 'kunde',
      alterTage: Math.max(...positionen.map(x => x.seitBestellung ?? 0)),
      titel: `Muster nicht lieferbar, Kunde informieren: ${z.orderName} ${kundeVon(z)}`,
      kontext: [musterKurz(positionen), 'weiter in der Packstation unter „Zu klären“'].join(' · '),
      knopf: { text: 'Ansehen', href: kundenLink(z) },
    });
  }
  for (const [orderId, positionen] of eigeneMuster) {
    const z = positionen[0].z;
    // Gemischt: die Lagermuster gehen mit den Lieferanten-Mustern raus - solange die ausstehen,
    // gar nicht, danach im To-do "rausgeben" (sonst stuende dieselbe Sendung zweimal da).
    if (wartenAufLieferant.has(orderId)) continue;
    const tage = Math.max(...positionen.map(x => x.seitBestellung ?? 0));
    const vorbei = positionen.every(x => x.p.musterHerkunft === 'eigen_vorbei');
    todos.push({
      id: `muster-eigen:${orderId}`, orderIds: [orderId], art: 'muster_eigen', bereich: 'laden', ton: tonNachAlter(tage, ...FRISTEN.bestellen), alterTage: tage,
      titel: vorbei ? `Muster vorbeibringen bei ${kundeVon(z)}` : `Muster verschicken an ${kundeVon(z)}`,
      kontext: [ortVon(z), z.orderName, musterKurz(positionen), musterHerkunftText(positionen.map(x => x.p)) || 'aus eigenem Bestand'].filter(Boolean).join(' · '),
      // Nur persoenliche Uebergabe belegt Empfang; Versand oeffnet den bestehenden Versanddialog.
      // Nur wenn ALLE Muster der Bestellung aus dem eigenen Bestand kommen - sonst stuende
      // "Kunde hat Muster" da, obwohl andere Muster noch beim Lieferanten liegen: dann in die Akte.
      knopf: (z.auftrag?.positionen || []).filter(p => p.istMuster).every(musterEigen)
        ? { text: vorbei ? 'Erledigt – Kunde hat Muster' : 'Muster sind verschickt…', schritt: { orderId, aktion: vorbei ? 'kunde_hat_muster' : 'raus' }, href: kundenLink(z) }
        : { text: 'Ansehen', href: kundenLink(z) },
    });
  }
  // Steht statt unter "bestellen": erst der Grund muss weg, sonst bestellt auch die Automatik nicht.
  for (const [grund, positionen] of haengend) {
    const werktage = Math.max(...positionen.map(x => x.werktage));
    todos.push({
      id: `muster-klaeren:${grund}`, orderIds: orderIdsVon(positionen), musterSchluessel: musterSchluesselVon(positionen), art: 'muster_klaeren', bereich: 'laden', ton: 'crit',
      alterTage: Math.max(...positionen.map(x => tageSeit(x.seit, k.jetzt) ?? 0)),
      titel: `${positionen.length === 1 ? '1 Muster hängt' : `${positionen.length} Muster hängen`}: ${grund}`,
      kontext: [kundenKurz(positionen), musterKurz(positionen), `seit ${mehrzahl(werktage, 'Werktag', 'Werktagen')} nicht automatisch bestellt`].join(' · '),
      knopf: { text: 'Ansehen', href: '#/kunden?tab=bestellungen&bart=muster' },
    });
  }
  for (const [lieferant, positionen] of nachhaken) {
    const tage = Math.max(...positionen.map(x => x.tage));
    todos.push({
      id: `nachhaken:${lieferant}`, orderIds: orderIdsVon(positionen), art: 'nachhaken', bereich: 'laden',
      ton: positionen.some(x => x.ampel.stufe === 'rot') ? 'crit' : 'warn', alterTage: tage, alterBezug: 'lieferant',
      // Die Tage stehen einmal, in der Marke ("17 Tage beim Lieferanten"); vorher auch im Titel.
      titel: `Beim Lieferanten nachfragen: ${artWort(positionen)} bestellt, noch nicht da`,
      kontext: [k.lieferantName(lieferant), kundenKurz(positionen), wasKurz(positionen)].join(' · '),
      knopf: { text: 'Nachfragen', href: '#/einkauf?ab=verzug' },
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

/**
 * Rueckrufwuensche ohne Bestellung (Musterberatung im Warenkorb): die Schleife ueber die
 * Bestellungen sieht sie nie. Gleiche Faelligkeit und Fristen wie ein Rueckruf an einer
 * Bestellung; das Alter zaehlt ab dem Mail-Eingang.
 */
function ausMailRueckrufen(quellen, k) {
  return (quellen.rueckrufe || [])
    .filter(r => r.quelle === 'mail' && rueckrufFaellig(r, k.heute))
    .map(r => {
      const tage = tageSeit(r.datum, k.jetzt);
      const anzahl = (r.muster || []).length;
      return {
        id: `rueckruf:${r.orderId}`, art: 'rueckruf', bereich: 'laden',
        ton: tonNachAlter(tage, ...FRISTEN.rueckruf), alterTage: tage,
        titel: `Zurückrufen: ${r.kundenname && r.kundenname !== '–' ? r.kundenname : 'Kunde'}`,
        kontext: [r.thema || 'Musterberatung', anzahl ? `${anzahl} Muster angefragt` : null,
          tage === null ? null : `eingegangen ${vorText(tage)}`,
          r.anfragen > 1 ? `${r.anfragen}× angefragt` : null,
          r.status === 'nicht_erreicht' ? 'zuletzt nicht erreicht' : null,
          r.telefon ? null : r.email ? 'keine Telefonnummer, per Mail antworten' : 'keine Telefonnummer'].filter(Boolean).join(' · '),
        knopf: { text: 'Zurückrufen', href: vorgangsLink('kunden', { auftrag: r.orderId, tab: 'rueckrufe' }) },
      };
    });
}

/**
 * Offene Service-Anfragen bleiben bis zum Abschluss sichtbar. Nur fuer den Erstkontakt gelten
 * die bestehenden Altersfristen; kontaktiert/Termin/Angebot ist ohne Wiedervorlage kein Verzug.
 */
function ausServiceanfragen(quellen, jetzt) {
  return (quellen.serviceanfragen || [])
    .filter(serviceOffen)
    .map(e => {
      const tage = tageSeit(e.erstelltAm || (e.datum ? `${e.datum}T00:00:00` : null), jetzt);
      const wer = [e.name, e.plz].filter(Boolean).join(', ') || e.telefon || e.email || 'ohne Namen';
      const neu = e.status === 'neu';
      return {
        id: `service:${e.id}`, art: 'service', bereich: 'laden', ton: neu ? tonNachAlter(tage, ...FRISTEN.service) : '', alterTage: tage,
        titel: neu ? `Bei ${wer} melden: neue Anfrage ${LEISTUNG_LABEL[e.leistung] || 'Service'}` : `${wer}: ${e.naechsterSchritt || 'Nächsten Schritt klären'}`,
        kontext: [neu ? null : `${LEISTUNG_LABEL[e.leistung] || 'Service'} · ${STATUS_LABEL[e.status]}`, QUELLE_LABEL[e.quelle] || null, e.herkunft || null, tage === null ? null : `eingegangen ${vorText(tage)}`,
          e.telefon ? null : (e.email ? 'nur E-Mail' : null)].filter(Boolean).join(' · '),
        knopf: { text: 'Anfrage öffnen', href: serviceLink(e.id) },
      };
    });
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
  // Dieselbe Zuteilung wie der Zaehler "Entscheidungen" (#1804): liegt die Entscheidung bei
  // jemand anderem, ist sie kein "wartet auf deine Entscheidung" - sonst widersprechen sich beide.
  const deine = new Set(entscheidungsGruppen(quellen.freigaben || []).fuerDich);
  return (quellen.freigaben || [])
    .filter(t => t.open !== false && ((t.status === 'freigabe' && deine.has(t)) || (t.status === 'review' && (!t.reviewer || t.reviewer === 'mensch'))))
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
      titel: 'Shop-Kontrolle meldet sich nicht',
      kontext: `letzte Prüfung vor ${Math.floor(stunden)} Stunden – sie läuft sonst stündlich`,
      knopf: { text: 'Prüfen', href: '#/shopwache' },
    }];
  }
  if (!['rot', 'gelb'].includes(d.ampel)) return [];
  const befunde = d.befunde || [];
  return [{
    id: 'shopwache', art: 'shopwache', bereich: 'website', ton: d.ampel === 'rot' ? 'crit' : 'warn', alterTage: tageSeit(d.geprueftAm, jetzt),
    titel: d.ampel === 'rot' ? 'Shop-Kontrolle: der Shop hat ein Problem' : 'Shop-Kontrolle meldet Auffälligkeiten',
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

/**
 * Freier Speicher am Mac mini (operations/lib/speicher.mjs, gemessen von der Shop-Wache):
 * gelb unter 40 GiB, rot unter 20 GiB. Ist die Platte voll, stehen Sync, Sicherung und
 * Monteur-Upload gleichzeitig still. Text an einer Stelle: To-do und Shop-Kontrolle sagen dasselbe.
 */
export function speicherHinweis(stand) {
  if (!stand || !['gelb', 'rot'].includes(stand.ampel) || !Number.isFinite(stand.freiGiB)) return null;
  return {
    ton: stand.ampel === 'rot' ? 'crit' : 'warn',
    titel: stand.ampel === 'rot' ? 'Mac mini: Speicher fast voll' : 'Mac mini: Speicher wird knapp',
    text: `nur noch ${stand.freiGiB} GiB frei (${stand.belegtProzent} % belegt)`,
    // Aufraeumen hat der Inhaber am 28.10. an Claude gegeben (Werkbank w-170) - eine "Rueckfrage" gibt es nicht mehr.
    handlung: 'Ist die Platte voll, stehen Datenabgleich, Sicherung und Foto-Upload still. Claude Bescheid geben: „Speicher aufräumen“ – Claude lagert nur aus, was sich wiederherstellen lässt.',
  };
}

function ausSpeicher(quellen, jetzt) {
  const h = speicherHinweis(quellen.shopwache?.speicher);
  if (!h) return [];
  return [{
    id: 'speicher', art: 'speicher', bereich: 'website', ton: h.ton, alterTage: tageSeit(quellen.shopwache.speicher.gemessenAm, jetzt),
    titel: h.titel, kontext: `${h.text} · ${h.handlung}`,
    knopf: { text: 'Ansehen', href: '#/shopwache' },
  }];
}

/** Der Monatslauf versucht es am 1., 2. und 3.; ab 35 Tagen ohne Erfolg ist er ausgefallen. */
export const GOOGLE_BEWERTUNG_STUMM_TAGE = 35;
const GOOGLE_PROFIL = 'https://maps.google.com/?cid=787042219843486388';

/**
 * Google-Bewertung im Shop (scripts/google-bewertung.mjs). Kommt mit der Shop-Wache
 * (quellen.shopwache.googleBewertung). Der Shop zeigt dann weiter den letzten Wert: nichts ist
 * falsch beschriftet, aber die Zahl altert, und in der Inhaber-Sicht steht nur Rotes.
 * Rot ist darum, was allein nicht mehr heilt: ein auffaelliger Wert (ein Mensch muss nachsehen)
 * und ein Monat ohne Erfolg (genau so war die Zahl von Hand veraltet). Ein einzelner gescheiterter
 * Abruf bleibt Bernstein, der Lauf versucht es am 1., 2. und 3. selbst noch einmal.
 */
function ausGoogleBewertung(quellen, jetzt) {
  const d = quellen.shopwache?.googleBewertung;
  if (!d?.geprueftAm) return [];
  const basis = { id: 'google-bewertung', art: 'google-bewertung', bereich: 'website' };
  const tage = tageSeit(d.letzterErfolg || d.geprueftAm, jetzt);
  const stumm = tage !== null && tage >= GOOGLE_BEWERTUNG_STUMM_TAGE;
  if (d.ampel === 'gelb') {
    return [{ ...basis, ton: 'crit', alterTage: tageSeit(d.geprueftAm, jetzt), titel: 'Google-Bewertung: Wert auffällig, nicht übernommen', kontext: `${d.meldung} · Der Shop zeigt weiter den alten Wert. Bei Google nachsehen; stimmt es, Claude Bescheid geben.`, knopf: { text: 'Bei Google ansehen', href: GOOGLE_PROFIL } }];
  }
  if (d.ampel === 'rot') {
    return [{ ...basis, ton: stumm ? 'crit' : 'warn', alterTage: tageSeit(d.geprueftAm, jetzt), titel: 'Google-Bewertung: Abruf gescheitert', kontext: `${d.meldung} · Der Shop zeigt weiter den alten Wert. Der Lauf versucht es am 1., 2. und 3. des Monats, sonst Claude Bescheid geben.` }];
  }
  if (stumm) {
    return [{ ...basis, ton: 'crit', alterTage: tage, titel: 'Google-Bewertung: Monatslauf meldet sich nicht', kontext: `letzter Erfolg vor ${tage} Tagen – er läuft sonst am Monatsanfang. Claude Bescheid geben.` }];
  }
  return [];
}

/** Die Auslauf-Pruefung laeuft montags; ab 9 Tagen ohne neuen Stand ist sie ausgefallen. */
export const AUSLAUF_STUMM_TAGE = 9;

/**
 * Auslauf-Pruefung (Inhaberregel 2026-10-13: Ausgelaufenes wird nie angezeigt).
 * Kommt mit der Shop-Wache (quellen.shopwache.auslauf). Meldet Befunde, gestoerte
 * Lieferanten und eine Pruefung, die sich nicht mehr meldet - archiviert wird nach Gegenprobe.
 * Farben ohne Handmuster ("ohne-muster", A fuehrt sie "nur in Format") sind kein Auslauf:
 * eigenes To-do, das Muster wird gesperrt, die Ware bleibt.
 * Lieferant I, lange nichts verfuegbar ("nicht-verfuegbar"): ebenfalls eigenes gelbes To-do,
 * denn das ist kein Auslaufbeleg und darf nicht nach "archivieren" klingen.
 * Befund, Ausfall und stumme Pruefung sind je ein eigenes To-do und verdecken sich nicht:
 * nach einem Ausfall beginnen Fristen neu, das darf kein Befund eines anderen Lieferanten
 * unsichtbar machen.
 */
function ausAuslauf(quellen, jetzt) {
  const d = quellen.shopwache?.auslauf;
  if (!d?.geprueftAm) return [];
  const tage = tageSeit(d.geprueftAm, jetzt);
  const basis = { id: 'auslauf', art: 'auslauf', bereich: 'website', alterTage: tage, knopf: { text: 'Lexikon', href: '#/lexikon' } };
  const lexikon = handles => ({ text: 'Im Lexikon', href: `#/lexikon?${new URLSearchParams({ lq: handles[0] || '' })}` });
  const ohneMuster = (d.befunde || []).filter(b => b.ergebnis === 'ohne-muster');
  const muster = ohneMuster.length ? [(() => {
    const handles = [...new Set(ohneMuster.flatMap(b => b.handles || []))];
    const n = ohneMuster.length;
    return {
      ...basis, id: 'auslauf-muster', ton: 'warn', knopf: lexikon(handles),
      titel: `Muster nicht lieferbar: ${n} ${n === 1 ? 'Farbe hat' : 'Farben haben'} beim Lieferanten kein Handmuster`,
      kontext: [
        ohneMuster.slice(0, 3).map(b => b.kennung).filter(Boolean).join(', '), n > 3 ? `+${n - 3} weitere` : null,
        handles[0] || null, 'Muster im Shop sperren, offene Musterbestellungen prüfen',
      ].filter(Boolean).join(' · '),
    };
  })()] : [];
  const ohneBestand = (d.befunde || []).filter(b => b.ergebnis === 'nicht-verfuegbar');
  if (ohneBestand.length) {
    const handles = [...new Set(ohneBestand.flatMap(b => b.handles || []))];
    const n = ohneBestand.length;
    muster.push({
      ...basis, id: 'auslauf-nicht-verfuegbar', ton: 'warn', knopf: lexikon(handles),
      titel: `${n} Artikel seit mindestens 30 Tagen in keiner Größe verfügbar`,
      kontext: [
        handles.slice(0, 3).join(', '), handles.length > 3 ? `+${handles.length - 3} weitere` : null,
        'kein Auslaufbeleg, beim Lieferanten nachfragen',
      ].filter(Boolean).join(' · '),
    });
  }
  const befunde = (d.befunde || []).filter(b => !['ohne-muster', 'nicht-verfuegbar'].includes(b.ergebnis));
  const weg = befunde.filter(b => b.ergebnis === 'fehlt');
  const todos = [...muster];
  if (befunde.length) {
    const handles = [...new Set(befunde.flatMap(b => b.handles || []))];
    todos.push({
      ...basis, ton: weg.length ? 'crit' : 'warn',
      knopf: lexikon(handles),
      titel: weg.length
        ? `Auslauf: ${weg.length} Artikel beim Lieferanten nicht mehr gefunden`
        : `Auslauf-Prüfung: ${befunde.length} ${befunde.length === 1 ? 'Seite' : 'Seiten'} auffällig`,
      kontext: [
        handles.slice(0, 3).join(', '), handles.length > 3 ? `+${handles.length - 3} weitere` : null,
        'gegenprüfen, dann archivieren; fällt nur eine Variante weg, Freigabe holen (AGENTS.md)',
      ].filter(Boolean).join(' · '),
    });
  }
  if (d.ausfaelle?.length) {
    todos.push({
      ...basis, id: 'auslauf-ausfall', ton: 'warn',
      titel: `Auslauf-Prüfung: Lieferant ${d.ausfaelle.map(a => a.lieferant).join(', ')} nicht prüfbar`,
      kontext: d.ausfaelle.map(a => `${a.lieferant}: ${a.grund}`).join(' · '),
    });
  }
  if (tage !== null && tage >= AUSLAUF_STUMM_TAGE) {
    todos.push({ ...basis, id: 'auslauf-stumm', ton: 'warn', titel: 'Auslauf-Prüfung meldet sich nicht', kontext: `letzter Lauf vor ${tage} Tagen – sie läuft sonst montags` });
  }
  return todos;
}

/**
 * Neuheiten aus der Auslauf-Pruefung: Artikel unserer Linien, die der Lieferant seit dem
 * letzten Lauf neu fuehrt und die nicht im Shop stehen. Anlegen nach Skill produktimport.
 */
function ausNeuheiten(quellen, jetzt) {
  const n = quellen.shopwache?.auslauf?.neuheiten;
  const neu = n?.neu || [];
  if (!neu.length) return [];
  const namen = [...new Set(neu.map(k => k.name.split(/\s{2,}| \d{3}cm/)[0]))];
  return [{
    id: 'neuheiten', art: 'neuheiten', bereich: 'website', ton: '', alterTage: tageSeit(quellen.shopwache.auslauf.geprueftAm, jetzt),
    titel: `Lieferant A: ${neu.length} neue Artikel in unseren Linien`,
    kontext: [namen.slice(0, 3).join(', '), namen.length > 3 ? `+${namen.length - 3} weitere` : null, 'prüfen und anlegen (Skill produktimport)'].filter(Boolean).join(' · '),
  }];
}

/**
 * Ausschreibungen Bodenbelag im Umkreis (woechentlicher Lauf): neue Treffer seit dem
 * letzten Lauf als To-do fuer den Laden (Verlegeauftraege). Bewerben macht der Inhaber.
 */
function ausAusschreibungen(quellen, jetzt) {
  const d = quellen.shopwache?.ausschreibungen;
  const neu = d?.neu || [];
  if (!neu.length) return [];
  const naechste = [...neu].sort((x, y) => String(x.frist || '9').localeCompare(String(y.frist || '9')))[0];
  // Link aus dem Ausschreibungsfeed: nur http(s) wird zum Knopf (heute.mjs setzt ihn als href).
  const link = sichereUrl(naechste.link);
  return [{
    id: 'ausschreibungen', art: 'ausschreibungen', bereich: 'laden', ton: '', alterTage: tageSeit(d.geprueftAm, jetzt),
    titel: `Ausschreibung Bodenbelag: ${neu.length} neu im Umkreis`,
    kontext: [naechste.auftraggeber, naechste.frist ? `Frist ${naechste.frist}` : null, 'prüfen, ob wir anbieten'].filter(Boolean).join(' · '),
    knopf: link ? { text: 'Bekanntmachung', href: link } : undefined,
  }];
}

/**
 * Routinen als Mac-Dienst (operations/lib/routinen.mjs, Inhaber 2026-10-26): Fehlermeldungen,
 * Postfach und die Pruefung des Datenstands laufen per launchd. Gestoert heisst: der letzte Lauf
 * meldete einen Fehler - oder ein eingerichteter Dienst hatte zu lange keinen erfolgreichen Lauf
 * (`stumm`, vom Server mit Zeitfenster berechnet: nie gestartet, haengt, dauernd uebersprungen).
 * Rot, weil es jemand loesen muss (Mails kommen sonst nicht an, Meldungen bleiben liegen).
 * Kommt mit der Shop-Wache (quellen.shopwache.routinen), also nur beim Inhaber.
 */
/**
 * Gestoerte Routinen mit Text und Seit-Zeitpunkt - eine Liste fuer To-do und Shop-Kontrolle, damit
 * beide dieselben Routinen nennen (Rundgang 29.10., A5: das To-do nannte nur die erste und "+3").
 */
export function gestoerteRoutinen(liste = []) {
  return (liste || []).map((r) => {
    if (r.ok === false) return { ...r, text: r.meldung || 'Fehler' };
    if (r.stumm) return { ...r, seit: r.stummSeit || r.seit, text: r.stummText || 'zu lange kein erfolgreicher Lauf' };
    return null;
  }).filter(Boolean);
}

function ausRoutinen(quellen, jetzt) {
  const gestoert = gestoerteRoutinen(quellen.shopwache?.routinen);
  if (!gestoert.length) return [];
  const aeltestes = gestoert.map(r => r.seit).filter(Boolean).sort()[0] || null;
  return [{
    id: 'routinen', art: 'routinen', bereich: 'website', ton: 'crit', alterTage: tageSeit(aeltestes, jetzt),
    titel: gestoert.length === 1 ? `Mac-Dienst gestört: ${gestoert[0].titel}` : `Mac-Dienst: ${gestoert.length} Routinen gestört`,
    kontext: [gestoert[0].text, gestoert.length > 1 ? `außerdem ${gestoert.slice(1).map(r => r.titel).join(', ')}` : null,
      'Claude Bescheid geben: „Mac-Dienst gestört“'].filter(Boolean).join(' · '),
    // Ohne Knopf war das rote To-do eine Sackgasse; die Shop-Kontrolle listet jede gestoerte Routine.
    knopf: { text: 'Ansehen', href: '#/shopwache' },
  }];
}

/** Neue Claude-Version oder Monatsvorschlaege (operations/lib/ki-stand.mjs): gelb, kein Ausfall. */
function ausKiStand(quellen) {
  const r = (quellen.shopwache?.routinen || []).find(x => x.id === 'claude-stand' && x.ok !== false && x.hinweis);
  if (!r) return [];
  return [{ id: 'ki-stand', art: 'routinen', bereich: 'website', ton: 'warn', alterTage: null, titel: 'Claude Code: Neuerungen ansehen',
    kontext: `${r.hinweis} · Claude Bescheid geben: „Claude-Stand“` }];
}

const SICHERUNG_ZEIT = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Betriebsdaten-Sicherung (operations/scripts/sicherung.mjs, taeglich 22:30 Uhr). Den Stand
 * rechnet operations/lib/betriebszustand.mjs (sicherungsstand), er kommt mit der Shop-Wache.
 * Bis 28.10.2026 stand ein verpasster Termin nur in der Datenzeile des Systemzustands - die
 * Luecke vom 22.10. fiel erst bei der Fehlersuche auf. Rot: Lauf gescheitert, Stand nicht
 * lesbar oder seit ueber 48 Std. keine Sicherung; gelb: ein Termin verpasst oder gar kein
 * Stand vorhanden (`fehlt` - die Sicherung lief hier nie).
 */
/**
 * Lage der Tagessicherung fuer To-do und Shop-Kontrolle: { ton, titel, kontext } oder null.
 * Der Text sagt immer, was zu tun ist; das To-do fuehrt zur Shop-Kontrolle (wie "Mac-Dienst gestört").
 */
export function sicherungsLage(s, jetzt = new Date()) {
  if (!s) return null;
  if (s.fehlt) {
    return { ton: 'warn', titel: 'Sicherungsstand fehlt',
      kontext: 'Die tägliche Sicherung hat auf diesem Mac noch keinen Stand geschrieben – läuft sie? Claude Bescheid geben: „Sicherungsstand fehlt“' };
  }
  const fehler = s.letzterFehler;
  if (!fehler && s.status !== 'alt' && s.status !== 'fehler') return null;
  const zuletzt = s.letzterErfolg ? `letzte Sicherung ${SICHERUNG_ZEIT.format(new Date(s.letzterErfolg))}` : 'noch keine erfolgreiche Sicherung';
  const lange = !s.letzterErfolg || jetzt.getTime() - Date.parse(s.letzterErfolg) > 48 * 3600000;
  if (fehler) {
    return { ton: 'crit', titel: 'Sicherung der Betriebsdaten fehlgeschlagen', kontext: [fehler.meldung, zuletzt, 'Claude Bescheid geben: „Sicherung fehlgeschlagen“'].filter(Boolean).join(' · ') };
  }
  if (s.status === 'fehler') {
    return { ton: 'crit', titel: 'Stand der Sicherung nicht lesbar', kontext: 'Claude Bescheid geben: „Sicherungsstand nicht lesbar“' };
  }
  return {
    ton: lange ? 'crit' : 'warn',
    titel: 'Sicherung der Betriebsdaten überfällig',
    kontext: `${zuletzt} · sie läuft täglich um 22:30 Uhr, wenn der Mac an ist · Mac über Nacht anlassen; kommt sie trotzdem nicht, Claude Bescheid geben: „Sicherung überfällig“`,
  };
}

function ausSicherung(quellen, jetzt) {
  const s = quellen.shopwache?.sicherung;
  const lage = sicherungsLage(s, jetzt);
  if (!lage) return [];
  return [{ id: 'sicherung', art: 'sicherung', bereich: 'website', alterTage: s.fehlt ? null : tageSeit(s.letzterErfolg, jetzt), ...lage,
    knopf: { text: 'Ansehen', href: '#/shopwache' } }];
}

/**
 * Verschluesselte Kopie der Sicherung in der Dropbox (operations/lib/betriebszustand.mjs,
 * ausserHausStand). Kein Stand heisst: hier nicht eingerichtet, dann still.
 */
function ausSicherungAusserHaus(quellen, jetzt) {
  const s = quellen.shopwache?.sicherungAusserHaus;
  if (!s) return [];
  const fehler = s.letzterFehler;
  if (!fehler && s.status !== 'alt' && s.status !== 'fehler') return [];
  const zuletzt = s.letzterErfolg ? `letzte Kopie ${SICHERUNG_ZEIT.format(new Date(s.letzterErfolg))}` : 'noch keine erfolgreiche Kopie';
  return [{
    id: 'sicherung-ausser-haus', art: 'sicherung', bereich: 'website', alterTage: tageSeit(s.letzterErfolg, jetzt), ton: 'crit',
    titel: 'Sicherungskopie in der Dropbox fehlt',
    kontext: [fehler?.meldung, zuletzt, 'Claude Bescheid geben: „Sicherung außer Haus prüfen“'].filter(Boolean).join(' · '),
  }];
}

/**
 * Akquise Verlegeauftraege (#1447): faellige Wiedervorlagen als ein To-do im Buero.
 * `quellen.akquise` = Liste der faelligen Firmen (lib/akquise.mjs faelligeWiedervorlagen).
 */
function ausAkquise(quellen) {
  const f = quellen.akquise || [];
  if (!f.length) return [];
  return [{
    id: 'akquise', art: 'akquise', bereich: 'buero', ton: 'warn', alterTage: null,
    titel: `Genossenschaften: ${f.length} ${f.length === 1 ? 'Firma' : 'Firmen'} nachfassen`,
    kontext: [f.slice(0, 3).map(x => x.name).join(', '), f.length > 3 ? `+${f.length - 3} weitere` : null].filter(Boolean).join(' · '),
    knopf: { text: 'Ansehen', href: '#/akquise?as=faellig' },
  }];
}

/**
 * Hausverwaltungen (w-154): faellige Wiedervorlagen als ein To-do im Buero.
 * `quellen.hausverwaltungen` = Liste der faelligen Verwaltungen (lib/hausverwaltungen.mjs hvFaellig).
 */
function ausHausverwaltungen(quellen) {
  const v = quellen.hausverwaltungen || [];
  if (!v.length) return [];
  return [{
    id: 'hausverwaltungen', art: 'hausverwaltungen', bereich: 'buero', ton: 'warn', alterTage: null,
    titel: `Hausverwaltungen: ${v.length} wieder melden`,
    kontext: [v.slice(0, 3).map(x => x.name).join(', '), v.length > 3 ? `+${v.length - 3} weitere` : null].filter(Boolean).join(' · '),
    knopf: { text: 'Ansehen', href: v.length === 1 ? `#/hausverwaltungen?hv=${encodeURIComponent(v[0].id)}` : '#/hausverwaltungen' },
  }];
}

/**
 * Termin beim Kunden morgen (Einkauf "Je Auftrag", Feld "Termin"): am Vortag ein To-do im Laden
 * mit fertigem Erinnerungstext zum Kopieren. `quellen.kundentermine` = [{ orderId, auftragName, kundeName, termin }].
 */
function ausKundenterminen(quellen, k) {
  const d = new Date(`${k.heute}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
  const morgen = d.toISOString().slice(0, 10);
  return (quellen.kundentermine || []).filter(t => t.termin === morgen).map(t => ({
    id: `kundentermin:${t.orderId}`, art: 'kundentermin', bereich: 'laden', ton: 'warn', alterTage: null,
    titel: `Kunde an Termin morgen erinnern: ${t.auftragName || t.orderId}`,
    kontext: [t.kundeName, 'Text kopieren, per Mail oder WhatsApp schicken'].filter(Boolean).join(' · '),
    knopf: { text: 'Text kopieren', kopiertext: kundenErinnerung({ auftragName: t.auftragName || '', kundeName: t.kundeName, termin: t.termin }) },
  }));
}

/** Alle ableitbaren To-dos, unsortiert und ohne Blick auf die Rolle. */
function alleTodos(quellen, opt) {
  const k = kontext(quellen, opt);
  return [
    ...ausBestellungen(quellen, k),
    ...ausFaellen(quellen),
    ...ausMailRueckrufen(quellen, k),
    ...ausServiceanfragen(quellen, k.jetzt),
    ...ausAufgaben(quellen, { ich: opt.ich, jetzt: k.jetzt }),
    ...ausFreigaben(quellen, k.jetzt),
    ...ausShopwache(quellen, k.jetzt),
    ...ausAuslauf(quellen, k.jetzt),
    ...ausGoogleBewertung(quellen, k.jetzt),
    ...ausNeuheiten(quellen, k.jetzt),
    ...ausAusschreibungen(quellen, k.jetzt),
    ...ausAkquise(quellen),
    ...ausHausverwaltungen(quellen),
    ...ausKundenterminen(quellen, k),
    ...ausTailscale(quellen),
    ...ausSpeicher(quellen, k.jetzt),
    ...ausRoutinen(quellen, k.jetzt),
    ...ausKiStand(quellen),
    ...ausSicherung(quellen, k.jetzt),
    ...ausSicherungAusserHaus(quellen, k.jetzt),
  ];
}

function fuerSicht(todos, sicht, alle) {
  const meins = t => alle || t.fuerMich !== false;
  if (sicht === 'laden') return todos.filter(t => t.bereich === 'laden' && meins(t));
  if (sicht === 'website') return todos.filter(t => t.bereich === 'website' && meins(t));
  if (sicht === 'alles') return todos.filter(meins);
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
 *   serviceanfragen /api/kunden/serviceanfragen -> eintraege
 *   aufgaben       /api/org/liste?bereich=alle-aufgaben -> eintraege
 *   freigaben      Entwicklungsaufgaben (issues.json), nur beim Inhaber gefuellt
 *   akquise        faellige Wiedervorlagen (ansichten/akquise.mjs akquiseFaellig), nur beim Inhaber
 *   hausverwaltungen faellige Wiedervorlagen (ansichten/hausverwaltungen.mjs hausverwaltungenFaellig)
 *   shopwache      /api/shopwache/status, nur beim Inhaber gefuellt (mit `auslauf`, `routinen`)
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

/** Zahlen fuer die Sicht-Chips des Inhabers: was liegt im Laden, was bei der Website, alles - bei wem auch immer. */
export function zaehleTodos(quellen = {}, opt = {}) {
  const todos = alleTodos(quellen, opt);
  return { laden: fuerSicht(todos, 'laden', true).length, website: fuerSicht(todos, 'website', true).length, alles: fuerSicht(todos, 'alles', true).length };
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
