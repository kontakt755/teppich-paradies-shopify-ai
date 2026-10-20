/**
 * Ablauf je Kundenbestellung (Einkauf, Reiter "Je Auftrag"): fuenf Schritte vom Eingang bis
 * "erledigt", berechnet aus der Bestelluebersicht (gruppen/musterGruppen je Lieferant) und dem
 * lokalen Auftragsfluss-Stand je Position. Reine Funktion - laeuft im Browser und im Test.
 *
 * Es wird nichts geraten: fehlt der Lieferant, die Artikelnummer oder die Bestellmenge, steht
 * die Position unter "ungeklaert" und geht nicht in die Bestellnachricht.
 */
import { UNGEKLAERT, musterEigen } from './einkauf-lieferanten.mjs';

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
