import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { abgleichen, abgleichFaellig, codexAktiv, main, befehl, ZWEIG } from '../scripts/dienst-aktualisieren.mjs';
import { liesStatus } from '../lib/routinen.mjs';

// Echte Git-Repositorys im Temp-Ordner; npm, launchctl und HTTP sind Attrappen.
const leereConfig = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dienst-git-')), 'gitconfig');
fs.writeFileSync(leereConfig, '');
const ENV = {
  ...process.env, GIT_CONFIG_GLOBAL: leereConfig, GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
};

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env: ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function schreib(dir, datei, inhalt) {
  fs.mkdirSync(path.dirname(path.join(dir, datei)), { recursive: true });
  fs.writeFileSync(path.join(dir, datei), inhalt);
}

/** origin (bare) mit main, Dienst-Checkout auf dashboard-betrieb, dazu eine Arbeitskopie fuer neue main-Commits. */
function aufbau() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dienst-'));
  const origin = path.join(root, 'origin.git');
  const entw = path.join(root, 'entwicklung');
  const dienst = path.join(root, 'tp-dashboard');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, entw);
  git(entw, 'checkout', '-q', '-b', 'main');
  schreib(entw, 'package.json', '{"name":"t","version":"1.0.0"}\n');
  schreib(entw, 'package-lock.json', '{"lockfileVersion":3}\n');
  schreib(entw, 'docs/app.js', 'eins\n');
  git(entw, 'add', '.');
  git(entw, 'commit', '-q', '-m', 'start');
  git(entw, 'push', '-q', 'origin', 'main');
  git(root, 'clone', '-q', origin, dienst);
  git(dienst, 'checkout', '-q', '-b', ZWEIG, 'origin/main');
  const tmpBasis = path.join(root, 'tmp');
  fs.mkdirSync(tmpBasis);
  return { root, origin, entw, dienst, tmpBasis };
}

function mainCommit(entw, dateien, nachricht = 'aenderung') {
  for (const [d, inhalt] of Object.entries(dateien)) schreib(entw, d, inhalt);
  git(entw, 'add', '.');
  git(entw, 'commit', '-q', '-m', nachricht);
  git(entw, 'push', '-q', 'origin', 'main');
}

/** npm-Attrappe: Testsuite rot, wenn die Pruefkopie eine Datei ROT enthaelt. */
function attrappen({ http = true, geladen = ['dashboard', 'sync', 'social'] } = {}) {
  const log = { npm: [], launchctl: [], http: [] };
  const run = (cmd, args, o) => {
    if (cmd === 'npm') {
      log.npm.push({ cwd: o.cwd, args });
      if (args[0] === 'run' && fs.existsSync(path.join(o.cwd, 'ROT'))) return { status: 1, stdout: '✖ kaputter Test (3ms)\n', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    }
    return befehl(cmd, args, { ...o, env: ENV });
  };
  const launchctl = (args) => {
    log.launchctl.push(args.join(' '));
    if (args[0] === 'print') return { status: geladen.some(d => args[1].endsWith(`.${d}`)) ? 0 : 113, stdout: '', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  let antworten = 0;
  const warte = async (url, erwartet) => { log.http.push(url); antworten += 1; return typeof http === 'function' ? http(antworten) : { ok: http, status: http ? erwartet : 502 }; };
  return { log, deps: { run, launchctl, warte, env: ENV, aus: () => {}, uid: 501 } };
}

test('nichts Neues auf main: aktuell, kein Neustart', async () => {
  const u = aufbau();
  const a = attrappen();
  const r = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, ...a.deps });
  assert.equal(r.ok, true);
  assert.equal(r.ergebnis, 'aktuell');
  assert.ok(!a.log.launchctl.some(z => z.startsWith('kickstart')));
});

test('konfliktfrei und gruen: Merge-Commit wird fast-forward uebernommen, Dashboard und Sync neu gestartet', async () => {
  const u = aufbau();
  const alt = git(u.dienst, 'rev-parse', 'HEAD');
  mainCommit(u.entw, { 'operations/lib/neu.mjs': 'export const x = 1;\n' });
  const ziel = git(u.entw, 'rev-parse', 'HEAD');
  const a = attrappen();
  const r = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, jetzt: new Date('2026-10-27T05:20:00Z'), ...a.deps });
  assert.equal(r.ok, true, r.meldung);
  assert.equal(r.ergebnis, 'nachgezogen');
  const kopf = git(u.dienst, 'rev-parse', 'HEAD');
  assert.equal(git(u.dienst, 'rev-parse', 'HEAD^1'), alt);
  assert.equal(git(u.dienst, 'rev-parse', 'HEAD^2'), ziel);
  assert.equal(git(u.dienst, 'rev-parse', '--abbrev-ref', 'HEAD'), ZWEIG, 'Zweig nicht umgeschaltet');
  assert.match(git(u.dienst, 'log', '-1', '--format=%s'), /^merge: main nachgezogen \(2026-10-27, Dienst-Aktualisierung\)$/);
  assert.equal(r.bis, kopf);
  assert.equal(fs.readFileSync(path.join(u.dienst, 'operations/lib/neu.mjs'), 'utf8'), 'export const x = 1;\n');
  // Getestet wurde in der Pruefkopie, nicht im Dienst-Checkout; die Kopie ist wieder weg.
  const tests = a.log.npm.filter(x => x.args[0] === 'run');
  assert.deepEqual(tests.map(x => x.args.at(-1)), ['dashboard:test', 'operations:test']);
  assert.ok(tests.every(x => x.cwd.startsWith(u.tmpBasis)));
  assert.deepEqual(fs.readdirSync(u.tmpBasis), []);
  assert.ok(!a.log.npm.some(x => x.cwd === u.dienst), 'Lockdatei unveraendert: kein npm ci im Dienst');
  assert.deepEqual(a.log.launchctl.filter(z => z.startsWith('kickstart')), ['kickstart -k gui/501/net.teppich-paradies.dashboard', 'kickstart -k gui/501/net.teppich-paradies.sync']);
  assert.deepEqual(a.log.http, ['http://127.0.0.1:8001/login']);
  assert.equal(git(u.dienst, 'status', '--porcelain'), '');
});

test('social/ geaendert und Lockdatei neu: social-Test, npm ci im Dienst, social neu gestartet und geprueft', async () => {
  const u = aufbau();
  mainCommit(u.entw, { 'social/x.mjs': '1\n', 'package-lock.json': '{"lockfileVersion":3,"neu":1}\n' });
  const a = attrappen();
  const r = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, ...a.deps });
  assert.equal(r.ok, true, r.meldung);
  assert.ok(a.log.npm.some(x => x.args.at(-1) === 'social:test'));
  assert.ok(a.log.npm.some(x => x.cwd === u.dienst && x.args[0] === 'ci'));
  assert.ok(a.log.launchctl.includes('kickstart -k gui/501/net.teppich-paradies.social'));
  assert.ok(a.log.http.includes('http://127.0.0.1:8020/api/status'));
});

test('nicht geladener Sync-Dienst wird nicht gestartet (sonst schlueege der Neustart fehl)', async () => {
  const u = aufbau();
  mainCommit(u.entw, { 'operations/y.mjs': '1\n' });
  const a = attrappen({ geladen: ['dashboard'] });
  const r = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, ...a.deps });
  assert.equal(r.ok, true, r.meldung);
  assert.deepEqual(a.log.launchctl.filter(z => z.startsWith('kickstart')), ['kickstart -k gui/501/net.teppich-paradies.dashboard']);
});

test('Konflikt: nichts gemergt, Dienst-Checkout unveraendert, kein Neustart', async () => {
  const u = aufbau();
  schreib(u.dienst, 'docs/app.js', 'betrieb\n');
  git(u.dienst, 'commit', '-q', '-am', 'eigener Betriebsstand');
  const alt = git(u.dienst, 'rev-parse', 'HEAD');
  mainCommit(u.entw, { 'docs/app.js': 'main\n' });
  const a = attrappen();
  const r = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, ...a.deps });
  assert.equal(r.ok, false);
  assert.equal(r.art, 'konflikt');
  assert.match(r.meldung, /docs\/app\.js/);
  assert.equal(git(u.dienst, 'rev-parse', 'HEAD'), alt);
  assert.equal(fs.readFileSync(path.join(u.dienst, 'docs/app.js'), 'utf8'), 'betrieb\n');
  assert.equal(git(u.dienst, 'status', '--porcelain'), '');
  assert.equal(a.log.npm.length, 0);
  assert.ok(!a.log.launchctl.some(z => z.startsWith('kickstart')));
});

test('roter Test in der Pruefkopie: nichts gemergt, kein Neustart, Kopie entfernt', async () => {
  const u = aufbau();
  const alt = git(u.dienst, 'rev-parse', 'HEAD');
  mainCommit(u.entw, { ROT: 'x\n' });
  const a = attrappen();
  const r = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, ...a.deps });
  assert.equal(r.ok, false);
  assert.equal(r.art, 'test-rot');
  assert.match(r.meldung, /dashboard:test rot .*kaputter Test/);
  assert.equal(git(u.dienst, 'rev-parse', 'HEAD'), alt);
  assert.equal(fs.existsSync(path.join(u.dienst, 'ROT')), false);
  assert.deepEqual(fs.readdirSync(u.tmpBasis), []);
  assert.ok(!a.log.launchctl.some(z => z.startsWith('kickstart')));
  // Derselbe Stand von main wird beim naechsten Takt nicht erneut getestet.
  const b = attrappen();
  const wieder = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, bekannterFehler: { art: r.art, meldung: r.meldung, ziel: r.ziel }, ...b.deps });
  assert.equal(wieder.unveraendert, true);
  assert.equal(b.log.npm.length, 0);
});

test('lokale Aenderung im Dienst-Checkout: nichts verworfen, nichts gemergt', async () => {
  const u = aufbau();
  mainCommit(u.entw, { 'docs/neu.js': '1\n' });
  schreib(u.dienst, 'docs/app.js', 'von Hand geaendert\n');
  const a = attrappen();
  const r = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, ...a.deps });
  assert.equal(r.art, 'lokale-aenderungen');
  assert.equal(fs.readFileSync(path.join(u.dienst, 'docs/app.js'), 'utf8'), 'von Hand geaendert\n');
});

test('npm-Rauschen in package-lock.json: --autostash, die lokale Lockdatei bleibt erhalten', async () => {
  const u = aufbau();
  mainCommit(u.entw, { 'docs/neu.js': '1\n' });
  schreib(u.dienst, 'package-lock.json', '{"lockfileVersion":3,"rauschen":true}\n');
  const a = attrappen();
  const r = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, ...a.deps });
  assert.equal(r.ok, true, r.meldung);
  assert.equal(fs.readFileSync(path.join(u.dienst, 'package-lock.json'), 'utf8'), '{"lockfileVersion":3,"rauschen":true}\n');
  assert.ok(a.log.npm.some(x => x.cwd === u.dienst && x.args.join(' ') === 'install --package-lock-only --no-audit --no-fund'));
});

test('Dashboard antwortet nach dem Neustart nicht: zurueck auf den alten Stand, erneut gestartet, gemeldet', async () => {
  const u = aufbau();
  const alt = git(u.dienst, 'rev-parse', 'HEAD');
  mainCommit(u.entw, { 'docs/kaputt.js': '1\n' });
  const a = attrappen({ http: n => (n === 1 ? { ok: false, status: 502 } : { ok: true, status: 200 }) });
  const r = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, ...a.deps });
  assert.equal(r.ok, false);
  assert.equal(r.art, 'neustart');
  assert.match(r.meldung, /zurückgesetzt auf .* Dienst läuft wieder/);
  assert.equal(git(u.dienst, 'rev-parse', 'HEAD'), alt);
  assert.equal(fs.existsSync(path.join(u.dienst, 'docs/kaputt.js')), false);
  assert.equal(a.log.launchctl.filter(z => z.startsWith('kickstart')).length, 2);
});

test('falscher Zweig: nicht umgeschaltet, nichts getan', async () => {
  const u = aufbau();
  git(u.dienst, 'checkout', '-q', '-b', 'etwas-anderes');
  const a = attrappen();
  const r = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, ...a.deps });
  assert.equal(r.art, 'falscher-zweig');
  assert.equal(git(u.dienst, 'rev-parse', '--abbrev-ref', 'HEAD'), 'etwas-anderes');
});

test('trocken: zeigt die Schritte, aendert nichts', async () => {
  const u = aufbau();
  const alt = git(u.dienst, 'rev-parse', 'HEAD');
  mainCommit(u.entw, { 'operations/z.mjs': '1\n' });
  const a = attrappen();
  const zeilen = [];
  const r = await abgleichen({ dienst: u.dienst, tmpBasis: u.tmpBasis, trocken: true, ...a.deps, aus: z => zeilen.push(z) });
  assert.equal(r.ergebnis, 'trocken');
  assert.equal(git(u.dienst, 'rev-parse', 'HEAD'), alt);
  assert.equal(a.log.npm.length, 0);
  assert.match(zeilen.join('\n'), /würde neu starten: launchctl kickstart -k gui\/501\/net\.teppich-paradies\.dashboard ; launchctl kickstart -k gui\/501\/net\.teppich-paradies\.sync/);
});

test('einmal taeglich ab 6 Uhr; nach einem Fehler jeden Takt', () => {
  const t = iso => new Date(iso);
  assert.equal(abgleichFaellig({}, t('2026-10-27T04:20:00Z')).faellig, false, '5:20 Uhr');
  assert.equal(abgleichFaellig({}, t('2026-10-27T05:20:00Z')).faellig, true, '6:20 Uhr');
  assert.equal(abgleichFaellig({ ok: true, abgleichTag: '2026-10-27' }, t('2026-10-27T10:20:00Z')).faellig, false);
  assert.equal(abgleichFaellig({ ok: true, abgleichTag: '2026-10-26' }, t('2026-10-27T10:20:00Z')).faellig, true);
  assert.equal(abgleichFaellig({ ok: false, abgleichTag: '2026-10-27' }, t('2026-10-27T10:20:00Z')).faellig, true);
});

test('Codex-Automation im Dienst-Checkout aktiv: erkannt an der Aenderungszeit ihres Threads', () => {
  const codexDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-codex-'));
  const dienst = '/home/test/tp-dashboard';
  schreib(codexDir, 'automations/muster/automation.toml', `id = "muster"\nprompt = "Arbeitsverzeichnis ${dienst}, alle 15 Minuten"\nstatus = "ACTIVE"\ntarget_thread_id = "abc-123"\n`);
  schreib(codexDir, 'automations/anders/automation.toml', 'prompt = "anderer Ordner"\nstatus = "ACTIVE"\ntarget_thread_id = "zzz"\n');
  const datei = path.join(codexDir, 'sessions/2026/10/22/rollout-2026-10-22T13-27-23-abc-123.jsonl');
  schreib(codexDir, 'sessions/2026/10/22/rollout-2026-10-22T13-27-23-abc-123.jsonl', '{}\n');
  const jetzt = new Date();
  assert.equal(codexAktiv(dienst, { codexDir, jetzt }), 'muster');
  fs.utimesSync(datei, new Date(jetzt.getTime() - 600_000), new Date(jetzt.getTime() - 600_000));
  assert.equal(codexAktiv(dienst, { codexDir, jetzt }), null);
  assert.equal(codexAktiv(dienst, { codexDir: path.join(codexDir, 'fehlt'), jetzt }), null);
});

test('main: Gesundheit jeder Takt, Abgleich mit Status und Mitteilung nur beim neuen Fehler', async () => {
  const u = aufbau();
  const privat = path.join(u.root, 'privat');
  fs.mkdirSync(privat);
  const jetzt = new Date('2026-10-27T05:20:00Z');
  fs.writeFileSync(path.join(privat, 'aktualisierung.json'), JSON.stringify({ aktualisiertAm: new Date(jetzt.getTime() - 5 * 60_000).toISOString(), teile: { bestellungen: { erfolg: true, zeitpunkt: new Date(jetzt.getTime() - 5 * 60_000).toISOString() } } }));
  mainCommit(u.entw, { ROT: 'x\n' });
  const a = attrappen();
  const mitteilungen = [];
  const deps = { env: { ...ENV, TP_PRIVAT_DIR: privat, TP_DIENST_DIR: u.dienst }, jetzt, aus: () => {}, melde: t => mitteilungen.push(t), codexAktiv: () => null, abgleich: { ...a.deps, tmpBasis: u.tmpBasis, env: ENV } };
  assert.equal(await main([], deps), 1);
  assert.equal(liesStatus(privat, 'daten-gesundheit').ok, true);
  const s = liesStatus(privat, 'dienst-aktualisieren');
  assert.equal(s.ok, false);
  assert.equal(s.art, 'test-rot');
  assert.deepEqual(mitteilungen, ['Control Center nachziehen']);
  // Naechster Takt: derselbe rote Stand - keine Tests, keine neue Mitteilung.
  const vorher = a.log.npm.length;
  assert.equal(await main([], { ...deps, jetzt: new Date(jetzt.getTime() + 3_600_000) }), 1);
  assert.equal(a.log.npm.length, vorher);
  assert.deepEqual(mitteilungen.filter(t => t === 'Control Center nachziehen').length, 1);
  // ... der Datenstand ist inzwischen 65 Minuten alt: das meldet die Gesundheitspruefung.
  assert.equal(liesStatus(privat, 'daten-gesundheit').art, 'alt');
  assert.ok(mitteilungen.includes('Datenstand des Sync-Dienstes'));
  // Codex arbeitet gerade: spaeter, kein Fehler.
  assert.equal(await main(['--jetzt'], { ...deps, codexAktiv: () => 'muster' }), 0);
  assert.equal(liesStatus(privat, 'dienst-aktualisieren').art, 'test-rot', 'Stand bleibt bis zum naechsten echten Versuch');
});
