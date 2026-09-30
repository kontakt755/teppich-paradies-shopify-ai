import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { zugangAnlegen } from '../lib/eingang.mjs';
import { verarbeiteEingang } from '../lib/pruefung.mjs';
import { erstelleAnmeldung, erstelleUpload, erstelleZentrale, hostErlaubt } from '../scripts/server.mjs';
import { scheinRendern, testDb, tmpDir } from './_hilfe.mjs';

async function starte(t, handler) {
  const server = createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('Upload: ohne gueltigen Link gibt es nichts, mit Link den ganzen Weg bis zur Pruefung', async (t) => {
  const dir = tmpDir(t); const db = testDb(t);
  process.env.TP_SOCIAL_DIR = dir; t.after(() => { delete process.env.TP_SOCIAL_DIR; });
  const { token } = zugangAnlegen('Mehmet');
  // Die echte Messung braucht sips und echte Bilder - hier zaehlt der Ablauf.
  const messe = () => ({ breite: 3000, hoehe: 4000, helligkeit: 120, schaerfe: 500, dhash: 'abcdef0123456789' });
  const basis = await starte(t, erstelleUpload({ db, dir, nachUpload: nur => verarbeiteEingang(db, { dir, messe, nur }) }));

  assert.equal((await fetch(`${basis}/u/${'x'.repeat(24)}`)).status, 404);
  assert.equal((await fetch(`${basis}/`)).status, 404);
  const seite = await fetch(`${basis}/u/${token}`);
  assert.equal(seite.status, 200); assert.match(await seite.text(), /Hallo Mehmet/);

  const ohne = await fetch(`${basis}/u/${token}/start`, json({ ort: 'Velten' }));
  assert.equal(ohne.status, 400); assert.match((await ohne.json()).error, /einverstanden/);
  assert.equal(db.inhalte().length, 0, 'ohne Einwilligung entsteht kein Eintrag');

  const start = await (await fetch(`${basis}/u/${token}/start`, json({ einwilligung: true, ort: 'Musterweg 5, Velten', bodenart: 'Klebevinyl', taetigkeit: ['Verlegung'], vorherNachher: 'beides' }))).json();
  assert.match(start.upload, /^[a-f0-9]{16}$/);
  const put = body => fetch(`${basis}/u/${token}/datei/${start.upload}`, { method: 'PUT', body });
  assert.equal((await put(JPEG)).status, 200);
  const falsch = await put(Buffer.from('#!/bin/sh\nrm -rf /'));
  assert.equal(falsch.status, 415);
  assert.equal((await fetch(`${basis}/u/${token}/datei/${'0'.repeat(16)}`, { method: 'PUT', body: JPEG })).status, 410);

  const fertig = await (await fetch(`${basis}/u/${token}/fertig/${start.upload}`, { method: 'POST' })).json();
  assert.deepEqual(fertig, { ok: true, dateien: 1, brauchbar: 1 });
  const inhalt = db.inhalte({ quelle: 'baustelle' })[0];
  assert.equal(inhalt.status, 'IN_PRUEFUNG'); assert.equal(inhalt.ort, 'Velten'); assert.equal(inhalt.typ, 'vorher_nachher'); assert.equal(inhalt.eingereicht_von, 'Mehmet');
  const medien = db.medien(inhalt.id);
  assert.equal(medien.length, 1); assert.equal(medien[0].pruefung, 'ok'); assert.equal(medien[0].datenschutz, 'ungeprueft');
  assert.ok(fs.existsSync(path.join(dir, medien[0].pfad)));
  assert.deepEqual(fs.readdirSync(path.join(dir, 'medien', String(inhalt.id), 'original')), ['01.jpg'], 'die abgelehnte Datei liegt nicht herum');
  assert.equal((await put(JPEG)).status, 410, 'nach dem Abschluss ist der Upload zu');
});

test('Zentrale: Host-Pruefung, Anmeldung und Rollen', async (t) => {
  const dir = tmpDir(t); const db = testDb(t);
  assert.equal(hostErlaubt('192.168.2.222:8002'), true); assert.equal(hostErlaubt('100.101.102.103:8002'), true);
  assert.equal(hostErlaubt('evil.example'), false); assert.equal(hostErlaubt('mini.tail1.ts.net', ['mini.tail1.ts.net']), true);

  const { id } = db.inhaltAnlegen({ quelle: 'shopify', typ: 'raumidee', titel: 'Raumidee: Amara', produkt_titel: 'Amara Eiche', bodenart: 'Klebevinyl', einwilligung: true, daten: { gruppe: 'Klebevinyl', url: 'https://www.teppich-paradies.net/products/amara', bilder: [{ src: 'https://cdn.shopify.com/a.jpg' }] } });
  const rolle = { wert: 'inhaber' };
  const anmeldung = { noetig: () => true, benutzer: sid => (sid === 'ok' ? { name: 'Test', rolle: rolle.wert } : null), gesperrt: () => false, fehlversuch() {}, erfolg() {}, pruefe: () => null, neueSitzung: () => 'ok', beenden() {} };
  const basis = await starte(t, erstelleZentrale({ db, env: {}, dir, anmeldung, renderer: scheinRendern }));
  const sitzung = ['tp_social_sid', 'ok'].join('=');
  const mit = (init = {}) => ({ ...init, headers: [...Object.entries(init.headers ?? {}), ['cookie', sitzung]] });

  assert.equal((await fetch(`${basis}/api/stand`)).status, 401);
  assert.match(await (await fetch(`${basis}/`)).text(), /Anmeldung mit dem Zugang/);
  assert.equal((await fetch(`${basis}/api/login`, json({ name: 'x', passwort: 'falsch' }))).status, 401);
  assert.equal((await fetch(`${basis}/api/stand`, mit({ headers: { Origin: 'https://evil.example' } }))).status, 403);
  assert.equal((await fetch(`${basis}/upload.html`, mit())).status, 404);
  assert.equal((await fetch(`${basis}/medien/medien/..%2f..%2fsocial.db`, mit())).status, 404);

  const stand = await (await fetch(`${basis}/api/stand`, mit())).json();
  assert.equal(stand.vorrat.length, 1); assert.equal(stand.meta.bereit, false); assert.equal(stand.darfFreigeben, true);

  rolle.wert = 'mitarbeiter';
  assert.equal((await fetch(`${basis}/api/inhalt/${id}/entwurf`, mit(json({})))).status, 403);
  rolle.wert = 'inhaber';
  const entwurf = await (await fetch(`${basis}/api/inhalt/${id}/entwurf`, mit(json({ format: 'feed' })))).json();
  assert.equal(entwurf.beitrag.status, 'FREIGABE'); assert.ok(entwurf.beitrag.geplantAm, 'der Planer schlaegt gleich einen Termin vor');
  const bild = await fetch(`${basis}${entwurf.beitrag.bilder[0]}`, mit());
  assert.equal(bild.status, 200); assert.equal(bild.headers.get('content-type'), 'image/jpeg');

  const b = entwurf.beitrag.id;
  const floskel = await fetch(`${basis}/api/beitrag/${b}/bearbeiten`, mit(json({ text: 'Tauchen Sie ein in die faszinierende Welt der Bodenbeläge bei uns.' })));
  assert.equal(floskel.status, 409);
  const frei = await (await fetch(`${basis}/api/beitrag/${b}/freigeben`, mit(json({})))).json();
  assert.equal(frei.beitrag.status, 'GEPLANT');
  assert.equal(db.beitrag(b).freigabe_von, 'Test');
  assert.equal((await (await fetch(`${basis}/api/beitrag/${b}/zurueck`, mit(json({})))).json()).beitrag.status, 'FREIGABE');
  assert.equal((await (await fetch(`${basis}/api/beitrag/${b}/verwerfen`, mit(json({ grund: 'Test' })))).json()).beitrag.status, 'VERWORFEN');
});

test('Anmeldung: Notpasswort gilt, Sitzung ueberlebt den Neustart, falsches Passwort nicht', (t) => {
  const dir = tmpDir(t); const datei = path.join(dir, 'sitzungen.json');
  const env = { TP_PRIVAT_DIR: dir, TP_DASHBOARD_PASSWORT: 'nur-fuer-den-test' };
  const a = erstelleAnmeldung({ env, datei });
  assert.equal(a.noetig(), true);
  assert.equal(a.pruefe({ passwort: 'falsch' }), null);
  const benutzer = a.pruefe({ passwort: 'nur-fuer-den-test' });
  assert.equal(benutzer.rolle, 'inhaber');
  const sid = a.neueSitzung(benutzer);
  assert.equal(fs.readFileSync(datei, 'utf8').includes(sid), false, 'auf der Platte liegt nur der Hash');
  assert.equal(erstelleAnmeldung({ env, datei }).benutzer(sid).name, 'Inhaber');
  a.beenden(sid);
  assert.equal(erstelleAnmeldung({ env, datei }).benutzer(sid), null);
});

test('Eingangspruefung: HEIC wird gewandelt, Unscharfes und Dubletten fallen heraus, leere Baustellen werden verworfen', (t) => {
  const dir = tmpDir(t); const db = testDb(t);
  const lege = (namen) => {
    const { id } = db.inhaltAnlegen({ quelle: 'baustelle', typ: 'kundenprojekt', titel: 'x', einwilligung: true });
    const ordner = path.join(dir, 'medien', String(id), 'original'); fs.mkdirSync(ordner, { recursive: true });
    namen.forEach((n, i) => { fs.writeFileSync(path.join(ordner, n), 'x'); db.mediumAnlegen(id, { art: n.endsWith('.mp4') ? 'video' : 'bild', pfad: path.join('medien', String(id), 'original', n), reihenfolge: i }); });
    return id;
  };
  const a = lege(['01.heic', '02.jpg', '03.jpg', '04.mp4']); const b = lege(['01.jpg']);
  const werte = { '01.jpg': { schaerfe: 600, dhash: 'aaaaaaaaaaaaaaaa' }, '02.jpg': { schaerfe: 5, dhash: 'bbbbbbbbbbbbbbbb' }, '03.jpg': { schaerfe: 300, dhash: 'aaaaaaaaaaaaaaab' } };
  const gewandelt = [];
  const bericht = verarbeiteEingang(db, {
    dir,
    zuJpeg: (quelle, ziel) => { gewandelt.push(path.basename(quelle)); fs.writeFileSync(ziel, 'jpg'); },
    messe: datei => ({ breite: 3000, hoehe: 4000, helligkeit: 120, ...werte[path.basename(datei)] }),
  });
  assert.deepEqual(gewandelt, ['01.heic']);
  const m = db.medien(a);
  assert.equal(m[0].pfad, path.join('medien', String(a), 'arbeit', '01.jpg')); assert.equal(m[0].pruefung, 'ok');
  assert.equal(m[1].pruefung, 'aussortiert'); assert.match(m[1].pruef_grund, /unscharf/);
  assert.equal(m[2].pruefung, 'dublette');
  assert.equal(m[3].pruefung, 'unsicher'); assert.match(m[3].pruef_grund, /Video/);
  assert.equal(db.inhalt(a).status, 'IN_PRUEFUNG');
  assert.equal(db.inhalt(b).status, 'VERWORFEN', 'das einzige Bild war eine Dublette aus einer anderen Baustelle');
  assert.deepEqual(bericht.map(x => x.brauchbar), [2, 0]);
});

test('Der Takt prueft keinen laufenden Upload; nachgereichte Dateien werden trotzdem erfasst', (t) => {
  const dir = tmpDir(t); const db = testDb(t, () => new Date('2026-10-01T08:00:00Z'));
  const { id } = db.inhaltAnlegen({ quelle: 'baustelle', typ: 'kundenprojekt', titel: 'x', einwilligung: true });
  const lege = (n) => { const rel = path.join('medien', String(id), 'original', n); fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), 'x'); return db.mediumAnlegen(id, { art: 'bild', pfad: rel }); };
  lege('01.jpg');
  const messe = () => ({ breite: 3000, hoehe: 4000, helligkeit: 120, schaerfe: 500, dhash: Math.random().toString(16).slice(2, 18).padEnd(16, '0') });
  assert.equal(verarbeiteEingang(db, { dir, messe, mindestAlterMs: 20 * 60 * 1000, jetzt: new Date('2026-10-01T08:05:00Z') }).length, 0);
  assert.equal(db.inhalt(id).status, 'NEU');
  assert.equal(verarbeiteEingang(db, { dir, messe, mindestAlterMs: 20 * 60 * 1000, jetzt: new Date('2026-10-01T08:30:00Z') }).length, 1);
  assert.equal(db.inhalt(id).status, 'IN_PRUEFUNG');
  const spaet = lege('02.jpg');
  assert.equal(verarbeiteEingang(db, { dir, messe, jetzt: new Date('2026-10-01T09:00:00Z') }).length, 1);
  assert.equal(db.medium(spaet).pruefung, 'ok');
  assert.equal(verarbeiteEingang(db, { dir, messe, jetzt: new Date('2026-10-01T09:30:00Z') }).length, 0, 'nichts Offenes - nichts zu tun');
  const leer = db.inhaltAnlegen({ quelle: 'baustelle', typ: 'kundenprojekt', titel: 'leer', einwilligung: true });
  verarbeiteEingang(db, { dir, messe, jetzt: new Date('2026-10-01T10:00:00Z') });
  assert.equal(db.inhalt(leer.id).notiz, 'Upload ohne Dateien.');
});
