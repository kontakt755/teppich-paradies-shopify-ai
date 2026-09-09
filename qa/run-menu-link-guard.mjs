/**
 * Runner fuer den Menuelink-Guard. Regeln in qa/menu-link-guard.mjs.
 *
 *   npm run menu:guard                    # Storefront aus live-theme.json
 *   npm run menu:guard -- --base <url>    # anderer Shop/Preview
 *
 * Braucht Netz. Ohne Netz: SKIP, kein Fehler (siehe Kopf der Regeldatei).
 */
import process from 'node:process';
import { extractMenuLinks, classify } from './menu-link-guard.mjs';

const BASE_DEFAULT = 'https://www.teppich-paradies.net';
const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
// Ohne --base ist baseIdx -1; dann darf baseIdx + 1 nicht versehentlich
// Position 0 als Wertposition freistellen - sonst rutscht das erste
// unbekannte Flag stillschweigend durch.
const wertPos = baseIdx >= 0 ? baseIdx + 1 : -1;
const unknown = args.filter((a, i) => a.startsWith('--') && a !== '--base' && i !== wertPos);
if (unknown.length) {
  console.error(`Unbekanntes Flag: ${unknown.join(', ')}. Bekannt ist nur --base <url>.`);
  process.exit(2);
}
const base = (baseIdx >= 0 ? args[baseIdx + 1] : BASE_DEFAULT)?.replace(/\/$/, '');

const UA = 'Mozilla/5.0 (compatible; teppichparadies-menu-guard)';
const hole = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  return { status: res.status, body: await res.text() };
};

let start;
try {
  start = await hole(base + '/');
} catch (err) {
  console.log(`Menuelink-Guard: SKIP - Storefront nicht erreichbar (${err.cause?.code ?? err.message}).`);
  console.log('  In Remote-Sessions blockt die Egress-Policy die Storefront; lokal erneut laufen lassen.');
  process.exit(0);
}
if (start.status !== 200) {
  console.error(`ERROR [MENU_START] Startseite liefert HTTP ${start.status} - Menue nicht lesbar.`);
  process.exit(1);
}

const links = extractMenuLinks(start.body);
if (!links.length) {
  console.error('ERROR [MENU_LEER] Im Kopfbereich wurde kein einziger Menuelink gefunden.');
  console.error('  Entweder hat sich das Markup geaendert, oder das Menue ist leer. Beides ist ein Befund.');
  process.exit(1);
}

const findings = [];
for (const href of links) {
  const url = href.startsWith('http') ? href : base + href;
  try {
    const { status, body } = await hole(url);
    findings.push(classify({ url, status, body }));
  } catch (err) {
    findings.push({ url, severity: 'error', rule: 'MENU_LINK_TOT', message: `Abruf fehlgeschlagen: ${url} (${err.message})` });
  }
}

const errors = findings.filter(f => f.severity === 'error');
for (const e of errors) console.error(`ERROR [${e.rule}] ${e.message}`);
console.log(`Menuelink-Guard: ${findings.length} Menuelinks geprueft, ${errors.length} Fehler.`);
process.exitCode = errors.length ? 1 : 0;
