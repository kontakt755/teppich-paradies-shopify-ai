import assert from 'node:assert/strict';
import test from 'node:test';
import { oeffne } from '../lib/db.mjs';
import { autoFreigabeMoeglich, bearbeiten, freigeben, FreigabeFehler, pruefe, verwerfen, zurueckholen } from '../lib/freigabe.mjs';
import { REPO } from '../lib/pfade.mjs';
import { StatusFehler } from '../lib/status.mjs';
import { zeigeStatus } from '../scripts/social.mjs';
import { testDb } from './_hilfe.mjs';

const TEXT = 'In Velten haben wir den alten Belag entfernt und Klebevinyl verlegt. Wir übernehmen Beratung, Aufmaß und Verlegung.';

function baustelle(db, extra = {}) {
  const { id } = db.inhaltAnlegen({ quelle: 'baustelle', typ: 'kundenprojekt', titel: 'Velten – Klebevinyl', ort: 'Velten', bodenart: 'Klebevinyl', einwilligung: true, daten: { ortBekannt: true }, ...extra });
  const m = db.mediumAnlegen(id, { art: 'bild', pfad: `medien/${id}/original/01.jpg`, pruefung: 'ok' });
  db.inhaltAendern(id, { status: 'IN_PRUEFUNG' });
  const b = db.beitragAnlegen({ inhalt_id: id, format: 'feed', plattformen: ['instagram', 'facebook'], text: TEXT, hashtags: '#velten', medien: [{ pfad: `medien/${id}/beitrag-1/01.jpg`, art: 'bild', quellen: [m] }], geplant_am: '2026-10-06T16:00:00.000Z' });
  return { id, m, b };
}

test('Die Datenbank verweigert einen Ort im Repository', () => {
  assert.throws(() => oeffne(`${REPO}/social/social.db`), /nicht im Repository/);
});

test('Gleicher Schluessel legt keinen zweiten Inhalt an', (t) => {
  const db = testDb(t);
  const a = db.inhaltAnlegen({ quelle: 'shopify', typ: 'produkt_neu', titel: 'A', schluessel: 'shopify:produkt_neu:x:2026-10' });
  const b = db.inhaltAnlegen({ quelle: 'shopify', typ: 'produkt_neu', titel: 'A', schluessel: 'shopify:produkt_neu:x:2026-10' });
  assert.equal(a.neu, true); assert.equal(b.neu, false); assert.equal(a.id, b.id);
  assert.deepEqual(db.inhalt(a.id).daten, null);
});

test('Statuswechsel folgen der Kette, JSON-Spalten kommen als Objekte zurueck', (t) => {
  const db = testDb(t);
  const { id, b } = baustelle(db);
  assert.throws(() => db.inhaltAendern(id, { status: 'ARCHIV' }), StatusFehler);
  assert.throws(() => db.beitragAendern(b, { status: 'VEROEFFENTLICHT' }), StatusFehler);
  assert.deepEqual(db.beitrag(b).plattformen, ['instagram', 'facebook']);
  assert.throws(() => db.beitragAendern(b, { gibtEsNicht: 1 }), /Unbekannte Spalte/);
});

test('Uebersicht zaehlt wie in der Zentrale gezeigt', (t) => {
  const db = testDb(t);
  const { b } = baustelle(db);
  const neu = db.inhaltAnlegen({ quelle: 'baustelle', titel: 'Neu', einwilligung: true });
  db.mediumAnlegen(neu.id, { art: 'bild', pfad: 'x' }); db.mediumAnlegen(neu.id, { art: 'video', pfad: 'y' });
  db.inhaltAnlegen({ quelle: 'shopify', typ: 'produkt_neu', titel: 'Produkt' });
  let u = db.uebersicht();
  assert.deepEqual(u.neu, { baustellenbilder: 2, videos: 1, produkte: 1, baustellen: 2 });
  assert.equal(u.vorbereitet.posts, 1); assert.equal(u.freigabe, 1); assert.equal(u.geplant.length, 0);
  db.mediumAendern(db.medien(db.beitrag(b).inhalt_id)[0].id, { datenschutz: 'ok' });
  freigeben(db, b, { von: 'Ahmet' });
  u = db.uebersicht();
  assert.equal(u.freigabe, 0); assert.equal(u.geplant[0].typLabel, 'Kundenprojekt');
});

test('Baustellenbilder ohne Sichtung sperren die Freigabe', (t) => {
  const db = testDb(t);
  const { id, m, b } = baustelle(db);
  const urteil = () => pruefe({ beitrag: db.beitrag(b), inhalt: db.inhalt(id), medien: db.medien(id) });
  assert.match(urteil().sperren.join(), /noch nicht auf Personen/);
  assert.throws(() => freigeben(db, b), FreigabeFehler);
  db.mediumAendern(m, { datenschutz: 'bedenken', datenschutz_notiz: 'Person im Spiegel' });
  assert.match(urteil().sperren.join(), /Person im Spiegel/);
  db.mediumAendern(m, { datenschutz: 'ok' });
  assert.deepEqual(urteil().sperren, []);
  const frei = freigeben(db, b, { von: 'Ahmet' });
  assert.equal(frei.status, 'GEPLANT'); assert.equal(frei.freigabe_von, 'Ahmet');
  assert.equal(zurueckholen(db, b).status, 'FREIGABE');
});

test('Ohne Einwilligung keine Freigabe; verworfene Adresse und Angebot erzeugen Hinweise', (t) => {
  const db = testDb(t);
  const { id, m, b } = baustelle(db, { einwilligung: false, daten: { ortVerworfen: true } });
  db.mediumAendern(m, { datenschutz: 'ok' });
  const u = pruefe({ beitrag: db.beitrag(b), inhalt: db.inhalt(id), medien: db.medien(id) });
  assert.match(u.sperren.join(), /Einwilligung/); assert.match(u.hinweise.join(), /Adresse/);
  const angebot = db.inhaltAnlegen({ quelle: 'shopify', typ: 'angebot', titel: 'Sentira', einwilligung: true });
  const p = pruefe({ beitrag: { text: TEXT, hashtags: '', format: 'feed' }, inhalt: db.inhalt(angebot.id), medien: [] });
  assert.match(p.hinweise.join(), /Preisangabenverordnung/);
});

test('Bearbeiten prueft den Text, Termin ist Pflicht, Verwerfen ist endgueltig bis zum Zurueckholen', (t) => {
  const db = testDb(t);
  const { m, b } = baustelle(db);
  db.mediumAendern(m, { datenschutz: 'ok' });
  assert.throws(() => bearbeiten(db, b, { text: 'Tauchen Sie ein in die faszinierende Welt der Böden in Oranienburg.' }), /Floskel/);
  assert.throws(() => bearbeiten(db, b, { plattformen: ['tiktok'] }), /Plattform/);
  assert.equal(bearbeiten(db, b, { plattformen: ['instagram'], geplantAm: '2026-10-08T18:00:00+02:00' }).geplant_am, '2026-10-08T16:00:00.000Z');
  db.beitragAendern(b, { geplant_am: null });
  assert.throws(() => freigeben(db, b), /Kein Termin/);
  assert.equal(verwerfen(db, b, { grund: 'passt nicht' }).status, 'VERWORFEN');
  assert.throws(() => freigeben(db, b), /Status VERWORFEN/);
  assert.equal(db.ereignisse(5).some(e => e.aktion === 'beitrag-verworfen' && e.details.grund === 'passt nicht'), true);
});

test('Automatische Freigabe: aus, solange nicht eingeschaltet - und nie fuer Baustellen oder Preise', (t) => {
  const db = testDb(t);
  const shop = db.inhaltAnlegen({ quelle: 'shopify', typ: 'raumidee', titel: 'Amara', einwilligung: true });
  const fall = typ => ({ beitrag: { text: TEXT.replace('In Velten haben wir', 'Hier haben wir'), hashtags: '#a', format: 'feed' }, inhalt: { ...db.inhalt(shop.id), typ }, medien: [] });
  assert.equal(autoFreigabeMoeglich(fall('raumidee'), {}), false);
  assert.equal(autoFreigabeMoeglich(fall('raumidee'), { SOCIAL_AUTO_FREIGABE: '1' }), true);
  assert.equal(autoFreigabeMoeglich(fall('angebot'), { SOCIAL_AUTO_FREIGABE: '1' }), false);
  const { id, b } = baustelle(db);
  assert.equal(autoFreigabeMoeglich({ beitrag: db.beitrag(b), inhalt: db.inhalt(id), medien: [] }, { SOCIAL_AUTO_FREIGABE: '1' }), false);
});

test('Status zeigt alle geplanten Termine - nicht nur die ersten 20', (t) => {
  // Ein Redaktionslauf hielt Woche 2 fuer leer, weil die Liste nach 20 Eintraegen abbrach.
  const jetzt = new Date(2026, 9, 12, 8, 0);   // Montag, 12.10.2026
  const db = testDb(t, () => jetzt);
  const { id } = db.inhaltAnlegen({ quelle: 'shopify', typ: 'produkt_farben', titel: 'Farben' });
  const plane = (tag, stunde, format) => db.beitragAnlegen({ inhalt_id: id, format, plattformen: ['instagram'], text: TEXT, medien: [], status: 'GEPLANT', geplant_am: new Date(2026, 9, tag, stunde).toISOString() });
  // 12.-31.10.: jeden Tag eine Story um 12 Uhr, jeden Werktag ein Beitrag um 18 Uhr
  for (let tag = 12; tag <= 31; tag += 1) {
    plane(tag, 12, 'story');
    if (![0, 6].includes(new Date(2026, 9, tag).getDay())) plane(tag, 18, 'feed');
  }
  assert.equal(db.uebersicht().geplant.length, 35);

  const zeilen = [];
  zeigeStatus(db, { jetzt, schreibe: z => zeilen.push(...z.split('\n')) });
  assert.ok(zeilen.includes('Geplant (35 Termine)'));
  assert.ok(zeilen.includes('  KW 42 (12.10.–18.10.): 5 Beiträge · 7 Storys'));
  assert.ok(zeilen.includes('  KW 43 (19.10.–25.10.): 5 Beiträge · 7 Storys'), 'Woche 2 ist voll, nicht leer');
  assert.ok(zeilen.includes('  KW 44 (26.10.–01.11.): 5 Beiträge · 6 Storys'));
  assert.equal(zeilen.filter(z => z.includes(': Farben')).length, 24, 'alle Termine bis 26.10. 08:00 einzeln');
  assert.equal(zeilen.at(-1), '  … und 11 weitere bis 31.10.');
});

test('Status ohne geplante Termine', (t) => {
  const zeilen = [];
  zeigeStatus(testDb(t), { schreibe: z => zeilen.push(...z.split('\n')) });
  assert.deepEqual(zeilen.slice(-2), ['Geplant (0 Termine)', '  –']);
});
