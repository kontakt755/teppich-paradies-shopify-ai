import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STARTER = fileURLToPath(new URL('../../scripts/test-temp.mjs', import.meta.url));
const pause = ms => new Promise(ok => setTimeout(ok, ms));
const lebt = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function bis(pruefen, meldung) {
  const ende = Date.now() + 6000;
  while (Date.now() < ende) { if (pruefen()) return; await pause(20); }
  assert.fail(meldung);
}

function umgebung(t) {
  // Nur diese frisch angelegte Sandbox wird entfernt; nie den echten Temp-Ordner durchsuchen.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-starter-test-')));
  const prozesse = new Set();
  const ids = new Set();
  t.after(async () => {
    for (const p of prozesse) if (p.exitCode === null && p.signalCode === null) p.kill('SIGTERM');
    await pause(100);
    for (const p of prozesse) if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL');
    for (const pid of ids) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    await pause(50);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const start = (argumente, starter = STARTER) => {
    const env = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
    delete env.NODE_TEST_CONTEXT; // eigenstaendiger Test-Runner, kein Worker des aeusseren Laufs
    const p = spawn(process.execPath, [starter, ...argumente], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    prozesse.add(p);
    let stdout = ''; let stderr = '';
    p.stdout.on('data', d => { stdout += d; });
    p.stderr.on('data', d => { stderr += d; });
    const fertig = new Promise((ok, fehler) => {
      p.on('error', fehler);
      p.on('close', (code, signal) => ok({ code, signal, stdout, stderr }));
    });
    return { p, fertig };
  };
  const marker = async datei => {
    let d;
    await bis(() => {
      try { d = JSON.parse(fs.readFileSync(datei, 'utf8')); return true; } catch { return false; }
    }, `Kindprozess meldet sich nicht: ${datei}`);
    for (const k of ['pid', 'runner', 'enkel']) if (d[k]) ids.add(d[k]);
    return d;
  };
  return { tmp, start, marker };
}

for (const code of [0, 7]) test(`Ausgabe, Status ${code} und Loeschen nur des eigenen Temp-Ordners`, { timeout: 10000 }, async t => {
  const { tmp, start } = umgebung(t);
  const fremd = path.join(tmp, 'tp-testlauf-fremd1');
  fs.mkdirSync(fremd); fs.writeFileSync(path.join(fremd, 'bleibt'), 'fremd');
  const r = await start(['-e', `const os=require('node:os');const fs=require('node:fs');fs.writeFileSync(require('node:path').join(os.tmpdir(),'test.txt'),'x');console.log(JSON.stringify({tmp:os.tmpdir(),env:[process.env.TMPDIR,process.env.TMP,process.env.TEMP]}));console.error('Fehlerausgabe bleibt sichtbar');process.exit(${code});`]).fertig;
  assert.equal(r.code, code);
  assert.equal(r.signal, null);
  assert.match(r.stderr, /Fehlerausgabe bleibt sichtbar/);
  const info = JSON.parse(r.stdout.trim());
  assert.deepEqual(info.env, [info.tmp, info.tmp, info.tmp]);
  assert.equal(path.dirname(info.tmp), tmp);
  assert.equal(fs.existsSync(info.tmp), false);
  assert.equal(fs.readFileSync(path.join(fremd, 'bleibt'), 'utf8'), 'fremd');
});

test('fehlende Argumente und ungueltiges Node-Flag scheitern ohne Temp-Leck', { timeout: 10000 }, async t => {
  const { tmp, start } = umgebung(t);
  assert.equal((await start([]).fertig).code, 2);
  assert.notEqual((await start(['--dieses-node-flag-gibt-es-nicht']).fertig).code, 0);
  assert.deepEqual(fs.readdirSync(tmp), []);
});

test('wegwerfOrdner funktioniert beim direkten Einzelaufruf', { timeout: 10000 }, async t => {
  const { tmp } = umgebung(t);
  const p = spawn(process.execPath, ['--input-type=module', '-e', `import {wegwerfOrdner} from ${JSON.stringify(new URL('../../scripts/test-temp.mjs', import.meta.url).href)};console.log(wegwerfOrdner('einzeln-'));`], {
    env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = ''; p.stdout.on('data', d => { stdout += d; });
  const code = await new Promise(ok => p.on('close', ok));
  assert.equal(code, 0);
  assert.equal(fs.existsSync(stdout.trim()), false);
  assert.deepEqual(fs.readdirSync(tmp), []);
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) test(`${signal} an Starter beendet auch den Enkel des Test-Workers`, { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const { tmp, start, marker } = umgebung(t);
  const datei = path.join(tmp, 'bereit.json');
  const fixture = path.join(tmp, 'lang.test.mjs');
  fs.writeFileSync(fixture, `import test from 'node:test';import fs from 'node:fs';import os from 'node:os';import {spawn} from 'node:child_process';test('wartet',async()=>{const enkel=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(datei)},JSON.stringify({pid:process.pid,runner:process.ppid,enkel:enkel.pid,tmp:os.tmpdir()}));await new Promise(()=>setInterval(()=>{},100));});`);
  const lauf = start(['--test', fixture]);
  const d = await marker(datei);
  assert.ok(lebt(d.enkel));
  lauf.p.kill(signal);
  const r = await lauf.fertig;
  assert.equal(r.code, 128 + os.constants.signals[signal], r.stderr);
  await bis(() => !lebt(d.pid) && !lebt(d.enkel), 'Test-Worker oder Enkel laeuft nach Abbruch weiter');
  assert.equal(fs.existsSync(d.tmp), false, r.stderr);
});

test('ignoriertes SIGTERM wird fristgerecht beendet; Abbruch bleibt auch bei Exit 0 sichtbar', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const { tmp, start, marker } = umgebung(t);
  for (const ignorieren of [true, false]) {
    const datei = path.join(tmp, `bereit-${ignorieren}.json`);
    const lauf = start(['-e', `const fs=require('node:fs');process.on('SIGTERM',()=>{${ignorieren ? '' : 'process.exit(0);'}});fs.writeFileSync(${JSON.stringify(datei)},JSON.stringify({pid:process.pid,tmp:require('node:os').tmpdir()}));setInterval(()=>{},100);`]);
    const d = await marker(datei);
    const seit = Date.now();
    lauf.p.kill('SIGTERM');
    const r = await lauf.fertig;
    assert.equal(r.code, 143, r.stderr);
    assert.ok(Date.now() - seit < 5000, 'Starter darf bei ignoriertem Signal nicht haengen');
    assert.equal(lebt(d.pid), false);
    assert.equal(fs.existsSync(d.tmp), false, r.stderr);
  }
});

test('Abbruch einer Suite erhaelt den aktiven Temp-Ordner einer parallelen Suite', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const { tmp, start, marker } = umgebung(t);
  const laeufe = [];
  for (const n of ['a', 'b']) {
    const datei = path.join(tmp, `${n}.json`);
    const fertigDatei = path.join(tmp, `${n}.fertig`);
    const lauf = start(['-e', `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(datei)},JSON.stringify({pid:process.pid,tmp:require('node:os').tmpdir()}));setInterval(()=>{if(fs.existsSync(${JSON.stringify(fertigDatei)}))process.exit(0);},20);`]);
    laeufe.push({ ...lauf, d: await marker(datei), fertigDatei });
  }
  laeufe[0].p.kill('SIGTERM');
  assert.equal((await laeufe[0].fertig).code, 143);
  assert.equal(fs.existsSync(laeufe[0].d.tmp), false);
  assert.ok(lebt(laeufe[1].d.pid));
  assert.ok(fs.existsSync(laeufe[1].d.tmp));
  fs.writeFileSync(laeufe[1].fertigDatei, 'fertig');
  assert.equal((await laeufe[1].fertig).code, 0);
  assert.equal(fs.existsSync(laeufe[1].d.tmp), false);
});

test('nach normalem Exit werden uebrige Enkel vor dem Loeschen beendet', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const { tmp, start, marker } = umgebung(t);
  const datei = path.join(tmp, 'bereit.json');
  const enkelCode = "process.on('SIGTERM',()=>{});process.send('bereit');setInterval(()=>{},100);";
  const lauf = start(['-e', `const fs=require('node:fs');const {spawn}=require('node:child_process');const enkel=spawn(process.execPath,['-e',${JSON.stringify(enkelCode)}],{stdio:['ignore','inherit','inherit','ipc']});enkel.once('message',()=>{fs.writeFileSync(${JSON.stringify(datei)},JSON.stringify({pid:process.pid,enkel:enkel.pid,tmp:require('node:os').tmpdir()}));enkel.disconnect();enkel.unref();process.exit(0);});`]);
  const d = await marker(datei);
  const r = await lauf.fertig;
  assert.equal(r.code, 0, r.stderr);
  await bis(() => !lebt(d.enkel), 'Enkel ignoriert SIGTERM und laeuft nach dem normalen Ende weiter');
  assert.equal(fs.existsSync(d.tmp), false, r.stderr);
});

test('Starter ueber symbolischen Link fuehrt die Tests ebenfalls aus', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const { tmp, start } = umgebung(t);
  const link = path.join(tmp, 'starter.mjs');
  fs.symlinkSync(STARTER, link);
  const r = await start(['-e', "console.log('ausgefuehrt');process.exit(23);"], link).fertig;
  assert.equal(r.code, 23);
  assert.match(r.stdout, /ausgefuehrt/);
});
