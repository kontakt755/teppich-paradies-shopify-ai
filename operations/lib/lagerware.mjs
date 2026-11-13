/**
 * Lagerware: Ware, die wir aus eigener Lagerrolle zuschneiden und selbst verschicken, obwohl sie
 * in Shopify als Ware eines Lieferanten gefuehrt wird (Inhaber 06.11.2026, #1995: der Hersteller
 * schickt keine Einzelzuschnitte). Welche Artikel das sind, steht nur in der privaten Regeldatei
 * $TP_PRIVAT_DIR/lieferanten/lagerware.json - nie im Repository:
 *
 *   { "_zweck": "…", "regeln": [{ "skuPraefix": "<Praefix>", "hinweis": "<Text fuer den Laden>" }],
 *     "ohneRolle": [{ "skuPraefix": "<Praefix>", "hinweis": "<Text>" }] }
 *
 * `regeln` = die Rolle liegt im Laden. `ohneRolle` (optional, 13.11.2026) = Unterlagen, die wir schneiden
 * wuerden, von denen aber keine Rolle im Laden liegt: keine Lagerware, sie werden normal bestellt und
 * stehen unter "Noch zu schneiden" als "nichts zu schneiden" (docs/ai-dashboard/lib/zuschnitt.mjs).
 * Passt eine SKU auf beide Listen, gewinnt `ohneRolle` - so faellt eine einzelne Breite aus einer Regel heraus.
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
    if (e?.code === 'ENOENT') return { vorhanden: false, regeln: [], ohneRolle: [] };
    throw new LagerwareFehler(`${path.basename(file)} ist nicht lesbar (${e?.code || e?.message}) – Lagerware wird nicht erkannt.`);
  }
  let roh;
  try { roh = JSON.parse(text); } catch {
    throw new LagerwareFehler(`${path.basename(file)} ist beschädigt – Lagerware wird nicht erkannt. Bitte die Datei reparieren oder aus der Sicherung holen.`);
  }
  const regeln = roh?.regeln;
  const ohneRolle = roh?.ohneRolle ?? [];
  const kaputt = r => !r || typeof r !== 'object' || Array.isArray(r) || typeof r.skuPraefix !== 'string' || r.skuPraefix.trim().length < 2
    || (r.hinweis != null && typeof r.hinweis !== 'string');
  if (!roh || typeof roh !== 'object' || Array.isArray(roh) || !Array.isArray(regeln) || !Array.isArray(ohneRolle) || regeln.some(kaputt) || ohneRolle.some(kaputt)) {
    throw new LagerwareFehler(`${path.basename(file)} hat einen ungültigen Aufbau (erwartet: regeln mit skuPraefix und hinweis) – Lagerware wird nicht erkannt.`);
  }
  const sauber = r => ({ skuPraefix: r.skuPraefix.trim(), hinweis: r.hinweis ? String(r.hinweis).trim().slice(0, 300) : null });
  return { vorhanden: true, regeln: regeln.map(sauber), ohneRolle: ohneRolle.map(sauber) };
}

/**
 * Markiert im Bestellmodell jede Warenposition, deren SKU zu einer Regel passt: `lagerware: true`
 * und `lagerHinweis`. Muster und Eigenleistungen nie. Alle vier Listen, weil `gruppen` Kopien
 * der Positionen enthalten (bestelluebersicht.mjs). Gibt die Zahl markierter Auftragspositionen zurueck.
 * SKUs aus `ohneRolle` bekommen `ohneRolle: true` und sind keine Lagerware (nicht mitgezaehlt).
 */
export function markiereLagerware(modell, regeln = [], ohneRolle = []) {
  if (!modell || !(regeln.length || ohneRolle.length)) return 0;
  let anzahl = 0;
  const markiere = (p, zaehlen) => {
    if (!p || p.istMuster || p.eigenleistung) return;
    const fehlt = lagerRegelFuer(p.sku, ohneRolle);
    if (fehlt) { p.ohneRolle = true; p.lagerHinweis = fehlt.hinweis || null; return; }
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
