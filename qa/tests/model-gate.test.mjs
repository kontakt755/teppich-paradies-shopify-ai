import test from 'node:test';
import assert from 'node:assert/strict';
import { decideModelGate, GATE_OFF } from '../../automation/core/model-gate.mjs';

test('Klasse B in interaktiver Sitzung wird erinnert', () => {
  const decision = decideModelGate({ taskClass: 'B' });
  assert.equal(decision.warn, true);
  assert.match(decision.message, /agents:loop/);
});

test('Klasse A wird erinnert', () => {
  assert.equal(decideModelGate({ taskClass: 'A' }).warn, true);
});

test('Klasse C und D brauchen das starke Modell und werden nicht erinnert', () => {
  for (const taskClass of ['C', 'D']) {
    const decision = decideModelGate({ taskClass });
    assert.equal(decision.warn, false, `Klasse ${taskClass}`);
    assert.equal(decision.reason, 'CLASS_NEEDS_STRONG_MODEL');
  }
});

test('innerhalb von agents:loop laeuft schon das geroutete Modell', () => {
  const decision = decideModelGate({ taskClass: 'B', agentLoopActive: true });
  assert.equal(decision.warn, false);
  assert.equal(decision.reason, 'AGENT_LOOP_ACTIVE');
});

test('TP_MODEL_GATE=off schaltet die Erinnerung ab', () => {
  const decision = decideModelGate({ taskClass: 'B', gateSetting: GATE_OFF });
  assert.equal(decision.warn, false);
  assert.equal(decision.reason, 'GATE_OFF');
});

test('zweiter Edit derselben Sitzung erinnert nicht erneut', () => {
  const decision = decideModelGate({ taskClass: 'B', alreadyWarned: true });
  assert.equal(decision.warn, false);
  assert.equal(decision.reason, 'ALREADY_WARNED');
});

test('ohne belegte Klasse wird nicht erinnert', () => {
  const decision = decideModelGate({ taskClass: null });
  assert.equal(decision.warn, false);
  assert.equal(decision.reason, 'NO_TASK_CLASS');
});

// Das Gate darf nie blockieren: keine Entscheidung enthaelt ein
// permissionDecision, und "warn" ist der staerkste moegliche Ausgang.
test('die Entscheidung kennt keinen blockierenden Ausgang', () => {
  for (const taskClass of ['A', 'B', 'C', 'D', null]) {
    const decision = decideModelGate({ taskClass });
    assert.equal(decision.permissionDecision, undefined, `Klasse ${taskClass}`);
  }
});
