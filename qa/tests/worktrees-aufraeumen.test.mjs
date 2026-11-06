// Tests fuer scripts/worktrees-aufraeumen.mjs - nur gemergte, ruhende, saubere Kopien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { worktrees, grund, dienstPfade, inMainEnthalten } from '../../scripts/worktrees-aufraeumen.mjs';

const JETZT = Date.parse('2026-10-24T12:00:00Z');
const basis = (w = {}) => ({
  haupt: '/r', eigene: '/r/.claude/worktrees/ich', gemergt: true, geaendert: [], ignoriert: ['node_modules', '.workflow/'],
  letzteAktivitaet: JETZT - 3 * 86400000, prozessCwds: ['/', '/Users/x'], jetzt: JETZT, ...w,
});
const wt = (pfad, branch = 'claude/x') => ({ pfad, branch, head: 'a'.repeat(40) });

test('worktrees: liest Pfad, HEAD und Branch, auch losgeloest', () => {
  const l = worktrees('worktree /r\nHEAD 111\ndetached\n\nworktree /r/.claude/worktrees/a\nHEAD 222\nbranch refs/heads/claude/a\n\n');
  assert.deepEqual(l, [{ pfad: '/r', head: '111', branch: null }, { pfad: '/r/.claude/worktrees/a', head: '222', branch: 'claude/a' }]);
});

test('gemergt, sauber, ruhend und ohne Prozess: darf weg', () => {
  assert.equal(grund(wt('/r/.claude/worktrees/a'), basis()), null);
});

test('jede einzelne Bedingung haelt die Kopie fest', () => {
  const a = wt('/r/.claude/worktrees/a');
  assert.equal(grund(wt('/r', null), basis()), 'Hauptcheckout');
  assert.equal(grund(wt('/r/.claude/worktrees/ich'), basis()), 'eigene Arbeitskopie');
  assert.match(grund(wt('/d/tp-deploy', 'main'), basis()), /Deploy/);
  assert.match(grund(a, basis({ gemergt: false })), /nicht in origin\/main/);
  assert.match(grund(a, basis({ geaendert: ['?? neu.md'] })), /1 geaenderte/);
  assert.match(grund(a, basis({ ignoriert: ['node_modules', 'CLAUDE-SECURITY-20261022/'] })), /nicht neu erzeugbar sind: CLAUDE-SECURITY/);
  assert.match(grund(a, basis({ ignoriert: ['.env.local'] })), /nicht neu erzeugbar/, 'ignorierte Zugangsdaten werden nie mitgeloescht');
  assert.match(grund(a, basis({ ignoriert: ['.router/'] })), /nicht neu erzeugbar/, '.router/ enthaelt Protokolle (Codex-Review #1669)');
  assert.match(grund(a, basis({ letzteAktivitaet: JETZT - 3600000 })), /24 Stunden/);
  assert.match(grund(a, basis({ letzteAktivitaet: null })), /unbekannt/);
  assert.match(grund(a, basis({ prozessCwds: null })), /lsof/);
  assert.match(grund(a, basis({ prozessCwds: ['/r/.claude/worktrees/a/qa'] })), /Prozess/);
});

test('ein Prozess in einer Kopie mit aehnlichem Namen haelt die andere nicht fest', () => {
  assert.equal(grund(wt('/r/.claude/worktrees/a'), basis({ prozessCwds: ['/r/.claude/worktrees/ab'] })), null);
});

test('neu erzeugbare ignorierte Dateien blockieren nicht', () => {
  const ok = ['node_modules', 'node_modules/', '.workflow/', 'qa/results/', 'SEO_REPORT.md', 'docs/ai-dashboard/issues.json', 'docs/ai-dashboard/bodenwissen.json', 'sections/.DS_Store'];
  assert.equal(grund(wt('/r/.claude/worktrees/a'), basis({ ignoriert: ok })), null);
});

test('ein LaunchAgent, der in die Kopie zeigt, haelt sie fest - auch gemergt und ohne laufenden Prozess', () => {
  const plist = '<dict><key>ProgramArguments</key><array><string>/opt/homebrew/bin/node</string><string>/r/tp-dashboard/operations/scripts/sicherung.mjs</string></array><key>Label</key><string>net.x.sicherung</string></dict>';
  const dienste = dienstPfade([plist]);
  assert.deepEqual(dienste, ['/opt/homebrew/bin/node', '/r/tp-dashboard/operations/scripts/sicherung.mjs']);
  assert.match(grund(wt('/r/tp-dashboard', 'dashboard-betrieb'), basis({ dienste })), /LaunchAgent/);
  assert.equal(grund(wt('/r/tp-dashboard-alt'), basis({ dienste })), null, 'nur echte Unterpfade zaehlen');
  assert.match(grund(wt('/r/.claude/worktrees/a'), basis({ dienste: null })), /LaunchAgents nicht pruefbar/);
});

test('auch Shell-Aufrufe mit $HOME, ${HOME} und ~ zaehlen als Verweis', () => {
  const plist = (s) => `<array><string>/bin/bash</string><string>-lc</string><string>${s}</string></array>`;
  const d = dienstPfade([
    plist('cd "$HOME/tp-dashboard" &amp;&amp; exec npm run -s auslauf:pruefen'),
    plist("cd ${HOME}/tp-andere/ && date"),
    plist('cd ~/tp-dritte; exec npm run x'),
    plist('echo a~/kein-pfad'),
  ], '/Users/t');
  assert.ok(d.includes('/Users/t/tp-dashboard'), d.join(' '));
  assert.ok(d.includes('/Users/t/tp-andere'));
  assert.ok(d.includes('/Users/t/tp-dritte'));
  assert.ok(!d.some((p) => p.includes('kein-pfad') && p.startsWith('/Users/t')), 'a~/x ist kein Home-Pfad');
  assert.match(grund(wt('/Users/t/tp-dashboard', 'dashboard-betrieb'), basis({ dienste: d })), /LaunchAgent/);
});

test('inMainEnthalten: patch-gleicher Branch (Squash eines Commits, Cherry-Pick) gilt als gemergt, eigene Arbeit nicht', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-wt-cherry-'));
  const g = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const datei = (name, inhalt) => fs.writeFileSync(path.join(repo, name), inhalt);
  try {
    g('init', '-q', '-b', 'main');
    g('config', 'user.email', 't@example.invalid'); g('config', 'user.name', 'Test'); g('config', 'commit.gpgsign', 'false');
    datei('a.txt', 'a\n'); g('add', 'a.txt'); g('commit', '-q', '-m', 'start');
    // Branch mit einem Commit, auf main per Squash (gleicher Patch, anderer Commit) uebernommen
    g('checkout', '-q', '-b', 'claude/squash');
    datei('b.txt', 'b\n'); g('add', 'b.txt'); g('commit', '-q', '-m', 'arbeit');
    const squashHead = g('rev-parse', 'HEAD');
    g('checkout', '-q', 'main');
    g('merge', '-q', '--squash', 'claude/squash'); g('commit', '-q', '-m', 'Squash (#1)');
    datei('c.txt', 'c\n'); g('add', 'c.txt'); g('commit', '-q', '-m', 'weiter auf main');
    // Branch mit eigener, nicht uebernommener Arbeit
    g('checkout', '-q', '-b', 'claude/offen', squashHead);
    datei('d.txt', 'd\n'); g('add', 'd.txt'); g('commit', '-q', '-m', 'eigene arbeit');
    const offenHead = g('rev-parse', 'HEAD');
    g('checkout', '-q', 'main');
    assert.match(g('cherry', 'main', squashHead), /^- /, 'git cherry ohne +');
    assert.equal(inMainEnthalten(squashHead, repo, 'main'), true, 'Squash-gleicher Branch gilt als gemergt');
    assert.equal(inMainEnthalten(offenHead, repo, 'main'), false, 'Branch mit eigener Arbeit bleibt');
    assert.equal(inMainEnthalten(g('rev-parse', 'HEAD~1'), repo, 'main'), true, 'Vorfahre gilt weiter als gemergt');
    assert.equal(inMainEnthalten('f'.repeat(40), repo, 'main'), false, 'unbekannter Commit gilt nie als gemergt');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
