import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// Kein Prozessstart: route braucht origin/main, das im CI-Checkout fehlt.
test('route gibt SESSION_MODEL aus', () => {
  const src = readFileSync(new URL('../cli.mjs', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf("if (mode === 'route')"), src.indexOf('return route;'));
  assert.match(block, /formatRouterOutput\(route/);
  assert.match(block, /sessionModelDirective\(route\.modelPlan\)\.lines/);
});
