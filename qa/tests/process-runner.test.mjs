import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyProcessResult, parseJsonProcessOutput, runProcess, shopifyInvocations } from '../process-runner.mjs';

test('A: valide Ausgabe wird geparst', () => {
  const result = parseJsonProcessOutput({ exitCode: 0, stdout: '[{"offenses":[]}]', stderr: '' });
  assert.equal(result.failed, false);
  assert.deepEqual(result.value, [{ offenses: [] }]);
});

test('B: leeres stdout wird klar klassifiziert', () => {
  const result = parseJsonProcessOutput({ exitCode: 0, stdout: '', stderr: '' });
  assert.equal(result.kind, 'empty-output');
  assert.match(result.error, /leeres stdout/);
});

test('C: Exit ungleich null enthält Exit-Code', () => {
  const result = classifyProcessResult({ exitCode: 7, stdout: '', stderr: 'kaputt' });
  assert.equal(result.kind, 'exit');
  assert.match(result.message, /Exit-Code 7/);
});

test('valide Shopify-Ausgabe bleibt bei Exit 1 auswertbar', () => {
  const result = parseJsonProcessOutput({ exitCode: 1, stdout: '[]', stderr: '' }, { allowedExitCodes: [0, 1] });
  assert.equal(result.failed, false);
  assert.equal(result.process.exitCode, 1);
});

test('unerwarteter Exit-Code bleibt trotz validem JSON ein Fehler', () => {
  const result = parseJsonProcessOutput({ exitCode: 7, stdout: '[]', stderr: '' }, { allowedExitCodes: [0, 1] });
  assert.equal(result.failed, true);
  assert.equal(result.kind, 'exit');
  assert.match(result.error, /Exit-Code 7/);
});

test('D: Spawn-Fehler wird klar klassifiziert', async () => {
  const raw = await runProcess(`nicht-vorhanden-${Date.now()}`, []);
  const result = classifyProcessResult(raw);
  assert.equal(result.kind, 'spawn-error');
});

test('E: Timeout ist begrenzt', async () => {
  const started = Date.now();
  const raw = await runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeoutMs: 100 });
  const result = classifyProcessResult(raw);
  assert.equal(result.kind, 'timeout');
  assert.ok(Date.now() - started < 2000);
});

test('F: ungültige Ausgabe erzeugt keinen Parser-Crash', () => {
  const result = parseJsonProcessOutput({ exitCode: 0, stdout: '{teilweise', stderr: '' });
  assert.equal(result.kind, 'invalid-output');
  assert.match(result.error, /ungültige JSON-Ausgabe/);
});

test('Windows Shopify-Aufruf hat höchstens einen begrenzten Fallback', () => {
  const invocations = shopifyInvocations({ platform: 'win32', env: { PATH: '' }, nodeExecutable: process.execPath });
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].command, 'cmd.exe');
  assert.equal(invocations[0].label, 'shopify.cmd Fallback');
});

test('macOS und Linux verwenden den direkten Shopify-Aufruf', () => {
  for (const platform of ['darwin', 'linux']) {
    assert.deepEqual(shopifyInvocations({ platform }), [{ command: 'shopify', args: [], shell: false, label: 'shopify' }]);
  }
});
