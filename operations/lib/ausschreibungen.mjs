/**
 * Ausschreibungen Bodenbelag: reine Funktionen fuer operations/scripts/ausschreibungen-pruefen.mjs.
 * Quellen ohne Konto: TED-Suche (EU-weit, oberhalb der Schwellenwerte) und die
 * Tagesexporte von oeffentlichevergabe.de (OCDS, auch unterhalb der Schwelle).
 */

/** CPV: Bodenbelag (Fussboden-/Wandverkleidung, Bodenbelagsarbeiten, Bodenfliesen, Teppichverlegung). */
export const CPV = ['45432100', '45432110', '45432111', '45432130'];
/** NUTS-3 im Umkreis Oranienburg: Oberhavel, Havelland, Barnim, Berlin + Nachbarkreise. */
export const NUTS = ['DE40A', 'DE409', 'DE405', 'DE300', 'DE408', 'DE403', 'DE404'];

const cpvPasst = id => CPV.includes(String(id || '').replace(/-\d$/, ''));

export function tedAbfrage(abTag) {
  return {
    query: `classification-cpv IN (${CPV.join(' ')}) AND place-of-performance IN (${NUTS.join(' ')}) AND deadline-receipt-tender-date-lot>=${abTag.replaceAll('-', '')}`,
    fields: ['notice-title', 'buyer-name', 'buyer-city', 'deadline-receipt-tender-date-lot', 'place-of-performance'],
    limit: 100,
  };
}

const ersterText = v => (v && typeof v === 'object' && !Array.isArray(v) ? (v.deu ?? Object.values(v)[0]) : v);
const erster = v => (Array.isArray(v) ? v[0] : v);

/** TED-Antwort -> einheitliche Treffer. */
export function ausTed(antwort) {
  return (antwort?.notices || []).map(n => ({
    quelle: 'TED',
    id: n['publication-number'],
    titel: erster(ersterText(n['notice-title'])) || '',
    auftraggeber: erster(ersterText(n['buyer-name'])) || '',
    ort: erster(ersterText(n['buyer-city'])) || '',
    frist: String(erster(n['deadline-receipt-tender-date-lot']) || '').slice(0, 10) || null,
    link: n.links?.html?.DEU || `https://ted.europa.eu/de/notice/-/detail/${n['publication-number']}`,
  }));
}

/** Ein OCDS-Release -> Treffer oder null (CPV und Region muessen passen). */
export function ausOcds(release) {
  const t = release?.tender;
  if (!t) return null;
  const items = t.items || [];
  const cpv = items.some(i => cpvPasst(i.classification?.id) || (i.additionalClassifications || []).some(c => cpvPasst(c.id)));
  if (!cpv) return null;
  const regionen = items.map(i => i.deliveryAddress?.region).filter(Boolean);
  const kaeufer = (release.parties || []).find(p => p.id === release.buyer?.id) || (release.parties || [])[0];
  const imUmkreis = regionen.some(r => NUTS.includes(r)) || (!regionen.length && NUTS.includes(kaeufer?.address?.region));
  if (!imUmkreis) return null;
  return {
    quelle: 'oeffentlichevergabe.de',
    id: release.ocid,
    titel: t.title || '',
    auftraggeber: release.buyer?.name || kaeufer?.name || '',
    ort: kaeufer?.address?.locality || '',
    frist: (t.tenderPeriod?.endDate || '').slice(0, 10) || null,
    link: (t.documents || []).find(d => d.url)?.url || null,
  };
}

/** Doppelte (gleicher Titel + Auftraggeber) zusammenfassen, abgelaufene weg, nach Frist sortieren. */
export function bereinigen(treffer, heute) {
  const gesehen = new Map();
  for (const t of treffer) {
    if (t.frist && t.frist < heute) continue;
    const k = `${t.titel.toLowerCase()}|${t.auftraggeber.toLowerCase()}`;
    if (!gesehen.has(k)) gesehen.set(k, t);
  }
  return [...gesehen.values()].sort((a, b) => String(a.frist || '9').localeCompare(String(b.frist || '9')));
}

/** Neu seit dem letzten Lauf (nach id). */
export function neuSeit(treffer, vorher) {
  const alt = new Set((vorher || []).map(t => t.id));
  return treffer.filter(t => !alt.has(t.id));
}
