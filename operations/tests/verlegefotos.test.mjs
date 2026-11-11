import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { planeAbgleich, sammelEintrag, altText, SCHLUESSEL_OHNE_PRODUKT } from '../lib/verlegefotos.mjs';
import { main, argumente } from '../scripts/verlegefotos-abgleich.mjs';
import { lies, dateiPfad } from '../lib/organisation-speicher.mjs';

const PRODUKTE = [
  { handle: 'selene-linoleumboden-620', titel: 'Selene Linoleumboden Farbe 620', status: 'ACTIVE' },
  { handle: 'selene-linoleumboden-630', titel: 'Selene Linoleumboden Farbe 630', status: 'ACTIVE' },
  { handle: 'vellana-teppichboden', titel: 'Vellana Teppichboden', status: 'ACTIVE' },
];
const bild = { pfad: '/x/1.jpg' };

test('drei Fälle: Sichtung, Zuordnen, nicht im Shop - und ohne Bodennamen kein Raten', () => {
  const plan = planeAbgleich([
    { id: 1, titel: 'A', produkt: 'Selene 620', bilder: [bild] },
    { id: 2, titel: 'B', produkt: 'Selene', bilder: [bild] },
    { id: 3, titel: 'C', produkt: 'Nordhaus Prestige 44', bilder: [bild, bild, bild] },
    { id: 4, titel: 'D', produkt: null, bodenart: 'Teppichboden', bilder: [bild] },
    { id: 5, titel: 'E', produkt: 'Vellana', bilder: [] },
  ], PRODUKTE);
  assert.deepEqual(plan.eintraege.map(e => e.verknuepft.fall), ['sichtung', 'zuordnen', 'nicht-im-shop']);
  assert.match(plan.eintraege[0].titel, /Selene Linoleumboden Farbe 620.*bereit zur Sichtung/);
  assert.match(plan.eintraege[0].beschreibung, /Kundenprojekt: .*Farbe kann abweichen/);
  assert.match(plan.eintraege[0].beschreibung, /Struktur und Muster nie verändern/);
  assert.match(plan.eintraege[2].beschreibung, /Großhändler/);
  assert.equal(plan.eintraege[2].bilder.length, 2, 'für die Sortimentsfrage reichen zwei Bilder');
  assert.deepEqual(plan.ohneProdukt.map(b => b.id), [4], 'die Bodenart allein ist kein Produkt');
});

test('nachgetragener Bodenname zählt, vorhandene To-dos entstehen nicht doppelt', () => {
  const b = [{ id: 4, titel: 'D', produkt: null, bilder: [bild] }];
  assert.equal(planeAbgleich(b, PRODUKTE, { boeden: { 4: 'Vellana' } }).eintraege[0].verknuepft.produkt, 'vellana-teppichboden');
  assert.equal(planeAbgleich(b, PRODUKTE, { boeden: { 4: 'Vellana' }, erledigt: new Set(['social:4']) }).eintraege.length, 0);
});

test('Alt-Text nennt das Kundenprojekt, nie eine Farbreferenz', () => {
  assert.equal(altText('Vellana Teppichboden', 'Grau'), 'Kundenprojekt: Vellana Teppichboden in Grau, von Teppich Paradies verlegt. Handyfoto – die Farbe kann abweichen.');
});

test('Sammel-To-do nennt Anzahl und den Befehl zum Nachtragen', () => {
  const s = sammelEintrag([{ id: 7, titel: 'Flur', erstellt: '2026-10-12T08:00:00Z', bilder: [bild] }]);
  assert.match(s.titel, /bei 1 Baustellen fehlt/);
  assert.match(s.beschreibung, /--boden <Nummer>/);
  assert.equal(s.verknuepft.schluessel, SCHLUESSEL_OHNE_PRODUKT);
});

test('unbekannte Argumente brechen ab', () => {
  assert.throws(() => argumente(['--upload']), /Unbekanntes Argument/);
  assert.throws(() => argumente(['--boden', 'abc', 'x']), /--boden/);
});

test('Lauf: liest nur geprüfte Bilder, schreibt erst mit --schreiben und nie doppelt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verlegefotos-'));
  try {
    fs.mkdirSync(path.join(dir, 'lexikon'));
    fs.writeFileSync(path.join(dir, 'lexikon', 'produkte.json'), JSON.stringify({ produkte: [...PRODUKTE, { handle: 'entwurf-x', titel: 'Entwurfboden X', status: 'DRAFT' }] }));
    fs.mkdirSync(path.join(dir, 'social', 'medien'), { recursive: true });
    for (const n of ['a.jpg', 'b.jpg', 'c.jpg']) fs.writeFileSync(path.join(dir, 'social', 'medien', n), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const db = new DatabaseSync(path.join(dir, 'social', 'social.db'));
    db.exec(`CREATE TABLE inhalt (id INTEGER PRIMARY KEY, erstellt TEXT, quelle TEXT, titel TEXT, status TEXT, bodenart TEXT, produkt_titel TEXT, einwilligung INTEGER);
      CREATE TABLE medium (id INTEGER PRIMARY KEY, inhalt_id INTEGER, art TEXT, pfad TEXT, pruefung TEXT, datenschutz TEXT, reihenfolge INTEGER DEFAULT 0);
      INSERT INTO inhalt VALUES (1,'2026-10-12','baustelle','Wohnzimmer','IN_PRUEFUNG','Linoleum','Selene 620',1),
        (2,'2026-10-13','baustelle','Flur','IN_PRUEFUNG','Teppichboden',NULL,1),
        (3,'2026-10-14','baustelle','Weg','VERWORFEN',NULL,'Vellana',1),
        (4,'2026-10-15','baustelle','Entwurf','IN_PRUEFUNG',NULL,'Entwurfboden X',1);
      INSERT INTO medium (inhalt_id, art, pfad, pruefung, datenschutz) VALUES
        (1,'bild','medien/a.jpg','ok','ok'), (1,'bild','medien/b.jpg','ok','bedenken'), (1,'video','medien/v.mp4','ok','ok'),
        (2,'bild','medien/c.jpg','ok','ok'), (3,'bild','medien/a.jpg','ok','ok'), (4,'bild','medien/a.jpg','ok','ok');`);
    db.close();
    const still = { dir, log: () => {} };

    const probe = await main([], still);
    assert.equal(probe.angelegt, 0);
    assert.equal(lies(dateiPfad(dir)).eintraege.length, 0, 'ohne --schreiben entsteht nichts');

    assert.equal((await main(['--schreiben'], still)).angelegt, 3);
    const e = lies(dateiPfad(dir)).eintraege;
    const sichtung = e.find(x => x.verknuepft.fall === 'sichtung');
    assert.equal(sichtung.verknuepft.produkt, 'selene-linoleumboden-620');
    assert.equal(sichtung.anhaenge.length, 1, 'das Bild mit Datenschutzbedenken und das Video bleiben draussen');
    assert.equal(e.find(x => x.verknuepft.schluessel === 'social:4').verknuepft.fall, 'nicht-im-shop', 'ein Entwurf ist kein Shop-Produkt');
    assert.ok(e.some(x => x.verknuepft.schluessel === SCHLUESSEL_OHNE_PRODUKT));
    assert.ok(!e.some(x => x.verknuepft.schluessel === 'social:3'), 'Verworfenes bleibt verworfen');

    assert.equal((await main(['--schreiben'], still)).angelegt, 0, 'zweiter Lauf legt nichts doppelt an');

    await main(['--boden', '2', 'Vellana'], still);
    assert.equal((await main(['--schreiben'], still)).angelegt, 1);
    assert.equal(lies(dateiPfad(dir)).eintraege.at(-1).verknuepft.produkt, 'vellana-teppichboden');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
