/**
 * Ablauf je Kundenbestellung (Einkauf, Reiter "Je Auftrag"): fuenf Schritte vom Eingang bis
 * "erledigt", berechnet aus der Bestelluebersicht (gruppen/musterGruppen je Lieferant) und dem
 * lokalen Auftragsfluss-Stand je Position. Reine Funktion - laeuft im Browser und im Test.
 *
 * Es wird nichts geraten: fehlt der Lieferant, die Artikelnummer oder die Bestellmenge, steht
 * die Position unter "ungeklaert" und geht nicht in die Bestellnachricht.
 */
import { UNGEKLAERT, musterEigen, werktageZwischen } from './einkauf-lieferanten.mjs';

export const SCHRITTE = [
  ['eingegangen', 'Bestellung eingegangen'],
  ['vorbereiten', 'Lieferantenbestellung vorbereiten'],
  ['bestellt', 'Beim Lieferanten bestellt'],
  ['lieferung', 'Ware da · Lieferung/Montage'],
  ['erledigt', 'Erledigt'],
];

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
 * @param daten    { gruppen, musterGruppen } der Bestelluebersicht
 * @param eintragFuer  Position -> Auftragsfluss-Eintrag ({ status, bestelltAm, ... }) oder null
 * @returns { schritte: [{ key, label, stand: 'fertig'|'jetzt'|'offen' }], jetzt, lieferanten, ungeklaert, positionen, bestelltAm }
 */
export function auftragsAblauf(auftrag, { gruppen = [], musterGruppen = [] } = {}, eintragFuer = () => null) {
  const positionen = [];
  const sammle = (liste, art) => {
    for (const g of liste || []) for (const p of g.positionen || []) {
      if (String(p.orderId) !== String(auftrag.id) || (p.menge ?? 1) <= 0) continue;
      const eintrag = eintragFuer(p) || null;
      const eigen = art === 'muster' && musterEigen(p);
      positionen.push({ pos: p, art, lieferant: g.lieferant || UNGEKLAERT, eintrag, rang: rang(eintrag?.status), eigen, fehlt: eigen ? [] : fehlendeAngaben(p, g.lieferant) });
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
  const schritte = SCHRITTE.map(([key, label]) => ({ key, label, stand: fertig[key] && key !== jetztKey ? 'fertig' : key === jetztKey ? 'jetzt' : 'offen' }));
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

/** Ab so vielen Werktagen ohne Wareneingang nachfragen (Inhaber 2026-10-20). */
export const VERZUG_WERKTAGE = 10;

const tagVon = d => (d instanceof Date ? d.toISOString() : String(d || '')).slice(0, 10);

/**
 * Ist eine beim Lieferanten bestellte Position im Verzug? Mit bestaetigtem Liefertermin zaehlt
 * nur der Termin (vorher ist der Lieferant im Plan), sonst mehr als 10 Werktage seit "bestellt".
 * Rueckgabe: Werktage seit der Bestellung, wenn im Verzug - sonst null.
 */
export function verzugWerktage(eintrag, jetzt = new Date()) {
  if (eintrag?.status !== 'bestellt' || !eintrag.bestelltAm) return null;
  const tage = werktageZwischen(eintrag.bestelltAm, jetzt);
  const termin = eintrag.beschaffung?.liefertermin;
  if (typeof termin === 'string' && termin) return termin < tagVon(jetzt) ? (tage ?? 0) : null;
  return tage !== null && tage > VERZUG_WERKTAGE ? tage : null;
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
  const verzug = ab.unterwegs.filter(x => !x.eigen).map(x => ({ ...x, werktage: verzugWerktage(x.eintrag, jetzt) })).filter(x => x.werktage !== null);
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
 * Reihenfolge in "Jetzt zu tun" (Rundgang 29.10., T2): Auftraege, bei denen wir bestellen,
 * klaeren, den Kunden informieren oder nachfragen muessen, vor reinem Musterversand - sonst
 * standen zahlende Warenkunden hinter 20 Musterkarten (Inhaber 22.10.: Warenkunden zuerst).
 * 0 = eigener Schritt ausser Muster verschicken, 1 = nur Muster verschicken.
 */
export function jetztRang(e) {
  return (e?.gruende || []).some(g => g !== 'muster_da') ? 0 : 1;
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
