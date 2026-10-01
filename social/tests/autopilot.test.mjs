import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ersetzeBild } from '../lib/bearbeitung.mjs';
import { autoFreigabeMoeglich, freigebenAutomatisch } from '../lib/freigabe.mjs';
import { testDb, tmpDir } from './_hilfe.mjs';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const TEXT = 'Neuer Teppichboden im Flur, sauber an die Treppe angeschlossen. Im Shop ansehen.';

function baustelle(db, { einwilligung = true, datenschutz = 'ok', quelle = 'baustelle', typ = 'kundenprojekt' } = {}) {
  const { id } = db.inhaltAnlegen({ quelle, typ, titel: 'x', einwilligung, daten: { ortBekannt: false } });
  const m = db.mediumAnlegen(id, { art: 'bild', pfad: `medien/${id}/a.jpg`, pruefung: 'ok', datenschutz });
  const b = db.beitragAnlegen({ inhalt_id: id, format: 'karussell', plattformen: ['instagram', 'facebook'], text: TEXT, hashtags: '#a #b #c', medien: [{ pfad: 'x.jpg', art: 'bild', quellen: [m] }], geplant_am: '2026-10-05T16:00:00.000Z' });
  return { inhalt: db.inhalt(id), beitrag: db.beitrag(b), medien: db.medien(id) };
}

test('Stufe 1 nur Shop ohne Preisrisiko, Stufe 2 auch eigene Fotos - nie Angebote, nie ohne Einwilligung oder Sichtung', (t) => {
  const db = testDb(t);
  const shop = (typ) => ({ inhalt: { quelle: 'shopify', typ }, beitrag: { format: 'feed', text: TEXT, hashtags: '' }, medien: [] });
  assert.equal(autoFreigabeMoeglich(shop('produkt_neu'), { SOCIAL_AUTO_FREIGABE: '1' }), true);
  assert.equal(autoFreigabeMoeglich(shop('angebot'), { SOCIAL_AUTO_FREIGABE: '2' }), false, 'Angebote immer mit Mensch');
  assert.equal(autoFreigabeMoeglich(shop('produkt_neu'), {}), false, 'ohne Einstellung aus');
  const gut = baustelle(db);
  assert.equal(autoFreigabeMoeglich(gut, { SOCIAL_AUTO_FREIGABE: '1' }), false, 'Stufe 1: keine Baustellen');
  assert.equal(autoFreigabeMoeglich(gut, { SOCIAL_AUTO_FREIGABE: '2' }), true);
  assert.equal(autoFreigabeMoeglich(baustelle(db, { einwilligung: false }), { SOCIAL_AUTO_FREIGABE: '2' }), false);
  assert.equal(autoFreigabeMoeglich(baustelle(db, { datenschutz: 'ungeprueft', quelle: 'referenz', typ: 'referenz' }), { SOCIAL_AUTO_FREIGABE: '2' }), false, 'Referenzbild ungesichtet');
  const reel = baustelle(db); reel.beitrag = { ...reel.beitrag, format: 'reel' };
  assert.equal(autoFreigabeMoeglich(reel, { SOCIAL_AUTO_FREIGABE: '2' }), false);
});

test('Automatisch freigeben: mit dem Stand von jetzt, nichts in der Vergangenheit', (t) => {
  const db = testDb(t);
  const a = baustelle(db); const b = baustelle(db, { einwilligung: false });
  const alt = baustelle(db); db.beitragAendern(alt.beitrag.id, { geplant_am: '2026-09-01T10:00:00.000Z' });
  const env = { SOCIAL_AUTO_FREIGABE: '2' }; const jetzt = new Date('2026-10-01T10:00:00Z');
  assert.deepEqual(freigebenAutomatisch(db, { env, jetzt }), [a.beitrag.id]);
  assert.equal(db.beitrag(a.beitrag.id).status, 'GEPLANT'); assert.equal(db.beitrag(a.beitrag.id).freigabe_von, 'automatisch');
  assert.equal(db.beitrag(b.beitrag.id).status, 'FREIGABE');
  db.inhaltAendern(b.inhalt.id, { einwilligung: true });
  assert.deepEqual(freigebenAutomatisch(db, { env, jetzt }), [b.beitrag.id], 'spaeter bestaetigte Einwilligung zaehlt');
  assert.equal(db.beitrag(alt.beitrag.id).status, 'FREIGABE', 'vergangener Termin wird nicht nachgeholt');
});

test('Bild ersetzen: bearbeitete Fassung unter bearbeitet/, Original bleibt, Bedenken bleiben Sperre', (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const { id } = db.inhaltAnlegen({ quelle: 'referenz', typ: 'referenz', titel: 'x', einwilligung: true });
  const m = db.mediumAnlegen(id, { art: 'bild', url: 'https://cdn.shopify.com/a.jpg', pruefung: 'ok', datenschutz: 'ok' });
  const neu = path.join(dir, 'neu.jpg'); fs.writeFileSync(neu, JPEG);
  const r = ersetzeBild(db, m, neu, { dir });
  assert.equal(r.pfad, path.join('bearbeitet', `${id}-${m}.jpg`)); assert.equal(r.url, 'https://cdn.shopify.com/a.jpg');
  assert.ok(fs.existsSync(path.join(dir, r.pfad)));
  const png = path.join(dir, 'neu.png'); fs.writeFileSync(png, Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n'), Buffer.alloc(8)]));
  let gewandelt = null;
  ersetzeBild(db, m, png, { dir, wandle: (q, z) => { gewandelt = [q, z]; fs.writeFileSync(z, JPEG); } });
  assert.equal(gewandelt[0], png);
  const gesperrt = db.mediumAnlegen(id, { art: 'bild', url: 'x', pruefung: 'ok', datenschutz: 'bedenken' });
  assert.throws(() => ersetzeBild(db, gesperrt, neu, { dir }), /Bedenken/);
  fs.writeFileSync(path.join(dir, 'kein.jpg'), 'text');
  assert.throws(() => ersetzeBild(db, m, path.join(dir, 'kein.jpg'), { dir }), /Nur JPG/);
});
