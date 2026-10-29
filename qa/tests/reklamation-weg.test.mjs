// Reklamationsweg (Werkbank w-182, Inhaber 28.10.2026): Seite mit vier
// Schritten, Antwortfrist 2 Werktage, Hinweis auf die gesetzlichen Rechte und
// das Kontakt-Thema ?thema=reklamation mit Feld Bestellnummer.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const lies = (pfad) => readFileSync(new URL(`../../${pfad}`, import.meta.url), 'utf8');
const skript = lies('assets/tp-sample-request.js');
const kontakt = lies('sections/contact-form.liquid');
const sektion = lies('sections/tp-reklamation.liquid');
const vorlage = JSON.parse(lies('templates/page.reklamation.json').replace(/^\/\*[\s\S]*?\*\/\s*/, ''));

function knoten() {
  const attribute = new Map();
  return {
    value: '', required: false, hidden: false, disabled: undefined, textContent: '', attribute,
    setAttribute(k, v) { attribute.set(k, v); }, getAttribute(k) { return attribute.get(k); },
    hasAttribute(k) { return attribute.has(k); }, addEventListener() {}, focus() {}, querySelector() { return null; },
  };
}

function kontaktseite(search) {
  const versteckt = new Map(), felder = new Map();
  const root = knoten(), hinweis = knoten(), nachricht = knoten();
  hinweis.hidden = true;
  root.querySelector = (selektor) => {
    if (selektor === '[data-message-field]') return nachricht;
    if (selektor === '[data-tp-anfrage-hinweis]') return hinweis;
    const name = selektor.match(/^\[data-tp-hidden-field="(.+)"\]$/)?.[1];
    if (name) { if (!versteckt.has(name)) versteckt.set(name, knoten()); return versteckt.get(name); }
    if (selektor.startsWith('input[name=')) {
      if (!felder.has(selektor)) { const f = knoten(); f.disabled = true; felder.set(selektor, f); }
      return felder.get(selektor);
    }
    return null;
  };
  const document = { querySelector: (s) => (s === '[data-tp-sample-request]' ? root : null), addEventListener() {}, createElement: () => knoten() };
  const window = { location: { search, hash: '', origin: 'https://shop.example' } };
  vm.runInNewContext(skript, { window, document, URLSearchParams, setTimeout() {}, clearTimeout() {} });
  return { root, hinweis, nachricht, versteckt, bestellnummer: felder.get('input[name="contact[Bestellnummer]"]') };
}

test('?thema=reklamation setzt Betreff, zeigt und aktiviert das Feld Bestellnummer', () => {
  const s = kontaktseite('?thema=reklamation');
  assert.equal(s.versteckt.get('Betreff').value, 'Reklamation');
  assert.equal(s.root.hasAttribute('data-reklamation'), true);
  assert.equal(s.bestellnummer.disabled, false);
  assert.equal(s.bestellnummer.required, false, 'Bestellnummer bleibt freiwillig');
  assert.equal(s.hinweis.hidden, false);
  assert.match(s.nachricht.value, /^Ich möchte eine Reklamation melden\./);
  assert.doesNotMatch(s.nachricht.value, /Fläche \/ Raum/);
});

test('Andere Themen lassen das Feld Bestellnummer aus', () => {
  for (const search of ['', '?thema=verlegung', '?thema=angebot&produkt=Alvento']) {
    const s = kontaktseite(search);
    assert.equal(s.root.hasAttribute('data-reklamation'), false, search);
    assert.notEqual(s.bestellnummer?.disabled, false, search);
  }
});

test('Kontaktformular: Bestellnummer ist ohne Thema ausgeblendet und deaktiviert', () => {
  const feld = kontakt.match(/<input[^>]*name="contact\[Bestellnummer\]"[^>]*>/)?.[0];
  assert.ok(feld, 'Feld Bestellnummer fehlt');
  assert.match(feld, /\sdisabled>/);
  assert.doesNotMatch(feld, /required/);
  assert.match(kontakt, /\[data-reklamation-feld\] \{\s*display: none;/);
  assert.match(kontakt, /pages\['reklamation'\]/, 'Link zur Reklamationsseite nur, wenn die Seite existiert');
});

test('Vorlage: vier Schritte, 2 Werktage und Hinweis auf die gesetzlichen Rechte', () => {
  const main = vorlage.sections.main;
  assert.equal(main.type, 'tp-reklamation');
  assert.equal(main.block_order.length, 4);
  const texte = main.block_order.map((id) => `${main.blocks[id].settings.titel} ${main.blocks[id].settings.text}`).join(' ');
  assert.match(texte, /Fahrer/);
  assert.match(texte, /Rollenetikett/);
  assert.match(texte, /Bestellnummer/);
  assert.match(texte, /innerhalb von 2 Werktagen/);
  assert.match(main.settings.rechte, /gesetzlichen Rechte bleiben unberührt/);
  assert.match(main.settings.rechte, /keine Voraussetzung/);
  assert.match(sektion, /\?thema=reklamation/);
});
