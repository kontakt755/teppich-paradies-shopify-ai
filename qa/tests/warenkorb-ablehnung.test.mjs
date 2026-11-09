// Warenkorb-Ablehnung: bei 422 mit description sieht der Kunde den Shopify-Grund
// (Vorbild tp-rollware-rechner); 429/5xx und kaputte Antworten bleiben ohne Grund.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Der Einfass-Konfigurator haengt beim Laden Listener an document.
globalThis.window = globalThis;
globalThis.document = { readyState: 'complete', querySelectorAll: () => [], addEventListener() {} };
require('../../assets/tp-einfass-konfigurator.js');
require('../../assets/tp-laengen-zuschnitt.js');
require('../../assets/tp-unterlage-vorschlag.js');

const wege = {
  einfass: globalThis.TPEinfassAblehnung,
  laengen: globalThis.TPLaengenZuschnitt.ablehnung,
  unterlage: globalThis.TPUnterlage.ablehnung
};
const antwort = (status, body) => ({ ok: false, status, json: () => (body === undefined ? Promise.reject(new Error('kein JSON')) : Promise.resolve(body)) });
const grundVon = (f, r) => f(r).then(() => assert.fail('muss ablehnen'), (e) => e.grund);

for (const [name, f] of Object.entries(wege)) {
  test(`${name}: 422 mit description liefert den Grund`, async () => {
    assert.equal(await grundVon(f, antwort(422, { description: 'Es sind nur 3 verfuegbar.' })), 'Es sind nur 3 verfuegbar.');
  });
  test(`${name}: 500, 429, 422 ohne Text und Nicht-JSON bleiben ohne Grund`, async () => {
    assert.equal(await grundVon(f, antwort(500, { description: 'x' })), '');
    assert.equal(await grundVon(f, antwort(429, { description: 'x' })), '');
    assert.equal(await grundVon(f, antwort(422, { description: 42 })), '');
    assert.equal(await grundVon(f, antwort(422)), '');
  });
}

test('Fehlerzweig zeigt Grund vorlesbar, Dauer 8 s, sonst 3 s', () => {
  for (const d of ['tp-einfass-konfigurator.js', 'tp-laengen-zuschnitt.js', 'tp-unterlage-vorschlag.js']) {
    const s = readFileSync(new URL(`../../assets/${d}`, import.meta.url), 'utf8');
    assert.match(s, /aria-live', 'polite'/, d);
    assert.match(s, /grund \? 'Nicht hinzugefügt' : 'Nicht hinzugefügt – /, d);
    assert.match(s, /return ablehnung\(r\)/, d);
    if (!d.includes('unterlage')) assert.match(s, /grund \? 8000 : 3000/, d);
  }
});
