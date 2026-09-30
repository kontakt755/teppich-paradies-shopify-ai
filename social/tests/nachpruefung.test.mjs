// Faelle aus dem unabhaengigen Review vom 2026-09-30: jeder Test haelt ein
// Verhalten fest, das zuvor falsch war.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { planeOffene, shopAbgleich, veroeffentlicheFaellige } from '../lib/ablauf.mjs';
import { bereinigeOrt, erkenneTyp, zugangAnlegen } from '../lib/eingang.mjs';
import { freigeben, holeGeplanteZurueck } from '../lib/freigabe.mjs';
import { erstelleClient } from '../lib/meta.mjs';
import { verarbeiteEingang } from '../lib/pruefung.mjs';
import { grundtext } from '../lib/texte.mjs';
import { erstelleAnmeldung, erstelleUpload, erstelleZentrale } from '../scripts/server.mjs';
import { feedProdukt, testDb, tmpDir } from './_hilfe.mjs';

const JETZT = new Date('2026-10-01T08:00:00Z');

/** Meta-Ersatz mit einstellbarem Verhalten je Pfad. */
function scheinMeta({ bei = {}, verzoegerung = 0 } = {}) {
  const posts = []; let n = 0;
  const holen = async (url, init) => {
    const u = new URL(url); const pfad = u.pathname.replace(/^\/v[\d.]+/, '');
    if (init.method === 'POST') posts.push(pfad);
    if (verzoegerung) await new Promise(r => setTimeout(r, verzoegerung));
    if (bei[pfad]) return bei[pfad]();
    const ok = d => ({ ok: true, status: 200, json: async () => d });
    if (init.method === 'GET') return ok({ images: [{ source: 'https://cdn.fb/a.jpg', width: 1080 }], status_code: 'FINISHED', permalink: 'p', permalink_url: 'p' });
    n += 1; return ok({ id: `id${n}`, post_id: `post${n}` });
  };
  return { holen, posts };
}
const client = meta => erstelleClient({ token: 't', pageId: 'PAGE', igUserId: 'IG', holen: meta.holen, pause: async () => {} });

function geplanterBeitrag(db, dir, { quelle = 'shopify', plattformen = ['facebook', 'instagram'] } = {}) {
  const { id } = db.inhaltAnlegen({ quelle, typ: quelle === 'shopify' ? 'raumidee' : 'kundenprojekt', titel: 'T', einwilligung: true, daten: { ortBekannt: true } });
  const m = db.mediumAnlegen(id, { art: 'bild', pfad: `medien/${id}/original/01.jpg`, pruefung: 'ok', datenschutz: 'ok' });
  db.inhaltAendern(id, { status: 'IN_PRUEFUNG' }); db.inhaltAendern(id, { status: 'CONTENT_ERSTELLT' });
  const rel = path.join('medien', String(id), 'beitrag-1', '01.jpg');
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), 'jpg');
  const b = db.beitragAnlegen({ inhalt_id: id, format: 'feed', plattformen, text: 'Hier haben wir einen neuen Boden verlegt. Wir beraten, messen auf und verlegen.', hashtags: '#a', medien: [{ pfad: rel, art: 'bild', quellen: [m] }], geplant_am: '2026-10-01T07:00:00.000Z' });
  freigeben(db, b, { von: 'Test' });
  return { id, m, b };
}

test('Zwei gleichzeitige Laeufe: genau einer veroeffentlicht', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const { b } = geplanterBeitrag(db, dir);
  const meta = scheinMeta({ verzoegerung: 5 });
  const lauf = () => veroeffentlicheFaellige(db, { client: client(meta), jetzt: JETZT, dir });
  const [eins, zwei] = await Promise.all([lauf(), lauf()]);
  assert.equal(eins.veroeffentlicht.length + zwei.veroeffentlicht.length, 1);
  assert.equal(meta.posts.filter(p => p === '/PAGE/feed').length, 1);
  assert.equal(meta.posts.filter(p => p === '/IG/media_publish').length, 1);
  assert.equal(db.beitrag(b).status, 'VEROEFFENTLICHT');
});

test('Waehrend des Veroeffentlichens ist der Beitrag fuer die Zentrale gesperrt', (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const { b } = geplanterBeitrag(db, dir);
  assert.equal(db.beanspruche(b), true);
  assert.equal(db.beanspruche(b), false, 'ein zweites Mal geht nicht');
  assert.throws(() => db.beitragAendern(b, { status: 'VERWORFEN' }), /nicht vorgesehen/);
  assert.equal(db.uebersicht().geplant.length, 1, 'bleibt in der Planansicht sichtbar');
});

test('Eine Freigabe von gestern gilt nicht, wenn heute ein Bild Bedenken bekommt', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const { m, b } = geplanterBeitrag(db, dir, { quelle: 'baustelle' });
  db.mediumAendern(m, { datenschutz: 'bedenken', datenschutz_notiz: 'Kunde hat widerrufen' });
  const meta = scheinMeta();
  const r = await veroeffentlicheFaellige(db, { client: client(meta), jetzt: JETZT, dir });
  assert.deepEqual(r.zurueck, [b]); assert.equal(meta.posts.length, 0, 'kein einziger Aufruf an Meta');
  assert.equal(db.beitrag(b).status, 'FREIGABE'); assert.match(db.beitrag(b).fehler, /Kunde hat widerrufen/);
});

test('Verworfenes Material wird nicht veroeffentlicht und sofort zurueckgeholt', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const a = geplanterBeitrag(db, dir);
  db.inhaltAendern(a.id, { status: 'VERWORFEN' });
  const meta = scheinMeta();
  await veroeffentlicheFaellige(db, { client: client(meta), jetzt: JETZT, dir });
  assert.equal(meta.posts.length, 0); assert.equal(db.beitrag(a.b).status, 'FREIGABE');
  const c = geplanterBeitrag(db, dir);
  assert.deepEqual(holeGeplanteZurueck(db, c.id, 'Das Material wurde verworfen.'), [c.b]);
  assert.equal(db.beitrag(c.b).status, 'FREIGABE');
});

test('Unklarer Fehler beim Veroeffentlichen wird nie automatisch wiederholt', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const { b } = geplanterBeitrag(db, dir, { plattformen: ['facebook'] });
  const meta = scheinMeta({ bei: { '/PAGE/feed': () => { throw new Error('socket hang up'); } } });
  const r = await veroeffentlicheFaellige(db, { client: client(meta), jetzt: JETZT, dir });
  assert.equal(r.fehler[0].endgueltig, true);
  assert.equal(db.beitrag(b).status, 'FEHLER'); assert.match(db.beitrag(b).fehler, /Unklar, ob der Beitrag erschienen ist/);
  await veroeffentlicheFaellige(db, { client: client(meta), jetzt: JETZT, dir });
  assert.equal(meta.posts.filter(p => p === '/PAGE/feed').length, 1, 'kein zweiter Versuch');
});

test('Teilerfolg wird sofort gespeichert; ein haengender Lauf endet als Fehler zur Sichtpruefung', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const { b } = geplanterBeitrag(db, dir);
  const gespeichert = [];
  const meta = scheinMeta({ bei: { '/IG/media_publish': () => { gespeichert.push(db.beitrag(b).ergebnis); return { ok: false, status: 400, json: async () => ({ error: { code: 100, message: 'kaputt' } }) }; } } });
  await veroeffentlicheFaellige(db, { client: client(meta), jetzt: JETZT, dir });
  assert.ok(gespeichert[0]?.facebook?.id, 'Facebook stand schon in der Datenbank, als Instagram scheiterte');

  const c = geplanterBeitrag(db, dir);
  db.beanspruche(c.b);   // ein Lauf, der danach gestorben ist
  const spaeter = new Date(JETZT.getTime() + 30 * 60 * 1000);
  const dbSpaeter = veroeffentlicheFaellige(db, { client: client(scheinMeta()), jetzt: spaeter, dir });
  // Die Test-DB stempelt `aktualisiert` mit fester Uhr (08:00Z) - 30 Minuten spaeter gilt der Beitrag als haengend.
  const r = await dbSpaeter;
  assert.equal(db.beitrag(c.b).status, 'FEHLER'); assert.match(db.beitrag(c.b).fehler, /unterbrochen/);
  assert.ok(r.fehler.some(f => f.id === c.b));
});

test('Ortserkennung: der Strassenname ist kein Ort', () => {
  assert.equal(bereinigeOrt('Oranienburger Str. 10, Velten').ort, 'Velten');
  assert.equal(bereinigeOrt('Berliner Straße 3, Nauen').ort, 'Nauen');
  assert.equal(bereinigeOrt('Germendorfer Allee 3, Velten').ort, 'Velten');
  assert.deepEqual(bereinigeOrt('Oranienburger Str. 10'), { ort: null, bekannt: false, verworfen: true });
  assert.equal(bereinigeOrt('Oranienburg').ort, 'Oranienburg');
  assert.equal(bereinigeOrt('in Hohen Neuendorf').ort, 'Hohen Neuendorf');
  assert.equal(erkenneTyp(Buffer.concat([Buffer.from([0, 0, 0, 28]), Buffer.from('ftypavif')])), null);
});

test('Notfalltext nennt keinen Ort, den wir nicht kennen', () => {
  const t = grundtext({ quelle: 'baustelle', typ: 'kundenprojekt', ort: 'bei Familie Schulze', bodenart: 'Klebevinyl', daten: { ortBekannt: false } });
  assert.match(t, /^Bei diesem Projekt haben wir Klebevinyl verlegt\./);
  assert.equal(t.includes('Schulze'), false);
});

test('Nachgereichte Datei belebt eine als leer verworfene Baustelle wieder', (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const { id } = db.inhaltAnlegen({ quelle: 'baustelle', typ: 'kundenprojekt', titel: 'x', einwilligung: true });
  const messe = () => ({ breite: 3000, hoehe: 4000, helligkeit: 120, schaerfe: 500, dhash: 'abcdef0123456789' });
  verarbeiteEingang(db, { dir, messe });
  assert.equal(db.inhalt(id).status, 'VERWORFEN');
  const rel = path.join('medien', String(id), 'original', '01.jpg');
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), 'x');
  db.mediumAnlegen(id, { art: 'bild', pfad: rel });
  const bericht = verarbeiteEingang(db, { dir, messe, nur: id });
  assert.equal(bericht[0].brauchbar, 1); assert.equal(db.inhalt(id).status, 'IN_PRUEFUNG'); assert.equal(db.inhalt(id).notiz, null);
});

test('Planer zaehlt mit, was diese Woche schon erschienen ist', async (t) => {
  const db = testDb(t, () => new Date('2026-09-29T17:00:00Z')); const dir = tmpDir(t);
  const angebot = (titel) => {
    const { id } = db.inhaltAnlegen({ quelle: 'shopify', typ: 'angebot', titel, einwilligung: true });
    return db.beitragAnlegen({ inhalt_id: id, format: 'feed', plattformen: ['instagram'], text: 'x', medien: [] });
  };
  const erstes = angebot('A');
  db.beitragAendern(erstes, { status: 'GEPLANT' }); db.beitragAendern(erstes, { status: 'IN_ARBEIT' });
  db.beitragAendern(erstes, { status: 'VEROEFFENTLICHT', veroeffentlicht_am: new Date(2026, 8, 29, 18, 0).toISOString() });   // Dienstag
  const zweites = angebot('B');
  planeOffene(db, { jetzt: new Date(2026, 8, 30, 14, 0), dir });   // Mittwoch derselben Woche
  const termin = new Date(db.beitrag(zweites).geplant_am);
  assert.ok(termin >= new Date(2026, 9, 5), `zweites Angebot erst in der Folgewoche, war ${termin.toDateString()}`);
});

test('Shop-Scout: kein zweiter Anlass zum Monatswechsel, neue Farbe geht nicht verloren', async (t) => {
  const db = testDb(t, () => new Date('2026-09-30T05:00:00Z'));
  const roh = [feedProdukt()];
  const opt = { roh, preise: new Map(), nachfrage: new Map() };
  assert.equal((await shopAbgleich(db, { ...opt, jetzt: new Date('2026-09-30T05:00:00Z') })).neu.length, 1);
  assert.equal((await shopAbgleich(db, { ...opt, jetzt: new Date('2026-10-01T05:00:00Z') })).neu.length, 0, 'derselbe Anlass im neuen Monat');

  // Neue Farbe, aber der Anlass kommt nicht durch (Familie wurde eben erst angelegt):
  const mitFarbe = extra => feedProdukt({ title: 'Regalia Teppichboden', handle: 'regalia', product_type: 'Teppichboden', options: [{ name: 'Farbe', position: 1, values: extra }] });
  await shopAbgleich(db, { roh: [mitFarbe(['Grau', 'Beige'])], preise: new Map(), nachfrage: new Map(), jetzt: new Date('2026-10-01T05:00:00Z') });
  assert.deepEqual(db.produktStand().get('regalia').farben, ['Grau', 'Beige']);
  db.sql.exec("UPDATE inhalt SET typ = 'produkt_farben' WHERE produkt_handle = 'regalia'");   // sperrt den Farb-Anlass fuer die Ruhezeit
  await shopAbgleich(db, { roh: [mitFarbe(['Grau', 'Beige', 'Gold'])], preise: new Map(), nachfrage: new Map(), jetzt: new Date('2026-10-02T05:00:00Z') });
  assert.deepEqual(db.produktStand().get('regalia').farben, ['Grau', 'Beige'], 'Gold bleibt "neu", bis daraus ein Anlass wurde');
});

async function starte(t, handler) {
  const server = createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test('Upload: falsche Links sperren den richtigen nicht; zwei Sendungen zugleich gibt es nicht', async (t) => {
  const dir = tmpDir(t); const db = testDb(t);
  process.env.TP_SOCIAL_DIR = dir; t.after(() => { delete process.env.TP_SOCIAL_DIR; });
  const { token } = zugangAnlegen('Mehmet');
  const basis = await starte(t, erstelleUpload({ db, dir, nachUpload: () => [] }));
  for (let i = 0; i < 15; i += 1) assert.equal((await fetch(`${basis}/u/${'y'.repeat(24)}`)).status, 404);
  assert.equal((await fetch(`${basis}/u/${token}`)).status, 200);

  const start = await (await fetch(`${basis}/u/${token}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ einwilligung: true }) })).json();
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300_000, 7)]);
  // Ein langsamer und ein schneller PUT auf denselben Upload.
  let weiter; const warte = new Promise((r) => { weiter = r; });
  const langsam = new ReadableStream({ async start(c) { c.enqueue(jpeg.subarray(0, 1000)); await warte; c.enqueue(jpeg.subarray(1000)); c.close(); } });
  const erster = fetch(`${basis}/u/${token}/datei/${start.upload}`, { method: 'PUT', body: langsam, duplex: 'half' });
  await new Promise(r => setTimeout(r, 80));
  const zweiter = await fetch(`${basis}/u/${token}/datei/${start.upload}`, { method: 'PUT', body: jpeg.subarray(0, 204) });
  assert.equal(zweiter.status, 409);
  weiter();
  assert.equal((await erster).status, 200);
  const ordner = path.join(dir, 'medien', '1', 'original');
  assert.deepEqual(fs.readdirSync(ordner), ['01.jpg']);
  assert.equal(fs.statSync(path.join(ordner, '01.jpg')).size, jpeg.length);
  assert.equal(db.medien(1)[0].bytes, jpeg.length);
});

test('Zentrale: Anmeldeseite bekommt ihr Stylesheet, Raten ueber wechselnde Namen wird gebremst, Rollen gelten sofort', async (t) => {
  const dir = tmpDir(t); const db = testDb(t);
  const env = { TP_PRIVAT_DIR: dir, TP_DASHBOARD_PASSWORT: 'nur-fuer-den-test' };
  const anmeldung = erstelleAnmeldung({ env, datei: path.join(dir, 's.json') });
  const basis = await starte(t, erstelleZentrale({ db, env, dir, anmeldung }));
  const css = await fetch(`${basis}/zentrale.css`);
  assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
  const versuch = name => fetch(`${basis}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, passwort: 'falsch' }) });
  const codes = [];
  for (let i = 0; i < 7; i += 1) codes.push((await versuch(`name${i}`)).status);
  assert.deepEqual(codes.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.equal(codes[6], 429, 'nach fuenf Fehlversuchen von derselben Adresse ist Schluss - egal unter welchem Namen');

  // Rolle frisch je Zugriff: eine Sitzung mit Kuerzel, dessen Benutzer es nicht (mehr) gibt, ist ungueltig.
  const frisch = erstelleAnmeldung({ env, datei: path.join(dir, 's2.json') });
  const sid = frisch.neueSitzung({ name: 'Ehemalig', kuerzel: 'ex', rolle: 'inhaber' });
  assert.equal(frisch.benutzer(sid), null);
  const not = frisch.neueSitzung({ name: 'Inhaber', kuerzel: null, rolle: 'inhaber' });
  assert.equal(frisch.benutzer(not).rolle, 'inhaber');
});
