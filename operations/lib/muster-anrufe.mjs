/**
 * Lokale Ablage "Muster anrufen": Ergebnis und Notizen je Musterbestellung.
 *
 * Nur $TP_PRIVAT_DIR/muster-anrufe.json - nie im Repository (Kundenaussagen). Eigene Datei statt
 * rueckrufe.json: dort bedeutet "erledigt", dass ein Beratungswunsch abgearbeitet ist, und das
 * steuert die Auftragsliste. Bauart wie rueckrufe.mjs: atomar, beschaedigt wirft statt leer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { anrufErgebnis, wiedervorlageTag, HOECHSTENS_VERSUCHE } from '../../docs/ai-dashboard/lib/muster-anrufe.mjs';

export class MusterAnrufFehler extends Error {}

export function musterAnrufePfad(privatDir) {
  return path.join(privatDir, 'muster-anrufe.json');
}

export function leseMusterAnrufe(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return {};
    throw new Error(`${path.basename(file)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!text.trim()) return {};
  let roh;
  try { roh = JSON.parse(text); } catch {
    throw new Error(`${path.basename(file)} ist beschädigt – bitte aus der Sicherung holen`);
  }
  return roh && typeof roh === 'object' && roh.eintraege && typeof roh.eintraege === 'object' ? roh.eintraege : {};
}

function schreibe(file, eintraege) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, eintraege }, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * Traegt einen Anruf (oder nur eine Notiz) fuer alle Bestellungen eines Kunden ein.
 * Mindestens Ergebnis oder Notiz; ohne Ergebnis bleibt das bisherige stehen.
 *
 * @returns {Record<string, object>} die neuen Eintraege je Bestellung (mit `vorher` fuer die Zeitleiste)
 */
export function trageAnrufEin(file, { orderIds, ergebnis = null, notiz = null, wiedervorlage = null, actor, jetzt = new Date() } = {}) {
  const ids = [...new Set((orderIds || []).map(id => String(id ?? '').trim()).filter(Boolean))];
  if (!ids.length) throw new MusterAnrufFehler('Bestellung fehlt');
  if (!actor) throw new MusterAnrufFehler('Wer angerufen hat, fehlt');
  const art = ergebnis ? anrufErgebnis(ergebnis) : null;
  if (ergebnis && !art) throw new MusterAnrufFehler(`Unbekanntes Ergebnis „${ergebnis}“`);
  const text = String(notiz ?? '').trim().slice(0, 2000) || null;
  if (!art && !text) throw new MusterAnrufFehler('Bitte ein Ergebnis anklicken oder eine Notiz eintippen');
  if (wiedervorlage && !/^\d{4}-\d{2}-\d{2}$/.test(String(wiedervorlage))) throw new MusterAnrufFehler('Das Datum für „Nochmal anrufen“ fehlt oder stimmt nicht');

  const alle = leseMusterAnrufe(file);
  const zeit = jetzt.toISOString();
  const neu = {};
  for (const orderId of ids) {
    const bisher = alle[orderId] || null;
    const eintrag = { ...bisher, orderId, aktualisiertAm: zeit, aktualisiertVon: actor };
    eintrag.versuche = (bisher?.versuche || 0) + (ergebnis === 'nicht_erreicht' ? 1 : 0);
    // Korrektur eines abgeschlossenen Anrufs: die Zeile muss wieder auf die Liste, obwohl die Positionen noch "erledigt" sind.
    if (art && bisher?.abgeschlossen && !art.fertig) eintrag.korrigiertAm = zeit;
    if (art) {
      eintrag.ergebnis = ergebnis;
      eintrag.abgeschlossen = Boolean(art.fertig);
      eintrag.wiedervorlage = art.fertig ? null : (wiedervorlage || wiedervorlageTag(art.tage, jetzt));
      if (ergebnis === 'nicht_erreicht' && eintrag.versuche >= HOECHSTENS_VERSUCHE) {
        eintrag.ergebnis = 'versuche_aus';
        eintrag.abgeschlossen = true;
        eintrag.wiedervorlage = null;
      }
    } else if (wiedervorlage) eintrag.wiedervorlage = wiedervorlage;
    if (art?.erreicht) eintrag.nachgefasst = true;
    if (text) eintrag.notiz = text;
    eintrag.verlauf = [{ am: zeit, von: actor, ergebnis: art ? eintrag.ergebnis : null, notiz: text }, ...(bisher?.verlauf || [])].slice(0, 50);
    alle[orderId] = eintrag;
    neu[orderId] = { ...eintrag, vorher: bisher };
  }
  schreibe(file, alle);
  return neu;
}
