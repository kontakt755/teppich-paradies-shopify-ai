/**
 * Lagerware: Ware, die wir aus eigener Lagerrolle zuschneiden und selbst verschicken, obwohl sie
 * in Shopify als Ware eines Lieferanten gefuehrt wird (Inhaber 06.11.2026, #1995: der Hersteller
 * schickt keine Einzelzuschnitte). Welche Artikel das sind, steht nur in der privaten Regeldatei
 * $TP_PRIVAT_DIR/lieferanten/lagerware.json - nie im Repository:
 *
 *   { "_zweck": "…", "regeln": [{ "skuPraefix": "<Praefix>", "hinweis": "<Text fuer den Laden>" }] }
 *
 * Fehlt die Datei, gibt es keine Regeln. Ist sie beschaedigt, wirft das Lesen - nie still leer
 * (Skill control-center, Fallstrick "Eine lokale Ablage liest nur eine FEHLENDE Datei als leer"):
 * sonst landete Lagerware unbemerkt wieder in der Bestellmail an den Lieferanten.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lagerRegelFuer } from '../../docs/ai-dashboard/lib/lieferweg.mjs';

export class LagerwareFehler extends Error {}

export function lagerwarePfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'lieferanten', 'lagerware.json');
}

/** Regeln der Datei; fehlende Datei = keine Regeln, unlesbar/beschaedigt = LagerwareFehler. */
export function leseLagerware(file = lagerwarePfad()) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return { vorhanden: false, regeln: [] };
    throw new LagerwareFehler(`${path.basename(file)} ist nicht lesbar (${e?.code || e?.message}) – Lagerware wird nicht erkannt.`);
  }
  let roh;
  try { roh = JSON.parse(text); } catch {
    throw new LagerwareFehler(`${path.basename(file)} ist beschädigt – Lagerware wird nicht erkannt. Bitte die Datei reparieren oder aus der Sicherung holen.`);
  }
  const regeln = roh?.regeln;
  if (!roh || typeof roh !== 'object' || Array.isArray(roh) || !Array.isArray(regeln)
    || regeln.some(r => !r || typeof r !== 'object' || Array.isArray(r) || typeof r.skuPraefix !== 'string' || r.skuPraefix.trim().length < 2
      || (r.hinweis != null && typeof r.hinweis !== 'string'))) {
    throw new LagerwareFehler(`${path.basename(file)} hat einen ungültigen Aufbau (erwartet: regeln mit skuPraefix und hinweis) – Lagerware wird nicht erkannt.`);
  }
  return { vorhanden: true, regeln: regeln.map(r => ({ skuPraefix: r.skuPraefix.trim(), hinweis: r.hinweis ? String(r.hinweis).trim().slice(0, 300) : null })) };
}

/**
 * Markiert im Bestellmodell jede Warenposition, deren SKU zu einer Regel passt: `lagerware: true`
 * und `lagerHinweis`. Muster und Eigenleistungen nie. Alle vier Listen, weil `gruppen` Kopien
 * der Positionen enthalten (bestelluebersicht.mjs). Gibt die Zahl markierter Auftragspositionen zurueck.
 */
export function markiereLagerware(modell, regeln = []) {
  if (!modell || !regeln.length) return 0;
  let anzahl = 0;
  const markiere = (p, zaehlen) => {
    if (!p || p.istMuster || p.eigenleistung) return;
    const regel = lagerRegelFuer(p.sku, regeln);
    if (!regel) return;
    p.lagerware = true;
    p.lagerHinweis = regel.hinweis || null;
    if (zaehlen) anzahl += 1;
  };
  for (const a of [...(modell.auftraege || []), ...(modell.testauftraege || [])]) for (const p of a.positionen || []) markiere(p, true);
  for (const g of [...(modell.gruppen || []), ...(modell.musterGruppen || [])]) for (const p of g.positionen || []) markiere(p, false);
  return anzahl;
}
