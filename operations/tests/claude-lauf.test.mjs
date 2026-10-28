import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main, befehlAnzeige, argumente, starteClaude, claudeUmgebung } from '../scripts/claude-lauf.mjs';
import { liesStatus, arbeitsOrdner, auftragPfad, sperrPfad, nimmSperre, LAEUFE } from '../lib/routinen.mjs';

// Montag 26.10.2026, 10:00 Uhr in Berlin - im Zeitfenster.
const IM_FENSTER = new Date('2026-10-26T09:00:00Z');
const SONNTAG = new Date('2026-11-01T09:00:00Z');

function umgebung() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-claude-lauf-'));
  const privat = path.join(root, 'privat');
  for (const name of ['fehlermeldungen-werkbank', 'lieferbelege-postfach', 'serviceanfragen-postfach']) {
    fs.mkdirSync(path.dirname(auftragPfad(privat, name)), { recursive: true });
    fs.writeFileSync(auftragPfad(privat, name), `---\nname: ${name}\ndescription: Test\n---\n\nAuftrag ${name}: Werkbank https://claude.ai/artifact/GEHEIM123 ${'x'.repeat(120)}\nABSCHLUSS: eine Zeile.\n`);
  }
  fs.mkdirSync(path.join(root, 'dienst'));
  const env = { TP_PRIVAT_DIR: privat, TP_DIENST_DIR: path.join(root, 'dienst'), TP_CLAUDE_BIN: '/bin/false', PATH: process.env.PATH };
  return { root, env };
}

/** Ein falsches `claude`: gibt das init-Ereignis aus (FAKE_TOOLS), startet auf Wunsch einen Enkel und wartet oder antwortet. */
function falschesClaude(root) {
  const datei = path.join(root, 'claude-attrappe.mjs');
  fs.writeFileSync(datei, `#!${process.execPath}
import { spawn } from 'node:child_process';
import fs from 'node:fs';
console.log(JSON.stringify({ type: 'system', subtype: 'init', tools: (process.env.FAKE_TOOLS || '').split(',').filter(Boolean), mcp_servers: [] }));
if (process.env.FAKE_ENKEL) { const e = spawn('sleep', ['60'], { stdio: 'ignore' }); fs.writeFileSync(process.env.FAKE_ENKEL, String(e.pid)); }
if (process.env.FAKE_ANTWORT) console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: process.env.FAKE_ANTWORT, permission_denials: [], usage: {} }));
else setTimeout(() => {}, 60_000);
`, { mode: 0o755 });
  return datei;
}

const lebt = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

function antwort(result, extra = {}) {
  return { exitCode: 0, signal: null, zeitlimit: false, stderr: '', stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 3, usage: { input_tokens: 5, cache_read_input_tokens: 100 }, permission_denials: [], result, ...extra }) };
}

const leer = { neu: [], laufend: [], kuerzlichErledigt: [] };

test('Argumente: Lauf muss bekannt sein', () => {
  assert.deepEqual(argumente(['postfach', '--trocken']), { lauf: 'postfach', trocken: true, erzwingen: false, werkzeugprobe: false });
  assert.equal(argumente(['fehlermeldungen', '--werkzeugprobe']).werkzeugprobe, true);
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
  fs.rmSync(auftragPfad(env.TP_PRIVAT_DIR, 'lieferbelege-postfach'));
  let starts = 0;
  assert.equal(await main(['postfach'], { env, jetzt: IM_FENSTER, aus: () => {}, melde: () => {}, starte: async () => { starts += 1; return antwort('nichts Neues'); } }), 1);
  assert.equal(starts, 1);
  const s = liesStatus(env.TP_PRIVAT_DIR, 'lieferbelege');
  assert.equal(s.art, 'auftrag-fehlt');
  assert.match(s.meldung, /Auftragstext fehlt: .*routinen\/auftraege\/lieferbelege-postfach\.md – einmalig mit „bash operations\/scripts\/dienste-einrichten\.sh --routinen“/);
});

test('Fehlermeldungen: ohne eindeutige Werkbank-Adresse im Auftrag startet Claude nicht', async () => {
  const { env } = umgebung();
  fs.writeFileSync(auftragPfad(env.TP_PRIVAT_DIR, 'fehlermeldungen-werkbank'), `Auftrag ohne Adresse ${'x'.repeat(150)}`);
  let starts = 0;
  assert.equal(await main(['fehlermeldungen', '--erzwingen'], { env, jetzt: IM_FENSTER, aus: () => {}, melde: () => {}, abgleich: () => leer, starte: async () => { starts += 1; return antwort('x'); } }), 1);
  assert.equal(starts, 0);
  assert.match(liesStatus(env.TP_PRIVAT_DIR, 'fehlermeldungen').meldung, /keine eindeutige Werkbank-Adresse/);
});

test('Nachziehen (#1715) laeuft: kurz warten, dann uebersprungen mit Hinweis - kein Fehler, kein Claude', async () => {
  const { env } = umgebung();
  let starts = 0;
  let gewartet = 0;
  const deps = { env, jetzt: IM_FENSTER, aus: () => {}, melde: () => { throw new Error('keine Mitteilung'); }, abgleich: () => leer, starte: async () => { starts += 1; return antwort('x'); }, nachziehenAktiv: () => true, warte: async (ms) => { gewartet += ms; } };
  assert.equal(await main(['postfach'], deps), 0);
  assert.equal(starts, 0);
  assert.equal(gewartet, 4 * 60_000, 'hoechstens 4 Minuten');
  for (const id of ['lieferbelege', 'serviceanfragen']) {
    const s = liesStatus(env.TP_PRIVAT_DIR, id);
    assert.equal(s.hinweis, 'wartet auf Nachziehen');
    assert.equal(s.ok, undefined, 'Lebenszeichen, keine Stoerung');
  }
  assert.equal(fs.existsSync(sperrPfad(env.TP_PRIVAT_DIR, 'postfach')), false);
  // Endet das Nachziehen waehrend des Wartens, laeuft die Routine normal.
  let runden = 0;
  assert.equal(await main(['postfach'], { ...deps, melde: () => {}, nachziehenAktiv: () => (runden += 1) <= 2 }), 0);
  assert.equal(starts, 2);
  assert.equal(liesStatus(env.TP_PRIVAT_DIR, 'lieferbelege').hinweis, null);
  // Beginnt es genau zwischen Pruefung und eigener Sperre: Sperre wieder frei, uebersprungen.
  let n = 0;
  assert.equal(await main(['fehlermeldungen'], { ...deps, nachziehenAktiv: () => (n += 1) > 1 }), 0);
  assert.equal(fs.existsSync(sperrPfad(env.TP_PRIVAT_DIR, 'fehlermeldungen')), false);
  assert.equal(liesStatus(env.TP_PRIVAT_DIR, 'fehlermeldungen').hinweis, 'wartet auf Nachziehen');
});

test('Laeuft schon (frische Sperre): uebersprungen, aber mit Lebenszeichen im Status', async () => {
  const { env } = umgebung();
  const s = nimmSperre(sperrPfad(env.TP_PRIVAT_DIR, 'fehlermeldungen'));
  let abgleich = 0;
  assert.equal(await main(['fehlermeldungen'], { env, jetzt: IM_FENSTER, aus: () => {}, abgleich: () => { abgleich += 1; return leer; } }), 0);
  assert.equal(abgleich, 0);
  assert.match(liesStatus(env.TP_PRIVAT_DIR, 'fehlermeldungen').hinweis, /läuft noch/);
  s.freigeben();
});

test('Umgebung fuer claude -p: Abo statt API-Schluessel, Desktop-Kennung, USER, nichts aus einer umgebenden Sitzung', () => {
  const u = claudeUmgebung({ HOME: '/h', PATH: '/p', ANTHROPIC_API_KEY: 'sk-x', CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 's', CLAUDE_CODE_ENTRYPOINT: 'cli', TP_PRIVAT_DIR: '/x' }, 'postfach', LAEUFE.postfach.teile[0]);
  assert.equal(u.CLAUDE_CODE_ENTRYPOINT, 'claude-desktop');
  assert.equal(u.ANTHROPIC_API_KEY, undefined);
  assert.equal(u.CLAUDECODE, undefined);
  assert.equal(u.CLAUDE_CODE_SESSION_ID, undefined);
  assert.ok(u.USER, 'ohne USER findet claude die Anmeldung im Schluesselbund nicht');
  assert.equal(u.TP_ROUTINE, 'postfach/lieferbelege');
  assert.equal(u.TP_PRIVAT_DIR, '/x');
});

test('starteClaude: fehlt ein Pflichtwerkzeug im init-Ereignis, endet der Lauf sofort (werkzeug-fehlt)', async () => {
  const { root } = umgebung();
  const bin = falschesClaude(root);
  const t0 = Date.now();
  const r = await starteClaude(bin, [], { cwd: root, env: { ...process.env, FAKE_TOOLS: 'Bash,ToolSearch' }, zeitlimitMs: 30_000, pflicht: LAEUFE.fehlermeldungen.pflicht });
  assert.ok(Date.now() - t0 < 10_000, 'nicht bis zum Zeitlimit gewartet');
  assert.deepEqual(r.fehlend, ['Artifact', 'ArtifactData']);
  assert.equal(r.zeitlimit, false);
  const { bewerteLauf } = await import('../lib/routinen.mjs');
  assert.equal(bewerteLauf(r).art, 'werkzeug-fehlt');
  const gut = await starteClaude(bin, [], { cwd: root, env: { ...process.env, FAKE_TOOLS: 'Bash,ToolSearch,Artifact,ArtifactData', FAKE_ANTWORT: 'nichts zu tun' }, zeitlimitMs: 30_000, pflicht: LAEUFE.fehlermeldungen.pflicht });
  assert.equal(gut.fehlend, null);
  assert.equal(bewerteLauf(gut).ok, true);
});

test('starteClaude: beim Zeitlimit endet die ganze Prozessgruppe, auch ein Enkelprozess', async () => {
  const { root } = umgebung();
  const bin = falschesClaude(root);
  const enkel = path.join(root, 'enkel.pid');
  const r = await starteClaude(bin, [], { cwd: root, env: { ...process.env, FAKE_TOOLS: 'Bash', FAKE_ENKEL: enkel }, zeitlimitMs: 1500, pflicht: ['Bash'] });
  assert.equal(r.zeitlimit, true);
  const pid = Number(fs.readFileSync(enkel, 'utf8'));
  for (let i = 0; i < 40 && lebt(pid); i += 1) await new Promise(res => setTimeout(res, 50));
  assert.equal(lebt(pid), false, 'sleep 60 des Kindes ist mit beendet');
});

test('--werkzeugprobe: claude -p nur bis zum init-Ereignis, zeigt die Werkzeuge, schreibt keinen Status', async () => {
  const { root, env } = umgebung();
  const zeilen = [];
  const e = { ...env, TP_CLAUDE_BIN: falschesClaude(root), FAKE_TOOLS: 'Bash,ToolSearch,Artifact,ArtifactComments,ArtifactData' };
  assert.equal(await main(['fehlermeldungen', '--werkzeugprobe'], { env: e, jetzt: SONNTAG, aus: z => zeilen.push(z) }), 0);
  assert.match(zeilen.join('\n'), /init-Werkzeuge: Bash, ToolSearch, Artifact, ArtifactComments, ArtifactData/);
  assert.match(zeilen.join('\n'), /Pflicht \(4\): alle da/);
  zeilen.length = 0;
  assert.equal(await main(['postfach', '--werkzeugprobe'], { env: { ...e, FAKE_TOOLS: 'Bash,Read,Write,ToolSearch' }, jetzt: SONNTAG, aus: z => zeilen.push(z) }), 1);
  assert.match(zeilen.join('\n'), /FEHLT mcp__claude_ai_Gmail__search_threads/);
  assert.equal(fs.existsSync(path.join(env.TP_PRIVAT_DIR, 'routinen', 'postfach')), false);
});

test('--trocken: zeigt Befehl, Werkzeuglisten und Kopf, startet nichts, schreibt keinen Status', async () => {
  const { env } = umgebung();
  const zeilen = [];
  let starts = 0;
  assert.equal(await main(['postfach', '--trocken'], { env, jetzt: SONNTAG, aus: z => zeilen.push(z), starte: async () => { starts += 1; } }), 0);
  const text = zeilen.join('\n');
  assert.equal(starts, 0);
  assert.match(text, /Befehl: {4}\/bin\/false -p --model sonnet/);
  assert.match(text, /--settings '\{"hooks":\{"PreToolUse"/);
  assert.match(text, /Wache \(PreToolUse-Hook, --settings\): nur Bash, Read, Write, ToolSearch, mcp__claude_ai_Gmail__search_threads/);
  assert.match(text, /<PROMPT>$/m);
  assert.match(text, /mcp__claude_ai_Gmail__send_message/);
  assert.match(text, /LAUFUMGEBUNG/);
  assert.doesNotMatch(text, /GEHEIM123/, 'der private Auftragstext wird nicht ausgegeben');
  assert.equal(fs.existsSync(path.join(env.TP_PRIVAT_DIR, 'routinen', 'postfach', 'status-lieferbelege.json')), false);
});

test('Befehlsanzeige: Werte mit Leerzeichen gequotet, Prompt verdeckt', () => {
  assert.equal(befehlAnzeige('claude', ['-p', 'Bash(cd /x y)', '--', 'geheim']), "claude -p 'Bash(cd /x y)' -- <PROMPT>");
});
