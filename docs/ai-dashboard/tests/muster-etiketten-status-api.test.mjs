import { PRIVAT_DIR } from './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApi } from '../../../scripts/dashboard-api.mjs';

const produkt = n => ({ handle: `testserie-${n}`, titel: `Testserie ${n} Teppichboden`, status: 'ACTIVE',
  onlineStoreUrl: `https://www.teppich-paradies.net/products/testserie-${n}`, produktgruppe: 'Teppichboden',
  musterRegeln: { tags: [], geschenkgutschein: false, basisHandle: null, vollstaendig: true },
  varianten: [{ id: String(n), sku: `TEST-${n}`, farbe: 'Sand', titel: 'Sand', optionen: [{ name: 'Farbe', wert: 'Sand' }] }] });

function umgebung(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-etiketten-status-api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  const file = path.join(dir, 'lexikon', 'produkte.json');
  let revision = 0;
  const speichern = produkte => { fs.writeFileSync(file, JSON.stringify({ erstellt: '2026-10-20T10:00:00Z', produkte })); fs.utimesSync(file, 1_800_000_000 + ++revision, 1_800_000_000 + revision); };
  speichern([produkt(1)]);
  const verboten = () => assert.fail('Die Abdeckungspruefung darf keine externen Werkzeuge oder Schreibaktionen starten.');
  return { dir, file, speichern, api: createApi({ privatDirPath: dir, gh: verboten, rebuild: verboten, shopifyZugang: verboten }) };
}

test('Neues Produkt/Farbe wird nach Export automatisch geprueft; Fehler verschwinden erst nach echter Korrektur', t => {
  const u = umgebung(t);
  const vorher = fs.readFileSync(u.file, 'utf8');
  let s = u.api.lexikonEtikettenStatus({ status: 'alle' });
  assert.equal(s.zaehler.bereit, 1);
  assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
  const neu = produkt(2); neu.varianten[0].farbe = ''; neu.varianten[0].titel = 'Default Title';
  u.speichern([produkt(1), neu]);
  s = u.api.lexikonEtikettenStatus();
  assert.equal(s.zaehler.pruefen, 1);
  assert.equal(s.treffer.items[0].handle, neu.handle);
  neu.varianten[0].farbe = 'Grau';
  u.speichern([produkt(1), neu]);
  s = u.api.lexikonEtikettenStatus({ status: 'bereit', q: 'Grau' });
  assert.equal(s.zaehler.bereit, 2);
  assert.equal(s.treffer.count, 1);
  assert.equal(s.treffer.items[0].etiketten[0].etikett.farbe, 'Grau');
  assert.equal(fs.existsSync(path.join(u.dir, 'muster-druckliste.json')), false);
});

test('Pagination und Filter sind begrenzt; fehlender oder beschaedigter Export wird nie als bestandene Pruefung gemeldet', t => {
  const u = umgebung(t);
  u.speichern(Array.from({ length: 25 }, (_, i) => produkt(i + 1)));
  const s = u.api.lexikonEtikettenStatus({ status: 'alle', page: 999 });
  assert.equal(s.treffer.page, 2); assert.equal(s.treffer.items.length, 5);
  assert.equal(s.treffer.count, 25);
  fs.writeFileSync(u.file, '{kaputt'); fs.utimesSync(u.file, 1_900_000_000, 1_900_000_000);
  assert.equal(u.api.lexikonEtikettenStatus().verfuegbar, false);
  fs.unlinkSync(u.file);
  assert.equal(u.api.lexikonEtikettenStatus().verfuegbar, false);
});

test('HTTP: Bestand nur angemeldet lesbar, alle Mitarbeiterrollen duerfen lesen, POST und Fremdherkunft bleiben gesperrt', async t => {
  const u = umgebung(t);
  const { benutzerAnlegen, schreibeBenutzer } = await import('../../../operations/lib/benutzer.mjs');
  let benutzer = [];
  for (const rolle of ['inhaber', 'mitarbeiter', 'lesen']) benutzer = benutzerAnlegen(benutzer, { name: rolle, kuerzel: rolle, rolle, passwort: `test-etikettenstatus-${rolle}` });
  schreibeBenutzer(benutzer, path.join(u.dir, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = u.dir;
  t.after(() => { process.env.TP_PRIVAT_DIR = PRIVAT_DIR; });
  const { requestHandler } = await import('../../../scripts/serve-dashboard.mjs?fall=etiketten-status');
  const server = http.createServer(requestHandler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`, url = `${base}/api/lexikon/etiketten-status`;
  const unauth = await fetch(url); assert.equal(unauth.status, 401); assert.match(unauth.headers.get('cache-control'), /no-store/);
  for (const rolle of ['inhaber', 'mitarbeiter', 'lesen']) {
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: rolle, passwort: `test-etikettenstatus-${rolle}` }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(url, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(url, { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: '{}' })).status, 405);
    assert.equal((await fetch(url, { headers: { cookie, origin: 'https://fremd.example' } })).status, 403);
  }
});
