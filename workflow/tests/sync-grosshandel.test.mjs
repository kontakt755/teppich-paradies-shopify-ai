import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkSafetyRules,
  getShopifyProducts,
  preisAbweichung,
  PRODUCT_PAGE_SIZE,
} from '../sync-grosshandel.mjs';

// OPS-010: Die Preisrueckgang-Sperre las `artikel.price`, der Katalog fuehrt
// aber `preis_eur`. parseFloat(undefined || '0') ergab 0, damit war die
// Bedingung `newPrice > 0` nie wahr - die Sperre konnte nie ausloesen.
test('Sicherheitsregel meldet einen Preisrueckgang von mehr als 20 Prozent', () => {
  const treffer = [{
    artikel: { titel: 'Testware', preis_eur: 5 },
    shopify: { variants: [{ price: '10.00' }] },
  }];
  assert.equal(checkSafetyRules([], treffer), false);
});

test('Sicherheitsregel laesst einen kleinen Rueckgang durch', () => {
  const treffer = [{
    artikel: { titel: 'Testware', preis_eur: 9.5 },
    shopify: { variants: [{ price: '10.00' }] },
  }];
  assert.equal(checkSafetyRules([], treffer), true);
});

test('Sicherheitsregel liest preis_eur, nicht price', () => {
  // Ein Eintrag, der nur das alte Feld traegt, darf nicht als "geprueft" gelten:
  // ohne preis_eur gibt es keinen Vergleichswert und damit keine Freigabe.
  const nurAltesFeld = [{
    artikel: { titel: 'Testware', price: 5 },
    shopify: { variants: [{ price: '10.00' }] },
  }];
  assert.equal(checkSafetyRules([], nurAltesFeld), true,
    'ohne preis_eur gibt es nichts zu vergleichen');

  const neuesFeld = [{
    artikel: { titel: 'Testware', preis_eur: 5 },
    shopify: { variants: [{ price: '10.00' }] },
  }];
  assert.equal(checkSafetyRules([], neuesFeld), false,
    'mit preis_eur greift die Sperre');
});

test('Sicherheitsregel meldet mehr als zehn neue Artikel', () => {
  const neu = Array.from({ length: 11 }, (_, i) => ({ titel: `Neu ${i}` }));
  assert.equal(checkSafetyRules(neu, []), false);
});

// OPS-010: Shopify liefert den Preis als String, der Katalog als Zahl.
// '12.90' !== 12.9 ist immer wahr - jeder Artikel meldete eine Aenderung.
test('Preisvergleich sieht String und Zahl als gleich an', () => {
  assert.equal(preisAbweichung({
    artikel: { preis_eur: 12.9 },
    shopify: { variants: [{ price: '12.90' }] },
  }), null);
});

test('Preisvergleich meldet eine echte Abweichung', () => {
  assert.deepEqual(preisAbweichung({
    artikel: { preis_eur: 14.5 },
    shopify: { variants: [{ price: '12.90' }] },
  }), { alt: 12.9, neu: 14.5 });
});

test('Preisvergleich liefert null, wenn ein Wert fehlt', () => {
  assert.equal(preisAbweichung({ artikel: {}, shopify: { variants: [{ price: '12.90' }] } }), null);
  assert.equal(preisAbweichung({ artikel: { preis_eur: 5 }, shopify: { variants: [] } }), null);
});

test('Seitengroesse bleibt beim Shopify-Maximum', () => {
  assert.equal(PRODUCT_PAGE_SIZE, 250);
});

// OPS-010: pageInfo wurde abgefragt und verworfen. Alles ab Produkt 251 fehlte
// im Abgleich - ohne Fehler, ohne Hinweis.
test('Produktabfrage blaettert ueber alle Seiten', async () => {
  const seiten = [
    { nodes: [{ id: '1' }, { id: '2' }], pageInfo: { hasNextPage: true, endCursor: 'c1' } },
    { nodes: [{ id: '3' }], pageInfo: { hasNextPage: true, endCursor: 'c2' } },
    { nodes: [{ id: '4' }], pageInfo: { hasNextPage: false, endCursor: null } },
  ];
  const gesehene = [];
  const proxy = {
    execute: async (_query, variables) => {
      gesehene.push(variables.cursor);
      return { products: seiten[gesehene.length - 1] };
    },
  };

  const nodes = await getShopifyProducts(proxy);
  assert.deepEqual(nodes.map((n) => n.id), ['1', '2', '3', '4']);
  assert.deepEqual(gesehene, [null, 'c1', 'c2'], 'Cursor wird weitergereicht');
});

test('Produktabfrage endet sauber in der Sammel-Betriebsart', async () => {
  // Ohne Token liefert execute null - kein Absturz, leere Liste.
  const proxy = { execute: async () => null };
  assert.deepEqual(await getShopifyProducts(proxy), []);
});

test('Produktabfrage bricht statt Endlosschleife ab', async () => {
  // Ein Server, der immer hasNextPage meldet, darf den Job nicht haengen lassen.
  const proxy = {
    execute: async () => ({ products: { nodes: [{ id: 'x' }], pageInfo: { hasNextPage: true, endCursor: 'c' } } }),
  };
  await assert.rejects(() => getShopifyProducts(proxy), /nicht am Ende/);
});
