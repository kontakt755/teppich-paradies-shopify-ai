import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Kettelpuffer im Bestelldialog (#1684). Nur synthetische Werte; die Ansicht wird wie in
// bestellvorbereitung-dialog.test.mjs ohne Importe geladen.
const quelle = fs.readFileSync(new URL('../ansichten/einkauf/lieferanten.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const { kettlerHinweis } = vm.runInNewContext(`${quelle}\n({ kettlerHinweis })`, {
  state: {}, einkauf: {}, esc: v => String(v ?? '').replace(/</g, '&lt;'), anzeigeWert: v => v,
});

const puffer = [{ orderName: '#T4', lineItemId: 'test-item', titel: 'Testteppich nach Maß', fertigmass: '180 × 250 cm', zuschnittmass: '183 × 253 cm' }];

test('Kettelpuffer: Hinweis mit Fertig- und Zuschnittmass steht vor dem Bestellen', () => {
  const html = kettlerHinweis({ art: 'ware', lieferziel: 'kettler', kettlerAutomatisch: true, kettelPuffer: puffer });
  assert.match(html, /\+3 cm Zuschnittpuffer je Länge und Breite für anschließendes Ketteln/);
  assert.match(html, /#T4 · Testteppich nach Maß: Fertigmaß 180 × 250 cm → bestellt wird 183 × 253 cm/);
  assert.match(html, /ungekettelt im Zuschnittmaß dorthin/);
  // Von Hand "Kettler" gewaehlt: derselbe Hinweis, ohne Regeltext.
  const hand = kettlerHinweis({ art: 'ware', lieferziel: 'kettler', kettlerAutomatisch: false, kettlerMoeglich: true, kettelPuffer: puffer });
  assert.match(hand, /Zuschnittpuffer/);
  assert.equal(hand.includes('Nach unserer Regel'), false);
  assert.equal(html.includes('Rollenbreite unbekannt'), false);
  const ohneRolle = kettlerHinweis({ art: 'ware', lieferziel: 'kettler', kettelPuffer: [{ ...puffer[0], rolleUnbekannt: true }] });
  assert.match(ohneRolle, /Rollenbreite unbekannt – bitte prüfen, ob es aus der Rolle passt/);
});

test('Kettelpuffer: ohne Kettler-Weg kein Hinweis, Werte werden maskiert', () => {
  assert.equal(kettlerHinweis({ art: 'ware', lieferziel: 'laden', kettlerMoeglich: false, kettelPuffer: [] }), '');
  assert.equal(kettlerHinweis({ art: 'muster', lieferziel: 'kunde' }), '');
  const html = kettlerHinweis({ art: 'ware', lieferziel: 'kettler', kettelPuffer: [{ ...puffer[0], titel: '<b>x</b>' }] });
  assert.equal(html.includes('<b>x</b>'), false);
});
