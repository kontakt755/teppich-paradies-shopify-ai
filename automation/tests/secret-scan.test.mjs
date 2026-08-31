import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { discoverGitFiles, formatScanResult, scanFiles, scanText } from '../core/secret-scan.mjs';

test('clean fixture PASS', () => {
  const root = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
  assert.equal(scanFiles({ root, files: ['automation/fixtures/secret-clean.txt'] }).status, 'PASS');
});

test('artificial secret BLOCK without exposing value', () => {
  const fake = ['ghp', 'A'.repeat(24)].join('_');
  const result = { status: 'BLOCK', findings: scanText({ file: 'fixture.txt', text: `token=${fake}` }) };
  const output = formatScanResult(result);
  assert.equal(result.status, 'BLOCK');
  assert.match(output, /GITHUB_TOKEN/);
  assert.doesNotMatch(output, new RegExp(fake));
});

test('explicit .env path BLOCK', () => assert.equal(scanText({ file: '.env', text: 'SAFE_PLACEHOLDER=true' })[0].rule, 'SECRET_FILE'));

test('.env template with placeholders only PASSES', () => {
  assert.deepEqual(scanText({ file: '.env.local.example', text: 'ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE' }), []);
});

test('a real key inside a template is still BLOCKED', () => {
  const fake = ['sk-ant-api03', 'B'.repeat(28)].join('-');
  const findings = scanText({ file: '.env.local.example', text: `ANTHROPIC_API_KEY=${fake}` });
  const output = formatScanResult({ status: 'BLOCK', findings });
  assert.ok(findings.some(finding => finding.rule === 'ANTHROPIC_KEY'));
  assert.doesNotMatch(output, new RegExp(fake));
});

test('template exception does not apply to a plain .env path', () => {
  assert.equal(scanText({ file: '.env.local', text: 'SAFE_PLACEHOLDER=true' })[0].rule, 'SECRET_FILE');
});

test('git ignored files are excluded from default discovery', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-secret-git-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  fs.writeFileSync(path.join(root, '.gitignore'), '.env\n');
  fs.writeFileSync(path.join(root, '.env'), 'ignored');
  fs.writeFileSync(path.join(root, 'visible.txt'), 'visible');
  assert.deepEqual(discoverGitFiles({ root }).sort(), ['.gitignore', 'visible.txt']);
});

test('finding output contains only file line and rule', () => {
  const finding = scanText({ file: 'x.txt', text: `password=${'Z'.repeat(12)}` })[0];
  assert.deepEqual(Object.keys(finding), ['file', 'line', 'rule']);
});

test('URL auth query is blocked without exposing its value', () => {
  const callback = new URL('/services/login_with_shop/buyer/callback', 'https://example.test');
  const fakeValue = `FAKE_${'Q'.repeat(20)}`;
  callback.searchParams.set('signature', fakeValue);
  callback.searchParams.set('harmless', 'visible');
  const findings = scanText({ file: 'report.md', text: `Callback: ${callback.href}` });
  const output = formatScanResult({ status: 'BLOCK', findings });
  assert.ok(findings.some(finding => finding.rule === 'URL_AUTH_QUERY'));
  assert.doesNotMatch(output, new RegExp(fakeValue));
});

test('template files are exempt from the path rule but not from content rules', () => {
  // .env.local.example gehoert als Vorlage ins Repo und darf den Gate nicht blocken.
  assert.deepEqual(scanText({ file: '.env.local.example', text: 'ANTHROPIC_API_KEY=sk-ant-xxxxx' }), []);
  assert.deepEqual(scanText({ file: 'config/secrets.json.sample', text: 'PLACEHOLDER=true' }), []);
  // Ein echtes Secret in derselben Datei muss weiterhin blocken.
  const fake = ['ghp', 'B'.repeat(24)].join('_');
  assert.equal(scanText({ file: '.env.local.example', text: `token=${fake}` })[0].rule, 'GITHUB_TOKEN');
  // Die echte .env bleibt gesperrt.
  assert.equal(scanText({ file: '.env', text: 'SAFE_PLACEHOLDER=true' })[0].rule, 'SECRET_FILE');
});
