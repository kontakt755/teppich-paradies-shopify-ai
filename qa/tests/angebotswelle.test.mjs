import assert from 'node:assert/strict';
import test from 'node:test';
import { aufNeunzig, ende, istRaummass, ladeAusschluss, ladeExport, optionsFehler, plane, planeVariante, rueckstellNeunzig, sperrgrund } from '../../operations/scripts/angebotswelle.mjs';

const P = (o) => ({ id: 'gid://shopify/Product/1', handle: 'velours-x', productType: 'Teppichboden', status: 'ACTIVE', ...o });
const V = (o) => ({ id: 'gid://shopify/ProductVariant/1', title: '400 cm', sku: 'S1', price: '20.00', compareAtPrice: null, product: P(), ...o });
const opt = { prozent: 15, start: '2026-11-03', ende: '2026-11-16', typ: 'Teppichboden' };

test('regulaerer Preis wird Vergleichspreis, Aktionspreis gerundet', () => {
  assert.deepEqual(planeVariante(V(), 15), { price: '17.00', compareAtPrice: '20.00' });
  assert.deepEqual(planeVariante(V({ price: '49.95' }), 15), { price: '42.46', compareAtPrice: '49.95' });
});

test('Muster, Nullpreis und schon reduzierte Varianten bleiben unberuehrt', () => {
  assert.equal(planeVariante(V({ sku: 'M-1' }), 15).grund, 'Muster');
  assert.equal(planeVariante(V({ price: '0' }), 15).grund, 'Preis 0');
  assert.equal(planeVariante(V({ compareAtPrice: '25.00' }), 15).grund, 'schon reduziert');
});

test('30-Tage-Sperre nach der letzten Aktion (PAngV 11)', () => {
  assert.match(sperrgrund(P({ ende: '2026-11-01' }), '2026-11-20'), /frei ab 2026-12-02/);
  assert.equal(sperrgrund(P({ ende: '2026-11-01' }), '2026-12-02'), null);
  assert.equal(sperrgrund(P({ status: 'DRAFT' }), '2026-12-02'), 'nicht aktiv');
});

test('Plan liefert Setzen, Rueckstellen und Aktionsdaten passend zueinander', () => {
  const r = plane([V(), V({ id: 'v2', product: P({ productType: 'Klickvinyl' }) })], opt);
  assert.equal(r.csv.length, 1);
  assert.deepEqual(r.setzen.get(P().id), [{ id: V().id, price: '17.00', compareAtPrice: '20.00' }]);
  assert.deepEqual(r.zurueck.get(P().id), [{ id: V().id, price: '20.00', compareAtPrice: null }]);
  const felder = Object.fromEntries(r.metafelder[0].metafields.map((m) => [m.key, m.value]));
  assert.deepEqual(felder, { start: '2026-11-03', ende: '2026-11-16', klasse: 'aktion' });
});

test('Auswahl per Handle und Plausibilitaet der Eingaben', () => {
  assert.equal(plane([V()], { ...opt, typ: undefined, handles: ['anders'] }).csv.length, 0);
  assert.throws(() => plane([V()], { ...opt, prozent: 0 }), /prozent/);
  assert.throws(() => plane([V()], { ...opt, ende: '2026-11-01' }), /Ende/);
});

test('Ende stellt nur abgelaufene, noch reduzierte Produkte zurueck', () => {
  const ab = P({ ende: '2026-11-01', klasse: 'preisanker' });
  const r = ende([
    V({ price: '17.00', compareAtPrice: '20.00', product: ab }),
    V({ id: 'v2', price: '17.00', compareAtPrice: '20.00', product: P({ id: 'p2', ende: '2026-11-30' }) }),
    V({ id: 'v3', price: '20.00', compareAtPrice: null, product: ab }),
  ], { stichtag: '2026-11-02' });
  assert.deepEqual([...r.zurueck.values()].flat(), [{ id: V().id, price: '20.00', compareAtPrice: null }]);
  assert.equal(ende([V({ price: '17.00', compareAtPrice: '20.00', product: ab })], { stichtag: '2026-11-02', klasse: 'aktion' }).csv.length, 0);
});

test('Bulk-Export mit __parentId wird eingebettet', () => {
  const text = [
    JSON.stringify({ id: 'gid://shopify/Product/9', handle: 'h', status: 'ACTIVE', ende: { value: '2026-11-01' }, klasse: null }),
    JSON.stringify({ id: 'gid://shopify/ProductVariant/7', price: '1.00', __parentId: 'gid://shopify/Product/9' }),
  ].join('\n');
  const [v] = ladeExport(text);
  assert.equal(v.product.handle, 'h');
  assert.equal(v.product.ende, '2026-11-01');
});

// Raummass-Variante wie im Export vom 08.10.2026: Option "Breite" = "Wunschmaß"
const RM = (o) => V({ title: 'Sand Hell / Wunschmaß', selectedOptions: [{ name: 'Farbe', value: 'Sand Hell' }, { name: 'Breite', value: 'Wunschmaß' }], ...o });
const MW = (o) => V({ title: 'Sand Hell / 400 cm', selectedOptions: [{ name: 'Farbe', value: 'Sand Hell' }, { name: 'Breite', value: '400 cm' }], ...o });
const abgelaufen = P({ ende: '2026-10-18', klasse: 'preisanker' });
const zielpreise = (r) => Object.fromEntries([...r.zurueck.values()].flat().map((z) => [z.id, z]));

test('Raummass wird an Option Wunschmass erkannt, Titel nur ohne Optionen', () => {
  assert.equal(istRaummass(RM()), true);
  assert.equal(istRaummass(MW()), false);
  assert.equal(istRaummass({ title: 'Beige Mittel / Wunschmaß' }), true);
  assert.equal(istRaummass({ title: 'Beige Mittel / 500 cm' }), false);
  assert.equal(istRaummass({ title: 'Wunschmaßband', selectedOptions: [{ name: 'Farbe', value: 'Wunschmaßband' }] }), false);
});

test('aufNeunzig: naechstgelegener ,90-Betrag (Inhaber 2026-10-05)', () => {
  assert.equal(aufNeunzig(10400), 10390);
  assert.equal(aufNeunzig(5000), 4990);
  assert.equal(aufNeunzig(11490), 11490);
  assert.equal(aufNeunzig(11462), 11490);
  assert.equal(aufNeunzig(4395), 4390);
});

test('Ende: Meterware auf Vergleichspreis, Raummass voller Euro auf ,90 darunter', () => {
  const r = ende([
    MW({ id: 'mw', price: '32.90', compareAtPrice: '36.90', product: abgelaufen }),
    RM({ id: 'rm', price: '93.60', compareAtPrice: '104.00', product: abgelaufen }),
    RM({ id: 'rm2', price: '45.00', compareAtPrice: '50.00', product: abgelaufen }),
  ], { stichtag: '2026-10-19', klasse: 'preisanker' });
  const z = zielpreise(r);
  assert.deepEqual(z.mw, { id: 'mw', price: '36.90', compareAtPrice: null });
  assert.deepEqual(z.rm, { id: 'rm', price: '103.90', compareAtPrice: null });
  assert.deepEqual(z.rm2, { id: 'rm2', price: '49.90', compareAtPrice: null });
  assert.match(r.csv.find((c) => c.includes('Wunschmaß')), /;Raummaß;93\.60;104\.00;103\.90;2026-10-18$/);
});

test('Ende: Raummass, das schon auf ,90 endet, bleibt beim Vergleichspreis', () => {
  const r = ende([RM({ price: '97.90', compareAtPrice: '114.90', product: abgelaufen })], { stichtag: '2026-10-19' });
  assert.equal(zielpreise(r)[V().id].price, '114.90');
});

test('Ende: Muster und Produkte anderer Klasse bleiben aussen vor', () => {
  const r = ende([
    RM({ id: 'muster-sku', sku: 'M-TEPX_004', price: '0.50', compareAtPrice: '1.00', product: abgelaufen }),
    MW({ id: 'muster-handle', price: '0.50', compareAtPrice: '1.00', product: P({ id: 'pm', handle: 'muster-velours-x', ende: '2026-10-18', klasse: 'preisanker' }) }),
    RM({ id: 'normal', price: '45.00', compareAtPrice: '50.00', product: P({ id: 'pn', ende: '2026-10-18', klasse: 'normal' }) }),
    RM({ id: 'treffer', price: '45.00', compareAtPrice: '50.00', product: abgelaufen }),
  ], { stichtag: '2026-10-19', klasse: 'preisanker' });
  assert.deepEqual(Object.keys(zielpreise(r)), ['treffer']);
  assert.equal(r.csv.length, 1);
});

test('Plan: vorab berechnete Rueckstellung folgt derselben Raummass-Regel', () => {
  const r = plane([MW({ id: 'mw', price: '36.90' }), RM({ id: 'rm', price: '104.00' })], opt);
  const z = Object.fromEntries([...r.zurueck.values()].flat().map((x) => [x.id, x.price]));
  assert.deepEqual(z, { mw: '36.90', rm: '103.90' });
});

test('JSON-Array-Export mit getrennter Produktdatei (--produkte)', () => {
  const varianten = JSON.stringify([{ id: 'gid://shopify/ProductVariant/7', title: 'A / Wunschmaß', price: '45.00', compareAtPrice: '50.00', product: { id: 'gid://shopify/Product/9' } }]);
  const produkte = JSON.stringify([{ id: 'gid://shopify/Product/9', handle: 'h', status: 'ACTIVE', ende: { value: '2026-10-18' }, klasse: { value: 'preisanker' } }]);
  const [v] = ladeExport(varianten, produkte);
  assert.equal(v.product.handle, 'h');
  assert.equal(v.product.klasse, 'preisanker');
  assert.throws(() => ladeExport(varianten), /--produkte/);
});

test('Rueckstellung: ,90-Ziel liegt nie ueber dem Vergleichspreis', () => {
  assert.equal(rueckstellNeunzig(10400), 10390);
  assert.equal(rueckstellNeunzig(11490), 11490);
  assert.equal(rueckstellNeunzig(8850), 8790);
  assert.equal(rueckstellNeunzig(8895), 8890);
  const r = ende([RM({ price: '79.00', compareAtPrice: '88.50', product: abgelaufen })], { stichtag: '2026-10-19' });
  assert.equal(zielpreise(r)[V().id].price, '87.90');
});

test('Ende: unbekannte Raummass-Schreibweise wird gemeldet', () => {
  const r = ende([V({ title: 'Grau / Wunschmaß (Raummaß)', selectedOptions: [{ name: 'Breite', value: 'Wunschmaß (Raummaß)' }], price: '45.00', compareAtPrice: '50.00', product: abgelaufen })], { stichtag: '2026-10-19' });
  assert.equal(r.warnungen.length, 1);
});

test('--produkte geht vor eingebettetem Teilprodukt mit leeren Metafeldern', () => {
  const varianten = JSON.stringify([{ id: 'gid://shopify/ProductVariant/8', title: 'A / 400 cm', price: '45.00', compareAtPrice: '50.00', product: { id: 'gid://shopify/Product/9', handle: 'h', ende: null } }]);
  const produkte = JSON.stringify([{ id: 'gid://shopify/Product/9', handle: 'h', ende: { value: '2026-10-18' }, klasse: { value: 'preisanker' } }]);
  const [v] = ladeExport(varianten, produkte);
  assert.equal(v.product.ende, '2026-10-18');
});

test('--ende-am trennt zwei Aktionen derselben Klasse (Welle 1 vom Dauerrabatt)', () => {
  const welle1 = P({ id: 'w1', ende: '2026-10-18', klasse: 'preisanker' });
  const dauer = P({ id: 'd1', ende: '2026-11-01', klasse: 'preisanker' });
  const varianten = [
    V({ id: 'a', price: '17.00', compareAtPrice: '20.00', product: welle1 }),
    V({ id: 'b', price: '17.00', compareAtPrice: '20.00', product: dauer }),
  ];
  assert.equal(ende(varianten, { stichtag: '2026-11-02', klasse: 'preisanker' }).csv.length, 2, 'ohne Filter beide');
  const r = ende(varianten, { stichtag: '2026-11-02', klasse: 'preisanker', endeAm: '2026-11-01' });
  assert.deepEqual([...r.zurueck.keys()], ['d1']);
  assert.throws(() => ende(varianten, { stichtag: '2026-11-02', endeAm: '2026-11-02' }), /vor dem Stichtag/);
  assert.throws(() => ende(varianten, { stichtag: '2026-11-02', endeAm: '1.11.' }), /JJJJ-MM-TT/);
});

test('Optionen: Tippfehler und fehlende Werte brechen ab statt still zu entfallen', () => {
  assert.equal(optionsFehler('ende', { stichtag: '2026-11-02', klasse: 'preisanker', 'ende-am': '2026-11-01' }), null);
  assert.match(optionsFehler('ende', { stichtag: '2026-11-02', 'ende-am': undefined }), /ohne Wert/);
  assert.match(optionsFehler('ende', { stichtag: '2026-11-02', 'ende-am 2026-11-01': undefined }), /Unbekannte Option/);
  assert.match(optionsFehler('ende', { stichtag: '2026-11-02', endeam: '2026-11-01' }), /Unbekannte Option --endeam/);
  assert.match(optionsFehler('ende', { 'ende-am': '--stichtag' }), /ohne Wert/);
  assert.equal(optionsFehler('plan', { prozent: '15', start: '2026-11-03', ende: '2026-11-16', typ: 'Teppichboden' }), null);
});

test('Ausschlussliste: nur volle Varianten-IDs, optional mit UVP, Kommentare erlaubt, Fehler bei Unlesbarem', () => {
  const ids = ladeAusschluss('# UVP neuer Linien\r\ngid://shopify/ProductVariant/1001\r\n  gid://shopify/ProductVariant/1002;68.63  # Matte gross\n\n');
  assert.deepEqual([...ids], [['gid://shopify/ProductVariant/1001', null], ['gid://shopify/ProductVariant/1002', 6863]]);
  assert.throws(() => ladeAusschluss('gid://shopify/Product/2001'), /keine volle Varianten-ID/);
  // Nummer allein: koennte eine aus der Admin-URL kopierte Produkt-ID sein
  assert.throws(() => ladeAusschluss('gid://shopify/ProductVariant/1001\n2001'), /keine volle Varianten-ID/);
  assert.throws(() => ladeAusschluss('gid://shopify/ProductVariant/1001;68,63'), /keine volle Varianten-ID/);
  assert.throws(() => ladeAusschluss('# nur Kommentar\n'), /leer/);
});

test('Ende mit Ausschluss: UVP-Vergleichspreis wird nie Verkaufspreis, nur geleert', () => {
  const dauer = P({ id: 'd1', handle: 'matte-x', ende: '2026-11-01', klasse: 'preisanker' });
  const uvp = 'gid://shopify/ProductVariant/1001';
  const varianten = [
    V({ id: uvp, price: '65.00', compareAtPrice: '68.63', product: dauer }),
    V({ id: 'belegt', price: '17.00', compareAtPrice: '20.00', product: dauer }),
  ];
  const ohne = ende(varianten, { stichtag: '2026-11-02', klasse: 'preisanker', endeAm: '2026-11-01' });
  assert.equal(zielpreise(ohne)[uvp].price, '68.63', 'ohne Liste wird auf die UVP hochgesetzt');
  const r = ende(varianten, { stichtag: '2026-11-02', klasse: 'preisanker', endeAm: '2026-11-01', ausschluss: new Set([uvp]) });
  assert.deepEqual(Object.keys(zielpreise(r)), ['belegt']);
  assert.equal(r.csv.length, 1);
  assert.deepEqual(r.leeren.get('d1'), [{ id: uvp, price: '65.00', compareAtPrice: null }]);
  assert.equal(r.ausgeschlossen.length, 1);
  assert.match(r.ausgeschlossen[0], /^matte-x;400 cm;S1;65\.00;68\.63;2026-11-01$/);
});

test('Ausschluss gilt nur fuer reduzierte Varianten im Rueckstell-Fenster', () => {
  const welle1 = P({ id: 'w1', ende: '2026-10-18', klasse: 'preisanker' });
  const dauer = P({ id: 'd1', ende: '2026-11-01', klasse: 'preisanker' });
  const r = ende([
    V({ id: 'x', price: '65.00', compareAtPrice: '68.63', product: dauer }),
    V({ id: 'y', price: '65.00', compareAtPrice: null, product: welle1 }),
  ], { stichtag: '2026-10-19', klasse: 'preisanker', ausschluss: new Set(['x', 'y']) });
  assert.equal(r.csv.length, 0);
  assert.equal(r.leeren.size, 0, 'Dauerrabatt-Variante liegt am 19.10. ausserhalb, Welle-1-Variante ist nicht reduziert');
  assert.deepEqual(r.ausschlussStand, { gelistet: 2, ausgeschlossen: 0, nichtReduziert: 1, ausserhalb: 1 });
  assert.equal(r.warnungen.length, 0, 'greift die Liste gar nicht (vor der Wiederherstellung), ist das keine Warnung');
  assert.equal(optionsFehler('ende', { stichtag: '2026-11-02', ausschluss: 'ids.txt' }), null);
  assert.match(optionsFehler('plan', { ausschluss: 'ids.txt' }), /Unbekannte Option --ausschluss/);
});

test('Ausschluss fail closed: gelistete ID nicht im Export bricht ab, Variante faellt nie still auf die UVP', () => {
  // Befund Review #1072: Produktnummer statt Varianten-ID in der Liste -> echte Variante lief ungeschuetzt durch.
  const dauer = P({ id: 'gid://shopify/Product/2001', handle: 'matte-gross', ende: '2026-11-01', klasse: 'preisanker' });
  const echt = 'gid://shopify/ProductVariant/1001';
  const varianten = [V({ id: echt, price: '320.50', compareAtPrice: '337.45', product: dauer })];
  const opt = { stichtag: '2026-11-02', klasse: 'preisanker', endeAm: '2026-11-01' };
  assert.throws(() => ende(varianten, { ...opt, ausschluss: new Set(['gid://shopify/ProductVariant/2001']) }), /1 von 1 IDs nicht im Export.*ProductVariant\/2001/);
  // neu angelegte Variante mit anderer ID: alte ID fehlt -> Abbruch statt Rueckstellung der neuen Variante auf die UVP
  assert.throws(() => ende([V({ id: 'gid://shopify/ProductVariant/99', price: '320.50', compareAtPrice: '337.45', product: dauer })], { ...opt, ausschluss: new Set([echt]) }), /nicht im Export/);
  const r = ende(varianten, { ...opt, ausschluss: new Set([echt]) });
  assert.equal(r.csv.length, 0);
  assert.deepEqual(r.ausschlussStand, { gelistet: 1, ausgeschlossen: 1, nichtReduziert: 0, ausserhalb: 0 });
});

test('Ausschluss nur teilweise wirksam: WARNUNG mit getrennten Zahlen', () => {
  const dauer = P({ id: 'd1', ende: '2026-11-01', klasse: 'preisanker' });
  const r = ende([
    V({ id: 'a', price: '65.00', compareAtPrice: '68.63', product: dauer }),
    V({ id: 'b', price: '65.00', compareAtPrice: null, product: dauer }),
  ], { stichtag: '2026-11-02', klasse: 'preisanker', endeAm: '2026-11-01', ausschluss: new Set(['a', 'b']) });
  assert.deepEqual(r.ausschlussStand, { gelistet: 2, ausgeschlossen: 1, nichtReduziert: 1, ausserhalb: 0 });
  assert.equal(r.warnungen.length, 1);
  assert.match(r.warnungen[0], /nur bei 1 von 2 .*1 ohne Vergleichspreis ueber Preis, 0 ausserhalb/);
  assert.equal(r.csv.length, 0, 'b ist nicht reduziert und wird nie zurueckgestellt');
});

test('Ausschluss mit UVP-Betrag: anderer Vergleichspreis (spaetere echte Aktion) bricht ab statt Aktionspreis zu behalten', () => {
  const p = P({ id: 'd1', ende: '2026-11-01', klasse: 'preisanker' });
  const opt = { stichtag: '2026-11-02', klasse: 'preisanker', endeAm: '2026-11-01' };
  const liste = ladeAusschluss('gid://shopify/ProductVariant/1001;68.63\n');
  const uvp = ende([V({ id: 'gid://shopify/ProductVariant/1001', price: '65.00', compareAtPrice: '68.63', product: p })], { ...opt, ausschluss: liste });
  assert.equal(uvp.ausschlussStand.ausgeschlossen, 1);
  assert.throws(() => ende([V({ id: 'gid://shopify/ProductVariant/1001', price: '56.00', compareAtPrice: '70.00', product: p })], { ...opt, ausschluss: liste }), /anderen Vergleichspreis.*70\.00, Liste 68\.63/);
});

test('Ausschluss zaehlt je ID einmal, auch bei doppelter Exportzeile', () => {
  const p = P({ id: 'd1', ende: '2026-11-01', klasse: 'preisanker' });
  const a = V({ id: 'a', price: '65.00', compareAtPrice: '68.63', product: p });
  const r = ende([a, a, V({ id: 'b', price: '65.00', compareAtPrice: null, product: p })], { stichtag: '2026-11-02', ausschluss: new Set(['a', 'b']) });
  assert.deepEqual(r.ausschlussStand, { gelistet: 2, ausgeschlossen: 1, nichtReduziert: 1, ausserhalb: 0 });
  assert.equal(r.leeren.get('d1').length, 1);
  assert.equal(r.warnungen.length, 1, 'doppelte Zeile verdeckt die Teil-Warnung nicht');
});

test('CLI ende: Fehler laesst den Zielordner unveraendert, Erfolg ersetzt alte Ausschluss-Dateien', async () => {
  const { spawnSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const skript = fileURLToPath(new URL('../../operations/scripts/angebotswelle.mjs', import.meta.url));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'angebot-ende-'));
  try {
    const exp = path.join(dir, 'export.json'); const ziel = path.join(dir, 'roh');
    fs.writeFileSync(exp, JSON.stringify([
      { id: 'gid://shopify/ProductVariant/1001', title: 'Rot', sku: 'S1', price: '65.00', compareAtPrice: '68.63', product: { id: 'gid://shopify/Product/2001', handle: 'matte-x', ende: '2026-11-01', klasse: 'preisanker' } },
      { id: 'gid://shopify/ProductVariant/1002', title: 'Blau', sku: 'S2', price: '17.00', compareAtPrice: '20.00', product: { id: 'gid://shopify/Product/2001', handle: 'matte-x', ende: '2026-11-01', klasse: 'preisanker' } },
    ]));
    const liste = path.join(dir, 'ids.txt'); fs.writeFileSync(liste, 'gid://shopify/ProductVariant/1001;68.63\n');
    const lauf = (...extra) => spawnSync(process.execPath, [skript, 'ende', exp, ziel, '--stichtag', '2026-11-02', '--klasse', 'preisanker', '--ende-am', '2026-11-01', ...extra], { encoding: 'utf8' });
    let r = lauf('--ausschluss', liste);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Rueckstellung: 1 Varianten in 1 Produkten/);
    assert.match(r.stdout, /1 gelistet, alle im Export; 1 ausgeschlossen/);
    assert.ok(!fs.readFileSync(path.join(ziel, 'rueckstellen.jsonl'), 'utf8').includes('ProductVariant/1001'));
    assert.match(fs.readFileSync(path.join(ziel, 'nur-vergleichspreis-leeren.jsonl'), 'utf8'), /"id":"gid:\/\/shopify\/ProductVariant\/1001","price":"65.00","compareAtPrice":null/);
    const vorher = fs.readFileSync(path.join(ziel, 'rueckstellen.jsonl'), 'utf8');
    // Produktnummer in der Liste: Exit 1, FEHLER, alter Plan bleibt unangetastet
    const kaputt = path.join(dir, 'kaputt.txt'); fs.writeFileSync(kaputt, '2001\n');
    r = lauf('--ausschluss', kaputt);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^FEHLER Ausschlussliste: "2001" ist keine volle Varianten-ID/);
    assert.equal(fs.readFileSync(path.join(ziel, 'rueckstellen.jsonl'), 'utf8'), vorher);
    // ID nicht im Export: ebenfalls Exit 1
    fs.writeFileSync(kaputt, 'gid://shopify/ProductVariant/2001\n');
    r = lauf('--ausschluss', kaputt);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /nicht im Export/);
    // Erfolg ohne Liste: alte Ausschluss-Dateien verschwinden, UVP-Variante steht (bewusst) im Plan
    r = lauf();
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!fs.existsSync(path.join(ziel, 'ausgeschlossen.csv')));
    assert.ok(!fs.existsSync(path.join(ziel, 'nur-vergleichspreis-leeren.jsonl')));
    assert.match(fs.readFileSync(path.join(ziel, 'rueckstellen.jsonl'), 'utf8'), /ProductVariant\/1001","price":"68.63"/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
