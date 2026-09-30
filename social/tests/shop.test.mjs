import assert from 'node:assert/strict';
import test from 'node:test';
import { findeKandidaten, saison, waehleAus } from '../lib/produkt-auswahl.mjs';
import { bildRolle, bildTauglich, familie, normalisiere } from '../lib/shop-quelle.mjs';
import { feedProdukt } from './_hilfe.mjs';

const JETZT = new Date('2026-10-01T09:00:00+02:00');
const n = extra => normalisiere(feedProdukt(extra));

test('Bildrolle und Tauglichkeit kommen aus Dateiname und Groesse', () => {
  assert.equal(bildRolle({ src: 'https://x/bodenbelag-dekor-2835-raumbild-11.jpg?v=1' }), 'raum');
  assert.equal(bildRolle({ src: 'https://x/dekor-detail-13.jpg' }), 'detail');
  assert.equal(bildRolle({ src: 'https://x/1213330-8FXC-prod.jpg' }), 'produkt');
  assert.equal(bildTauglich({ width: 397, height: 1590 }), false, 'schmaler Musterstreifen');
  assert.equal(bildTauglich({ width: 2480, height: 1860 }), true);
});

test('Familie: alle Dekore einer Serie gehoeren zusammen', () => {
  assert.equal(familie('Solenta Eiche Hell', 'Klebevinyl').schluessel, familie('Solenta Buche Blond', 'Klebevinyl').schluessel);
  assert.equal(familie('WOHNWELT-Kollektion Teppich ALBA', 'Teppich').name, 'WOHNWELT-Kollektion');
  assert.notEqual(familie('Solenta Eiche', 'Klebevinyl').schluessel, familie('Sylvara 655', 'Klebevinyl').schluessel);
});

test('Normalisieren: Rabatt, Farben je Bild, Zubehoer', () => {
  const p = n({ options: [{ name: 'Farbe', position: 1, values: ['Grau', 'Beige'] }], variants: [{ id: 1, option1: 'Grau', price: '36.90', compare_at_price: '49.90', available: true }, { id: 2, option1: 'Beige', price: '36.90', compare_at_price: '49.90', available: false }], images: [{ src: 'https://x/a.jpg', width: 1600, height: 1600, variant_ids: [1] }] });
  assert.equal(p.rabattProzent, 26); assert.deepEqual(p.farben, ['Grau', 'Beige']); assert.equal(p.bilder[0].farbe, 'Grau'); assert.equal(p.verfuegbar, true);
  assert.equal(n({ product_type: 'Kleber & Fixierung' }).zubehoer, true);
  assert.equal(p.beschreibung, 'Robustes Klebevinyl.');
});

test('Der uebliche Shop-Rabatt ist kein Angebot, ein Ausreisser schon', () => {
  const ueblich = findeKandidaten({ produkte: [n()], jetzt: JETZT });
  assert.equal(ueblich.some(k => k.art === 'angebot'), false);
  const stark = findeKandidaten({ produkte: [n({ variants: [{ id: 1, price: '36.90', compare_at_price: '49.90', available: true }] })], jetzt: JETZT });
  assert.equal(stark[0].art, 'angebot'); assert.equal(stark[0].rabattProzent, 26);
});

test('Neue Serie wird ein Anlass statt sieben', () => {
  const neu = ['ALBA', 'BELA', 'CARA'].map(x => n({ title: `WOHNWELT-Kollektion Teppich ${x}`, handle: `sw-${x.toLowerCase()}`, product_type: 'Teppich', published_at: '2026-09-30T10:00:00+02:00' }));
  const k = findeKandidaten({ produkte: neu, jetzt: JETZT });
  assert.equal(k.length, 1); assert.equal(k[0].art, 'produkt_neu'); assert.equal(k[0].serie, true);
  assert.equal(k[0].serienBilder.length, 3); assert.equal(k[0].serienBilder[0].beschriftung, 'Teppich ALBA');
  assert.match(k[0].schluessel, /^shopify:produkt_neu:wohnwelt-kollektion\|teppich:2026-10$/);
});

test('Ohne taugliches Bild, als Zubehoer oder ausverkauft: kein Anlass', () => {
  assert.equal(findeKandidaten({ produkte: [n({ images: [{ src: 'https://x/s.jpg', width: 397, height: 1590, variant_ids: [] }] })], jetzt: JETZT }).length, 0);
  assert.equal(findeKandidaten({ produkte: [n({ product_type: 'Bauchemie' })], jetzt: JETZT }).length, 0);
  assert.equal(findeKandidaten({ produkte: [n({ variants: [{ id: 1, price: '9', available: false }] })], jetzt: JETZT }).length, 0);
});

test('Eine kuerzlich gezeigte Familie ruht; eine neue Farbe wird erkannt', () => {
  const p = n({ options: [{ name: 'Farbe', position: 1, values: ['Grau', 'Beige', 'Gold'] }] });
  const vorZehnTagen = new Date(JETZT.getTime() - 10 * 864e5).toISOString();
  assert.equal(findeKandidaten({ produkte: [p], stand: new Map([[p.handle, { zuletzt_beworben: vorZehnTagen }]]), jetzt: JETZT }).length, 0);
  const k = findeKandidaten({ produkte: [p], stand: new Map([[p.handle, { farben: ['Grau', 'Beige'] }]]), jetzt: JETZT });
  assert.equal(k[0].art, 'produkt_farben'); assert.deepEqual(k[0].neueFarben, ['Gold']);
});

test('Jahreszeit und Musterbestellungen heben, Auswahl bleibt gemischt', () => {
  assert.equal(saison(new Date('2026-10-01')), 'herbst'); assert.equal(saison(new Date('2026-04-01')), 'fruehling');
  const teppich = n({ title: 'Regalia Teppichboden', handle: 'regalia', product_type: 'Teppichboden' });
  const ohne = findeKandidaten({ produkte: [teppich], jetzt: JETZT })[0].punkte;
  const mit = findeKandidaten({ produkte: [teppich], nachfrage: new Map([['regalia', 3]]), jetzt: JETZT })[0].punkte;
  assert.equal(mit - ohne, 15);
  const viele = Array.from({ length: 8 }, (_, i) => ({ art: 'raumidee', familie: `f${i}`, gruppe: 'Klebevinyl', punkte: 50 - i, schluessel: `s${i}` }));
  assert.equal(waehleAus(viele).length, 3, 'hoechstens drei je Art und Warengruppe');
});
