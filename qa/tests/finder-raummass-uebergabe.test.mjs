import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
require('../../assets/tp-rollware-art.js');
require('../../assets/tp-boden-finder.js');
require('../../assets/tp-raummass.js');
const finder = globalThis.TPBodenFinder.logik;
const raumhilfe = globalThis.TPRaummass;
const origin = 'https://shop.example';

test('Finder-Raum in cm erreicht die Produktseite mit Variante und Sprungmarke', () => {
  const raum = { breite: finder.raumMass('3,5 m'), laenge: finder.raumMass('420 cm') };
  const href = finder.produktUrl('/collections/boden/products/beispiel?variant=123&ref=karte#masse', raum, origin);
  const url = new URL(href, origin);
  assert.equal(url.pathname, '/collections/boden/products/beispiel');
  assert.equal(url.searchParams.get('variant'), '123');
  assert.equal(url.searchParams.get('ref'), 'karte');
  assert.equal(url.hash, '#masse');
  assert.deepEqual(raumhilfe.finderRaum(url.search), { breite: 350, laenge: 420 });
});

test('kleinste und groesste Raumseiten behalten ihre Zentimetereinheit', () => {
  for (const raum of [{ breite: 50, laenge: 5000 }, { breite: 5000, laenge: 50 }]) {
    const url = new URL(finder.produktUrl('/de/products/beispiel', raum, origin), origin);
    assert.deepEqual(raumhilfe.finderRaum(url.search), raum);
  }
});

test('neue Finder-Angaben ersetzen alte Werte; ohne Raum verbleibt keine alte Vorgabe', () => {
  const alt = '/products/beispiel?variant=456&tp_raum_b=100&tp_raum_b=200&tp_raum_l=300';
  const neu = new URL(finder.produktUrl(alt, { breite: 320, laenge: 450 }, origin), origin);
  assert.deepEqual(neu.searchParams.getAll('tp_raum_b'), ['320']);
  assert.deepEqual(raumhilfe.finderRaum(neu.search), { breite: 320, laenge: 450 });
  const ohne = new URL(finder.produktUrl(neu.href, null, origin), origin);
  assert.equal(ohne.searchParams.get('variant'), '456');
  assert.equal(ohne.searchParams.has('tp_raum_b'), false);
  assert.equal(ohne.searchParams.has('tp_raum_l'), false);
});

test('Beratungs-, Kollektions- und fremde Links erhalten keine Raumparameter', () => {
  for (const href of ['/pages/beratung', '/collections/boden', '#auswahl', 'https://anders.example/products/beispiel', 'mailto:test@example.test', 'javascript:void(0)']) {
    assert.equal(finder.produktUrl(href, { breite: 350, laenge: 420 }, origin), href);
  }
});

test('fehlende, mehrdeutige oder ungueltige Uebergaben werden als Ganzes ignoriert', () => {
  for (const suche of ['', '?tp_raum_b=350', '?tp_raum_l=420', '?tp_raum_b=350&tp_raum_b=360&tp_raum_l=420',
    '?tp_raum_b=350&tp_raum_l=420&tp_raum_l=430', '?tp_raum_b=3.5&tp_raum_l=4.2',
    '?tp_raum_b=350cm&tp_raum_l=420', '?tp_raum_b=-350&tp_raum_l=420', '?tp_raum_b=49&tp_raum_l=420',
    '?tp_raum_b=350&tp_raum_l=5001', '?tp_raum_b=1e3&tp_raum_l=420']) {
    assert.equal(raumhilfe.finderRaum(suche), null, suche);
  }
});

test('Finder uebertraegt nur ganze, fuer die Raumhilfe gueltige Zentimeter', () => {
  for (const breite of [null, NaN, Infinity, '350', 0, 49, 5001, 350.5]) {
    const url = new URL(finder.produktUrl('/products/beispiel', { breite, laenge: 420 }, origin), origin);
    assert.equal(raumhilfe.finderRaum(url.search), null, String(breite));
  }
});

for (const [breite, laenge, qmPaket, pakete] of [[104, 364, 1.988, 3], [101, 459, 4.87, 2], [409, 584, 4.18, 7], [400, 300, 4.87, 3]]) {
  test(`Paketgrenze ${breite} x ${laenge} cm: Angebot und Preisrahmen passen zur uebernommenen Raumflaeche`, () => {
    const raum = { breite, laenge };
    const roh = breite * laenge / 10000;
    const produkt = { qm_paket: qmPaket, variants: [{ available: true, price: 15579 }] };
    const url = new URL(finder.produktUrl('/products/beispiel?variant=123', raum, origin), origin);
    const uebergeben = raumhilfe.finderRaum(url.search);
    const uebernommen = raumhilfe.summeRaeume([{ breite: String(uebergeben.breite), laenge: String(uebergeben.laenge) }]).m2;
    const karte = finder.paketAngebot(produkt, roh, raum);
    const rechner = finder.paketRechnung(qmPaket, 155.79, uebernommen);
    assert.equal(karte.flaeche, uebernommen);
    assert.equal(karte.pakete, pakete);
    assert.deepEqual(karte, rechner);
    const liste = finder.preisEintraege([['beispiel', 15579 / qmPaket, qmPaket, 15579, 0]]);
    assert.equal(finder.stufenMaximum(liste, 200, roh, finder.rollenFlaeche(laenge, breite), raum), Math.ceil(rechner.betrag / 10) * 10);
  });
}

test('Direkte m²-Eingabe an der Paketgrenze wird ohne Raumseiten unveraendert berechnet', () => {
  const produkt = { qm_paket: 1.988, variants: [{ available: true, price: 10000 }] };
  const qm = finder.qmFlaeche('3,7856');
  assert.equal(qm, 3.7856);
  assert.equal(finder.paketAngebot(produkt, qm).pakete, 2);
  assert.equal(finder.paketAngebot(produkt, qm, { breite: 104, laenge: 364 }).pakete, 3);
  const liste = finder.preisEintraege([['beispiel', 5030, 1.988, 10000, 0]]);
  assert.equal(finder.stufenMaximum(liste, 60, qm, qm, null), 200);
});

test('Ohne Budgettreffer nennt der Status denselben Paketbetrag wie Karte und Raumhilfe', async () => {
  // Originale DOM-Methoden mit synthetischen Daten ausfuehren, keine zweite
  // Status- oder Preislogik im Test nachbauen.
  const source = readFileSync(new URL('../../assets/tp-boden-finder.js', import.meta.url), 'utf8');
  const context = vm.createContext({ ...finder, holen: async () => ({ pro_seite: 8 }) });
  const methode = name => vm.runInContext(`(${source.match(new RegExp(`Finder\\.prototype\\.${name} = (function \\([^)]*\\) \\{[\\s\\S]*?\\n  \\});`))[1]})`, context);
  const produkt = { qm_paket: 1.988, variants: [{ available: true, price: 10000 }] };
  const raum = { breite: 104, laenge: 364 };
  const roh = raum.breite * raum.laenge / 10000;
  const liste = finder.preisEintraege([['beispiel', 5030, 1.988, 10000, 0]]);
  const status = { before() {} };
  const self = {
    s: { art: { url: '/collections/beispiel', wort: 'Böden' } },
    q: selector => selector === '[data-bf-status]' ? status : {},
    auswahl: () => ({}), preisListe: async () => ({ anzahl: 1, liste }),
    kartenLaden: async eintraege => ({ zeigen: eintraege.length ? [produkt] : [] }),
    kartenZeigen() {}, ergebnisMelden() {},
    raum: () => raum, flaeche: () => roh, abText: methode('abText')
  };
  await methode('ergebnisGerechnet').call(self, 20);
  assert.equal(status.textContent, 'Online liegen die günstigsten passenden Böden darüber – für Ihren Raum ab ca. 300 €:');
  const uebernommen = raumhilfe.summeRaeume([{ breite: '104', laenge: '364' }]).m2;
  assert.equal(finder.paketAngebot(produkt, roh, raum).betrag, 300);
  assert.equal(finder.paketRechnung(1.988, 100, uebernommen).betrag, 300);
  // Ohne Seiten bleibt die reine m²-Eingabe auch im Fallback unveraendert.
  self.raum = () => null;
  await methode('ergebnisGerechnet').call(self, 20);
  assert.equal(status.textContent, 'Online liegen die günstigsten passenden Böden darüber – für Ihren Raum ab ca. 200 €:');
});
