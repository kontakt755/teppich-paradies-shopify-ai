/**
 * Haelt die Google-Bewertung bei einer Quelle.
 *
 * Warum: Wert, Anzahl und Link standen bis 2026-09-16 an zehn Stellen
 * einzeln in den Templates - zwei Startseiten-Abschnitte und acht
 * Produktvorlagen. Sie waren bereits auseinandergelaufen: sieben Vorlagen
 * nannten 4,9, product.einfassung 4.8, und der Link zeigte in sieben Faellen
 * auf das Unternehmensprofil, in einem auf eine Google-Suche. Gemerkt hat das
 * niemand, weil jede Seite fuer sich plausibel aussah.
 *
 * Seither gilt die Theme-Einstellung "TP Google-Bewertung". Ein Wert am
 * Abschnitt selbst bleibt technisch moeglich (als bewusste Ausnahme), aber
 * dieser Guard meldet ihn - denn genau so ist die Drift entstanden.
 *
 * Bewusst nur Templates im Repository: Was jemand im Theme-Editor eintraegt,
 * landet dort ebenfalls und wird beim naechsten Pull sichtbar.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Entfernt den von Shopify erzeugten Kommentarkopf, den JSON.parse nicht kennt. */
export function stripHeader(raw) {
  const match = raw.match(/^\s*\/\*[\s\S]*?\*\/\s*/);
  return match ? raw.slice(match[0].length) : raw;
}

/** Felder, die je Blocktyp nicht mehr im Template stehen sollen. */
export const GEPRUEFTE_FELDER = {
  'tp-bewertungsbeleg': ['rating', 'review_count', 'review_link'],
  'tp-start-hero': ['rating_wert', 'rating_text'],
  'tp-start-trust': ['rating_wert', 'rating_text'],
};

/** Sammelt alle belegten Bewertungsfelder eines Template-Inhalts. */
export function befundeIn(raw, datei) {
  const treffer = [];
  const gehe = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(gehe); return; }
    const felder = GEPRUEFTE_FELDER[node.type];
    if (felder && node.settings && typeof node.settings === 'object') {
      for (const feld of felder) {
        const wert = node.settings[feld];
        if (typeof wert === 'string' && wert.trim() !== '') {
          treffer.push({ datei, typ: node.type, feld, wert: wert.trim() });
        }
      }
    }
    for (const wert of Object.values(node)) gehe(wert);
  };
  gehe(JSON.parse(stripHeader(raw)));
  return treffer;
}

/** Prueft alle Templates eines Verzeichnisses. */
export function pruefe(wurzel) {
  const ordner = path.join(wurzel, 'templates');
  if (!fs.existsSync(ordner)) return { geprueft: 0, befunde: [] };
  const dateien = fs.readdirSync(ordner).filter((n) => n.endsWith('.json'));
  const befunde = [];
  for (const name of dateien) {
    const raw = fs.readFileSync(path.join(ordner, name), 'utf8');
    try {
      befunde.push(...befundeIn(raw, `templates/${name}`));
    } catch {
      // Unlesbares JSON meldet der template:guard - hier nicht doppelt.
    }
  }
  return { geprueft: dateien.length, befunde };
}
