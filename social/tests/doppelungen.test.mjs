// Doppelungen in der Planung (Rundgang 26.10.2026, Massnahme #67 Schritt 2). Jeder Test haelt einen
// Fall aus dem Oktober fest: doppelte Reels, dieselbe neue Farbe zweimal, dasselbe Bild nach zwei Tagen,
// falsche Zahlen, eine angekuendigte Farbe ohne Bild.
import assert from 'node:assert/strict';
import test from 'node:test';
import { shopAbgleich } from '../lib/ablauf.mjs';
import { anlassFamilien, neueFarbeGezeigt, quellBilder, zahlenAmBautag, zahlenAusText, zahlenImText } from '../lib/doppelungen.mjs';
import { plane } from '../lib/planer.mjs';
import { findeKandidaten, serienBeschriftung } from '../lib/produkt-auswahl.mjs';
import { reelKandidaten } from '../lib/produkt-reel.mjs';
import { normalisiere } from '../lib/shop-quelle.mjs';
import { erstelleEntwurf, standardBauplan, WerkstattFehler } from '../lib/werkstatt.mjs';
import { feedProdukt, scheinRendern, testDb, tmpDir } from './_hilfe.mjs';

test('Neue Farbe zaehlt je Qualitaet: Teppichboden und Teppich nach Mass sind eine Neuigkeit (Zafira #105/#128)', async (t) => {
  assert.deepEqual(anlassFamilien('zafira|teppichboden'), ['zafira|teppichboden', 'zafira|teppich nach maß']);
  assert.deepEqual(anlassFamilien('solenta|klebevinyl'), ['solenta|klebevinyl']);
  let uhr = new Date('2026-09-01T05:00:00Z');
  const db = testDb(t, () => uhr);
  const bild = farbe => ({ src: `https://cdn.shopify.com/s/files/1/x/zafira-${farbe.toLowerCase()}-raum.jpg?v=1`, width: 2400, height: 1800, alt: null });
  const zafira = (titel, handle, typ, farben) => feedProdukt({
    title: titel, handle, product_type: typ, tags: [],
    options: [{ name: 'Farbe', position: 1, values: farben }],
    images: farben.map((f, i) => ({ ...bild(f), variant_ids: [i + 1] })), variants: farben.map((f, i) => ({ id: i + 1, option1: f, price: '50.00', compare_at_price: null, available: true })),
  });
  const vorher = [zafira('Zafira Teppichboden 400cm', 'zafira-teppichboden', 'Teppichboden', ['Sand']), zafira('Zafira Teppich nach Maß', 'zafira-teppich-nach-mass', 'Teppich nach Maß', ['Sand'])];
  const opt = { preise: new Map(), nachfrage: new Map() };
  await shopAbgleich(db, { ...opt, roh: vorher, jetzt: uhr });
  const nachher = vorher.map(p => zafira(p.title, p.handle, p.product_type, ['Sand', 'Rauchblau']));
  uhr = new Date('2026-10-20T05:00:00Z');
  const r = await shopAbgleich(db, { ...opt, roh: nachher, jetzt: uhr });
  const farben = r.neu.filter(n => n.art === 'produkt_farben' && n.neueFarben);
  assert.equal(farben.length, 1, `nur ein Anlass "neue Farbe": ${JSON.stringify(r.neu)}`);
  // Auch nach der Ruhezeit nicht: Rauchblau ist fuer Zafira angekuendigt, die andere Warengruppe kennt
  // die Farbe ab jetzt (Pruefung 26.10.: ohne das kam die zweite Ankuendigung nach 46 Tagen doch).
  for (const tage of [10, 46, 60]) {
    uhr = new Date(Date.parse('2026-10-20T05:00:00Z') + tage * 864e5);
    const spaeter = await shopAbgleich(db, { ...opt, roh: nachher, jetzt: uhr });
    assert.deepEqual(spaeter.neu.filter(n => n.neueFarben), [], `Tag ${tage}: ${JSON.stringify(spaeter.neu)}`);
  }
  // Eine wirklich neue Farbe der anderen Warengruppe bleibt eine Neuigkeit.
  const drei = nachher.map((p, i) => zafira(p.title, p.handle, p.product_type, i === 0 ? ['Sand', 'Rauchblau', 'Moos'] : ['Sand', 'Rauchblau']));
  uhr = new Date(Date.parse('2026-10-20T05:00:00Z') + 61 * 864e5);
  const moos = await shopAbgleich(db, { ...opt, roh: drei, jetzt: uhr });
  assert.deepEqual(moos.neu.filter(n => n.neueFarben).map(n => n.handle), ['zafira-teppichboden']);
});

test('Ein Produkt-Reel je Produkt: geplante und wartende Reels zaehlen als belegt (Fjordia #133/#138)', () => {
  const feed = [{
    title: 'Fjordia Eiche Bernstein – Parkett', handle: 'fjordia', product_type: 'Parkett', tags: [],
    options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
    images: [{ id: 1, src: 'https://cdn.shopify.com/s/files/1/x/fjordia-raumbild-1.jpg?v=1', width: 4000, height: 3000, variant_ids: [] }],
    variants: [{ id: 11, title: 'Default Title', price: '209.48', compare_at_price: null, available: true }],
  }];
  const zeile = { media_id: '1', produkt_handle: 'fjordia', datei: 'fjordia-raumbild-1.jpg', status: 'geprueft', bildtyp: 'raum', bearbeitet: 'nein', lizenz: 'Shop und Werbung erlaubt' };
  const bildrechte = { nachMedium: new Map([['1', zeile]]), nachHandle: new Map([['fjordia', [zeile]]]) };
  assert.equal(reelKandidaten({ feed, bildrechte }).length, 1);
  assert.equal(reelKandidaten({ feed, bildrechte, belegt: new Map([['fjordia', [{ id: 133, status: 'GEPLANT' }]]]) }).length, 0);
});

test('Dasselbe Quellbild aus verschiedenen Inhalten hoechstens einmal in 14 Tagen (Eichwald #106/#112)', () => {
  const jetzt = new Date(2026, 9, 26, 8, 0);
  const kueche = ['eichwald-hellgrau-kueche.jpg'];
  const belegt = [{ geplantAm: new Date(2026, 9, 29, 12, 0).toISOString(), format: 'story', typ: 'produkt_farben', inhalt: 231, bilder: kueche }];
  const offen = [{ id: 112, typ: 'raumidee', quelle: 'shopify', format: 'story', punkte: 30, erstellt: jetzt.toISOString(), inhalt: 238, bilder: kueche }];
  const plan = plane({ offen, belegt, jetzt });
  assert.equal(plan.has(112), false, 'die naechsten 14 Tage liegen alle zu nah - kein Termin');
  const anderes = plane({ offen: [{ ...offen[0], bilder: ['eichwald-hellgrau-flur.jpg'] }], belegt, jetzt });
  assert.ok(anderes.has(112));
  const gleicherInhalt = plane({ offen: [{ ...offen[0], inhalt: 231 }], belegt, jetzt });
  assert.ok(gleicherInhalt.has(112), 'Story und Karussell desselben Inhalts duerfen dasselbe Bild zeigen');
  // Feed-Beitraege: der erste freie Tag liegt mindestens 14 Tage nach dem anderen Termin.
  const feed = plane({ offen: [{ ...offen[0], format: 'feed' }], belegt: [{ ...belegt[0], format: 'feed', geplantAm: new Date(2026, 9, 27, 18, 0).toISOString() }], jetzt });
  assert.ok(feed.get(112) - new Date(2026, 9, 27, 18, 0) >= 14 * 24 * 3600 * 1000, String(feed.get(112)));
});

test('Quellbilder: aufgezeichnet, ueber Medien oder das Titelbild eines Shop-Inhalts', () => {
  assert.deepEqual(quellBilder({ medien: [{ bilder: ['a.jpg'] }, { bilder: ['a.jpg', 'b.jpg'] }] }, {}), ['a.jpg', 'b.jpg']);
  assert.deepEqual(quellBilder({ medien: [{ quellen: [5, 6] }] }, { quelle: 'baustelle' }, [{ id: 5, pfad: 'x.jpg' }, { id: 6, url: 'https://cdn.shopify.com/s/files/1/x/Raum_0a1b2c3d-1111-2222-3333-444455556666.jpg?v=2' }]), ['medium:5', 'raum.jpg']);
  assert.deepEqual(quellBilder({ vorlage: 'produkt', medien: [{ quellen: [] }] }, { quelle: 'shopify', daten: { bilder: [{ src: 'https://cdn.shopify.com/x/zafira-rauchblau-710-raum-5ac997.jpg?v=1' }] } }), ['zafira-rauchblau-710-raum-5ac997.jpg']);
});

test('Zahlen vom Bautag: Designs aus dem letzten Abgleich, Farben aus den Varianten (JAB #91, Rapidia #117)', () => {
  const abgleich = '2026-10-26T05:00:00.000Z'; const frueher = '2026-10-12T05:00:00.000Z';
  const stand = new Map([
    ...Array.from({ length: 68 }, (_, i) => [`jab-${i}`, { handle: `jab-${i}`, familie: 'jab|teppichboden', zuletzt_gesehen: abgleich }]),
    ...['gobi', 'kalahari', 'puna', 'moto-twist'].map(h => [h, { handle: h, familie: 'jab|teppichboden', zuletzt_gesehen: frueher }]),
    ['rapidia', { handle: 'rapidia', familie: 'rapidia|teppichboden', farben: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], zuletzt_gesehen: abgleich }],
  ]);
  const jab = zahlenAmBautag(stand, { produkt_handle: 'jab-0', daten: { serie: true, familie: 'jab|teppichboden', produkte: Array.from({ length: 72 }) } });
  assert.equal(jab.designs, 68); assert.equal(jab.aktiv('gobi'), false);
  assert.equal(zahlenAmBautag(stand, { produkt_handle: 'rapidia', daten: {} }).farben, 9);
  assert.deepEqual(zahlenAmBautag(new Map(), { daten: {} }), {});
  assert.equal(zahlenAmBautag(stand, { daten: { serie: true, familie: 'unbekannt|teppichboden' } }).designs, undefined, 'unbekannte Familie: keine Zahl statt 0');
  assert.deepEqual(zahlenAusText('in 11 Farben, insgesamt 72 Designs, in fünf Farben, zwei neue Farben').map(z => [z.zahl, z.art]), [[11, 'farben'], [72, 'designs'], [5, 'farben']]);
  assert.deepEqual(zahlenImText('insgesamt in 11 Farben', { farben: 9 }), ['Text nennt „11 Farben“, im Shop sind es 9']);
  assert.deepEqual(zahlenImText('in 9 Farben', { farben: 9 }), []);
  assert.deepEqual(zahlenImText('insgesamt 72 Designs', { designs: 68 }), ['Text nennt „72 Designs“, im Shop sind es 68']);
});

test('Entwurf: Zahlen im Bild und Text vom Bautag, falsche Zahl im Text wird abgelehnt', async (t) => {
  const db = testDb(t, () => new Date('2026-10-26T08:00:00Z')); const dir = tmpDir(t);
  const abgleich = '2026-10-26T05:00:00.000Z';
  for (let i = 0; i < 68; i += 1) db.produktStandSetzen(`jab-${i}`, { familie: 'jab|teppichboden', zuletzt_gesehen: abgleich });
  for (const h of ['gobi', 'kalahari', 'puna', 'moto-twist']) db.produktStandSetzen(h, { familie: 'jab|teppichboden', zuletzt_gesehen: '2026-10-12T05:00:00.000Z' });
  const bilder = [{ src: 'https://cdn.shopify.com/x/jab-savanna-raum.jpg', breite: 2400, hoehe: 1800 }];
  const { id } = db.inhaltAnlegen({ quelle: 'shopify', typ: 'produkt_neu', titel: 'Neue Serie: JAB', produkt_handle: 'jab-0', produkt_titel: 'JAB Anstoetz Savanna Teppichboden 400cm', einwilligung: true,
    daten: { serie: true, familie: 'jab|teppichboden', familienName: 'JAB', gruppe: 'Teppichboden', produkte: [...Array.from({ length: 68 }, (_, i) => `jab-${i}`), 'gobi', 'kalahari', 'puna', 'moto-twist'], bilder, serienBilder: [] } });
  const plan = standardBauplan(db.inhalt(id), [], 'feed', zahlenAmBautag(db.produktStand(), db.inhalt(id)));
  assert.match(plan.folien[0].daten.zeile, /68 Designs/);
  await assert.rejects(erstelleEntwurf(db, { inhaltId: id, format: 'feed', text: 'Neu in unserem Shop: Teppichböden von JAB Anstoetz, insgesamt 72 Designs. Muster gibt es kostenlos.' }, { rendere: scheinRendern, dir }), /72 Designs.*68/);
  const b = await erstelleEntwurf(db, { inhaltId: id, format: 'feed', text: 'Neu in unserem Shop: Teppichböden von JAB Anstoetz, insgesamt 68 Designs. Muster gibt es kostenlos.' }, { rendere: scheinRendern, dir });
  assert.deepEqual(b.medien[0].bilder, ['jab-savanna-raum.jpg']); assert.equal(b.medien[0].preis, null);
});

test('Ein Farbbeitrag zeigt die angekuendigte neue Farbe (Alvento #81: Basalt angekuendigt, Senf im Bild)', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const senf = { src: 'https://cdn.shopify.com/x/alvento-senf-050.jpg', breite: 2400, hoehe: 1800, farbe: 'Senf (050)' };
  const basalt = { src: 'https://cdn.shopify.com/x/alvento-basalt-060.jpg', breite: 2400, hoehe: 1800, farbe: 'Basalt (060)' };
  const anlegen = farbBilder => db.inhaltAnlegen({ quelle: 'shopify', typ: 'produkt_farben', titel: 'Alvento', produkt_handle: 'alvento', produkt_titel: 'Alvento Teppich nach Maß', einwilligung: true,
    daten: { familie: 'alvento|teppich nach maß', familienName: 'Alvento', gruppe: 'Teppich nach Maß', neueFarben: ['Basalt (060)'], bilder: [senf, basalt], farbBilder } }).id;
  const ohne = anlegen([]);
  await assert.rejects(erstelleEntwurf(db, { inhaltId: ohne, format: 'story', text: 'Alvento gibt es jetzt auch in Basalt. Muster bekommen Sie kostenlos über den Shop.' }, { rendere: scheinRendern, dir }), WerkstattFehler);
  const mit = anlegen([{ ...basalt, beschriftung: basalt.farbe }]);
  const story = await erstelleEntwurf(db, { inhaltId: mit, format: 'story', text: 'Alvento gibt es jetzt auch in Basalt. Muster bekommen Sie kostenlos über den Shop.' }, { rendere: scheinRendern, dir });
  assert.deepEqual(story.medien[0].bilder, ['alvento-basalt-060.jpg'], 'Titelbild ist die neue Farbe, nicht das erste Raumbild');
  assert.equal(neueFarbeGezeigt(db.inhalt(mit), ['alvento-senf-050.jpg']), false);

  // Der Scout legt "neue Farbe" nur mit einem Bild dieser Farbe an - und dann mit diesem Bild vorn.
  const p = farben => feedProdukt({ title: 'Alvento Teppich nach Maß', handle: 'alvento', product_type: 'Teppich nach Maß', tags: [],
    options: [{ name: 'Farbe', position: 1, values: farben }],
    images: [{ src: 'https://cdn.shopify.com/x/alvento-senf-raum.jpg', width: 2400, height: 1800, variant_ids: [1] }, ...(farben.includes('Basalt') ? [{ src: 'https://cdn.shopify.com/x/alvento-basalt.jpg', width: 2400, height: 1800, variant_ids: [2] }] : [])],
    variants: farben.map((f, i) => ({ id: i + 1, option1: f, price: '0.48', compare_at_price: null, available: true })) });
  const stand = new Map([['alvento', { farben: ['Senf'] }]]);
  const jetzt = new Date('2026-10-20T05:00:00Z');
  const ohneBild = findeKandidaten({ produkte: [normalisiere(p(['Senf', 'Jeansblau']))], stand, jetzt });
  assert.equal(ohneBild.filter(k => k.neueFarben).length, 0);
  const mitBild = findeKandidaten({ produkte: [normalisiere(p(['Senf', 'Basalt']))], stand, jetzt }).find(k => k.neueFarben);
  assert.match(mitBild.bilder[0].src, /basalt/);
});

test('Serienfolie: Marke bleibt, Rollenbreite und Warengruppe fallen weg (JAB #91)', () => {
  const p = (titel, marke, typ = 'Teppichboden') => normalisiere({ title: titel, handle: 'x', vendor: marke, product_type: typ, variants: [], images: [], options: [] });
  assert.equal(serienBeschriftung(p('JAB Anstoetz Savanna Teppichboden 400cm', 'JAB Anstoetz'), 'JAB'), 'JAB Anstoetz Savanna');
  assert.equal(serienBeschriftung(p('JAB Anstoetz Twilight SD Teppichboden 400cm', 'JAB Anstoetz'), 'JAB'), 'JAB Anstoetz Twilight SD');
  assert.equal(serienBeschriftung(p('Solenta Eiche Hell', 'Solenta', 'Klebevinyl'), 'Solenta'), 'Eiche Hell');
});
