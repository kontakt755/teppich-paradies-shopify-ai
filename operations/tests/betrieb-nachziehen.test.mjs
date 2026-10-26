import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  automationLesen, codexArbeitet, letzterLaufmarker, nachziehStand, neustartNoetig,
  privatRuhe, probeTests, prZeilen, zustandNach,
} from '../lib/betrieb-nachziehen.mjs';
import { betriebszustand } from '../lib/betriebszustand.mjs';
import { nachziehen } from '../scripts/betrieb-nachziehen.mjs';

const tmp = name => fs.mkdtempSync(path.join(os.tmpdir(), `tp-nachziehen-test-${name}-`));
const alt = (datei, sekunden) => { const t = (Date.now() - sekunden * 1000) / 1000; fs.utimesSync(datei, t, t); };

test('privatRuhe: nur Eingaben im Privatordner zaehlen, nicht Protokolle und Sync-Unterordner', () => {
  const dir = tmp('ruhe');
  fs.writeFileSync(path.join(dir, 'muster-packen.json'), '{}'); alt(path.join(dir, 'muster-packen.json'), 300);
  fs.writeFileSync(path.join(dir, 'dashboard-dienst.log'), 'x');
  fs.writeFileSync(path.join(dir, 'aktualisierung.json'), '{}');
  fs.mkdirSync(path.join(dir, 'lexikon')); fs.writeFileSync(path.join(dir, 'lexikon', 'produkte.json'), '[]');
  assert.deepEqual(privatRuhe(dir), { ruhig: true, datei: 'muster-packen.json', alterSekunden: 300 });
  fs.writeFileSync(path.join(dir, 'auftragsstatus.json'), '{}');
  const r = privatRuhe(dir);
  assert.equal(r.ruhig, false);
  assert.equal(r.datei, 'auftragsstatus.json');
  assert.equal(privatRuhe(path.join(dir, 'gibt-es-nicht')).ruhig, true);
});

test('Codex: offener Lauf blockiert, fertiger, fremder oder seit 30 Minuten stiller Lauf nicht', () => {
  const codex = tmp('codex');
  const automations = path.join(codex, 'automations'), sessions = path.join(codex, 'sessions', '2026', '10', '22');
  fs.mkdirSync(path.join(automations, 'muster'), { recursive: true });
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(path.join(automations, 'muster', 'automation.toml'),
    'version = 1\nstatus = "ACTIVE"\ntarget_thread_id = "abc-123"\nprompt = "Arbeitsverzeichnis /Users/x/tp-dashboard, \\"zitiert\\""\n');
  const protokoll = path.join(sessions, 'rollout-2026-10-22T13-27-23-abc-123.jsonl');
  const arg = { automationsDir: automations, sessionsDir: path.join(codex, 'sessions'), checkout: '/Users/x/tp-dashboard' };
  fs.writeFileSync(protokoll, '{"payload":{"type":"task_started"}}\n{"payload":{"type":"task_complete"}}\n{"payload":{"type":"task_started"}}\n');
  assert.equal(codexArbeitet(arg).arbeitet, true);
  fs.appendFileSync(protokoll, '{"payload":{"type":"task_complete"}}\n');
  assert.equal(codexArbeitet(arg).arbeitet, false);
  fs.appendFileSync(protokoll, '{"payload":{"type":"task_started"}}\n');
  assert.equal(codexArbeitet({ ...arg, checkout: '/Users/x/tp-bestellungen' }).arbeitet, false, 'arbeitet in einem anderen Checkout');
  alt(protokoll, 31 * 60);
  assert.equal(codexArbeitet(arg).arbeitet, false, 'abgebrochener Lauf blockiert nicht ewig');
  assert.equal(codexArbeitet({ ...arg, automationsDir: path.join(codex, 'fehlt') }).arbeitet, false);
  assert.equal(automationLesen('status = "PAUSED"\nprompt = "a \\"b\\""').prompt, 'a "b"');
  assert.equal(letzterLaufmarker('nichts'), null);
});

test('Neustart nur fuer betroffene Dienste, Theme- und Regeldateien starten nichts', () => {
  assert.deepEqual(neustartNoetig(['sections/main.liquid', 'AGENTS.md', '.claude/skills/x/SKILL.md', 'docs/lessons/a.md']), []);
  assert.deepEqual(neustartNoetig(['docs/ai-dashboard/app.js']), ['dashboard']);
  assert.deepEqual(neustartNoetig(['operations/lib/sync.mjs']), ['dashboard', 'sync']);
  assert.deepEqual(neustartNoetig(['social/scripts/server.mjs']), ['dashboard', 'social']);
  assert.deepEqual(neustartNoetig(['package-lock.json']), ['dashboard', 'sync', 'social']);
  assert.deepEqual(probeTests(['docs/ai-dashboard/app.js']), ['dashboard:test']);
  assert.deepEqual(probeTests(['operations/lib/a.mjs', 'social/b.mjs']), ['dashboard:test', 'operations:test', 'social:test']);
  assert.deepEqual(prZeilen('Merge pull request #1707 from x/y\tPackstation: Wareneingang\nzweite Zeile\nMerge branch main\t'), ['#1707 Packstation: Wareneingang']);
});

test('Zustand: haengt sperrt nur bei eigenem Fehler von main, Systemzustand meldet haengt, alt und langes Warten', () => {
  const t0 = new Date('2026-10-26T10:00:00Z');
  let z = zustandNach({}, { stand: 'haengt', grund: 'Konflikt', main: 'aaaa', sperren: true }, t0);
  assert.deepEqual(z.gesperrt, { main: 'aaaa', grund: 'Konflikt' });
  assert.equal(z.verlauf.length, 1);
  z = zustandNach(z, { stand: 'haengt', grund: 'Konflikt', main: 'aaaa', sperren: true }, t0);
  assert.equal(z.verlauf.length, 1, 'derselbe Grund steht nur einmal im Verlauf');
  assert.equal(zustandNach(z, { stand: 'haengt', grund: 'eigene Änderungen', main: 'aaaa' }, t0).gesperrt, null);
  z = zustandNach(z, { stand: 'aktuell', nachgezogen: true, von: 'a', nach: 'b', prs: ['#1 X'] }, t0);
  assert.equal(z.gesperrt, null);
  assert.equal(z.verlauf.at(-1).was, 'nachgezogen a → b');
  let lang = { verlauf: [] };
  for (let i = 0; i < 40; i++) lang = zustandNach(lang, { stand: 'aktuell', nachgezogen: true, von: String(i), nach: String(i + 1) }, t0);
  assert.equal(lang.verlauf.length, 30);

  const dir = tmp('stand');
  const schreibe = obj => fs.writeFileSync(path.join(dir, 'betrieb-nachziehen.json'), JSON.stringify(obj));
  assert.equal(nachziehStand(dir, { jetzt: t0 }).status, 'unbekannt');
  schreibe({ stand: 'aktuell', zuletztGeprueft: '2026-10-26T09:58:00Z', zuletztNachgezogen: '2026-10-26T09:00:00Z' });
  assert.equal(nachziehStand(dir, { jetzt: t0 }).status, 'ok');
  assert.equal(betriebszustand(dir, { jetzt: t0 }).nachziehen.zuletztNachgezogen, '2026-10-26T09:00:00Z');
  assert.equal(nachziehStand(dir, { jetzt: new Date('2026-10-26T12:30:00Z') }).status, 'alt');
  schreibe({ stand: 'wartet', zuletztGeprueft: '2026-10-26T09:58:00Z', wartetSeit: '2026-10-26T09:30:00Z', grund: 'Codex' });
  assert.equal(nachziehStand(dir, { jetzt: t0 }).status, 'ok', 'kurzes Warten ist normal');
  assert.equal(nachziehStand(dir, { jetzt: new Date('2026-10-26T10:31:00Z') }).status, 'wartet', 'seit über einer Stunde keine ruhige Minute');
  schreibe({ stand: 'wartet', zuletztGeprueft: '2026-10-26T10:29:00Z', wartetSeit: '2026-10-26T09:00:00Z', grund: 'Codex' });
  assert.equal(nachziehStand(dir, { jetzt: new Date('2026-10-26T10:31:00Z') }).status, 'wartet');
  schreibe({ stand: 'haengt', zuletztGeprueft: '2026-10-20T09:58:00Z', grund: 'Konflikt' });
  assert.deepEqual([nachziehStand(dir, { jetzt: t0 }).status, nachziehStand(dir, { jetzt: t0 }).grund], ['fehler', 'Konflikt']);
  fs.writeFileSync(path.join(dir, 'betrieb-nachziehen.json'), '{kaputt');
  assert.equal(nachziehStand(dir, { jetzt: t0 }).status, 'fehler');
});

// --- Ablauf mit echtem git: origin (bare), Entwickler-Klon und Dienst-Checkout ------------

const GIT_ENV = { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
Object.assign(process.env, GIT_ENV);
const g = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function aufbau() {
  const root = tmp('git');
  const origin = path.join(root, 'origin.git'), dev = path.join(root, 'dev'), betrieb = path.join(root, 'tp-dashboard'), privat = path.join(root, 'privat');
  fs.mkdirSync(privat);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  execFileSync('git', ['clone', '-q', origin, dev], { stdio: 'ignore' });
  const zaehler = path.join(root, 'probe-laeufe.txt');
  // Die Probe-"Tests" schlagen fehl, sobald die Datei ROT im Stand liegt, und zaehlen ihre Laeufe.
  const testSkript = "node -e \"require('fs').appendFileSync(process.env.TP_PROBE_ZAEHLER,'x');process.exit(require('fs').existsSync('ROT')?1:0)\"";
  fs.writeFileSync(path.join(dev, 'package.json'), JSON.stringify({ name: 'probe', private: true, scripts: { 'dashboard:test': testSkript, 'operations:test': testSkript } }, null, 2));
  fs.mkdirSync(path.join(dev, 'docs', 'ai-dashboard'), { recursive: true });
  fs.writeFileSync(path.join(dev, 'docs', 'ai-dashboard', 'app.js'), 'eins\n');
  g(dev, 'add', '-A'); g(dev, 'commit', '-q', '-m', 'start'); g(dev, 'push', '-q', 'origin', 'main');
  execFileSync('git', ['clone', '-q', '-b', 'main', origin, betrieb], { stdio: 'ignore' });
  g(betrieb, 'checkout', '-q', '-b', 'dashboard-betrieb');
  process.env.TP_PROBE_ZAEHLER = zaehler;
  const probeLaeufe = () => (fs.existsSync(zaehler) ? fs.readFileSync(zaehler, 'utf8').length : 0);
  const aufMain = (datei, inhalt, titel = 'Neuerung') => {
    fs.mkdirSync(path.dirname(path.join(dev, datei)), { recursive: true });
    fs.writeFileSync(path.join(dev, datei), inhalt);
    g(dev, 'add', '-A'); g(dev, 'commit', '-q', '-m', titel); g(dev, 'push', '-q', 'origin', 'main');
  };
  return { betrieb, privat, aufMain, probeLaeufe, kopf: () => g(betrieb, 'rev-parse', 'HEAD') };
}

function steuerung({ gesund = [] } = {}) {
  const neustarts = [];
  return { neustarts, geladen: () => true, pid: () => 1, neustart: l => neustarts.push(l), gesund: async () => (gesund.length ? gesund.shift() : true) };
}
const ruhig = () => ({ ruhig: true });
const lauf = (u, s, extra = {}) => nachziehen({ repo: u.betrieb, privatDir: u.privat, steuerung: s, ruhe: ruhig, warteMs: 0, pollMs: 1, ...extra });

test('Ablauf: nichts Neues bleibt still, Neuerung wird getestet, vorgespult und das Dashboard neu gestartet', async () => {
  const u = aufbau();
  const s = steuerung();
  assert.equal((await lauf(u, s)).stand, 'aktuell');
  assert.equal(s.neustarts.length, 0);
  const vorher = u.kopf();
  u.aufMain('docs/ai-dashboard/app.js', 'zwei\n');
  const r = await lauf(u, s);
  assert.equal(r.stand, 'aktuell');
  assert.equal(r.nachgezogen, true);
  assert.deepEqual(s.neustarts, ['net.teppich-paradies.dashboard']);
  assert.equal(u.probeLaeufe(), 1);
  assert.equal(fs.readFileSync(path.join(u.betrieb, 'docs/ai-dashboard/app.js'), 'utf8'), 'zwei\n');
  assert.equal(g(u.betrieb, 'rev-parse', 'HEAD^1'), vorher, 'Merge-Commit auf dem bisherigen Stand');
  assert.equal(g(u.betrieb, 'rev-parse', 'HEAD^2'), g(u.betrieb, 'rev-parse', 'origin/main'));
  assert.equal(g(u.betrieb, 'symbolic-ref', '--short', 'HEAD'), 'dashboard-betrieb');
  assert.match(g(u.betrieb, 'log', '-1', '--format=%s'), /^merge: main nachgezogen \(automatisch, /);
  const z = JSON.parse(fs.readFileSync(path.join(u.privat, 'betrieb-nachziehen.json'), 'utf8'));
  assert.equal(z.stand, 'aktuell');
  assert.equal(z.rueckstand, 0);
  assert.ok(!fs.existsSync(path.join(u.privat, 'betrieb-nachziehen.lock')));
  // Reine Theme-Aenderung: vorspulen, aber kein Neustart.
  u.aufMain('sections/x.liquid', 'theme\n');
  assert.equal((await lauf(u, s)).nachgezogen, true);
  assert.equal(s.neustarts.length, 1);
});

test('Ablauf: rote Probe und Konflikt lassen den Dienst unberuehrt und werden fuer diesen main-Stand nicht wiederholt', async () => {
  const u = aufbau();
  const s = steuerung();
  const vorher = u.kopf();
  u.aufMain('ROT', 'x');
  const rot = await lauf(u, s);
  assert.equal(rot.stand, 'haengt');
  assert.match(rot.grund, /Prüfung der neuen Version fehlgeschlagen \(dashboard:test\)/);
  assert.equal(u.kopf(), vorher);
  assert.equal(s.neustarts.length, 0);
  assert.equal((await lauf(u, s)).still, true);
  assert.equal(u.probeLaeufe(), 1, 'kein zweiter Testlauf fuer denselben Stand');
  // main zieht weiter (Fehler behoben): neuer Versuch.
  fs.rmSync(path.join(path.dirname(u.betrieb), 'dev', 'ROT'));
  u.aufMain('docs/ai-dashboard/app.js', 'repariert\n');
  assert.equal((await lauf(u, s)).nachgezogen, true);

  // Konflikt: der Betriebszweig traegt eine eigene Aenderung an derselben Zeile.
  fs.writeFileSync(path.join(u.betrieb, 'docs/ai-dashboard/app.js'), 'betrieb\n');
  g(u.betrieb, 'commit', '-q', '-am', 'eigene Aenderung');
  const mitEigenem = u.kopf();
  u.aufMain('docs/ai-dashboard/app.js', 'main\n');
  const k = await lauf(u, s);
  assert.equal(k.stand, 'haengt');
  assert.match(k.grund, /Konflikt in docs\/ai-dashboard\/app\.js/);
  assert.equal(u.kopf(), mitEigenem);
});

test('Ablauf: antwortet das Dashboard nach dem Update nicht, laeuft wieder der bisherige Stand', async () => {
  const u = aufbau();
  const s = steuerung({ gesund: [false, true] });
  const vorher = u.kopf();
  u.aufMain('docs/ai-dashboard/app.js', 'kaputt\n');
  const r = await lauf(u, s);
  assert.equal(r.stand, 'haengt');
  assert.match(r.grund, /startete das Dashboard nicht – der bisherige Stand läuft wieder/);
  assert.equal(u.kopf(), vorher);
  assert.equal(fs.readFileSync(path.join(u.betrieb, 'docs/ai-dashboard/app.js'), 'utf8'), 'eins\n');
  assert.deepEqual(s.neustarts, ['net.teppich-paradies.dashboard', 'net.teppich-paradies.dashboard']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(u.privat, 'betrieb-nachziehen.json'), 'utf8')).gesperrt.grund, r.grund);
});

test('Ablauf: ohne Ruhe wird gewartet, der gruene Test gilt beim naechsten Lauf weiter', async () => {
  const u = aufbau();
  const s = steuerung();
  const vorher = u.kopf();
  u.aufMain('docs/ai-dashboard/app.js', 'zwei\n');
  const w = await lauf(u, s, { ruhe: () => ({ ruhig: false, grund: 'Codex-Automation muster laeuft' }) });
  assert.equal(w.stand, 'wartet');
  assert.match(w.grund, /Codex-Automation muster laeuft/);
  assert.equal(u.kopf(), vorher);
  assert.equal(s.neustarts.length, 0);
  assert.equal((await lauf(u, s)).nachgezogen, true);
  assert.equal(u.probeLaeufe(), 1, 'derselbe Baum wird nicht noch einmal getestet');
});

test('Ablauf: eigene Aenderungen im Dienst-Ordner, falscher Zweig und Probe von Hand aendern nichts', async () => {
  const u = aufbau();
  const s = steuerung();
  u.aufMain('docs/ai-dashboard/app.js', 'zwei\n');
  const vorher = u.kopf();
  const probe = await lauf(u, s, { probe: true });
  assert.equal(probe.stand, 'probe-gruen');
  assert.equal(u.kopf(), vorher);
  assert.ok(!fs.existsSync(path.join(u.privat, 'betrieb-nachziehen.json')), 'Probe schreibt keinen Zustand');
  fs.writeFileSync(path.join(u.betrieb, 'package.json'), '{}');
  const schmutzig = await lauf(u, s);
  assert.equal(schmutzig.stand, 'haengt');
  assert.match(schmutzig.grund, /eigene Änderungen \(package\.json\)/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(u.privat, 'betrieb-nachziehen.json'), 'utf8')).gesperrt, null);
  g(u.betrieb, 'checkout', '-q', '--', 'package.json');
  g(u.betrieb, 'checkout', '-q', '--detach');
  assert.match((await lauf(u, s)).grund, /losgelöst/);
  assert.equal(s.neustarts.length, 0);
});
