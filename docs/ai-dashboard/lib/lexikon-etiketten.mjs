/** Etikettenauswahl aus dem Produktlexikon, ohne Bestellung oder Drucker. */
import { etikett, originalHandle, serieUndFarbe, technikZeilen } from './muster-etiketten.mjs';

const text = v => v === null || v === undefined || ['–', '-', 'UNGEKLAERT', 'Default Title'].includes(String(v).trim()) ? '' : String(v).trim();
const norm = v => text(v).toLowerCase();
const musterSku = sku => /^(M-|TP-MUSTER)/i.test(text(sku));
const echteVarianten = produkt => (produkt?.varianten || []).filter(v => !v.wunschmass && !musterSku(v.sku));

/** Eine belegte Variantenbezeichnung darf eine fehlende Farbe ersetzen, ein Mass nie. */
export function farbeOderAusfuehrung(variante) {
  if (text(variante?.farbe)) return text(variante.farbe);
  const titel = text(variante?.titel);
  if (!titel || /^default(?: title)?$/i.test(titel) || !/\p{L}/u.test(titel)
    || /[/\\]|breite|länge|laenge|wunschmaß|wunschmass|\d\s*(?:mm|cm|m)\b|\d\s*[x×]\s*\d/i.test(titel)) return '';
  return titel;
}

const paar = v => JSON.stringify([norm(v.sku), norm(farbeOderAusfuehrung(v))]);
const eindeutig = varianten => {
  const je = new Map(varianten.map(v => [paar(v), v]));
  return je.size === 1 ? je.values().next().value : null;
};

/** Nur belegte Shop-SKU oder eine eindeutige Farbe; Lieferanten-Artikelnr. ist keine Shop-SKU. */
function originalVariante(muster, produkt) {
  const varianten = echteVarianten(produkt);
  const quellSku = text(muster.sku).match(/^M-(.+)$/i)?.[1]?.trim();
  const farbe = norm(farbeOderAusfuehrung(muster));
  if (quellSku) {
    const treffendeSku = varianten.filter(v => norm(v.sku) === norm(quellSku));
    const direkt = eindeutig(treffendeSku);
    if (direkt) return direkt;
    if (farbe && treffendeSku.length) return eindeutig(treffendeSku.filter(v => norm(farbeOderAusfuehrung(v)) === farbe));
    return null;
  }
  return farbe ? eindeutig(varianten.filter(v => norm(farbeOderAusfuehrung(v)) === farbe)) : null;
}

function ausVariante(produkt, variante, fehlt = []) {
  const sf = serieUndFarbe(produkt?.titel, farbeOderAusfuehrung(variante), produkt?.eigenschaften?.marke);
  const e = etikett({ ...sf, sku: variante?.sku, handle: produkt?.handle, technik: technikZeilen(produkt?.eigenschaften) });
  e.fehlt = [...new Set([...e.fehlt, ...fehlt])];
  return e;
}

/**
 * Eine Zeile je SKU/Farbe, nicht je Rollenbreite. Unvollstaendige Zeilen bleiben sichtbar;
 * `etikett.fehlt` nennt die Luecken und erlaubt der UI, den Druck zu sperren.
 * Fuer Muster werden die expliziten Originalprodukte per Handle nachgeladen und hier uebergeben.
 * @returns {{key: string, bezeichnung: string, etikett: object}[]}
 */
export function etikettenAusLexikon(produkt, originalProdukte = new Map()) {
  if (!produkt || produkt.handle === 'kostenloses-muster') return [];
  const je = new Map();
  const produktIstMuster = text(produkt.handle).startsWith('muster-');
  for (const [index, v] of (produkt.varianten || []).entries()) {
    if (v.wunschmass || /^TP-MUSTER/i.test(text(v.sku))) continue;
    const istMuster = produktIstMuster || /^M-/i.test(text(v.sku)) || !!v.original;
    let quelle = produkt, variante = v, fehlt = [];
    if (istMuster) {
      const handle = text(v.original?.produktHandle) || originalHandle(produkt.handle);
      quelle = originalProdukte.get(handle);
      if (!quelle || text(quelle.handle).startsWith('muster-') || quelle.handle === 'kostenloses-muster') {
        // Ohne geladenes Original weder M-SKU umdeuten noch eine Produktadresse konstruieren.
        quelle = { titel: produkt.titel };
        variante = { farbe: farbeOderAusfuehrung(v) };
        fehlt = ['Originalprodukt'];
      } else {
        variante = originalVariante(v, quelle);
        if (!variante) { variante = { farbe: farbeOderAusfuehrung(v) }; fehlt = ['Originalvariante']; }
      }
    }
    const e = ausVariante(quelle, variante, fehlt);
    // Ohne SKU ist die Gleichheit zweier Varianten nicht belegt: nicht still zusammenfassen.
    const key = JSON.stringify([quelle.handle || produkt.handle, norm(e.sku), norm(e.farbe), e.sku ? '' : text(v.id) || index]);
    if (je.has(key)) continue;
    je.set(key, { key, bezeichnung: [e.farbe || 'Farbe / Ausführung fehlt', e.sku].filter(Boolean).join(' · '), etikett: e });
  }
  return [...je.values()];
}
