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
  assert.ok(!/value="Ja" data-tp-feld="beratung" form="cart-form" checked/.test(snippet));
});
