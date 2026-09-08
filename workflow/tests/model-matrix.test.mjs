import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTask, routeTask } from '../router.mjs';
import {
  CLAUDE_MODELS, CODEX_MODELS, EFFORT_LEVELS, PROVIDER, ROLE_MATRIX, buildModelPlan, claudeArgsForStep, codexArgsForStep,
  describeStep, escalateStep, failureSignature, formatModelPlan, isRateLimitError, modelStrength, rateLimitFallback, resolveCodexBinary,
} from '../model-matrix.mjs';

const rank = modelStrength;

// Szenarien 1-7 aus dem Auftrag vom 2026-09-08: Task -> Klasse -> Modelle -> Aufrufe.
test('Szenarien 1-7: Klassifikation und Modellplan je Aufgabentyp', () => {
  const cases = [
    ['1 Tippfehler', 'Tippfehler im Footer-Text korrigieren', 'A', 'claude:haiku/low', '-', [1, 1]],
    ['2 kleine CSS', 'Kleine CSS-Anpassung: Abstand am Warenkorb-Button um 4px erhöhen', 'A', 'claude:haiku/low', '-', [1, 1]],
    ['3 Shopify-Bug', 'Bug: Produktkarte zeigt auf Mobile keinen m²-Preis, bitte beheben', 'B', 'claude:fable/medium', 'codex:gpt-5.6-sol/medium', [2, 3]],
    ['4 Shopify-Feature', 'Neues Shopify Feature: Musterbestellung als Block im Produkt-Template', 'B', 'claude:fable/medium', 'codex:gpt-5.6-sol/medium', [2, 3]],
    ['5 Refactoring', 'Komplexes Multi-File-Refactoring des Rollenware-Konfigurators über Sections, Snippets und Assets', 'C', 'claude:fable/high', 'codex:gpt-6-astra/high', [3, 5]],
    ['6 API-Integration', 'API-Integration des jordanshop-Feeds in den Sync-Orchestrator', 'C', 'claude:fable/high', 'codex:gpt-6-astra/high', [3, 5]],
    ['7 Security', 'Security-relevante Änderung: Token-Handling im GitHub-Actions-Job absichern', 'D', 'claude:opus/high', 'codex:gpt-6-astra/xhigh', [5, 7]],
  ];
  for (const [label, text, taskClass, primary, reviewer, calls] of cases) {
    const route = routeTask({ text, branch: 'feature/router-modellmatrix', head: 'head-1' });
    assert.equal(route.taskClass, taskClass, label);
    assert.equal(describeStep(route.modelPlan.primary), primary, label);
    assert.equal(describeStep(route.modelPlan.reviewer), reviewer, label);
    assert.equal(describeStep(route.modelPlan.corrector), primary, `${label}: Corrector = Implementer`);
    assert.deepEqual(route.modelPlan.expectedModelCalls, calls, label);
  }
});

test('Corrector ist nie schwaecher als der Implementer, in keiner Klasse', () => {
  for (const taskClass of ['A', 'B', 'C', 'D']) {
    const plan = buildModelPlan(taskClass);
    assert.equal(plan.corrector.provider, plan.primary.provider);
    assert.ok(rank(plan.corrector) >= rank(plan.primary), taskClass);
  }
});

test('Haiku nur in Klasse A; B bis D bekommen ein starkes Claude-Modell', () => {
  assert.equal(buildModelPlan('A').primary.model, 'haiku');
  for (const taskClass of ['B', 'C', 'D']) {
    const plan = buildModelPlan(taskClass);
    assert.ok(['fable', 'opus'].includes(plan.primary.model), taskClass);
    assert.notEqual(plan.haikuAllowed, 'YES');
  }
});

test('Reviewer ist ein anderer Provider als der Implementer (Cross-Provider), Klasse A hat keinen Modell-Reviewer', () => {
  assert.equal(buildModelPlan('A').reviewer, null);
  for (const taskClass of ['B', 'C', 'D']) {
    const plan = buildModelPlan(taskClass);
    assert.equal(plan.primary.provider, PROVIDER.CLAUDE);
    assert.equal(plan.reviewer.provider, PROVIDER.CODEX);
  }
  const d = buildModelPlan('D');
  assert.equal(d.securityReviewer.provider, PROVIDER.CLAUDE);
  assert.notEqual(d.securityReviewer.model, d.primary.model, 'Security-Review nicht durch den Autor');
});

test('OpenAI-Kontingent skaliert mit der Klasse: 0 / 1 / 2 / 2 Codex-Schritte', () => {
  const codexSteps = plan => [plan.reviewer, plan.secondReviewer, plan.securityReviewer].filter(step => step?.provider === PROVIDER.CODEX).length;
  assert.deepEqual(['A', 'B', 'C', 'D'].map(taskClass => codexSteps(buildModelPlan(taskClass))), [0, 1, 2, 2]);
});

test('Szenario 8: wiederholter Fehler eskaliert Effort -> Peer-Modell -> anderer Provider -> Human Gate', () => {
  const start = buildModelPlan('B').primary;
  const first = escalateStep(start, { round: 1 });
  assert.equal(describeStep(first), 'claude:fable/high');
  const second = escalateStep(first, { round: 2 });
  assert.equal(describeStep(second), 'claude:opus/high');
  const third = escalateStep(second, { round: 3 });
  assert.equal(describeStep(third), 'codex:gpt-6-astra/high');
  assert.equal(escalateStep(third, { round: 4 }), null, 'danach entscheidet der Mensch');
  for (const step of [first, second, third]) assert.ok(rank(step) >= rank(start), `${describeStep(step)} nicht schwaecher als ${describeStep(start)}`);
});

test('Szenario 8b: Haiku scheitert -> Aufgabe wird als B behandelt statt fuenfmal Haiku', () => {
  const escalated = escalateStep(buildModelPlan('A').primary, { round: 1 });
  assert.equal(describeStep(escalated), 'claude:fable/medium');
  assert.match(escalated.reason, /RECLASSIFY_A_TO_B/);
});

test('Szenario 9: Rate Limit bei Claude -> Codex auf gleichem Niveau, nie schwaecher', () => {
  const fallback = rateLimitFallback(buildModelPlan('C').primary);
  assert.equal(fallback.provider, PROVIDER.CODEX);
  assert.equal(fallback.model, 'gpt-6-astra');
  assert.equal(fallback.effort, 'high');
  assert.ok(rank(fallback) >= rank(buildModelPlan('C').primary));
  assert.equal(rateLimitFallback(buildModelPlan('A').primary).model, 'gpt-5.6-sol');
});

test('Szenario 10: Rate Limit bei OpenAI -> Claude-Review durch ein anderes Modell als der Autor', () => {
  const b = buildModelPlan('B');
  const fallback = rateLimitFallback(b.reviewer, { authorModel: b.primary.model });
  assert.equal(fallback.provider, PROVIDER.CLAUDE);
  assert.equal(fallback.model, 'opus');
  const d = buildModelPlan('D');
  assert.equal(rateLimitFallback(d.reviewer, { authorModel: d.primary.model }).model, 'fable');
});

test('Szenario 11: ausgeschoepftes Kontingent wird wie ein Rate Limit erkannt', () => {
  for (const message of ['Usage limit reached; resets later', 'HTTP 429 Too Many Requests', 'insufficient_quota', 'You exceeded your current quota', 'rate_limit_error']) {
    assert.equal(isRateLimitError({ message }), true, message);
  }
  assert.equal(isRateLimitError({ message: 'SyntaxError: Unexpected token' }), false);
});

test('Szenario 12/13/14: derselbe Befund zweimal hat dieselbe Signatur, ein neuer nicht', () => {
  const finding = { priority: 'P1', file: 'sections/x.liquid', problem: 'Preis fehlt', reason: 'r', recommendedFix: 'f' };
  assert.equal(failureSignature([finding]), failureSignature([{ ...finding, reason: 'anders' }]));
  assert.notEqual(failureSignature([finding]), failureSignature([{ ...finding, problem: 'Layout bricht' }]));
  assert.equal(failureSignature([]), '');
});

test('CLI-Argumente entstehen nur aus belegten Modellnamen', () => {
  assert.deepEqual(claudeArgsForStep(buildModelPlan('B').primary), ['--model', 'fable', '--effort', 'medium']);
  assert.deepEqual(codexArgsForStep(buildModelPlan('C').reviewer), ['-m', 'gpt-6-astra', '-c', 'model_reasoning_effort="high"']);
  assert.deepEqual(codexArgsForStep(null), []);
  for (const taskClass of ['A', 'B', 'C', 'D']) {
    const plan = buildModelPlan(taskClass);
    for (const step of [plan.primary, plan.reviewer, plan.secondReviewer, plan.securityReviewer].filter(Boolean)) {
      const known = step.provider === PROVIDER.CLAUDE ? CLAUDE_MODELS : CODEX_MODELS;
      assert.ok(known.includes(step.model), `${taskClass}: ${step.model}`);
      assert.ok(EFFORT_LEVELS.includes(step.effort), `${taskClass}: ${step.effort}`);
    }
  }
  for (const [role, entry] of Object.entries(ROLE_MATRIX)) {
    for (const step of [entry.preferred, entry.alternative, entry.fallback]) {
      if (!step || typeof step === 'string' || step.provider === PROVIDER.SCRIPT) continue;
      const known = step.provider === PROVIDER.CLAUDE ? CLAUDE_MODELS : CODEX_MODELS;
      assert.ok(known.includes(step.model), `${role}: ${step.model}`);
    }
  }
});

test('Rollback: TP_ROUTING_STRATEGY=legacy pinnt kein Modell', () => {
  const plan = buildModelPlan('C', { env: { TP_ROUTING_STRATEGY: 'legacy' } });
  assert.equal(plan.strategy, 'legacy');
  assert.equal(plan.primary.model, null);
  assert.deepEqual(claudeArgsForStep(plan.primary), ['--effort', 'medium']);
  assert.deepEqual(codexArgsForStep(plan.reviewer), []);
});

test('Codex-Binary wird ueber CODEX_CLI_PATH, PATH oder das Desktop-Bundle gefunden', () => {
  const io = { accessSync: candidate => { if (candidate !== '/opt/tools/codex') throw new Error('nope'); } };
  assert.equal(resolveCodexBinary({ env: { CODEX_CLI_PATH: '/opt/tools/codex', PATH: '' }, io }), '/opt/tools/codex');
  assert.equal(resolveCodexBinary({ env: { PATH: '/opt/tools' }, io }), '/opt/tools/codex');
  assert.equal(resolveCodexBinary({ env: { PATH: '/nowhere' }, io: { accessSync: () => { throw new Error('nope'); } } }), null);
});

test('Router-Ausgabe zeigt den Modellplan', () => {
  const text = formatModelPlan(buildModelPlan('D'));
  assert.match(text, /PRIMARY_MODEL: claude:opus\/high/);
  assert.match(text, /SECURITY_REVIEWER: claude:fable\/high/);
  assert.match(text, /EXPECTED_MODEL_CALLS: 5-7/);
});

test('bestehende Klassifikationen bleiben stabil', () => {
  assert.equal(classifyTask('Kleinen CSS Theme-Fix umsetzen'), 'B');
  assert.equal(classifyTask('Dateien prüfen und Report erstellen'), 'A');
  assert.equal(classifyTask('Checkout Payment und Shipping ändern'), 'D');
  assert.equal(classifyTask('Performance und größere Theme-Logik verbessern'), 'C');
});
