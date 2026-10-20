/** Bestellpositionen mit dem aktuellen Produktlexikon verbinden; keine Mengen- oder Produktdaten raten. */
import { etikettenAusLexikon } from './lexikon-etiketten.mjs';
import { etikett, produktUrl } from './muster-etiketten.mjs';

const text = v => v === null || v === undefined || ['–', '-', 'UNGEKLAERT'].includes(String(v).trim()) ? '' : String(v).trim();
const norm = v => text(v).toLowerCase();
const istMusterSku = v => /^(?:M-|TP-MUSTER)/i.test(text(v));
const echteVariante = v => !v?.wunschmass && !istMusterSku(v?.sku);

/** Nur echte Shopify-Variantenkennungen, keine beliebigen Endziffern eines fremden Strings. */
function variantenId(wert) {
  const m = text(wert).match(/^(?:gid:\/\/shopify\/ProductVariant\/)?([1-9]\d*)$/);
  return m?.[1] || '';
}

function menge(wert, name, fehlt) {
  if (Number.isInteger(wert) && wert >= 0 && wert <= 20) return wert;
  fehlt.push(name);
  if (typeof wert === 'number' && wert > 20) fehlt.push('Höchstens 20 Etiketten je Position');
  return null;
}

function lexikon(produkteMap) {
  const je = new Map();
  for (const p of produkteMap?.values?.() || []) {
    if (p?.handle && p.status !== 'ARCHIVED') je.set(p.handle, p);
  }
  return je;
}

function istOriginal(p) { return !text(p.handle).startsWith('muster-') && p.handle !== 'kostenloses-muster'; }

/** Der bestehende Helfer ist die einzige Quelle fuer Serie, Farbe, SKU, Technik und QR-Adresse. */
function kanonisch(produkt, variante, produkte) {
  const zeilen = etikettenAusLexikon({ ...produkt, varianten: [variante] }, produkte);
  if (zeilen.length !== 1) return null;
  const zeile = zeilen[0];
  // Bei Mustern bestimmt die belegte Originalreferenz den Zielartikel, nicht der Musterhandle.
  const ziel = [...produkte.values()].find(p => istOriginal(p) && zeile.etikett.url === produktUrl(p.handle));
  return ziel ? { ...zeile, produkt: ziel } : null;
}

function eindeutigesEtikett(kandidaten, produkte) {
  const etiketten = new Map();
  for (const { produkt, variante } of kandidaten) {
    const k = kanonisch(produkt, variante, produkte);
    // Nicht erfolgreiche Quellzuordnungen duerfen nicht zugunsten eines anderen Kandidaten verschwinden.
    if (!k || k.etikett.fehlt.some(f => /^Original/.test(f))) return null;
    etiketten.set(k.key, k);
  }
  return etiketten.size === 1 ? etiketten.values().next().value : null;
}

function zuordnung(p, produkte, echteVarianten) {
  const q = p.musterQuelle || {}, quellIdRoh = text(q.quellvariante), quellSku = text(q.sku);
  const quellHandle = text(q.produktHandle);
  if (quellIdRoh) {
    const id = variantenId(quellIdRoh);
    if (!id) return null;
    const treffer = echteVarianten.filter(({ variante }) => variantenId(variante.id) === id);
    if (treffer.length !== 1) return null;
    const { produkt, variante } = treffer[0];
    if ((quellSku && norm(quellSku) !== norm(variante.sku)) || (quellHandle && quellHandle !== produkt.handle)) return null;
    // Die Quell-ID geht vor einer alten M-Carrier-SKU der Bestellposition.
    return kanonisch(produkt, variante, produkte);
  }

  const mSku = text(p.sku).match(/^M-(.+)$/i)?.[1]?.trim() || '';
  if (quellSku && mSku && norm(quellSku) !== norm(mSku)) return null;
  const sku = quellSku || mSku;
  if (!sku || istMusterSku(sku)) return null;
  const muster = produkte.get(p.handle);
  let auswahl;
  if (muster && text(muster.handle).startsWith('muster-')) {
    const kandidaten = (muster.varianten || []).filter(v => !v.wunschmass && norm(v.sku) === norm(`M-${sku}`));
    // Ein bekannter, aber inzwischen fehlender Mustercarrier wird nicht per Farbe ersetzt.
    if (!kandidaten.length) return null;
    auswahl = eindeutigesEtikett(kandidaten.map(variante => ({ produkt: muster, variante })), produkte);
  } else {
    auswahl = eindeutigesEtikett(echteVarianten.filter(({ variante }) => norm(variante.sku) === norm(sku)), produkte);
  }
  if (!auswahl || (quellHandle && auswahl.produkt.handle !== quellHandle)) return null;
  return auswahl;
}

/**
 * Je Muster-Bestellposition eine Zeile; gleiche Aufkleber auf verschiedenen Positionen bleiben getrennt.
 * Ungueltige Mengen sind null und benannt. Null offene Stueck bleiben als 0 sichtbar.
 * Bestell-/Kundentexte gelangen niemals in das kanonische Etikett.
 */
export function musteretikettenFuerAuftrag(auftrag, produkteMap = new Map()) {
  const produkte = lexikon(produkteMap), echteVarianten = [];
  for (const produkt of produkte.values()) {
    if (!istOriginal(produkt)) continue;
    for (const variante of produkt.varianten || []) if (echteVariante(variante)) echteVarianten.push({ produkt, variante });
  }
  return (auftrag?.positionen || []).filter(p => p?.istMuster === true).map(p => {
    const k = zuordnung(p, produkte, echteVarianten);
    const e = k ? structuredClone(k.etikett) : etikett();
    const fehlt = [...e.fehlt];
    if (!k) fehlt.push('Originalzuordnung');
    const lineItemId = text(p.lineItemId) || null;
    if (!lineItemId) fehlt.push('Bestellposition');
    const anzahl = menge(p.menge, 'Menge', fehlt);
    const bestellmenge = menge(p.mengeBestellt, 'Bestellmenge', fehlt);
    if (Number.isFinite(p.menge) && Number.isFinite(p.mengeBestellt) && p.menge > p.mengeBestellt) fehlt.push('Mengenwiderspruch');
    return {
      lineItemId, produktHandle: k?.produkt.handle || '', produktTitel: k?.produkt.titel || '',
      bezeichnung: k?.bezeichnung || 'Originalzuordnung fehlt', key: k?.key || '',
      anzahl, bestellmenge, etikett: e, fehlt: [...new Set(fehlt)],
    };
  });
}
