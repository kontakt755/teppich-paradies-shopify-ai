import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createServer, request } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { zugangAnlegen } from '../lib/eingang.mjs';
import { verarbeiteEingang } from '../lib/pruefung.mjs';
import { erstelleAnmeldung, erstelleUpload, erstelleZentrale, hostErlaubt } from '../scripts/server.mjs';
import { setzeAbmeldeStand } from '../../operations/lib/anmeldeschutz.mjs';
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
  // Freier Platz fest vorgegeben: der Test darf nicht davon abhaengen, wie voll die Platte des Rechners ist.
  const basis = await starte(t, erstelleUpload({ db, dir, freierSpeicher: () => 100 * 1024 ** 3, nachUpload: nur => verarbeiteEingang(db, { dir, messe, nur }) }));

  assert.equal((await fetch(`${basis}/u/${'x'.repeat(24)}`)).status, 404);
  assert.equal((await fetch(`${basis}/`)).status, 404);
  const seite = await fetch(`${basis}/u/${token}`);
  assert.equal(seite.status, 200); assert.match(await seite.text(), /Hallo Mehmet/);


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

test('Upload: Tagesmenge je Link ueberlebt den Neustart, fast volle Platte nimmt nichts an', async (t) => {
  const dir = tmpDir(t); const db = testDb(t);
  process.env.TP_SOCIAL_DIR = dir; t.after(() => { delete process.env.TP_SOCIAL_DIR; });
  const { token } = zugangAnlegen('Mehmet');
  const GIB = 1024 ** 3;
  const platz = { frei: 100 * GIB };
  const jetzt = () => Date.parse('2026-10-26T10:00:00Z');
  const neuerDienst = () => starte(t, erstelleUpload({ db, dir, jetzt, freierSpeicher: () => platz.frei, nachUpload: () => [] }));
  const starten = basis => fetch(`${basis}/u/${token}/start`, json({ einwilligung: true }));

  // Heute schon fast 5 GB von diesem Link - so steht es nach einem Neustart in der Datei.
  const zaehler = path.join(dir, 'upload-tageszaehler.json');
  fs.writeFileSync(zaehler, JSON.stringify({ tag: '2026-10-26', je: { Mehmet: { uploads: 3, bytes: 5 * GIB - 100 } } }));
  let basis = await neuerDienst();
  const start = await (await starten(basis)).json();
  const zuGross = await fetch(`${basis}/u/${token}/datei/${start.upload}`, { method: 'PUT', body: JPEG });
  assert.equal(zuGross.status, 429, 'die Datei passt nicht mehr in die Tagesmenge');
  assert.match((await zuGross.json()).error, /genug hochgeladen/);
  assert.equal(JSON.parse(fs.readFileSync(zaehler, 'utf8')).je.Mehmet.uploads, 4, 'der Start zaehlt mit');

  // Neuer Dienst (Neustart), gleiche Datei: die Grenze gilt weiter.
  fs.writeFileSync(zaehler, JSON.stringify({ tag: '2026-10-26', je: { Mehmet: { uploads: 4, bytes: 5 * GIB } } }));
  basis = await neuerDienst();
  assert.equal((await starten(basis)).status, 429);
  // Ein neuer Tag beginnt bei null.
  fs.writeFileSync(zaehler, JSON.stringify({ tag: '2026-10-25', je: { Mehmet: { uploads: 30, bytes: 9 * GIB } } }));
  const frisch = await starten(basis);
  assert.equal(frisch.status, 200);
  const { upload } = await frisch.json();
  assert.equal((await fetch(`${basis}/u/${token}/datei/${upload}`, { method: 'PUT', body: JPEG })).status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(zaehler, 'utf8')), { tag: '2026-10-26', je: { Mehmet: { uploads: 1, bytes: JPEG.length } } });

  // Unter 15 GiB frei: weder Start noch Datei.
  platz.frei = 15 * GIB - 1;
  const voll = await fetch(`${basis}/u/${token}/datei/${upload}`, { method: 'PUT', body: JPEG });
  assert.equal(voll.status, 507);
  assert.match((await voll.json()).error, /Speicher im Büro/);
  assert.equal((await starten(basis)).status, 507);
  // Knapp ueber der Grenze: eine Datei, die den Rest sprengen wuerde, wird abgebrochen und nicht abgelegt.
  platz.frei = 15 * GIB + 100;
  const knapp = await fetch(`${basis}/u/${token}/datei/${upload}`, { method: 'PUT', body: JPEG });
  assert.equal(knapp.status, 507);
  // Nicht messbar (null): dann entscheidet nur die Tagesmenge.
  platz.frei = null;
  assert.equal((await fetch(`${basis}/u/${token}/datei/${upload}`, { method: 'PUT', body: JPEG })).status, 200);
});

test('Upload: gleichzeitige Sendungen teilen sich Tagesmenge, Speicherreserve und Startzahl', async (t) => {
  const dir = tmpDir(t); const db = testDb(t);
  process.env.TP_SOCIAL_DIR = dir; t.after(() => { delete process.env.TP_SOCIAL_DIR; });
  const mehmet = zugangAnlegen('Mehmet').token; const ali = zugangAnlegen('Ali').token;
  const GIB = 1024 ** 3; const L = JPEG.length;
  const platz = { frei: 100 * GIB };
  const zaehler = path.join(dir, 'upload-tageszaehler.json');
  const setzeZaehler = je => fs.writeFileSync(zaehler, JSON.stringify({ tag: '2026-10-26', je }));
  const upload = erstelleUpload({ db, dir, jetzt: () => Date.parse('2026-10-26T10:00:00Z'), freierSpeicher: () => platz.frei, nachUpload: () => [] });
  // Meldet, wenn der Dienst eine Anfrage angenommen hat (sein synchroner Teil ist dann gelaufen).
  let angenommen = () => {};
  const basis = await starte(t, (req, res) => { angenommen(); return upload(req, res); });
  const starten = async token => (await (await fetch(`${basis}/u/${token}/start`, json({ einwilligung: true }))).json()).upload;
  const put = (token, id) => fetch(`${basis}/u/${token}/datei/${id}`, { method: 'PUT', body: JPEG });
  // Schickt die Kopfzeilen sofort, den Koerper erst auf weiter(): so laeuft die Sendung noch, waehrend die zweite kommt.
  async function haengend(pfad, methode, koerper, kopf = {}) {
    const da = new Promise(r => { angenommen = r; });
    const anfrage = request(`${basis}${pfad}`, { method: methode, agent: false, headers: { 'Content-Length': koerper.length, ...kopf } });
    t.after(() => anfrage.destroy());   // bricht ein roter Test vor weiter() ab, haelt die offene Sendung sonst den Lauf fest
    const antwort = new Promise((ok, fehler) => {
      anfrage.on('error', fehler);
      anfrage.on('response', r => { let s = ''; r.on('data', d => { s += d; }); r.on('end', () => ok({ status: r.statusCode, text: s })); });
    });
    anfrage.flushHeaders();
    await da; angenommen = () => {};
    return { weiter: () => { anfrage.end(koerper); return antwort; } };
  }

  // Tagesmenge: noch Platz fuer anderthalb Dateien. Zwei gleichzeitige Dateien desselben Links passen nicht beide.
  setzeZaehler({ Mehmet: { uploads: 3, bytes: 5 * GIB - Math.floor(1.5 * L) } });
  const [a, b] = [await starten(mehmet), await starten(mehmet)];
  const erste = await haengend(`/u/${mehmet}/datei/${a}`, 'PUT', JPEG);
  const zweite = await put(mehmet, b);
  assert.equal(zweite.status, 429, 'die laufende erste Datei haelt ihren Anteil an der Tagesmenge fest');
  assert.equal((await erste.weiter()).status, 200);
  assert.ok(JSON.parse(fs.readFileSync(zaehler, 'utf8')).je.Mehmet.bytes <= 5 * GIB, 'die Tagesmenge ist nicht ueberschritten');

  // Speicherreserve (fuer alle Links gemeinsam): noch Platz fuer anderthalb Dateien ueber 15 GiB.
  setzeZaehler({});
  platz.frei = 15 * GIB + Math.floor(1.5 * L);
  const [c, d] = [await starten(ali), await starten(mehmet)];
  const dritte = await haengend(`/u/${ali}/datei/${c}`, 'PUT', JPEG);
  const vierte = await put(mehmet, d);
  assert.equal(vierte.status, 507, 'die laufende Datei eines anderen Links zaehlt gegen den freien Platz');
  assert.equal((await dritte.weiter()).status, 200);
  // Nach dem Ende gibt die Sendung ihren Anteil wieder frei (der Ersatz misst hier nicht nach).
  assert.equal((await put(mehmet, d)).status, 200, 'kein Anteil bleibt haengen');

  // Startzahl: beim 30. Upload des Tages kommen zwei gleichzeitige Starts nicht beide durch.
  platz.frei = 100 * GIB;
  setzeZaehler({ Mehmet: { uploads: 29, bytes: 0 } });
  const koerper = Buffer.from(JSON.stringify({ einwilligung: true }));
  const fuenfte = await haengend(`/u/${mehmet}/start`, 'POST', koerper, { 'Content-Type': 'application/json' });
  assert.equal((await fetch(`${basis}/u/${mehmet}/start`, json({ einwilligung: true }))).status, 200);
  assert.equal((await fuenfte.weiter()).status, 429, 'der zweite Start sieht den ersten');
  assert.equal(JSON.parse(fs.readFileSync(zaehler, 'utf8')).je.Mehmet.uploads, 30);
});

// Codex-Review #1726 (P2): gelesen ist nicht geschrieben. Haengt die Platte, steht die erste
// Datei schon ganz im Strom, aber noch nicht auf der Platte - ihr Anteil muss bis dahin gelten.
test('Upload: Speicherreserve gilt, bis die Platte die Bytes wirklich abgelegt hat', async (t) => {
  const dir = tmpDir(t); const db = testDb(t);
  process.env.TP_SOCIAL_DIR = dir; t.after(() => { delete process.env.TP_SOCIAL_DIR; });
  const mehmet = zugangAnlegen('Mehmet').token; const ali = zugangAnlegen('Ali').token;
  const GIB = 1024 ** 3; const L = JPEG.length;
  // Der Ersatz misst nicht nach: der freie Platz sinkt erst, wenn jemand ihn senkt.
  const platz = { frei: 15 * GIB + Math.floor(1.5 * L) };
  let freigeben; const tor = new Promise(r => { freigeben = r; });
  t.after(() => freigeben());   // ein roter Test darf die haengende Datei nicht offen lassen
  let meldeSchreiben; const schreibtGerade = new Promise(r => { meldeSchreiben = r; });
  let erster = true;
  // Die erste Datei bleibt beim Schreiben haengen, bis das Tor aufgeht (langsame Platte).
  const oeffneZiel = (ziel) => {
    const ws = fs.createWriteStream(ziel, { mode: 0o600 });
    if (!erster) return ws;
    erster = false;
    const schreibe = ws._write.bind(ws);
    ws._write = (stueck, kodierung, fertig) => { meldeSchreiben(); tor.then(() => schreibe(stueck, kodierung, fertig)); };
    return ws;
  };
  const basis = await starte(t, erstelleUpload({ db, dir, jetzt: () => Date.parse('2026-10-26T10:00:00Z'), freierSpeicher: () => platz.frei, nachUpload: () => [], oeffneZiel }));
  const starten = async token => (await (await fetch(`${basis}/u/${token}/start`, json({ einwilligung: true }))).json()).upload;
  const [a, b] = [await starten(ali), await starten(mehmet)];
  const erste = fetch(`${basis}/u/${ali}/datei/${a}`, { method: 'PUT', body: JPEG });
  await schreibtGerade;
  const zweite = await fetch(`${basis}/u/${mehmet}/datei/${b}`, { method: 'PUT', body: JPEG });
  assert.equal(zweite.status, 507, 'die erste Datei ist gelesen, aber noch nicht geschrieben - ihr Anteil gilt weiter');
  freigeben();
  assert.equal((await erste).status, 200);
  assert.equal((await fetch(`${basis}/u/${mehmet}/datei/${b}`, { method: 'PUT', body: JPEG })).status, 200, 'nach dem Schreiben ist der Anteil frei');
});

// Codex-Review #1726 (P2): eine Datei, die vor Mitternacht beginnt und danach fertig wird,
// darf den Zaehler des neuen Tages nicht durch den alten ersetzen.
test('Upload: Datei ueber Mitternacht zaehlt in den neuen Tag, ohne ihn zu ueberschreiben', async (t) => {
  const dir = tmpDir(t); const db = testDb(t);
  process.env.TP_SOCIAL_DIR = dir; t.after(() => { delete process.env.TP_SOCIAL_DIR; });
  const { token } = zugangAnlegen('Mehmet');
  const L = JPEG.length;
  const uhr = { jetzt: Date.parse('2026-10-26T23:59:00Z') };
  const zaehler = path.join(dir, 'upload-tageszaehler.json');
  const upload = erstelleUpload({ db, dir, jetzt: () => uhr.jetzt, freierSpeicher: () => 100 * 1024 ** 3, nachUpload: () => [] });
  let angenommen = () => {};
  const basis = await starte(t, (req, res) => { angenommen(); return upload(req, res); });
  const starten = async () => (await (await fetch(`${basis}/u/${token}/start`, json({ einwilligung: true }))).json()).upload;

  // 23:59: Upload beginnt, die Datei kommt ueber langsames Netz (Koerper erst nach Mitternacht).
  const a = await starten();
  const da = new Promise(r => { angenommen = r; });
  const anfrage = request(`${basis}/u/${token}/datei/${a}`, { method: 'PUT', agent: false, headers: { 'Content-Length': L } });
  t.after(() => anfrage.destroy());
  const antwort = new Promise((ok, fehler) => { anfrage.on('error', fehler); anfrage.on('response', r => { r.resume(); r.on('end', () => ok(r.statusCode)); }); });
  anfrage.flushHeaders();
  await da; angenommen = () => {};

  // 00:01: derselbe Link schickt am neuen Tag einen zweiten Upload.
  uhr.jetzt = Date.parse('2026-10-27T00:01:00Z');
  const b = await starten();
  assert.equal((await fetch(`${basis}/u/${token}/datei/${b}`, { method: 'PUT', body: JPEG })).status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(zaehler, 'utf8')), { tag: '2026-10-27', je: { Mehmet: { uploads: 1, bytes: L } } });

  // Jetzt wird die Datei von 23:59 fertig: sie zaehlt in den Tag, der gerade gilt.
  anfrage.end(JPEG);
  assert.equal(await antwort, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(zaehler, 'utf8')), { tag: '2026-10-27', je: { Mehmet: { uploads: 1, bytes: 2 * L } } }, 'der neue Tag bleibt stehen');
});

test('Upload: ein abgelaufener Link fuehrt nirgends mehr hin', async (t) => {
  const dir = tmpDir(t); const db = testDb(t);
  process.env.TP_SOCIAL_DIR = dir; t.after(() => { delete process.env.TP_SOCIAL_DIR; });
  const { token, ablauf } = zugangAnlegen('Mehmet', { jetzt: new Date('2026-04-01T08:00:00Z') });
  assert.equal(ablauf, '2026-09-28T08:00:00.000Z', '180 Tage');
  const vorher = await starte(t, erstelleUpload({ db, dir, jetzt: () => Date.parse('2026-09-28T07:59:00Z'), freierSpeicher: () => null, nachUpload: () => [] }));
  assert.equal((await fetch(`${vorher}/u/${token}`)).status, 200);
  const danach = await starte(t, erstelleUpload({ db, dir, jetzt: () => Date.parse('2026-09-28T08:00:00Z'), freierSpeicher: () => null, nachUpload: () => [] }));
  const seite = await fetch(`${danach}/u/${token}`);
  assert.equal(seite.status, 404);
  assert.match(await seite.text(), /nicht \(mehr\) gültig/);
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

  // Videos: Safari verlangt Teilabrufe
  fs.mkdirSync(path.join(dir, 'medien', '9'), { recursive: true }); fs.writeFileSync(path.join(dir, 'medien', '9', 'reel.mp4'), Buffer.from('0123456789'));
  const teil = await fetch(`${basis}/medien/medien/9/reel.mp4`, mit({ headers: { Range: 'bytes=2-5' } }));
  assert.equal(teil.status, 206); assert.equal(teil.headers.get('content-range'), 'bytes 2-5/10'); assert.equal(teil.headers.get('content-type'), 'video/mp4');
  assert.equal(await teil.text(), '2345');
  assert.equal(await (await fetch(`${basis}/medien/medien/9/reel.mp4`, mit({ headers: { Range: 'bytes=-3' } }))).text(), '789');
  assert.equal((await fetch(`${basis}/medien/medien/9/reel.mp4`, mit({ headers: { Range: 'bytes=20-' } }))).status, 416);
  const ganz = await fetch(`${basis}/medien/medien/9/reel.mp4`, mit());
  assert.equal(ganz.status, 200); assert.equal(ganz.headers.get('accept-ranges'), 'bytes');

  const stand = await (await fetch(`${basis}/api/stand`, mit())).json();
  assert.equal(stand.vorrat.length, 1); assert.equal(stand.meta.bereit, false); assert.equal(stand.darfFreigeben, true);

  rolle.wert = 'mitarbeiter';
  assert.equal((await fetch(`${basis}/api/inhalt/${id}/entwurf`, mit(json({})))).status, 403);
  assert.equal((await fetch(`${basis}/api/inhalt/${id}/einwilligung`, mit(json({})))).status, 403);
  rolle.wert = 'inhaber';
  db.inhaltAendern(id, { einwilligung: false });
  assert.equal((await (await fetch(`${basis}/api/stand`, mit())).json()).vorrat[0].einwilligung, false);
  assert.equal((await fetch(`${basis}/api/inhalt/${id}/einwilligung`, mit(json({})))).status, 200);
  assert.equal(db.inhalt(id).einwilligung, 1);
  assert.equal((await fetch(`${basis}/api/inhalt/999/einwilligung`, mit(json({})))).status, 404);
  rolle.wert = 'mitarbeiter';
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

test('Anmeldung: neues Passwort und "Alle anderen Geraete abmelden" beenden Notzugang-Sitzungen (Rundgang 26.10.)', (t) => {
  const dir = tmpDir(t); const datei = path.join(dir, 'sitzungen.json');
  let jetzt = Date.parse('2026-10-26T08:00:00Z');
  const uhr = () => jetzt;
  const env = { TP_PRIVAT_DIR: dir, TP_DASHBOARD_PASSWORT: 'nur-fuer-den-test' };
  const a = erstelleAnmeldung({ env, datei, jetzt: uhr });
  const sid = a.neueSitzung(a.pruefe({ passwort: 'nur-fuer-den-test' }));
  assert.equal(fs.readFileSync(datei, 'utf8').includes('nur-fuer-den-test'), false, 'das Passwort steht nie in der Datei');
  assert.equal(erstelleAnmeldung({ env, datei, jetzt: uhr }).benutzer(sid).name, 'Inhaber');
  assert.equal(erstelleAnmeldung({ env: { ...env, TP_DASHBOARD_PASSWORT: 'neues-test-passwort' }, datei, jetzt: uhr }).benutzer(sid), null, 'neues Passwort: abgemeldet');

  // Alte Sitzung ohne Abdruck uebernimmt das jetzige Passwort.
  const altSid = 'b'.repeat(43);
  const hash = crypto.createHash('sha256').update(altSid).digest('hex');
  fs.writeFileSync(datei, JSON.stringify({ sitzungen: { [hash]: { benutzer: { name: 'Inhaber', kuerzel: null, rolle: 'inhaber' }, bis: jetzt + 86_400_000 } } }));
  const b = erstelleAnmeldung({ env, datei, jetzt: uhr });
  assert.equal(b.benutzer(altSid).name, 'Inhaber', 'niemand wird durch das Update abgemeldet');

  // "Alle anderen Geraete abmelden" im Control Center: alles davor Angemeldete endet, Neues gilt.
  const vorher = b.neueSitzung(b.pruefe({ passwort: 'nur-fuer-den-test' }));
  jetzt += 60_000;
  setzeAbmeldeStand(dir, jetzt);
  jetzt += 60_000;
  assert.equal(b.benutzer(vorher), null);
  assert.equal(b.benutzer(altSid), null);
  const nachher = b.neueSitzung(b.pruefe({ passwort: 'nur-fuer-den-test' }));
  assert.equal(b.benutzer(nachher).name, 'Inhaber');
  assert.equal(erstelleAnmeldung({ env, datei, jetzt: uhr }).benutzer(vorher), null, 'auch nach einem Neustart');
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
