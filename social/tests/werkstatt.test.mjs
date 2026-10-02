import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { RenderFehler } from '../lib/rendern.mjs';
import { baue, dezenterFilter, bildAdresse } from '../lib/vorlagen.mjs';
import { erstelleEntwurf, kurzTitel, preisText, standardBauplan, WerkstattFehler } from '../lib/werkstatt.mjs';
import { scheinRendern, testDb, tmpDir } from './_hilfe.mjs';

test('Titel ohne Breiten, Preis nur je Quadratmeter', () => {
  assert.equal(kurzTitel('Sentira Teppichboden 400cm 500cm'), 'Sentira Teppichboden');
  assert.equal(kurzTitel('Novira Sauberlauf-Fliesen 50 × 50 cm'), 'Novira Sauberlauf-Fliesen');
  assert.equal(preisText({ betrag: 6.61, einheit: 'm2' }), '6,61 €/m²');
  assert.equal(preisText({ betrag: 21.21, einheit: 'paket' }), null, 'der Paketpreis wird nie gezeigt');
  assert.equal(preisText(null), null);
});

test('Vorlagen: Text wird maskiert, Korrektur bleibt dezent, Shop-Bilder in passender Groesse', () => {
  const { html, breite, hoehe } = baue('foto', { bild: { quelle: '/tmp/a.jpg' }, zeile: '<script>alert(1)</script>' }, 'feed');
  assert.equal(breite, 1080); assert.equal(hoehe, 1350);
  assert.equal(html.includes('<script>alert'), false); assert.ok(html.includes('file:///tmp/a.jpg'));
  assert.equal(baue('story_foto', { bild: { quelle: '/tmp/a.jpg' }, titel: 'x' }, 'story').hoehe, 1920);
  assert.throws(() => baue('vorher_nachher', {}, 'quadrat'), /Format/);
  assert.equal(dezenterFilter(130), 'none');
  assert.equal(dezenterFilter(20), 'brightness(1.100)', 'hoechstens zehn Prozent');
  assert.equal(dezenterFilter(60), 'brightness(1.100)');
  assert.equal(dezenterFilter(90), 'brightness(1.025)');
  assert.equal(bildAdresse('https://cdn.shopify.com/s/files/a.jpg?v=1'), 'https://cdn.shopify.com/s/files/a.jpg?v=1&width=1600');
});

test('Bauplan Baustelle: Vorher/Nachher zuerst, Bedenken-Bilder bleiben draussen', (t) => {
  const db = testDb(t);
  const { id } = db.inhaltAnlegen({ quelle: 'baustelle', typ: 'vorher_nachher', titel: 'x', ort: 'Velten', bodenart: 'Klebevinyl', einwilligung: true, daten: { ortBekannt: true } });
  const v = db.mediumAnlegen(id, { art: 'bild', pfad: 'medien/1/a.jpg', rolle: 'vorher', pruefung: 'ok', reihenfolge: 0 });
  const n = db.mediumAnlegen(id, { art: 'bild', pfad: 'medien/1/b.jpg', rolle: 'nachher', pruefung: 'ok', reihenfolge: 1 });
  db.mediumAnlegen(id, { art: 'bild', pfad: 'medien/1/c.jpg', pruefung: 'ok', datenschutz: 'bedenken', reihenfolge: 2 });
  db.mediumAnlegen(id, { art: 'bild', pfad: 'medien/1/d.jpg', pruefung: 'aussortiert', reihenfolge: 3 });
  const plan = standardBauplan(db.inhalt(id), db.medien(id), 'karussell');
  assert.equal(plan.format, 'karussell');
  assert.deepEqual(plan.folien[0], { vorlage: 'vorher_nachher', daten: { vorher: { medium: v }, nachher: { medium: n }, zeile: 'Velten · Klebevinyl' } });
  assert.deepEqual(plan.folien.map(f => f.vorlage), ['vorher_nachher', 'foto']);
  assert.equal(standardBauplan(db.inhalt(id), db.medien(id), 'story').folien[0].vorlage, 'story_foto');
});

test('Bauplan Shop: Serie wird Karussell, Angebot traegt das Abzeichen, Farben bekommen ein Titelbild', (t) => {
  const db = testDb(t);
  const bild = n => ({ src: `https://cdn.shopify.com/${n}.jpg`, beschriftung: `Farbe ${n}` });
  const mit = (typ, daten) => db.inhalt(db.inhaltAnlegen({ quelle: 'shopify', typ, titel: 't', produkt_titel: 'Sentira Teppichboden 400cm 500cm', bodenart: 'Teppichboden', daten: { gruppe: 'Teppichboden', bilder: [bild(0)], ...daten } }).id);
  const angebot = standardBauplan(mit('angebot', { rabattProzent: 26 }), [], 'feed');
  assert.equal(angebot.folien[0].daten.abzeichen, '−26 %'); assert.equal(angebot.folien[0].daten.titel, 'Sentira Teppichboden'); assert.equal(angebot.folien[0].daten.preis, null);
  const serie = standardBauplan(mit('produkt_neu', { serie: true, familienName: 'WOHNWELT-Kollektion', produkte: ['a', 'b', 'c'], serienBilder: [bild(1), bild(2), bild(3)] }), [], 'karussell');
  assert.equal(serie.folien.length, 4); assert.equal(serie.folien[0].daten.kicker, 'Neue Serie im Shop'); assert.equal(serie.folien[1].vorlage, 'farbe');
  const farben = standardBauplan(mit('produkt_farben', { farbAnzahl: 12, farbBilder: [bild(1), bild(2), bild(3), bild(4)] }), [], 'karussell');
  assert.equal(farben.folien[0].vorlage, 'farben_titel'); assert.equal(farben.folien[0].daten.zeile, 'Teppichboden in 12 Farben'); assert.equal(farben.folien[2].daten.zaehler, '2 / 4');
});

test('Entwurf: rendert, legt den Beitrag in die Freigabe und merkt sich die benutzten Medien', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const { id } = db.inhaltAnlegen({ quelle: 'baustelle', typ: 'kundenprojekt', titel: 'Velten', ort: 'Velten', bodenart: 'Klebevinyl', taetigkeit: 'Verlegung', einwilligung: true, daten: { ortBekannt: true } });
  const a = db.mediumAnlegen(id, { art: 'bild', pfad: `medien/${id}/original/01.jpg`, pruefung: 'ok', helligkeit: 60, reihenfolge: 0 });
  const b = db.mediumAnlegen(id, { art: 'bild', pfad: `medien/${id}/original/02.jpg`, pruefung: 'ok', datenschutz: 'ok', reihenfolge: 1 });
  db.inhaltAendern(id, { status: 'IN_PRUEFUNG' });
  let auftraege;
  const beitrag = await erstelleEntwurf(db, { inhaltId: id }, { rendere: async (x) => { auftraege = x; return scheinRendern(x); }, dir, env: {} });
  assert.equal(beitrag.status, 'FREIGABE'); assert.equal(beitrag.format, 'karussell'); assert.equal(beitrag.medien.length, 2);
  assert.deepEqual(beitrag.medien.map(m => m.quellen), [[a], [b]]);
  assert.ok(fs.existsSync(path.join(dir, beitrag.medien[0].pfad)));
  assert.ok(auftraege[0].html.includes('brightness(1.100)'), 'dunkles Baustellenfoto wird dezent aufgehellt');
  assert.ok(beitrag.hashtags.startsWith('#velten #oberhavel #oranienburg'));
  assert.match(beitrag.hinweise.sperren.join(), /1 Bild\(er\) noch nicht/, 'ein Bild ist ungesichtet');
  assert.equal(db.inhalt(id).status, 'CONTENT_ERSTELLT');
  assert.equal(beitrag.auto_freigabe, 0);
});

test('Reel: Hochkant-Standbilder vorher -> nachher, geschnitten zum Video, Einzelbilder bleiben Rahmen', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const { id } = db.inhaltAnlegen({ quelle: 'baustelle', typ: 'vorher_nachher', titel: 'Velten', ort: 'Velten', bodenart: 'Klebevinyl', raum: 'Flur', einwilligung: true, daten: { ortBekannt: true } });
  const bild = (rolle, reihenfolge, extra = {}) => db.mediumAnlegen(id, { art: 'bild', pfad: `medien/${id}/original/${reihenfolge}.jpg`, rolle, pruefung: 'ok', datenschutz: 'ok', reihenfolge, ...extra });
  const n = bild('nachher', 0); const v = bild('vorher', 1); const w = bild('arbeit', 2);
  bild(null, 3, { datenschutz: 'bedenken' });
  const plan = standardBauplan(db.inhalt(id), db.medien(id), 'reel');
  assert.equal(plan.format, 'reel');
  assert.deepEqual(plan.folien.map(f => f.daten.bild.medium), [v, w, n], 'Ergebnis zum Schluss, Bedenken-Bild fehlt');
  assert.equal(plan.folien[0].daten.titel, 'Klebevinyl im Flur'); assert.equal(plan.folien[0].daten.zeile, 'Velten');
  assert.deepEqual(plan.folien.slice(1).map(f => f.daten.titel), ['Bei der Arbeit', 'Fertig']);

  let geschnitten;
  const schneide = async (bilder, ziel) => { geschnitten = { bilder, ziel }; fs.writeFileSync(ziel, 'mp4'); return ziel; };
  const beitrag = await erstelleEntwurf(db, { inhaltId: id, format: 'reel', text: 'Neuer Klebevinyl im Flur in Velten, vom alten Belag bis zur fertigen Fläche.' }, { rendere: scheinRendern, schneide, dir, env: {} });
  assert.equal(beitrag.format, 'reel'); assert.equal(beitrag.vorlage, 'reel');
  assert.deepEqual(beitrag.medien.map(m => m.art), ['video', 'rahmen', 'rahmen', 'rahmen']);
  assert.match(beitrag.medien[0].pfad, /reel\.mp4$/);
  assert.deepEqual(geschnitten.bilder.map(b => path.basename(b)), ['rahmen-01.jpg', 'rahmen-02.jpg', 'rahmen-03.jpg']);
  assert.deepEqual([...beitrag.medien[0].quellen].sort(), [n, v, w].sort());
  assert.ok(beitrag.hashtags.length > 0, 'Reels tragen Hashtags');
  assert.equal(beitrag.auto_freigabe, 0, 'Reels nie automatisch');
});

test('Reel nur aus eigenen Fotos und ab drei Bildern', (t) => {
  const db = testDb(t);
  const { id } = db.inhaltAnlegen({ quelle: 'baustelle', typ: 'kundenprojekt', titel: 'x', einwilligung: true });
  db.mediumAnlegen(id, { art: 'bild', pfad: 'medien/1/a.jpg', rolle: 'vorher', pruefung: 'ok', datenschutz: 'ok' });
  db.mediumAnlegen(id, { art: 'bild', pfad: 'medien/1/b.jpg', rolle: 'nachher', pruefung: 'ok', datenschutz: 'ok' });
  assert.throws(() => standardBauplan(db.inhalt(id), db.medien(id), 'reel'), /mindestens drei/);
  assert.throws(() => standardBauplan({ quelle: 'shopify', daten: {} }, [], 'reel'), WerkstattFehler);
});

test('Entwurf lehnt Floskeltext, fremde und bedenkliche Medien ab', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const { id } = db.inhaltAnlegen({ quelle: 'baustelle', typ: 'kundenprojekt', titel: 'x', einwilligung: true });
  const m = db.mediumAnlegen(id, { art: 'bild', pfad: `medien/${id}/original/01.jpg`, pruefung: 'ok', datenschutz: 'bedenken' });
  const opt = { rendere: scheinRendern, dir, env: {} };
  await assert.rejects(erstelleEntwurf(db, { inhaltId: id }, opt), /Kein freigegebenes Bild/);
  await assert.rejects(erstelleEntwurf(db, { inhaltId: id, folien: [{ vorlage: 'foto', daten: { bild: { medium: m } } }] }, opt), /Datenschutz-Bedenken/);
  await assert.rejects(erstelleEntwurf(db, { inhaltId: id, folien: [{ vorlage: 'foto', daten: { bild: { medium: 999 } } }] }, opt), /gehört nicht/);
  db.mediumAendern(m, { datenschutz: 'ok' });
  await assert.rejects(erstelleEntwurf(db, { inhaltId: id, text: 'Wir sind unglaublich stolz auf diesen wunderbaren neuen Boden im Haus.' }, opt), WerkstattFehler);
  assert.equal(db.beitraegeZuInhalt(id).length, 0);
});

test('Ausgetauschte Shop-Bilder: der Anlass wird freigegeben und kann neu entstehen', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const felder = { quelle: 'shopify', typ: 'raumidee', titel: 'Raumidee: Amara', produkt_titel: 'Amara', schluessel: 'shopify:raumidee:amara:2026-10', daten: { gruppe: 'Klebevinyl', bilder: [{ src: 'https://cdn.shopify.com/weg.jpg' }] } };
  const { id } = db.inhaltAnlegen(felder);
  const kaputt = async () => { throw new RenderFehler('Bild nicht ladbar: https://cdn.shopify.com/weg.jpg'); };
  await assert.rejects(erstelleEntwurf(db, { inhaltId: id, format: 'feed' }, { rendere: kaputt, dir, env: {} }), /beim nächsten Shop-Abgleich/);
  assert.equal(db.inhalt(id).status, 'VERWORFEN');
  assert.equal(db.beitraegeZuInhalt(id).length, 0);
  assert.equal(db.inhaltAnlegen(felder).neu, true, 'derselbe Anlass darf mit frischen Bildern wiederkommen');
});

test('Vorlage Angebot: Doppelbild, Streichpreis nur mit Vergleichspreis, Feed und Story', () => {
  const d = { titel: 'Vantana Teppichboden', abzeichen: '−26 %', preis: '36,90 €/m²', preisAlt: '49,90 €/m²', bilder: [{ quelle: 'https://cdn.shopify.com/a.jpg', label: 'Teppichboden' }, { quelle: 'https://cdn.shopify.com/b.jpg', label: 'Teppich mit Einfassung' }] };
  const feed = baue('angebot', d, 'feed');
  assert.equal(feed.hoehe, 1350);
  assert.match(feed.html, /line-through/); assert.match(feed.html, /statt 49,90 €\/m²/);
  assert.match(feed.html, /grid-template-columns:1fr 1fr/); assert.match(feed.html, /Teppich mit Einfassung/);
  assert.match(baue('angebot', d, 'story').html, /grid-template-rows:1fr 1fr/);
  assert.equal(/line-through/.test(baue('angebot', { ...d, preisAlt: null }, 'feed').html), false, 'ohne Vergleichspreis kein Streichpreis');
});
