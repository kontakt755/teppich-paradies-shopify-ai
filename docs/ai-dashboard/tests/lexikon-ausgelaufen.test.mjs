import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { wegwerfOrdner } from '../../../scripts/test-temp.mjs';
import { createApi } from '../../../scripts/dashboard-api.mjs';

const variante = sku => ({ id: `gid://shopify/ProductVariant/${sku}`, titel: 'Grau', sku, farbe: 'Grau', preis: 10, waehrung: 'EUR', verfuegbar: true,
  einkauf: { lieferant: 'Lieferant A', artikelnummer: sku, farbnummer: '01' }, link: { status: 'fehlt', grund: 'kein Link', suchlink: null } });
const produkt = (handle, titel, status) => ({ handle, titel, status, produktgruppe: 'Teppichboden', bild: null, eigenschaften: {}, muster: { vorhanden: false, handle: null }, varianten: [variante(`SKU-${handle}`)] });

function apiMitArchiv() {
  const dir = wegwerfOrdner('cc-lexikon-archiv-');
  fs.mkdirSync(path.join(dir, 'lexikon'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lexikon', 'produkte.json'), JSON.stringify({
    erstellt: '2026-11-24T08:00:00Z', anzahl: 1,
    produkte: [produkt('nordlicht-teppichboden', 'Nordlicht Teppichboden', 'ACTIVE')],
    archiviert: [produkt('altstadt-teppichboden', 'Altstadt Teppichboden', 'ARCHIVED')],
  }));
  return createApi({ gh: async () => '', root: wegwerfOrdner('cc-root-'), privatDirPath: dir });
}

test('Produktsuche findet Ausgelaufenes, hinter den lieferbaren Treffern und mit Status', () => {
  const api = apiMitArchiv();
  const alle = api.lexikonListe({ q: 'teppichboden' }).treffer.items;
  assert.deepEqual(alle.map(p => [p.handle, p.status]), [['nordlicht-teppichboden', 'ACTIVE'], ['altstadt-teppichboden', 'ARCHIVED']]);
  assert.equal(api.lexikonListe({ q: 'altstadt' }).treffer.count, 1);
});

test('Durchblaettern ohne Suche und die Zahl "Produkte" bleiben ohne Ausgelaufenes', () => {
  const liste = apiMitArchiv().lexikonListe({});
  assert.deepEqual(liste.treffer.items.map(p => p.handle), ['nordlicht-teppichboden']);
  assert.equal(liste.anzahl, 1);
});

test('Produktblatt eines ausgelaufenen Produkts oeffnet mit Status ARCHIVED', () => {
  const d = apiMitArchiv().lexikonProdukt('altstadt-teppichboden');
  assert.equal(d.verfuegbar, true);
  assert.equal(d.produkt.status, 'ARCHIVED');
});

test('Musterlager: Farben eines ausgelaufenen Produkts lassen sich einlagern, aber nicht im Shop sperren', () => {
  const d = apiMitArchiv().einkaufMusterlagerFarben({ handle: 'altstadt-teppichboden' });
  assert.equal(d.verfuegbar, true);
  assert.equal(d.ausgelaufen, true);
  assert.ok(d.farben.every(f => f.sperrbar === false));
});

test('"Gibt es im Shop" bleibt ohne Ausgelaufenes: _lexikonProdukte()', () => {
  const api = apiMitArchiv();
  assert.deepEqual(api._lexikonProdukte().map(p => p.handle), ['nordlicht-teppichboden']);
  assert.equal(api._lexikonMitArchiv().length, 2);
});
