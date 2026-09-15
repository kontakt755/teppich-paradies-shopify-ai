#!/usr/bin/env node
/*
 * Erzeugt aus einer Quelle die Demo-Bausteine des Teppichbereichs:
 *   - assets/tp-rug-bild-*.svg    Raumszenen je Kategorie (Illustration)
 *   - assets/tp-rug-demo-*.svg    ein Bild je TEST-Produkt (Farbe, Kante, Oberflaeche)
 *   - assets/tp-rug-kante-*.svg   Nahaufnahmen der vier Einfassungen
 *   - snippets/tp-rug-icon.liquid Form-, Kanten- und Servicesymbole
 *   - snippets/tp-rug-katalog.liquid  Demo-Katalog (Karten, JSON, Anzahl)
 *
 * Quellen: assets/tp-rug-core.js (Zeichnungen) und
 * domains/shopify/teppiche/demo-katalog.json (Daten).
 * Aufruf: npm run tp-rug:build  (mit --check: nur pruefen, ob alles aktuell ist)
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const check = process.argv.includes('--check');
const coreSrc = fs.readFileSync(path.join(root, 'assets/tp-rug-core.js'), 'utf8');
const core = await import(`data:text/javascript;base64,${Buffer.from(coreSrc).toString('base64')}`);
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'domains/shopify/teppiche/demo-katalog.json'), 'utf8'));

const outputs = new Map();
const put = (rel, content) => outputs.set(rel, content);
const slug = (handle) => handle.replace(/^tp-rug-test-/, '');

/* --- Szenen je Kategorie --------------------------------------------- */
const SCENE_LOOKS = {
  wohnzimmer: { color: '#cdb99a', edge: 'baumwolle', texture: 'velours', edgeHex: '#8c7b63', title: 'Wohnzimmer mit Teppich' },
  esszimmer: { color: '#9c8b7a', edge: 'kettel', texture: 'schlinge', title: 'Esszimmer mit Teppich unter dem Tisch' },
  schlafzimmer: { color: '#d4a79b', edge: 'paspel', texture: 'velours', title: 'Schlafzimmer mit Teppich unter dem Bett' },
  kueche: { color: '#55585c', edge: 'kettel', texture: 'flach', title: 'Küche mit Läufer vor der Küchenzeile' },
  flur: { color: '#2c3a55', edge: 'baumwolle', texture: 'schlinge', edgeHex: '#d9c9ad', title: 'Flur mit Läufer' },
  kinderzimmer: { color: '#8fa08a', edge: 'paspel', texture: 'velours', title: 'Kinderzimmer mit rundem Teppich' },
  homeoffice: { color: '#8b8a86', edge: 'kettel', texture: 'schlinge', title: 'Arbeitszimmer mit Teppich unter dem Schreibtisch' },
  eingang: { color: '#3b3d40', edge: 'kettel', texture: 'schlinge', title: 'Eingangsbereich mit Teppich' },
  buero: { color: '#2c3a55', edge: 'cover', texture: 'schlinge', title: 'Besprechungsraum mit großem Teppich' },
  wohnmobil: { color: '#9c8b7a', edge: 'kettel', texture: 'velours', title: 'Wohnmobil mit Teppich nach Schablone' },
  outdoor: { color: '#6f7552', edge: 'paspel', texture: 'flach', title: 'Terrasse mit Outdoor-Teppich' },
  sonderform: { color: '#b5694a', edge: 'paspel', texture: 'velours', title: 'Raum mit organisch geformtem Teppich' },
  rund: { color: '#ece3d0', edge: 'kettel', texture: 'wolle', title: 'Raum mit rundem Teppich' },
};

for (const [key, look] of Object.entries(SCENE_LOOKS)) {
  put(`assets/tp-rug-bild-${key}.svg`, core.sceneSVG(key, look, { title: `Illustration: ${look.title}`, idPrefix: `b${key}` }));
}

/* --- ein Bild je TEST-Produkt ---------------------------------------- */
for (const p of catalog.products) {
  const color = p.colors?.[0]?.hex || '#b8a78e';
  const look = { color, edge: p.edges?.[0] || '', texture: p.texture, edgeHex: p.edges?.[0] === 'baumwolle' ? core.shade(color, core.luminance(color) > 0.3 ? -0.25 : 0.35) : undefined };
  put(`assets/tp-rug-demo-${slug(p.handle)}.svg`, core.sceneSVG(p.scene, look, { title: `Illustration: ${p.title}`, idPrefix: `d${slug(p.handle).replace(/[^a-z]/g, '')}` }));
}

/* --- Kanten-Nahaufnahmen -------------------------------------------- */
const EDGE_LOOK = { kettel: { edgeColor: 'passend' }, paspel: { edgeHex: '#3b3d40' }, baumwolle: { edgeHex: '#e6d8be' }, cover: {} };
for (const edge of Object.keys(core.EDGES)) {
  put(`assets/tp-rug-kante-${edge}.svg`, core.detailSVG('kante', { color: '#9c8b7a', texture: 'velours', edge, ...EDGE_LOOK[edge], idPrefix: `k${edge}` }));
}

/* --- Symbole ---------------------------------------------------------- */
const SERVICE = {
  lineal: '<path d="M6 30 30 6l12 12-24 24z"/><path d="m14 22 3 3m2-8 3 3m2-8 3 3m2-8 3 3"/>',
  upload: '<path d="M24 32V10m-8 8 8-8 8 8"/><path d="M8 30v8h32v-8"/>',
  auge: '<path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z"/><circle cx="24" cy="24" r="6"/>',
  muster: '<rect x="8" y="10" width="20" height="28" rx="2"/><path d="M28 14l10 4-8 22-4-1.5"/><path d="M12 30h12"/>',
  chat: '<path d="M8 10h32v22H20l-8 7v-7H8z"/><path d="M15 19h18m-18 6h11"/>',
  telefon: '<path d="M15 6l5 9-4 3a22 22 0 0 0 14 14l3-4 9 5-3 7C24 42 6 24 8 9z"/>',
  whatsapp: '<path d="M24 6a18 18 0 0 0-15.5 27L6 42l9.3-2.4A18 18 0 1 0 24 6z"/><path d="M17 16c0 9 6 15 15 15l2-4-5-2-2 2c-3-1-5-3-6-6l2-2-2-5z"/>',
  camper: '<path d="M4 34V14a4 4 0 0 1 4-4h22l10 10v14z"/><path d="M4 22h36M30 10v12"/><rect x="9" y="14" width="8" height="5" rx="1"/><circle cx="13" cy="35" r="4"/><circle cx="33" cy="35" r="4"/>',
  check: '<path d="M10 25l9 9 19-20"/>',
  info: '<circle cx="24" cy="24" r="18"/><path d="M24 22v11m0-17v1"/>',
  pfeil: '<path d="M8 24h30m-10-10 10 10-10 10"/>',
  stift: '<path d="M10 38l2-9L32 9l7 7-20 20z"/><path d="M28 13l7 7"/>',
  schablone: '<rect x="8" y="8" width="32" height="32" rx="3" stroke-dasharray="4 3"/><circle cx="17" cy="31" r="4"/><circle cx="29" cy="31" r="4"/><path d="M19 28l10-16m0 16L19 12"/>',
  raum: '<path d="M6 22 24 8l18 14"/><path d="M11 18v22h26V18"/><rect x="17" y="30" width="14" height="6" rx="1"/>',
  kompass: '<circle cx="24" cy="24" r="18"/><path d="m30 18-4 8-8 4 4-8z"/>',
  zuruecksetzen: '<path d="M10 12v9h9"/><path d="M11 21a14 14 0 1 1 4 12"/>',
  kopieren: '<rect x="15" y="15" width="23" height="25" rx="3"/><path d="M11 32H9V9h21v3"/>',
  teilen: '<circle cx="34" cy="12" r="5"/><circle cx="14" cy="24" r="5"/><circle cx="34" cy="36" r="5"/><path d="m19 21 10-6m-10 12 10 6"/>',
  datei: '<path d="M12 6h16l10 10v26H12z"/><path d="M28 6v10h10"/>',
  schliessen: '<path d="M12 12l24 24m0-24L12 36"/>',
  plus: '<path d="M24 10v28M10 24h28"/>',
  minus: '<path d="M10 24h28"/>',
  drehen: '<path d="M36 12v9h-9"/><path d="M35 21A13 13 0 1 0 37 30"/>',
  vorher: '<rect x="6" y="10" width="36" height="28" rx="3"/><path d="M24 6v36"/><path d="m16 20-4 4 4 4m16-8 4 4-4 4"/>',
  standort: '<path d="M24 42s13-12 13-22a13 13 0 0 0-26 0c0 10 13 22 13 22z"/><circle cx="24" cy="20" r="5"/>',
  person: '<circle cx="24" cy="15" r="7"/><path d="M10 40c1-9 7-13 14-13s13 4 14 13"/>',
  warnung: '<path d="M24 7 43 40H5z"/><path d="M24 19v10m0 5v1"/>',
};

const edgeGlyph = {
  kettel: '<path d="M8 40V8h32" fill="none"/><path d="M13 40V13h27" stroke-dasharray="2.5 2.5"/>',
  paspel: '<path d="M8 40V8h32"/><path d="M12 40V12h28" stroke-width="1.6"/>',
  baumwolle: '<path d="M8 40V8h32"/><path d="M8 8h32v7H15v25H8z" fill="currentColor" fill-opacity=".28" stroke="none"/><path d="M15 40V15h25" stroke-width="1.6"/>',
  cover: '<path d="M8 40V14a6 6 0 0 1 6-6h26"/><path d="M13 40V19a6 6 0 0 1 6-6h21" stroke-opacity=".4"/>',
};

const iconCases = [];
for (const key of Object.keys(core.SHAPES)) {
  const d = core.shapeIconPath(key);
  if (d) iconCases.push([`form-${key}`, `<path d="${d}" fill="currentColor" fill-opacity=".14"/>`]);
}
for (const v of Object.keys(core.ORGANIC)) iconCases.push([`form-organisch-${v}`, `<path d="${core.shapeIconPath('organisch', v)}" fill="currentColor" fill-opacity=".14"/>`]);
iconCases.push(['form-freiform', '<path d="M9 30c3-12 9-18 15-12s9 12 15-2" fill="none"/><path d="M8 38h32" stroke-dasharray="3 3"/>']);
iconCases.push(['form-skizze', '<path d="M10 8h20l8 8v24H10z"/><path d="M15 30c3-6 6-9 9-5s5 2 8-3" fill="none"/><path d="M15 20h8"/>']);
iconCases.push(['form-schablone', SERVICE.schablone]);
for (const [k, g] of Object.entries(edgeGlyph)) iconCases.push([`kante-${k}`, g]);
for (const [k, g] of Object.entries(SERVICE)) iconCases.push([k, g]);

const iconSnippet = `{%- doc -%}
  GENERIERT von scripts/tp-rug/build-assets.mjs - nicht von Hand aendern.
  Formen kommen aus assets/tp-rug-core.js (shapeIconPath), damit Symbol und
  Konfigurator-Vorschau dieselbe Geometrie zeigen.

  @param {string} name - z. B. form-rund, kante-paspel, lineal
  @param {number} [size] - Kantenlaenge in px (Standard 24)
  @param {string} [class] - zusaetzliche Klasse
{%- enddoc -%}
{%- assign tp_ri_size = size | default: 24 -%}
<svg class="tp-rug-icon {{ class }}" width="{{ tp_ri_size }}" height="{{ tp_ri_size }}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  {%- case name -%}
${iconCases.map(([k, g]) => `    {%- when '${k}' -%}${g}`).join('\n')}
  {%- endcase -%}
</svg>
`;
put('snippets/tp-rug-icon.liquid', iconSnippet);

/* --- Liquid-Katalog -------------------------------------------------- */
const csv = (a) => (a || []).join(',');
const flagsOf = (p) => ['camper_suitable', 'outdoor_suitable', 'object_suitable', 'underfloor_heating', 'castor_chair', 'pet_friendly', 'easy_care'].filter((k) => p[k] === true);
const colorsStr = (p) => (p.colors || []).map((c) => `${c.name}:${c.hex}`).join('|');
const lq = (s) => String(s).replace(/'/g, '’');

const cards = catalog.products.map((p, i) => `  {%- comment -%} ${i + 1}: ${p.handle} {%- endcomment -%}
  {%- if tp_rk_only.size == 0 or tp_rk_only contains '${p.handle}' -%}
    {%- assign tp_rk_n = tp_rk_n | plus: 1 -%}
    {%- if tp_rk_limit == 0 or tp_rk_n <= tp_rk_limit -%}
      {%- render 'tp-rug-card',
        handle: '${p.handle}',
        title: '${lq(p.title)}',
        subtitle: '${lq(p.subtitle)}',
        image: 'tp-rug-demo-${slug(p.handle)}.svg',
        rooms: '${csv(p.rooms)}',
        shapes: '${csv(p.shapes)}',
        edges: '${csv(p.edges)}',
        colors: '${lq(colorsStr(p))}',
        antislip: '${p.antislip}',
        flags: '${csv(flagsOf(p))}',
        material_key: '${p.material_key}',
        pile: '${p.pile}',
        fiber: '${p.fiber}',
        loading: tp_rk_loading,
        test: true
      -%}
    {%- endif -%}
  {%- endif -%}`).join('\n');

const jsonItems = catalog.products.map((p) => {
  const data = { ...p, test: true, flags: undefined };
  delete data.flags;
  const json = JSON.stringify(data).replace(/\{\{|\}\}|\{%|%\}/g, '');
  return `{%- capture tp_rk_img -%}{{ 'tp-rug-demo-${slug(p.handle)}.svg' | asset_url }}{%- endcapture -%}${json.slice(0, -1)},"image":{{ tp_rk_img | json }}}`;
});

const katalog = `{%- doc -%}
  GENERIERT von scripts/tp-rug/build-assets.mjs aus
  domains/shopify/teppiche/demo-katalog.json - nicht von Hand aendern.

  Theme-interne Demo-Daten: Entwurfsprodukte (status DRAFT) lassen sich in der
  Theme-Vorschau nicht rendern (Shopify zeigt products_preview nur im Live-Theme,
  geprueft 2026-09-11). Deshalb liegen die TEST-Teppiche hier.

  @param {string} mode - 'cards' | 'json' | 'count'
  @param {string} [only] - Handles, kommagetrennt (cards)
  @param {number} [limit] - hoechstens so viele Karten (cards)
  @param {string} [loading] - 'lazy' (Standard) oder 'eager'
{%- enddoc -%}
{%- if mode == 'json' -%}
[${jsonItems.join(',\n')}]
{%- elsif mode == 'count' -%}
${catalog.products.length}
{%- else -%}
  {%- assign tp_rk_only = only | default: '' | split: ',' -%}
  {%- assign tp_rk_limit = limit | default: 0 -%}
  {%- assign tp_rk_loading = loading | default: 'lazy' -%}
  {%- assign tp_rk_n = 0 -%}
${cards}
{%- endif -%}
`;
put('snippets/tp-rug-katalog.liquid', katalog);

/* --- schreiben oder pruefen ----------------------------------------- */
let stale = 0;
for (const [rel, content] of outputs) {
  const file = path.join(root, rel);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === content) continue;
  stale++;
  if (check) console.log(`veraltet: ${rel}`);
  else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); console.log(`geschrieben: ${rel} (${(content.length / 1024).toFixed(1)} KB)`); }
}
if (check && stale) { console.error(`${stale} Datei(en) veraltet - npm run tp-rug:build ausfuehren.`); process.exit(1); }
console.log(`${outputs.size} Dateien, ${stale} ${check ? 'veraltet' : 'aktualisiert'}.`);
