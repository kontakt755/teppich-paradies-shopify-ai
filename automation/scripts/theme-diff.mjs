#!/usr/bin/env node
/**
 * Vergleicht ein Shopify-Theme mit dem Repository.
 *
 * Warum es das braucht: Aenderungen koennen ein Theme auch ohne Umweg ueber
 * git erreichen - jemand speichert im Theme-Editor, oder eine Sitzung pusht
 * direkt ueber die Admin API. Danach laeuft das Theme auseinander, ohne dass
 * es jemand bemerkt. Konkret gefunden: das Preview-Theme enthielt eine
 * blocks/tp-card-color-thumbs.liquid, die im Repository ueberhaupt nicht
 * existierte.
 *
 * Der Vergleich laeuft ueber checksumMd5 der Admin API, was nachweislich der
 * MD5-Summe der Rohbytes entspricht - lokale Datei und Theme-Datei sind also
 * exakt vergleichbar, ohne jede Datei herunterladen zu muessen.
 *
 * Ablauf:
 *   1. Manifest holen (Admin API, siehe docs/theme-diff.md)
 *   2. node automation/scripts/theme-diff.mjs --manifest <datei>
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..', '..');

// Verzeichnisse, die Shopify als Theme fuehrt.
const THEME_DIRS = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];

/**
 * settings_data.json haelt die im Admin gepflegten Shop-Einstellungen. Die
 * weichen zwangslaeufig ab und werden vom Deploy-Workflow bewusst geschuetzt
 * (settingsDataProtected) - eine Abweichung hier ist kein Fund, sondern der
 * Normalfall.
 */
const EXPECTED_DIVERGENCE = new Set(['config/settings_data.json']);

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'json' || key === 'report-only') flags[key] = true;
    else flags[key] = argv[++i];
  }
  return flags;
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function localManifest() {
  const map = new Map();
  for (const dir of THEME_DIRS) {
    for (const file of walk(path.join(root, dir))) {
      const relative = path.relative(root, file).split(path.sep).join('/');
      map.set(relative, createHash('md5').update(fs.readFileSync(file)).digest('hex'));
    }
  }
  return map;
}

const flags = parseArgs(process.argv.slice(2));
if (!flags.manifest) {
  console.error('Nutzung: theme-diff.mjs --manifest <datei.json> [--json] [--report-only]');
  console.error('Das Manifest wird ueber die Admin API erzeugt, siehe docs/theme-diff.md');
  process.exit(2);
}

const manifestPath = path.resolve(root, flags.manifest);
if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest nicht gefunden: ${manifestPath}`);
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const remote = new Map((manifest.files ?? []).map(file => [file.filename, file.checksumMd5]));
const local = localManifest();

const onlyRemote = [];
const onlyLocal = [];
const different = [];
const expected = [];
let same = 0;

for (const [filename, checksum] of remote) {
  if (EXPECTED_DIVERGENCE.has(filename)) { expected.push(filename); continue; }
  if (!local.has(filename)) onlyRemote.push(filename);
  else if (local.get(filename) !== checksum) different.push(filename);
  else same += 1;
}
for (const filename of local.keys()) {
  if (EXPECTED_DIVERGENCE.has(filename) || remote.has(filename)) continue;
  onlyLocal.push(filename);
}

const result = {
  themeId: manifest.themeId ?? null,
  themeName: manifest.themeName ?? null,
  same,
  onlyRemote: onlyRemote.sort(),
  onlyLocal: onlyLocal.sort(),
  different: different.sort(),
  expectedDivergence: expected.sort(),
};
const divergent = onlyRemote.length + onlyLocal.length + different.length;

if (flags.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Theme: ${result.themeName ?? '?'} (${result.themeId ?? '?'})`);
  console.log(`Identisch: ${same} Dateien\n`);

  // Der wichtigste Fall: liegt im Theme, aber in keinem Commit. Geht beim
  // naechsten Deploy aus dem Repo verloren.
  if (onlyRemote.length) {
    console.log(`NUR IM THEME (${onlyRemote.length}) - nicht im Repository, geht beim naechsten Deploy verloren:`);
    for (const file of onlyRemote) console.log(`  ${file}`);
    console.log('');
  }
  if (different.length) {
    console.log(`INHALT WEICHT AB (${different.length}):`);
    for (const file of different) console.log(`  ${file}`);
    console.log('');
  }
  if (onlyLocal.length) {
    console.log(`NUR IM REPOSITORY (${onlyLocal.length}) - noch nicht deployed:`);
    for (const file of onlyLocal) console.log(`  ${file}`);
    console.log('');
  }
  if (expected.length) console.log(`Erwartete Abweichung uebersprungen: ${expected.join(', ')}\n`);
  console.log(divergent === 0 ? 'Theme und Repository sind deckungsgleich.' : `${divergent} Abweichung(en).`);
}

process.exitCode = divergent > 0 && !flags['report-only'] ? 1 : 0;
