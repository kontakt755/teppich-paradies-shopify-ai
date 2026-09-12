import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { erstellePlan } from '../../scripts/masstepich/plan.mjs';
import { namenSet } from '../../scripts/masstepich/lib.mjs';

/*
  Testmatrix nach Regel 11 des Inhabers (Handoff vom 2026-09-11).
  Erwartung in jedem unklaren Fall: vollstaendig verborgen - keine Option,
  kein deaktivierter Knopf, kein "auf Anfrage", keine Ableitung.

  Die Faelle 13 bis 15 (Mobil, Desktop, Bestellung und E-Mail) brauchen die
  gerenderte Storefront und laufen nur lokal. Sie stehen unten als Liste,
  damit die Matrix vollstaendig bleibt und nicht still drei Zeilen verliert.
*/

const KONFIGURATOR = readFileSync(new URL('../../blocks/tp-einfass-konfigurator.liquid', import.meta.url), 'utf8');

// Die eine Regel, gegen die das Theme entscheidet. Der Vertragstest unten
// haelt sie mit dem Liquid zusammen, damit es nicht zwei Wahrheiten gibt.
const darfAngebotenWerden = (v) => v.einfassen === 'Verfügbar' && Number(v.price) > 0;

const V = (id, options, price, metafields = {}) => ({ id, title: options.join(' / '), sku: `SKU-${id}`, price, options, metafields });
const P = (id, title, variants, metafields = {}) => ({
  id, title, handle: id.toLowerCase(), vendor: 'Eigenmarke', metafields,
  options: [{ name: 'Farbe', values: [...new Set(variants.map((v) => v.options[0]))] }, { name: 'Breite', values: ['400 cm'] }],
  variants,
});

// --- Faelle 1 bis 10: der Wert an der Variante entscheidet, sonst nichts ---

test('Matrix 1: Lieferant A und "Verfügbar" - angeboten', () => {
  assert.equal(darfAngebotenWerden({ einfassen: 'Verfügbar', price: '84.90' }), true);
});

test('Matrix 2-3: "Ungeklärt" und "Nicht verfügbar" - verborgen', () => {
  assert.equal(darfAngebotenWerden({ einfassen: 'Ungeklärt', price: '84.90' }), false);
  assert.equal(darfAngebotenWerden({ einfassen: 'Nicht verfügbar', price: '84.90' }), false);
});

test('Matrix 9: Feld fehlt ganz - verborgen, kein Rueckfall auf das Produkt', () => {
  assert.equal(darfAngebotenWerden({ einfassen: undefined, price: '84.90' }), false);
  assert.equal(darfAngebotenWerden({ einfassen: null, price: '84.90' }), false);
  assert.equal(darfAngebotenWerden({ einfassen: '', price: '84.90' }), false);
});

test('Matrix 10: ungueltiger Wert und Tippfehler - verborgen, nichts wird geraten', () => {
  // Kleinschreibung, fehlender Umlaut, Leerzeichen, ein fremder Wert.
  for (const wert of ['verfügbar', 'VERFÜGBAR', 'Verfuegbar', ' Verfügbar', 'Verfügbar ', 'ja', 'true', 'Verfügbar auf Anfrage']) {
    assert.equal(darfAngebotenWerden({ einfassen: wert, price: '84.90' }), false, wert);
  }
});

test('Matrix 10b: freigegeben, aber ohne Preis - verborgen', () => {
  assert.equal(darfAngebotenWerden({ einfassen: 'Verfügbar', price: '0.00' }), false);
  assert.equal(darfAngebotenWerden({ einfassen: 'Verfügbar', price: null }), false);
});

// --- Faelle 4 bis 8 und 11: der Planer nimmt nur, was in der Freigabe steht ---

const snapshot = {
  products: [
    P('A', 'Callista Teppichboden', [V('a1', ['Rot', '400 cm'], '84.00'), V('a2', ['Blau', '400 cm'], '84.00')]),
    P('NEU', 'Neuzugang Teppichboden', [V('n1', ['Rot', '400 cm'], '84.00')]),
    P('B', 'Zweitquelle Teppichboden', [V('b1', ['Rot', '400 cm'], '84.00')]),
    P('C', 'Drittquelle Teppichboden', [V('c1', ['Rot', '400 cm'], '84.00')]),
    P('D', 'Viertquelle Teppichboden', [V('d1', ['Rot', '400 cm'], '84.00')]),
    P('OHNE', 'Ohne Kennzeichen Teppichboden', [V('o1', ['Rot', '400 cm'], '84.00')]),
  ],
};
const konfig = {
  prozent: 35, max_laenge_cm: 1000,
  preise: { ketteln: 129, cover: 139, einfassband: 149, paspelband: 149 },
  gesperrte_ids: ['B', 'C', 'D'],
  lieferantennamen: ['Zweitquelle'],
  // Freigegeben ist nur A, und dort nur eine der beiden Farben (Fall 11).
  freigabe: [{ id: 'A', varianten: ['a1'] }, { id: 'B', varianten: ['b1'] }],
};
const plan = erstellePlan(snapshot, konfig, namenSet(konfig.lieferantennamen));
const geplanteVarianten = plan.einfassen_setzen.map((x) => x.variantId);
const konfliktGrund = (id) => plan.konflikte.filter((k) => k.produktId === id).map((k) => k.grund).join(' | ');

test('Matrix 4: neues Produkt ohne Freigabe - nichts geplant, kein Erben', () => {
  assert.equal(plan.einfassen_setzen.some((x) => x.produktId === 'NEU'), false);
  assert.equal(plan.einfassprodukte.some((e) => e.basisProduktId === 'NEU'), false);
  assert.equal(plan.wunschmass_anlegen.some((x) => x.produktId === 'NEU'), false);
});

test('Matrix 5-7: gesperrte Bezugsquelle - nichts geplant, als Datenfehler gemeldet', () => {
  for (const id of ['B', 'C', 'D']) {
    assert.equal(plan.einfassen_setzen.some((x) => x.produktId === id), false, id);
    assert.equal(plan.einfassprodukte.some((e) => e.basisProduktId === id), false, id);
  }
  // B steht faelschlich in der Freigabeliste: das muss auffallen, nicht durchrutschen.
  assert.match(konfliktGrund('B'), /gesperrt/);
});

test('Matrix 8: ohne Kennzeichen - nichts geplant, kein Zweifelsfall zugunsten des Angebots', () => {
  assert.equal(plan.einfassen_setzen.some((x) => x.produktId === 'OHNE'), false);
  assert.equal(plan.einfassprodukte.some((e) => e.basisProduktId === 'OHNE'), false);
});

test('Matrix 11: kleinste Ebene ist die Variante - eine freie Farbe schaltet nicht das Produkt frei', () => {
  assert.deepEqual(geplanteVarianten, ['a1']);
  assert.equal(geplanteVarianten.includes('a2'), false);
  // Das Einfassprodukt entsteht, traegt aber nur die freigegebene Farbe.
  const ketteln = plan.einfassprodukte.find((e) => e.basisProduktId === 'A' && e.art === 'ketteln');
  assert.ok(ketteln, 'Kettelprodukt fehlt');
  assert.deepEqual(ketteln.varianten.map((v) => v.metafields['service.basisvariante']), ['a1']);
});

// --- Fall 12: Warenkorb ---

createRequire(import.meta.url)('../../assets/tp-masstepich-rechnung.js');
const M = globalThis.TPMass;

test('Matrix 12: Warenkorb rechnet in 0,01 m², Mindestpreis hebt die Menge, nicht den Preis', () => {
  // 3,33 x 2,00 m = 6,66 m² -> 666 Einheiten zu je 0,01 m²
  assert.equal(M.mengeHundertstelM2(M.flaecheM2(333, 200)), 666);
  // Bei 1,29 EUR je 0,01 m² (129 EUR/m²) und 199 EUR Mindestpreis
  assert.equal(M.mengeMitMindestpreis(1, 129, 19900), 155);
  assert.equal(M.mengeMitMindestpreis(10, 129, 19900), 1000);
});

// --- Vertrag: das Liquid entscheidet nach genau dieser Regel ---

test('Vertrag: der Konfigurator prueft "Verfügbar" und Preis, an jeder Stelle gleich', () => {
  const bedingung = /service\.einfassen\.value == 'Verfügbar' and \w+\.price > 0/g;
  const treffer = KONFIGURATOR.match(bedingung) || [];
  assert.ok(treffer.length >= 2, `Bedingung nur ${treffer.length}x gefunden`);
  // Keine aufgeweichte Zweitfassung: kein Vergleich auf Ungleichheit, kein
  // Teilstring-Treffer, kein Standardwert, der einen leeren Wert auffuellt.
  assert.equal(/service\.einfassen\.value\s*!=/.test(KONFIGURATOR), false, 'Vergleich auf Ungleichheit');
  assert.equal(/service\.einfassen[^\n]*contains/.test(KONFIGURATOR), false, 'Teilstring-Vergleich');
  assert.equal(/service\.einfassen[^\n]*\|\s*default:/.test(KONFIGURATOR), false, 'Standardwert');
  assert.equal(/service\.einfassen[^\n]*downcase/.test(KONFIGURATOR), false, 'Kleinschreibung weicht den Wert auf');
});

test('Vertrag: der Konfigurator nennt keine Bezugsquelle', () => {
  assert.equal(/einkauf\./.test(KONFIGURATOR), false, 'einkauf.* gehoert nicht in die Storefront');
  assert.equal(/lieferant/i.test(KONFIGURATOR), false, 'Lieferantenbezug im Theme');
});

// --- Faelle 13 bis 15: nur lokal, mit der gerenderten Storefront ---

test('Matrix 13-15 sind als Browserfaelle ausgewiesen, nicht vergessen', () => {
  const browserfaelle = [
    { nr: 13, fall: 'Mobil 375 px: verborgene Faelle zeigen keinen Platzhalter und keine leere Karte' },
    { nr: 14, fall: 'Desktop: dasselbe, zusaetzlich Farbwechsel ohne Nachladen' },
    { nr: 15, fall: 'Testbestellung: Properties, Bestaetigungsmail und Bestellstatus nennen keine Bezugsquelle' },
  ];
  assert.equal(browserfaelle.length, 3);
  // Diese drei sind per Admin-API nicht pruefbar (E-Mail-Vorlagen, Checkout,
  // Bestellstatus). Sie gehoeren in den lokalen Lauf vor der Freigabe.
  for (const b of browserfaelle) assert.ok(b.fall.length > 20, String(b.nr));
});
