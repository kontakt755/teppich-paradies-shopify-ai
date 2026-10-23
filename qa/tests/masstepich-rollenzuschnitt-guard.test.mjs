import assert from 'node:assert/strict';
import test from 'node:test';
import { pruefeDaten } from '../../scripts/masstepich/guard.mjs';
import { ARTEN, namenSet } from '../../scripts/masstepich/lib.mjs';

const namen = namenSet([]);
function fall() {
  const quelle = {
    id: 'R', title: 'Restrolle', options: [],
    metafields: { 'custom.max_roll_laenge_cm': 600 },
    variants: [{ id: 'r1', title: 'Rest', options: [], price: '20.00', metafields: { 'custom.rollenbreite': 4 } }],
  };
  const bundle = { id: 'B', title: 'Zuschnitt', options: [], metafields: {}, variants: [{ id: 'b1', title: '50 cm', options: [], price: '0.27', metafields: {} }] };
  const angebot = {
    id: 'A', title: 'Rest nach Raummaß', options: [],
    metafields: {
      'service.einfassung': 'Raummaß', 'service.einfass_basis': 'R',
      'custom.zuschnitt_von_rolle': 'B', 'custom.rollenzuschnitt_richtung': 'laengs',
      'custom.preis_pro_001_qm': true, 'service.max_breite_cm': 400, 'service.max_laenge_cm': 600,
      'service.formen': ['Rechteck'],
    },
    variants: [{ id: 'a1', title: 'Rest', options: [], price: '0.27', metafields: { 'service.einfassen': 'Verfügbar', 'service.basisvariante': 'r1' } }],
  };
  const snapshot = { products: [quelle, bundle, angebot] };
  const konfig = { max_laenge_cm: 1000, freigabe: [{ id: 'R', varianten: ['r1'] }], gesperrte_ids: [] };
  return { quelle, bundle, angebot, snapshot, konfig };
}
const fehler = ({ snapshot, konfig }) => pruefeDaten(snapshot, konfig, namen);

test('Guard erkennt Raummaß ausschliesslich lokal fuer bestehendes Laengs-Bundle', () => {
  assert.deepEqual(fehler(fall()), []);
  assert.equal(ARTEN.raummass, undefined, 'Der Massenplaner erzeugt keine neue Einfassart');
  const f = fall();
  f.angebot.metafields['service.einfassung'] = 'Ketteln';
  assert.deepEqual(fehler(f), []);
});

test('Guard sperrt Raummaß ohne Richtung oder separates bestehendes Bundle', () => {
  for (const aendern of [
    (f) => { delete f.angebot.metafields['custom.zuschnitt_von_rolle']; },
    (f) => { f.angebot.metafields['custom.zuschnitt_von_rolle'] = 'R'; },
    (f) => { f.angebot.metafields['custom.zuschnitt_von_rolle'] = 'A'; },
    (f) => { f.snapshot.products = f.snapshot.products.filter((p) => p.id !== 'B'); },
    (f) => { f.bundle.variants = []; },
    (f) => { delete f.angebot.metafields['custom.rollenzuschnitt_richtung']; },
    (f) => { f.angebot.metafields['custom.rollenzuschnitt_richtung'] = 'quer'; },
  ]) {
    const f = fall();
    aendern(f);
    assert.match(fehler(f).join('\n'), /Bundleprodukt|rollenzuschnitt_richtung/);
  }
});

test('Guard behaelt Basisfreigabe, Sperrliste und Grenzen bei', () => {
  for (const [aendern, grund] of [
    [(f) => { f.konfig.freigabe = []; }, /Basisvariante ist nicht freigegeben/],
    [(f) => { f.konfig.gesperrte_ids = ['R']; }, /gesperrter Lieferant/],
    [(f) => { delete f.angebot.variants[0].metafields['service.basisvariante']; }, /Basisvariante ist nicht freigegeben/],
    [(f) => { f.angebot.metafields['service.einfass_basis'] = 'B'; }, /Rollenbreite.*unbekannt|gehoert nicht zur Meterware/],
    [(f) => { f.angebot.metafields['custom.preis_pro_001_qm'] = false; }, /preis_pro_001_qm fehlt/],
    [(f) => { f.angebot.metafields['service.max_breite_cm'] = 500; }, /max_breite_cm 500 statt 400/],
    [(f) => { f.angebot.metafields['service.max_laenge_cm'] = 700; }, /ohne passende Grenze/],
    [(f) => { f.angebot.variants.push({ ...f.angebot.variants[0], id: 'a2' }); }, /genau eine Basis- und Produktvariante/],
  ]) {
    const f = fall();
    aendern(f);
    assert.match(fehler(f).join('\n'), grund);
  }
});

test('Guard laesst unvollstaendige Entwuerfe mit maxLaenge 0 nicht als gueltige Angebote durch', () => {
  const f = fall();
  f.angebot.status = 'DRAFT';
  f.angebot.metafields['service.max_breite_cm'] = 0;
  f.angebot.metafields['service.max_laenge_cm'] = 0;
  delete f.angebot.variants[0].metafields['service.einfassen'];
  assert.match(fehler(f).join('\n'), /max_laenge_cm 0 ausserhalb/);
});
