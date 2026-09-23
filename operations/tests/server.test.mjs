import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { erzeugeHandler, argumente, ladeExport, ROLLEN, darf, bereicheFuer, gleicheHerkunft, uebergangsPfad } from '../server.mjs';
import { erzeugeSpeicher } from '../state/speicher.mjs';
import { AUFTRAG_STATUS } from '../lib/status.mjs';
import { daten } from './auftragsband-fixtures.mjs';

const quelle = { art: 'momentaufnahme', stand: '2026-01-06T00:00:00Z', datei: 'test-orders.json' };

function frischerSpeicher() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-server-'));
  return erzeugeSpeicher(path.join(dir, 'auftraege.jsonl'));
}

/** Startet den Server auf Port 0. Wird per t.after() immer geschlossen. */
async function starte(t, { rolle = 'leitung', speicher = frischerSpeicher() } = {}) {
  const handler = erzeugeHandler({ daten: daten(), quelle, rolle, speicher });
  const server = createServer(handler);
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise(ok => server.close(ok)));
  const port = server.address().port;
  const basis = `http://127.0.0.1:${port}`;
  async function ruf(pfad, optionen = {}) {
    const res = await fetch(basis + pfad, { signal: AbortSignal.timeout(5000), ...optionen });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: res.status, body };
  }
  return { server, port, basis, ruf, speicher };
}

/** Rohe Anfrage ueber einen Socket - fuer Pfade, die fetch normalisieren wuerde. */
function rohAnfrage(port, zeile, kopf = 'Host: 127.0.0.1') {
  return new Promise((ok, fehler) => {
    import('node:net').then(({ default: net }) => {
      const s = net.connect(port, '127.0.0.1', () => s.write(`${zeile}\r\n${kopf}\r\nConnection: close\r\n\r\n`));
      let d = '';
      s.on('data', c => { d += c; });
      s.on('end', () => ok(d));
      s.on('error', fehler);
    });
  });
}

test('Rollen: Bereiche je Rolle', () => {
  assert.deepEqual(Object.keys(ROLLEN).sort(), ['einkauf', 'kundenservice', 'lager', 'leitung', 'verkauf']);
  assert.ok(darf('leitung', 'auftraege_schreiben'));
  assert.ok(!darf('kundenservice', 'auftraege_schreiben'));
  assert.ok(darf('kundenservice', 'auftraege_lesen'));
  assert.ok(!darf('einkauf', 'auftraege_lesen'));
  assert.ok(!darf('lager', 'suche'));
  assert.equal(bereicheFuer('gibtsnicht'), null);
});

test('unbekannte Rolle wird beim Start abgelehnt', () => {
  assert.throws(() => erzeugeHandler({ daten: daten(), quelle, rolle: 'chef' }), /Unbekannte Rolle/);
});

test('argumente verlangt --input oder --live', () => {
  assert.throws(() => argumente([]), /--input/);
  assert.throws(() => argumente(['--quatsch']), /Unbekanntes Argument/);
  assert.equal(argumente(['--input', 'x.json']).input, 'x.json');
  assert.equal(argumente(['--live', '--port', '9']).port, 9);
});

test('ladeExport versteht Array, orders und data.orders', () => {
  assert.equal(ladeExport('[]').orders.length, 0);
  assert.equal(ladeExport('{"orders":[{"name":"#T1"}]}').orders.length, 1);
  assert.equal(ladeExport('{"data":{"orders":{"nodes":[{"name":"#T1"}]}}}').orders.length, 1);
  assert.throws(() => ladeExport('{"nix":1}'), /orders/);
});

test('GET /api/kontext nennt Rolle, Quelle und Bereiche', async t => {
  const s = await starte(t);
  const r = await s.ruf('/api/kontext');
  assert.equal(r.status, 200);
  assert.equal(r.body.rolle, 'leitung');
  assert.equal(r.body.quelle.art, 'momentaufnahme');
  assert.equal(r.body.anzahl, 3);
  assert.ok(r.body.bereiche.includes('suche'));
});

test('Warteschlange kommt in Bearbeitungsreihenfolge', async t => {
  const s = await starte(t);
  const r = await s.ruf('/api/warteschlange');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.auftraege.map(a => a.name), ['#T1', '#T2', '#T3']);
});

test('403 fuer fremden Origin bei POST', async t => {
  const s = await starte(t);
  const r = await s.ruf('/api/auftrag/%23T1/freigeben', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://boese.example' },
    body: JSON.stringify({ von: 'Test Mitarbeiterin' }),
  });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /Nur lokal/);
  assert.equal(s.speicher.eintraege().length, 0);
});

test('POST ohne application/json wird abgewiesen', async t => {
  const s = await starte(t);
  const r = await s.ruf('/api/auftrag/%23T1/freigeben', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'von=x' });
  assert.equal(r.status, 415);
});

test('403 fuer falsche Rolle: kundenservice darf nicht freigeben', async t => {
  const s = await starte(t, { rolle: 'kundenservice' });
  const r = await s.ruf('/api/auftrag/%23T1/freigeben', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ von: 'Test Mitarbeiterin' }),
  });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /auftraege_schreiben/);
  assert.equal(s.speicher.eintraege().length, 0);
});

test('403 fuer falsche Rolle: einkauf sieht keine Auftraege, aber die Suche', async t => {
  const s = await starte(t, { rolle: 'einkauf' });
  assert.equal((await s.ruf('/api/warteschlange')).status, 403);
  assert.equal((await s.ruf('/api/auftrag/%23T1')).status, 403);
  assert.equal((await s.ruf('/api/suche?q=B-4711')).status, 200);
});

test('403 fuer falsche Rolle: lager darf nicht suchen', async t => {
  const s = await starte(t, { rolle: 'lager' });
  assert.equal((await s.ruf('/api/suche?q=test')).status, 403);
  assert.equal((await s.ruf('/api/kontext')).status, 200);
});

test('Pfad-Ausbruch aus operations/ui wird abgewiesen', async t => {
  const s = await starte(t);
  const antwort = await rohAnfrage(s.port, 'GET /ui/../../package.json HTTP/1.1');
  assert.match(antwort.split('\r\n')[0], /403|404/);
  assert.ok(!antwort.includes('"operations:band"'), 'package.json darf nicht ausgeliefert werden');
  const kodiert = await rohAnfrage(s.port, 'GET /ui/%2e%2e%2f%2e%2e%2fpackage.json HTTP/1.1');
  assert.ok(!kodiert.includes('"operations:band"'));
});

test('statische Dateien nur aus operations/ui', async t => {
  const s = await starte(t);
  const res = await fetch(`${s.basis}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Auftragsband/);
  assert.equal((await fetch(`${s.basis}/ui/auftragsband.js`)).status, 200);
  assert.equal((await fetch(`${s.basis}/ui/gibtsnicht.js`)).status, 404);
});

test('uebergangsPfad erlaubt nur direkte Wege und die Pruefung vor der Freigabe', () => {
  assert.deepEqual(uebergangsPfad('NEU', AUFTRAG_STATUS.SPAETER), [AUFTRAG_STATUS.SPAETER]);
  assert.deepEqual(uebergangsPfad('NEU', AUFTRAG_STATUS.FREIGEGEBEN), [AUFTRAG_STATUS.PRUEFUNG, AUFTRAG_STATUS.FREIGEGEBEN]);
  assert.equal(uebergangsPfad(AUFTRAG_STATUS.VERSAND, AUFTRAG_STATUS.FREIGEGEBEN), null, 'kein Umweg ueber PROBLEM');
  assert.equal(uebergangsPfad('NEU', 'NEU'), null);
});

test('SPAETER schreibt genau einen Zustandseintrag', async t => {
  const s = await starte(t);
  const r = await s.ruf('/api/auftrag/%23T1/spaeter', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ von: 'Test Mitarbeiterin', grund: 'Rueckfrage offen' }),
  });
  assert.equal(r.status, 200);
  assert.equal(s.speicher.eintraege().length, 1);
  assert.equal(s.speicher.stand('#T1').status, AUFTRAG_STATUS.SPAETER);
});

test('Freigabe schreibt genau einen Freigabe-Eintrag und nennt den naechsten Auftrag', async t => {
  const s = await starte(t);
  const r = await s.ruf('/api/auftrag/%23T1/freigeben', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ von: 'Test Mitarbeiterin' }),
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.eintrag.status, AUFTRAG_STATUS.FREIGEGEBEN);
  assert.equal(r.body.naechster, '#T2');
  const eigene = s.speicher.verlauf('#T1').filter(e => e.status === AUFTRAG_STATUS.FREIGEGEBEN);
  assert.equal(eigene.length, 1, 'genau ein FREIGEGEBEN-Eintrag');
  assert.deepEqual(s.speicher.verlauf('#T1').map(e => e.status), [AUFTRAG_STATUS.PRUEFUNG, AUFTRAG_STATUS.FREIGEGEBEN]);
  assert.equal(s.speicher.stand('#T1').von, 'Test Mitarbeiterin');
});

test('PROBLEM braucht einen Grund und landet hinten in der Warteschlange', async t => {
  const s = await starte(t);
  const ohne = await s.ruf('/api/auftrag/%23T1/problem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ von: 'Test Mitarbeiterin' }) });
  assert.equal(ohne.status, 400);
  const mit = await s.ruf('/api/auftrag/%23T1/problem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ von: 'Test Mitarbeiterin', grund: 'Teststoff fehlt' }) });
  assert.equal(mit.status, 200);
  const w = await s.ruf('/api/warteschlange');
  assert.equal(w.body.auftraege[w.body.auftraege.length - 1].name, '#T1');
});

test('POST ohne von wird abgelehnt', async t => {
  const s = await starte(t);
  const r = await s.ruf('/api/auftrag/%23T1/spaeter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grund: 'Rueckfrage' }) });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /von/);
});

test('unerlaubter Uebergang wird mit 409 abgelehnt', async t => {
  const speicher = frischerSpeicher();
  speicher.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.VERSAND, von: 'Test Mitarbeiterin' });
  const s = await starte(t, { speicher });
  const r = await s.ruf('/api/auftrag/%23T1/freigeben', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ von: 'Test Mitarbeiterin' }) });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /nicht erlaubt/);
  assert.equal(speicher.verlauf('#T1').length, 1, 'nichts geschrieben');
});

test('unbekannter Auftrag und unbekannter API-Pfad', async t => {
  const s = await starte(t);
  assert.equal((await s.ruf('/api/auftrag/%23T999')).status, 404);
  assert.equal((await s.ruf('/api/gibtsnicht')).status, 404);
  assert.equal((await s.ruf('/api/warteschlange', { method: 'POST' })).status, 405);
});

test('gleicheHerkunft prueft Host und Origin', () => {
  assert.ok(gleicheHerkunft({ headers: { host: '127.0.0.1:8123' } }));
  assert.ok(gleicheHerkunft({ headers: { host: 'localhost:8123', origin: 'http://localhost:8123' } }));
  assert.ok(!gleicheHerkunft({ headers: { host: 'teppich-paradies.net' } }));
  assert.ok(!gleicheHerkunft({ headers: { host: '127.0.0.1:8123', origin: 'https://boese.example' } }));
});
