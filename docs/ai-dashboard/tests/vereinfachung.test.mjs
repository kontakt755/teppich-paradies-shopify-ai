import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { vorgangsLink, filtereAuftrag } from '../lib/vorgangslink.mjs';
import { musterKaufLinks, sichereMusterLinks } from '../lib/muster-kauf-links.mjs';
import { fuelleText } from '../lib/muster-nachfassen.mjs';
import { montageAus } from '../../../scripts/laden-zahlen.mjs';
const quelle = { istMuster: true, handle: 'muster-test-boden', sku: 'M-TEST-1', farbe: 'Grau' };
const produkt = { handle: 'test-boden', titel: 'Testboden', status: 'ACTIVE', varianten: [{ id: 'gid://shopify/ProductVariant/123', sku: 'TEST-1', farbe: 'Grau', verfuegbar: true }] };
test('Vorgangssprung erhält echte IDs unverändert und begrenzt die ganze Einkaufsansicht ohne den Quellspeicher zu filtern', () => {
  const id = 'gid://shopify/Order/123'; const href = vorgangsLink('einkauf', { auftrag: id, af: 'bestellt' });
  assert.equal(new URLSearchParams(href.split('?')[1]).get('auftrag'), id);
  assert.match(href, /von=heute/);
  const d = { auftraege: [{ id }, { id: 'anders' }], gruppen: [{ positionen: [{ orderId: id }, { orderId: 'anders' }] }], musterGruppen: [] };
  assert.equal(filtereAuftrag(d, id).gruppen[0].positionen.length, 1); assert.equal(d.gruppen[0].positionen.length, 2);
  assert.equal(filtereAuftrag(d, 'nicht vorhanden').auftraege.length, 0);
});
test('Musterlinks: genaue aktive Variante, dedupliziert; archivierte, fehlende, mehrdeutige oder unbekannte Quellen fallen weg', () => {
  const r = musterKaufLinks([quelle, quelle], [produkt]); assert.equal(r.length, 1); assert.match(r[0].url, /test-boden\?variant=123$/);
  for (const p of [{ ...produkt, status: 'ARCHIVED' }, { ...produkt, status: null }, { ...produkt, varianten: [] }, { ...produkt, varianten: [...produkt.varianten, { ...produkt.varianten[0], id: '124' }] }]) assert.deepEqual(musterKaufLinks([quelle], [p]), []);
  assert.deepEqual(sichereMusterLinks([{ ...r[0], url: 'https://example.invalid/kunden?email=privat' }]), []);
});
test('Bestehender manueller Nachfasstext erhält Auswahl, aber keinen privaten Akten-/Trackinglink und sendet nichts', () => {
  const links = musterKaufLinks([quelle], [produkt]);
  const r = fuelleText({ betreff: 'Ihre Muster', text: 'Guten Tag {Anrede} {Nachname},\nWir beraten gern.\n{Name}' }, { kundenname: 'Testkunde', absender: 'Team', produkte: links });
  assert.match(r.text, /Ihre gewählten Böden/); assert.match(r.text, /Testboden · Grau/); assert.match(r.text, /variant=123/); assert.ok(!r.text.includes('#/kunden'));
  assert.ok(!fuelleText({ text: 'Hallo' }, { produkte: [] }).text.includes('Böden'));
});
test('v49-Laufzeiten sind optionale echte Integer; fehlend/unzulässig wird niemals 0', () => {
  assert.deepEqual(montageAus({ letzterLaufMin: 0, laufzeitHeuteSek: 15 }), { letzterLaufMin: 0, laufzeitHeuteSek: 15 });
  assert.equal(montageAus({ letzterLaufMin: -1, laufzeitHeuteSek: '15' }), null);
  assert.deepEqual(montageAus({ einsaetzeHeute: 2 }), { einsaetzeHeute: 2 });
});
