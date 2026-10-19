import path from 'node:path';
import process from 'node:process';
import { BASELINE_FILE, evaluateGuard, readBaseline, runThemeCheck, writeBaseline } from './theme-check.mjs';

/**
 * npm run themecheck:guard - vor jedem Commit.
 *
 * Meldet Theme-Check-Fehler und neue Warnungen gegenueber
 * qa/theme-check-baseline.json, mit derselben Logik wie FULL_QA
 * (qa/theme-check.mjs). Frueher lief hier "shopify theme check --fail-level
 * error": neue Warnungen fielen erst im Deploy auf.
 *
 * --update-baseline schreibt die Baseline aus dem aktuellen Stand neu, ohne
 * Browser und Storefront (gleiche Datei wie "npm run qa -- --update-baseline").
 * Fehler blockieren danach weiter (theme push --strict).
 */

const args = process.argv.slice(2);
const unknown = args.filter(arg => arg !== '--update-baseline');
if (unknown.length) {
  console.error(`FEHLER unbekannte Option: ${unknown.join(' ')} (erlaubt: --update-baseline)`);
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
const baselinePath = path.join(root, BASELINE_FILE);
const themeCheck = await runThemeCheck({ root });
if (themeCheck.failed) {
  console.error(`FEHLER ${themeCheck.error}`);
  process.exit(1);
}
if (args.includes('--update-baseline')) {
  writeBaseline(baselinePath, themeCheck.findings);
  console.log(`Baseline neu geschrieben: ${BASELINE_FILE} (${themeCheck.errors} Fehler / ${themeCheck.warnings} Warnungen).`);
}
const { lines, exitCode } = evaluateGuard(themeCheck.findings, readBaseline(baselinePath));
for (const line of lines) console.log(line);
process.exit(exitCode);
