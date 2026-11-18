/**
 * Offene Lexware-Angebote nachfassen (w-351).
 *
 * Der Dashboard-Dienst hat keinen Lexware-Schluessel. Die Angebote holt eine
 * Claude-Routine ueber den Lexware-Konnektor (nur lesend) und legt sie mit
 * operations/scripts/lexware-angebote-ablegen.mjs unter
 * $TP_PRIVAT_DIR/lexware-angebote/offen.json ab. Wer angerufen hat, steht daneben
 * in nachfass.json - gleiche Ablage und gleiche Status wie die Rueckrufe
 * (operations/lib/rueckrufe.mjs), Schluessel ist die Lexware-Angebots-ID.
 * Nie im Repository: Kundennamen und Betraege sind privat.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ERSTES_NACHFASSEN_TAGE = 5;
export const ZWEITES_NACHFASSEN_TAGE = 12;
const TAG_MS = 86_400_000;

export const lexwareAngebotePfad = dir => path.join(dir, 'lexware-angebote', 'offen.json');
export const lexwareNachfassPfad = dir => path.join(dir, 'lexware-angebote', 'nachfass.json');

/**
 * Antwort(en) von search_lexware_quotations -> schlanke Liste. Nimmt eine Seite oder
 * ein Array von Seiten. Nur Status open/overdue: angenommene oder abgelehnte Angebote
 * fallen so von selbst aus der Liste.
 */
export function angeboteAusLexware(seiten, jetzt = new Date()) {
  const liste = (Array.isArray(seiten) ? seiten : [seiten]).flatMap(s => s?.quotations || []);
  if (!liste.length && !(Array.isArray(seiten) ? seiten : [seiten]).some(s => Array.isArray(s?.quotations))) {
    throw new Error('Keine Lexware-Antwort erkannt (Feld "quotations" fehlt)');
  }
  const angebote = liste
    .filter(q => q && q.voucherType === 'quotation' && ['open', 'overdue'].includes(q.voucherStatus) && !q.archived)
    .map(q => ({
      id: String(q.id),
      nummer: String(q.voucherNumber || ''),
      datum: String(q.voucherDate || q.createdDate || '').slice(0, 10),
      kunde: String(q.contactName || ''),
      betrag: Number(q.totalAmount) || 0,
      waehrung: q.currency || 'EUR',
      // Nur Links auf Lexware selbst durchreichen.
      url: /^https:\/\/app\.lexware\.de\//.test(q.viewUrl || '') ? q.viewUrl : null,
    }))
    .filter(a => a.id && /^\d{4}-\d{2}-\d{2}$/.test(a.datum));
  return { version: 1, stand: jetzt.toISOString(), angebote };
}

export function schreibeAngebote(file, daten) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(daten, null, 2));
  fs.renameSync(tmp, file);
}

/** Ganze Tage seit dem Angebotsdatum (lokaler Kalendertag reicht hier). */
export function alterTage(datum, jetzt = new Date()) {
  return Math.floor((jetzt.getTime() - Date.parse(`${datum}T00:00:00`)) / TAG_MS);
}

/**
 * Ist das Angebot heute dran?
 * - erledigt: nie mehr.
 * - juenger als 5 Tage: noch nicht.
 * - noch niemand angerufen (offen/nicht erreicht): ab Tag 5.
 * - nicht erreicht: erst am naechsten Tag wieder.
 * - angerufen: zweites Nachfassen ab Tag 12, wenn der Anruf davor lag.
 */
export function nachfassFaellig(angebot, eintrag, jetzt = new Date()) {
  const status = eintrag?.status || 'offen';
  if (status === 'erledigt') return false;
  const alter = alterTage(angebot.datum, jetzt);
  if (alter < ERSTES_NACHFASSEN_TAGE) return false;
  if (status === 'offen') return true;
  if (status === 'nicht_erreicht') return jetzt.getTime() - Date.parse(eintrag.nicht_erreichtAm || 0) >= TAG_MS;
  if (status === 'angerufen') {
    const zweitesAb = Date.parse(`${angebot.datum}T00:00:00`) + ZWEITES_NACHFASSEN_TAGE * TAG_MS;
    return alter >= ZWEITES_NACHFASSEN_TAGE && Date.parse(eintrag.angerufenAm || 0) < zweitesAb;
  }
  return false;
}
