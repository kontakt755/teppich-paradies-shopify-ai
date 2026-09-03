/**
 * Runner fuer den Schema-Guard. Die Pruefregeln stehen in qa/schema-guard.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { analyzeSchemaSource, schemaLine } from './schema-guard.mjs';

const root = path.resolve(import.meta.dirname, '..');
const THEME_DIRS = ['blocks', 'sections'];

function collect(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter(name => name.endsWith('.liquid'))
    .map(name => ({ dir, name, file: path.join(full, name) }));
}

const errors = [];
const warnings = [];
let checked = 0;

for (const entry of THEME_DIRS.flatMap(collect)) {
  const source = fs.readFileSync(entry.file, 'utf8');
  const { hasSchema, findings } = analyzeSchemaSource({ source, dir: entry.dir, name: entry.name });
  if (!hasSchema) continue;

  checked += 1;
  const line = schemaLine(source);
  for (const finding of findings) {
    const item = { file: path.join(entry.dir, entry.name), line, ...finding };
    (finding.severity === 'warn' ? warnings : errors).push(item);
  }
}

for (const w of warnings) console.log(`WARN  ${w.file}:${w.line} [${w.rule}] ${w.message}`);
for (const e of errors) console.error(`ERROR ${e.file}:${e.line} [${e.rule}] ${e.message}`);

console.log(`Schema-Guard: ${checked} Schemata geprueft, ${errors.length} Fehler, ${warnings.length} Warnungen.`);
process.exitCode = errors.length ? 1 : 0;
