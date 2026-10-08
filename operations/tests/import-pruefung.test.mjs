import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruefeImporte, jsonlZuProdukten, ueblicheFelder, bericht } from '../lib/import-pruefung.mjs';
import { argumente } from '../scripts/import-pruefen.mjs';

let n = 0;
function produkt(over = {}) {
  n += 1;
  return {
    id: `gid://shopify/Product/${n}`,
    handle: `p-${n}`,
    title: `P ${n}`,
    status: 'ACTIVE',
    productType: 'Klebevinyl',
    tags: [],
    createdAt: '2026-09-01T10:00:00Z',
    onlineStoreUrl: `https://shop/p-${n}`,
    category: 'Hardware > Flooring',
    mediaCount: 2,
    options: [{ name: 'Title', values: ['Default Title'] }],
    collections: ['klebevinyl'],
    custom: { arten: '["gid://shopify/Metaobject/1"]', nutzschicht: '0,55 mm' },
    variants: [{ id: `v${n}`, sku: `SKU-${n}`, title: 'Default Title', price: '29.90', image: null, selectedOptions: [], custom: {} }],
    ...over,
  };
}
const vergleich = (k = 5, over = {}) => Array.from({ length: k }, () => produkt(over));
const regeln = (erg) => erg.befunde.map((b) => `${b.stufe}:${b.regel}`).sort();

test('ein sauberes neues Produkt ergibt keinen Befund', () => {
  const neu = produkt({ createdAt: '2026-10-07T08:00:00Z' });
  const erg = pruefeImporte({ produkte: [...vergleich(), neu], seit: '2026-10-01' });
  assert.equal(erg.geprueft, 1);
  assert.deepEqual(erg.befunde, []);
});

test('aktiv ohne Veroeffentlichung, ohne Bilder, ohne Kategorie und Preis 0 sind Fehler', () => {
  const neu = produkt({
    createdAt: '2026-10-07T08:00:00Z', onlineStoreUrl: null, mediaCount: 0, collections: ['intern-regulaerer-preis'],
  });
  neu.variants[0].price = '0.00';
  const erg = pruefeImporte({ produkte: [...vergleich(), neu], seit: '2026-10-01' });
  assert.deepEqual(regeln(erg), ['fehler:bilder', 'fehler:kategorie', 'fehler:nicht-veroeffentlicht', 'fehler:preis']);
});

test('ein Entwurf ohne Bild ist nur ein Hinweis', () => {
  const neu = produkt({ createdAt: '2026-10-07T08:00:00Z', status: 'DRAFT', onlineStoreUrl: null, mediaCount: 0 });
  const erg = pruefeImporte({ produkte: [...vergleich(), neu], seit: '2026-10-01' });
  assert.deepEqual(regeln(erg), ['hinweis:bilder', 'hinweis:entwurf']);
});

test('fehlendes Filterfeld wird gegen die Produktart gemeldet, kleine Produktarten nicht', () => {
  const neu = produkt({ createdAt: '2026-10-07T08:00:00Z', custom: { arten: '["x"]' } });
  const erg = pruefeImporte({ produkte: [...vergleich(), neu], seit: '2026-10-01' });
  assert.deepEqual(regeln(erg), ['hinweis:filterfelder']);
  assert.match(erg.befunde[0].text, /custom\.nutzschicht/);

  const klein = produkt({ createdAt: '2026-10-07T08:00:00Z', productType: 'Neu', custom: {} });
  assert.deepEqual(pruefeImporte({ produkte: [...vergleich(3, { productType: 'Neu' }), klein], seit: '2026-10-01' }).befunde
    .filter((b) => b.regel === 'filterfelder'), []);
});

test('fehlende SKU zaehlt nur, wo die Produktart sonst SKUs fuehrt (Wunschmass ohne SKU)', () => {
  const ohne = (p) => ({ ...p, variants: p.variants.map((v) => ({ ...v, sku: '' })) });
  const neu = ohne(produkt({ createdAt: '2026-10-07T08:00:00Z' }));
  assert.deepEqual(regeln(pruefeImporte({ produkte: [...vergleich(), neu], seit: '2026-10-01' })), ['fehler:sku']);

  const mass = ohne(produkt({ createdAt: '2026-10-07T08:00:00Z', productType: 'Teppich nach Maß' }));
  const peers = vergleich(5, { productType: 'Teppich nach Maß' }).map(ohne);
  assert.deepEqual(regeln(pruefeImporte({ produkte: [...peers, mass], seit: '2026-10-01' })), []);
});

test('doppelte SKU im Shop ist ein Fehler', () => {
  const alt = produkt();
  const neu = produkt({ createdAt: '2026-10-07T08:00:00Z' });
  neu.variants[0].sku = alt.variants[0].sku;
  assert.ok(regeln(pruefeImporte({ produkte: [...vergleich(), alt, neu], seit: '2026-10-01' })).includes('fehler:sku-doppelt'));
});

test('Farbprodukt: Variantenbild und Musterprodukt mit allen Farben', () => {
  const farbe = (over = {}) => produkt({
    productType: 'Teppichboden',
    options: [{ name: 'Farbe', values: ['Sand', 'Grau'] }],
    variants: [
      { id: 'a', sku: 'T-1', title: 'Sand', price: '20', image: 'u', selectedOptions: [{ name: 'Farbe', value: 'Sand' }], custom: {} },
      { id: 'b', sku: 'T-2', title: 'Grau', price: '20', image: null, selectedOptions: [{ name: 'Farbe', value: 'Grau' }], custom: {} },
    ],
    ...over,
  });
  const neu = farbe({ createdAt: '2026-10-07T08:00:00Z' });
  let erg = pruefeImporte({ produkte: [neu], seit: '2026-10-01' });
  assert.deepEqual(regeln(erg), ['fehler:muster-fehlt', 'fehler:variantenbild']);

  const muster = produkt({
    handle: `muster-${neu.handle}`, productType: 'Musterservice', status: 'UNLISTED', createdAt: '2026-10-07T08:00:00Z',
    variants: [{ id: 'm', sku: 'M-T-1', title: 'Sand', price: '0.00', image: null, selectedOptions: [{ name: 'Farbe', value: 'Sand' }], custom: {} }],
  });
  erg = pruefeImporte({ produkte: [neu, muster], seit: '2026-10-01' });
  assert.deepEqual(regeln(erg), ['fehler:muster-farben', 'fehler:variantenbild']);
  assert.match(erg.befunde.find((b) => b.regel === 'muster-farben').text, /Grau/);

  // Tag ohne-muster oder zubehoer: kein Muster erwartet
  const ohneMuster = farbe({ createdAt: '2026-10-07T08:00:00Z', tags: ['ohne-muster'] });
  assert.deepEqual(regeln(pruefeImporte({ produkte: [ohneMuster], seit: '2026-10-01' })), ['fehler:variantenbild']);
});

test('Musterprodukt: Preis 0, SKU M-, UNLISTED, veroeffentlicht', () => {
  const quelle = produkt();
  const muster = produkt({
    handle: `muster-${quelle.handle}`, productType: 'Musterservice', status: 'ACTIVE', onlineStoreUrl: null, createdAt: '2026-10-07T08:00:00Z',
    variants: [{ id: 'm', sku: 'X-1', title: 'Sand', price: '1.00', image: null, selectedOptions: [], custom: {} }],
  });
  const erg = pruefeImporte({ produkte: [quelle, muster], seit: '2026-10-01' });
  assert.deepEqual(regeln(erg), ['fehler:muster-nicht-veroeffentlicht', 'fehler:muster-preis', 'fehler:muster-sku', 'hinweis:muster-status']);
});

test('--handles prueft genau diese Produkte unabhaengig vom Datum', () => {
  const alt = produkt({ mediaCount: 0 });
  const erg = pruefeImporte({ produkte: [...vergleich(), alt], seit: '2026-10-01', handles: [alt.handle] });
  assert.equal(erg.geprueft, 1);
  assert.deepEqual(regeln(erg), ['fehler:bilder']);
});

test('jsonlZuProdukten haengt Varianten, Sammlungen und Metafelder richtig an', () => {
  const zeilen = [
    { id: 'gid://shopify/Product/1', handle: 'a', title: 'A', status: 'ACTIVE', productType: 'X', tags: ['t'], createdAt: '2026-10-07T00:00:00Z', onlineStoreUrl: 'u', category: { fullName: 'C' }, mediaCount: { count: 3 }, options: [{ name: 'Farbe', values: ['Rot'] }] },
    { id: 'gid://shopify/Collection/9', handle: 'kat', __parentId: 'gid://shopify/Product/1' },
    { key: 'arten', value: '["g"]', __parentId: 'gid://shopify/Product/1' },
    { key: 'leer', value: '[]', __parentId: 'gid://shopify/Product/1' },
    { id: 'gid://shopify/ProductVariant/5', sku: 'S', title: 'Rot', price: '1.00', image: { url: 'i' }, selectedOptions: [{ name: 'Farbe', value: 'Rot' }], __parentId: 'gid://shopify/Product/1' },
    { key: 'farbcode', value: '12', __parentId: 'gid://shopify/ProductVariant/5' },
  ].map((z) => JSON.stringify(z)).join('\n');
  const [p] = jsonlZuProdukten(zeilen);
  assert.deepEqual(p.collections, ['kat']);
  assert.deepEqual(p.custom, { arten: '["g"]' });
  assert.equal(p.mediaCount, 3);
  assert.equal(p.category, 'C');
  assert.equal(p.variants[0].image, 'i');
  assert.deepEqual(p.variants[0].custom, { farbcode: '12' });
});

test('ueblicheFelder laesst Muster und Entwuerfe aus dem Vergleich', () => {
  const liste = [...vergleich(4), produkt({ status: 'DRAFT' }), produkt({ handle: 'muster-x' })];
  assert.equal(ueblicheFelder(liste).size, 0);
});

test('bericht nennt Zahlen und Regeln', () => {
  const text = bericht({ geprueft: 2, befunde: [{ handle: 'a', stufe: 'fehler', regel: 'bilder', text: 'keine Bilder' }] }, { seit: '2026-10-01' });
  assert.match(text, /2 Produkte geprueft, 1 Fehler in 1 Produkten, 0 Hinweise/);
  assert.match(text, /a {2}\[bilder\] {2}keine Bilder/);
});

test('argumente: Standard 7 Tage, Optionen werden geprueft', () => {
  const heute = new Date('2026-10-08T12:00:00Z');
  assert.equal(argumente([], heute).seit, '2026-10-01');
  assert.equal(argumente(['--tage', '14'], heute).seit, '2026-09-24');
  assert.deepEqual(argumente(['--handles', 'a, b'], heute).handles, ['a', 'b']);
  assert.throws(() => argumente(['--seit', '1.10.'], heute), /JJJJ-MM-TT/);
  assert.throws(() => argumente(['--tage', '3', '--seit', '2026-10-01'], heute), /schliessen sich aus/);
  assert.throws(() => argumente(['--json'], heute), /ohne Wert/);
  assert.throws(() => argumente(['--gibts-nicht', 'x'], heute), /unbekannte Option/);
});

test('Variantenbilder nur dort, wo die Produktart sie sonst traegt (Profile: ein Bild fuer alle Farben)', () => {
  const profil = (over = {}) => produkt({
    productType: 'Abschlussprofile', tags: ['zubehoer'],
    options: [{ name: 'Farbe', values: ['Silber'] }],
    variants: [{ id: `x${n}`, sku: `A-${n}`, title: 'Silber', price: '9', image: null, selectedOptions: [{ name: 'Farbe', value: 'Silber' }], custom: {} }],
    ...over,
  });
  const peers = Array.from({ length: 5 }, () => profil());
  const neu = profil({ createdAt: '2026-10-07T08:00:00Z' });
  assert.deepEqual(regeln(pruefeImporte({ produkte: [...peers, neu], seit: '2026-10-01' })), []);
});

test('versteckte Hilfsprodukte (UNLISTED, Tag service) werden nicht geprueft', () => {
  const hilfe = produkt({ createdAt: '2026-10-07T08:00:00Z', status: 'UNLISTED', tags: ['service'], mediaCount: 0, collections: [], category: 'Uncategorized' });
  assert.deepEqual(pruefeImporte({ produkte: [...vergleich(), hilfe], seit: '2026-10-01' }).befunde, []);
});

test('Entwuerfe liefern nur Hinweise (Vorlage mit Preis 0, Farben ohne Bild)', () => {
  const vorlage = produkt({ createdAt: '2026-10-07T08:00:00Z', status: 'DRAFT', onlineStoreUrl: null });
  vorlage.variants[0].price = '0.00';
  const erg = pruefeImporte({ produkte: [...vergleich(), vorlage], seit: '2026-10-01' });
  assert.ok(erg.befunde.length > 0);
  assert.ok(erg.befunde.every((b) => b.stufe === 'hinweis'), JSON.stringify(erg.befunde));
});
