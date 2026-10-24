// Tests fuer scripts/ki-austausch.mjs (direkter Austausch Claude <-> Codex).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  argumente, codexAufruf, claudeAufruf, codexAntwort, claudeAntwort, codexKandidaten, kindUmgebung, kopf,
  geheim, KONTINGENT, reviewKopf, reviewDateiname, reviewsLesen, reviewStand, ergebnisZeile,
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

test('kindUmgebung: Zugangsdaten gehen an keine der beiden KIs, die eigene Codex-Anmeldung bleibt', () => {
  const q = {
    PATH: '/bin', HOME: '/h', CLAUDE_CODE_MESSAGING_TOKEN: 't', SHOPIFY_ADMIN_TOKEN: 's', GH_TOKEN: 'g',
    GITHUB_TOKEN: 'g2', SSH_AUTH_SOCK: '/sock', LEXWARE_API_KEY: 'l', MEIN_SECRET: 'x', OPENAI_API_KEY: 'o', CODEX_HOME: '/c',
  };
  const x = kindUmgebung(q, 'codex', 0);
  for (const k of ['CLAUDE_CODE_MESSAGING_TOKEN', 'SHOPIFY_ADMIN_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN', 'SSH_AUTH_SOCK', 'LEXWARE_API_KEY', 'MEIN_SECRET']) {
    assert.ok(!(k in x), `${k} darf nicht an Codex gehen`);
  }
  assert.equal(x.OPENAI_API_KEY, 'o');
  assert.equal(x.CODEX_HOME, '/c');
  assert.equal(x.PATH, '/bin');
  const c = kindUmgebung(q, 'claude', 0);
  assert.ok(!('SHOPIFY_ADMIN_TOKEN' in c) && !('OPENAI_API_KEY' in c) && !('GH_TOKEN' in c));
  assert.equal(geheim('PATH', 'codex'), false);
});

test('argumente: review und review-stand brauchen eine PR-Nummer', () => {
  assert.deepEqual(argumente(['review', '1667']), { befehl: 'review', pr: 1667, frage: '' });
  const z = argumente(['review', '12', 'Achte', 'auf', 'Preise', '--aufwand', 'low']);
  assert.equal(z.frage, 'Achte auf Preise');
  assert.equal(z.aufwand, 'low');
  assert.equal(argumente(['review-stand', '7']).befehl, 'review-stand');
  assert.throws(() => argumente(['review']), /PR-Nummer/);
  assert.throws(() => argumente(['review', 'abc']), /PR-Nummer/);
});

test('reviewKopf: nennt PR, Head-Commit, Runde und das Antwortformat', () => {
  const k = reviewKopf({ pr: 5, titel: 'T', head: 'a'.repeat(40), basis: 'main', kopfRef: 'x', runde: 2 });
  assert.match(k, /PR #5/);
  assert.match(k, new RegExp(`Head-Commit ${'a'.repeat(40)}`));
  assert.match(k, /Pruefrunde 2/);
  assert.match(k, /KEINE BEFUNDE/);
  assert.match(k, /nur diesen Diff/);
});

test('reviewStand: aktuell nur fuer denselben Head, sonst veraltet oder fehlt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-ki-review-'));
  const schreib = (sha, zeit, runde) => fs.writeFileSync(path.join(dir, reviewDateiname(9, sha)),
    `# Review PR #9\npr: 9\nhead: ${sha}\nzeit: ${zeit}\nrunde: ${runde}\nergebnis: 1 P1, 0 P2, 0 P3\n---\nP1 x\n`);
  assert.equal(reviewStand(reviewsLesen(dir, 9), 'a'.repeat(40)).status, 'fehlt');
  schreib('a'.repeat(40), '2026-10-24T08:00:00Z', 1);
  schreib('b'.repeat(40), '2026-10-24T09:00:00Z', 2);
  fs.writeFileSync(path.join(dir, reviewDateiname(10, 'c'.repeat(40))), 'head: ccc\n');
  const r = reviewsLesen(dir, 9);
  assert.deepEqual(r.map((x) => x.runde), [1, 2]);
  assert.equal(reviewStand(r, 'b'.repeat(40)).status, 'aktuell');
  assert.equal(reviewStand(r, 'a'.repeat(40)).status, 'veraltet', 'das neueste Review zaehlt, nicht irgendeins');
  assert.equal(reviewsLesen(path.join(dir, 'fehlt'), 9).length, 0);
});

test('ergebnisZeile: zaehlt Befunde, erkennt KEINE BEFUNDE und Formatfehler', () => {
  assert.equal(ergebnisZeile('KEINE BEFUNDE\nGeprueft: alles'), 'keine Befunde');
  assert.equal(ergebnisZeile('- P1 a.mjs:3 - x - y\n- **P2** b:1 - z\nP3 c - d\nGeprueft: Diff'), '1 P1, 1 P2, 1 P3');
  assert.match(ergebnisZeile('Sieht gut aus.'), /unklar/);
});

test('Kontingent erschoepft wird erkannt, eine Zeilennummer 429 nicht', () => {
  assert.ok(KONTINGENT.test("You've hit your usage limit. Try again later."));
  assert.ok(KONTINGENT.test('HTTP 429 Too Many Requests'));
  assert.ok(!KONTINGENT.test('at scripts/x.mjs:429:12'));
});
