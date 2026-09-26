import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildModelPlan } from '../model-matrix.mjs';
import { sessionModelDirective, sitzungsZugriff } from '../session-model.mjs';

const DESKTOP = { CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', CLAUDE_CODE_HOST_SESSION_ID: 'local_x', CLAUDECODE: '1', CLAUDE_EFFORT: 'low' };

test('Zugriff: Desktop, CLI, keiner', () => {
  assert.equal(sitzungsZugriff(DESKTOP), 'desktop');
  assert.equal(sitzungsZugriff({ CLAUDECODE: '1' }), 'cli');
  assert.equal(sitzungsZugriff({}), 'keiner');
});

test('Klasse B im Desktop: Matrixmodell plus Menue-Anweisung, nie als gesetzt gemeldet', () => {
  const d = sessionModelDirective(buildModelPlan('B', { env: {} }), DESKTOP);
  assert.equal(d.model, 'fable');
  assert.equal(d.gesetzt, false);
  assert.match(d.lines[0], /^SESSION_MODEL: fable\/medium$/);
  assert.match(d.lines[1], /Modellmenue.*fable.*Effort medium.*aktueller Effort low/);
});

test('CLI bekommt /model, ohne Sitzung nur Ausgabe', () => {
  assert.match(sessionModelDirective(buildModelPlan('D', { env: {} }), { CLAUDECODE: '1' }).lines[1], /\/model opus/);
  assert.match(sessionModelDirective(buildModelPlan('C', { env: {} }), {}).lines[1], /keine Sitzung/);
});

test('route gibt SESSION_MODEL aus', () => {
  const r = spawnSync(process.execPath, ['workflow/cli.mjs', 'route', 'Kleine Doku-Korrektur im README'], { encoding: 'utf8', env: { ...process.env, CLAUDECODE: '', CLAUDE_CODE_ENTRYPOINT: '' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^SESSION_MODEL: \S+/m);
  assert.match(r.stdout, /SESSION_MODEL_ACTION: - \(keine Sitzung/);
});
