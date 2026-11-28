// Farbseiten (scripts/farbseiten-anlegen.mjs): Plan aus belegten Produktdaten, ohne Netz.
import assert from 'node:assert/strict';
import test from 'node:test';
import { argumente, farbeTeile, slug, plan, anlegenMutation, loeschenMutation } from '../../scripts/farbseiten-anlegen.mjs';

function produkt(o = {}) {
  const bild = (n) => ({ id: `m${n}`, image: { url: `https://cdn.example/${n}.jpg` } });
  return {
    id: 'gid://shopify/Product/1', title: 'Esmera Teppich nach Maß', handle: 'esmera-teppich-nach-mass',
    media: { nodes: [
      { ...bild(1), alt: 'Esmera | Farbe: Sand (070) | Raumansicht (Beispielbild)' },
      { ...bild(2), alt: 'Esmera | Farbe: Sand (070) | Musterfoto (Farbe kann abweichen)' },
    ] },
    variants: { nodes: [
      { id: 'gid://shopify/ProductVariant/11', title: 'Sand (070)', selectedOptions: [{ name: 'Farbe', value: 'Sand (070)' }], media: { nodes: [bild(3)] } },
      { id: 'gid://shopify/ProductVariant/12', title: 'Olivgrün (046)', selectedOptions: [{ name: 'Farbe', value: 'Olivgrün (046)' }], media: { nodes: [] } },
    ] },
    metafields: { nodes: [
      { namespace: 'service', key: 'einfassung', value: o.einfassung ?? 'Ketteln' },
      { namespace: 'service', key: 'formen', value: '["Rechteck"]' },
      { namespace: 'service', key: 'max_laenge_cm', value: '600' },
      { namespace: 'service', key: 'max_breite_cm', value: '400' },
      { namespace: 'custom', key: 'teppich_basis_daten', value: JSON.stringify({ qualitaet: 'Polyester · Velours · 9,5 mm Flor', breite: { 'Sand (070)': 500 } }) },
    ] },
  };
}

test('Farbe zerlegen und Handle bilden', () => {
  assert.deepEqual(farbeTeile('Olivgrün (046)'), { name: 'Olivgrün', code: '046' });
  assert.equal(slug('Olivgrün (046)'), 'olivgruen-046');
});

test('Plan: Titel, H1, Meta aus belegten Daten; Farbe ohne eigenes Bild wird ausgelassen', () => {
  const p = plan(produkt());
  assert.equal(p.eintraege.length, 1);
  const e = p.eintraege[0];
  assert.equal(e.handle, 'esmera-sand-070');
  assert.equal(e.titel, 'Esmera Teppich nach Maß in Sand – Velours, gekettelt');
  assert.equal(e.ueberschrift, 'Esmera Teppich nach Maß in Sand (070)');
  assert.equal(e.meta, 'Velours-Teppich Esmera in Sand, rundum gekettelt, Rechteck bis 500 × 600 cm. Endpreis sofort im Rechner.');
  assert.equal(e.bilder.musterfoto, true);
  assert.equal(p.ausgelassen.length, 1);
  assert.match(p.ausgelassen[0].grund, /kein eigenes Bild/);
  assert.ok(!/kostenlos/i.test(e.titel + e.meta));
});

test('Plan bricht ohne Kettelung ab statt zu raten', () => {
  assert.throws(() => plan(produkt({ einfassung: 'Paspelband' })), /Kettelung/);
});

test('Mutationen: nur ENTWURF, Rollback loescht genau die Ids', () => {
  const e = plan(produkt()).eintraege;
  assert.match(anlegenMutation(e), /status:DRAFT/);
  assert.ok(!/ACTIVE/.test(anlegenMutation(e)));
  assert.match(loeschenMutation(['gid://shopify/Metaobject/9']), /metaobjectDelete\(id:"gid:\/\/shopify\/Metaobject\/9"\)/);
});

test('Argumente: Standard ist Trockenlauf', () => {
  assert.equal(argumente([]).schreiben, false);
  assert.deepEqual(argumente(['--schreiben', '--nur', 'Sand (070), Taupe (075)']).nur, ['Sand (070)', 'Taupe (075)']);
  assert.throws(() => argumente(['--x']), /unbekannte Option/);
});
