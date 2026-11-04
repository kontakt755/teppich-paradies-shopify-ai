import test from 'node:test';
import assert from 'node:assert/strict';
import { leiteTodosAb } from '../lib/todos.mjs';

const JETZT = new Date('2026-11-03T12:00:00Z');
const mit = routinen => leiteTodosAb({ shopwache: { verfuegbar: false, routinen } }, { sicht: 'website', jetzt: JETZT });

test('neue Claude-Version: gelbes To-do, kein Ausfall; ohne Hinweis keins', () => {
  const r = { id: 'claude-stand', titel: 'Claude-Code-Stand', ok: true, stumm: false };
  assert.deepEqual(mit([r]).filter(t => t.id === 'ki-stand'), []);
  const t = mit([{ ...r, hinweis: 'neu 2.1.317' }]);
  assert.equal(t.find(x => x.id === 'ki-stand').ton, 'warn');
  assert.equal(t.find(x => x.id === 'routinen'), undefined);
});

test('Codex am Limit erscheint als gestoerte Routine', () => {
  const t = mit([{ id: 'codex-stand', titel: 'Codex-Kontingent', ok: false, meldung: 'Codex am Limit', seit: '2026-11-03T11:00:00Z' }]);
  assert.equal(t.find(x => x.id === 'routinen').ton, 'crit');
  assert.match(t.find(x => x.id === 'routinen').kontext, /Codex am Limit/);
});
