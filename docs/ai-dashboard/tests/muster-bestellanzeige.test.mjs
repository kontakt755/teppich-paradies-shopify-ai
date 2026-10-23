import test from 'node:test';
import assert from 'node:assert/strict';
import { musterAutomatikHtml, musterAutomatikBlock } from '../bausteine/muster-bestellanzeige.mjs';
const bestellung = { am: '2026-10-23T10:00:00Z', an: 'muster@lieferant-a.example', lieferziel: 'laden', positionen: [{ titel: '<img src=x onerror=alert(1)>', farbe: 'Grau', menge: 1 }] };
test('Bestellanzeige trennt echten Versandnachweis von Klaerung und maskiert Quelldaten', () => {
  const html = musterAutomatikHtml({ bestellt: [bestellung], klaeren: [{ grund: 'Zweite Farbe fehlt' }] });
  assert.match(html, /Muster bestellt/); assert.match(html, /Grau/); assert.match(html, /Klärung nötig/);
  assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img')); assert.match(html, /zu uns ins Geschäft/);
  assert.ok(!html.includes('geliefert'));
});
test('Startseite zeigt Kunden, Farben und Datum ohne Aufklappen', () => {
  const html = musterAutomatikBlock({ musterAutomatik: { aktiv: true }, zeilen: [{ kundenname: 'Testkunde', orderName: '#T1', musterAutomatik: { bestellt: [bestellung] } }] }, Date.parse('2026-10-23T12:00:00Z'));
  assert.match(html, /Testkunde/); assert.match(html, /#T1/); assert.match(html, /Grau/); assert.match(html, /Muster bestellt/);
});
test('Ohne Automatik keine unbelegte Aktivmeldung, Stoerung bleibt sichtbar', () => {
  assert.equal(musterAutomatikBlock({}), '');
  assert.match(musterAutomatikBlock({ musterAutomatik: { aktiv: false, hinweis: 'Ablage beschädigt' } }), /Ablage beschädigt/);
});
