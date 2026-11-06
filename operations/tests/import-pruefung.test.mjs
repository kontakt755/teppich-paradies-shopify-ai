import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruefeImporte, jsonlZuProdukten, ueblicheFelder, bericht, istTeppichfliese } from '../lib/import-pruefung.mjs';
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

test('Musterfarben werden auch bei alten Produkten abgeglichen (Farbe spaeter dazugekommen)', () => {
  const alt = produkt({
    productType: 'Teppichboden', createdAt: '2026-08-08T08:00:00Z',
    options: [{ name: 'Farbe', values: ['Sand', 'Rauchblau'] }],
    variants: [
      { id: 'a', sku: 'T-1', title: 'Sand', price: '20', image: 'u', selectedOptions: [{ name: 'Farbe', value: 'Sand' }], custom: {} },
      { id: 'b', sku: 'T-2', title: 'Rauchblau', price: '20', image: 'u', selectedOptions: [{ name: 'Farbe', value: 'Rauchblau' }], custom: {} },
    ],
  });
  const muster = produkt({
    handle: `muster-${alt.handle}`, productType: 'Musterservice', status: 'UNLISTED', createdAt: '2026-08-08T08:00:00Z',
    variants: [{ id: 'm', sku: 'M-T-1', title: 'Sand', price: '0.00', image: null, selectedOptions: [{ name: 'Farbe', value: 'Sand' }], custom: {} }],
  });
  const erg = pruefeImporte({ produkte: [alt, muster], seit: '2026-10-01' });
  assert.equal(erg.geprueft, 0);
  assert.deepEqual(erg.befunde.map((b) => `${b.handle}:${b.regel}`), [`${alt.handle}:muster-farben`]);
  assert.match(erg.befunde[0].text, /Rauchblau/);
  // --handles prueft genau die genannten Produkte, keinen Shop-Abgleich
  assert.deepEqual(pruefeImporte({ produkte: [alt, muster], handles: [muster.handle] }).befunde.filter((b) => b.regel === 'muster-farben'), []);
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

test('einkauf.farbname: fehlt nur bei Lieferanten mit Musterbestellung nach Bezeichnung, auch am Altbestand', () => {
  const v = (lieferant, farbname) => ({ id: 'v', sku: `S-${lieferant}-${farbname}`, title: 'Sand', price: '1.00', image: 'i', selectedOptions: [], custom: {}, einkaufLieferant: lieferant, einkaufFarbname: farbname });
  const neu = produkt({ createdAt: '2026-11-01T10:00:00Z', variants: [v('E', null), v('E', 'Testquali 1Q00')] });
  const alt = produkt({ variants: [v('D', null)] });
  const andere = produkt({ variants: [v('A', null)] });
  const ohneMuster = produkt({ tags: ['ohne-muster'], variants: [v('E', null)] });
  const erg = pruefeImporte({ produkte: [...vergleich(), neu, alt, andere, ohneMuster], seit: '2026-10-30', nachBezeichnung: new Set(['D', 'E']) });
  const treffer = erg.befunde.filter((b) => b.regel === 'muster-bezeichnung');
  assert.deepEqual(treffer.map((b) => [b.handle, b.stufe]).sort(), [[neu.handle, 'fehler'], ['altbestand', 'hinweis']].sort());
  assert.match(treffer.find((b) => b.handle === neu.handle).text, /1 Variante\(n\) von Lieferant E/);
  assert.match(treffer.find((b) => b.handle === 'altbestand').text, new RegExp(`1 Varianten in 1 aktiven Produkten von Lieferant D .*${alt.handle}`));
  assert.equal(pruefeImporte({ produkte: [neu], seit: '2026-10-30' }).befunde.filter((b) => b.regel === 'muster-bezeichnung').length, 0, 'ohne Stammdaten keine Aussage');
});

test('jsonlZuProdukten liest Lieferant und Farbname der Variante', () => {
  const zeilen = [{ id: 'gid://shopify/Product/1', handle: 'p', title: 'P', status: 'ACTIVE' },
    { id: 'gid://shopify/ProductVariant/5', sku: 'S', __parentId: 'gid://shopify/Product/1', einkaufLieferant: { reference: { kuerzel: { value: 'E' } } }, einkaufFarbname: { value: ' Testquali ' } },
    { id: 'gid://shopify/ProductVariant/6', sku: 'T', __parentId: 'gid://shopify/Product/1', einkaufLieferant: null, einkaufFarbname: null },
  ].map((z) => JSON.stringify(z)).join('\n');
  const [p] = jsonlZuProdukten(zeilen);
  assert.deepEqual([p.variants[0].einkaufLieferant, p.variants[0].einkaufFarbname], ['E', 'Testquali']);
  assert.deepEqual([p.variants[1].einkaufLieferant, p.variants[1].einkaufFarbname], [null, null]);
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
  const einfassung = produkt({ createdAt: '2026-10-07T08:00:00Z', tags: ['marken-einfassung'], collections: ['intern-einfassung'] });
  assert.deepEqual(pruefeImporte({ produkte: [...vergleich(), einfassung], seit: '2026-10-01' }).befunde, []);
});

test('Einfassungsart (Tag marken-einfassung) braucht keine Kategorie, andere Produkte schon', () => {
  const art = produkt({ createdAt: '2026-10-07T08:00:00Z', tags: ['marken-einfassung'], collections: ['intern-regulaerer-preis'] });
  const ohne = produkt({ createdAt: '2026-10-07T08:00:00Z', collections: ['intern-regulaerer-preis'] });
  const erg = pruefeImporte({ produkte: [...vergleich(), art, ohne], seit: '2026-10-01' });
  assert.deepEqual(erg.befunde.filter((b) => b.regel === 'kategorie').map((b) => b.handle), [ohne.handle]);
});

test('archivierte Produkte werden nicht geprueft', () => {
  const weg = produkt({ createdAt: '2026-10-07T08:00:00Z', status: 'ARCHIVED', onlineStoreUrl: null, mediaCount: 0, options: [{ name: 'Farbe', values: ['Grau'] }] });
  assert.deepEqual(pruefeImporte({ produkte: [...vergleich(), weg], seit: '2026-10-01' }).befunde, []);
});

test('Entwuerfe liefern nur Hinweise (Vorlage mit Preis 0, Farben ohne Bild)', () => {
  const vorlage = produkt({ createdAt: '2026-10-07T08:00:00Z', status: 'DRAFT', onlineStoreUrl: null });
  vorlage.variants[0].price = '0.00';
  const erg = pruefeImporte({ produkte: [...vergleich(), vorlage], seit: '2026-10-01' });
  assert.ok(erg.befunde.length > 0);
  assert.ok(erg.befunde.every((b) => b.stufe === 'hinweis'), JSON.stringify(erg.befunde));
});

test('Muster mit archivierter Quelle archiviert (Auslaufregel) ist kein Befund; aktive Quelle mit archiviertem Muster schon', () => {
  const quelle = produkt({ status: 'ARCHIVED', onlineStoreUrl: null });
  const muster = produkt({
    handle: `muster-${quelle.handle}`, productType: 'Musterservice', status: 'ARCHIVED', onlineStoreUrl: null, createdAt: '2026-10-07T08:00:00Z',
    variants: [{ id: 'm1', sku: 'M-1', title: 'Sand', price: '0.00', image: null, selectedOptions: [], custom: {} }],
  });
  assert.deepEqual(pruefeImporte({ produkte: [quelle, muster], seit: '2026-10-01', handles: [muster.handle] }).befunde, []);

  const aktiv = produkt();
  const weg = produkt({
    handle: `muster-${aktiv.handle}`, productType: 'Musterservice', status: 'ARCHIVED', onlineStoreUrl: null, createdAt: '2026-10-07T08:00:00Z',
    variants: [{ id: 'm2', sku: 'M-2', title: 'Sand', price: '0.00', image: null, selectedOptions: [], custom: {} }],
  });
  assert.deepEqual(regeln(pruefeImporte({ produkte: [aktiv, weg], seit: '2026-10-01', handles: [weg.handle] })), ['fehler:muster-nicht-veroeffentlicht', 'hinweis:muster-status']);
});

test('archivierte Produkte und das Sammelmuster kostenloses-muster sind kein Befund', () => {
  const alt = produkt({ createdAt: '2026-10-07T08:00:00Z', status: 'ARCHIVED', onlineStoreUrl: null, mediaCount: 0, collections: [], category: 'Uncategorized' });
  alt.variants[0].price = '0.00';
  const sammel = produkt({ handle: 'kostenloses-muster', productType: 'Musterservice', status: 'UNLISTED', createdAt: '2026-10-07T08:00:00Z',
    variants: [{ id: 'k', sku: 'TP-MUSTER-000', title: 'Default Title', price: '0.00', image: null, selectedOptions: [], custom: {} }] });
  const test = produkt({ createdAt: '2026-10-07T08:00:00Z', status: 'UNLISTED', tags: ['test'], collections: [] });
  assert.deepEqual(pruefeImporte({ produkte: [...vergleich(), alt, sammel, test], seit: '2026-10-01' }).befunde, []);
  // Ein aktives Produkt mit Tag test ist fuer Kunden sichtbar - das bleibt ein Befund.
  const sichtbar = produkt({ createdAt: '2026-10-07T08:00:00Z', tags: ['test'], collections: [] });
  assert.deepEqual(regeln(pruefeImporte({ produkte: [...vergleich(), sichtbar], seit: '2026-10-01' })), ['fehler:kategorie']);
});

// Kein Musterservice (seit 2026-11-06, Arbeitsweise Abschnitt 9): Teppichfliesen, -planken und Sauberlauf-Fliesen
// tragen ohne-muster und haben kein Musterprodukt; faellt eine Kollektion heraus, ruht ihr Musterprodukt auf DRAFT.
const NEU = '2026-11-06T08:00:00Z';
const farbvariante = (wert) => ({ id: `f${n}-${wert}`, sku: `F-${n}-${wert}`, title: wert, price: '84.00', image: 'u', selectedOptions: [{ name: 'Farbe', value: wert }], custom: {} });
const zweiFarben = () => ({ options: [{ name: 'Farbe', values: ['Sand', 'Grau'] }], variants: [farbvariante('Sand'), farbvariante('Grau')] });
const fliese = (over = {}) => produkt({
  productType: 'Teppichboden', title: 'Testlinea Teppichfliese 50x50cm', tags: ['art: teppichboden', 'art: teppichfliese', 'ohne-muster'],
  collections: ['teppichfliesen', 'teppichfliesen-50x50'], ...zweiFarben(),
  ...over,
});
const musterVon = (ware, over = {}) => produkt({
  handle: `muster-${ware.handle}`, title: `Muster ${ware.title}`, productType: 'Musterservice', status: 'UNLISTED', collections: [],
  options: [{ name: 'Farbe', values: ['Sand'] }],
  variants: [{ id: `m${n}`, sku: `M-F-${n}`, title: 'Sand', price: '0.00', image: null, selectedOptions: [{ name: 'Farbe', value: 'Sand' }], custom: {} }],
  ...over,
});

test('Teppichfliese ohne Tag ohne-muster ist ein Fehler - erkannt an Tag, Name oder Kategorie', () => {
  // Sollzustand: Tag gesetzt, kein Musterprodukt - das ist kein muster-fehlt.
  assert.deepEqual(pruefeImporte({ produkte: [fliese({ createdAt: NEU })], seit: '2026-11-01' }).befunde, []);

  const faelle = {
    tag: fliese({ createdAt: NEU, title: 'Testlinea 50x50cm', tags: ['art: teppichboden', 'art: teppichfliese'], collections: ['teppichboden'] }),
    titel: fliese({ createdAt: NEU, title: 'Testlinea Teppichplanke 25x100cm', tags: ['art: teppichboden'], collections: ['teppichboden'] }),
    handle: fliese({ createdAt: NEU, handle: 'testlinea-sauberlauf-fliesen-50-50-cm', title: 'Testlinea 50 × 50 cm', tags: [], collections: ['teppichboden'] }),
    kategorie: fliese({ createdAt: NEU, title: 'Testlinea Nadelvlies 50x50cm', tags: ['art: teppichboden'], collections: ['teppichfliesen'] }),
  };
  for (const [merkmal, p] of Object.entries(faelle)) {
    const erg = pruefeImporte({ produkte: [p], seit: '2026-11-01' });
    // Nur der fehlende Tag - kein muster-fehlt, das zum Anlegen eines Musterprodukts verleitet.
    assert.deepEqual(regeln(erg), ['fehler:muster-teppichfliese'], merkmal);
    assert.match(erg.befunde[0].text, /ohne Tag ohne-muster.*kein Musterprodukt anlegen/, merkmal);
  }

  // Keine Teppichfliesen: Sauberlauf als Matte oder von der Rolle, Fliesen anderer Belaege, Rollenware, Musterprodukte.
  const andere = [
    produkt({ productType: 'Sauberlauf', title: 'Testlinea Sauberlaufmatte 55 × 90 cm', tags: ['art: sauberlauf', 'zubehoer'], collections: ['zubehoer-sauberlauf'] }),
    produkt({ productType: 'Sauberlauf', title: 'Testlinea Sauberlauf von der Rolle', tags: ['art: sauberlauf', 'zubehoer'], collections: ['zubehoer-sauberlauf'] }),
    produkt({ productType: 'Klickvinyl', title: 'Testlinea Beton Grau – Vinyl-Designfliese 6,5mm', tags: ['art: klickvinyl'] }),
    produkt({ productType: 'Kautschukboden', title: 'Testlinea Hellgrau – Kautschukfliese 3,5mm', tags: ['art: kautschuk'] }),
    produkt({ productType: 'Teppichboden', title: 'Testlinea Teppichboden 400cm', tags: ['art: teppichboden'], collections: ['teppichboden'] }),
    // Die Kategorie "Teppichfliesen 50 × 50 cm" fuellt sich ueber den Titel und enthaelt deshalb auch Musterprodukte.
    musterVon(fliese(), { collections: ['teppichfliesen-50x50'] }),
  ];
  for (const p of andere) assert.equal(istTeppichfliese(p), false, p.title);
  for (const p of Object.values(faelle)) assert.equal(istTeppichfliese(p), true, p.title);
});

test('Teppichfliese ohne Tag: auch im Bestand ein Fehler, als Entwurf ein Hinweis; Zubehoer fuer Fliesen zaehlt nicht', () => {
  const alt = fliese({ tags: ['art: teppichboden', 'art: teppichfliese'] });
  const sauber = fliese();
  const erg = pruefeImporte({ produkte: [alt, sauber], seit: '2026-11-01' });
  assert.equal(erg.geprueft, 0);
  assert.deepEqual(erg.befunde.map((b) => `${b.handle}:${b.stufe}:${b.regel}`), [`${alt.handle}:fehler:muster-teppichfliese`]);
  // --handles prueft genau die genannten Produkte, keinen Shop-Abgleich
  assert.deepEqual(pruefeImporte({ produkte: [alt, sauber], handles: [sauber.handle] }).befunde, []);

  const entwurf = fliese({ createdAt: NEU, status: 'DRAFT', onlineStoreUrl: null, tags: ['art: teppichfliese'] });
  assert.deepEqual(regeln(pruefeImporte({ produkte: [entwurf], seit: '2026-11-01' })), ['hinweis:entwurf', 'hinweis:muster-teppichfliese']);

  // Der Shop bietet fuer Zubehoer ohnehin kein Muster an (Tag zubehoer) - der Name allein macht keine Fliese zum Befund.
  const kleber = produkt({ createdAt: NEU, productType: 'Kleber & Fixierung', title: 'Testfix Fixierung für Teppichfliesen', tags: ['zubehoer'] });
  assert.deepEqual(pruefeImporte({ produkte: [kleber], seit: '2026-11-01' }).befunde, []);
});

test('ohne Musterservice: erreichbares Musterprodukt (ACTIVE, UNLISTED) ist ein Fehler an der Ware, DRAFT der Sollzustand', () => {
  for (const status of ['UNLISTED', 'ACTIVE']) {
    const ware = fliese({ createdAt: NEU });
    const muster = musterVon(ware, { createdAt: NEU, status });
    // Ware und Musterprodukt sind beide neu: trotzdem genau eine Meldung, und zwar an der Ware.
    const erg = pruefeImporte({ produkte: [ware, muster], seit: '2026-11-01' });
    assert.deepEqual(erg.befunde.map((b) => `${b.handle}:${b.stufe}:${b.regel}`), [`${ware.handle}:fehler:muster-trotz-ohne-muster`], status);
    assert.match(erg.befunde[0].text, new RegExp(`${muster.handle} steht noch auf ${status} - auf DRAFT stellen`));
    // Wird nur das Musterprodukt genannt, steht der Befund ebenfalls an der Ware.
    assert.deepEqual(pruefeImporte({ produkte: [ware, muster], handles: [muster.handle] }).befunde.map((b) => `${b.handle}:${b.regel}`), [`${ware.handle}:muster-trotz-ohne-muster`]);
  }

  // DRAFT und ARCHIVED sind nicht erreichbar: kein Befund, auch nicht "Status DRAFT statt UNLISTED" oder "nicht veroeffentlicht".
  for (const status of ['DRAFT', 'ARCHIVED']) {
    const ware = fliese({ createdAt: NEU });
    const muster = musterVon(ware, { createdAt: NEU, status, onlineStoreUrl: null });
    assert.deepEqual(pruefeImporte({ produkte: [ware, muster], seit: '2026-11-01' }).befunde, [], status);
  }

  // Fehlt der Fliese der Tag und steht ihr Musterprodukt noch: beide Befunde in einem Lauf, kein Farbabgleich mehr.
  const ohneTag = fliese({ createdAt: NEU, tags: ['art: teppichfliese'] });
  assert.deepEqual(regeln(pruefeImporte({ produkte: [ohneTag, musterVon(ohneTag)], seit: '2026-11-01' })), ['fehler:muster-teppichfliese', 'fehler:muster-trotz-ohne-muster']);
});

test('ganze Kollektion ohne Muster: gilt im Bestand fuer jede Ware mit ohne-muster, nicht fuer Zubehoer und Archiv', () => {
  const linie = (over = {}) => produkt({
    productType: 'Teppichboden', title: 'Testlinea Teppichboden 400cm', tags: ['art: teppichboden', 'ohne-muster'], collections: ['teppichboden'],
    ...zweiFarben(), ...over,
  });
  const boden = linie();
  const nachMass = linie({ productType: 'Teppich nach Maß', title: 'Testlinea Teppich nach Maß' });
  const raummass = linie({ productType: 'Teppich nach Maß', title: 'Testlinea Raummaß', status: 'UNLISTED' });
  const archiv = linie({ status: 'ARCHIVED', onlineStoreUrl: null });
  // Sauberlauf traegt zubehoer und hat Musterprodukte (Bestand 2026-11-06): von der Regel nicht betroffen.
  const sauberlauf = produkt({ productType: 'Sauberlauf', title: 'Testlinea Sauberlauf von der Rolle', tags: ['art: sauberlauf', 'zubehoer'], collections: ['zubehoer-sauberlauf'] });
  // Ware mit Musterservice und vollstaendigem Musterprodukt bleibt ohne Befund.
  const mitMuster = linie({ title: 'Testmuster Teppichboden 400cm', tags: ['art: teppichboden'] });
  const farben = zweiFarben();
  const beideFarben = { options: farben.options, variants: farben.variants.map((v) => ({ ...v, sku: `M-${v.sku}`, price: '0.00' })) };
  const produkte = [
    boden, musterVon(boden),
    nachMass, musterVon(nachMass, { status: 'DRAFT', onlineStoreUrl: null }),
    raummass, musterVon(raummass),
    archiv, musterVon(archiv),
    sauberlauf, musterVon(sauberlauf),
    mitMuster, musterVon(mitMuster, beideFarben),
  ];
  const erg = pruefeImporte({ produkte, seit: '2026-11-01' });
  assert.equal(erg.geprueft, 0);
  assert.deepEqual(erg.befunde.map((b) => `${b.handle}:${b.stufe}:${b.regel}`).sort(), [boden, raummass].map((p) => `${p.handle}:fehler:muster-trotz-ohne-muster`).sort());
});
