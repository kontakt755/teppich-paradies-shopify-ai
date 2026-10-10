// Kundengruppen auf der Seite Teppich nach Mass (snippets/tp-teppich-gruppe.liquid):
// rendert das echte Snippet mit LiquidJS. "design" = service.einfassung Fertig und geht
// allen anderen Regeln vor; die bisherigen Gruppen aus den Daten des Teppichbodens
// (service.einfass_basis) bleiben unveraendert. Kein Netzwerk, kein Shopify-Zugriff.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = readFileSync(path.join(root, 'snippets/tp-teppich-gruppe.liquid'), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const engine = new Liquid();

const liste = (namen, feld = 'name') => ({
  type: 'list.metaobject_reference',
  value: namen.map((n) => ({ [feld]: { value: n } })),
});
function basis({ faser = [], arten = [], konstruktion = [], flor = '' } = {}) {
  return { value: { metafields: { custom: {
    fasermaterial: liste(faser, 'fasermaterial'),
    arten: liste(arten),
    konstruktion: { value: konstruktion.map((n) => ({ name: { value: n } })) },
    florhohe: { value: flor },
  } } } };
}
function produkt({ einfassung = 'Ketteln', basisDaten = null } = {}) {
  const service = {};
  if (einfassung !== null) service.einfassung = { value: einfassung };
  if (basisDaten) service.einfass_basis = basisDaten;
  return { metafields: { service } };
}
const gruppe = async (p) => (await engine.parseAndRender(source, { product: p })).trim();

test('design: service.einfassung Fertig, ohne Teppichboden-Basis', async () => {
  assert.equal(await gruppe(produkt({ einfassung: 'Fertig' })), 'design');
});

test('design: Gross-/Kleinschreibung und Leerzeichen egal', async () => {
  for (const wert of ['fertig', 'FERTIG', ' Fertig ']) {
    assert.equal(await gruppe(produkt({ einfassung: wert })), 'design', JSON.stringify(wert));
  }
});

test('design geht vor: auch mit Basisdaten, die sonst "natur" ergaeben', async () => {
  const p = produkt({ einfassung: 'Fertig', basisDaten: basis({ faser: ['Schurwolle'] }) });
  assert.equal(await gruppe(p), 'design');
});

test('Regression: ohne Fertig bleiben die bisherigen Gruppen', async () => {
  assert.equal(await gruppe(produkt({ basisDaten: basis({ faser: ['Schurwolle'] }) })), 'natur');
  assert.equal(await gruppe(produkt({ basisDaten: basis({ arten: ['Schlinge', 'Wolle'] }) })), 'natur');
  assert.equal(await gruppe(produkt({ basisDaten: basis({ faser: ['Polyamid'], konstruktion: ['Velours'], flor: '12 mm' }) })), 'flauschig');
  assert.equal(await gruppe(produkt({ basisDaten: basis({ faser: ['Polyamid'], konstruktion: ['Velours'], flor: '6,5 mm' }) })), 'weich');
  assert.equal(await gruppe(produkt({ basisDaten: basis({ konstruktion: ['Velours'] }) })), 'weich');
  assert.equal(await gruppe(produkt({ basisDaten: basis({ konstruktion: ['Schlinge'] }) })), 'robust');
  assert.equal(await gruppe(produkt({ einfassung: 'Cover', basisDaten: basis({ konstruktion: ['Nadelvlies'] }) })), 'robust');
});

test('Regression: ohne Daten und ohne Fertig keine Gruppe (Reihe "Weitere Qualitaeten")', async () => {
  assert.equal(await gruppe(produkt()), '');
  assert.equal(await gruppe(produkt({ einfassung: null })), '');
  assert.equal(await gruppe(produkt({ einfassung: 'Fertigung' })), '', 'nur exakt "fertig" zaehlt');
  assert.equal(await gruppe(produkt({ basisDaten: basis() })), '');
});

test('Vorlage collection.teppiche: Kachel und Reihe "design", Reihe vor "Weitere Qualitaeten"', () => {
  const t = readFileSync(path.join(root, 'templates/collection.teppiche.json'), 'utf8');
  const j = JSON.parse(t.replace(/^\/\*[\s\S]*?\*\//, ''));
  const g = j.sections.tp_teppiche_gruppen;
  assert.equal(g.blocks.design.settings.gruppe, 'design');
  assert.equal(g.blocks.design.settings.anker, 'design');
  assert.deepEqual(g.block_order.slice(-2), ['natur', 'design']);
  const reihe = j.sections.tp_gruppe_design;
  assert.equal(reihe.type, 'tp-zubehoer-produkte');
  assert.equal(reihe.settings.teppich_gruppe, 'design');
  assert.equal(reihe.settings.anchor, 'design');
  assert.equal(j.order.indexOf('tp_gruppe_design') + 1, j.order.indexOf('tp_gruppe_rest'));
  // Dieselbe Produktkarte wie die anderen Gruppenreihen.
  assert.deepEqual(reihe.blocks, j.sections.tp_gruppe_flauschig.blocks);
});

test('Schemata bieten die Gruppe "design" an', () => {
  for (const datei of ['sections/tp-zubehoer-produkte.liquid', 'sections/tp-teppiche-gruppen.liquid']) {
    const s = readFileSync(path.join(root, datei), 'utf8');
    assert.match(s, /"value": "design", "label": "Design-Teppiche \(Wunschmaß fertig eingefasst\)"/, datei);
  }
});
