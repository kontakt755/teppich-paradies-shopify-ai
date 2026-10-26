import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  automationLesen, codexArbeitet, letzterLaufmarker, MODULE_HEAD, MODULE_NEU, MODULE_VORHER, moduleReste, moduleTauschen,
  nachziehStand, neustartNoetig, privatRuhe, probeTests, prZeilen, zustandNach,
} from '../lib/betrieb-nachziehen.mjs';
import { betriebszustand } from '../lib/betriebszustand.mjs';
import { nachziehen, sperreNehmen, sperreVerwaist, SPERRE_ALT_MS } from '../scripts/betrieb-nachziehen.mjs';
import { spawnSync } from 'node:child_process';

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
  // Derselbe Text in einer Werkzeugausgabe ist kein Laufende; eine abgeschnittene erste Zeile stoert nicht.
  const ausgabe = JSON.stringify({ payload: { type: 'function_call_output', output: '{"type":"task_complete"}' } });
  assert.equal(letzterLaufmarker(`pe":"task_complete"}}\n{"payload":{"type":"task_started"}}\n${ausgabe}\n`), 'gestartet');
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
  return { dev, betrieb, privat, aufMain, probeLaeufe, kopf: () => g(betrieb, 'rev-parse', 'HEAD') };
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

test('Sperre: lebender Lauf blockiert, toter oder uralter nicht', () => {
  const dir = tmp('sperre');
  const datei = path.join(dir, 'betrieb-nachziehen.lock');
  assert.equal(sperreNehmen(datei), true);
  assert.equal(sperreNehmen(datei), false, 'eigener, lebender Prozess haelt die Sperre');
  assert.equal(sperreVerwaist(datei), false);
  alt(datei, SPERRE_ALT_MS / 1000 + 60);
  assert.equal(sperreVerwaist(datei), true, 'aelter als jeder Lauf: auch eine wiederverwendete PID blockiert nicht');
  fs.writeFileSync(datei, '999999999');
  assert.equal(sperreVerwaist(datei), true, 'Prozess gibt es nicht mehr');
  assert.equal(sperreNehmen(datei), true);
  assert.equal(fs.readFileSync(datei, 'utf8'), String(process.pid));
});

test('Konflikt traegt die Art fuer die Oberflaeche, Einzelheiten bleiben im Grund', async () => {
  const u = aufbau();
  fs.writeFileSync(path.join(u.betrieb, 'docs/ai-dashboard/app.js'), 'betrieb\n');
  g(u.betrieb, 'commit', '-q', '-am', 'eigene Aenderung');
  u.aufMain('docs/ai-dashboard/app.js', 'main\n');
  await lauf(u, steuerung());
  const stand = nachziehStand(u.privat);
  assert.equal(stand.art, 'konflikt');
  assert.match(stand.grund, /app\.js/);
});

test('CLI: im Dienst still bei Wiederholungen, von Hand immer mit Antwort', () => {
  const privat = tmp('cli');
  const skript = new URL('../scripts/betrieb-nachziehen.mjs', import.meta.url).pathname;
  // Ein Zweig, den es nicht gibt: auch im Dienst-Checkout selbst haengt jeder Lauf sofort, nichts wird geholt oder neu gestartet.
  const starte = env => spawnSync(process.execPath, [skript], { encoding: 'utf8', env: { ...process.env, TP_PRIVAT_DIR: privat, TP_NACHZIEHEN_ZWEIG: 'test-zweig-gibt-es-nicht', ...env } });
  const erst = starte({ TP_NACHZIEHEN_DIENST: '1' });
  assert.equal(erst.status, 1);
  assert.match(erst.stdout, /haengt: Arbeitskopie steht auf/);
  assert.equal(starte({ TP_NACHZIEHEN_DIENST: '1' }).stdout, '', 'derselbe Stand wird im Dienst nicht wiederholt');
  assert.match(starte({ TP_NACHZIEHEN_DIENST: '' }).stdout, /haengt: Arbeitskopie steht auf/);
  assert.match(spawnSync(process.execPath, [skript, '--status'], { encoding: 'utf8', env: { ...process.env, TP_PRIVAT_DIR: privat } }).stdout, /^Stand: haengt/);
});

test('Bibliotheken: Tausch per Umbenennen, Rueckweg ohne Netz, Reste eines Abbruchs', () => {
  const repo = tmp('module');
  const lies = ordner => fs.readFileSync(path.join(repo, ordner, 'stand.txt'), 'utf8');
  const lege = (ordner, inhalt) => { fs.mkdirSync(path.join(repo, ordner)); fs.writeFileSync(path.join(repo, ordner, 'stand.txt'), inhalt); };
  lege('node_modules', 'alt');
  assert.throws(() => moduleTauschen(repo), /fehlen/);
  assert.equal(lies('node_modules'), 'alt', 'ohne getestete Bibliotheken bleibt alles, wie es ist');
  lege(MODULE_NEU, 'neu');
  const t = moduleTauschen(repo);
  assert.equal(lies('node_modules'), 'neu');
  t.zurueck();
  assert.equal(lies('node_modules'), 'alt');
  assert.deepEqual(fs.readdirSync(repo), ['node_modules']);
  lege(MODULE_NEU, 'neu');
  moduleTauschen(repo).aufraeumen();
  assert.deepEqual(fs.readdirSync(repo), ['node_modules']);
  // Abbruch zwischen den beiden Umbenennungen: node_modules fehlt, der alte Stand kommt zurueck.
  fs.renameSync(path.join(repo, 'node_modules'), path.join(repo, MODULE_VORHER));
  lege(MODULE_NEU, 'halb');
  moduleReste(repo);
  assert.equal(lies('node_modules'), 'neu');
  assert.deepEqual(fs.readdirSync(repo), ['node_modules']);

  // Abbruch nach dem Tausch, aber vor dem Vorspulen: HEAD steht noch auf der Marke.
  // Zurueckgetauscht wird erst in Ruhe (laufende Routine, #1711); bis dahin bleibt alles liegen.
  fs.writeFileSync(path.join(repo, 'node_modules', 'stand.txt'), 'alt');
  lege(MODULE_NEU, 'neu');
  moduleTauschen(repo, { head: 'aaaa' });
  assert.equal(moduleReste(repo, { head: 'aaaa', darfTauschen: () => false }), 'wartet');
  assert.equal(lies('node_modules'), 'neu');
  assert.ok(fs.existsSync(path.join(repo, MODULE_VORHER)) && fs.existsSync(path.join(repo, MODULE_HEAD)), 'nichts geloescht, solange es nicht ruhig ist');
  assert.equal(moduleReste(repo, { head: 'aaaa', darfTauschen: () => true }), null);
  assert.equal(lies('node_modules'), 'alt', 'neue Bibliotheken unter altem Stand werden zurueckgenommen');
  assert.deepEqual(fs.readdirSync(repo), ['node_modules']);
  // Abbruch nach dem Vorspulen: die neuen Bibliotheken passen zum neuen HEAD und bleiben.
  lege(MODULE_NEU, 'neu');
  moduleTauschen(repo, { head: 'aaaa' });
  moduleReste(repo, { head: 'bbbb' });
  assert.equal(lies('node_modules'), 'neu');
  assert.deepEqual(fs.readdirSync(repo), ['node_modules']);

  // Scheitert das zweite Umbenennen, steht sofort wieder der alte Ordner da.
  lege(MODULE_NEU, 'kaputt');
  let n = 0;
  const umbenennen = (a, b) => { if (++n === 2) throw Object.assign(new Error('EIO'), { code: 'EIO' }); fs.renameSync(a, b); };
  assert.throws(() => moduleTauschen(repo, { head: 'bbbb', umbenennen }), /EIO/);
  assert.equal(lies('node_modules'), 'neu');
  assert.ok(!fs.existsSync(path.join(repo, MODULE_HEAD)));
});

test('Ablauf: neue Bibliotheken kommen getestet aus der Probe, nie per npm ci im laufenden Betrieb', async () => {
  const u = aufbau();
  const npmOffline = (cwd, ...args) => execFileSync('npm', [...args, '--offline', '--no-audit', '--no-fund'], { cwd, stdio: 'ignore' });
  // Lokale Bibliothek, als Kopie installiert (install-links): so liegt sie wirklich in node_modules.
  // Die Probe schreibt eine Marke hinein; ein npm ci im Betrieb haette sie geloescht.
  const marke = "node -e \"require('fs').appendFileSync(process.env.TP_PROBE_ZAEHLER,'x');require('fs').writeFileSync('node_modules/.aus-der-probe',process.cwd())\"";
  const version = v => {
    fs.mkdirSync(path.join(u.dev, 'vendor', 'testmod'), { recursive: true });
    fs.writeFileSync(path.join(u.dev, 'vendor', 'testmod', 'package.json'), JSON.stringify({ name: 'testmod', version: v }));
    fs.rmSync(path.join(u.dev, 'package-lock.json'), { force: true });
    npmOffline(u.dev, 'install', '--package-lock-only');
    g(u.dev, 'add', '-A'); g(u.dev, 'commit', '-q', '-m', `testmod ${v}`); g(u.dev, 'push', '-q', 'origin', 'main');
  };
  fs.writeFileSync(path.join(u.dev, '.npmrc'), 'install-links=true\n');
  fs.writeFileSync(path.join(u.dev, 'package.json'), JSON.stringify({ name: 'probe', private: true,
    dependencies: { testmod: 'file:vendor/testmod' },
    scripts: { 'dashboard:test': marke, 'operations:test': 'node -e 0', 'social:test': 'node -e 0' } }, null, 2));
  version('1.0.0');
  const imBetrieb = () => JSON.parse(fs.readFileSync(path.join(u.betrieb, 'node_modules', 'testmod', 'package.json'), 'utf8')).version;
  const herkunft = () => fs.readFileSync(path.join(u.betrieb, 'node_modules', '.aus-der-probe'), 'utf8');
  const reste = () => fs.readdirSync(u.betrieb).filter(d => d.startsWith('.nachziehen-'));

  const s = steuerung();
  assert.equal((await lauf(u, s)).nachgezogen, true);
  assert.equal(imBetrieb(), '1.0.0');
  assert.deepEqual(s.neustarts, ['net.teppich-paradies.dashboard', 'net.teppich-paradies.sync', 'net.teppich-paradies.social']);

  // Ohne Ruhe wird gewartet; die aufgehobenen Bibliotheken bleiben nicht liegen und werden neu geprueft.
  version('2.0.0');
  const vorher = herkunft();
  assert.equal((await lauf(u, s, { ruhe: () => ({ ruhig: false, grund: 'Codex' }) })).stand, 'wartet');
  assert.deepEqual(reste(), []);
  assert.equal(imBetrieb(), '1.0.0');
  const probenVorher = u.probeLaeufe();
  assert.equal((await lauf(u, s)).nachgezogen, true);
  assert.equal(u.probeLaeufe(), probenVorher + 1, 'neue Bibliotheken werden fuer den Tausch frisch installiert');
  assert.equal(imBetrieb(), '2.0.0');
  assert.notEqual(herkunft(), vorher, 'node_modules stammt aus der letzten Probe');
  assert.deepEqual(reste(), []);

  // Rueckweg: alte Bibliotheken zurueck, ohne npm und ohne Netz.
  const zwei = herkunft();
  version('3.0.0');
  const r = await lauf(u, steuerung({ gesund: [false, true, true, true] }));
  assert.equal(r.stand, 'haengt');
  assert.match(r.grund, /der bisherige Stand läuft wieder/);
  assert.equal(imBetrieb(), '2.0.0');
  assert.equal(herkunft(), zwei);
  assert.deepEqual(reste(), []);
  assert.equal(g(u.betrieb, 'status', '--porcelain', '--untracked-files=no'), '');
});

test('Ablauf: Reste eines abgebrochenen Tauschs werden erst in Ruhe zurueckgenommen', async () => {
  const u = aufbau();
  const stand = () => fs.readFileSync(path.join(u.betrieb, 'node_modules', 'stand.txt'), 'utf8');
  fs.mkdirSync(path.join(u.betrieb, 'node_modules'));
  fs.writeFileSync(path.join(u.betrieb, 'node_modules', 'stand.txt'), 'alt');
  fs.mkdirSync(path.join(u.betrieb, MODULE_NEU));
  fs.writeFileSync(path.join(u.betrieb, MODULE_NEU, 'stand.txt'), 'neu');
  // Lauf stuerzt nach dem Tausch ab, bevor er vorspult: HEAD steht noch auf der Marke.
  moduleTauschen(u.betrieb, { head: u.kopf() });
  const s = steuerung();
  const w = await lauf(u, s, { ruhe: () => ({ ruhig: false, grund: 'Claude-Routine fehlermeldungen läuft' }) });
  assert.equal(w.stand, 'wartet');
  assert.match(w.grund, /abgebrochenen Laufs/);
  assert.equal(stand(), 'neu', 'waehrend einer Routine wird nichts getauscht');
  assert.equal((await lauf(u, s)).stand, 'aktuell');
  assert.equal(stand(), 'alt');
  assert.deepEqual(fs.readdirSync(u.betrieb).filter(d => d.startsWith('.nachziehen-')), []);
  assert.equal(s.neustarts.length, 0);
});
