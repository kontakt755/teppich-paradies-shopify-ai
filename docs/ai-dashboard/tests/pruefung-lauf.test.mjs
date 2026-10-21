import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { datenkopieAnlegen } from '../../../scripts/dashboard-datenkopie.mjs';
import { pruefLauf } from '../../../scripts/dashboard-pruefung-lauf.mjs';

const HELFER = new URL('../../../scripts/dashboard-pruefung-lauf.mjs', import.meta.url).href;
const BESITZ = new URL('../../../scripts/dashboard-temp-besitz.mjs', import.meta.url).href;
const POSIX = process.platform !== 'win32';

async function mitTmp(run) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-pruefung-lauf-test-'));
  try { await run(tmp); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function warteAusgabe(kind, muster) {
  return new Promise((ok, fehler) => {
    let text = '';
    const zeit = setTimeout(() => fertig(new Error(`Testprozess meldet sich nicht: ${text}`)), 5000);
    const daten = d => { text += d; if (muster.test(text)) fertig(); };
    const ende = code => fertig(new Error(`Testprozess endete vor Bereitschaft: ${code}: ${text}`));
    function fertig(e) {
      clearTimeout(zeit);
      kind.stdout.off('data', daten);
      kind.off('exit', ende);
      kind.off('error', fertig);
      if (e) fehler(e); else ok(text);
    }
    kind.stdout.on('data', daten);
    kind.once('exit', ende);
    kind.once('error', fertig);
  });
}

async function kindStarten(daten, { ignoriertTerm = false, fertigDatei } = {}) {
  const kind = spawn(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    process.on('SIGTERM', () => {
      if (process.env.IGNORIEREN === '1') return;
      setTimeout(() => {
        fs.writeFileSync(process.env.DATEN + '/letzter-schreibvorgang', 'fertig');
        if (process.env.FERTIG) fs.writeFileSync(process.env.FERTIG, 'fertig');
        process.exit(0);
      }, 100);
    });
    setInterval(() => {}, 1000);
    console.log('BEREIT');
  `], {
    env: { PATH: process.env.PATH, DATEN: daten, IGNORIEREN: ignoriertTerm ? '1' : '0', FERTIG: fertigDatei || '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await warteAusgabe(kind, /BEREIT/);
  return kind;
}

async function sicherBeenden(kind) {
  if (!kind || kind.exitCode != null || kind.signalCode != null) return;
  const ende = once(kind, 'exit');
  kind.kill('SIGKILL');
  await ende;
}

test('normaler Lauf wartet Browser und Server ab, bevor die Datenkopie verschwindet', { skip: !POSIX }, () => mitTmp(async tmp => {
  const daten = datenkopieAnlegen(tmp);
  const kind = await kindStarten(daten);
  const reihenfolge = [];
  const lauf = pruefLauf({ daten, tmp, warteMs: 1000 });
  lauf.serverSetzen(kind);
  lauf.browserSetzen({ close: async () => { reihenfolge.push('browser'); } });
  kind.once('exit', () => {
    reihenfolge.push('server');
    assert.ok(fs.existsSync(path.join(daten, 'letzter-schreibvorgang')), 'Server darf bis zum Ende schreiben');
  });
  try {
    const erst = lauf.aufraeumen();
    assert.equal(lauf.aufraeumen(), erst, 'mehrere Ausgaenge teilen denselben Aufraeumvorgang');
    await erst;
    assert.deepEqual(reihenfolge, ['browser', 'server']);
    assert.equal(fs.existsSync(daten), false);
  } finally { await sicherBeenden(kind); }
}));

test('Browserfehler beendet trotzdem den eigenen Server und loescht danach die Kopie', { skip: !POSIX }, () => mitTmp(async tmp => {
  const daten = datenkopieAnlegen(tmp);
  const kind = await kindStarten(daten);
  const lauf = pruefLauf({ daten, tmp, warteMs: 1000 });
  lauf.serverSetzen(kind);
  lauf.browserSetzen({ close: async () => { throw new Error('Browser-Testfehler'); } });
  try {
    await assert.rejects(lauf.aufraeumen(), /Browser-Testfehler/);
    assert.equal(kind.exitCode, 0);
    assert.equal(fs.existsSync(daten), false);
  } finally { await sicherBeenden(kind); }
}));

test('SIGTERM-Abbruch des Starters wartet auf seinen Kindprozess und raeumt vollstaendig auf', { skip: !POSIX }, () => mitTmp(async tmp => {
  const daten = datenkopieAnlegen(tmp);
  const fertig = path.join(tmp, 'server-fertig');
  const skript = path.join(tmp, 'starter.mjs');
  fs.writeFileSync(skript, `
    import { spawn } from 'node:child_process';
    import { pruefLauf } from ${JSON.stringify(HELFER)};
    import { besitzSetzen } from ${JSON.stringify(BESITZ)};
    besitzSetzen(process.env.DATEN, 'daten');
    const lauf = pruefLauf({daten: process.env.DATEN, tmp: process.env.TMP_TEST, warteMs: 1000});
    const kind = lauf.serverSetzen(spawn(process.execPath, ['-e', \
      'const fs=require("node:fs");process.on("SIGTERM",()=>setTimeout(()=>{fs.writeFileSync(process.env.DATEN+"/letzter-schreibvorgang","fertig");fs.writeFileSync(process.env.FERTIG,"fertig");process.exit(0)},100));setInterval(()=>{},1000);console.log("KIND_BEREIT")'],\
      {env:process.env,stdio:['ignore','pipe','inherit']}));
    process.on('SIGTERM', async () => { await lauf.aufraeumen({erzwingen:true}); process.exit(143); });
    process.on('exit', () => lauf.notaus());
    kind.stdout.on('data', d => { if (String(d).includes('KIND_BEREIT')) console.log('BEREIT '+kind.pid); });
  `);
  const starter = spawn(process.execPath, [skript], {
    env: { PATH: process.env.PATH, DATEN: daten, TMP_TEST: tmp, FERTIG: fertig },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let kindPid;
  try {
    const ausgabe = await warteAusgabe(starter, /BEREIT \d+/);
    kindPid = Number(ausgabe.match(/BEREIT (\d+)/)[1]);
    const ende = once(starter, 'exit');
    starter.kill('SIGTERM');
    assert.deepEqual(await ende, [143, null]);
    assert.ok(fs.existsSync(fertig), 'Kind hat seinen verzögerten letzten Schreibvorgang beendet');
    assert.equal(fs.existsSync(daten), false);
    assert.throws(() => process.kill(kindPid, 0), { code: 'ESRCH' });
  } finally {
    await sicherBeenden(starter);
    if (kindPid) { try { process.kill(kindPid, 'SIGKILL'); } catch { /* schon beendet */ } }
  }
}));

test('offene Instanz bleibt bis zur ausdruecklichen Abbruch-Bereinigung erhalten', { skip: !POSIX }, () => mitTmp(async tmp => {
  const daten = datenkopieAnlegen(tmp);
  const kind = await kindStarten(daten);
  const lauf = pruefLauf({ daten, tmp, warteMs: 1000 });
  lauf.serverSetzen(kind);
  lauf.offenLassen();
  try {
    await lauf.aufraeumen();
    lauf.notaus();
    assert.ok(fs.existsSync(daten));
    assert.equal(kind.exitCode, null);
    await lauf.aufraeumen({ erzwingen: true });
    assert.equal(fs.existsSync(daten), false);
  } finally { await sicherBeenden(kind); }
}));

test('ignoriertes TERM wird begrenzt mit KILL beendet', { skip: !POSIX }, () => mitTmp(async tmp => {
  const daten = datenkopieAnlegen(tmp);
  const kind = await kindStarten(daten, { ignoriertTerm: true });
  const lauf = pruefLauf({ daten, tmp, warteMs: 50 });
  lauf.serverSetzen(kind);
  try {
    await lauf.aufraeumen();
    assert.equal(kind.signalCode, 'SIGKILL');
    assert.equal(fs.existsSync(daten), false);
  } finally { await sicherBeenden(kind); }
}));

test('unklares Serverende erhaelt die Daten; synchroner Notaus loescht nie unter laufendem Server', () => mitTmp(async tmp => {
  const daten = datenkopieAnlegen(tmp);
  const unklar = new EventEmitter();
  Object.assign(unklar, { pid: 123, exitCode: null, signalCode: null, kill: () => false });
  const lauf = pruefLauf({ daten, tmp, warteMs: 10 });
  lauf.serverSetzen(unklar);
  lauf.notaus();
  assert.ok(fs.existsSync(daten));
  await assert.rejects(lauf.aufraeumen(), /nicht nachweislich beendet/);
  assert.ok(fs.existsSync(daten));
}));

test('fremde und unmarkierte Verzeichnisse bleiben auch bei normaler Bereinigung erhalten', () => mitTmp(async tmp => {
  const fremd = path.join(tmp, 'tp-dashboard-daten-abc123');
  fs.mkdirSync(fremd);
  fs.writeFileSync(path.join(fremd, 'behalten'), 'fremde Datei');
  await pruefLauf({ daten: fremd, tmp }).aufraeumen();
  assert.ok(fs.existsSync(path.join(fremd, 'behalten')));
}));

test('Abbruch waehrend Browserstart wartet auf die Uebergabe und schliesst auch den spaeten Browser', { skip: !POSIX }, () => mitTmp(async tmp => {
  const daten = datenkopieAnlegen(tmp);
  const browserKind = await kindStarten(daten);
  let schliessen = 0;
  const lauf = pruefLauf({ daten, tmp, warteMs: 1000, startWarteMs: 1000 });
  const start = lauf.browserStarten(new Promise(ok => setTimeout(() => ok({
    process: () => browserKind,
    close: async () => {
      schliessen++;
      const ende = once(browserKind, 'exit');
      browserKind.kill('SIGTERM');
      await ende;
    },
  }), 50)));
  browserKind.once('exit', () => assert.ok(fs.existsSync(daten), 'Daten bleiben bis zum Browserende'));
  try {
    await lauf.aufraeumen({ erzwingen: true });
    await start;
    await lauf.browserSchliessen();
    assert.equal(schliessen, 1);
    assert.equal(browserKind.exitCode, 0);
    assert.equal(fs.existsSync(daten), false);
  } finally { await sicherBeenden(browserKind); }
}));

test('abgelehnter Browserstart verhindert die Bereinigung des eigenen Servers nicht', { skip: !POSIX }, () => mitTmp(async tmp => {
  const daten = datenkopieAnlegen(tmp);
  const kind = await kindStarten(daten);
  const lauf = pruefLauf({ daten, tmp, warteMs: 1000 });
  lauf.serverSetzen(kind);
  const startFehler = assert.rejects(lauf.browserStarten(new Promise((_, fehler) => {
    setTimeout(() => fehler(new Error('Start abgebrochen')), 20);
  })), /Start abgebrochen/);
  try {
    await lauf.aufraeumen({ erzwingen: true });
    await startFehler;
    assert.equal(kind.exitCode, 0);
    assert.equal(fs.existsSync(daten), false);
  } finally { await sicherBeenden(kind); }
}));

test('unbestaetigter Browserstart erhaelt die Datenkopie auch beim synchronen Notaus', () => mitTmp(async tmp => {
  const daten = datenkopieAnlegen(tmp);
  const lauf = pruefLauf({ daten, tmp, warteMs: 10, startWarteMs: 10 });
  lauf.browserStarten(new Promise(() => {}));
  await assert.rejects(lauf.aufraeumen({ erzwingen: true }), /Browserstart nicht beendet/);
  lauf.notaus();
  assert.ok(fs.existsSync(daten));
}));

test('haengendes browser.close beendet den eigenen Browserprozess begrenzt vor der Datenloeschung', { skip: !POSIX }, () => mitTmp(async tmp => {
  const daten = datenkopieAnlegen(tmp);
  const browserKind = await kindStarten(daten);
  const lauf = pruefLauf({ daten, tmp, warteMs: 300 });
  lauf.browserSetzen({ process: () => browserKind, close: () => new Promise(() => {}) });
  try {
    await assert.rejects(lauf.aufraeumen(), /Browser beendet sich nicht/);
    assert.equal(browserKind.exitCode, 0);
    assert.equal(fs.existsSync(daten), false);
  } finally { await sicherBeenden(browserKind); }
}));
