import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { NotificationAdapter } from '../core/notification-adapter.mjs';

const events = JSON.parse(fs.readFileSync(new URL('../fixtures/notification-events.json', import.meta.url), 'utf8'));

test('all important events produce dry-run notification and sound intent', () => {
  const adapter = new NotificationAdapter({ dryRun: true });
  for (const eventType of events) assert.deepEqual(adapter.notify({ eventType, taskId: 'SHP-008', message: 'short' }).status, 'DRY_RUN');
  for (const eventType of events) assert.equal(adapter.notify({ eventType }).sound, true);
});

test('normal successful task is silent', () => {
  assert.equal(new NotificationAdapter({ dryRun: true }).notify({ eventType: 'TASK_PASS', taskId: 'X' }).status, 'SKIPPED');
});

test('dry run redacts synthetic secret and caps message', () => {
  const fake = ['ghp', 'B'.repeat(24)].join('_');
  const result = new NotificationAdapter({ dryRun: true }).notify({ eventType: 'HARD_STOP', taskId: 'X', message: `${fake} ${'x'.repeat(400)}` });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(fake));
  assert.ok(result.message.length <= 240);
});

test('notification failure is logged and returned without throwing', () => {
  const logs = [];
  const adapter = new NotificationAdapter({ notifierPath: 'missing', run: () => { throw new TypeError('offline'); }, logger: { error: (...args) => logs.push(args) } });
  const result = adapter.notify({ eventType: 'CRITICAL_BLOCKER', taskId: 'SHP-X', message: 'offline' });
  assert.equal(result.status, 'FAILED');
  assert.equal(logs[0][0], 'NOTIFICATION_FAILED');
  assert.doesNotMatch(JSON.stringify(logs), /offline/);
});
