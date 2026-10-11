// Renderzeit Teppich nach Mass (2026-10-10: Render-Timeout ab ~200 Teppichen).
// custom.teppich_basis_daten traegt Gruppe, Qualitaetszeile und Breiten fertig am Teppich;
// die Snippets lesen es zuerst und rechnen nur mit live: true (Konfigurator, Pflegevorlage)
// oder ohne Feld aus service.einfass_basis. Dazu: Nachladen der Reihen und der Rechner-Daten,
// das Pflegeskript scripts/teppich-basis-daten.mjs. Kein Netzwerk, kein Shopify-Zugriff.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';
import {
  abweichungen, argumente, kanonisch, pakete, KOLLEKTIONEN,
} from '../../scripts/teppich-basis-daten.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lies = (datei) => fs.readFileSync(path.join(root, datei), 'utf8');
const ohneDoc = (s) => s
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '')
  .replace(/{%-?\s*layout\s+none\s*-?%}/g, '');
const jsonVorlage = (datei) => JSON.parse(lies(datei).replace(/^\/\*[\s\S]*?\*\/\s*/, ''));

// Snippets aus dem Repository, Doc-Bloecke entfernt (LiquidJS kennt {% doc %} nicht).
const engine = new Liquid({
  root: [root],
  partials: [path.join(root, 'snippets')],
  extname: '.liquid',
  fs: {
    exists: async (f) => fs.existsSync(f),
    existsSync: (f) => fs.existsSync(f),
    readFile: async (f) => ohneDoc(fs.readFileSync(f, 'utf8')),
    readFileSync: (f) => ohneDoc(fs.readFileSync(f, 'utf8')),
    resolve: (dir, file, ext) => path.resolve(dir, file.endsWith(ext) ? file : file + ext),
    contains: (dir, file) => path.resolve(file).startsWith(path.resolve(dir)),
    dirname: (f) => path.dirname(f),
    sep: path.sep,
  },
});
const render = async (snippet, vars) =>
  (await engine.parseAndRender(`{% render '${snippet}', product: product, farbe: farbe, live: live %}`, vars)).trim();

const liste = (namen, feld = 'name') => ({ type: 'list.metaobject_reference', value: namen.map((n) => ({ [feld]: { value: n } })) });
const rolle = (farbe, rb) => ({ option1: farbe, available: true, metafields: { custom: { rollenbreite: { value: rb } } } });
// Basis sagt: Schurwolle, Schlinge, 6 mm, Rollen 400/500 - also Gruppe "natur", Breite 500.
const basis = { value: {
  variants: [rolle('Sand', 4.0), rolle('Sand', 5.0), rolle('Grau', 4.0)],
  metafields: { custom: {
    fasermaterial: liste(['Schurwolle'], 'fasermaterial'), arten: liste([]),
    konstruktion: { value: [{ name: { value: 'Schlinge' } }] }, florhohe: { value: '6 mm' },
  } },
} };
const gespeichert = { v: 1, gruppe: 'weich', qualitaet: 'Gespeichert · Zeile', breite_max: 390, breite: { Sand: 390, Grau: 0 } };
function teppich({ daten = gespeichert, mitBasis = true } = {}) {
  const service = { einfassung: { value: 'Ketteln' }, max_breite_cm: { value: 300 } };
  if (mitBasis) service.einfass_basis = basis;
  const custom = daten === null ? {} : { teppich_basis_daten: { value: daten } };
  return { metafields: { service, custom } };
}

test('Schnellweg: gespeicherte Werte gehen vor, die Basis wird nicht gebraucht', async () => {
  const p = teppich({ mitBasis: false });
  assert.equal(await render('tp-teppich-gruppe', { product: p }), 'weich');
  assert.equal(await render('tp-teppich-qualitaet', { product: p }), 'Gespeichert · Zeile');
  assert.equal(await render('tp-teppich-max-breite', { product: p }), '390');
  assert.equal(await render('tp-teppich-max-breite', { product: p, farbe: 'Sand' }), '390');
});

test('Schnellweg: Breite 0 gibt nichts aus, wie live ohne belegte Breite', async () => {
  assert.equal(await render('tp-teppich-max-breite', { product: teppich(), farbe: 'Grau' }), '');
});

test('live: true ignoriert das gespeicherte Feld und rechnet aus der Basis', async () => {
  const p = teppich();
  assert.equal(await render('tp-teppich-gruppe', { product: p, live: true }), 'natur');
  assert.equal(await render('tp-teppich-qualitaet', { product: p, live: true }), 'Schurwolle · Schlinge · 6 mm Flor');
  assert.equal(await render('tp-teppich-max-breite', { product: p, live: true }), '500');
  assert.equal(await render('tp-teppich-max-breite', { product: p, farbe: 'Grau', live: true }), '400');
});

test('ohne Feld oder mit anderer Version: wie bisher live', async () => {
  for (const daten of [null, { ...gespeichert, v: 2 }]) {
    const p = teppich({ daten });
    assert.equal(await render('tp-teppich-gruppe', { product: p }), 'natur');
    assert.equal(await render('tp-teppich-max-breite', { product: p }), '500');
  }
});

test('Farbe, die das Feld noch nicht kennt (neu seit dem letzten Lauf): live', async () => {
  const p = teppich({ daten: { ...gespeichert, breite: { Grau: 0 } } });
  assert.equal(await render('tp-teppich-max-breite', { product: p, farbe: 'Sand' }), '500');
});

test('Pflegevorlage gibt soll (live) und ist (gespeichert) als JSON aus', async () => {
  const quelle = lies('templates/product.teppich-basis-daten.liquid');
  assert.match(quelle, /{%-?\s*layout none/);
  for (const s of ['tp-teppich-gruppe', 'tp-teppich-qualitaet', 'tp-teppich-max-breite']) {
    assert.match(quelle, new RegExp(`render '${s}', product: product[^%]*live: true`), `${s} live`);
  }
  const p = { id: 7, handle: 'probe', variants: [{ option1: 'Sand' }, { option1: 'Grau' }, { option1: 'Sand' }], ...teppich() };
  const aus = JSON.parse(await engine.parseAndRender(ohneDoc(quelle), { product: p }));
  assert.deepEqual(aus.soll, {
    v: 1, gruppe: 'natur', qualitaet: 'Schurwolle · Schlinge · 6 mm Flor', breite_max: 500, breite: { Sand: 500, Grau: 400 },
  });
  assert.deepEqual(aus.ist, gespeichert);
  assert.equal(aus.id, 7);
});

test('Konfigurator auf der Produktseite rechnet die Breite immer live', () => {
  const k = lies('blocks/tp-einfass-konfigurator.liquid');
  const aufrufe = k.match(/render 'tp-teppich-max-breite'[^%]*/g);
  assert.ok(aufrufe.length >= 2);
  for (const a of aufrufe) assert.match(a, /live: true/, a);
});

test('Reihen und Wegweiser lesen die Gruppe direkt aus dem Feld, Snippet nur als Rueckfall', () => {
  for (const datei of ['sections/tp-zubehoer-produkte.liquid', 'sections/tp-teppiche-gruppen.liquid']) {
    const s = lies(datei);
    assert.match(s, /metafields\.custom\.teppich_basis_daten\.value/, datei);
    assert.match(s, /\.v == 1/, datei);
    assert.match(s, /render 'tp-teppich-gruppe'/, datei);
  }
  const reihe = lies('sections/tp-zubehoer-produkte.liquid');
  assert.match(reihe, /paginate source\.products by 250/, 'Reihe sieht alle Teppiche, nicht nur 50');
  assert.match(reihe, /"id": "karten_sofort"/);
  assert.match(reihe, /if request\.design_mode\s+assign tp_tg_sofort = 0/, 'Theme-Editor: alles sofort');
  assert.match(reihe, /CSS\.supports\('overflow-anchor', 'auto'\)/, 'nur ohne native Verankerung von Hand');
});

test('Nachladevorlage: dieselben Reihen wie collection.teppiche, ohne Layout und ohne Begrenzung', () => {
  const haupt = jsonVorlage('templates/collection.teppiche.json');
  const nach = jsonVorlage('templates/collection.teppiche-reihen.json');
  assert.equal(nach.layout, false);
  const reihen = haupt.order.filter((k) => {
    const s = haupt.sections[k];
    return s.type === 'tp-zubehoer-produkte' && (s.settings.teppich_gruppe || 'alle') !== 'alle';
  });
  assert.deepEqual(nach.order, reihen);
  for (const k of reihen) {
    const h = haupt.sections[k];
    const n = nach.sections[k];
    assert.ok(h.settings.karten_sofort > 0, `${k}: karten_sofort in der Hauptvorlage`);
    assert.equal(n.settings.karten_sofort, 0, `${k}: Nachladevorlage ohne Begrenzung`);
    const ohne = (s) => ({ ...s, settings: { ...s.settings, karten_sofort: undefined } });
    assert.deepEqual(ohne(n), ohne(h), `${k}: Einstellungen gleich halten`);
  }
});

test('Hero: Rechner-Daten kommen nachgeladen aus collection.teppiche-rechner', () => {
  const hero = lies('sections/tp-teppiche-hero.liquid');
  assert.doesNotMatch(hero, /render 'tp-teppich-rechner-daten'/);
  assert.match(hero, /data-tp-rechner-quelle="{{ collection\.url }}\?view=teppiche-rechner"/);
  assert.match(lies('templates/collection.teppiche-rechner.liquid'), /render 'tp-teppich-rechner-daten', collection: collection/);
  const js = lies('assets/tp-teppich-rechner.js');
  assert.match(js, /data-tp-rechner-quelle/);
  assert.match(js, /forEach\(function \(r\) { laden\(r\); }\)/);
});

/* ─── Pflegeskript ──────────────────────────────────────────────────── */

test('kanonisch: Schluesselreihenfolge egal, Werte nicht', () => {
  assert.equal(kanonisch({ a: 1, b: { y: 2, x: 1 } }), kanonisch({ b: { x: 1, y: 2 }, a: 1 }));
  assert.notEqual(kanonisch({ a: 1 }), kanonisch({ a: 2 }));
  assert.equal(kanonisch(undefined), 'null');
});

test('abweichungen: nur fehlende oder veraltete Felder', () => {
  const soll = { v: 1, gruppe: 'weich', qualitaet: 'x', breite_max: 400, breite: { A: 400 } };
  const d = abweichungen([
    { id: 1, handle: 'gleich', soll, ist: { breite: { A: 400 }, breite_max: 400, qualitaet: 'x', gruppe: 'weich', v: 1 } },
    { id: 2, handle: 'fehlt', soll, ist: null },
    { id: 3, handle: 'alt', soll, ist: { ...soll, gruppe: 'robust' } },
  ]);
  assert.deepEqual(d.map((x) => x.handle), ['fehlt', 'alt']);
});

test('pakete: je 25, Rollback setzt alte Werte zurueck oder loescht', () => {
  const diff = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, handle: `h${i}`, soll: { v: 1, gruppe: 'weich' }, ist: i < 3 ? { v: 1, gruppe: 'robust' } : null }));
  const p = pakete(diff);
  assert.deepEqual(p.setzen.map((x) => x.metafields.length), [25, 5]);
  const m = p.setzen[0].metafields[0];
  assert.deepEqual(m, { ownerId: 'gid://shopify/Product/1', namespace: 'custom', key: 'teppich_basis_daten', type: 'json', value: '{"v":1,"gruppe":"weich"}' });
  assert.equal(p.rollbackSetzen[0].metafields.length, 3);
  assert.equal(JSON.parse(p.rollbackSetzen[0].metafields[0].value).gruppe, 'robust');
  assert.equal(p.rollbackLoeschen.length, 27);
});

test('argumente: Standard-Kollektionen, Fehler bei Unbekanntem', () => {
  assert.deepEqual(argumente([]).kollektionen, KOLLEKTIONEN);
  assert.deepEqual(argumente(['--handles', 'a, b']).handles, ['a', 'b']);
  assert.throws(() => argumente(['--schreiben']), /unbekannte Option/);
  assert.throws(() => argumente(['--theme', 'abc']), /Theme-ID/);
  assert.throws(() => argumente(['--pakete']), /ohne Wert/);
});
