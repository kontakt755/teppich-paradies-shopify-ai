import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaudeHookContext, shouldRouteClaudePrompt } from '../core/claude-hook-policy.mjs';

test('hook skips slash commands and tiny follow-ups', () => {
  for (const prompt of ['', '/help', 'ja', 'Weiter!', 'wie genau?']) assert.equal(shouldRouteClaudePrompt(prompt), false);
});

test('hook routes substantive work but avoids overhead for a trivial statement', () => {
  assert.equal(shouldRouteClaudePrompt('Repariere den mobilen CSS-Fehler vollständig.'), true);
  assert.equal(shouldRouteClaudePrompt('Veröffentliche das Live-Theme'), true);
  assert.equal(shouldRouteClaudePrompt('Bitte lies diese ausführliche Aufgabenbeschreibung und strukturiere die nächsten Schritte so, dass mehrere betroffene Dateien sicher untersucht werden können.'.padEnd(170, ' x')), true);
  assert.equal(shouldRouteClaudePrompt('Die Farbe ist blau.'), false);
});

test('hook context does not repeat the original prompt and requires independent review', () => {
  const context = buildClaudeHookContext({ status: 'READY', classified: { risk: 'LOW' }, policy: { modelRequirement: { class: 'LIGHT' } }, route: { model: 'fixture/free' }, analysis: 'Kompakter Plan', handoffPath: '/tmp/handoff.md' });
  assert.match(context, /Kompakter Plan/);
  assert.match(context, /npm run agents:review/);
  assert.match(context, /\/tmp\/handoff\.md/);
  assert.doesNotMatch(context, /Auftrag/);
});

test('high-risk result injects a human gate instead of an autonomous plan', () => {
  assert.match(buildClaudeHookContext({ status: 'HUMAN_GATE' }), /HIGH-Risk/);
});

test('list fragments of a multi-line brief do not trigger a pre-analysis each', () => {
  for (const prompt of ['* Formatierungen', '- kleine Änderungen', 'Haiku soll NICHT mehr das Standardmodell für:', 'Meine verfügbaren Modelle / Accounts:']) {
    assert.equal(shouldRouteClaudePrompt(prompt), false, prompt);
  }
  assert.equal(shouldRouteClaudePrompt('* Preise aller Produkte ändern'), true, 'geschuetzte Absicht bleibt sichtbar');
});

test('hook context names the matrix routing and skips the brief for class A', () => {
  const plan = { primary: { provider: 'CLAUDE', model: 'haiku', effort: 'low' }, reviewer: null, expectedModelCalls: [1, 1], haikuAllowed: 'YES' };
  const context = buildClaudeHookContext({ status: 'READY_NO_BRIEF', routing: { taskClass: 'A', plan } });
  assert.match(context, /Klasse A → Implementer claude:haiku\/low, Review -/);
  assert.doesNotMatch(context, /Codex-Prüfung/);
});
