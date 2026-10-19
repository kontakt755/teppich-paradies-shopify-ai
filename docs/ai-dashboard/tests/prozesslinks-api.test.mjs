import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createApi, ApiError } from '../../../scripts/dashboard-api.mjs';
import {
  prozesslinksPfad, leseProzesslinks, schreibeProzesslinks, ProzesslinksSpeicherFehler,
} from '../../../operations/lib/prozesslinks.mjs';
import {
  standardProzesslinks, pruefeProzesslink, pruefeProzesslinks, istProzessZiel, ProzesslinksFehler,
} from '../lib/prozesslinks.mjs';

function testOrdner(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-prozesslinks-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function konfiguriert() {
  const daten = standardProzesslinks();
  daten.ziele.email.chatgpt = 'https://chatgpt.com/g/g-p-beispiel/project';
  daten.ziele.angebot.claude = 'https://claude.ai/project/beispiel';
  daten.ziele.recherche.codex = 'codex://threads/new';
  return daten;
}

test('Gemeinsame Zielpruefung: echte Projekt-/Appwege, leeres Ziel bleibt unkonfiguriert', () => {
  for (const [anbieter, adresse] of [
    ['chatgpt', 'https://chatgpt.com/g/g-p-beispiel/project'],
    ['claude', 'https://claude.ai/project/beispiel'],
    ['claude', 'claude://claude.ai/new'],
    ['claude', 'claude://claude.ai/project/00000000-0000-0000-0000-000000000000'],
    ['claude', 'claude://code/new?folder=%2Fworkspace%2Fprojekt'],
    ['claude', 'claude://code/new?folder=C%3A%5Cworkspace%5Cprojekt'],
    ['codex', 'codex://threads/new'],
    ['codex', 'codex://threads/new?path=%2Fworkspace%2Fprojekt'],
    ['codex', 'codex://threads/new?originUrl=https%3A%2F%2Fgithub.com%2Fbeispiel%2Fprojekt'],
    ['codex', 'codex://threads/00000000-0000-0000-0000-000000000000'],
    ['codex', 'codex://new?path=%2Fworkspace%2Fprojekt'],
    ['codex', 'codex://new?path=C%3A%5Cworkspace%5Cprojekt'],
    ['codex', 'codex://new?originUrl=https%3A%2F%2Fgithub.com%2Fbeispiel%2Fprojekt'],
  ]) {
    assert.equal(istProzessZiel(anbieter, adresse), true, adresse);
    assert.equal(pruefeProzesslink(anbieter, adresse), adresse);
  }
  assert.equal(pruefeProzesslink('chatgpt', '   '), '');
  assert.equal(istProzessZiel('chatgpt', ''), false);
  assert.deepEqual(pruefeProzesslinks(standardProzesslinks()), standardProzesslinks());
});

test('Zielpruefung lehnt fremde Hosts, Zugangsdaten, Schemen, Textuebergabe und Steuerzeichen ab', () => {
  for (const [anbieter, adresse] of [
    ['chatgpt', 'javascript:alert(1)'], ['chatgpt', 'data:text/plain,test'],
    ['chatgpt', 'http://chatgpt.com/'], ['chatgpt', 'https://chatgpt.com.example/'],
    ['chatgpt', 'https://example.com/'], ['chatgpt', 'https://claude.ai/'],
    ['chatgpt', 'https://beispiel@chatgpt.com/'], ['chatgpt', 'https://chatgpt.com:444/'],
    ['chatgpt', 'https://chatgpt.com/?prompt=beispiel'], ['chatgpt', 'https://chatgpt.com/?q=beispiel'],
    ['chatgpt', 'https://chatgpt.com/?context=beispiel'], ['chatgpt', 'https://chatgpt.com/#beispiel'],
    ['chatgpt', 'https://chatgpt.com/%0a'], ['chatgpt', 'https://chatgpt.com/\n'],
    ['chatgpt', 'https://chatgpt.com/%'], ['chatgpt', 'https://chatgpt.com/\u0085'],
    ['claude', 'https://chatgpt.com/'], ['claude', 'https://claude.ai/?q=beispiel'],
    ['claude', 'claude://code/new?folder=relativ'], ['claude', 'claude://code/new?folder=%2Fworkspace&q=beispiel'],
    ['claude', 'claude://code/new?folder=%2Fworkspace&folder=%2Fanders'],
    ['claude', 'claude://claude.ai/new?q=beispiel'], ['claude', 'claude://claude.ai/project/kein-projekt'],
    ['codex', 'https://chatgpt.com/'], ['codex', 'codex://threads/new?prompt=beispiel'],
    ['codex', 'codex://threads/new?context=beispiel'], ['codex', 'codex://threads/new?q=beispiel'],
    ['codex', 'codex://run'], ['codex', 'codex://new'], ['codex', 'codex://threads/new?path=relativ'],
    ['codex', 'codex://threads/00000000-0000-0000-0000-000000000000?path=%2Fworkspace%2Fprojekt'],
    ['codex', 'codex://threads/00000000-0000-0000-0000-000000000000?originUrl=https%3A%2F%2Fgithub.com%2Fbeispiel%2Fprojekt'],
    ['codex', 'codex://new?path=%2Fworkspace&path=%2Fanders'],
    ['codex', 'codex://new?path=%2Fworkspace%0a'],
    ['codex', 'codex://new?originUrl=https%3A%2F%2Fbeispiel%40github.com%2Fprojekt'],
    ['codex', 'codex://new?originUrl=https%3A%2F%2Fgithub.com%2Fprojekt%3Fq%3Dbeispiel'],
  ]) {
    assert.equal(istProzessZiel(anbieter, adresse), false, adresse);
    assert.throws(() => pruefeProzesslink(anbieter, adresse), ProzesslinksFehler, adresse);
  }
  assert.throws(() => pruefeProzesslinks({ ...standardProzesslinks(), standardAnbieter: 'fremd' }), ProzesslinksFehler);
  const fremderProzess = standardProzesslinks();
  fremderProzess.ziele.fremd = {};
  assert.throws(() => pruefeProzesslinks(fremderProzess), ProzesslinksFehler);
  const fremderAnbieter = standardProzesslinks();
  fremderAnbieter.ziele.email.fremd = '';
  assert.throws(() => pruefeProzesslinks(fremderAnbieter), ProzesslinksFehler);
});

test('Private Ablage: nur fehlende Datei liefert Vorgaben, Schreiben ist atomar und 0600', t => {
  const dir = testOrdner(t);
  const datei = prozesslinksPfad(dir);
  assert.deepEqual(leseProzesslinks(datei), standardProzesslinks());
  assert.equal(fs.existsSync(datei), false, 'Lesen legt keine Datei an');
  assert.deepEqual(schreibeProzesslinks(datei, konfiguriert()), konfiguriert());
  assert.deepEqual(leseProzesslinks(datei), konfiguriert());
  assert.equal(fs.statSync(datei).mode & 0o777, 0o600);
  fs.chmodSync(datei, 0o644);
  schreibeProzesslinks(datei, standardProzesslinks());
  assert.equal(fs.statSync(datei).mode & 0o777, 0o600, 'Ersetzen korrigiert auch alte Dateirechte');
  assert.deepEqual(fs.readdirSync(dir), ['prozesslinks.json'], 'keine liegengebliebenen Temporaerdateien');
});

test('Beschaedigte oder unlesbare Ablage bleibt unveraendert und blockiert Ueberschreiben', t => {
  const dir = testOrdner(t);
  const datei = prozesslinksPfad(dir);
  for (const roh of ['{kaputt', '{}', JSON.stringify({ ...standardProzesslinks(), standardAnbieter: 'fremd' })]) {
    fs.writeFileSync(datei, roh);
    assert.throws(() => leseProzesslinks(datei), ProzesslinksSpeicherFehler);
    assert.throws(() => schreibeProzesslinks(datei, konfiguriert()), ProzesslinksSpeicherFehler);
    assert.equal(fs.readFileSync(datei, 'utf8'), roh);
  }
  fs.unlinkSync(datei);
  fs.mkdirSync(datei);
  assert.throws(() => leseProzesslinks(datei), /EISDIR/);
  assert.throws(() => schreibeProzesslinks(datei, konfiguriert()), /EISDIR/);
});

test('Prozess-API braucht weder gh, Modell, Shopify noch Neubau und prueft Schreibrechte selbst', t => {
  const dir = testOrdner(t);
  const unerlaubt = () => { assert.fail('Prozesslinks duerfen keine externen Werkzeuge aufrufen'); };
  const api = createApi({ privatDirPath: dir, gh: unerlaubt, rebuild: unerlaubt, shopifyZugang: unerlaubt });
  for (const rolle of ['lesen', 'mitarbeiter']) {
    assert.deepEqual(api.prozessLinks({ benutzer: { rolle } }), { ...standardProzesslinks(), bearbeitbar: false });
    assert.throws(() => api.prozessLinksSetzen(konfiguriert(), { benutzer: { rolle } }), e => e instanceof ApiError && e.status === 403);
  }
  assert.equal(api.prozessLinksSetzen(konfiguriert()).bearbeitbar, true, 'Notzugang behaelt Rechte');
  assert.equal(api.prozessLinks({ benutzer: { rolle: 'inhaber' } }).bearbeitbar, true);
  const ungueltig = konfiguriert();
  ungueltig.ziele.email.chatgpt = 'https://example.com/';
  assert.throws(() => api.prozessLinksSetzen(ungueltig), e => e instanceof ApiError && e.status === 400);
});

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('HTTP: Rollen, Auth, POST/JSON, gleiche Herkunft, Eingabefehler und kaputte Ablage', async t => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const dir = testOrdner(t);
  let liste = [];
  for (const rolle of ['lesen', 'mitarbeiter', 'inhaber']) {
    liste = benutzerAnlegen(liste, { name: rolle, kuerzel: rolle, passwort: `platzhalter-${rolle}-1`, rolle });
  }
  schreibeBenutzer(liste, path.join(dir, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = dir;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=prozesslinks');
  delete process.env.TP_DASHBOARD_PASSWORT;
  t.after(() => { process.env.TP_PRIVAT_DIR = PRIVAT_DIR; });
  await mitServer(mod.requestHandler, async base => {
    const ziel = `${base}/api/prozesse/links`;
    assert.equal((await fetch(ziel)).status, 401);
    const kekse = {};
    for (const rolle of ['lesen', 'mitarbeiter', 'inhaber']) {
      const login = await fetch(`${base}/api/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: rolle, passwort: `platzhalter-${rolle}-1` }),
      });
      assert.equal(login.status, 200);
      kekse[rolle] = login.headers.get('set-cookie').split(';')[0];
      const antwort = await fetch(ziel, { headers: { cookie: kekse[rolle] } });
      assert.equal(antwort.status, 200);
      assert.deepEqual(await antwort.json(), { ...standardProzesslinks(), bearbeitbar: rolle === 'inhaber' });
    }
    const schreiben = (rolle, daten = konfiguriert(), extras = {}) => fetch(ziel, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: kekse[rolle], origin: base, ...extras }, body: JSON.stringify(daten),
    });
    assert.equal((await schreiben('lesen')).status, 403);
    assert.equal((await schreiben('mitarbeiter')).status, 403);
    assert.equal(fs.existsSync(prozesslinksPfad(dir)), false, 'unberechtigte Anfragen schreiben nichts');
    const ok = await schreiben('inhaber');
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ...konfiguriert(), bearbeitbar: true });
    assert.equal(fs.statSync(prozesslinksPfad(dir)).mode & 0o777, 0o600);
    assert.equal((await schreiben('inhaber', konfiguriert(), { origin: 'https://fremd.example' })).status, 403);
    assert.equal((await schreiben('inhaber', konfiguriert(), { origin: 'http://localhost:65534' })).status, 403, 'auch anderer lokaler Ursprung bleibt fremd');
    assert.equal((await schreiben('inhaber', konfiguriert(), { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await fetch(ziel, { method: 'PUT', headers: { cookie: kekse.inhaber } })).status, 405);
    const ungueltig = konfiguriert();
    ungueltig.ziele.email.chatgpt = 'https://chatgpt.com/?q=beispiel';
    assert.equal((await schreiben('inhaber', ungueltig)).status, 400);
    assert.deepEqual(leseProzesslinks(prozesslinksPfad(dir)), konfiguriert(), 'ungueltige Eingabe veraendert nichts');
    fs.writeFileSync(prozesslinksPfad(dir), '{kaputt');
    assert.equal((await fetch(ziel, { headers: { cookie: kekse.lesen } })).status, 500);
    assert.equal((await schreiben('inhaber')).status, 500);
    assert.equal(fs.readFileSync(prozesslinksPfad(dir), 'utf8'), '{kaputt');
    fs.unlinkSync(prozesslinksPfad(dir));
    const notzugang = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passwort: 'notzugang-testpasswort' }),
    });
    assert.equal(notzugang.status, 200);
    const keks = notzugang.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(ziel, { headers: { cookie: keks } }).then(r => r.json())).bearbeitbar, true);
    assert.equal((await fetch(ziel, { method: 'POST', headers: { cookie: keks, 'content-type': 'application/json' }, body: JSON.stringify(konfiguriert()) })).status, 200);
  });
});
