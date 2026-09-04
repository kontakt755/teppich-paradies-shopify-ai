import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { assignedValue, discoverGitFiles, formatScanResult, looksLikeSecretValue, scanFiles, scanText } from '../core/secret-scan.mjs';

const rules = line => scanText({ file: 'beispiel.mjs', text: line }).map(finding => finding.rule);

// Der Scan meldete dauerhaft BLOCK auf gewoehnlichem Code, der einen Wert nur
// weiterreicht (`const cookie = request.headers.cookie`). Ein Gate, das immer
// rot leuchtet, wird ignoriert - und faengt dann auch das echte Geheimnis nicht.
test('code that merely passes a value through is not a secret', () => {
  for (const line of [
    "const cookie = request.headers.cookie || '';",
    '  sessionId: input.session_id,',
    'clearClaudeSessionState({ sessionId: input.session_id, projectDir });',
    'password: process.env.DB_PASSWORD,',
    'api_key: config.apiKey,',
    'session_token = getToken()',
  ]) {
    assert.deepEqual(rules(line), [], line);
  }
});

test('speaking placeholders in fixtures and docs are not secrets', () => {
  for (const line of [
    "const input = { sessionId: 'private-session-id', projectDir: '/project' };",
    '// password: your-password-here',
    "api_key: 'example-key-placeholder'",
    "password = 'changeme'",
  ]) {
    assert.deepEqual(rules(line), [], line);
  }
});

// Die erfundenen Werte werden zur Laufzeit zusammengesetzt (Konvention dieser
// Datei), damit der Scan nicht an seinen eigenen Testdaten blockt.
const fakeToken = (seed, length = 18) => Array.from({ length }, (_, index) => 'abcdefghijkmnpqrstuvwxyz23456789'[(seed * 7 + index * 13) % 32]).join('');

test('a real assigned secret is still caught in every heuristic rule', () => {
  assert.deepEqual(rules(`password=${'Z'.repeat(12)}`), ['PASSWORD_ASSIGNMENT']);
  assert.deepEqual(rules(`session_token = "${fakeToken(1)}"`), ['SESSION_COOKIE']);
  assert.deepEqual(rules(`api_key: "${fakeToken(2)}"`), ['GENERIC_API_KEY']);
  assert.deepEqual(rules(`cookie: "tp_dashboard=${fakeToken(3)}"`), ['SESSION_COOKIE']);
});

// Die Wertpruefung gilt bewusst nur fuer die schwachen Heuristiken. Ein echter
// Anbieter-Key bleibt auch dann ein Fund, wenn er wie ein Platzhalter benannt ist.
test('a provider-prefixed key is caught even when it looks like a test value', () => {
  const fake = ['sk-ant-api03', 'C'.repeat(28)].join('-');
  assert.ok(rules(`const testKey = "${fake}"; // example fixture`).includes('ANTHROPIC_KEY'));
  const token = ['ghp', 'D'.repeat(24)].join('_');
  assert.ok(rules(`password: "${token}"`).includes('GITHUB_TOKEN'));
});

test('an unquoted value ends at the first separator, not at the end of the line', () => {
  assert.deepEqual(assignedValue('input.session_id, projectDir });'), { value: 'input.session_id', quoted: false });
  assert.deepEqual(assignedValue('"a7f3k2m9x4p1q8w5"'), { value: 'a7f3k2m9x4p1q8w5', quoted: true });
  assert.equal(looksLikeSecretValue({ value: 'short', quoted: true }, 12), false);
});

// Alle vier Faelle stammen aus der unabhaengigen Codex-Pruefung dieser
// Abschwaechung. Sie pruefen, dass die Wertheuristik kein echtes Geheimnis
// durchlaesst - die eigentliche Gefahr beim Entschaerfen eines Gates.
const fakeJwt = () => ['ey', 'J', fakeToken(4, 16), '.', fakeToken(5, 20), '.', fakeToken(6, 24)].join('');

test('a value in quotes is never treated as code, so dotted secrets stay caught', () => {
  // Ein JWT und jedes punktgetrennte Token wurden sonst als "Code" abgetan.
  assert.ok(rules(`access_token: "${fakeJwt()}"`).length);
  assert.ok(rules(`api_key = "${fakeToken(7)}.prod"`).includes('GENERIC_API_KEY'));
  assert.ok(rules(`session_token="${['abc', 'def', 'ghi', 'jkl', 'mno', 'pqr'].join('.')}"`).includes('SESSION_COOKIE'));
});

test('a placeholder word inside a random token does not excuse the whole value', () => {
  // Zufaellige Tokens enthalten irgendwann "bar", "none" oder "test".
  assert.ok(rules(`password: "${['abc123', 'bar', 'XYZ789def'].join('')}"`).includes('PASSWORD_ASSIGNMENT'));
  assert.ok(rules(`session_token: "${['none', fakeToken(8, 16)].join('')}"`).includes('SESSION_COOKIE'));
  assert.ok(rules(`api_key: "${['my', 'test', 'key', fakeToken(9, 16)].join('-')}"`).includes('GENERIC_API_KEY'));
  assert.ok(rules(`secret_key: "${['AKIA', fakeToken(10, 12).toUpperCase(), 'EXAMPLE'].join('')}"`).includes('GENERIC_API_KEY'));
  // Nur ein durchgehend sprechender Wert ist ein Platzhalter.
  assert.deepEqual(rules('api_key: "example-key-placeholder"'), []);
});

test('an escaped quote inside a literal does not cut the secret short', () => {
  const value = `abc\\"${fakeToken(11, 14)}`;
  assert.equal(assignedValue(`"${value}"`).value, value);
  assert.ok(rules(`password: "${value}"`).includes('PASSWORD_ASSIGNMENT'));
});

test('a JSON web token is caught by its own rule regardless of the key name', () => {
  assert.ok(rules(`harmlos: "${fakeJwt()}"`).includes('JWT'));
});

test('an interpolated value is a template, but a literal secret beside it is not', () => {
  const interpolation = ['$', '{token}'].join('');
  // Der Wert entsteht erst zur Laufzeit - im Repository steht kein Geheimnis.
  assert.deepEqual(rules(`password: \`${interpolation}\``), []);
  assert.deepEqual(rules('api_key: "{{ vault_secret }}"'), []);
  assert.deepEqual(rules(`cookie: "tp_dashboard=${interpolation}"`), []);
  // Der literale Teil daneben steht sehr wohl im Repository.
  assert.ok(rules(`password: "${fakeToken(12)}${interpolation}"`).includes('PASSWORD_ASSIGNMENT'));
});

test('repeated checks of the same value stay stable', () => {
  // Ein Regex mit g-Flag merkt sich lastIndex und antwortet sonst abwechselnd.
  const assigned = { value: `${fakeToken(13)}${['$', '{s}'].join('')}`, quoted: true };
  const answers = new Set([1, 2, 3, 4].map(() => looksLikeSecretValue(assigned, 12)));
  assert.equal(answers.size, 1);
});

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

test('a real Anthropic key inside a template is still BLOCKED', () => {
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

// SESSION_COOKIE matchte frueher auch Code-Referenzen. Neun Fehlalarme im
// eigenen Repo hielten den Secret-Scan dauerhaft auf BLOCK - und weil
// validate() den Scan als Schritt fuehrt, blockierte das jede Validierung und
// damit jeden Deploy. Beide Richtungen bleiben deshalb testgesichert.
test('SESSION_COOKIE ignoriert Code-Referenzen', () => {
  for (const line of [
    'const current = readClaudeSessionState({ sessionId: input.session_id, projectDir });',
    "const cookie = request.headers.cookie || '';",
    'sessionId: input.session_id,',
  ]) assert.deepEqual(scanText({ file: 'hook.mjs', text: line }), [], `sollte kein Fund sein: ${line}`);
});

test('SESSION_COOKIE findet echte Literale weiterhin', () => {
  const fake = 'C'.repeat(24);
  for (const line of [`session_token = "${fake}"`, `SESSION_ID=${fake}`, `cookie: '${fake}'`]) {
    const findings = scanText({ file: 'fixture.txt', text: line });
    assert.ok(findings.some(finding => finding.rule === 'SESSION_COOKIE'), `sollte blocken: ${line}`);
  }
});
