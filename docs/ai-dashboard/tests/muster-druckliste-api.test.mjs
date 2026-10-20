import { PRIVAT_DIR } from './_testumgebung.mjs'; // vor Server-Imports
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { etikettenAusLexikon } from '../lib/lexikon-etiketten.mjs';

function vorbereiten(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-druckliste-api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const original = { handle: 'testserie-esche', titel: 'Testserie Esche', eigenschaften: { marke: 'Testserie', gesamtstaerke: '5 mm' }, varianten: [{ id: '1', sku: 'TEST-100', farbe: 'Esche', titel: 'Esche' }] };
  const muster = { handle: 'muster-anderer-name', titel: 'Muster anderer Name', varianten: [{ id: '2', sku: 'M-TEST-100', farbe: 'Esche', original: { produktHandle: original.handle, artikelnummer: 'NICHT-SHOP-SKU' } }] };
  const luecke = { handle: 'test-ohne-farbe', titel: 'Test Ohne', varianten: [{ id: '3', sku: 'TEST-LEER', titel: 'Default Title' }] };
  const produkte = [original, muster, luecke];
  fs.mkdirSync(path.join(dir, 'lexikon'));
  fs.writeFileSync(path.join(dir, 'lexikon', 'produkte.json'), JSON.stringify({ produkte }));
  const kanonisch = etikettenAusLexikon(muster, new Map(produkte.map(p => [p.handle, p])))[0];
  const unerlaubt = () => assert.fail('Druckliste darf kein Fachsystem oder externes Werkzeug ändern');
  const api = createApi({ privatDirPath: dir, gh: unerlaubt, rebuild: unerlaubt, shopifyZugang: unerlaubt });
  const payload = () => ({ aktion: 'vormerken', vorgangId: randomUUID(), handle: muster.handle, key: kanonisch.key, anzahl: 2 });
  return { dir, api, payload, kanonisch, luecke };
}
const person = { name: 'Vorbereitung', rolle: 'mitarbeiter' };

test('Vormerken verwendet Originalreferenz und kanonische Shop-Daten; Browserfelder werden ignoriert', async t => {
  const { dir, api, payload, kanonisch } = vorbereiten(t);
  assert.deepEqual(api.lexikonDruckliste(), { schema: 1, eintraege: [] });
  assert.equal(fs.existsSync(path.join(dir, 'muster-druckliste.json')), false);
  const p = payload();
  const stand = await api.lexikonDrucklisteSetzen({ ...p, actor: 'Fremder', etikett: { sku: 'FALSCH' }, erstelltVon: 'Fremder' }, person);
  assert.equal(stand.eintraege.length, 1);
  const e = stand.eintraege[0];
  assert.deepEqual(e.etikett, kanonisch.etikett);
  assert.equal(e.etikett.sku, 'TEST-100');
  assert.equal(e.etikett.url, 'https://www.teppich-paradies.net/products/testserie-esche');
  assert.equal(e.erstelltVon, person.name);
  assert.equal(e.anzahl, 2);
  assert.equal((await api.lexikonDrucklisteSetzen(p, person)).eintraege.length, 1, 'Antwortverlust und Wiederholung verdoppeln nicht');
  const zweiterClient = createApi({ privatDirPath: dir });
  assert.equal(zweiterClient.lexikonDruckliste().eintraege[0].id, e.id, 'neue Sitzung liest dieselbe private Ablage');
});

test('Druckabschluss nimmt nur reservierte IDs; spaetere Vormerkung bleibt offen', async t => {
  const { api, payload } = vorbereiten(t);
  const erster = (await api.lexikonDrucklisteSetzen(payload(), person)).eintraege[0];
  const job = randomUUID();
  const reservierung = { aktion: 'reservieren', vorgangId: randomUUID(), druckauftragId: job, eintraege: [{ id: erster.id, revision: erster.revision }] };
  let stand = await api.lexikonDrucklisteSetzen(reservierung, { name: 'Laden', rolle: 'mitarbeiter' });
  const gedruckter = stand.eintraege[0];
  await assert.rejects(api.lexikonDrucklisteSetzen({ ...reservierung, vorgangId: randomUUID(), druckauftragId: randomUUID() }, person), e => e.status === 409);
  stand = await api.lexikonDrucklisteSetzen(payload(), person);
  assert.equal(stand.eintraege.length, 2);
  stand = await api.lexikonDrucklisteSetzen({ aktion: 'erledigen', vorgangId: randomUUID(), druckauftragId: job, eintraege: [{ id: gedruckter.id, revision: gedruckter.revision }] }, { name: 'Laden', rolle: 'mitarbeiter' });
  assert.deepEqual(stand.eintraege.map(e => e.status).sort(), ['gedruckt', 'offen']);
  assert.equal(stand.eintraege.find(e => e.status === 'gedruckt').gedrucktVon, 'Laden');
});

test('Unvollstaendige und manipulierte Auswahlen sowie Leserechte schreiben nichts', async t => {
  const { api, dir, payload, luecke } = vorbereiten(t);
  for (const p of [null, { ...payload(), handle: 'gibt-es-nicht' }, { ...payload(), key: 'fremder-key' }, { ...payload(), anzahl: 0 }, { ...payload(), anzahl: 1.5 }, { ...payload(), anzahl: 21 }, { ...payload(), handle: luecke.handle, key: etikettenAusLexikon(luecke)[0].key }]) {
    await assert.rejects(api.lexikonDrucklisteSetzen(p, person), e => [400, 404, 409].includes(e.status));
  }
  await assert.rejects(api.lexikonDrucklisteSetzen(payload(), { name: 'Lesen', rolle: 'lesen' }), e => e.status === 403);
  assert.equal(fs.existsSync(path.join(dir, 'muster-druckliste.json')), false);
});

test('HTTP: gemeinsame Liste erlaubt Mitarbeiter, sperrt Lesen/CSRF, haelt Fehlerdaten unveraendert', async t => {
  const { dir, payload } = vorbereiten(t);
  const { benutzerAnlegen, schreibeBenutzer } = await import('../../../operations/lib/benutzer.mjs');
  let benutzer = [];
  for (const rolle of ['lesen', 'mitarbeiter']) benutzer = benutzerAnlegen(benutzer, { name: rolle, kuerzel: rolle, rolle, passwort: `test-druckliste-${rolle}` });
  schreibeBenutzer(benutzer, path.join(dir, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = dir;
  const { requestHandler } = await import('../../../scripts/serve-dashboard.mjs?case=muster-druckliste');
  t.after(() => { process.env.TP_PRIVAT_DIR = PRIVAT_DIR; });
  const server = http.createServer(requestHandler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ziel = `${base}/api/lexikon/druckliste`;
  assert.equal((await fetch(ziel)).status, 401);
  const cookies = {};
  for (const rolle of ['lesen', 'mitarbeiter']) {
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: rolle, passwort: `test-druckliste-${rolle}` }) });
    assert.equal(login.status, 200);
    cookies[rolle] = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(ziel, { headers: { cookie: cookies[rolle] } })).status, 200);
  }
  const post = (rolle, daten = payload(), extra = {}) => fetch(ziel, { method: 'POST', headers: { cookie: cookies[rolle], origin: base, 'content-type': 'application/json', ...extra }, body: JSON.stringify(daten) });
  assert.equal((await post('lesen')).status, 403);
  assert.equal((await post('mitarbeiter', payload(), { origin: 'https://fremd.example' })).status, 403);
  assert.equal((await post('mitarbeiter', payload(), { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await fetch(ziel, { method: 'PUT', headers: { cookie: cookies.mitarbeiter } })).status, 405);
  assert.equal((await post('mitarbeiter')).status, 200);
  assert.equal((await fetch(ziel, { headers: { cookie: cookies.lesen } }).then(r => r.json())).eintraege.length, 1);
  fs.writeFileSync(path.join(dir, 'muster-druckliste.json'), '{kaputt');
  assert.equal((await fetch(ziel, { headers: { cookie: cookies.mitarbeiter } })).status, 500);
  assert.equal((await post('mitarbeiter')).status, 500);
  assert.equal(fs.readFileSync(path.join(dir, 'muster-druckliste.json'), 'utf8'), '{kaputt');
});
