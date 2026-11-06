/**
 * Ablauf je Kundenbestellung (Einkauf, Reiter "Je Auftrag"): fuenf Schritte vom Eingang bis
 * "erledigt", berechnet aus der Bestelluebersicht (gruppen/musterGruppen je Lieferant) und dem
 * lokalen Auftragsfluss-Stand je Position. Reine Funktion - laeuft im Browser und im Test.
 *
 * Es wird nichts geraten: fehlt der Lieferant, die Artikelnummer oder die Bestellmenge, steht
 * die Position unter "ungeklaert" und geht nicht in die Bestellnachricht.
 */
import { UNGEKLAERT, musterEigen } from './einkauf-lieferanten.mjs';
import { warteAmpel, warteWort, dringendereAmpel } from './ampel.mjs';

export const SCHRITTE = [
  ['eingegangen', 'Bestellung eingegangen'],
  ['vorbereiten', 'Lieferantenbestellung vorbereiten'],
  ['bestellt', 'Beim Lieferanten bestellt'],
  ['lieferung', 'Ware da · Lieferung/Montage'],
  ['erledigt', 'Erledigt'],
];

// Reine Musterauftraege: keine Waren-Worte (Rundgang 29.10.), die Schritte selbst bleiben dieselben.
const MUSTER_LABEL = {
  vorbereiten: 'Muster bereitstellen',
  bestellt: 'Muster bestellt oder im Lager',
  // Offener Schritt, solange das Muster nicht raus ist: als Aufgabe benannt, nicht als erledigt.
  lieferung: 'Muster verschicken',
};

// Rang je Auftragsfluss-Stand (operations/lib/auftragsstatus.mjs): ohne Stand = noch zu bestellen.
const RANG = { bestellt: 1, geliefert: 2, raus: 3, erledigt: 4 };
const rang = status => RANG[status] || 0;

/** Was fehlt, damit die Position bestellt werden kann - in Alltagssprache, leer = vollstaendig. */
export function fehlendeAngaben(p, lieferant) {
  const fehlt = [];
  if (!lieferant || lieferant === UNGEKLAERT) fehlt.push('Lieferant ungeklärt');
  if (!p.grosshaendlerId || p.grosshaendlerId === UNGEKLAERT) fehlt.push('Artikelnummer beim Lieferanten fehlt');
  if (p.bestellmenge?.menge === UNGEKLAERT) fehlt.push('Bestellmenge ungeklärt');
  return fehlt;
}

/**
 * @param auftrag  { id } aus bestellungen.auftraege
 * @param daten    { gruppen, musterGruppen, gesperrteMuster? } der Bestelluebersicht (/api/einkauf/bestellungen);
 *                 gesperrteMuster = lineItemIds der Muster, die der Lieferant nicht liefern kann
 * @param eintragFuer  Position -> Auftragsfluss-Eintrag ({ status, bestelltAm, ... }) oder null
 * @returns { schritte: [{ key, label, stand: 'fertig'|'jetzt'|'offen' }], jetzt, lieferanten, ungeklaert, positionen, bestelltAm }
 */
export function auftragsAblauf(auftrag, { gruppen = [], musterGruppen = [], gesperrteMuster = [] } = {}, eintragFuer = () => null) {
  const positionen = [];
  const gesperrt = new Set(gesperrteMuster || []);
  const sammle = (liste, art) => {
    for (const g of liste || []) for (const p of g.positionen || []) {
      if (String(p.orderId) !== String(auftrag.id) || (p.menge ?? 1) <= 0) continue;
      const eintrag = eintragFuer(p) || null;
      const eigen = art === 'muster' && musterEigen(p);
      const r = rang(eintrag?.status);
      positionen.push({ pos: p, art, lieferant: g.lieferant || UNGEKLAERT, eintrag, rang: r, eigen, fehlt: eigen ? [] : fehlendeAngaben(p, g.lieferant),
        // Kommt nicht mehr (Mustersperre): solange noch nicht bei uns, ist Nachfragen beim Lieferanten sinnlos.
        gesperrt: art === 'muster' && r <= 1 && gesperrt.has(p.lineItemId) });
    }
  };
  sammle(gruppen, 'ware');
  sammle(musterGruppen, 'muster');

  // Noch zu bestellen, nach Lieferant und Art (Ware/Muster) - je Gruppe eine Bestellnachricht.
  const zuBestellen = positionen.filter(x => x.rang === 0 && !x.eigen);
  const ungeklaert = zuBestellen.filter(x => x.fehlt.length);
  const je = new Map();
  for (const x of zuBestellen.filter(y => !y.fehlt.length)) {
    const k = `${x.lieferant}|${x.art}`;
    if (!je.has(k)) je.set(k, { lieferant: x.lieferant, art: x.art, positionen: [] });
    je.get(k).positionen.push(x);
  }
  const lieferanten = [...je.values()].sort((a, b) => a.lieferant.localeCompare(b.lieferant) || a.art.localeCompare(b.art));

  // Eigene Muster (haben wir da) brauchen keine Lieferantenbestellung, zaehlen also als bestellt.
  const r = x => (x.eigen ? Math.max(x.rang, 1) : x.rang);
  const alle = positionen.length;
  const mind = n => alle > 0 && positionen.every(x => r(x) >= n);
  const fertig = {
    eingegangen: true,
    vorbereiten: mind(1),
    bestellt: mind(1),
    lieferung: mind(3),
    erledigt: mind(4),
  };
  // "Vorbereiten" und "bestellt" fallen zusammen, sobald abgehakt ist; vorher steht der Auftrag
  // auf "vorbereiten". Ware, die bei uns liegt, wartet auf Auslieferung oder Montage.
  const jetztKey = SCHRITTE.map(s => s[0]).find(k => !fertig[k]) || 'erledigt';
  const nurMuster = alle > 0 && positionen.every(x => x.art === 'muster');
  const schritte = SCHRITTE.map(([key, label]) => ({ key, label: (nurMuster && MUSTER_LABEL[key]) || label, stand: fertig[key] && key !== jetztKey ? 'fertig' : key === jetztKey ? 'jetzt' : 'offen' }));
  const daten = positionen.map(x => x.eintrag?.bestelltAm).filter(Boolean).sort();
  return {
    schritte, jetzt: jetztKey, lieferanten, ungeklaert, positionen,
    bestelltAm: daten.length ? daten[daten.length - 1] : null,
    unterwegs: positionen.filter(x => x.rang === 1),
    beiUns: positionen.filter(x => x.rang === 2),
  };
}

// ---------------------------------------------------------------------------
// Einordnung fuer die Arbeitsliste (seit 2026-10-20): nur was Handlung braucht, steht offen.
// ---------------------------------------------------------------------------

/**
 * Ist eine beim Lieferanten bestellte Position im Verzug? Dieselbe Schwelle wie "Je Lieferant"
 * (lib/ampel.mjs, 06.11.2026): gelb ab 7 Kalendertagen seit "bestellt" (nachhaken), rot ab 14
 * (ueberfaellig). Bis dahin galten hier 10 Werktage - in einer normalen Woche sind das die 14
 * Kalendertage, ab denen es jetzt rot ist. Mit bestaetigtem Liefertermin zaehlt nur der Termin:
 * davor ist der Lieferant im Plan, danach ist es sofort rot.
 * Rueckgabe: die Ampel ({ stufe, grund, tage, termin }) - oder null, wenn nichts zu tun ist.
 */
export function verzugAmpel(eintrag, jetzt = new Date()) {
  if (eintrag?.status !== 'bestellt' || !eintrag.bestelltAm) return null;
  const a = warteAmpel(eintrag, { jetzt });
  return a.stufe ? a : null;
}

/** Nur das erste "kunde_informiert" zaehlt; ein "zurueck" darauf hebt es auf (wie in der Zeitleiste). */
export function kundeInformiertAus(ereignisse = []) {
  let stand = null;
  for (const e of [...(ereignisse || [])].filter(e => e?.am).sort((a, b) => String(a.am).localeCompare(String(b.am)))) {
    if (e.schritt === 'kunde_informiert' && !stand) stand = { am: e.am, von: e.von || null };
    if (e.schritt === 'zurueck' && e.bezug === 'kunde_informiert') stand = null;
  }
  return stand;
}

/**
 * Wohin gehoert ein Auftrag in der Liste "Je Auftrag"?
 *   jetzt      - wir sind dran: bestellen, Ungeklaertes klaeren, Ware da und Kunde nicht
 *                informiert, Muster da zum Verschicken, Lieferant im Verzug
 *   unterwegs  - beim Lieferanten bestellt, wartet auf Ware (startet eingeklappt)
 *   beiKunde   - Kunde informiert bzw. schon raus: Termin/Abschluss (eingeklappt)
 * @param ab  Ergebnis von auftragsAblauf()
 * @param informiert  { am, von } oder null
 */
export function einordnung(ab, informiert = null, jetzt = new Date()) {
  const gruende = [];
  const verzug = ab.unterwegs.filter(x => !x.eigen && !x.gesperrt).map(x => ({ ...x, ampel: verzugAmpel(x.eintrag, jetzt) })).filter(x => x.ampel).map(x => ({ ...x, tage: x.ampel.tage }));
  if (ab.jetzt === 'vorbereiten') gruende.push(ab.lieferanten.length ? 'bestellen' : null, ab.ungeklaert.length ? 'ungeklaert' : null);
  const wareDa = ab.beiUns.filter(x => x.art === 'ware');
  if (wareDa.length && !informiert) gruende.push('informieren');
  if (ab.beiUns.some(x => x.art === 'muster')) gruende.push('muster_da');
  if (verzug.length) gruende.push('verzug');
  const g = gruende.filter(Boolean);
  const gruppe = g.length ? 'jetzt' : ab.jetzt === 'lieferung' && ab.unterwegs.length ? 'unterwegs' : 'beiKunde';
  return { gruppe, gruende: g, verzug, wareDa };
}

/**
 * Ampel einer Auftragskarte "Je Auftrag" (lib/ampel.mjs): die dringendste ihrer Positionen.
 *   rot   Bestellangaben fehlen (ungeklaert), ein Muster ist gesperrt (Lieferant kann nicht
 *         liefern), Verzug ab 14 Tagen oder bestaetigter Liefertermin vorbei
 *   gelb  Verzug ab 7 Tagen: beim Lieferanten nachhaken
 * Was sonst "jetzt" zu tun ist (bestellen, Kunde informieren, Muster verschicken), ist normale
 * Arbeit und bleibt ohne Farbe.
 * @param ab  Ergebnis von auftragsAblauf()
 * @param e   Ergebnis von einordnung()
 * Gesperrte Muster markiert auftragsAblauf() aus `gesperrteMuster` der Bestellungen.
 * @returns {{stufe:'rot'|'gelb', grund:string, wort:string, tage?:number}|null}
 */
export function auftragsAmpel(ab, e) {
  if (ab?.ungeklaert?.length) return { stufe: 'rot', grund: 'blockiert', wort: 'Blockiert' };
  if ((ab?.positionen || []).some(x => x.gesperrt)) return { stufe: 'rot', grund: 'gesperrt', wort: 'Gesperrt' };
  const v = (e?.verzug || []).reduce((m, x) => dringendereAmpel(m, x.ampel), null);
  return v?.stufe ? { ...v, wort: warteWort(v) } : null;
}

/**
 * Reihenfolge in "Jetzt zu tun" (Rundgang 29.10., T2; Review 29.10., w-223): zahlende Warenkunden
 * zuerst (Inhaber 22.10.), auch vor einem reinen Musterauftrag, den wir erst bestellen muessen.
 * 0 = Auftrag mit Ware und eigenem Schritt ausser Muster verschicken
 * 1 = reiner Musterauftrag: bestellen, klaeren oder nachfragen
 * 2 = nur Muster verschicken
 * @param e   Ergebnis von einordnung()
 * @param ab  Ergebnis von auftragsAblauf()
 */
export function jetztRang(e, ab) {
  if (!(e?.gruende || []).some(g => g !== 'muster_da')) return 2;
  return (ab?.positionen || []).some(x => x.art === 'ware') ? 0 : 1;
}

const datumDe = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '');

/** Fertiger Text an den Kunden: Ware ist da, Termin abstimmen. Versendet wird nichts. */
export function kundenNachricht({ auftragName, kundeName, artikel = [] }) {
  const anrede = kundeName ? `Guten Tag ${kundeName},` : 'Guten Tag,';
  const liste = artikel.length ? `\n\n${artikel.map(a => `- ${a}`).join('\n')}` : '';
  return {
    betreff: `Ihre Bestellung ${auftragName} ist bei uns eingetroffen`,
    text: `${anrede}\n\nIhre Ware zur Bestellung ${auftragName} ist bei uns im Teppich Paradies eingetroffen:${liste}\n\nBitte sagen Sie uns kurz, wann es Ihnen passt: Wir stimmen gern einen Termin für Lieferung bzw. Verlegung mit Ihnen ab – oder Sie holen die Ware bei uns im Laden ab.\n\nAntworten Sie einfach auf diese E-Mail oder rufen Sie uns an.\n\nMit freundlichen Grüßen\nIhr Team von Teppich Paradies`,
  };
}

/** Erinnerung am Vortag eines Termins beim Kunden (Lieferung/Verlegung). Versendet wird nichts. */
export function kundenErinnerung({ auftragName, kundeName, termin }) {
  const anrede = kundeName ? `Guten Tag ${kundeName},` : 'Guten Tag,';
  return `${anrede}\n\nwir möchten Sie kurz an unseren Termin morgen, ${datumDe(termin)}, zu Ihrer Bestellung ${auftragName} erinnern. Falls etwas dazwischengekommen ist, melden Sie sich bitte kurz bei uns.\n\nMit freundlichen Grüßen\nIhr Team von Teppich Paradies`;
}

/** Fertige Nachfrage an den Lieferanten bei Verzug. */
export function nachfrageNachricht({ auftragName, positionen = [] }) {
  const zeilen = positionen.map(x => {
    const p = x.pos;
    const menge = p.bestellmenge?.menge && p.bestellmenge.menge !== UNGEKLAERT ? `${p.bestellmenge.menge} ${p.bestellmenge.einheit || ''}`.trim() : '';
    const nr = p.grosshaendlerId && p.grosshaendlerId !== UNGEKLAERT ? `Art.-Nr. ${p.grosshaendlerId}` : '';
    const bestnr = x.eintrag?.lieferantBestellnummer ? `Ihre Auftragsnr. ${x.eintrag.lieferantBestellnummer}` : '';
    return `- ${[p.titel, p.farbe, menge, nr, `bestellt am ${datumDe(x.eintrag?.bestelltAm)}`, bestnr].filter(Boolean).join(' · ')}`;
  });
  return {
    betreff: `Nachfrage Liefertermin – Kommission ${auftragName}`,
    text: `Guten Tag,\n\nfolgende Ware haben wir für unsere Kommission ${auftragName} bei Ihnen bestellt; sie ist bei uns noch nicht eingetroffen:\n\n${zeilen.join('\n')}\n\nKönnen Sie uns bitte kurz den voraussichtlichen Liefertermin nennen?\n\nVielen Dank und freundliche Grüße\nTeppich Paradies`,
  };
}

/**
 * Zahlen fuer die Zeile oben auf "Heute" - dieselbe Rechnung wie die Liste im Einkauf,
 * je Auftrag gezaehlt.
 */
export function einkaufZahlen(auftraege = [], daten = {}, eintragFuer = () => null, informiertFuer = () => null, jetzt = new Date()) {
  const z = { bestellen: 0, informieren: 0, verzug: 0 };
  for (const a of auftraege) {
    const e = einordnung(auftragsAblauf(a, daten, eintragFuer), informiertFuer(a.id), jetzt);
    if (e.gruende.includes('bestellen') || e.gruende.includes('ungeklaert')) z.bestellen += 1;
    if (e.gruende.includes('informieren')) z.informieren += 1;
    if (e.gruende.includes('verzug')) z.verzug += 1;
  }
  return z;
}
