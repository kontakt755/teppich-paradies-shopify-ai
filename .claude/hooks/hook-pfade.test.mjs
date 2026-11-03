// Die Sperr-Guards duerfen nicht still ausfallen, wenn $CLAUDE_PROJECT_DIR nicht aufs Repository
// zeigt (Sitzung ausserhalb gestartet, spaeter hierher gewechselt): erst ein zweiter Pfad, und
// faellt auch der aus, blockt onFailure den Befehl.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const einstellungen = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8'));
const pre = einstellungen.hooks.PreToolUse.flatMap(g => g.hooks);
const guard = name => pre.find(h => h.command.includes(name));
const eingabe = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git reset --hard' } });
const lauf = (cmd, cwd, projekt) => spawnSync('sh', ['-c', cmd], { cwd, input: eingabe, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: projekt } });

test('alle Sperr-Guards blocken im Fehlerfall, der Deploy-Hinweis nicht', () => {
  for (const n of ['git-gh-guard', 'theme-delete-guard', 'shopify-mcp-guard', 'shopify-cli-guard']) assert.equal(guard(n).onFailure, 'block', n);
  assert.equal(guard('deploy-command-guard').onFailure, undefined);
});

test('git- und Theme-Sperre gelten fuer alle Werkzeuge, die Shell-Befehle ausfuehren', () => {
  const gruppe = einstellungen.hooks.PreToolUse.find(g => g.hooks.some(h => h.command.includes('git-gh-guard')));
  for (const n of ['theme-delete-guard', 'shopify-cli-guard']) assert.ok(gruppe.hooks.some(h => h.command.includes(n)), n);
  const treffer = new RegExp(`^(?:${gruppe.matcher})$`);
  for (const w of ['Bash', 'Monitor', 'mcp__terminal__run_in_terminal']) assert.ok(treffer.test(w), w);
  assert.equal(treffer.test('Read'), false);
});

test('falscher Projektordner: der Guard wird ueber das Arbeitsverzeichnis gefunden und sperrt', () => {
  const r = lauf(guard('git-gh-guard').command, REPO, os.tmpdir());
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /deny/);
});

test('richtiger Projektordner ausserhalb eines Arbeitsbaums: Guard sperrt', () => {
  const r = lauf(guard('git-gh-guard').command, os.tmpdir(), REPO);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /deny/);
});

test('kein Repository in Sicht: Fehler, den onFailure zum Block macht', () => {
  const r = lauf(guard('git-gh-guard').command, fs.mkdtempSync(path.join(os.tmpdir(), 'tp-hook-')), os.tmpdir());
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
});
