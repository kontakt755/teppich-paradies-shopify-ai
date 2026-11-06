// Die eigenen Kaufwege oeffnen das Warenkorbfenster erst mit frischen Abschnitten,
// sonst zeigt es beim ersten Artikel kurz "leer" (Punkt 45, Pruefung 2026-11-05).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const lies = datei => fs.readFileSync(new URL(`../../${datei}`, import.meta.url), 'utf8');

function helfer({ antwort, ids = ['kopf'] }) {
  const aufrufe = [];
  const window = { location: { pathname: '/products/beispiel' } };
  const kontext = {
    window,
    document: { querySelectorAll: () => ids.map(id => ({ dataset: { sectionId: id } })) },
    fetch: (url, optionen) => { aufrufe.push({ url, optionen }); return antwort(); },
    setTimeout: () => 0,
    Promise,
  };
  vm.runInNewContext(lies('assets/tp-warenkorb-abschnitte.js'), kontext);
  return { abschnitte: window.TPWarenkorbAbschnitte, aufrufe };
}

test('holt jeden Abschnitt einmal und schickt keinen JSON-Accept-Kopf', async () => {
  const { abschnitte, aufrufe } = helfer({ ids: ['kopf', 'kopf', 'seite'], antwort: async () => ({ ok: true, json: async () => ({ kopf: '<div></div>' }) }) });
  const ergebnis = await abschnitte();
  assert.equal(ergebnis.kopf, '<div></div>');
  assert.equal(aufrufe[0].url, '/products/beispiel?sections=kopf%2Cseite');
  // Auf einer Produktseite liefert "application/json" das Produkt statt der Abschnitte.
  assert.equal(aufrufe[0].optionen.headers, undefined);
  assert.equal(aufrufe[0].optionen.cache, 'no-store');
});

test('ein Fehler kommt als null zurueck, der Kauf haengt nie daran', async () => {
  assert.equal(await helfer({ antwort: async () => { throw new Error('Netz'); } }).abschnitte(), null);
  assert.equal(await helfer({ antwort: async () => ({ ok: false }) }).abschnitte(), null);
});

test('ohne Warenkorbbereich auf der Seite gibt es keinen Abruf', async () => {
  const { abschnitte, aufrufe } = helfer({ ids: [], antwort: async () => ({ ok: true }) });
  assert.equal(await abschnitte(), null);
  assert.equal(aufrufe.length, 0);
});

for (const [datei, block] of [
  ['assets/tp-einfass-konfigurator.js', 'blocks/tp-einfass-konfigurator.liquid'],
  ['assets/tp-laengen-zuschnitt.js', 'blocks/tp-laengen-zuschnitt.liquid'],
  ['blocks/tp-rollware-rechner.liquid', 'blocks/tp-rollware-rechner.liquid'],
  ['blocks/paket-auswahl.liquid', 'blocks/paket-auswahl.liquid'],
]) {
  test(`${datei}: holt die Abschnitte vor dem Oeffnen und gibt sie weiter`, () => {
    const code = lies(datei);
    const holen = code.indexOf('window.TPWarenkorbAbschnitte');
    const melden = code.indexOf("sections: ", holen);
    const oeffnen = code.indexOf("querySelector('cart-drawer-component')", holen);
    assert.ok(holen > -1 && melden > holen && oeffnen > melden, 'Reihenfolge: holen, melden, oeffnen');
    assert.match(lies(block), /tp-warenkorb-abschnitte\.js/);
  });
}

test('Einfass-Konfigurator: Abschnitte erst nach dem Zuschnitt-Abgleich', () => {
  // Abschnitte aus /cart/add.js kennen das Attribut noch nicht und zeigen die Checkout-Sperre.
  const code = lies('assets/tp-einfass-konfigurator.js');
  const hinzufuegen = code.indexOf("fetch('/cart/add.js'");
  const abgleich = code.indexOf('zuschnittAbgleichen().then', hinzufuegen);
  const holen = code.indexOf('window.TPWarenkorbAbschnitte', hinzufuegen);
  assert.ok(abgleich > hinzufuegen && holen > abgleich);
});
