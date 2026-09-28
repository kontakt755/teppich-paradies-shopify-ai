// Test fuer #670: Voranalyse nur bei Klasse C/D.  Aufruf: node --test .claude/hooks/voranalyse-klasse.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildClaudeHookContext, ohneVoranalyse, voranalyseEinblenden } from '../../automation/core/claude-hook-policy.mjs';
import { prepareClaudeBridge } from '../../automation/core/claude-bridge.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'openrouter-user-prompt.mjs');
const basis = (taskClass) => ({
  status: 'READY',
  classified: { risk: 'LOW' },
  policy: { modelRequirement: { class: 'STANDARD' } },
  route: { model: 'gemini/fixture' },
  analysis: 'GEMINI-VORANALYSE',
  reviewTaskPath: '/tmp/x.review.md',
  routing: { taskClass, plan: { primary: { provider: 'CLAUDE', model: 'fable', effort: 'medium' }, reviewer: null, expectedModelCalls: [1, 2], haikuAllowed: 'NO' } },
});

test('nur C und D bekommen eine Voranalyse', () => {
  assert.deepEqual(['A', 'B', 'C', 'D'].map(voranalyseEinblenden), [false, false, true, true]);
});

test('Klasse B: Kontext ohne Voranalyse, Fertigstellungszyklus bleibt', () => {
  const ctx = buildClaudeHookContext(basis('B'));
  assert.doesNotMatch(ctx, /GEMINI-VORANALYSE|Router-Voranalyse/);
  assert.match(ctx, /Verbindlicher Fertigstellungszyklus/);
  assert.match(ctx, /Klasse B/);
});

test('Klasse C und D: Voranalyse als ungepruefter Hinweis', () => {
  for (const k of ['C', 'D']) {
    const ctx = buildClaudeHookContext(basis(k));
    assert.match(ctx, /Router-Voranalyse/);
    assert.match(ctx, /GEMINI-VORANALYSE/);
  }
});

test('Klasse B ruft kein Drittmodell: ohneVoranalyse liefert leeren Text, Review-Handoff entsteht', async () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'va-'));
  const r = await prepareClaudeBridge({ taskId: 'T-670', task: 'Implementiere eine kleine Aenderung am Hook', outputDir, execute: ohneVoranalyse });
  assert.equal(r.status, 'READY');
  assert.equal(r.analysis, '');
  assert.ok(r.reviewTaskPath);
  assert.doesNotMatch(buildClaudeHookContext({ ...r, routing: basis('B').routing }), /Router-Voranalyse/);
});

test('Hook verdrahtet die Klassenpruefung vor dem Bridge-Aufruf', () => {
  const src = readFileSync(HOOK, 'utf8');
  assert.match(src, /voranalyseEinblenden\(taskClass\) \? undefined : ohneVoranalyse/);
  assert.ok(src.indexOf('ohneVoranalyse;') < src.indexOf('await prepareClaudeBridge'));
});
