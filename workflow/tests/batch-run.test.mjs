import assert from 'node:assert/strict';
import test from 'node:test';

import { extractStopReason, parseTasks } from '../batch-run.mjs';

test('parseTasks splits on a lone --- line and trims each task', () => {
  const content = 'Erste Aufgabe.\nZeile zwei.\n---\nZweite Aufgabe.\n---\n\nDritte Aufgabe.\n';
  const tasks = parseTasks(content);
  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].text, 'Erste Aufgabe.\nZeile zwei.');
  assert.equal(tasks[1].text, 'Zweite Aufgabe.');
  assert.equal(tasks[2].text, 'Dritte Aufgabe.');
  assert.equal(tasks[0].files, null);
});

test('parseTasks extracts an optional FILES: prefix per task', () => {
  const content = 'FILES: workflow/a.mjs, workflow/b.mjs\nAufgabentext hier.\n---\nAufgabe ohne Dateien.';
  const tasks = parseTasks(content);
  assert.equal(tasks[0].files, 'workflow/a.mjs, workflow/b.mjs');
  assert.equal(tasks[0].text, 'Aufgabentext hier.');
  assert.equal(tasks[1].files, null);
  assert.equal(tasks[1].text, 'Aufgabe ohne Dateien.');
});

test('parseTasks ignores empty blocks (blank lines, trailing separator)', () => {
  assert.deepEqual(parseTasks('\n---\n\n---\n'), []);
  assert.deepEqual(parseTasks(''), []);
  assert.equal(parseTasks('Nur eine Aufgabe, kein Separator.').length, 1);
});

test('extractStopReason reads the last STOP: line, ignoring earlier noise', () => {
  const output = 'irgendwas STOP: sieht komisch aus in einer Zeile\n[1] HANDOFF_IMPLEMENTER\n\nSTOP: DONE\nITERATIONEN: 2\n';
  assert.equal(extractStopReason(output), 'DONE');
  assert.equal(extractStopReason('kein Stop hier'), null);
  assert.equal(extractStopReason(''), null);
});
