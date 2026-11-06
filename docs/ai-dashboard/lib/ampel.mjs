/**
 * Ampel im Control Center (Benutzer 06.11.2026: "farbig gestalten fuer einzelne Produkte nach
 * Ampelsystem, um mehr Uebersicht zu haben"). Eine Regel je Thema fuer alle Ansichten, ohne DOM:
 * laeuft im Browser, im Server (Lexikon-Liste) und im Test. Die Darstellung (Plakette, linker
 * Farbrand) baut bausteine/ampel.mjs.
 *
 *   rot   = etwas haelt eine Bestellung oder einen Kunden auf
 *   gelb  = es ist etwas zu tun, aber nichts steht still
 *   null  = ruhig: keine Farbe, keine Flaeche (Skill control-center: nur Abweichungen zeigen)
 *
 * Farbe steht nie allein: jede Stufe hat ein Zeichen und ein Wort, damit sie am Handy ohne
 * Tooltip und bei Rot-Gruen-Schwaeche lesbar bleibt.
 */
import { kalendertage, kalendertag } from './kalendertage.mjs';

export const ZEICHEN = Object.freeze({ rot: '×', gelb: '!', ruhig: '✓' });

/** Die aelteren Einkaufsansichten rechnen mit 'crit'/'warn' (CSS-Klassen, Kacheln). */
export const TON = Object.freeze({ rot: 'crit', gelb: 'warn' });

const RANG = { rot: 2, gelb: 1 };

/** Die dringendere von zwei Stufen ('rot' vor 'gelb' vor null). */
export function dringender(a, b) {
  return (RANG[b] || 0) > (RANG[a] || 0) ? b : (a || null);
}

/** Von zwei Ampel-Ergebnissen ({ stufe, tage }) das dringendere; bei gleicher Stufe das laengere Warten. */
export function dringendereAmpel(a, b) {
  if (!a?.stufe) return b?.stufe ? b : (a || b || null);
  if (!b?.stufe) return a;
  const r = (RANG[b.stufe] || 0) - (RANG[a.stufe] || 0);
  if (r) return r > 0 ? b : a;
  return (b.tage ?? -1) > (a.tage ?? -1) ? b : a;
}

// ---------------------------------------------------------------------------
// Wartestand bestellter Positionen (Einkauf "Je Lieferant", "Je Auftrag", To-dos auf "Heute")
// ---------------------------------------------------------------------------

/**
 * Gelb ab 7, rot ab 14 Tagen - die eine Schwelle fuer alle Ansichten. Gezaehlt in Kalendertagen
 * (Berlin, lib/kalendertage.mjs): so zaehlt der Inhaber ("vom 19.10. bis 28.10. sind 9 Tage",
 * 28.10.), so steht das Datum auf der Bestellung, und 14 Kalendertage sind in einer normalen
 * Woche die 10 Werktage, ab denen der Inhaber am 20.10. nachfragen wollte. In Werktagen hiesse
 * "rot ab 14" fast drei Wochen.
 */
export const WARTESCHWELLEN = Object.freeze({ nachhakenTage: 7, problemTage: 14 });

/** 'rot' ab problemTage, 'gelb' ab nachhakenTage, sonst null. */
export function warteStufe(tage, schwellen = WARTESCHWELLEN) {
  if (tage === null || tage === undefined) return null;
  if (tage >= schwellen.problemTage) return 'rot';
  if (tage >= schwellen.nachhakenTage) return 'gelb';
  return null;
}

/**
 * Ampel einer Position im Einkauf.
 *   gesperrt   Muster, das der Lieferant nicht liefern kann (Mustersperre) - rot
 *   blockiert  Bestellangaben fehlen (Artikelnummer, Menge) - rot
 *   termin     bestaetigter Liefertermin ueberschritten - rot, egal wie lange bestellt
 *   wartet     bestellt bzw. bei uns eingetroffen seit `tage` Tagen - gelb/rot nach Schwelle
 *   imPlan     bestaetigter Liefertermin liegt noch vor uns - ruhig
 * `tage`: seit dem Termin (termin), sonst seit "bestellt" bzw. "geliefert"; null = wartet nicht.
 */
export function warteAmpel(eintrag, { jetzt = Date.now(), schwellen = WARTESCHWELLEN, blockiert = false, gesperrt = false } = {}) {
  const status = eintrag?.status || null;
  const termin = status === 'bestellt' && typeof eintrag?.beschaffung?.liefertermin === 'string' ? eintrag.beschaffung.liefertermin : null;
  let tage = null, grund = null, stufe = null;
  if (termin) {
    if (termin < kalendertag(jetzt)) { tage = kalendertage(`${termin}T12:00:00Z`, jetzt); grund = 'termin'; stufe = 'rot'; }
    else grund = 'imPlan';
  } else {
    const seit = status === 'bestellt' ? eintrag.bestelltAm : status === 'geliefert' ? eintrag.geliefertAm : null;
    tage = seit ? kalendertage(seit, jetzt) : null;
    stufe = warteStufe(tage, schwellen);
    if (tage !== null) grund = 'wartet';
  }
  if (blockiert) return { stufe: 'rot', grund: 'blockiert', tage, termin };
  if (gesperrt) return { stufe: 'rot', grund: 'gesperrt', tage, termin };
  return { stufe, grund, tage, termin };
}

const tageText = n => (n === 0 ? 'heute' : n === 1 ? '1 Tag' : `${n} Tage`);
const datumDe = iso => String(iso || '').slice(0, 10).split('-').reverse().join('.');
const datumKurz = iso => { const [, m, t] = String(iso || '').slice(0, 10).split('-'); return t && m ? `${t}.${m}.` : ''; };

/** Wort fuer die Plakette einer Position: "Überfällig · 15 Tage", "Nachhaken · 9 Tage", "Blockiert" … */
export function warteWort(a) {
  if (!a) return '';
  if (a.grund === 'blockiert') return 'Blockiert';
  if (a.grund === 'gesperrt') return 'Gesperrt';
  if (a.grund === 'termin') return `Termin ${datumKurz(a.termin)} vorbei`;
  if (a.tage === null || a.tage === undefined) return '';
  if (a.stufe === 'rot') return `Überfällig · ${tageText(a.tage)}`;
  if (a.stufe === 'gelb') return `Nachhaken · ${tageText(a.tage)}`;
  return tageText(a.tage);
}

/** Langtext fuer den Tooltip (nur Zusatz - das Wort auf der Plakette reicht allein). */
export function warteTitel(a) {
  if (!a) return '';
  if (a.grund === 'blockiert') return 'Bestellangaben fehlen – so kann nicht bestellt werden';
  if (a.grund === 'gesperrt') return 'Der Lieferant kann dieses Muster nicht liefern – Kunde informieren';
  if (a.grund === 'termin') return `Bestätigter Liefertermin ${datumDe(a.termin)} ist überschritten`;
  if (a.stufe === 'rot') return `Seit ${tageText(a.tage)} – ab ${WARTESCHWELLEN.problemTage} Tagen überfällig`;
  if (a.stufe === 'gelb') return `Seit ${tageText(a.tage)} – ab ${WARTESCHWELLEN.nachhakenTage} Tagen beim Lieferanten nachhaken`;
  return '';
}

// ---------------------------------------------------------------------------
// Lexikon: Bestellbarkeit je Produkt
// ---------------------------------------------------------------------------

const MUSTER_SKU = /^(M-|TP-MUSTER)/i;
const OHNE_EINKAUF = new Set(['Musterservice', 'Service', 'Geschenkgutschein']);

/**
 * Bekommt das Produkt eine Bestellampel? Nur aktive Ware, die wir beim Lieferanten bestellen.
 * Ohne Ampel bleiben Musterprodukte, Service, Gutscheine und eigener Bestand (Sonderposten,
 * Restrollen mit Tag "sonderposten"): dort gibt es keine Lieferantenbestellung, die fehlende
 * Artikelnummer haelt also nichts auf.
 */
export function hatBestellampel(p) {
  if (!p || String(p.status || '').toUpperCase() !== 'ACTIVE') return false;
  const h = String(p.handle || '');
  if (/^(muster-|test-)/.test(h) || /-sonderposten$/.test(h)) return false;
  if (OHNE_EINKAUF.has(p.produktgruppe)) return false;
  const r = p.musterRegeln || {};
  return !(r.geschenkgutschein || (r.tags || []).includes('sonderposten'));
}

/**
 * Varianten, die wir wirklich beim Lieferanten bestellen: ohne Mustervarianten und ohne
 * Wunschmass (wird erst beim Zuschnitt bestellt, hat deshalb keine eigene Artikelnummer -
 * die Produktseite sagt dort ausdruecklich "keine fehlende Angabe").
 */
export function bestellVarianten(p) {
  return (p?.varianten || []).filter(v => !v.original && !v.wunschmass && !MUSTER_SKU.test(String(v.sku || '')));
}

const aufzaehlung = w => (w.length <= 1 ? w.join('') : `${w.slice(0, -1).join(', ')} und ${w.at(-1)}`);
const gross = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "2 von 14 Farben nicht lieferbar" - nach Farben, wo es Farben gibt, sonst nach Varianten. */
function teilweiseText(echte) {
  const farben = new Map();
  for (const v of echte) if (v.farbe) farben.set(v.farbe, [...(farben.get(v.farbe) || []), v]);
  if (farben.size > 1 && echte.every(v => v.farbe)) {
    const weg = [...farben.values()].filter(vs => !vs.some(v => v.verfuegbar === true)).length;
    if (weg) return `${weg} von ${farben.size} Farben nicht lieferbar`;
  }
  const weg = echte.filter(v => v.verfuegbar === false).length;
  return `${weg} von ${echte.length} Varianten nicht lieferbar`;
}

/**
 * Bestellbarkeit eines Lexikon-Produkts.
 *   rot   Lieferant, Artikelnummer (bzw. Bestellbezeichnung) oder Bestelleinheit fehlt an einer
 *         Variante - oder keine Variante ist lieferbar
 *   gelb  einzelne Farben nicht lieferbar, oder kein Raumbild. Das Raumbild ist bei vielen
 *         Produkten nur unsicher erfasst; deshalb nie rot und nur bei `raumbild === false`.
 * Blosse Nachtragsangaben (Link, Farbnummer, Produktname) zaehlen nicht.
 * @param {object} p         Produkt aus lexikon/produkte.json
 * @param {object} [opt]
 * @param {boolean|null} [opt.raumbild]  true = Raumbild da, false = sicher keins, null = unbekannt
 * @returns {{stufe:'rot'|'gelb'|null, wort:string, text:string, gruende:string[]}|null}  null = keine Ampel
 */
export function bestellbarkeit(p, { raumbild = null } = {}) {
  if (!hatBestellampel(p)) return null;
  const echte = bestellVarianten(p);
  const rot = [], gelb = [];
  const fehlt = { Lieferant: 0, Artikelnummer: 0, Bestelleinheit: 0 };
  let betroffen = 0;
  for (const v of echte) {
    const e = v.einkauf || {};
    const lieferant = !e.lieferant, artikel = !e.artikelnummer && !e.produktname, einheit = !e.bestelleinheit;
    if (lieferant) fehlt.Lieferant += 1;
    if (artikel) fehlt.Artikelnummer += 1;
    if (einheit) fehlt.Bestelleinheit += 1;
    if (lieferant || artikel || einheit) betroffen += 1;
  }
  if (betroffen) {
    const namen = Object.keys(fehlt).filter(k => fehlt[k]);
    rot.push(`${aufzaehlung(namen)} ${namen.length === 1 ? 'fehlt' : 'fehlen'}${betroffen < echte.length ? ` bei ${betroffen} von ${echte.length} Varianten` : ''}`);
  }
  if (echte.length && !echte.some(v => v.verfuegbar === true)) rot.push('nicht lieferbar');
  else if (echte.some(v => v.verfuegbar === false)) gelb.push(teilweiseText(echte));
  if (raumbild === false) gelb.push('kein Raumbild');
  const stufe = rot.length ? 'rot' : gelb.length ? 'gelb' : null;
  const gruende = [...rot, ...gelb].map(gross);
  // Das Wort der Plakette sagt die Art, der Text die Einzelheit ("! Teilweise lieferbar ·
  // 3 von 8 Varianten nicht lieferbar"). Fehlt nur das Raumbild, ist das Wort schon alles.
  const nurRaumbild = stufe === 'gelb' && gelb.length === 1 && raumbild === false;
  return {
    stufe,
    wort: stufe === 'rot' ? 'Blockiert' : nurRaumbild ? 'Kein Raumbild' : stufe === 'gelb' ? 'Teilweise lieferbar' : 'Bestellbar',
    text: nurRaumbild ? '' : (stufe === 'rot' ? rot : gelb).map(gross).join(' · '),
    gruende,
  };
}

/** Kopfzahlen fuer die Lexikon-Liste: nur Produkte mit Ampel. */
export function zaehleAmpeln(ergebnisse) {
  const z = { rot: 0, gelb: 0, ruhig: 0 };
  for (const a of ergebnisse) if (a) z[a.stufe || 'ruhig'] += 1;
  return z;
}

// ---------------------------------------------------------------------------
// Musterlager je Eintrag
// ---------------------------------------------------------------------------

/**
 * Musterlager: leer oder aufgebraucht ist rot, knapp ist gelb, sonst ruhig.
 * "Knapp" heisst wie bisher (operations/lib/musterlager.mjs, KNAPP_AB): beim Zuschnitt
 * (Probestueck, Bahn, Verlegerest) reicht es noch fuer hoechstens `knappAb` A5-Muster - dann
 * lohnt ein neues Probestueck. Einzelmuster werden nicht auf Vorrat nachbestellt (Inhaber
 * 15.10.); dort ist nur knapp, wenn alles, was noch da ist, schon fuer Bestellungen zurueckliegt.
 * @param {object} b
 * @param {boolean} b.leer         von Hand auf "Ist leer" gesetzt
 * @param {boolean} b.zaehlbar     Einzelmuster (jedes verschickte zaehlt ab)
 * @param {number} [b.nochDa]      Einzelmuster: physisch noch da
 * @param {number} [b.frei]        Einzelmuster: noch nicht zurueckgelegt
 * @param {number|null} [b.reichtNoch]  Zuschnitt: geschaetzte A5-Muster
 * @param {number} [b.knappAb]
 */
export function musterlagerAmpel({ leer = false, zaehlbar = false, nochDa = 0, frei = nochDa, reichtNoch = null, knappAb = 5 } = {}) {
  if (leer) return { stufe: 'rot', wort: 'Leer' };
  if (zaehlbar) {
    if (nochDa <= 0) return { stufe: 'rot', wort: 'Aufgebraucht' };
    if (frei <= 0) return { stufe: 'gelb', wort: 'Knapp' };
    return { stufe: null, wort: '' };
  }
  if (reichtNoch === null || reichtNoch === undefined) return { stufe: null, wort: '' };
  if (reichtNoch <= 0) return { stufe: 'rot', wort: 'Aufgebraucht' };
  if (reichtNoch <= knappAb) return { stufe: 'gelb', wort: 'Knapp' };
  return { stufe: null, wort: '' };
}

// ---------------------------------------------------------------------------
// Packstation: je Muster im Umschlag und je Umschlag
// ---------------------------------------------------------------------------

const RUHIG = Object.freeze({ stufe: null, grund: null, wort: '', titel: '' });
const werktageText = n => (n === 1 ? '1 Werktag' : `${n} Werktage`);

/**
 * Ampel eines Musters im Umschlag. Gerechnet in lib/muster-packen.mjs mit `jetzt` des Servers.
 *   rot   Gesperrt: das Muster kommt nicht - geht vor allem anderen, auch vor fehlender Zuordnung,
 *         weil dann der Kunde informiert werden muss.
 *         Zuordnung fehlt: kein eindeutiger Aufkleber, so wird der Umschlag nie gepackt.
 *         Beim Lieferanten seit 14 Tagen bestellt oder Liefertermin vorbei (warteAmpel).
 *         Noch nicht bestellt und die Musterautomatik haelt es fest (`haengtWerktage`, gesetzt nach
 *         derselben Regel wie das rote To-do "n Muster haengen" auf Heute, lib/todos.mjs).
 *         Noch nicht bestellt seit `bestellenRotAb` Tagen (`offenTage` seit der Kundenbestellung) - auch
 *         wenn die Musterautomatik pausiert oder ausfaellt. Der Aufrufer reicht die Frist des To-dos
 *         "Muster bei … bestellen" herein (FRISTEN.bestellen in lib/todos.mjs); ohne sie bleibt es gelb.
 *   gelb  Beim Lieferanten seit 7 Tagen bestellt (nachhaken), oder noch nicht bestellt.
 *   ruhig Im Umschlag (abgehakt), angekommen, aus dem Musterlager, bestellt seit weniger als 7 Tagen.
 * Die eigene Packstations-Schwelle "wartet ab 2 Tagen" (#1572) gibt es nicht mehr: dieselben 7/14
 * Tage wie im Einkauf.
 * @param {object} m  Muster aus musterPackliste (stand, abgehakt, gesperrt, fehlt, bestelltAm, liefertermin,
 *                    haengtWerktage, offenTage)
 * @param {{jetzt?: Date|number, schwellen?: object, bestellenRotAb?: number|null}} [opt]
 * @returns {{stufe:'rot'|'gelb'|null, grund:string|null, wort:string, titel:string, tage?:number|null}}
 */
export function packMusterAmpel(m, { jetzt = Date.now(), schwellen = WARTESCHWELLEN, bestellenRotAb = null } = {}) {
  if (!m) return RUHIG;
  if (m.gesperrt) return { stufe: 'rot', grund: 'kommtNicht', wort: 'Kommt nicht', titel: warteTitel({ grund: 'gesperrt' }) };
  if (m.fehlt?.length) return { stufe: 'rot', grund: 'zuordnung', wort: 'Zuordnung fehlt', titel: 'Kein eindeutiger Aufkleber – erst im Lexikon klären, dann packen' };
  if (m.abgehakt || m.stand === 'da' || m.stand === 'lager') return RUHIG;
  if (m.stand === 'bestellt') {
    const a = warteAmpel({ status: 'bestellt', bestelltAm: m.bestelltAm, beschaffung: m.liefertermin ? { liefertermin: m.liefertermin } : null }, { jetzt, schwellen });
    if (!a.stufe) return { ...RUHIG, tage: a.tage };
    return { stufe: a.stufe, grund: a.grund === 'termin' ? 'termin' : a.stufe === 'rot' ? 'ueberfaellig' : 'nachhaken', wort: warteWort(a), titel: warteTitel(a), tage: a.tage };
  }
  if (Number.isInteger(m.haengtWerktage) && m.haengtWerktage > 0) {
    return { stufe: 'rot', grund: 'haengt', wort: `Hängt · ${werktageText(m.haengtWerktage)}`, titel: 'Die Musterautomatik bestellt es nicht – erst den Grund klären' };
  }
  if (Number.isInteger(bestellenRotAb) && Number.isInteger(m.offenTage) && m.offenTage >= bestellenRotAb) {
    return { stufe: 'rot', grund: 'ueberfaellig', wort: `Nicht bestellt · ${tageText(m.offenTage)}`, tage: m.offenTage,
      titel: `Seit ${tageText(m.offenTage)} bezahlt, noch nicht beim Lieferanten bestellt – ab ${bestellenRotAb} Tagen überfällig` };
  }
  return { stufe: 'gelb', grund: 'nichtBestellt', wort: 'Nicht bestellt', titel: 'Noch nicht beim Lieferanten bestellt', ...(Number.isInteger(m.offenTage) ? { tage: m.offenTage } : {}) };
}

/** Bei gleicher Stufe gewinnt der Grund weiter vorn: was den Kunden sicher aufhaelt, vor dem, was nur dauert. */
const PACK_GRUENDE = ['nichtEingetragen', 'versand', 'kommtNicht', 'adresse', 'zuordnung', 'termin', 'ueberfaellig', 'haengt', 'nachhaken', 'nichtBestellt', 'fehltNoch', 'pruefen', 'klaeren'];

/**
 * Ampel eines Umschlags: die dringendste Stufe seiner Muster, dazu was nur den Umschlag betrifft.
 *   rot   Gepackt, aber nie als verschickt eingetragen (Reiter "Gepackt", Altfall oder gescheiterter
 *         Eintrag); roter Versandhinweis zu diesem Umschlag; Lieferadresse unvollstaendig (wie eine
 *         fehlende Musterzuordnung: ohne Adressaufkleber geht der Umschlag nicht raus).
 *   gelb  Alles unter "Zu klären" ist mindestens gelb: "Fehlt noch" zurueckgelegt, Direktversand oder
 *         Restumfang pruefen. Bis 06.11. trug jede Karte dort einen Bernstein-Rahmen.
 * Das Wort nennt den dringendsten Grund; gesperrte Muster mit Anzahl ("2 Muster kommen nicht").
 * @param {object} k  Umschlag aus musterPackliste, `muster[].ampel` schon gesetzt
 * @param {{versandProblem?: string|null}} [opt]  Text des roten Versandhinweises, falls es einen gibt
 */
export function packUmschlagAmpel(k, { versandProblem = null } = {}) {
  const kandidaten = [];
  if (k?.bereich === 'gepackt') kandidaten.push({ stufe: 'rot', grund: 'nichtEingetragen', wort: 'Nicht eingetragen', titel: 'Gepackt, aber nie als verschickt eingetragen – der Kunde hat keine Versandmail' });
  if (versandProblem) kandidaten.push({ stufe: 'rot', grund: 'versand', wort: 'Versand nicht eingetragen', titel: String(versandProblem) });
  if (k?.adressFehlt?.length) kandidaten.push({ stufe: 'rot', grund: 'adresse', wort: 'Adresse fehlt', titel: `Lieferadresse unvollständig: ${k.adressFehlt.join(', ')}` });
  const muster = (k?.muster || []).map(m => m.ampel).filter(a => a?.stufe);
  const kommtNicht = muster.filter(a => a.grund === 'kommtNicht').length;
  if (kommtNicht) kandidaten.push({ stufe: 'rot', grund: 'kommtNicht', wort: kommtNicht === 1 ? '1 Muster kommt nicht' : `${kommtNicht} Muster kommen nicht`, titel: 'Der Kunde erfährt das nicht von selbst – bitte informieren' });
  kandidaten.push(...muster.filter(a => a.grund !== 'kommtNicht'));
  if (k?.klaeren) kandidaten.push({ stufe: 'gelb', grund: 'fehltNoch', wort: 'Fehlt noch', titel: 'Als fehlend zurückgelegt – „Fehlendes ist da“, sobald es kommt' });
  if (k?.direktversand) kandidaten.push({ stufe: 'gelb', grund: 'pruefen', wort: 'Direktversand prüfen', titel: 'Vom Lieferanten direkt an den Kunden – nicht hier packen' });
  else if (k?.hinweise?.length) kandidaten.push({ stufe: 'gelb', grund: 'pruefen', wort: 'Restumfang prüfen', titel: 'Teilweise erstattet – offene Muster mit der Bestellung abgleichen' });
  if (k?.bereich === 'klaeren') kandidaten.push({ stufe: 'gelb', grund: 'klaeren', wort: 'Zu klären', titel: '' });
  const rang = a => (RANG[a.stufe] || 0) * 100 - PACK_GRUENDE.indexOf(a.grund);
  const beste = kandidaten.reduce((x, y) => (!x || rang(y) > rang(x) || (rang(y) === rang(x) && (y.tage ?? -1) > (x.tage ?? -1)) ? y : x), null);
  if (!beste) return RUHIG;
  const { stufe, grund, wort, titel } = beste;
  return { stufe, grund, wort, titel: titel || '' };
}

/** Wort hinter der Zahl roter Umschlaege in den Reitern ("Wartet auf Ware 13 · × 2 überfällig"). */
const ROT_WORT = Object.freeze({ nichtEingetragen: 'nicht eingetragen', versand: 'nicht eingetragen', kommtNicht: 'blockiert', adresse: 'blockiert', zuordnung: 'blockiert', termin: 'überfällig', ueberfaellig: 'überfällig', haengt: 'überfällig' });

/**
 * Rote Umschlaege einer Arbeitsliste: Anzahl und ein Wort. Haben alle denselben Grund, sagt das Wort
 * ihn ("überfällig", "blockiert", "nicht eingetragen"), sonst "dringend".
 */
export function packRotZaehlung(umschlaege = []) {
  const rot = umschlaege.filter(k => k?.ampel?.stufe === 'rot');
  const woerter = new Set(rot.map(k => ROT_WORT[k.ampel.grund] || 'dringend'));
  return { n: rot.length, wort: woerter.size === 1 ? [...woerter][0] : 'dringend' };
}
