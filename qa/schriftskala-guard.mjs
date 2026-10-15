/**
 * Haelt die Schriftskala (snippets/tp-gestaltung.liquid) beisammen.
 *
 * Warum: Bis 2026-10-15 setzte jeder Baustein seine eigene Groesse - rund
 * 1.000 feste Werte von 9 bis 56 px, dazu em-Ketten. Die Startseite zeigte
 * 21 verschiedene Schriftgroessen im Hauptbereich, die Produktseite 22
 * (13,952 px, 17,4496 px ...). Seit dem Shopvergleich (Massnahme F) gibt es
 * sechs Stufen als Variablen: var(--tp-fs-xs|sm|md|lg|xl|2xl), am Telefon
 * kleiner. Dieser Guard meldet jede neue feste Groesse in px, rem oder
 * clamp() - genau so ist die Streuung entstanden.
 *
 * Bewusst ausgenommen: Kopf und Menue (eigene Menue-Variablen von Horizon,
 * #1313/#1325), die Horizon-Basis (assets/base.css nutzt die umgestellten
 * --font-size-*-Variablen), die Skala selbst, Werte aus Theme-Einstellungen
 * ({{ ... }}), em-/Prozentwerte, inherit und max(16px, 1em) fuer Eingabefelder
 * (verhindert das Hineinzoomen am iPhone).
 */
import fs from 'node:fs';
import path from 'node:path';

export const ORDNER = ['blocks', 'snippets', 'sections', 'assets', 'layout'];

export const AUSGENOMMEN = new Set([
  'assets/base.css',
  'snippets/theme-styles-variables.liquid',
  'snippets/tp-gestaltung.liquid',
]);

/** Kopf, Menue und Suche haben eigene Menue-Groessen. */
export const KOPF_UND_MENUE = /(^|\/)(_?header|tp-header|tp-kopf|tp-mega|tp-nav\.css|_tp-menu|tp-menu-|menu\.liquid|mega-menu|menu-font|submenu-font|tp-drawer-|search-header|predictive-search)/;

const FESTER_WERT = /font-size\s*:\s*([^;}"'\n]+?)(?=\s*(!important)?\s*[;}"'\n])/g;

/** Ist ein font-size-Wert eine feste Groesse ausserhalb der Skala? */
export function istFest(wert) {
  const v = wert.trim();
  if (v.includes('{{') || v.includes('var(')) return false;
  if (/^max\(\s*16px\s*,\s*1em\s*\)$/.test(v)) return false;
  return /\d(px|rem)\b/.test(v) || /^clamp\(/.test(v);
}

/** Feste Groessen in einem Dateiinhalt, mit Zeilennummer. */
export function befundeIn(text, datei) {
  const treffer = [];
  for (const m of text.matchAll(FESTER_WERT)) {
    if (!istFest(m[1])) continue;
    const zeile = text.slice(0, m.index).split('\n').length;
    treffer.push({ datei, zeile, wert: m[1].trim() });
  }
  return treffer;
}

export function pruefe(wurzel) {
  const befunde = [];
  let geprueft = 0;
  const gehe = (rel) => {
    const abs = path.join(wurzel, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) { gehe(r); continue; }
      if (!/\.(liquid|css)$/.test(e.name) || /\.min\./.test(e.name)) continue;
      if (AUSGENOMMEN.has(r) || KOPF_UND_MENUE.test(r)) continue;
      geprueft++;
      befunde.push(...befundeIn(fs.readFileSync(path.join(wurzel, r), 'utf8'), r));
    }
  };
  ORDNER.forEach(gehe);
  return { geprueft, befunde };
}
