/**
 * Was steht in einer Bestellung? Eine Zeile je Bestellung fuer die Bestellliste und die
 * To-dos auf "Heute".
 *
 * Inhaber 2026-10-13: Bei einer Musterbestellung muss "ganz klipp und klar" dastehen, welche
 * Muster es sind - "ohne lange zu suchen, ohne irgendwo hinzuklicken". Bis dahin stand in der
 * Bestellliste nur "0,00 €" und "Bestellt (0 von 3 erledigt)"; Produkt und Farbe gab es erst
 * nach dem Aufklappen.
 *
 * Reine Funktionen ohne DOM - Eingabe sind die Positionen aus /api/kunden/bestellungen
 * (auftrag.positionen) bzw. /api/einkauf/bestellungen.
 */

const leer = v => v === null || v === undefined || String(v).trim() === '' || v === '–' || v === 'UNGEKLAERT';

/** "Muster Vellana Teppichboden 400cm 500cm" -> "Vellana Teppichboden"; Spiegel von kurzTitel() in operations/lib/musterlager.mjs. */
export function musterTitel(titel) {
  return String(titel ?? '').replace(/^\s*Muster\s*:?\s*/i, '').replace(/(\s+\d{2,3}\s?cm)+\s*(-\s*\d+)?$/i, '').trim() || 'Muster';
}

/**
 * Woher kommt ein offenes Muster? 'lager' (Musterlager, mit Platz), 'eigen' (Wahl "haben wir da"),
 * 'vorbei' (persoenlich vorbeibringen) oder null (beim Lieferanten bzw. schon unterwegs).
 */
export function musterHerkunftVon(p) {
  if (p?.musterLager && p.musterHerkunft !== 'eigen_vorbei') return 'lager';
  if (p?.musterHerkunft === 'eigen_vorbei') return 'vorbei';
  if (p?.musterHerkunft === 'eigen_versand') return 'eigen';
  return null;
}

/**
 * Muster je Produkt mit ihren Farben. Steckt die Farbe schon im Titel (Sammelprodukt
 * "Kostenloses Muster": "Muster: Eichwald Eiche Greige – Vinylboden von der Rolle"), bleibt
 * nur der Titel.
 * @returns {{produkt: string, farben: {farbe: string|null, herkunft: string|null, ort: string|null}[]}[]}
 */
export function musterJeProdukt(positionen = []) {
  const je = new Map();
  for (const p of positionen || []) {
    if (!p?.istMuster) continue;
    const produkt = musterTitel(p.titel);
    if (!je.has(produkt)) je.set(produkt, []);
    const farbe = leer(p.farbe) || produkt.includes(p.farbe) ? null : String(p.farbe);
    je.get(produkt).push({ farbe, herkunft: musterHerkunftVon(p), ort: p.musterLager?.ort || null });
  }
  return [...je].map(([produkt, farben]) => ({ produkt, farben }));
}

/** "Regalia Teppichboden: Beige Mittel Dunkler, Creme Dunkel · Vellana Teppichboden: Sand" */
export function musterText(positionen = []) {
  return musterJeProdukt(positionen).map(({ produkt, farben }) => {
    const namen = [...new Set(farben.map(f => f.farbe).filter(Boolean))];
    return namen.length ? `${produkt}: ${namen.join(', ')}` : produkt;
  }).join(' · ');
}

/** "1 aus dem Musterlager (Regal B)" - nur offene Muster, die nicht beim Lieferanten bestellt werden. */
export function musterHerkunftText(positionen = []) {
  const muster = (positionen || []).filter(p => p?.istMuster);
  const zahl = art => muster.filter(p => musterHerkunftVon(p) === art).length;
  const orte = [...new Set(muster.filter(p => musterHerkunftVon(p) === 'lager').map(p => p.musterLager?.ort).filter(Boolean))];
  const teile = [];
  const lager = zahl('lager');
  if (lager) teile.push(`${lager === muster.length ? (lager === 1 ? 'aus' : 'alle aus') : `${lager} aus`} dem Musterlager${orte.length ? ` (${orte.join(', ')})` : ''}`);
  if (zahl('eigen')) teile.push(`${zahl('eigen') === muster.length ? 'haben wir da' : `${zahl('eigen')} haben wir da`} – verschicken`);
  if (zahl('vorbei')) teile.push(`${zahl('vorbei') === muster.length ? 'haben wir da' : `${zahl('vorbei')} haben wir da`} – vorbeibringen`);
  return teile.join(' · ');
}

/** "Fortiva Teppich nach Maß (Stahlblau, 2,80 lfm × 2,00 m)" - Ware je Position, hoechstens `max`. */
export function wareText(positionen = [], { max = 3 } = {}) {
  const ware = (positionen || []).filter(p => p && !p.istMuster);
  const zeile = p => {
    const zusatz = [leer(p.farbe) ? null : p.farbe, leer(p.kundenmenge) ? null : p.kundenmenge].filter(Boolean);
    return `${leer(p.titel) ? 'Artikel' : p.titel}${zusatz.length ? ` (${zusatz.join(', ')})` : ''}`;
  };
  const text = ware.slice(0, max).map(zeile).join(' · ');
  return ware.length > max ? `${text} · +${ware.length - max} weitere` : text;
}

/**
 * Inhalt einer Bestellung auf einen Blick.
 * @returns {{art: 'muster'|'ware'|'gemischt'|'leer', muster: {anzahl: number, text: string, herkunft: string}, ware: {anzahl: number, text: string}}}
 */
export function bestellinhalt(positionen = []) {
  const liste = Array.isArray(positionen) ? positionen : [];
  const m = liste.filter(p => p?.istMuster);
  const w = liste.filter(p => p && !p.istMuster);
  const art = m.length && w.length ? 'gemischt' : m.length ? 'muster' : w.length ? 'ware' : 'leer';
  return {
    art,
    muster: { anzahl: m.length, text: musterText(m), herkunft: musterHerkunftText(m) },
    ware: { anzahl: w.length, text: wareText(w) },
  };
}
