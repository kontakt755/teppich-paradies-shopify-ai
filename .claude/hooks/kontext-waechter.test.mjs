// Test fuer kontext-waechter.mjs.  Aufruf: node --test .claude/hooks/kontext-waechter.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auswerten, stufe, istRoute } from './kontext-waechter.mjs';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'kontext-waechter.mjs');
const assistent = (kontext, cmd) => JSON.stringify({
  type: 'assistant',
  message: { usage: { input_tokens: 10, cache_read_input_tokens: kontext - 10, cache_creation_input_tokens: 0 },
    content: cmd ? [{ type: 'tool_use', name: 'Bash', input: { command: cmd } }] : [{ type: 'text', text: 'x' }] },
});
const ROUTE = 'npm run workflow:route -- "Aufgabe"';

function lauf(zeilen, session = `t${Math.random()}`) {
  const dir = mkdtempSync(join(tmpdir(), 'kw-'));
  const pfad = join(dir, 't.jsonl');
  writeFileSync(pfad, zeilen.join('\n'));
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ transcript_path: pfad, session_id: session }), encoding: 'utf8' });
  return r;
}

test('kurze Sitzung, eine Aufgabe: still', () => {
  const r = lauf([assistent(80000, ROUTE), assistent(90000)]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('zweite workflow:route im selben Chat: Hinweis', () => {
  const r = lauf([assistent(80000, ROUTE), assistent(90000, `cd x && ${ROUTE}`)]);
  const d = JSON.parse(r.stdout);
  assert.match(d.hookSpecificOutput.additionalContext, /2\. Aufgabe/);
  assert.match(d.systemMessage, /npm run -s handoff/);
});

test('Kontext ueber Schwelle: Hinweis mit Groesse', () => {
  const r = lauf([assistent(310000)]);
  assert.match(JSON.parse(r.stdout).systemMessage, /310k/);
});

test('gleiche Stufe meldet nur einmal je Sitzung, naechste Stufe erneut', () => {
  const s = `fest${Date.now()}`;
  assert.notEqual(lauf([assistent(260000)], s).stdout, '');
  assert.equal(lauf([assistent(300000)], s).stdout, '');
  assert.notEqual(lauf([assistent(420000)], s).stdout, '');
});

test('Subagenten-Zeilen zaehlen nicht mit', () => {
  const side = JSON.parse(assistent(900000, ROUTE)); side.isSidechain = true;
  assert.deepEqual(auswerten([assistent(50000, ROUTE), JSON.stringify(side)].join('\n')), { kontext: 50000, routen: 1 });
});

test('Stufenrechnung', () => {
  assert.equal(stufe({ kontext: 249999, routen: 1 }).melden, false);
  assert.equal(stufe({ kontext: 250000, routen: 0 }).k, 1);
  assert.equal(stufe({ kontext: 400000, routen: 0 }).k, 2);
});

test('kaputte Eingabe oder fehlendes Transkript: still, Exit 0', () => {
  for (const input of ['kein json', JSON.stringify({ transcript_path: '/gibt/es/nicht' })]) {
    const r = spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
});

test('Text im Commit, grep oder echo ist kein Routenaufruf', () => {
  assert.equal(istRoute('git commit -m "npm run workflow:route erwaehnt"'), false);
  assert.equal(istRoute("grep -n 'workflow:route' CLAUDE.md"), false);
  assert.equal(istRoute('echo workflow:route'), false);
  assert.equal(istRoute('cd x && npm run -s workflow:route -- "A"'), true);
  assert.equal(istRoute('node workflow/cli.mjs route "A"'), true);
});
