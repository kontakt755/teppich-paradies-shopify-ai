import assert from 'node:assert/strict';
import test from 'node:test';
import { diffSinceSnapshot, evaluateDashboardGuards, parseNumstat, snapshotWorkingTree } from '../core/dashboard-guards.mjs';

const riskMap = {
  defaultPathRisk: 'MEDIUM',
  defaultResourceRisk: 'MEDIUM',
  operations: { report_write: 'LOW' },
  paths: [
    { pattern: 'automation/**', risk: 'LOW' },
    { pattern: 'snippets/**', risk: 'LOW' },
    { pattern: 'sections/**', risk: 'MEDIUM' },
    { pattern: 'config/settings_data.json', risk: 'HIGH' },
    { pattern: 'templates/product*.json', risk: 'HIGH' },
  ],
};

const change = (file, added = 5, deleted = 1) => ({ file, added, deleted });

test('numstat parsing keeps line counts and tolerates binary markers', () => {
  const entries = parseNumstat('5\t2\tautomation/core/a.mjs\n-\t-\tassets/logo.png\n');
  assert.deepEqual(entries[0], { file: 'automation/core/a.mjs', added: 5, deleted: 2 });
  assert.deepEqual(entries[1], { file: 'assets/logo.png', added: 0, deleted: 0 });
});

test('only what this run changed is attributed to it', () => {
  const before = new Map([['snippets/card.liquid', { file: 'snippets/card.liquid', added: 10, deleted: 0 }]]);
  const after = new Map([
    ['snippets/card.liquid', { file: 'snippets/card.liquid', added: 10, deleted: 0 }],
    ['automation/core/new.mjs', { file: 'automation/core/new.mjs', added: 4, deleted: 0 }],
  ]);
  const changes = diffSinceSnapshot(before, after);
  assert.deepEqual(changes.map(entry => entry.file), ['automation/core/new.mjs']);
});

// Der reale Vorfall: ein als ANALYSIS eingestufter Lauf hat Dateien geschrieben.
// Vorher fiel das niemandem auf, weil der Dashboard-Pfad keine Nachkontrolle hatte.
test('an analysis run that writes files is blocked, however harmless the path', () => {
  const verdict = evaluateDashboardGuards({
    taskType: 'ANALYSIS', risk: 'LOW', riskMap,
    changes: [change('automation/core/cli-agent-cycle.mjs')],
  });
  assert.equal(verdict.status, 'READ_ONLY_VIOLATED');
  assert.match(verdict.message, /reine Analyse/);
  assert.deepEqual(verdict.changedFiles, ['automation/core/cli-agent-cycle.mjs']);
});

test('an analysis run that changed nothing passes', () => {
  assert.equal(evaluateDashboardGuards({ taskType: 'ANALYSIS', risk: 'LOW', riskMap, changes: [] }).status, 'PASS');
});

test('a LOW task touching a protected path is stopped for a human decision', () => {
  const verdict = evaluateDashboardGuards({
    taskType: 'IMPLEMENTATION', risk: 'LOW', riskMap,
    changes: [change('snippets/card.liquid'), change('config/settings_data.json')],
  });
  assert.equal(verdict.status, 'RISK_EXCEEDED');
  assert.equal(verdict.effectiveRisk, 'HIGH');
  assert.match(verdict.message, /geschützte Dateien/);
});

test('ordinary implementation work inside allowed paths passes', () => {
  const verdict = evaluateDashboardGuards({
    taskType: 'IMPLEMENTATION', risk: 'LOW', riskMap,
    changes: [change('snippets/card.liquid'), change('sections/header.liquid')],
  });
  assert.equal(verdict.status, 'PASS');
  assert.equal(verdict.files, 2);
});

test('an oversized diff is held back for review instead of passing silently', () => {
  const verdict = evaluateDashboardGuards({
    taskType: 'IMPLEMENTATION', risk: 'LOW', riskMap, maxFiles: 2,
    changes: [change('snippets/a.liquid'), change('snippets/b.liquid'), change('snippets/c.liquid')],
  });
  assert.equal(verdict.status, 'BUDGET_EXCEEDED');
  assert.match(verdict.message, /selbst durchsehen/);
});

test('run infrastructure files do not consume the change budget', () => {
  const verdict = evaluateDashboardGuards({
    taskType: 'IMPLEMENTATION', risk: 'LOW', riskMap, maxFiles: 1,
    changes: [change('snippets/card.liquid'), change('.router/ai-usage.jsonl', 400, 0)],
  });
  assert.equal(verdict.status, 'PASS');
  assert.equal(verdict.files, 1);
});

test('a HIGH task may touch a protected path once it has been gated as HIGH', () => {
  const verdict = evaluateDashboardGuards({
    taskType: 'IMPLEMENTATION', risk: 'HIGH', riskMap,
    changes: [change('config/settings_data.json')],
  });
  assert.equal(verdict.status, 'PASS');
});

// Von der unabhaengigen Codex-Pruefung gefunden: fuer untracked Dateien lagen
// keine Zeilenzahlen vor, eine reine Inhaltsaenderung blieb damit unsichtbar.
test('a content change to an already existing untracked file is detected', () => {
  const before = new Map([['notiz.md', { file: 'notiz.md', added: 0, deleted: 0, untracked: true, size: 100, modifiedAt: 1000 }]]);
  const after = new Map([['notiz.md', { file: 'notiz.md', added: 0, deleted: 0, untracked: true, size: 240, modifiedAt: 2000 }]]);
  assert.deepEqual(diffSinceSnapshot(before, after).map(entry => entry.file), ['notiz.md']);
});

test('an untouched untracked file is not reported as a change', () => {
  const same = () => new Map([['notiz.md', { file: 'notiz.md', added: 0, deleted: 0, untracked: true, size: 100, modifiedAt: 1000 }]]);
  assert.deepEqual(diffSinceSnapshot(same(), same()), []);
});

test('working tree snapshot degrades safely when git is unavailable', () => {
  const snapshot = snapshotWorkingTree({ cwd: '/tmp', exec: () => { throw new Error('git missing'); } });
  assert.equal(snapshot.size, 0);
});
