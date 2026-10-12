import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeTemplates, blockLimitFindings, blockTypesOf, countDynamicBlocks, forbiddenCardBlocks, maxBlocksOf, SHOPIFY_GRENZEN, stripHeader } from '../template-guard.mjs';

const template = (order, types) => JSON.stringify({
  sections: { main: { blocks: { pc: {
    type: '_product-card',
    blocks: Object.fromEntries(order.map((id, i) => [id, { type: types[i] }])),
    block_order: order,
  } } } },
});

test('A: Kommentarkopf wird entfernt, JSON bleibt lesbar', () => {
  const raw = '/*\n * auto-generated\n */\n{"a":1}';
  assert.deepEqual(JSON.parse(stripHeader(raw)), { a: 1 });
  assert.deepEqual(JSON.parse(stripHeader('{"a":1}')), { a: 1 });
});

test('B: Blocktypen kommen in block_order-Reihenfolge', () => {
  const raw = template(['g', 'p'], ['_product-card-gallery', 'price']);
  assert.deepEqual(blockTypesOf(raw, '_product-card'), ['_product-card-gallery', 'price']);
  assert.equal(blockTypesOf(raw, 'gibt-es-nicht'), null);
});

test('C: einheitliche Templates ergeben keine Findings', () => {
  const templates = [
    { name: 'a.json', types: ['price', 'specs'] },
    { name: 'b.json', types: ['price', 'specs'] },
  ];
  assert.deepEqual(analyzeTemplates(templates), []);
});

test('D: Drift nennt genau die Templates, in denen der Block fehlt', () => {
  const findings = analyzeTemplates([
    { name: 'a.json', types: ['price', 'specs'] },
    { name: 'b.json', types: ['price'] },
    { name: 'c.json', types: ['price'] },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'BLOCK_DRIFT');
  assert.equal(findings[0].severity, 'warn');
  assert.deepEqual(findings[0].templates, ['b.json', 'c.json']);
});

test('E: fehlender Pflichtblock ist ein Fehler', () => {
  const findings = analyzeTemplates(
    [{ name: 'a.json', types: ['price'] }, { name: 'b.json', types: [] }],
    { required: ['price'] },
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'REQUIRED_BLOCK_MISSING');
  assert.equal(findings[0].severity, 'error');
  assert.deepEqual(findings[0].templates, ['b.json']);
});

test('F: als optional erklaerte Typen loesen keinen Drift aus', () => {
  const templates = [
    { name: 'a.json', types: ['tp-card-title'] },
    { name: 'b.json', types: ['product-title'] },
  ];
  assert.equal(analyzeTemplates(templates).length, 2);
  assert.deepEqual(analyzeTemplates(templates, { optional: ['tp-card-title', 'product-title'] }), []);
});

// --- bewusstAbwesend: Block plus Template, nicht Block allein ------------

test('G: bewusstAbwesend unterdrueckt den Drift nur in den genannten Templates', () => {
  const templates = [
    { name: 'collection.teppichboden.json', types: ['tp-card-price-sqm'] },
    { name: 'collection.vinyl.json', types: ['tp-card-price-sqm'] },
    { name: 'collection.zubehoer.json', types: [] },
  ];
  const cfg = { bewusstAbwesend: { 'tp-card-price-sqm': ['collection.zubehoer.json'] } };
  assert.deepEqual(analyzeTemplates(templates, cfg), []);
  // Ohne die Ausnahme waere es ein Fund - der Testfall selbst muss also greifen.
  assert.equal(analyzeTemplates(templates).length, 1);
});

test('G2: bewusstAbwesend verdeckt keinen Drift in anderen Templates', () => {
  // Derselbe Block faellt zusaetzlich aus einem Template heraus, das nicht
  // ausgenommen ist. Genau das wuerde `optional` stillschweigend schlucken.
  const templates = [
    { name: 'collection.teppichboden.json', types: [] },
    { name: 'collection.vinyl.json', types: ['tp-card-price-sqm'] },
    { name: 'collection.zubehoer.json', types: [] },
  ];
  const cfg = { bewusstAbwesend: { 'tp-card-price-sqm': ['collection.zubehoer.json'] } };
  const findings = analyzeTemplates(templates, cfg);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'BLOCK_DRIFT');
  assert.deepEqual(findings[0].templates, ['collection.teppichboden.json']);
});

// Diese Liste ist mit Absicht kurz und wird nur nach einer Entscheidung
// erweitert. Zubehoer seit 2026-09-09, Bodenleisten am selben Tag dazu,
// nachdem die Kategorieseite auf eine eigene Produktkarte umgebaut wurde.
const AUSNAHME_ERLAUBT = /^collection\.(zubehoer|bodenleisten)/;

test('G3: die echte Konfiguration nimmt nur Zubehoer und Bodenleisten aus', async () => {
  const { readFileSync } = await import('node:fs');
  const cfg = JSON.parse(readFileSync(new URL('../template-guard.config.json', import.meta.url), 'utf8'));
  for (const [typ, tpls] of Object.entries(cfg.bewusstAbwesend ?? {})) {
    assert.ok(tpls.length > 0, `${typ} hat einen leeren Ausnahmeeintrag`);
    for (const t of tpls) {
      assert.match(t, AUSNAHME_ERLAUBT, `${typ}: ${t} ist weder Zubehoer- noch Bodenleisten-Template`);
    }
  }
});

// --- nurIn: Bloecke, die nur in ein Template gehoeren -------------------

const NUR_IN = { nurIn: { 'tp-card-leisten': ['collection.bodenleisten.json'] } };

test('H: nurIn meldet nicht, dass der Block ueberall sonst fehlt', () => {
  const templates = [
    { name: 'collection.bodenleisten.json', types: ['tp-card-leisten'] },
    { name: 'collection.teppichboden.json', types: [] },
  ];
  assert.deepEqual(analyzeTemplates(templates, NUR_IN), []);
  // Ohne nurIn waere es ein Fund - der Testfall muss also greifen.
  assert.equal(analyzeTemplates(templates).length, 1);
});

test('H2: nurIn meldet, wenn der Block in einem fremden Template auftaucht', () => {
  const templates = [
    { name: 'collection.bodenleisten.json', types: ['tp-card-leisten'] },
    { name: 'collection.teppichboden.json', types: ['tp-card-leisten'] },
  ];
  // In allen Templates vorhanden - ohne nurIn faende der Guard hier nichts.
  assert.deepEqual(analyzeTemplates(templates), []);
  const findings = analyzeTemplates(templates, NUR_IN);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].templates, ['collection.teppichboden.json']);
});

test('H3: nurIn meldet, wenn der Block aus seinem eigenen Template faellt', () => {
  const templates = [
    { name: 'collection.bodenleisten.json', types: [] },
    { name: 'collection.teppichboden.json', types: [] },
  ];
  const findings = analyzeTemplates(templates, NUR_IN);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, 'tp-card-leisten');
  assert.match(findings[0].message, /in keinem Template mehr/);
});

test('H4: nurIn meldet auch, wenn er nur aus seinem Template faellt, sonst aber existiert', () => {
  const templates = [
    { name: 'collection.bodenleisten.json', types: [] },
    { name: 'collection.teppichboden.json', types: ['tp-card-leisten'] },
  ];
  const findings = analyzeTemplates(templates, NUR_IN);
  assert.equal(findings.length, 1);
  assert.ok(findings[0].templates.includes('collection.bodenleisten.json'));
});

// --- verbotenInKarte: Bloecke, auf deren Fehlen sich Code verlaesst -------

const VERBOTEN = { swatches: 'Grund' };

test('I: verbotener Block in einer Karte wird gefunden, auch verschachtelt und in Section-Gruppen', () => {
  // Karte in einer Section-Gruppe (Empfehlungen), swatches eine Ebene tiefer in einer Gruppe
  const raw = JSON.stringify({ sections: { rec: { type: 'product-recommendations', blocks: { pc: {
    type: '_product-card',
    blocks: { grp: { type: '_product-card-group', blocks: { sw: { type: 'swatches' } } } },
  } } } } });
  assert.deepEqual(forbiddenCardBlocks(raw, '_product-card', VERBOTEN), ['swatches']);
});

test('I2: derselbe Block ausserhalb einer Karte ist erlaubt (PDP-Farbauswahl)', () => {
  const raw = JSON.stringify({ sections: { main: { type: 'product-information', blocks: {
    details: { type: '_product-details', blocks: { sw: { type: 'swatches' } } },
    pc: { type: '_product-card', blocks: { t: { type: 'price' } } },
  } } } });
  assert.deepEqual(forbiddenCardBlocks(raw, '_product-card', VERBOTEN), []);
});

test('I3: die echte Konfiguration verbietet swatches in Karten und begruendet es', async () => {
  const { readFileSync } = await import('node:fs');
  const cfg = JSON.parse(readFileSync(new URL('../template-guard.config.json', import.meta.url), 'utf8'));
  assert.ok(cfg.verbotenInKarte?.swatches, 'swatches fehlt in verbotenInKarte');
  assert.match(cfg.verbotenInKarte.swatches, /card-gallery/);
});

test('H5: die echte Konfiguration nennt fuer nurIn nur Bodenleisten', async () => {
  const { readFileSync } = await import('node:fs');
  const cfg = JSON.parse(readFileSync(new URL('../template-guard.config.json', import.meta.url), 'utf8'));
  for (const [typ, tpls] of Object.entries(cfg.nurIn ?? {})) {
    assert.ok(tpls.length > 0, `${typ} hat einen leeren nurIn-Eintrag`);
    assert.deepEqual(tpls, ['collection.bodenleisten.json'], `${typ} nennt ein unerwartetes Template`);
  }
});

// --- Shopify-Grenzen: 50 hinzufuegbare Bloecke je Section ------------------
// Anlass: #977 brachte sections/header-group.json auf 52 Kachel-Bloecke,
// nachdem main ihn in ff713442 auf 50 gekuerzt hatte. Shopify lehnt so eine
// Datei beim Push ab; kein Guard hat es gezaehlt.

const kacheln = (anzahl, { statisch = 0 } = {}) => {
  const blocks = {};
  for (let i = 0; i < statisch; i += 1) blocks[`fest_${i}`] = { type: '_header-menu', static: true, settings: {} };
  for (let i = 0; i < anzahl; i += 1) blocks[`kachel_${i}`] = { type: '_tp-menu-kachel', settings: { menu_match: `Punkt ${i}` } };
  return blocks;
};
const gruppe = (sections) => `/*\n * auto-generated\n */\n${JSON.stringify({ type: 'header', sections, order: Object.keys(sections) })}`;

test('J1: 52 Kacheln im Header sind ein Fehler, die statischen Bloecke zaehlen nicht mit', () => {
  const raw = gruppe({ header_section: { type: 'header', blocks: kacheln(52, { statisch: 2 }) } });
  const findings = blockLimitFindings(raw, 'sections/header-group.json');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'error');
  assert.equal(findings[0].rule, 'BLOCK_LIMIT');
  assert.match(findings[0].message, /header_section/);
  assert.match(findings[0].message, /52 hinzufuegbare Bloecke, erlaubt sind 50/);
  assert.match(findings[0].message, /2 Block\/Bloecke entfernen/);
});

test('J2: genau 50 sind erlaubt, melden aber "voll"', () => {
  const raw = gruppe({ header_section: { type: 'header', blocks: kacheln(50, { statisch: 2 }) } });
  const findings = blockLimitFindings(raw, 'sections/header-group.json');
  assert.deepEqual(findings.map(f => [f.severity, f.rule]), [['warn', 'BLOCK_LIMIT_VOLL']]);
  assert.deepEqual(blockLimitFindings(gruppe({ s: { type: 'header', blocks: kacheln(49) } }), 'x.json'), []);
});

test('J3: verschachtelte Bloecke zaehlen mit, statische in jeder Tiefe nicht', () => {
  const section = { type: 'header', blocks: {
    menue: { type: '_header-menu', static: true, blocks: kacheln(30) },
    gruppe: { type: 'group', blocks: kacheln(20, { statisch: 3 }) },
  } };
  // 30 unter dem statischen Menue + Gruppe selbst + 20 darin = 51
  assert.equal(countDynamicBlocks(section), 51);
  const findings = blockLimitFindings(gruppe({ h: section }), 'sections/header-group.json');
  assert.equal(findings[0]?.rule, 'BLOCK_LIMIT');
});

test('J4: max_blocks aus dem Section-Schema senkt die Grenze', () => {
  const raw = JSON.stringify({ sections: { faq: { type: 'tp-teppiche-faq', blocks: kacheln(5) } } });
  const findings = blockLimitFindings(raw, 'templates/x.json', { maxBlocks: { 'tp-teppiche-faq': 4 } });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'BLOCK_LIMIT');
  assert.match(findings[0].message, /max_blocks in sections\/tp-teppiche-faq\.liquid/);
  // voll nach max_blocks ist gewollt und kein Hinweis wert
  assert.deepEqual(blockLimitFindings(raw, 'templates/x.json', { maxBlocks: { 'tp-teppiche-faq': 5 } }), []);
});

test('J5: Dateigrenzen - 25 Sections und 1.250 Bloecke je Datei', () => {
  const viele = Object.fromEntries(Array.from({ length: 26 }, (_, i) => [`s${i}`, { type: 'text', blocks: kacheln(49) }]));
  const rules = blockLimitFindings(JSON.stringify({ sections: viele }), 'templates/index.json').map(f => f.rule).sort();
  assert.deepEqual(rules, ['BLOCK_LIMIT_DATEI', 'SECTION_LIMIT']);
  assert.equal(SHOPIFY_GRENZEN.bloeckeProSection, 50);
});

test('J6: max_blocks wird aus dem Liquid-Schema gelesen', () => {
  assert.equal(maxBlocksOf('<div></div>\n{% schema %}\n{"name": "FAQ", "max_blocks": 12}\n{% endschema %}'), 12);
  assert.equal(maxBlocksOf('{%- schema -%}{"name": "x"}{%- endschema -%}'), null);
  assert.equal(maxBlocksOf('{% schema %}{kaputt{% endschema %}'), null);
  assert.equal(maxBlocksOf('ohne Schema'), null);
});

test('J7: kein Template und keine Section-Gruppe im Repository ueberschreitet eine Shopify-Grenze', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const root = new URL('../../', import.meta.url);
  const maxBlocks = {};
  for (const name of readdirSync(new URL('sections/', root)).filter(f => f.endsWith('.liquid'))) {
    const value = maxBlocksOf(readFileSync(new URL(`sections/${name}`, root), 'utf8'));
    if (value !== null) maxBlocks[name.replace(/\.liquid$/, '')] = value;
  }
  const fehler = [];
  let geprueft = 0;
  for (const dir of ['templates', 'sections']) {
    for (const name of readdirSync(new URL(`${dir}/`, root)).filter(f => f.endsWith('.json'))) {
      geprueft += 1;
      const raw = readFileSync(new URL(`${dir}/${name}`, root), 'utf8');
      fehler.push(...blockLimitFindings(raw, `${dir}/${name}`, { maxBlocks }).filter(f => f.severity === 'error'));
    }
  }
  assert.ok(geprueft > 30, `nur ${geprueft} Dateien gefunden`);
  assert.deepEqual(fehler.map(f => f.message), []);
});
