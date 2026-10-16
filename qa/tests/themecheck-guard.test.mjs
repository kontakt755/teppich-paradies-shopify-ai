import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateGuard, findingsFromFiles, newFindings } from '../theme-check.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const fixtureDir = path.join(import.meta.dirname, 'fixtures', 'theme-check-ca52a114');
const readJson = name => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf8'));

// Echte Ausgabe von "shopify theme check --output json" auf Commit ca52a114
// (PR #1347, Pfade auf /theme gekuerzt) und die Baseline dieses Commits.
// FULL_QA brach damals an genau diesen zwei Warnungen ab, der alte Guard
// ("--fail-level error") war gruen.
const themeRoot = '/theme';
const ca52Findings = () => findingsFromFiles(themeRoot, readJson('theme-check.json'));
const ca52Baseline = () => readJson('baseline.json');

test('Guard findet die beiden neuen Warnungen aus #1347 (Stand ca52a114)', () => {
  const result = evaluateGuard(ca52Findings(), ca52Baseline());
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.blocking.map(x => [x.severity, x.file, x.check, x.line]).sort((a, b) => a[3] - b[3]), [
    ['warning', 'blocks/tp-einfass-konfigurator.liquid', 'LiquidComplexity', 212],
    ['warning', 'blocks/tp-einfass-konfigurator.liquid', 'ExcessiveSettingsCount', 635]
  ]);
  const output = result.lines.join('\n');
  assert.match(output, /^NEU warning blocks\/tp-einfass-konfigurator\.liquid:635 ExcessiveSettingsCount – This schema declares 44 settings/m);
  assert.match(output, /^NEU warning blocks\/tp-einfass-konfigurator\.liquid:212 LiquidComplexity – /m);
  assert.match(output, /0 Fehler, 2 neue Warnungen/);
});

test('Guard und FULL_QA sehen dieselben neuen Befunde', () => {
  const findings = ca52Findings();
  const baseline = ca52Baseline();
  assert.deepEqual(evaluateGuard(findings, baseline).newFindings, newFindings(findings, baseline));
});

test('bekannte Warnungen bleiben still, auch wenn sich die Zeile verschiebt', () => {
  const files = readJson('theme-check.json').filter(file => !file.path.endsWith('tp-einfass-konfigurator.liquid'));
  for (const file of files) for (const offense of file.offenses) offense.start_row += 7;
  const result = evaluateGuard(findingsFromFiles(themeRoot, files), ca52Baseline());
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.blocking, []);
});

test('mehr Einstellungen als in der Baseline ist ein neuer Befund', () => {
  const files = [{
    path: '/theme/blocks/tp-kachel-raster.liquid',
    offenses: [{ check: 'ExcessiveSettingsCount', severity: 'warning', start_row: 156, start_column: 0,
      message: 'This schema declares 49 settings, which exceeds the maximum of 40. Consider splitting this section or block into smaller pieces, or grouping related options with a header.' }]
  }];
  const result = evaluateGuard(findingsFromFiles(themeRoot, files), ca52Baseline());
  assert.equal(result.exitCode, 1);
  assert.match(result.lines[0], /^NEU warning blocks\/tp-kachel-raster\.liquid:157 ExcessiveSettingsCount/);
});

test('Fehler blockieren auch dann, wenn sie in der Baseline stehen (theme push --strict)', () => {
  const files = [{
    path: '/theme/snippets/x.liquid',
    offenses: [{ check: 'LiquidHTMLSyntaxError', severity: 'error', start_row: 4, start_column: 2, message: 'kaputt' }]
  }];
  const findings = findingsFromFiles(themeRoot, files);
  const baseline = { errors: 1, warnings: 0, fingerprints: findings.map(x => x.fingerprint) };
  const result = evaluateGuard(findings, baseline);
  assert.equal(result.exitCode, 1);
  assert.match(result.lines[0], /^FEHLER error snippets\/x\.liquid:5 LiquidHTMLSyntaxError – kaputt$/);
});

test('npm run themecheck:guard und FULL_QA nutzen dasselbe Modul', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['themecheck:guard'], 'node qa/run-themecheck-guard.mjs');
  const runQa = fs.readFileSync(path.join(root, 'qa', 'run-qa.mjs'), 'utf8');
  assert.match(runQa, /from '\.\/theme-check\.mjs'/);
  assert.doesNotMatch(runQa, /function (stableFingerprint|fingerprint|runThemeCheck)\b/);
  assert.match(fs.readFileSync(path.join(root, 'qa', 'run-themecheck-guard.mjs'), 'utf8'), /from '\.\/theme-check\.mjs'/);
});
