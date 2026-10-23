/** Exakter lesender Quellabgleich zum vorhandenen Laden-Fall; kein Statuswrite. */
import { createHash } from 'node:crypto';
import { ladenKonfig } from './laden-zahlen.mjs';

const STATUS = new Set(['neu', 'angebot', 'nachfassen', 'gewonnen', 'verloren']);
const HASH = /^[a-f0-9]{64}$/;
export const serviceQuellHash = (id) => createHash('sha256').update(`service-mail:${String(id).trim().toLowerCase()}`).digest('hex');

export function abgleichAus(roh, hashes, jetzt = Date.now()) {
  const stand = Date.parse(roh?.stand);
  if (roh?.version !== 1 || !Number.isFinite(stand) || jetzt - stand > 600_000 || stand - jetzt > 60_000 || !Array.isArray(roh.treffer) || roh.treffer.length !== hashes.length) return null;
  const gesucht = new Set(hashes), gesehen = new Set(), aus = new Map();
  for (const t of roh.treffer) {
    if (!HASH.test(t?.quellHash) || !gesucht.has(t.quellHash) || gesehen.has(t.quellHash) || ![0, 1, 2].includes(t.anzahl)) return null;
    gesehen.add(t.quellHash);
    if (t.anzahl !== 1) { aus.set(t.quellHash, { anzahl: t.anzahl }); continue; }
    if (typeof t.auftragId !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(t.auftragId) || !STATUS.has(t.status) || !Number.isSafeInteger(t.standMs) || t.standMs < 0) return null;
    aus.set(t.quellHash, { anzahl: 1, auftragId: t.auftragId, status: t.status, standMs: t.standMs });
  }
  return aus;
}

export function createServiceLadenAbgleich({ root, env = process.env, holen = globalThis.fetch, jetzt = Date.now } = {}) {
  let cache = null, laufend = null;
  return { async abrufen(eintraege) {
    const konfig = ladenKonfig({ root, env });
    if (!konfig) return { verfuegbar: false, grund: 'nicht-eingerichtet', zuordnung: new Map() };
    const hashes = [...new Set(eintraege.filter(e => /^[a-f0-9]{8,100}$/i.test(e.mailId || '')).map(e => serviceQuellHash(e.mailId)))].sort();
    if (!hashes.length) return { verfuegbar: true, zuordnung: new Map() };
    const key = createHash('sha256').update(`${konfig.basis}\0${konfig.schluessel}\0${hashes.join(',')}`).digest('hex');
    if (cache?.key === key && jetzt() - cache.am < 300_000) return cache.wert;
    if (laufend?.key === key) return laufend.promise;
    const promise = (async () => {
      await Promise.resolve(); // Auch synchroner Abruffehler raeumt den gemeinsam benutzten Lauf auf.
      try {
        const alle = new Map();
        for (let i = 0; i < hashes.length; i += 50) {
          const teil = hashes.slice(i, i + 50), u = new URL(konfig.basis);
          u.search = new URLSearchParams({ ansicht: 'serviceabgleich', s: konfig.schluessel, q: teil.join(',') });
          const r = await holen(u, { signal: AbortSignal.timeout(15_000) });
          if (!r.ok) throw new Error('http');
          const text = await r.text();
          if (text.length > 24_000) throw new Error('antwort');
          const daten = abgleichAus(JSON.parse(text), teil, jetzt());
          if (!daten) throw new Error('antwort');
          for (const [h, v] of daten) alle.set(h, v);
        }
        const wert = { verfuegbar: true, zuordnung: alle, basis: konfig.basis, stand: new Date(jetzt()).toISOString() };
        cache = { key, am: jetzt(), wert }; return wert;
      } catch {
        // Keine URL/Anmeldedaten/Quell-IDs in Fehlern oder Logs ausgeben.
        const wert = { verfuegbar: false, grund: 'nicht-verfuegbar', zuordnung: new Map() };
        cache = { key, am: jetzt() - 240_000, wert }; return wert;
      } finally { laufend = null; }
    })();
    laufend = { key, promise }; return promise;
  } };
}

export function serviceMitLaden(eintraege, abgleich, basis) {
  return eintraege.map(e => {
    const t = e.mailId && abgleich.zuordnung.get(serviceQuellHash(e.mailId));
    if (!t) return { ...e };
    if (t.anzahl !== 1) return { ...e, laden: { anzahl: t.anzahl } };
    const u = new URL(basis); u.search = new URLSearchParams({ ansicht: 'laden', auftrag: t.auftragId });
    return { ...e, laden: { ...t, url: u.toString() } };
  });
}
