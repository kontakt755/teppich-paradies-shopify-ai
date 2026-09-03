/**
 * Runner fuer den Template-Guard. Regeln in qa/template-guard.mjs,
 * Konfiguration in qa/template-guard.config.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { analyzeTemplates, blockTypesOf } from './template-guard.mjs';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'qa/template-guard.config.json'), 'utf8'));
const rx = new RegExp(config.pattern);

const templates = [];
for (const name of fs.readdirSync(path.join(root, 'templates')).filter(file => rx.test(file)).sort()) {
  const types = blockTypesOf(fs.readFileSync(path.join(root, 'templates', name), 'utf8'), config.parent);
  if (types) templates.push({ name, types });
}

const findings = analyzeTemplates(templates, config);
const errors = findings.filter(finding => finding.severity === 'error');
const warnings = findings.filter(finding => finding.severity === 'warn');

for (const w of warnings) console.log(`WARN  [${w.rule}] ${w.message}`);
for (const e of errors) console.error(`ERROR [${e.rule}] ${e.message}`);

console.log(`Template-Guard: ${templates.length} Templates geprueft, ${errors.length} Fehler, ${warnings.length} Warnungen.`);
process.exitCode = errors.length ? 1 : 0;
