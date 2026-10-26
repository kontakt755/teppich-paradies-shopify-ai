/** Oeffentliche Kaufquellen aus dem vorhandenen aktiven Lexikon. Keine Kunden- oder Trackinglinks. */
const ORIGIN = 'https://www.teppich-paradies.net';
const nummer = v => String(v || '').match(/(?:^|\/)(\d+)$/)?.[1] || null;
const sku = v => String(v || '').replace(/^M-/i, '').trim().toUpperCase();
function oeffentlicheQuelle(produkt, handle) {
  // Ein berechnetes shopUrl oder ACTIVE allein belegt keine Onlineshop-Veroeffentlichung.
  if (typeof produkt?.onlineStoreUrl !== 'string') return false;
  try {
    const u = new URL(produkt.onlineStoreUrl);
    return u.origin === ORIGIN && u.pathname === `/products/${handle}` && !u.username && !u.password && !u.search && !u.hash;
  } catch { return false; }
}
export function musterKaufLinks(positionen = [], produkte = []) {
  const links = [], gesehen = new Set();
  if (!Array.isArray(positionen) || !Array.isArray(produkte)) return links;
  for (const p of positionen) {
    if (!p?.istMuster) continue;
    const handle = p.musterQuelle?.produktHandle || String(p.handle || '').replace(/^muster-/, '');
    const produkt = produkte.find(x => x?.handle === handle && x.status === 'ACTIVE');
    if (!produkt || !/^[a-z0-9-]+$/.test(handle) || !oeffentlicheQuelle(produkt, handle)) continue;
    const quellId = nummer(p.musterQuelle?.quellvariante || p.einkauf?.quellvariante);
    const varianten = (Array.isArray(produkt.varianten) ? produkt.varianten : []).filter(v => v?.verfuegbar === true && (quellId ? nummer(v.id) === quellId : sku(v.sku) && sku(v.sku) === sku(p.sku)));
    if (varianten.length !== 1 || !nummer(varianten[0].id)) continue;
    const v = varianten[0], id = nummer(v.id), url = `${ORIGIN}/products/${handle}?variant=${id}`;
    if (gesehen.has(url)) continue;
    gesehen.add(url);
    // Lieferzeit laut Produktseite (Lexikon: service.lieferzeit) fuer die Muster-Nachfrage; fehlt sie, fehlt das Feld.
    const lieferzeit = typeof produkt.lieferzeit === 'string' ? produkt.lieferzeit.replace(/[{}\r\n]/g, ' ').trim().slice(0, 80) : '';
    links.push({ titel: String(produkt.titel || p.titel || '').replace(/^Muster\s*:?\s*/i, ''), farbe: String(v.farbe || p.farbe || ''), url, ...(lieferzeit ? { lieferzeit } : {}) });
    if (links.length === 3) break;
  }
  return links;
}
export function sichereMusterLinks(links = []) {
  return (Array.isArray(links) ? links : []).filter(p => {
    try { const u = new URL(p.url); return u.origin === ORIGIN && /^\/products\/[a-z0-9-]+$/.test(u.pathname) && /^\d+$/.test(u.searchParams.get('variant') || '') && [...u.searchParams.keys()].every(k => k === 'variant'); } catch { return false; }
  }).slice(0, 3);
}
