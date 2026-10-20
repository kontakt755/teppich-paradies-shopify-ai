/** Gemeinsame Grenzen fuer Auswahl, Vorschau und den physischen Drucktransport. */
export const DRUCK_LIMIT = Object.freeze({ positionen: 1000, etiketten: 5000, transport: 100, vorschau: 12 });

/** Web Crypto bleibt auch im privaten HTTP-Netz verfuegbar, randomUUID dagegen nicht ueberall. */
export function neueKennung(krypto = globalThis.crypto) {
  if (typeof krypto?.randomUUID === 'function') return krypto.randomUUID();
  if (typeof krypto?.getRandomValues !== 'function') throw new Error('Dieser Browser kann keine sichere Vorgangskennung erzeugen. Bitte einen aktuellen Browser verwenden.');
  const b = krypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(n => n.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Identische Kopien erhalten eine gemeinsame Vorschau; gedruckt wird weiterhin jedes Stueck. */
export function druckVorschau(etiketten = []) {
  const je = new Map();
  for (const [index, e] of etiketten.entries()) {
    const key = JSON.stringify([e.serie, e.farbe, e.sku, e.url, e.technik, e.fehlt]);
    const alt = je.get(key);
    if (alt) alt.anzahl++;
    else je.set(key, { index, anzahl: 1 });
  }
  return { motive: je.size, eintraege: [...je.values()].slice(0, DRUCK_LIMIT.vorschau) };
}

/** Kleine Transportauftraege begrenzen den Druckerpuffer, ohne Kopien zu verlieren. */
export function* druckBloecke(etiketten = []) {
  for (let start = 0; start < etiketten.length; start += DRUCK_LIMIT.transport) {
    yield { start, etiketten: etiketten.slice(start, start + DRUCK_LIMIT.transport) };
  }
}
