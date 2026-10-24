// Tests fuer scripts/worktrees-aufraeumen.mjs - nur gemergte, ruhende, saubere Kopien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worktrees, grund, dienstPfade } from '../../scripts/worktrees-aufraeumen.mjs';

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
