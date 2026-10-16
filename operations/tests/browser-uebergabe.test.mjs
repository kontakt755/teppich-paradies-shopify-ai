import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dashboardUrsprung, manifestFuer, paketErzeugen, argumente } from '../scripts/browser-uebergabe-paket.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUELLE = path.join(REPO, 'operations/browser-uebergabe');
const code = name => fs.readFileSync(path.join(QUELLE, name), 'utf8');
const ZIEL = 'https://chatgpt.com/g/g-p-00000000000000000000000000000000/project';
const ORIGIN = 'http://127.0.0.1:8001';
const KEY = 'tp-prozess-uebergaben-v1';
function logik() {
  const c = vm.createContext({ URL });
  vm.runInContext(code('logik.js'), c);
  return c.TPBrowserUebergabeLogik;
}
const L = logik();
function senderDashboard(extra = {}) {
  return { id: 'erweiterung', tab: { id: 1 }, frameId: 0, documentId: 'dashboard-dokument', url: `${ORIGIN}/#/prozesse`, ...extra };
}
function eingabe(extra = {}) {
  return { kanal: 'dashboard', typ: 'tp-prozess-uebergabe', version: 1, aktion: 'einfuegen', id: randomUUID(), ziel: ZIEL, text: 'Testauftrag ohne Kundendaten', ...extra };
}

function worker() {
  let jetzt = 1000;
  let naechsterTab = 10;
  let daten = {};
  const ereignisse = {};
  const alarmListe = new Map();
  const tabs = [], antworten = [];
  const event = name => ({ addListener: fn => { ereignisse[name] = fn; } });
  const chrome = {
    runtime: { id: 'erweiterung', onMessage: event('nachricht'), onStartup: event('start'), onInstalled: event('installation') },
    storage: { session: { get: async () => structuredClone(daten), set: async d => { daten = structuredClone(d); } } },
    tabs: {
      create: async d => { tabs.push(structuredClone(d)); return { id: naechsterTab++ }; },
      sendMessage: async (...d) => { antworten.push(structuredClone(d)); },
      onRemoved: event('tabZu'), onUpdated: event('tabAenderung'),
    },
    alarms: { create: async (name, d) => alarmListe.set(name, d), clear: async name => alarmListe.delete(name), onAlarm: event('alarm') },
  };
  const c = vm.createContext({ URL, chrome, crypto: { randomUUID }, Date: class extends Date { static now() { return jetzt; } } });
  c.TPBrowserUebergabeKonfiguration = { dashboardUrspruenge: [ORIGIN] };
  vm.runInContext(code('logik.js'), c);
  vm.runInContext(code('service-worker.js').replace(/^import .+;$/gm, ''), c);
  const sende = (m, sender = senderDashboard()) => new Promise(resolve => {
    assert.equal(ereignisse.nachricht(m, sender, resolve), true);
  });
  const snapshot = () => structuredClone(daten[KEY]);
  const empfaenger = (job, extra = {}) => ({ id: 'erweiterung', frameId: 0, tab: { id: job.zielTab }, documentId: 'ziel-dokument', url: ZIEL, ...extra });
  const status = () => sende({ kanal: 'dashboard', typ: 'tp-prozess-uebergabe', version: 1, aktion: 'status', id: randomUUID() });
  return { sende, snapshot, empfaenger, tabs, antworten, alarmListe, ereignisse, status, zeit: d => { jetzt = d; } };
}

test('Routing verlangt exact Origin, Projektstart-URL, Topframe und Dokumentkennung', () => {
  assert.equal(L.projektZiel(ZIEL), ZIEL);
  for (const ziel of [ZIEL + '?q=Test', ZIEL + '#Test', ZIEL.replace('chatgpt.com', 'chatgpt.com.example'),
    ZIEL.replace('/project', '/c/test'), ZIEL.replace('https:', 'http:'), 'https://chatgpt.com/', ZIEL + '/']) {
    assert.equal(L.projektZiel(ziel), null, ziel);
  }
  assert.equal(L.dashboardSender(senderDashboard(), [ORIGIN], 'erweiterung'), true);
  for (const sender of [senderDashboard({ frameId: 1 }), senderDashboard({ documentId: null }),
    senderDashboard({ id: 'fremd' }), senderDashboard({ url: 'http://127.0.0.1:8002/' })]) {
    assert.equal(L.dashboardSender(sender, [ORIGIN], 'erweiterung'), false);
  }
  assert.equal(L.nachrichtGueltig(eingabe()), true);
  assert.equal(L.nachrichtGueltig(eingabe({ text: ' ' })), false);
  assert.equal(L.nachrichtGueltig(eingabe({ text: 'x'.repeat(200001) })), false);
  assert.equal(L.nachrichtGueltig(eingabe({ aktion: 'status' })), false, 'Status traegt keinen Inhalt');
});

test('Worker: nur neuer erlaubter Tab, Dokument+Token gebunden, genau einmal, danach nur Metadaten', async () => {
  const w = worker(), m = eingabe();
  assert.equal((await w.sende(m)).status, 'oeffnet');
  assert.deepEqual(w.tabs, [{ url: ZIEL, active: true }]);
  assert.equal((await w.sende(m)).code, 'doppelt');
  const job = w.snapshot().jobs[m.id];
  const sender = w.empfaenger(job);
  const meta = await w.sende({ kanal: 'empfaenger', aktion: 'bereit' }, sender);
  assert.equal(meta.status, 'wartet');
  assert.equal(meta.text, undefined, 'Bereitschaft uebertraegt noch keinen Auftrag');
  const hole = { kanal: 'empfaenger', aktion: 'holen', id: m.id, token: meta.token };
  assert.equal((await w.sende(hole, { ...sender, documentId: 'fremdes-dokument' })).code, 'abgebrochen');
  assert.equal((await w.sende({ ...hole, token: randomUUID() }, sender)).code, 'abgebrochen');
  const inhalt = await w.sende(hole, sender);
  assert.equal(inhalt.text, m.text);
  assert.equal((await w.sende(hole, sender)).code, 'doppelt');
  await w.sende({ ...hole, aktion: 'ergebnis', ok: true }, sender);
  assert.equal(Object.keys(w.snapshot().jobs).length, 0);
  assert.equal(JSON.stringify(w.snapshot()).includes(m.text), false);
  assert.equal((await w.sende(m)).code, 'doppelt', 'ein beendeter Auftrag wird nicht erneut geoeffnet');
  assert.equal(w.antworten.at(-1)[1].status, 'eingefuegt');
  assert.equal(w.antworten.some(([, r]) => 'text' in r || 'ziel' in r), false, 'Statusantworten enthalten nur Metadaten');
});

test('Worker: falsches Projekt bekommt keinen Text und beendet die Uebergabe', async () => {
  const w = worker(), m = eingabe();
  await w.sende(m);
  const job = w.snapshot().jobs[m.id];
  const falsch = w.empfaenger(job, { url: ZIEL.replace(/0(?=\/project)/, '1') });
  assert.equal((await w.sende({ kanal: 'empfaenger', aktion: 'bereit' }, falsch)).code, 'ziel_falsch');
  assert.equal(Object.keys(w.snapshot().jobs).length, 0);
});

test('Worker: verspaetetes loading des ersten Zieldokuments verwirft keine gebundene Uebergabe', async () => {
  const w = worker(), m = eingabe();
  await w.sende(m);
  const job = w.snapshot().jobs[m.id];
  const sender = w.empfaenger(job);
  // Chrome kann den Ladezustand erst nach der bereit-Nachricht liefern. Beide
  // Ereignisse gehen in dieselbe Queue; loading darf die spaetere Bindung nicht loeschen.
  const bereitschaft = w.sende({ kanal: 'empfaenger', aktion: 'bereit' }, sender);
  w.ereignisse.tabAenderung(job.zielTab, { status: 'loading' });
  const meta = await bereitschaft;
  await w.status();
  assert.equal(meta.status, 'wartet');
  assert.equal(w.snapshot().jobs[m.id].zielDokument, sender.documentId);
  w.ereignisse.tabAenderung(job.zielTab, { status: 'loading', url: ZIEL });
  await w.status();
  const inhalt = await w.sende({ kanal: 'empfaenger', aktion: 'holen', id: m.id, token: meta.token }, sender);
  assert.equal(inhalt.status, 'einsetzen');
  assert.equal(inhalt.text, m.text);
  assert.equal(w.antworten.length, 0, 'kein falscher Abbruch fuer dasselbe Ziel');
});

test('Worker: andere Ziel-URL und Laden des Quelldokuments brechen weiterhin ab', async () => {
  for (const [seite, aenderung] of [
    ['zielTab', { url: 'https://chatgpt.com/' }],
    ['zielTab', { status: 'loading', url: ZIEL + '?anderes-ziel' }],
    ['quellTab', { status: 'loading' }],
  ]) {
    const w = worker(), m = eingabe();
    await w.sende(m);
    const job = w.snapshot().jobs[m.id];
    await w.sende({ kanal: 'empfaenger', aktion: 'bereit' }, w.empfaenger(job));
    w.ereignisse.tabAenderung(job[seite], aenderung);
    await w.status();
    assert.equal(Object.keys(w.snapshot().jobs).length, 0);
    assert.equal(JSON.stringify(w.snapshot()).includes(m.text), false);
    assert.equal(w.antworten.at(-1)[1].code, 'abgebrochen');
  }
});

test('Worker: neues Dokument an gleicher Ziel-URL erhaelt keinen alten Auftrag', async () => {
  const w = worker(), m = eingabe();
  await w.sende(m);
  const job = w.snapshot().jobs[m.id];
  const sender = w.empfaenger(job);
  const meta = await w.sende({ kanal: 'empfaenger', aktion: 'bereit' }, sender);
  const neu = { ...sender, documentId: 'neues-ziel-dokument' };
  w.ereignisse.tabAenderung(job.zielTab, { status: 'loading' });
  assert.equal((await w.sende({ kanal: 'empfaenger', aktion: 'bereit' }, neu)).code, 'ziel_falsch');
  assert.equal(Object.keys(w.snapshot().jobs).length, 0);
  assert.equal((await w.sende({ kanal: 'empfaenger', aktion: 'holen', id: m.id, token: meta.token }, neu)).code, 'abgebrochen');
  assert.equal((await w.sende({ kanal: 'empfaenger', aktion: 'holen', id: m.id, token: meta.token }, sender)).code, 'abgebrochen');
  assert.equal(JSON.stringify(w.antworten).includes(m.text), false);
});

test('Worker: Abbruch gehoert zum Dashboarddokument; Ablauf und Tab-Schliessen loeschen Inhalt', async () => {
  const w = worker(), m = eingabe();
  await w.sende(m);
  const abbruch = { kanal: 'dashboard', typ: m.typ, version: 1, aktion: 'abbrechen', id: m.id };
  await w.sende(abbruch, senderDashboard({ documentId: 'anderes-dashboard' }));
  assert.ok(w.snapshot().jobs[m.id]);
  await w.sende(abbruch);
  assert.equal(Object.keys(w.snapshot().jobs).length, 0);
  const n = eingabe(); await w.sende(n);
  w.zeit(121001);
  await w.status();
  assert.equal(Object.keys(w.snapshot().jobs).length, 0);
  assert.equal(w.antworten.at(-1)[1].code, 'abgelaufen');
  const o = eingabe(); await w.sende(o);
  w.ereignisse.tabZu(w.snapshot().jobs[o.id].zielTab);
  await w.status();
  assert.equal(Object.keys(w.snapshot().jobs).length, 0);
  assert.equal(JSON.stringify(w.snapshot()).includes(o.text), false);
});

test('Worker: maximal fuenf offene Auftraege, klarer Timeout ohne Empfaenger', async () => {
  const w = worker();
  const ids = [];
  for (let i = 0; i < 5; i++) { const m = eingabe(); ids.push(m.id); assert.equal((await w.sende(m)).status, 'oeffnet'); }
  assert.equal((await w.sende(eingabe())).code, 'zu_viele');
  assert.equal(w.tabs.length, 5);
  w.ereignisse.alarm({ name: `bereit:${ids[0]}` });
  await w.status();
  assert.equal(Object.keys(w.snapshot().jobs).length, 4);
  assert.equal(w.antworten.at(-1)[1].code, 'seite_nicht_bereit');
});

test('Worker: paralleler Doppelklick startet genau einen Tab', async () => {
  const w = worker(), m = eingabe();
  const r = await Promise.all([w.sende(m), w.sende(m)]);
  assert.deepEqual(r.map(x => x.status), ['oeffnet', 'fehler']);
  assert.equal(r[1].code, 'doppelt');
  assert.equal(w.tabs.length, 1);
});

test('Paket: restriktive Matches, keine Tabs-/Cookie-/Netzwerkrechte oder dauerhafte Nutzdaten', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-browserpaket-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ziel = path.join(dir, 'paket');
  const r = paketErzeugen({ dashboards: [ORIGIN, 'https://dashboard.example'], ziel });
  const m = JSON.parse(fs.readFileSync(path.join(ziel, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.permissions, ['storage', 'alarms']);
  assert.equal(m.host_permissions, undefined);
  assert.deepEqual(m.content_scripts[0].matches, [`${ORIGIN}/*`, 'https://dashboard.example/*']);
  assert.deepEqual(m.content_scripts[1].matches, ['https://chatgpt.com/g/g-p-*/project*']);
  assert.equal(m.content_scripts.every(s => s.all_frames === false), true);
  assert.equal(r.dateien.length, 6);
  assert.equal(fs.statSync(path.join(ziel, 'konfiguration.js')).mode & 0o777, 0o600);
  assert.throws(() => paketErzeugen({ dashboards: [ORIGIN], ziel }), /leer/);
  assert.throws(() => paketErzeugen({ dashboards: [ORIGIN], ziel: path.join(REPO, 'privat') }), /Repository/);
  const link = path.join(dir, 'repo-link'); fs.symlinkSync(REPO, link);
  assert.throws(() => paketErzeugen({ dashboards: [ORIGIN], ziel: path.join(link, 'privat') }), /Repository/);
  for (const bad of [`${ORIGIN}/`, `${ORIGIN}/pfad`, `${ORIGIN}?q=test`, 'https://*.example', 'https://name@dashboard.example']) assert.throws(() => dashboardUrsprung(bad));
  assert.equal(manifestFuer([ORIGIN, ORIGIN]).content_scripts[0].matches.length, 1);
  assert.deepEqual(argumente(['--dashboard', ORIGIN, '--dashboard', 'https://dashboard.example', '--ziel', ziel]).dashboards, [ORIGIN, 'https://dashboard.example']);
  for (const name of ['dashboard.js', 'service-worker.js', 'empfaenger.js']) {
    const quelle = code(name);
    assert.doesNotMatch(quelle, /console\.|storage\.(?:local|sync)|localStorage|sessionStorage|fetch\(|XMLHttpRequest|\.click\(|KeyboardEvent|innerHTML/);
  }
});

test('Leerer Entwurf ist Voraussetzung; HTML-Zeichen bleiben Text und Statusvergleich ist exakt', () => {
  assert.equal(L.feldLeer(' \n'), true);
  assert.equal(L.feldLeer('', true), false);
  assert.equal(L.feldLeer('Vorhandener Entwurf'), false);
  assert.equal(L.gleicherText('Literal <script> & "', 'Literal <script> & "'), true);
  assert.equal(L.gleicherText('alt', 'neu'), false);
});
