import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

// Beratung/Masspruefung/Verlegeanfrage im Warenkorb: reiner Kern ohne DOM.
createRequire(import.meta.url)('../../assets/tp-cart-beratung.js');
const B = globalThis.TPCartBeratung;

const root = path.resolve(import.meta.dirname, '../..');
const lies = (datei) => fs.readFileSync(path.join(root, datei), 'utf8');

test('Beratung ohne Antwort sperrt', () => {
  const r = B.pruefen({}, {});
  assert.equal(r.ok, false);
  assert.equal(r.fehler[0].code, 'BERATUNG_FEHLT');
});

test('Nein ohne Telefon ist vollstaendig', () => {
  const r = B.pruefen({ Beratung: 'Nein' }, { masspruefung: true });
  assert.equal(r.ok, true);
  assert.equal(r.telefonNoetig, false);
});

test('Ja verlangt eine Telefonnummer mit mindestens 6 Ziffern', () => {
  assert.equal(B.pruefen({ Beratung: 'Ja' }, {}).fehler[0].code, 'TELEFON_FEHLT');
  assert.equal(B.pruefen({ Beratung: 'Ja', Telefon: '0176' }, {}).fehler[0].code, 'TELEFON_UNGUELTIG');
  assert.equal(B.pruefen({ Beratung: 'Ja', Telefon: 'abc@def' }, {}).fehler[0].code, 'TELEFON_UNGUELTIG');
  assert.equal(B.pruefen({ Beratung: 'Ja', Telefon: '+49 3301 573 37 20' }, {}).ok, true);
});

test('Masspruefung Ja verlangt Telefon auch bei Beratung Nein', () => {
  const r = B.pruefen({ Beratung: 'Nein', 'Maßprüfung': 'Ja' }, { masspruefung: true });
  assert.equal(r.ok, false);
  assert.equal(r.telefonNoetig, true);
  // Ohne gestellte Frage zaehlt die Antwort nicht.
  assert.equal(B.pruefen({ Beratung: 'Nein', 'Maßprüfung': 'Ja' }, {}).ok, true);
});

test('attributeAus leert nicht benoetigte Felder und kappt den Freitext', () => {
  const a = B.attributeAus({ beratung: 'Nein', telefon: '0176 1234567', zeit: 'Egal', thema: 'x', mass: 'Ja', verlegung: true }, {});
  assert.deepEqual(a, { Beratung: 'Nein', Telefon: '', 'Rückruf': '', Beratungsthema: '', 'Maßprüfung': '', Verlegung: '' });
  const b = B.attributeAus({ beratung: 'Ja', telefon: ' 0176 1234567 ', zeit: 'Vormittags', thema: 'y'.repeat(600), mass: 'Ja', verlegung: true }, { masspruefung: true, verlegung: true });
  assert.equal(b.Telefon, '0176 1234567');
  assert.equal(b.Beratungsthema.length, 500);
  assert.equal(b['Maßprüfung'], 'Ja');
  assert.equal(b.Verlegung, 'Angefragt');
  // Masspruefung Ja bei Beratung Nein behaelt das Telefon.
  const c = B.attributeAus({ beratung: 'Nein', telefon: '0176 1234567', mass: 'Ja' }, { masspruefung: true });
  assert.equal(c.Telefon, '0176 1234567');
  assert.equal(c['Rückruf'], '');
});

test('Unzulaessige Werte werden nicht gespeichert', () => {
  const a = B.attributeAus({ beratung: 'Vielleicht', mass: 'Ja', verlegung: 'x' }, { masspruefung: true, verlegung: false });
  assert.equal(a.Beratung, '');
  assert.equal(a.Verlegung, '');
  assert.equal(B.pruefen(a, { masspruefung: true }).ok, false);
});

test('Snippet ist im Cart-Summary vor den Checkout-Buttons eingebunden', () => {
  const summary = lies('snippets/cart-summary.liquid');
  const pos = summary.indexOf("render 'tp-cart-beratung'");
  assert.ok(pos > 0);
  assert.ok(pos < summary.indexOf('<div class="cart__ctas">'));
  const snippet = lies('snippets/tp-cart-beratung.liquid');
  for (const name of ['attributes[Beratung]', 'attributes[Telefon]', 'attributes[Rückruf]', 'attributes[Beratungsthema]', 'attributes[Maßprüfung]', 'attributes[Verlegung]']) {
    assert.ok(snippet.includes(name), name);
  }
  // Keine Vorauswahl: checked nur aus cart.attributes.
  assert.ok(!/value="Ja" data-tp-feld="beratung" form="cart-form" (required )?checked/.test(snippet));
});

test('Telefonfehler nennt den Grund (Beratung oder Masspruefung)', () => {
  const a = B.pruefen({ Beratung: 'Ja', Telefon: '   ' }, {});
  assert.equal(a.fehler[0].code, 'TELEFON_FEHLT');
  assert.equal(a.fehler[0].text, 'Telefonnummer erforderlich: Für die Beratung benötigen wir Ihre Telefonnummer.');
  const m = B.pruefen({ Beratung: 'Nein', 'Maßprüfung': 'Ja' }, { masspruefung: true });
  assert.match(m.fehler[0].text, /^Telefonnummer erforderlich: Für die Maßprüfung/);
});

test('Gespeicherte Attribute nach Reload: Ja ohne Telefon bleibt gesperrt', () => {
  // So liest der Waechter die vorbelegten Felder aus dem DOM.
  assert.equal(B.pruefen(B.attributeAus({ beratung: 'Ja', telefon: '' }, {}), {}).ok, false);
  assert.equal(B.pruefen(B.attributeAus({ beratung: 'Ja', telefon: '0176 1234567' }, {}), {}).ok, true);
});

test('istCheckoutWeg erkennt jeden Weg in den Checkout', () => {
  const W = B.istCheckoutWeg;
  assert.equal(W({ art: 'click', name: 'checkout' }), true);
  assert.equal(W({ art: 'click', klasse: 'cart__checkout-button button' }), true);
  assert.equal(W({ art: 'click', href: '/checkout' }), true);
  assert.equal(W({ art: 'click', href: '/checkouts/cn/abc?x=1' }), true);
  assert.equal(W({ art: 'click', href: 'https://www.teppich-paradies.net/checkout#top' }), true);
  assert.equal(W({ art: 'click', href: '/cart' }), false);
  assert.equal(W({ art: 'click', href: '/collections/checkout-angebote' }), false);
  assert.equal(W({ art: 'click', name: 'add', klasse: 'button' }), false);
  // Formular: Button, Enter-Taste/requestSubmit ohne Submitter, fremder Button
  assert.equal(W({ art: 'submit', cartForm: true, submitterName: 'checkout' }), true);
  assert.equal(W({ art: 'submit', cartForm: true, submitterName: '' }), true);
  assert.equal(W({ art: 'submit', cartForm: true, submitterName: 'update' }), false);
  assert.equal(W({ art: 'submit', cartForm: false, submitterName: 'checkout' }), false);
});

test('pfad schneidet Host, Query und Anker ab', () => {
  assert.equal(B.pfad('https://x.de/checkout?a=1'), '/checkout');
  assert.equal(B.pfad('//x.de'), '/');
  assert.equal(B.pfad('/cart#x'), '/cart');
});

test('Waechter und Serverzustand sind verdrahtet', () => {
  const js = lies('assets/tp-cart-beratung.js');
  assert.match(js, /addEventListener\('click',[\s\S]*?, true\)/);
  assert.match(js, /addEventListener\('submit',[\s\S]*?, true\)/);
  assert.match(js, /stopImmediatePropagation/);
  const snippet = lies('snippets/tp-cart-beratung.liquid');
  assert.match(snippet, /tp-beratung-offen\{% endif %\}/);
  assert.match(snippet, /data-tp-telefon-fehler/);
  assert.match(snippet, /tp-beratung-offen ~ \.cart__ctas \.additional-checkout-buttons/);
  // Drawer: Skript global, weil per Morph eingefuegte Script-Tags nicht laufen.
  assert.match(lies('snippets/header-actions.liquid'), /tp-cart-beratung\.js/);
});

test('Beratungsfrage nur bei reinen Musterbestellungen (ctx.beratung)', () => {
  // Ware im Warenkorb: Frage nicht gestellt, keine Pflicht, altes "Ja" wird geloescht
  assert.equal(B.pruefen({}, { beratung: false }).ok, true);
  assert.equal(B.pruefen({ Beratung: 'Ja' }, { beratung: false }).telefonNoetig, false);
  assert.equal(B.attributeAus({ beratung: 'Ja', telefon: '0176 1234567' }, { beratung: false }).Beratung, '');
  // Masspruefung "Ja" verlangt weiter das Telefon
  assert.equal(B.pruefen({ 'Maßprüfung': 'Ja' }, { beratung: false, masspruefung: true }).ok, false);
  // Nur Muster: Frage ist Pflicht, bei Ja mit Telefon
  assert.equal(B.pruefen({}, { beratung: true }).ok, false);
  assert.equal(B.pruefen({ Beratung: 'Ja' }, { beratung: true }).ok, false);
  assert.equal(B.pruefen({ Beratung: 'Ja', Telefon: '0176 1234567' }, { beratung: true }).ok, true);
  const snippet = lies('snippets/tp-cart-beratung.liquid');
  assert.match(snippet, /assign tpb_nur_muster = false/);
  assert.match(snippet, /\{%- if tpb_nur_muster -%\}\s*<fieldset/);
});
