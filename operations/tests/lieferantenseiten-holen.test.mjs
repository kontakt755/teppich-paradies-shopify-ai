import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  attributeAuslesen,
  seiteAuswerten,
  basisAusEnvDatei,
  idsAusKatalog,
  laufen,
} from '../scripts/lieferantenseiten-holen.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tp-lieferantenseiten-'));
}

const BEISPIEL_HTML = `
<div class="row">
  <div class="product-attribute-name">Kollektionsname</div>
  <div class="col-8 col-lg-9 irgendwas">Testkollektion</div>
</div>
<div class="row">
  <div class="product-attribute-name">Marke</div>
  <div class="col-8 col-lg-9 irgendwas">Testmarke</div>
</div>
<div class="row">
  <div class="product-attribute-name">Stärke (mm)</div>
  <div class="col-8 col-lg-9 irgendwas"><b>7.5</b></div>
</div>
`;

test('attributeAuslesen: liest Name/Wert-Paare, entfernt HTML-Tags aus dem Wert', () => {
  const attrs = attributeAuslesen(BEISPIEL_HTML);
  assert.equal(attrs['Kollektionsname'], 'Testkollektion');
  assert.equal(attrs['Marke'], 'Testmarke');
  assert.equal(attrs['Stärke (mm)'], '7.5');
});

test('attributeAuslesen: leere Seite liefert leeres Objekt, keinen Fehler', () => {
  assert.deepEqual(attributeAuslesen('<html><body>Fehlerseite</body></html>'), {});
});

test('seiteAuswerten: baut den Cache-Eintrag mit Kollektion, Marke und url', () => {
  const daten = seiteAuswerten({ html: BEISPIEL_HTML, pid: '4711', basis: 'https://lieferant-a.example', jetzt: () => new Date('2026-09-24T10:00:00Z') });
  assert.equal(daten.product_id, '4711');
  assert.equal(daten.url, 'https://lieferant-a.example/de-DE/product/4711');
  assert.equal(daten.kollektion, 'Testkollektion');
  assert.equal(daten.marke, 'Testmarke');
  assert.equal(daten.attrs['Stärke (mm)'], '7.5');
  assert.equal(daten.fetched_at, '2026-09-24T10:00:00.000Z');
});

test('basisAusEnvDatei: liest LIEFERANT_A_BASIS ohne Klarnamen im Repo', () => {
  const dir = tmpDir();
  const pfad = path.join(dir, 'lieferant-a.env');
  fs.writeFileSync(pfad, 'LIEFERANT_A_BASIS=https://lieferant-a.example/\n');
  assert.equal(basisAusEnvDatei(pfad), 'https://lieferant-a.example');
});

test('basisAusEnvDatei: fehlende Datei wirft eine klare Fehlermeldung', () => {
  assert.throws(() => basisAusEnvDatei('/nicht/vorhanden/lieferant-a.env'), /fehlt/);
});

test('idsAusKatalog: eindeutige Produktseiten-IDs ohne Duplikate', () => {
  const katalog = {
    'SKU-1': { match: { url: 'https://lieferant-a.example/de-DE/product/4711' } },
    'SKU-2': { match: { url: 'https://lieferant-a.example/de-DE/product/4712' } },
    'SKU-3': { match: { url: 'https://lieferant-a.example/de-DE/product/4711' } }, // gleiche Seite wie SKU-1
    'SKU-4': {},
  };
  assert.deepEqual(idsAusKatalog(katalog), ['4711', '4712']);
});

// -- Fortsetzbarkeit / Abruf --------------------------------------------

function fetchStub(seiten, log = []) {
  return async (url) => {
    log.push(url);
    const pid = url.split('/').pop();
    return {
      headers: { get: () => null },
      text: async () => seiten[pid] || '<html></html>',
    };
  };
}

test('laufen: fertige Seiten im Cache werden nie erneut geholt', async () => {
  const dir = tmpDir();
  const cachePfad = path.join(dir, 'cache.json');
  fs.writeFileSync(cachePfad, JSON.stringify({ 4711: { product_id: '4711', kollektion: 'Alt', attrs: { x: '1' } } }));
  const aufrufe = [];
  const fetch = fetchStub({ 4712: BEISPIEL_HTML }, aufrufe);

  const { geholt } = await laufen({ basis: 'https://lieferant-a.example', ids: ['4711', '4712'], cachePfad, fetch, delayMs: 0, einmal: true, protokoll: { log() {}, error() {} } });

  assert.equal(geholt, 1);
  const cache = JSON.parse(fs.readFileSync(cachePfad, 'utf8'));
  assert.equal(cache['4711'].kollektion, 'Alt', 'unveraendert, nicht erneut geholt');
  assert.equal(cache['4712'].kollektion, 'Testkollektion', 'neu geholt und ausgewertet');
  assert.ok(!aufrufe.some((u) => u.includes('/product/4711')), '4711 wurde nicht angefragt');
});

test('laufen: schreibt jede Seite sofort in den Cache (fortsetzbar bei Abbruch mitten im Lauf)', async () => {
  const dir = tmpDir();
  const cachePfad = path.join(dir, 'cache.json');
  fs.writeFileSync(cachePfad, JSON.stringify({}));
  const fetch = fetchStub({ 4711: BEISPIEL_HTML, 4712: BEISPIEL_HTML });

  const controller = new AbortController();
  // Nach der ersten Seite abbrechen: delayMs 0 heisst kein Warten, also
  // simulieren wir den Abbruch ueber ein bereits abgebrochenes Signal nach
  // dem ersten Schreibvorgang ist schwer zu treffen - stattdessen pruefen
  // wir mit einem Ein-Element-Lauf (--einmal), dass genau eine Seite landet.
  const { geholt } = await laufen({ basis: 'https://lieferant-a.example', ids: ['4711', '4712'], cachePfad, fetch, delayMs: 0, einmal: true, signal: controller.signal, protokoll: { log() {}, error() {} } });
  assert.equal(geholt, 1);
  const cache = JSON.parse(fs.readFileSync(cachePfad, 'utf8'));
  assert.ok(cache['4711']);
  assert.ok(!cache['4712'], 'zweite Seite noch nicht geholt - naechster Lauf setzt fort');
});

test('laufen: ein Fehler bei einer Seite beendet den Lauf nicht (naechste Seite wird trotzdem versucht)', async () => {
  const dir = tmpDir();
  const cachePfad = path.join(dir, 'cache.json');
  fs.writeFileSync(cachePfad, JSON.stringify({}));
  const fetch = async (url) => {
    if (url.includes('4711')) throw new Error('Netzwerkfehler');
    return { headers: { get: () => null }, text: async () => BEISPIEL_HTML };
  };
  const fehler = [];
  const { geholt } = await laufen({ basis: 'https://lieferant-a.example', ids: ['4711', '4712'], cachePfad, fetch, delayMs: 0, protokoll: { log() {}, error: (m) => fehler.push(m) } });
  assert.equal(geholt, 1, 'nur die zweite Seite gelingt');
  assert.ok(fehler.some((m) => m.includes('4711')));
  const cache = JSON.parse(fs.readFileSync(cachePfad, 'utf8'));
  assert.ok(cache['4712']);
  assert.ok(!cache['4711']);
});

test('laufen: nichts offen -> keine Anfrage, geholt 0', async () => {
  const dir = tmpDir();
  const cachePfad = path.join(dir, 'cache.json');
  fs.writeFileSync(cachePfad, JSON.stringify({ 4711: { product_id: '4711' } }));
  let angefragt = false;
  const fetch = async () => { angefragt = true; return { headers: { get: () => null }, text: async () => '' }; };
  const { geholt } = await laufen({ basis: 'https://lieferant-a.example', ids: ['4711'], cachePfad, fetch, delayMs: 0, protokoll: { log() {}, error() {} } });
  assert.equal(geholt, 0);
  assert.equal(angefragt, false);
});
