import test from 'node:test';
import assert from 'node:assert/strict';
import { aktualisierePackwerte, packhilfeHtml, packgewicht } from '../ansichten/einkauf/packhilfe.mjs';

test('Bruttogewicht rundet auf 10g ohne kuenstliches Extragramm durch Binaerreste', () => {
  assert.equal(packgewicht(3.4 * 2 + 0.5), 7.3);
  assert.equal(packgewicht(7.301), 7.31);
  assert.equal(packgewicht(null), null);
});

test('neue Vorschlaege ersetzen automatische Werte, lassen bewusste Messkorrekturen stehen', () => {
  const r = aktualisierePackwerte({ laenge: '122', breite: '30', hoehe: '25', gewicht: '' },
    { laenge: 132, breite: 28, hoehe: 28, gewicht: 7.6 }, { laenge: '122', breite: '25', hoehe: '25' });
  assert.deepEqual(r.werte, { laenge: '132', breite: '30', hoehe: '28', gewicht: '7.6' });
});

test('unvollstaendige Neuberechnung entfernt alte automatische Zahlen statt sie plausibel stehenzulassen', () => {
  const r = aktualisierePackwerte({ laenge: '122', breite: '25', hoehe: '25', gewicht: '7.6' },
    { laenge: 122, breite: null, hoehe: null, gewicht: null }, { laenge: '122', breite: '25', hoehe: '25', gewicht: '7.6' });
  assert.deepEqual(r.werte, { laenge: '122', breite: '', hoehe: '', gewicht: '' });
});

test('ausdrueckliche Uebernahme ersetzt manuelle Abweichungen, auch unbekannte Werte bleiben leer', () => {
  const r = aktualisierePackwerte({ laenge: '80', breite: '25', hoehe: '25', gewicht: '5' },
    { laenge: 122, breite: 24, hoehe: 24, gewicht: null }, {}, true);
  assert.deepEqual(r.werte, { laenge: '122', breite: '24', hoehe: '24', gewicht: '' });
});

test('Artikeldaten sind escaped, fehlende Materialwerte und Verpackungsgewicht bleiben leer', () => {
  const html = packhilfeHtml([{ id: '\"><b>', titel: '<script>', farbe: '<img>', packhilfe: { breiteCm: 120, laengeCm: 170, form: 'rechteck', menge: 1 } }]);
  assert(!html.includes('<script>')); assert(!html.includes('<img>'));
  assert.match(html, /data-kh-feld="gewichtGm2" type="text" inputmode="decimal" value=""/);
  assert.match(html, /data-kh-option="verpackungKg"[^>]*value=""/);
  assert.match(html, /Gesamtgewicht fehlt/);
  assert(!html.includes('name="gemessen"'));
});
