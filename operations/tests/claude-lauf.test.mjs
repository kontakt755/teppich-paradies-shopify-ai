import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main, befehlAnzeige, argumente } from '../scripts/claude-lauf.mjs';
import { liesStatus, arbeitsOrdner } from '../lib/routinen.mjs';

// Montag 26.10.2026, 10:00 Uhr in Berlin - im Zeitfenster.
const IM_FENSTER = new Date('2026-10-26T09:00:00Z');
const SONNTAG = new Date('2026-11-01T09:00:00Z');

function umgebung() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-claude-lauf-'));
  const aufgaben = path.join(root, 'aufgaben');
  for (const name of ['fehlermeldungen-werkbank', 'lieferbelege-postfach', 'serviceanfragen-postfach']) {
    fs.mkdirSync(path.join(aufgaben, name), { recursive: true });
    fs.writeFileSync(path.join(aufgaben, name, 'SKILL.md'), `---\nname: ${name}\ndescription: Test\n---\n\nAuftrag ${name}: Werkbank https://claude.ai/artifact/GEHEIM123 ${'x'.repeat(120)}\nABSCHLUSS: eine Zeile.\n`);
  }
  const env = { TP_PRIVAT_DIR: path.join(root, 'privat'), TP_DIENST_DIR: path.join(root, 'dienst'), TP_AUFGABEN_DIR: aufgaben, TP_CLAUDE_BIN: '/bin/false', PATH: process.env.PATH };
  return { root, env };
}

function antwort(result, extra = {}) {
  return { exitCode: 0, signal: null, zeitlimit: false, stderr: '', stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 3, usage: { input_tokens: 5, cache_read_input_tokens: 100 }, permission_denials: [], result, ...extra }) };
}

const leer = { neu: [], laufend: [], kuerzlichErledigt: [] };

test('Argumente: Lauf muss bekannt sein', () => {
  assert.deepEqual(argumente(['postfach', '--trocken']), { lauf: 'postfach', trocken: true, erzwingen: false });
  assert.throws(() => argumente(['unbekannt']));
  assert.throws(() => argumente(['postfach', '--los']));
});

test('Fehlermeldungen: leere Listen -> Claude startet nicht, Status "nichts zu tun"', async () => {
  const { env } = umgebung();
  const starts = [];
  const zeilen = [];
  const code = await main(['fehlermeldungen'], { env, jetzt: IM_FENSTER, aus: z => zeilen.push(z), abgleich: () => leer, starte: async (...a) => { starts.push(a); return antwort('x'); }, melde: () => {} });
  assert.equal(code, 0);
  assert.equal(starts.length, 0);
  assert.match(zeilen.join('\n'), /Claude startet nicht \(nichts zu tun\)/);
  const s = liesStatus(env.TP_PRIVAT_DIR, 'fehlermeldungen');
  assert.equal(s.ok, true);
  assert.equal(s.meldung, 'nichts zu tun');
});

test('Fehlermeldungen: neue Meldung -> genau ein claude-Lauf; bleibt sie neu, ist das ein Fehler mit Mitteilung', async () => {
  const { env } = umgebung();
  const starts = [];
  const mitteilungen = [];
  let abgleiche = 0;
  const deps = {
    env, jetzt: IM_FENSTER, aus: () => {}, melde: (t, m) => mitteilungen.push([t, m]),
    abgleich: () => { abgleiche += 1; return { ...leer, neu: [{ id: 'F-007' }] }; },
    starte: async (bin, args, o) => {
      starts.push({ bin, args, o });
      fs.writeFileSync(path.join(arbeitsOrdner(env.TP_PRIVAT_DIR, 'fehlermeldungen'), 'zwischen.json'), '[]');
      return antwort('übernommen F-007');
    },
  };
  assert.equal(await main(['fehlermeldungen'], deps), 1);
  assert.equal(starts.length, 1);
  assert.equal(abgleiche, 2, 'Vorpruefung und Gegenprobe');
  assert.equal(starts[0].o.cwd, env.TP_DIENST_DIR);
  const prompt = starts[0].args.at(-1);
  assert.match(prompt, /^LAUFUMGEBUNG/);
  assert.match(prompt, /Auftrag fehlermeldungen-werkbank/);
  assert.doesNotMatch(prompt, /^---/m, 'YAML-Kopf abgeschnitten');
  assert.deepEqual(fs.readdirSync(arbeitsOrdner(env.TP_PRIVAT_DIR, 'fehlermeldungen')), [], 'Arbeitsordner nach dem Lauf leer');
  const s = liesStatus(env.TP_PRIVAT_DIR, 'fehlermeldungen');
  assert.equal(s.ok, false);
  assert.equal(s.art, 'nicht-uebernommen');
  assert.equal(s.letzterClaudeOk, false);
  assert.equal(mitteilungen.length, 1);
  // Gleich danach: Pause statt neuem Lauf.
  assert.equal(await main(['fehlermeldungen'], { ...deps, jetzt: new Date(IM_FENSTER.getTime() + 15 * 60_000) }), 0);
  assert.equal(starts.length, 1);
  const protokolle = fs.readdirSync(path.join(env.TP_PRIVAT_DIR, 'routinen', 'fehlermeldungen', 'laeufe'));
  assert.equal(protokolle.length, 1);
  assert.doesNotMatch(fs.readFileSync(path.join(env.TP_PRIVAT_DIR, 'routinen', 'fehlermeldungen', 'laeufe', protokolle[0]), 'utf8'), /GEHEIM123/, 'Auftragstext steht nicht im Protokoll');
});

test('Fehlermeldungen --erzwingen: Claude startet auch ohne Arbeit und ausserhalb der Zeit', async () => {
  const { env } = umgebung();
  let starts = 0;
  const code = await main(['fehlermeldungen', '--erzwingen'], { env, jetzt: SONNTAG, aus: () => {}, melde: () => {}, abgleich: () => leer, starte: async () => { starts += 1; return antwort('nichts zu tun'); } });
  assert.equal(code, 0);
  assert.equal(starts, 1);
  const s = liesStatus(env.TP_PRIVAT_DIR, 'fehlermeldungen');
  assert.equal(s.ok, true);
  assert.equal(s.meldung, 'nichts zu tun');
  assert.ok(s.letzterClaudeLauf);
});

test('Ausserhalb Mo-Sa 7-19 Uhr: kein Abgleich, kein Claude', async () => {
  const { env } = umgebung();
  let abgleich = 0;
  let starts = 0;
  assert.equal(await main(['fehlermeldungen'], { env, jetzt: SONNTAG, aus: () => {}, abgleich: () => { abgleich += 1; return leer; }, starte: async () => { starts += 1; } }), 0);
  assert.equal(await main(['postfach'], { env, jetzt: SONNTAG, aus: () => {}, starte: async () => { starts += 1; } }), 0);
  assert.equal(abgleich + starts, 0);
});

test('Postfach: zwei getrennte Laeufe; ein Fehler im ersten verhindert den zweiten nicht', async () => {
  const { env } = umgebung();
  const starts = [];
  const mitteilungen = [];
  const code = await main(['postfach'], {
    env, jetzt: IM_FENSTER, aus: () => {}, melde: (t) => mitteilungen.push(t),
    starte: async (bin, args) => {
      starts.push(args.at(-1));
      return starts.length === 1 ? { exitCode: 1, signal: null, stdout: 'kaputt', stderr: 'Fehler', zeitlimit: false } : antwort('nichts Neues');
    },
  });
  assert.equal(code, 1);
  assert.equal(starts.length, 2);
  assert.match(starts[0], /Auftrag lieferbelege-postfach/);
  assert.match(starts[1], /Auftrag serviceanfragen-postfach/);
  assert.doesNotMatch(starts[1], /lieferbelege-postfach/, 'zweiter Lauf ohne den ersten Auftrag');
  assert.equal(liesStatus(env.TP_PRIVAT_DIR, 'lieferbelege').ok, false);
  assert.equal(liesStatus(env.TP_PRIVAT_DIR, 'serviceanfragen').ok, true);
  assert.deepEqual(mitteilungen, ['Lieferbelege aus dem Postfach']);
});

test('Postfach: fehlt ein Auftragstext, laeuft der andere Teil trotzdem', async () => {
  const { env } = umgebung();
  fs.rmSync(path.join(env.TP_AUFGABEN_DIR, 'lieferbelege-postfach'), { recursive: true });
  let starts = 0;
  assert.equal(await main(['postfach'], { env, jetzt: IM_FENSTER, aus: () => {}, melde: () => {}, starte: async () => { starts += 1; return antwort('nichts Neues'); } }), 1);
  assert.equal(starts, 1);
  assert.match(liesStatus(env.TP_PRIVAT_DIR, 'lieferbelege').meldung, /Auftragstext fehlt/);
});

test('--trocken: zeigt Befehl, Werkzeuglisten und Kopf, startet nichts, schreibt keinen Status', async () => {
  const { env } = umgebung();
  const zeilen = [];
  let starts = 0;
  assert.equal(await main(['postfach', '--trocken'], { env, jetzt: SONNTAG, aus: z => zeilen.push(z), starte: async () => { starts += 1; } }), 0);
  const text = zeilen.join('\n');
  assert.equal(starts, 0);
  assert.match(text, /Befehl: {4}\/bin\/false -p --model sonnet/);
  assert.match(text, /<PROMPT>$/m);
  assert.match(text, /mcp__claude_ai_Gmail__send_message/);
  assert.match(text, /LAUFUMGEBUNG/);
  assert.doesNotMatch(text, /GEHEIM123/, 'der private Auftragstext wird nicht ausgegeben');
  assert.equal(fs.existsSync(path.join(env.TP_PRIVAT_DIR, 'routinen', 'postfach', 'status-lieferbelege.json')), false);
});

test('Befehlsanzeige: Werte mit Leerzeichen gequotet, Prompt verdeckt', () => {
  assert.equal(befehlAnzeige('claude', ['-p', 'Bash(cd /x y)', '--', 'geheim']), "claude -p 'Bash(cd /x y)' -- <PROMPT>");
});
