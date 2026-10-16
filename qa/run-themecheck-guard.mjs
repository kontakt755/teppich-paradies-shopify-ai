import path from 'node:path';
import process from 'node:process';
import { BASELINE_FILE, evaluateGuard, readBaseline, runThemeCheck } from './theme-check.mjs';

/**
 * npm run themecheck:guard - vor jedem Commit.
 *
 * Meldet Theme-Check-Fehler und neue Warnungen gegenueber
 * qa/theme-check-baseline.json, mit derselben Logik wie FULL_QA
 * (qa/theme-check.mjs). Frueher lief hier "shopify theme check --fail-level
 * error": neue Warnungen fielen erst im Deploy auf.
 */

const root = path.resolve(import.meta.dirname, '..');
const themeCheck = await runThemeCheck({ root });
if (themeCheck.failed) {
  console.error(`FEHLER ${themeCheck.error}`);
  process.exit(1);
}
const { lines, exitCode } = evaluateGuard(themeCheck.findings, readBaseline(path.join(root, BASELINE_FILE)));
for (const line of lines) console.log(line);
process.exit(exitCode);
