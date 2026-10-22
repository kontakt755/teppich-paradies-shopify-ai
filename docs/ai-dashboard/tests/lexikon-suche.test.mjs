import test from 'node:test';
import assert from 'node:assert/strict';
import { suchbegriffe, lexikonTreffer, nurUeberTitel } from '../lib/lexikon-suche.mjs';

// Nur erfundene Daten: Shop-Name "Amalia", beim Lieferanten "Kora" aus der Linie "Linie 027".
const produkt = {
  titel: 'Amalia Teppichboden 400cm 500cm', handle: 'amalia-teppichboden', produktgruppe: 'Teppichboden',
  varianten: [
    { id: 1, titel: 'Grau Dunkel / 400 cm', sku: 'TEPKORA4_098', farbe: 'Grau Dunkel',
      einkauf: { artikelnummer: 'TEPKORA4_098', farbnummer: '98', produktname: 'Teppichboden Kora 400 cm Linie 027', kollektion: 'Linie 027' } },
    { id: 2, titel: 'Grau Dunkel / 500 cm', sku: 'TEPKORA5_098', farbe: 'Grau Dunkel',
      einkauf: { artikelnummer: 'TEPKORA5_098', farbnummer: '98', produktname: 'Teppichboden Kora 400 cm Linie 027', kollektion: 'Linie 027' } },
    { id: 3, titel: 'Grau Hell / 400 cm', sku: 'TEPKORA4_095', farbe: 'Grau Hell',
      einkauf: { artikelnummer: 'TEPKORA4_095', farbnummer: '95', produktname: 'Teppichboden Kora 400 cm Linie 027', kollektion: 'Linie 027' } },
    { id: 4, titel: 'Beige / 400 cm', sku: 'TEPKORA4_198', farbe: 'Beige',
      einkauf: { artikelnummer: 'TEPKORA4_198', farbnummer: '198', produktname: 'Teppichboden Kora 400 cm Linie 027', kollektion: 'Linie 027' } },
  ],
};
const ids = t => t.varianten.map(v => v.id);

test('Lieferantenname mit angeklebter Liniennummer findet das Shop-Produkt', () => {
  const t = lexikonTreffer(produkt, suchbegriffe('Linie027 Kora'));
  assert.equal(t.passt, true);
  assert.deepEqual(ids(t), [1, 2, 3, 4], 'ohne Farbnummer passen alle Farben');
  assert.equal(lexikonTreffer(produkt, suchbegriffe('Kora Linie 027')).passt, true, 'Reihenfolge und Leerzeichen egal');
  assert.equal(lexikonTreffer(produkt, suchbegriffe('Linie028 Kora')).passt, false, 'falsche Linie passt nicht');
});

test('Farbnummer trifft genau die Farbe, auch mit fuehrender Null, aber nie 198 fuer 98', () => {
  assert.deepEqual(ids(lexikonTreffer(produkt, suchbegriffe('Linie027 Kora 98'))), [1, 2]);
  assert.deepEqual(ids(lexikonTreffer(produkt, suchbegriffe('kora 098'))), [1, 2]);
  assert.deepEqual(ids(lexikonTreffer(produkt, suchbegriffe('kora 198'))), [4]);
});

test('Woerter verteilt ueber Produkt und Variante passen, ueber zwei Farben nur das Produkt', () => {
  assert.deepEqual(ids(lexikonTreffer(produkt, suchbegriffe('Amalia grau hell'))), [3]);
  const t = lexikonTreffer(produkt, suchbegriffe('95 98'));
  assert.equal(t.passt, true);
  assert.deepEqual(t.varianten, []);
});

test('Umlaute und Gross-/Kleinschreibung', () => {
  const p = { titel: 'Velours Grün', handle: 'velours-gruen', varianten: [{ id: 1, farbe: 'Grün' }] };
  assert.equal(lexikonTreffer(p, suchbegriffe('GRUEN')).passt, true);
  assert.equal(lexikonTreffer(p, suchbegriffe('grün')).passt, true);
});

test('Muster findet man ueber Artikel- und Farbnummer des Originals', () => {
  const muster = { titel: 'Muster Amalia', handle: 'muster-amalia', varianten: [{ id: 9, sku: 'M-1',
    original: { artikelnummer: 'TEPKORA4_098', farbnummer: '98', kollektion: 'Linie 027', produktTitel: 'Amalia Teppichboden' } }] };
  assert.equal(lexikonTreffer(muster, suchbegriffe('Linie027 98')).passt, true);
  assert.equal(lexikonTreffer(muster, suchbegriffe('Linie027 95')).passt, false);
});

test('nurUeberTitel: Lieferantenname muss die Karte erklaeren, Shop-Name nicht', () => {
  assert.equal(nurUeberTitel(produkt, suchbegriffe('amalia')), true);
  assert.equal(nurUeberTitel(produkt, suchbegriffe('Linie027 Kora')), false);
});

test('leere Suche passt immer und nennt keine Farbe', () => {
  assert.deepEqual(suchbegriffe('   '), []);
  assert.deepEqual(lexikonTreffer(produkt, []), { passt: true, varianten: [] });
});
