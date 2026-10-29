// Rundgang 29.10. (A1, A5, A12): rote Betriebsmeldungen mit Weg, Entfernt-Zeile kurz. Nur erfundene Daten.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ||= { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
const { shopifyAbgleich, shopifyAbgleichTodos } = await import('../ansichten/einkauf/shopify-abgleich.mjs');
const { shopwache, viewShopwache } = await import('../ansichten/shopwache.mjs');

test('Entfernt-Zeile ohne Artikelnamen; die Artikel bleiben im Dialog', () => {
  shopifyAbgleich.daten = { verfuegbar: true, abweichungen: [], entfernt: [{
    orderId: 'gid://shopify/Order/1', orderName: '#T1', kunde: 'Testkunde', seit: '2026-10-22T09:00:00Z', lineItemIds: ['a', 'b', 'c'],
    positionen: [{ titel: 'Testartikel Eins', lieferant: 'C' }, { titel: 'Testartikel Zwei', lieferant: 'C' }, { titel: 'Testartikel Drei', lieferant: 'C' }],
  }] };
  const [t] = shopifyAbgleichTodos(Date.parse('2026-10-29T09:00:00Z'), { lieferantName: id => `Lieferant ${id}` });
  assert.equal(t.ton, 'crit');
  assert.match(t.kontext, /^Testkunde · 3 Artikel nicht mehr in der Bestellung, aber bei Lieferant C bestellt am /);
  assert.doesNotMatch(t.kontext, /Testartikel/, 'Artikelnamen stehen im Dialog, nicht in der Zeile');
  shopifyAbgleich.daten = null;
});

test('Shop-Kontrolle listet jede gestoerte Routine, sonst nichts dazu', () => {
  const basis = { verfuegbar: true, ampel: 'gruen', geprueftAm: '2026-10-29T08:00:00Z', basis: 'https://shop.example.invalid', seiten: [], preise: [], befunde: [] };
  shopwache.daten = { ...basis, routinen: [
    { titel: 'Lieferbelege aus dem Postfach', ok: false, meldung: 'Werkzeug abgelehnt' },
    { titel: 'Datenstand', ok: true },
    { titel: 'Service-Anfragen aus dem Postfach', stumm: true, stummText: 'seit 6 Stunden kein erfolgreicher Lauf' },
  ] };
  const html = viewShopwache();
  assert.match(html, /<b>Mac-Dienst gestört:<\/b>/);
  assert.match(html, /<li><b>Lieferbelege aus dem Postfach<\/b> – Werkzeug abgelehnt<\/li>/);
  assert.match(html, /<li><b>Service-Anfragen aus dem Postfach<\/b> – seit 6 Stunden kein erfolgreicher Lauf<\/li>/);
  assert.doesNotMatch(html, /<b>Datenstand<\/b>/);
  shopwache.daten = { ...basis, routinen: [{ titel: 'Datenstand', ok: true }] };
  assert.doesNotMatch(viewShopwache(), /Mac-Dienst gestört/);
  shopwache.daten = null;
});
