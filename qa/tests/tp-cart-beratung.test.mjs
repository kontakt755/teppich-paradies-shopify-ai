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
  for (const name of ['attributes[Beratung]', 'attributes[Telefon]', 'attributes[Rückruf]', 'attributes[Beratungsthema]', 'attributes[Verlegung]']) {
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

// --- Beratungsfrage nur bei reiner Musterbestellung -------------------------

test('Ohne Beratungsfrage sperrt nichts den Checkout', () => {
  const r = B.pruefen({}, { beratungsfrage: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.fehler, []);
});

test('Ohne Beratungsfrage wird eine alte Antwort geleert', () => {
  const a = B.attributeAus(
    { beratung: 'Ja', telefon: '0301234567', zeit: 'Vormittags', thema: 'Farbe unklar' },
    { beratungsfrage: false }
  );
  assert.equal(a.Beratung, '');
  assert.equal(a.Telefon, '');
  assert.equal(a['Rückruf'], '');
  assert.equal(a.Beratungsthema, '');
});

test('Masspruefung braucht die Telefonnummer auch ohne Beratungsfrage', () => {
  const ctx = { beratungsfrage: false, masspruefung: true };
  const a = B.attributeAus({ beratung: 'Ja', mass: 'Ja', telefon: '03301 5733720' }, ctx);
  assert.equal(a.Beratung, '');
  assert.equal(a['Maßprüfung'], 'Ja');
  assert.equal(a.Telefon, '03301 5733720');
  assert.equal(B.pruefen(a, ctx).ok, true);
  assert.equal(B.pruefen({ ...a, Telefon: '' }, ctx).fehler[0].code, 'TELEFON_FEHLT');
});

test('Fehlender ctx verhaelt sich wie bisher (Frage gestellt)', () => {
  assert.equal(B.pruefen({}, {}).fehler[0].code, 'BERATUNG_FEHLT');
  assert.equal(B.pruefen({}).fehler[0].code, 'BERATUNG_FEHLT');
});

test('Keine Pflichtfrage mehr - Beratung laeuft als Musteranfrage (2026-09-26)', () => {
  const s = lies('snippets/tp-cart-beratung.liquid');
  // Die Frage ist abgeschaltet, alte Antworten werden aufgeraeumt.
  assert.match(s, /assign tpb_frage = false/);
  assert.ok(!/assign tpb_frage = true/.test(s), 'tpb_frage wird nie mehr true');
  assert.ok(s.includes('data-aufraeumen'));
  assert.ok(s.includes("render 'tp-muster-position', line_item: tpb_item"));
  // Neue Anfrage: nur bei reiner Musterbestellung, Kontaktformular mit Telefonpflicht.
  const m = lies('snippets/tp-muster-beratungsanfrage.liquid');
  assert.ok(m.includes("render 'tp-muster-position', line_item: tpm_item"));
  assert.match(m, /if tpm_muster != blank and tpm_ware == 0/);
  assert.match(m, /form 'contact'/);
  assert.match(m, /name="contact\[Telefon\]"[^>]*required/);
  assert.match(m, /name="contact\[email\]"[^>]*required/);
  assert.match(m, /RÜCKRUF – Musterberatung/);
  assert.match(m, /cart\/clear\.js/);
  assert.ok(lies('snippets/cart-summary.liquid').includes("render 'tp-muster-beratungsanfrage'"));
});

test('Muster-Regel steht in Liquid und Node deckungsgleich', () => {
  const liquid = lies('snippets/tp-muster-position.liquid');
  const node = lies('operations/lib/muster.mjs');
  for (const merkmal of ['_Muster_ID', 'M-', 'TP-MUSTER', 'Musterservice']) {
    assert.ok(liquid.includes(merkmal), `Liquid kennt ${merkmal}`);
    assert.ok(node.includes(merkmal), `Node kennt ${merkmal}`);
  }
  // Beide schliessen Preis und Handle ausdruecklich aus.
  for (const text of [liquid, node]) {
    assert.match(text, /Handle/);
    assert.match(text, /0,00|Preis/);
  }
  assert.ok(liquid.includes('operations/lib/muster.mjs'));
  assert.ok(node.includes('snippets/tp-muster-position.liquid'));
});

test('Zwischen Gesamtbetrag und Kaufknopf steht nur der Preishinweis', () => {
  const s = lies('snippets/cart-summary.liquid');
  const total = s.indexOf('cart-totals__total-value');
  const cta = s.indexOf('<div class="cart__ctas">');
  const dazwischen = s.slice(total, cta);
  assert.ok(total > 0 && cta > total);
  // Ratenzahlung ist unter die Kaufknoepfe gewandert.
  assert.ok(!dazwischen.includes('| payment_terms'), 'keine Ratenzahlung vor dem Kaufknopf');
  assert.ok(s.indexOf('| payment_terms') > cta, 'Ratenzahlung steht nach den Kaufknoepfen');
  // Der gesetzliche Preishinweis bleibt am Preis.
  assert.ok(dazwischen.includes("render 'tax-info'"));
});

test('Pflichtfrage vor dem Kaufknopf, Verlegeanfrage dahinter', () => {
  const s = lies('snippets/cart-summary.liquid');
  const vor = s.indexOf("render 'tp-cart-beratung', stelle: 'vor_kasse'");
  const cta = s.indexOf('<div class="cart__ctas">');
  const nach = s.indexOf("render 'tp-cart-beratung', stelle: 'nach_kasse'");
  assert.ok(vor > 0 && cta > vor, 'vor_kasse steht vor den Kaufknoepfen');
  assert.ok(nach > cta, 'nach_kasse steht hinter den Kaufknoepfen');

  const snippet = lies('snippets/tp-cart-beratung.liquid');
  // Die Stelle entscheidet Liquid, nicht CSS - sonst wichen Lese- und
  // Tastaturreihenfolge von der sichtbaren Reihenfolge ab.
  assert.match(snippet, /assign tpb_stelle_soll = 'nach_kasse'/);
  assert.match(snippet, /if tpb_frage\s*\n\s*assign tpb_stelle_soll = 'vor_kasse'/);
  assert.match(snippet, /if tpb_stelle != tpb_stelle_soll\s*\n\s*assign tpb_zeigen = false/);
  assert.ok(!/(?:^|[\s;{])order:\s*\d/m.test(snippet), 'keine CSS-order-Umsortierung');
});

test('Masspruefung vor dem Zuschnitt wird nicht mehr gefragt, alte Antwort wird geleert', () => {
  // Inhaberentscheidung 2026-09-24: die Frage lud Kunden kurz vor der Kasse ein,
  // die Bestellung noch einmal zu ueberdenken.
  const snippet = lies('snippets/tp-cart-beratung.liquid');
  assert.ok(!/<legend[^>]*>[^<]*vor dem Zuschnitt/.test(snippet), 'Frage ist raus');
  assert.ok(!snippet.includes('name="attributes[Maßprüfung]"'), 'kein Eingabefeld mehr');
  assert.ok(!snippet.includes('data-masspruefung'), 'Skript bekommt die Frage nicht mehr gemeldet');
  assert.match(snippet, /if tpb_masswahl != blank\s*\n\s*assign tpb_aufraeumen = true/);
  // Ohne data-masspruefung schreibt das Skript die Antwort leer.
  const a = B.attributeAus({ beratung: 'Nein', mass: 'Ja', telefon: '0176 1234567' }, { beratungsfrage: false });
  assert.equal(a['Maßprüfung'], '');
  assert.equal(a.Telefon, '');
});
