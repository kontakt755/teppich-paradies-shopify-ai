import test from 'node:test';
import assert from 'node:assert/strict';
import { etikettenAusLexikon, farbeOderAusfuehrung } from '../lib/lexikon-etiketten.mjs';

// Ausschliesslich erfundene Produkte und Artikelnummern.
const boden = {
  handle: 'testvelours-teppichboden', titel: 'Testvelours Teppichboden', eigenschaften: {},
  varianten: [
    { id: 'v1', sku: 'TV-SA', farbe: 'Sand', titel: 'Sand / 400cm' },
    { id: 'v2', sku: 'TV-SA', farbe: 'Sand', titel: 'Sand / 500cm' },
    { id: 'v3', sku: 'TV-GR', farbe: 'Grau', titel: 'Grau / 400cm' },
    { id: 'v4', wunschmass: true, sku: null, farbe: 'Sand', titel: 'Sand / Wunschmaß' },
  ],
};
const map = p => new Map([[p.handle, p]]);
const muster = variante => ({ handle: 'muster-anderer-name', titel: 'Muster Testvelours Teppichboden', varianten: [variante] });

test('Einzelvariante Default nutzt belegte Marke und Dekor aus dem Produkttitel', () => {
  for (const titel of ['Default', 'Default Title', 'default']) {
    const p = { handle: 'testlinea-espe-flammig', titel: 'Testlinea Espe Flammig',
      eigenschaften: { marke: 'Testlinea' }, varianten: [{ titel, farbe: null, sku: 'TL-2821' }] };
    const [auswahl] = etikettenAusLexikon(p);
    assert.deepEqual([auswahl.etikett.serie, auswahl.etikett.farbe, auswahl.etikett.sku], ['Testlinea', 'Espe Flammig', 'TL-2821']);
    assert.equal(auswahl.bezeichnung, 'Espe Flammig · TL-2821');
    assert.deepEqual(auswahl.etikett.fehlt, []);
  }
});

test('gleiche SKU und Farbe auf mehreren Breiten ergeben nur ein Etikett; Wunschmass faellt weg', () => {
  const vorher = structuredClone(boden);
  const e = etikettenAusLexikon(boden);
  assert.equal(e.length, 2);
  assert.deepEqual(e.map(x => x.etikett.sku), ['TV-SA', 'TV-GR']);
  assert.equal(e[0].etikett.serie, 'Testvelours');
  assert.deepEqual(e[0].etikett.fehlt, []);
  assert.equal(e[0].key, etikettenAusLexikon({ ...boden, varianten: [...boden.varianten].reverse() }).find(x => x.etikett.sku === 'TV-SA').key);
  assert.deepEqual(boden, vorher, 'Lexikondaten bleiben unveraendert');
});

test('verschiedene SKU derselben Farbe bleiben als Ausfuehrung erkennbar', () => {
  const p = { ...boden, varianten: [{ sku: 'TV-400-SA', farbe: 'Sand' }, { sku: 'TV-500-SA', farbe: 'Sand' }] };
  const e = etikettenAusLexikon(p);
  assert.equal(e.length, 2);
  assert.deepEqual(e.map(x => x.bezeichnung), ['Sand · TV-400-SA', 'Sand · TV-500-SA']);
  assert.notEqual(e[0].key, e[1].key);
});

test('Paketware mit allgemeinem Muster nutzt echte SKU, Produktlink und vorhandene Technik', () => {
  const p = {
    handle: 'testlinea-eiche-natur', titel: 'Testlinea Eiche Natur – Klickvinyl', muster: { vorhanden: false },
    eigenschaften: { qmProPaket: '2.2', arten: 'Klickvinyl', gesamtstaerke: '5 mm', nutzschicht: '0,55 mm', nutzungsklasse: 'Klasse 23, Klasse 33', format: '122 × 18 cm' },
    varianten: [{ sku: 'TL-100', farbe: 'Eiche Natur' }],
  };
  const e = etikettenAusLexikon(p)[0].etikett;
  assert.deepEqual([e.serie, e.farbe, e.sku], ['Testlinea', 'Eiche Natur', 'TL-100']);
  assert.equal(e.url, 'https://www.teppich-paradies.net/products/testlinea-eiche-natur');
  assert.deepEqual(e.technik.map(x => x.wert), ['Klickvinyl', '5 mm / 0,55 mm', '23 / 33', '122 × 18 cm']);
});

test('Muster verwendet explizites Original und M-SKU vor widersprechender Farbe; Lieferanten-Artikelnr. nie als SKU', () => {
  const p = muster({ sku: 'M-TV-SA', farbe: 'Grau', original: { produktHandle: boden.handle, artikelnummer: 'LIEFERANT-ANDERS' } });
  const e = etikettenAusLexikon(p, map(boden))[0].etikett;
  assert.deepEqual([e.serie, e.farbe, e.sku], ['Testvelours', 'Sand', 'TV-SA']);
  assert.equal(e.url, `https://www.teppich-paradies.net/products/${boden.handle}`);
  assert.deepEqual(e.fehlt, []);
});

test('Muster ohne M-SKU kann nur ueber eine eindeutige Farbe zugeordnet werden', () => {
  const p = muster({ farbe: 'Sand', original: { produktHandle: boden.handle } });
  assert.equal(etikettenAusLexikon(p, map(boden))[0].etikett.sku, 'TV-SA', 'gleiche SKU ueber Breiten bleibt eindeutig');
  const zwei = { ...boden, varianten: [{ sku: 'TV-1', farbe: 'Sand' }, { sku: 'TV-2', farbe: 'Sand' }] };
  const e = etikettenAusLexikon(p, map(zwei))[0].etikett;
  assert.equal(e.sku, '');
  assert.ok(e.fehlt.includes('Originalvariante'));
});

test('bekannte aber nicht mehr vorhandene M-QuellSKU faellt nie auf eine andere SKU derselben Farbe zurueck', () => {
  const original = { ...boden, varianten: [{ sku: 'TV-NEU', farbe: 'Sand' }] };
  const p = muster({ sku: 'M-STALE', farbe: 'Sand', original: { produktHandle: original.handle } });
  const e = etikettenAusLexikon(p, map(original))[0].etikett;
  assert.equal(e.sku, '');
  assert.equal(e.farbe, 'Sand');
  assert.deepEqual(e.fehlt, ['Originalvariante']);
});

test('fehlende Farbe wird genannt, eine fehlende SKU bleibt optional und sichtbar', () => {
  const p = { ...boden, varianten: [{ id: 'leer1', farbe: null, sku: 'TV-1' }, { id: 'leer2', farbe: 'Sand', sku: null }, { id: 'leer3', farbe: 'Sand', sku: null }] };
  const e = etikettenAusLexikon(p);
  assert.equal(e.length, 3, 'unbekannte SKU nicht als gleiche Ausfuehrung zusammenfassen');
  assert.ok(e[0].etikett.fehlt.includes('Farbe'));
  assert.equal(e[1].etikett.sku, '');
  assert.deepEqual(e[1].etikett.fehlt, []);
  assert.equal(e[1].bezeichnung, 'Sand');
  const m = muster({ sku: 'M-TV-1', farbe: null, original: { produktHandle: p.handle } });
  assert.ok(etikettenAusLexikon(m, map(p))[0].etikett.fehlt.includes('Farbe'));
});

test('fehlendes Original ergibt klare Luecke ohne geratene SKU, Technik oder QR-Adresse', () => {
  const p = muster({ sku: 'M-TV-SA', farbe: 'Sand', original: { produktHandle: 'test-original-fehlt', artikelnummer: 'NICHT-DIE-SKU' } });
  const e = etikettenAusLexikon(p)[0].etikett;
  assert.equal(e.sku, '');
  assert.equal(e.url, '');
  assert.deepEqual(e.technik, []);
  assert.ok(e.fehlt.includes('Originalprodukt'));
  assert.ok(e.fehlt.includes('Produktseite'));
});

test('belegte Ausfuehrung ersetzt fehlende Farbe, Mass und Default Title bleiben ausgeschlossen', () => {
  assert.equal(farbeOderAusfuehrung({ farbe: 'Sand', titel: '400cm' }), 'Sand');
  assert.equal(farbeOderAusfuehrung({ farbe: null, titel: 'Ocker Hell' }), 'Ocker Hell');
  for (const titel of ['Default Title', '400cm', '400 cm', '4,0 m', '5 mm', 'Breite 400', 'Sand / 400cm', '200 × 300', '400', 'Wunschmaß']) {
    assert.equal(farbeOderAusfuehrung({ titel }), '', titel);
  }
  const original = { ...boden, varianten: [{ sku: 'TV-OH', farbe: null, titel: 'Ocker Hell' }] };
  const p = muster({ sku: 'M-TV-OH', farbe: null, titel: 'Ocker Hell', original: { produktHandle: original.handle } });
  const e = etikettenAusLexikon(p, map(original))[0].etikett;
  assert.deepEqual([e.sku, e.farbe], ['TV-OH', 'Ocker Hell']);
  assert.deepEqual(e.fehlt, []);
});

test('ohne explizite Referenz ist nur das tatsaechlich geladene Original nach Handle-Konvention nutzbar', () => {
  const p = { handle: `muster-${boden.handle}`, titel: 'Muster Testvelours', varianten: [{ sku: 'M-TV-SA', farbe: 'Sand' }] };
  assert.equal(etikettenAusLexikon(p, map(boden))[0].etikett.sku, 'TV-SA');
  assert.ok(etikettenAusLexikon(p)[0].etikett.fehlt.includes('Originalprodukt'));
});

test('Sammelprodukt kostenloses-muster und leere Eingaben ergeben keine Etiketten', () => {
  assert.deepEqual(etikettenAusLexikon({ handle: 'kostenloses-muster', varianten: [{ sku: 'TP-MUSTER-0', farbe: 'Blau' }] }), []);
  assert.deepEqual(etikettenAusLexikon({ handle: 'anderer-sammelname', varianten: [{ sku: 'TP-MUSTER-0' }] }), []);
  assert.deepEqual(etikettenAusLexikon(null), []);
  assert.deepEqual(etikettenAusLexikon({ handle: 'test-ohne-varianten' }), []);
});
