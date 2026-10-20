import test from 'node:test';
import assert from 'node:assert/strict';
import { musterAngebot, musterEtikettenStatus } from '../lib/muster-etiketten-status.mjs';
import { etikettenAusLexikon } from '../lib/lexikon-etiketten.mjs';

// Reine, erfundene Produktdaten; kein Server und keine private Datenablage.
const url = h => `https://www.teppich-paradies.net/products/${h}`;
function produkt(handle = 'testvelours', extra = {}) {
  return { handle, titel: 'Testvelours Teppichboden', status: 'ACTIVE', produktgruppe: 'Teppichboden',
    onlineStoreUrl: url(handle), eigenschaften: {}, muster: { vorhanden: false, handle: null },
    musterRegeln: { tags: [], geschenkgutschein: false, basisHandle: null, vollstaendig: true },
    varianten: [{ id: 'v-sand', titel: 'Sand / 400 cm', farbe: 'Sand', sku: 'TEST-SAND',
      optionen: [{ name: 'Farbe', wert: 'Sand' }, { name: 'Breite', wert: '400 cm' }] }], ...extra };
}
const modell = produkte => ({ erstellt: '2026-01-20T12:00:00.000Z', produkte });
const status = produkte => musterEtikettenStatus(modell(produkte));
const zeile = (s, h) => s.zeilen.find(z => z.handle === h);
const je = produkte => new Map(produkte.map(p => [p.handle, p]));

test('neue Produkte und Farben werden ohne gespeicherte Freigabe bei jedem Aufruf aufgenommen', () => {
  const p = produkt();
  assert.equal(status([p]).zaehler.bereit, 1);
  p.varianten.push({ id: 'v-grau', titel: 'Grau', farbe: 'Grau', sku: 'TEST-GRAU' });
  const neu = produkt('test-neu', { titel: 'Testneu Teppichboden' });
  const daten = [p, neu], vorher = structuredClone(daten);
  const s = status(daten);
  assert.equal(s.zaehler.produkte, 2);
  assert.equal(s.zaehler.etiketten, 3);
  assert.equal(s.zaehler.bereit, 3);
  assert.equal(s.vollstaendig, true);
  assert.equal(zeile(s, p.handle).anzahl, 2);
  assert.deepEqual(daten, vorher, 'Statusberechnung schreibt weder Produkte noch Freigaben');
});

test('Ausschluesse, Anfragegruppen und explizites Service-Muster bleiben unterscheidbar', () => {
  for (const tag of ['ohne-muster', 'zubehoer']) {
    assert.equal(musterAngebot(produkt('test-a', { musterRegeln: { tags: [tag], geschenkgutschein: false, vollstaendig: true } })), 'kein');
  }
  assert.equal(musterAngebot(produkt('test-gutschein', { musterRegeln: { tags: [], geschenkgutschein: true, vollstaendig: true } })), 'kein');
  assert.equal(musterAngebot(produkt('test-service', { produktgruppe: 'Service' })), 'kein');
  assert.equal(musterAngebot(produkt('test-service', { produktgruppe: 'Service', muster: { vorhanden: true } })), 'direkt');
  assert.equal(musterAngebot(produkt('test-archiv', { status: 'ARCHIVED' })), 'kein');
  assert.equal(musterAngebot(produkt('muster-testvelours')), 'kein');
  assert.equal(musterAngebot(produkt('kostenloses-muster')), 'kein');
  for (const gruppe of ['Laminat', 'Parkett', 'Kork']) {
    const p = produkt(`test-${gruppe.toLowerCase()}`, { produktgruppe: gruppe });
    assert.equal(musterAngebot(p), 'anfrage');
    assert.equal(zeile(status([p]), p.handle).status, 'bereit');
  }
});

test('fehlende Musterregeln oder Produktgruppe bleiben als offener Datenstand sichtbar', () => {
  const alt = produkt('test-alt', { musterRegeln: undefined });
  const bekannt = produkt('test-bekannt', { musterRegeln: undefined, muster: { vorhanden: true } });
  const typfrei = produkt('test-typfrei', { produktgruppe: null });
  const s = status([alt, bekannt, typfrei]);
  assert.equal(musterAngebot(alt), 'unbekannt');
  assert.equal(musterAngebot(bekannt), 'bekannt');
  assert.equal(zeile(s, alt.handle).status, 'datenstand');
  assert.equal(zeile(s, bekannt.handle).status, 'bereit', 'bekannte Muster werden im alten Export weiterhin geprueft');
  assert.match(zeile(s, typfrei.handle).fehlt.join(' '), /Produktgruppe/);
  assert.equal(s.zaehler.regelstandOffen, 1);
  assert.equal(s.zaehler.musterbedarfOffen, 1);
  assert.equal(s.vollstaendig, false);
});

test('Einzeldekor ohne Farboption behaelt den vollstaendigen veroeffentlichten Titel inklusive Farbe hinter Gedankenstrich', () => {
  const p = produkt('test-sonderposten', { titel: 'Testvelours Kettelteppich nach Maß – Anthrazit', produktgruppe: 'Teppich nach Maß',
    varianten: [{ id: 'v-default', sku: 'TEST-EINZEL', farbe: null, titel: 'Default Title', optionen: [{ name: 'Title', wert: 'Default Title' }] }] });
  const [e] = zeile(status([p]), p.handle).etiketten;
  assert.equal(e.etikett.serie, 'Teppich nach Maß');
  assert.equal(e.etikett.farbe, p.titel);
  assert.ok(e.etikett.farbe.endsWith('Anthrazit'));
  assert.deepEqual(e.fehlt, []);
  const mitMarke = { ...p, eigenschaften: { marke: 'Testmarke' } };
  assert.equal(etikettenAusLexikon(mitMarke)[0].etikett.serie, 'Testmarke');
});

test('leere echte Farboption und fehlende Optionsmetadaten werden nicht durch einen geratenen Einzeldekor ersetzt', () => {
  for (const optionen of [[{ name: 'Dekor', wert: null }], undefined]) {
    const p = produkt('test-farbe-fehlt', { varianten: [{ id: 'v-leer', sku: 'TEST-LEER', farbe: null, titel: 'Default Title', optionen }] });
    const s = status([p]);
    assert.equal(zeile(s, p.handle).status, 'pruefen');
    assert.ok(zeile(s, p.handle).fehlt.includes('Farbe'));
    assert.equal(s.vollstaendig, false);
  }
});

test('technische opc-Varianten erzeugen keine Musteretiketten', () => {
  const p = produkt();
  p.varianten.push({ id: 'v-opc1', titel: 'opc-breite', sku: 'TEST-OPC1', farbe: null });
  p.varianten.push({ id: 'v-opc2', titel: 'Zusatz', sku: 'TEST-OPC2', farbe: 'opc-zuschnitt' });
  const s = status([p]);
  assert.equal(s.zaehler.etiketten, 1);
  assert.equal(s.zaehler.bereit, 1);
  assert.equal(zeile(s, p.handle).etiketten[0].sku, 'TEST-SAND');
});

test('Artikelnummer bleibt optional, ihr Fehlen wird erklaert und sperrt keinen vollstaendigen Aufkleber', () => {
  const p = produkt('test-ohne-sku', { varianten: [{ id: 'v-ohne-sku', titel: 'Sand', farbe: 'Sand', sku: null }] });
  const s = status([p]), z = zeile(s, p.handle);
  assert.equal(s.vollstaendig, true);
  assert.equal(z.status, 'bereit');
  assert.equal(s.zaehler.ohneArtikelnummer, 1);
  assert.deepEqual(z.etiketten[0].fehlt, []);
  assert.match(z.etiketten[0].hinweise.join(' '), /Keine Artikelnummer/);
});

test('QR-Ziel braucht eine wirklich veroeffentlichte Originalseite', () => {
  const p = produkt('test-unveroeffentlicht', { onlineStoreUrl: null, muster: { vorhanden: true } });
  const s = status([p]);
  assert.ok(zeile(s, p.handle).fehlt.includes('Veröffentlichte Produktseite'));
  assert.equal(s.vollstaendig, false);
  const falscheAdresse = produkt('test-falsche-url', { onlineStoreUrl: url('test-anderes-produkt') });
  assert.ok(zeile(status([falscheAdresse]), falscheAdresse.handle).fehlt.includes('Veröffentlichte Produktseite'));
});

test('Maßartikel bezieht sein explizites eigenes Muster auch bei abweichendem Originalhandle', () => {
  const original = produkt('test-rollenware', { eigenschaften: { qmProPaket: '2', gesamtstaerke: '4 mm' } });
  const muster = produkt('muster-test-mass', { varianten: [{ id: 'v-muster', sku: 'M-ALTE-CARRIER-SKU', farbe: 'Alt',
    original: { gefunden: true, produktHandle: original.handle, variantenId: 'v-sand', sku: 'TEST-SAND' } }] });
  const mass = produkt('test-mass', { muster: { vorhanden: true, handle: muster.handle },
    varianten: [{ id: 'v-wunsch', wunschmass: true, sku: null, farbe: 'Sand' }] });
  const daten = [original, muster, mass];
  const [e] = etikettenAusLexikon(mass, je(daten));
  assert.equal(e.etikett.sku, 'TEST-SAND');
  assert.equal(e.etikett.farbe, 'Sand');
  assert.equal(e.etikett.url, url(original.handle));
  assert.deepEqual(e.etikett.technik, [{ label: 'Stärke', wert: '4 mm' }]);
  assert.deepEqual(e.etikett.fehlt, []);
  const s = status(daten);
  assert.equal(zeile(s, mass.handle).status, 'bereit');
  assert.equal(s.zaehler.zuordnungPruefen, 0);
});

test('belegte Basis kann ueber mehrere Maßartikel zum Warenoriginal fuehren; Kreis wird nicht geraten', () => {
  const original = produkt('test-basis');
  const mitte = produkt('test-mitte', { musterRegeln: { tags: [], geschenkgutschein: false, vollstaendig: true, basisHandle: original.handle },
    varianten: [{ id: 'v-mitte', sku: null, wunschmass: true }] });
  const mass = produkt('test-mass', { musterRegeln: { tags: [], geschenkgutschein: false, vollstaendig: true, basisHandle: mitte.handle },
    varianten: [{ id: 'v-mass', sku: null, wunschmass: true }] });
  const daten = [original, mitte, mass];
  assert.equal(etikettenAusLexikon(mass, je(daten))[0].etikett.sku, 'TEST-SAND');
  assert.equal(zeile(status(daten), mass.handle).status, 'bereit');
  const a = { ...mass, handle: 'test-kreis-a', musterRegeln: { ...mass.musterRegeln, basisHandle: 'test-kreis-b' } };
  const b = { ...mitte, handle: 'test-kreis-b', musterRegeln: { ...mitte.musterRegeln, basisHandle: 'test-kreis-a' } };
  assert.deepEqual(etikettenAusLexikon(a, je([a, b])), []);
  assert.equal(zeile(status([a, b]), a.handle).status, 'pruefen');
});

test('fehlerhafter Musterartikel bleibt trotz gesundem Original als Zuordnungsluecke sichtbar', () => {
  const original = produkt();
  const m = produkt('muster-testvelours', { varianten: [{ id: 'v-muster', sku: 'M-TEST-FEHLT', farbe: 'Sand',
    original: { gefunden: false, produktHandle: null } }] });
  const s = status([original, m]);
  assert.equal(zeile(s, original.handle).status, 'bereit');
  assert.equal(s.zaehler.musterartikel, 1);
  assert.equal(s.zaehler.musterzuordnungen, 1);
  assert.equal(s.zaehler.zuordnungPruefen, 1);
  assert.equal(zeile(s, m.handle).angebot, 'musterartikel');
  assert.ok(zeile(s, m.handle).fehlt.includes('Originalprodukt'));
  assert.equal(s.vollstaendig, false);
});

test('fehlender oder unlesbarer Bestand wird nicht als vollstaendige leere Pruefung ausgegeben', () => {
  assert.throws(() => musterEtikettenStatus(null), /Lexikonbestand/);
  assert.throws(() => musterEtikettenStatus({ produkte: {} }), /Lexikonbestand/);
});
