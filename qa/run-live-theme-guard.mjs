/**
 * Runner fuer den Live-Theme-Guard. Regeln in qa/live-theme-guard.mjs,
 * Konfiguration in qa/live-theme-guard.config.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { analyze } from './live-theme-guard.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = JSON.parse(read('qa/live-theme-guard.config.json'));

const registry = JSON.parse(read(config.registry));
const riskMap = JSON.parse(read(config.riskMap));

// Fehlende Quelldateien werden uebersprungen statt zu brechen: die Liste darf
// Dateien nennen, die es noch nicht ueberall gibt.
const sources = config.sources
  .filter(name => fs.existsSync(path.join(root, name)))
  .map(name => ({ name, text: read(name) }));

const findings = analyze({ sources, registry, protectedResources: riskMap.protectedResources });
const errors = findings.filter(finding => finding.severity === 'error');
const warnings = findings.filter(finding => finding.severity === 'warn');

for (const w of warnings) console.log(`WARN  [${w.rule}] ${w.message}`);
for (const e of errors) console.error(`ERROR [${e.rule}] ${e.message}`);

const live = registry.live;
console.log(
  `Live-Theme-Guard: ${sources.length} Anweisungsdateien geprueft, ` +
  `Live ist ${live?.name} (${live?.themeId}, geprueft ${live?.verifiedAt}), ` +
  `${errors.length} Fehler, ${warnings.length} Warnungen.`
);
process.exitCode = errors.length ? 1 : 0;
