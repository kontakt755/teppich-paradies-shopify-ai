// Tests fuer scripts/ki-austausch.mjs (direkter Austausch Claude <-> Codex).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  argumente, codexAufruf, claudeAufruf, codexAntwort, claudeAntwort, codexKandidaten, kindUmgebung, kopf,
} from '../../scripts/ki-austausch.mjs';

test('argumente: neue Frage, Fortsetzung und Optionen', () => {
  assert.deepEqual(argumente(['codex', 'Wie', 'geht', 'es?']), { befehl: 'codex', weiter: false, frage: 'Wie geht es?' });
  const w = argumente(['weiter', 'claude', '--faden', 'review', 'Und?']);
  assert.equal(w.befehl, 'claude');
  assert.equal(w.weiter, true);
  assert.equal(w.faden, 'review');
  assert.equal(w.frage, 'Und?');
  assert.equal(argumente(['faeden']).befehl, 'faeden');
});

test('argumente: unbekannte KI und unbekannte Option brechen ab', () => {
  assert.throws(() => argumente(['gemini', 'x']), /codex \| claude/);
  assert.throws(() => argumente(['codex', '--schreiben', 'x']), /Unbekannte Option/);
  assert.throws(() => argumente(['codex', '--faden']), /braucht einen Wert/);
});

test('codex: neue Frage nur lesend im Arbeitsordner', () => {
  const a = codexAufruf({ cd: '/repo' });
  assert.equal(a[0], 'exec');
  assert.ok(a.includes('--json'));
  assert.deepEqual(a.slice(a.indexOf('--sandbox'), a.indexOf('--sandbox') + 2), ['--sandbox', 'read-only']);
  assert.equal(a.at(-1), '-', 'Frage kommt ueber stdin, nicht als Argument (E2BIG)');
  assert.ok(!a.includes('danger-full-access'));
});

test('codex: Fortsetzung bleibt nur lesend, obwohl resume kein --sandbox kennt', () => {
  const a = codexAufruf({ id: 'abc', aufwand: 'low' });
  assert.deepEqual(a.slice(0, 2), ['exec', 'resume']);
  assert.ok(a.includes('sandbox_mode="read-only"'));
  assert.ok(!a.includes('--sandbox'));
  assert.ok(a.includes('model_reasoning_effort="low"'));
  assert.deepEqual(a.slice(-2), ['abc', '-']);
});

test('claude: Plan-Modus, Fortsetzung per --resume', () => {
  const a = claudeAufruf({ id: 's1' });
  assert.deepEqual(a.slice(0, 5), ['-p', '--output-format', 'json', '--permission-mode', 'plan']);
  assert.equal(a.at(-1), 's1', 'kein Frage-Argument, Claude liest stdin');
  assert.deepEqual(a.slice(a.indexOf('--resume'), a.indexOf('--resume') + 2), ['--resume', 's1']);
});

test('codexAntwort: Thread-ID und letzte Nachricht, Zwischenmeldungen weg', () => {
  const aus = [
    '{"type":"thread.started","thread_id":"t-1"}',
    '{"type":"item.completed","item":{"type":"error","message":"Under-development features enabled"}}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"Ich lese AGENTS.md."}}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"Antwort."}}',
    'Reading additional input from stdin...',
  ].join('\n');
  assert.deepEqual(codexAntwort(aus), { id: 't-1', text: 'Antwort.', fehler: [] });
});

test('codexAntwort: Wiederverbindung ist kein Fehler, turn.failed schon', () => {
  const ok = codexAntwort('{"type":"error","message":"Reconnecting... 1/5"}\n{"type":"item.completed","item":{"type":"agent_message","text":"A"}}');
  assert.deepEqual(ok.fehler, []);
  const ab = codexAntwort('{"type":"item.completed","item":{"type":"agent_message","text":"Ich lese ..."}}\n{"type":"turn.failed","error":{"message":"usage limit"}}');
  assert.deepEqual(ab.fehler, ['usage limit']);
});

test('claudeAntwort: Erfolg und Anmeldefehler', () => {
  assert.deepEqual(claudeAntwort('{"session_id":"s","result":"Ja","is_error":false}'), { id: 's', text: 'Ja', fehler: [] });
  const f = claudeAntwort('{"session_id":"s","result":"Failed to authenticate","is_error":true}');
  assert.deepEqual(f.fehler, ['Failed to authenticate']);
});

test('kindUmgebung: Tiefe zaehlt hoch, Desktop-Sitzungsvariablen nur fuer Claude weg', () => {
  const q = { PATH: '/bin', ANTHROPIC_BASE_URL: 'x', CLAUDE_CODE_SESSION_ID: 'y', CLAUDECODE: '1', OPENAI_X: 'z' };
  const c = kindUmgebung(q, 'claude', 0);
  assert.equal(c.TP_KI_TIEFE, '1');
  assert.equal(c.PATH, '/bin');
  assert.ok(!('ANTHROPIC_BASE_URL' in c) && !('CLAUDE_CODE_SESSION_ID' in c) && !('CLAUDECODE' in c));
  const x = kindUmgebung(q, 'codex', 1);
  assert.equal(x.TP_KI_TIEFE, '2');
  assert.equal(x.CLAUDECODE, '1');
});

test('codexKandidaten: CODEX_BIN zuerst, ChatGPT-App nur auf dem Mac', () => {
  assert.equal(codexKandidaten({ CODEX_BIN: '/x/codex' }, 'darwin')[0], '/x/codex');
  assert.ok(codexKandidaten({}, 'darwin').some((k) => k.includes('ChatGPT.app')));
  assert.ok(!codexKandidaten({}, 'win32').some((k) => k.includes('ChatGPT.app')));
});

test('kopf: verlangt nur lesen und Pseudonyme', () => {
  const k = kopf('Claude Code');
  assert.match(k, /Claude Code/);
  assert.match(k, /nur lesen/);
  assert.match(k, /Pseudonyme/);
});
