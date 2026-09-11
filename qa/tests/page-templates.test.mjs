import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { stripHeader } from '../template-guard.mjs';

// Seitenvorlagen. Traegt eine Seite ein Template-Suffix, zu dem es keine
// Datei gibt, rendert Shopify ohne Meldung templates/page.json. Bis
// 2026-09-11 war page.json die B2B-Seite (Hauptbereich abgeschaltet) - neun
// veroeffentlichte Seiten zeigten deshalb den Firmenkunden-Kopf statt ihres
// eigenen Inhalts, darunter uber-uns und liefer-verlegeservice.

const ROOT = new URL('../../', import.meta.url);
const TEMPLATES = new URL('templates/', ROOT);
const lies = (name) => JSON.parse(stripHeader(readFileSync(new URL(name, TEMPLATES), 'utf8')));

// Suffixe, die die B2B-Seiten im Shop tatsaechlich tragen (Admin API,
// 2026-09-11). Die Vorlage muss exakt so heissen, sonst greift page.json.
const B2B_SUFFIXE = ['firmenkunden', 'fuer-geschaeftskunden'];

// Verwaist: kein Seiten-Suffix zeigt auf diese Dateien, und ihre Knoepfe
// haben leere Links. Bewusst nicht geloescht - das entscheidet der Inhaber.
const VERWAIST = ['page.fimenkunden.json', 'page.geschaeftskunden.json'];

// Werte aus dem Schema einer Section bzw. eines Blocks. Fehlt eine
// Einstellung im Template, rendert Shopify den Default; ohne Default bleibt
// sie leer (Checkbox: aus). Beides zaehlt also mit.
const schemaCache = new Map();
function defaultsOf(kind, type) {
  const key = `${kind}/${type}`;
  if (!schemaCache.has(key)) {
    const defaults = {};
    const file = new URL(`${kind}/${type}.liquid`, ROOT);
    if (existsSync(file)) {
      const m = readFileSync(file, 'utf8').match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/);
      try {
        for (const s of (m ? JSON.parse(m[1]).settings : null) ?? []) {
          if (!s.id) continue;
          defaults[s.id] = s.default !== undefined ? s.default : (s.type === 'checkbox' ? false : '');
        }
      } catch { /* unlesbares Schema: nur die Werte aus dem Template pruefen */ }
    }
    schemaCache.set(key, defaults);
  }
  return schemaCache.get(key);
}

// Ein Knopf ist ein Paar aus `<x>_link` und `<x>_text` bzw. `<x>_label`
// (primary_btn_link/primary_btn_text, primary_link/primary_label,
// link/label). Hat der Knopf einen Text, aber keinen Link, fuehrt er ins
// Leere. Abgeschaltete Bereiche und `<x>_enabled: false` rendern nicht.
const LINK = /^(?:(.*)_)?(?:link|url)$/;

function abgeschaltet(settings, praefix) {
  const teile = praefix ? praefix.split('_') : [];
  for (let i = teile.length; i >= 0; i--) {
    const p = teile.slice(0, i).join('_');
    if (settings[p ? `${p}_enabled` : 'enabled'] === false) return true;
  }
  return false;
}

function leereKnopfLinks(template, { defaults = () => ({}) } = {}) {
  const funde = [];
  const pruefe = (knoten, kind, pfad) => {
    if (!knoten || knoten.disabled === true) return;
    const settings = { ...defaults(kind, knoten.type), ...(knoten.settings ?? {}) };
    for (const key of Object.keys(settings)) {
      const m = key.match(LINK);
      if (!m) continue;
      const p = m[1] ?? '';
      if (abgeschaltet(settings, p)) continue;
      const label = [p ? `${p}_text` : 'text', p ? `${p}_label` : 'label']
        .map((k) => settings[k])
        .find((v) => typeof v === 'string' && v.trim());
      if (!label) continue;
      const link = settings[key];
      if (typeof link !== 'string' || !link.trim()) funde.push(`${pfad}.${key} (Knopf "${label.trim()}")`);
    }
    for (const [id, block] of Object.entries(knoten.blocks ?? {})) pruefe(block, 'blocks', `${pfad}/${id}`);
  };
  for (const [id, section] of Object.entries(template.sections ?? {})) pruefe(section, 'sections', id);
  return funde;
}

test('A: page.json ist die neutrale Standardseite ohne B2B-Kopf', () => {
  const tpl = lies('page.json');
  const typen = Object.values(tpl.sections).map((s) => s.type);
  assert.deepEqual(typen.filter((t) => t.startsWith('b2b-')), [], 'page.json enthaelt einen B2B-Bereich');
  assert.deepEqual(tpl.order, ['main']);
  const main = tpl.sections.main;
  assert.equal(main.type, 'main-page');
  assert.notEqual(main.disabled, true, 'Hauptbereich abgeschaltet - die Seite zeigt ihren eigenen Inhalt nicht');
  const bloecke = main.block_order.map((id) => main.blocks[id].type);
  assert.ok(bloecke.includes('page-content'), 'page-content fehlt - der Seiteninhalt wird nicht gerendert');
});

test('B: kein Knopf in einer Seitenvorlage hat einen leeren Link', () => {
  const dateien = readdirSync(TEMPLATES).filter((f) => /^page(\..+)?\.json$/.test(f) && !VERWAIST.includes(f));
  assert.ok(dateien.includes('page.json'));
  const funde = dateien.flatMap((f) => leereKnopfLinks(lies(f), { defaults: defaultsOf }).map((x) => `${f}: ${x}`));
  assert.deepEqual(funde, []);
});

test('C: jede B2B-Seite hat eine Vorlage zu ihrem Suffix, Knoepfe zeigen auf Kontakt und WhatsApp', () => {
  for (const suffix of B2B_SUFFIXE) {
    const name = `page.${suffix}.json`;
    assert.ok(existsSync(new URL(name, TEMPLATES)), `${name} fehlt - die Seite faellt sonst auf page.json zurueck`);
    const hero = Object.values(lies(name).sections).find((s) => s.type === 'b2b-hero-bereich');
    assert.ok(hero, `${name}: kein B2B-Kopf`);
    assert.match(hero.settings.primary_btn_link, /\/pages\/kontakt$/, `${name}: Knopf 1 zeigt nicht auf die Kontaktseite`);
    assert.match(hero.settings.secondary_btn_link, /^https:\/\/wa\.me\//, `${name}: Knopf 2 zeigt nicht auf WhatsApp`);
  }
});

test('D: die Pruefung greift - Knopf mit Text und leerem Link ist ein Fund', () => {
  const tpl = { sections: { a: { type: 'x', settings: { primary_btn_text: 'Projekt anfragen', primary_btn_link: '' } } } };
  assert.equal(leereKnopfLinks(tpl).length, 1);
  tpl.sections.a.settings.primary_btn_link = '/pages/kontakt';
  assert.deepEqual(leereKnopfLinks(tpl), []);
  // Fehlt der Link im Template, zaehlt der Wert aus dem Schema: leer ist ein
  // Fund, ein gesetzter Default nicht.
  const ohne = { sections: { a: { type: 'x', settings: { primary_label: 'Ansehen' } } } };
  assert.equal(leereKnopfLinks(ohne, { defaults: () => ({ primary_link: '' }) }).length, 1);
  assert.deepEqual(leereKnopfLinks(ohne, { defaults: () => ({ primary_link: '/collections/x' }) }), []);
});

test('D2: abgeschaltete Kacheln, abgeschaltete Bereiche und Links ohne Knopftext zaehlen nicht', () => {
  const tpl = { sections: {
    kacheln: { type: 'x', settings: { tile_5_enabled: false, tile_5_button_text: 'Mehr erfahren', tile_5_button_link: '' } },
    aus: { type: 'x', disabled: true, settings: { primary_btn_text: 'Projekt anfragen', primary_btn_link: '' } },
    bild: { type: 'x', blocks: { b: { type: 'image', settings: { link: '' } } } },
  } };
  assert.deepEqual(leereKnopfLinks(tpl), []);
  tpl.sections.kacheln.settings.tile_5_enabled = true;
  assert.equal(leereKnopfLinks(tpl).length, 1);
});

test('E: die Ausnahmeliste nennt nur Dateien, die es gibt und die sie noch brauchen', () => {
  for (const f of VERWAIST) {
    assert.ok(existsSync(new URL(f, TEMPLATES)), `${f} existiert nicht mehr - aus VERWAIST streichen`);
    assert.ok(!B2B_SUFFIXE.some((s) => f === `page.${s}.json`), `${f} ist eine echte Suffix-Vorlage, keine verwaiste`);
    assert.ok(leereKnopfLinks(lies(f), { defaults: defaultsOf }).length > 0, `${f} hat keine leeren Links mehr - aus VERWAIST streichen`);
  }
});
