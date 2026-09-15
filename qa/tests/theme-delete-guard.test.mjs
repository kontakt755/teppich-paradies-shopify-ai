import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const hook = path.resolve(import.meta.dirname, '../../.claude/hooks/theme-delete-guard.mjs');

/** Gibt die Entscheidung des Hooks zurueck: 'deny' oder null (durchgelassen). */
function entscheidung(command) {
  const res = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, `Hook brach ab: ${res.stderr}`);
  if (!res.stdout.trim()) return null;
  return JSON.parse(res.stdout).hookSpecificOutput.permissionDecision;
}

test('blockiert shopify theme delete', () => {
  assert.equal(entscheidung('shopify theme delete --theme 203690246478'), 'deny');
});

test('blockiert auch hinter einem Vorspann', () => {
  // Genau die Luecke, die der git-gh-guard am 2026-09-09 hatte: derselbe
  // Befehl hinter xargs, env oder sudo lief an einer ^-Regel vorbei.
  for (const cmd of [
    'xargs -n1 shopify theme delete',
    'env SHOPIFY_FLAG_STORE=x shopify theme delete -t 1',
    'sudo shopify theme delete -t 1',
    'timeout 5 shopify theme delete -t 1',
  ]) {
    assert.equal(entscheidung(cmd), 'deny', cmd);
  }
});

test('blockiert hinter Verkettungen und in Subshells', () => {
  for (const cmd of [
    'git status && shopify theme delete -t 1',
    'echo hallo; shopify theme delete -t 1',
    '(shopify theme delete -t 1)',
    'ls | shopify theme delete -t 1',
  ]) {
    assert.equal(entscheidung(cmd), 'deny', cmd);
  }
});

test('blockiert den Pfad-Aufruf und Anfuehrungszeichen', () => {
  assert.equal(entscheidung('/usr/local/bin/shopify theme delete -t 1'), 'deny');
  assert.equal(entscheidung('"shopify" theme delete -t 1'), 'deny');
});

test('blockiert themeDelete ueber die Admin API', () => {
  assert.equal(
    entscheidung('curl -X POST -d \'{"query":"mutation{themeDelete(id:\\"x\\"){deletedThemeId}}"}\' https://...'),
    'deny',
  );
});

test('laesst harmlose Theme-Befehle durch', () => {
  for (const cmd of [
    'shopify theme push --theme 1',
    'shopify theme pull --theme 1',
    'shopify theme list',
    'shopify theme check',
    'git status',
    'npm run theme:guard',
  ]) {
    assert.equal(entscheidung(cmd), null, cmd);
  }
});

test('Fliesstext im Heredoc bleibt Text', () => {
  // Ein Commit- oder PR-Text darf den Befehl erwaehnen, ohne blockiert zu
  // werden - dieselbe Regel wie im git-gh-guard.
  const cmd = [
    "git commit -F - <<'MSG'",
    'Hinweis: shopify theme delete ist durch einen Hook gesperrt.',
    'MSG',
  ].join('\n');
  assert.equal(entscheidung(cmd), null);
});
