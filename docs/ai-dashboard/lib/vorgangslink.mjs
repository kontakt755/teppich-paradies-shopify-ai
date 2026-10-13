/** Gezielte interne Spruenge behalten IDs unveraendert und nehmen einen festen Rueckweg mit. */
export function vorgangsLink(view, { auftrag = null, kunde = null, fall = null, tab = null, af = null } = {}) {
  if (!['einkauf', 'kunden'].includes(view)) return '#/heute';
  const p = new URLSearchParams({ von: 'heute' });
  for (const [k, v] of Object.entries({ auftrag, kunde, fall, tab, af })) if (v) p.set(k, String(v));
  return `#/${view}?${p}`;
}
export function filtereAuftrag(daten, id) {
  if (!id) return daten;
  const passt = p => String(p.orderId) === String(id);
  const gruppen = g => (g || []).map(x => ({ ...x, positionen: (x.positionen || []).filter(passt) })).filter(x => x.positionen.length);
  return { ...daten, auftraege: (daten.auftraege || []).filter(a => String(a.id) === String(id)), testauftraege: (daten.testauftraege || []).filter(a => String(a.id) === String(id)), gruppen: gruppen(daten.gruppen), musterGruppen: gruppen(daten.musterGruppen) };
}
