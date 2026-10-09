import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';
import { auditCompareSources, compareAbsencePass, compareSourceFindings, inspectCompareDom } from '../compare-absence.mjs';

const root = path.resolve(import.meta.dirname, '../..');

test('Produktvergleich ist vollstaendig aus dem Theme entfernt', () => {
  const result = auditCompareSources(root);
  assert.ok(result.checkedFiles > 100);
  assert.deepEqual(result.findings, []);
});

test('Gate findet erneute Einbindung durch Layout, Template, Karten und Script', () => {
  const files = new Map([
    ['layout/theme.liquid', "{% render 'tp-compare-bar' %}"],
    ['templates/product.json', '{"type":"tp-compare-toggle"}'],
    ['blocks/custom.liquid', '<button hidden data-tp-compare-toggle>Vergleich</button>'],
    ['assets/custom.js', "import './tp-compare.js';"],
    ['config/settings_data.json', '{"custom_liquid":"<script src=tp-compare.js></script>"}'],
    ['assets/tp-compare.js', 'tpCompareItems'],
    ['snippets/tp-compare-bar.liquid', 'data-tp-compare-dialog'],
    ['blocks/tp-compare-toggle.liquid', 'data-tp-compare-toggle'],
  ]);
  assert.deepEqual(compareSourceFindings(files).map(finding => finding.file), [...files.keys()]);
});

test('Auch leere oder ungenutzte ehemalige Vergleichsdateien blockieren das Gate', () => {
  const files = new Map([
    ['assets/tp-compare.js', ''],
    ['blocks/tp-compare-toggle.liquid', '{% schema %}{"name":"Alt"}{% endschema %}'],
    ['snippets/tp-compare-bar.liquid', ''],
  ]);
  const findings = compareSourceFindings(files);
  assert.deepEqual(findings.map(finding => finding.file), [...files.keys()]);
  assert.ok(findings.every(finding => finding.reason === 'Entfernte Vergleichsdatei ist wieder vorhanden'));
});

test('Streichpreise, Rollenpreisvergleich und Vorher-Nachher bleiben erlaubt', () => {
  assert.deepEqual(compareSourceFindings(new Map([
    ['snippets/price.liquid', 'product.compare_at_price'],
    ['assets/tp-rollware-art.js', 'Preisvergleich'],
    ['sections/tp-vorher-nachher.liquid', '<section data-tp-vergleiche>'],
  ])), []);
});

const cleanEvidence = { controls: 0, namedControls: 0, scripts: 0, resources: 0, mainTextLength: 300, hasHeading: true, overflow: false };
const clean = { status: 200, evidence: cleanEvidence, previewStatus: 'PASS' };

test('Compare-Gate verlangt die echte Seite und auch unsichtbare UI und Scripts fehlen', () => {
  assert.equal(compareAbsencePass(clean), true);
  for (const key of ['controls', 'namedControls', 'scripts', 'resources']) {
    assert.equal(compareAbsencePass({ ...clean, evidence: { ...cleanEvidence, [key]: 1 } }), false, key);
  }
  assert.equal(compareAbsencePass({ ...clean, status: 404 }), false);
  assert.equal(compareAbsencePass({ ...clean, status: 0 }), false);
  assert.equal(compareAbsencePass({ ...clean, evidence: { ...cleanEvidence, mainTextLength: 0 } }), false);
  assert.equal(compareAbsencePass({ ...clean, evidence: { ...cleanEvidence, hasHeading: false } }), false);
  assert.equal(compareAbsencePass({ ...clean, previewStatus: 'FAIL' }), false);
  assert.equal(compareAbsencePass({ ...clean, requestedScripts: ['tp-compare.js'] }), false);
  assert.equal(compareAbsencePass({ ...clean, pageErrors: ['ReferenceError'] }), false);
});

test('DOM-Pruefung erkennt versteckte Controls, alternative Beschriftung und geladenes Script', () => {
  const element = { attributes: [{ name: 'data-tp-compare-toggle', value: '' }], textContent: '', getAttribute: () => null };
  const namedControl = { attributes: [], textContent: 'Zum Vergleich hinzufügen', getAttribute: () => null };
  const document = {
    querySelectorAll: selector => selector === '*' ? [element, namedControl] : [namedControl],
    querySelector: () => ({ innerText: 'Produktdaten fuer einen echten Bodenbelag', querySelector: () => ({}) }),
    scripts: [{ src: 'https://cdn.example/tp-compare.js?v=1' }],
    documentElement: { scrollWidth: 390 },
  };
  const evidence = vm.runInNewContext(`(${inspectCompareDom.toString()})()`, {
    document, performance: { getEntriesByType: () => [{ name: 'https://cdn.example/tp-compare.js?v=1' }] },
    innerWidth: 390, window: {},
  });
  assert.equal(evidence.controls, 1);
  assert.equal(evidence.namedControls, 1);
  assert.equal(evidence.scripts, 1);
  assert.equal(evidence.resources, 1);
});

function liquidSource(file) {
  return fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/{%-?\s*(doc|stylesheet|schema)\s*-?%}[\s\S]*?{%-?\s*end\1\s*-?%}/g, '');
}
const engine = new Liquid({ templates: {
  'tp-musteroption': liquidSource('snippets/tp-musteroption.liquid'),
  'tp-teppich-max-breite': liquidSource('snippets/tp-teppich-max-breite.liquid'),
} });
const card = liquidSource('blocks/tp-card-actions.liquid');

function product({ sample = false, carpet = false } = {}) {
  return {
    url: '/products/boden', handle: 'boden', tags: sample || carpet ? [] : ['zubehoer'],
    metafields: {
      custom: { preis_pro_001_qm: { value: carpet } },
      service: { einfassung: { value: carpet ? 'Ketteln' : null }, max_breite_cm: { value: 400 }, max_laenge_cm: { value: 1000 } },
    },
  };
}

test('Muster bleibt auf Produktkarten und es entsteht kein Vergleichsbutton', async () => {
  const html = await engine.parseAndRender(card, { closest: { product: product({ sample: true }) } });
  assert.match(html, /class="tp-card-actions__sample"/);
  assert.match(html, /href="\/pages\/muster\?produkt=boden"/);
  assert.doesNotMatch(html, /<button|tp-compare|tpCompareItems/);
});

test('Konfigurator und belegte Wunschmasse bleiben erhalten, Zubehoer bekommt keine leere Aktionszeile', async () => {
  const html = await engine.parseAndRender(card, { closest: { product: product({ carpet: true }) } });
  assert.match(html, /Jetzt konfigurieren/);
  assert.match(html, /400&nbsp;×&nbsp;1000/);
  assert.doesNotMatch(html, /tp-compare/);
  assert.equal((await engine.parseAndRender(card, { closest: { product: product() } })).trim(), '');
});
