/** Lokale Messwerte je konkretem Umschlag; keine Porto- oder Versand-Anbindung. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const grossbriefPfad = dir => path.join(dir, 'muster-grossbrief.json');
const objekt = v => v && typeof v === 'object' && !Array.isArray(v);
export class GrossbriefSpeicherFehler extends Error {
  constructor(message, status = 500) { super(message); this.status = status; }
}
export function messwerte(v) {
  if (!objekt(v)) throw new GrossbriefSpeicherFehler('Messwerte fehlen.', 400);
  const out = {};
  for (const f of ['gramm', 'dickeMm', 'laengeMm', 'breiteMm']) {
    if (typeof v[f] !== 'string' || v[f].length > 12 || !/^\d*(?:[.,]\d*)?$/.test(v[f])) throw new GrossbriefSpeicherFehler('Gewicht und Maße bitte als Zahlen eingeben.', 400);
    out[f] = v[f];
  }
  return out;
}
/** Inhalt oder Adresse geaendert: alte Messungen gelten nicht fuer den neuen Umschlag. */
export function grossbriefKontext(k) {
  const adresse = ['name', 'strasse', 'plz', 'ort', 'land'].map(f => String(k.adresse?.[f] || '').trim());
  const positionen = k.muster.map(m => [m.lineItemId, m.anzahl, m.etikett?.sku || '', m.etikett?.farbe || '']).sort((a, b) => a[0].localeCompare(b[0]));
  return createHash('sha256').update(JSON.stringify([k.packSchluessel, adresse, positionen])).digest('hex');
}
export function leseGrossbriefe(datei) {
  let text;
  try { text = fs.readFileSync(datei, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw new GrossbriefSpeicherFehler('Großbrief-Vorbereitungen sind nicht lesbar. Bitte die Ablage prüfen.'); }
  try {
    const roh = JSON.parse(text);
    if (!objekt(roh) || !objekt(roh.eintraege)) throw new Error();
    for (const [key, v] of Object.entries(roh.eintraege)) {
      if (!/^[a-f0-9]{64}$/.test(key) || !objekt(v) || !Number.isSafeInteger(v.version) || v.version < 1) throw new Error();
      messwerte(v.messung);
    }
    return roh.eintraege;
  } catch { throw new GrossbriefSpeicherFehler('Großbrief-Vorbereitungen sind beschädigt. Bitte aus der Sicherung holen.'); }
}
export function grossbriefStand(kunde, eintraege) {
  const kontext = grossbriefKontext(kunde);
  return { kontext, ...(eintraege[kontext] || { version: 0, messung: { gramm: '', dickeMm: '', laengeMm: '', breiteMm: '' } }) };
}
export function speichereGrossbrief(datei, kontext, version, messung, { von = null, jetzt = new Date() } = {}) {
  const daten = messwerte(messung);
  const alle = leseGrossbriefe(datei);
  if (!Number.isSafeInteger(version) || version < 0) throw new GrossbriefSpeicherFehler('Speicherstand fehlt. Bitte neu öffnen.', 400);
  if ((alle[kontext]?.version || 0) !== version) throw new GrossbriefSpeicherFehler('Diese Vorbereitung wurde inzwischen an einem anderen Arbeitsplatz geändert. Bitte neu öffnen.', 409);
  const eintrag = { version: version + 1, messung: daten, zeit: jetzt.toISOString(), von };
  alle[kontext] = eintrag;
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ eintraege: alle }, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, datei);
  } finally { try { fs.unlinkSync(tmp); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  return { kontext, ...eintrag };
}
