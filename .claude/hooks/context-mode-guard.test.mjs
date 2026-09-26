// Test fuer context-mode-guard.mjs.  Aufruf: node --test .claude/hooks/context-mode-guard.test.mjs
//
// Gefaehrliche Befehle bewusst zusammengesetzt ('git ' + '...'), damit
// git-gh-guard nicht den eigenen Test blockiert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'context-mode-guard.mjs');
const FORCE = 'git ' + 'push --force origin main';
const HARD = 'git ' + 'reset --hard';
const P = 'mcp__context-mode__';

function urteil(eingabe) {
  const lauf = spawnSync(process.execPath, [HOOK], {
    input: typeof eingabe === 'string' ? eingabe : JSON.stringify({ hook_event_name: 'PreToolUse', ...eingabe }),
    encoding: 'utf8',
  });
  return /"permissionDecision":"deny"/.test(lauf.stdout) ? 'BLOCK' : 'OK';
}

const FAELLE = [
  ['BLOCK', 'Shell mehrzeilig mit Force-Push', { tool_name: `${P}ctx_execute`, tool_input: { language: 'shell', code: `ls\n${FORCE}` } }],
  ['OK', 'Shell harmlos', { tool_name: `${P}ctx_execute`, tool_input: { language: 'shell', code: 'git status && npm test' } }],
  ['BLOCK', 'Batch mit reset --hard', { tool_name: `${P}ctx_batch_execute`, tool_input: { commands: [{ label: 'a', command: 'ls' }, { label: 'b', command: HARD }] } }],
  ['OK', 'Batch als JSON-String harmlos', { tool_name: `${P}ctx_batch_execute`, tool_input: { commands: JSON.stringify([{ label: 'a', command: 'git log -1' }]) } }],
  ['BLOCK', 'JS startet Prozess', { tool_name: `${P}ctx_execute`, tool_input: { language: 'javascript', code: 'require("child_' + 'process").execSync("ls")' } }],
  ['OK', 'Python ohne Prozess', { tool_name: `${P}ctx_execute`, tool_input: { language: 'python', code: 'import json; print(1)' } }],
  ['BLOCK', 'nicht freigegebene Sprache', { tool_name: `${P}ctx_execute`, tool_input: { language: 'ruby', code: 'puts 1' } }],
  ['BLOCK', 'execute_file mit subprocess', { tool_name: `${P}ctx_execute_file`, tool_input: { path: 'x.log', language: 'python', code: 'import sub' + 'process' } }],
  ['OK', 'ctx_search ist kein Ausfuehrungs-Tool', { tool_name: `${P}ctx_search`, tool_input: { queries: ['x'] } }],
  ['BLOCK', 'kaputte Eingabe', 'kein json'],
];

for (const [erwartet, name, eingabe] of FAELLE) {
  test(`${erwartet}: ${name}`, () => assert.equal(urteil(eingabe), erwartet));
}
