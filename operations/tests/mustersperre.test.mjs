// Mustersperre ("Muster nicht verfuegbar", Inhaber 2026-10-16): Ablage nur anhaengen, Stand je
// SKU, Idempotenz, Lesefehler wie speicher-lesefehler.test.mjs - und das Schreiben nach Shopify
// gegen eine Attrappe (nie echtes Shopify).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  mustersperrePfad, leseSperren, haengeAn, ereignis, stand, schonErledigt, adminLink, pruefeRechte, sperreImShop, freigebenImShop,
  freigabeZiel, GRUND, MustersperreFehler, leseVarianten, variantenVon,
} from '../lib/mustersperre.mjs';
import { attrappe, variante } from './mustersperre-attrappe.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-mustersperre-'));
const KAPUTT = '{"version":1,"ereignisse":[{"sku":"M-1"'; // abgeschnitten
const zeit = t => new Date(`2026-10-16T${t}:00Z`);

test('Ablage: fehlend/leer -> leer, beschaedigt -> Fehler, und Anhaengen ueberschreibt die beschaedigte Datei nicht', () => {
  const datei = mustersperrePfad(tmp());
  assert.deepEqual(leseSperren(datei), []);
  fs.writeFileSync(datei, '');
  assert.deepEqual(leseSperren(datei), []);
  fs.writeFileSync(datei, KAPUTT);
  assert.throws(() => leseSperren(datei), e => e instanceof MustersperreFehler && /mustersperre\.json ist beschädigt/.test(e.message));
  assert.throws(() => haengeAn(datei, [ereignis({ sku: 'M-1', von: 'Anna', grund: GRUND.GESPERRT })]), /beschädigt/);
  assert.equal(fs.readFileSync(datei, 'utf8'), KAPUTT, 'die beschaedigte Datei bleibt Byte fuer Byte stehen');
  // Falsche Form (kein Ereignis-Array) ist ebenfalls beschaedigt, nicht leer.
  fs.writeFileSync(datei, JSON.stringify({ version: 1, sperren: {} }));
  assert.throws(() => leseSperren(datei), /beschädigt/);
});

test('Ablage: Leserechte fehlen -> Fehler, nicht leer', { skip: process.getuid?.() === 0 ? 'als root greift chmod nicht' : false }, () => {
  const datei = mustersperrePfad(tmp());
  fs.writeFileSync(datei, JSON.stringify({ version: 1, ereignisse: [] }));
  fs.chmodSync(datei, 0o000);
  try { assert.throws(() => leseSperren(datei), /nicht lesbar \(EACCES\)/); } finally { fs.chmodSync(datei, 0o600); }
});

test('Ablage: nur anhaengen - jedes Ereignis mit SKU, Farbe, Produkt, Auftrag, wer, wann, Grund und Shopify-Stand', () => {
  const datei = mustersperrePfad(tmp());
  haengeAn(datei, [ereignis({ sku: 'm-a1', farbe: 'Sand', produkt: 'Testteppich', orderId: 'o1', orderName: '#1', von: 'Anna', grund: GRUND.GESPERRT, shopify: { geschrieben: false, fehler: 'kein Zugang' }, jetzt: zeit('10:00') })]);
  haengeAn(datei, [ereignis({ sku: 'M-A1', von: 'Bernd', grund: GRUND.FREI, shopify: { geschrieben: false }, jetzt: zeit('11:00') })]);
  const alle = leseSperren(datei);
  assert.equal(alle.length, 2);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(datei, 'utf8'))), ['version', 'ereignisse']);
  const [e] = alle;
  assert.deepEqual([e.sku, e.farbe, e.produkt, e.orderId, e.von, e.am, e.grund, e.shopify.geschrieben, e.shopify.fehler],
    ['M-A1', 'Sand', 'Testteppich', 'o1', 'Anna', '2026-10-16T10:00:00.000Z', 'nicht verfuegbar', false, 'kein Zugang']);
  assert.throws(() => ereignis({ sku: '', von: 'Anna', grund: GRUND.GESPERRT }), /Artikelnummer/);
  assert.throws(() => ereignis({ sku: 'M-1', von: 'Anna', grund: 'weg' }), /Unbekannter Grund/);
});

test('Stand: Vorstand der ersten Sperre bleibt, zweite Bestellung haengt sich an, Freigabe nimmt heraus', () => {
  const vorher = { tracked: false, policy: 'DENY', menge: 0 };
  const gesperrt = { tracked: true, policy: 'DENY', menge: 0 };
  const ev = [
    ereignis({ sku: 'M-1', farbe: 'Sand', orderId: 'o1', orderName: '#1', von: 'Anna', grund: GRUND.GESPERRT, shopify: { geschrieben: true, variantId: 'v1', productId: 'p1', vorher }, jetzt: zeit('10:00') }),
    ereignis({ sku: 'M-1', orderId: 'o2', orderName: '#2', von: 'Bernd', grund: GRUND.GESPERRT, shopify: { geschrieben: true, bereits: true, vorher: gesperrt }, jetzt: zeit('11:00') }),
    ereignis({ sku: 'M-2', farbe: 'Grau', orderId: 'o1', von: 'Anna', grund: GRUND.GESPERRT, shopify: { geschrieben: false, fehler: 'Recht fehlt', fehlerGrund: 'recht-fehlt' }, jetzt: zeit('10:00') }),
  ];
  let s = stand(ev);
  assert.deepEqual([...s.keys()].sort(), ['M-1', 'M-2']);
  const m1 = s.get('M-1');
  assert.deepEqual([m1.imShop, m1.von, m1.farbe, m1.auftraege.map(a => a.orderName)], [true, 'Anna', 'Sand', ['#1', '#2']]);
  assert.deepEqual(m1.vorher, vorher, '"bereits gesperrt" ueberschreibt den echten Vorstand nicht');
  assert.deepEqual([s.get('M-2').imShop, s.get('M-2').fehlerGrund], [false, 'recht-fehlt']);

  // Idempotenz: dieselbe Bestellung noch einmal = nichts zu tun; eine andere Bestellung oder eine offene Sperre nicht.
  assert.equal(schonErledigt(s, 'm-1', 'o1'), true);
  assert.equal(schonErledigt(s, 'M-1', 'o3'), false);
  assert.equal(schonErledigt(s, 'M-2', 'o1'), false, 'nicht im Shop gesperrt -> erneut versuchen');

  // Freigabe misslungen: bleibt gesperrt, mit Grund. Gelungen: weg. Nie im Shop gewesen: weg ohne Shopify.
  ev.push(ereignis({ sku: 'M-1', von: 'Anna', grund: GRUND.FREI, shopify: { geschrieben: false, fehler: 'Netz' }, jetzt: zeit('12:00') }));
  s = stand(ev);
  assert.equal(s.get('M-1').freigabeFehler, 'Netz');
  ev.push(ereignis({ sku: 'M-1', von: 'Anna', grund: GRUND.FREI, shopify: { geschrieben: true }, jetzt: zeit('12:05') }));
  ev.push(ereignis({ sku: 'M-2', von: 'Anna', grund: GRUND.FREI, shopify: { geschrieben: false }, jetzt: zeit('12:06') }));
  assert.equal(stand(ev).size, 0);
  // Nach der Freigabe beginnt eine neue Sperre mit neuem Vorstand.
  ev.push(ereignis({ sku: 'M-1', orderId: 'o9', von: 'Anna', grund: GRUND.GESPERRT, shopify: { geschrieben: true, vorher: { tracked: true, policy: 'DENY', menge: 2 } }, jetzt: zeit('13:00') }));
  assert.deepEqual(stand(ev).get('M-1').vorher, { tracked: true, policy: 'DENY', menge: 2 });
  assert.deepEqual(stand(ev).get('M-1').auftraege.map(a => a.orderId), ['o9']);
});

test('Admin-Link: zur Variante, ohne Variante die Suche nach der SKU', () => {
  assert.match(adminLink({ sku: 'M-1', variantId: 'gid://shopify/ProductVariant/7', productId: 'gid://shopify/Product/3' }), /\/products\/3\/variants\/7$/);
  assert.match(adminLink({ sku: 'M-1 X' }), /\/products\?query=M-1\+X$/);
});

test('Rechte: fehlende Schreibrechte werden benannt', async () => {
  assert.deepEqual((await pruefeRechte(attrappe({ rechte: ['read_products'] }).proxy)).fehlend, ['write_inventory', 'write_products']);
  assert.deepEqual((await pruefeRechte(attrappe({ rechte: ['write_inventory'] }).proxy)).fehlend, ['write_products']);
  assert.deepEqual((await pruefeRechte(attrappe().proxy)).fehlend, []);
});

test('Sperren: Variante wie im Shop (ohne Verfolgung, DENY, 0) -> nur Verfolgung an; Gegenprobe; zweiter Lauf schreibt nichts', async () => {
  const v = variante('M-TEST-1');
  const a = attrappe({ varianten: [v, variante('M-TEST-10')] });
  const r = await sperreImShop(a.proxy, { sku: 'm-test-1', referenz: 'gid://shopify/Order/1' });
  assert.equal(r.status, 'gesperrt');
  assert.equal(r.verfuegbar, false);
  assert.deepEqual(r.vorher, { tracked: false, policy: 'DENY', menge: 0 });
  assert.deepEqual(a.mutationen().map(m => m.name), ['MustersperreVerfolgung']);
  assert.deepEqual([v.tracked, v.policy, v.menge], [true, 'DENY', 0]);
  assert.equal(a.aufrufe.filter(x => x.name === 'MustersperreVariante').length, 2, 'vorher lesen und gegenpruefen');

  const zweimal = await sperreImShop(a.proxy, { sku: 'M-TEST-1' });
  assert.equal(zweimal.status, 'bereits');
  assert.equal(a.mutationen().length, 1, 'kein zweiter Schreibvorgang');
});

test('Sperren: verfolgt mit Bestand und CONTINUE -> Bestand 0 (Compare-and-swap), DENY; nie SKU/Preis', async () => {
  const v = variante('M-TEST-2', { tracked: true, policy: 'CONTINUE', menge: 3 });
  const a = attrappe({ varianten: [v] });
  const r = await sperreImShop(a.proxy, { sku: 'M-TEST-2' });
  assert.equal(r.status, 'gesperrt');
  assert.deepEqual(a.mutationen().map(m => m.name), ['MustersperreBestand', 'MustersperreRichtlinie']);
  const bestand = a.mutationen()[0].variables;
  assert.deepEqual([bestand.input.quantities[0].quantity, bestand.input.quantities[0].changeFromQuantity, bestand.input.name], [0, 3, 'available']);
  assert.ok(bestand.schluessel, '@idempotent-Schluessel gesetzt');
  assert.deepEqual(Object.keys(a.mutationen()[1].variables.variants[0]).sort(), ['id', 'inventoryPolicy'], 'nur die Richtlinie, nie Preis oder SKU');
});

test('Sperren: keine Mustervariante, mehrdeutig, kein Bestand am Standort, Recht fehlt, abgelehnt', async () => {
  await assert.rejects(sperreImShop(attrappe({ varianten: [variante('M-ANDERS')] }).proxy, { sku: 'M-TEST-3' }), e => e.grund === 'keine-mustervariante');
  // Gleiche SKU auch ausserhalb eines Musterprodukts: unklar, was gemeint ist - nichts wird geschrieben
  // (zwei Musterprodukte dagegen werden beide gesperrt, siehe "Doppelte Muster-SKU").
  const muster = variante('M-DOPPEL');
  const fremd = variante('M-DOPPEL', { handle: 'kostenloses-muster' });
  const a = attrappe({ varianten: [fremd, muster] });
  await assert.rejects(sperreImShop(a.proxy, { sku: 'M-DOPPEL' }), e => e.grund === 'mehrdeutig' && e.extra.aenderungMoeglich === false && /kostenloses-muster/.test(e.message));
  assert.deepEqual([fremd.tracked, muster.tracked, a.mutationen().length], [false, false, 0], 'auch die Mustervariante bleibt unberuehrt');
  await assert.rejects(sperreImShop(attrappe({ varianten: [variante('M-D2', { handle: 'teppich-a' }), variante('M-D2', { handle: 'teppich-b' })] }).proxy, { sku: 'M-D2' }), e => e.grund === 'mehrdeutig');
  // Eine einzelne Variante gilt wie bisher auch ausserhalb eines Musterprodukts.
  assert.equal((await sperreImShop(attrappe({ varianten: [variante('M-EINZELN', { handle: 'kostenloses-muster' })] }).proxy, { sku: 'M-EINZELN' })).status, 'gesperrt');
  await assert.rejects(sperreImShop(attrappe({ varianten: [variante('M-L', { level: false })] }).proxy, { sku: 'M-L' }), e => e.grund === 'kein-standort');
  const verweigert = attrappe({ varianten: [variante('M-R')], verweigert: true });
  await assert.rejects(sperreImShop(verweigert.proxy, { sku: 'M-R' }), e => e.grund === 'recht-fehlt' && /write_inventory/.test(e.message));
  await assert.rejects(sperreImShop(attrappe({ varianten: [variante('M-X')], abgelehnt: 'MustersperreVerfolgung' }).proxy, { sku: 'M-X' }), e => e.grund === 'abgelehnt');
});

test('Sperren: Antwort verloren, aber ausgefuehrt -> die Gegenprobe entscheidet (gesperrt)', async () => {
  const a = attrappe({ varianten: [variante('M-W')], antwortWeg: 'MustersperreVerfolgung' });
  const r = await sperreImShop(a.proxy, { sku: 'M-W' });
  assert.deepEqual([r.status, r.antwortVerloren, r.verfuegbar], ['gesperrt', true, false]);
});

test('Freigeben: zurueck auf den Stand vor der Sperre - ohne Verfolgung wieder ohne, sonst Bestand mindestens 1', async () => {
  const v = variante('M-F');
  const a = attrappe({ varianten: [v] });
  const s = await sperreImShop(a.proxy, { sku: 'M-F' });
  const f = await freigebenImShop(a.proxy, { sku: 'M-F', vorher: s.vorher });
  assert.deepEqual([f.status, f.verfuegbar, v.tracked, v.policy, v.menge], ['frei', true, false, 'DENY', 0]);
  assert.equal((await freigebenImShop(a.proxy, { sku: 'M-F', vorher: s.vorher })).status, 'bereits');

  const w = variante('M-G', { tracked: true, policy: 'DENY', menge: 0 });
  const b = attrappe({ varianten: [w] });
  // Ohne bekannten Vorstand (oder verfolgt mit 0): Bestand 1, Verfolgung bleibt.
  const g = await freigebenImShop(b.proxy, { sku: 'M-G', vorher: null });
  assert.deepEqual([g.status, w.tracked, w.menge], ['frei', true, 1]);
  assert.deepEqual(freigabeZiel({ tracked: true, policy: 'DENY', menge: 4 }), { tracked: true, policy: 'DENY', menge: 4 });
  assert.deepEqual(freigabeZiel({ tracked: true, policy: 'CONTINUE', menge: -2 }), { tracked: true, policy: 'CONTINUE', menge: -2 });
});

test('Sperren: lokaler Bestand 0, aber global bestellbar -> auch wiederholt kein bestaetigter Erfolg', async () => {
  const a = attrappe({ varianten: [variante('M-MEHRORT', { tracked: true })] });
  const proxy = { async execute(q, v) {
    const d = await a.proxy.execute(q, v);
    for (const n of d.productVariants?.nodes || []) n.availableForSale = true;
    return d;
  } };
  for (let i = 0; i < 2; i++) {
    await assert.rejects(sperreImShop(proxy, { sku: 'M-MEHRORT' }), e => e.grund === 'gegenprobe' && /Standorte/.test(e.message));
  }
  assert.equal(a.mutationen().length, 0, 'keine anderen Standorte still veraendern');
  assert.equal((await sperreImShop(a.proxy, { sku: 'M-MEHRORT' })).status, 'bereits', 'nur tatsaechlich nicht bestellbar bestaetigt');
});

test('Sperren: Teilmutation vor Rechtefehler bleibt moegliche Aenderung, erste Ablehnung und Lesefehler nicht', async () => {
  const a = attrappe({ varianten: [variante('M-TEIL', { menge: 3 })] });
  const proxy = { async execute(q, v) {
    if (q.includes('mutation MustersperreVerfolgung')) throw new Error('ACCESS_DENIED write_inventory');
    return a.proxy.execute(q, v);
  } };
  await assert.rejects(sperreImShop(proxy, { sku: 'M-TEIL' }), e => e.extra.aenderungMoeglich === true && e.extra.vorher.menge === 3);
  assert.equal(a.varianten[0].menge, 0);
  const b = attrappe({ varianten: [variante('M-NEIN')], verweigert: true });
  await assert.rejects(sperreImShop(b.proxy, { sku: 'M-NEIN' }), e => e.extra.aenderungMoeglich === false);
  await assert.rejects(sperreImShop({ async execute() { throw new Error('Lesetimeout'); } }, { sku: 'M-NEIN' }), e => e.extra.aenderungMoeglich === false);
});

test('Freigeben: Bestand erfolgreich, Verfolgung vor Ausfuehrung abgebrochen -> Fehler, erneuter Versuch stellt Vorstand her', async () => {
  const a = attrappe({ varianten: [variante('M-TEIL', { tracked: true })] });
  const vorher = { tracked: false, policy: 'DENY', menge: 3 };
  const proxy = { async execute(q, v) {
    if (q.includes('mutation MustersperreVerfolgung')) throw new Error('timeout before write');
    return a.proxy.execute(q, v);
  } };
  await assert.rejects(freigebenImShop(proxy, { sku: 'M-TEIL', vorher }), e => e.grund === 'gegenprobe');
  assert.deepEqual([a.varianten[0].tracked, a.varianten[0].menge], [true, 3]);
  const frei = await freigebenImShop(a.proxy, { sku: 'M-TEIL', vorher });
  assert.deepEqual([frei.status, frei.verfuegbar, a.varianten[0].tracked, a.varianten[0].menge], ['frei', true, false, 3]);
  assert.equal(a.mutationen().filter(m => m.name === 'MustersperreBestand').length, 1, 'Wiederholung setzt den Bestand nicht erneut');
});

test('Freigeben: verlorene Antwort nach erfolgter Verfolgung ist bei exakter Gegenprobe erfolgreich', async () => {
  const a = attrappe({ varianten: [variante('M-WEG', { tracked: true })], antwortWeg: 'MustersperreVerfolgung' });
  const f = await freigebenImShop(a.proxy, { sku: 'M-WEG', vorher: { tracked: false, policy: 'DENY', menge: 3 } });
  assert.deepEqual([f.status, f.verfuegbar, f.antwortVerloren, f.nachher], ['frei', true, true, { tracked: false, policy: 'DENY', menge: 3 }]);
});

test('Freigeben: auch ohne Verfolgung muss der bekannte Bestand stimmen und Bestellbarkeit bestaetigt sein', async () => {
  const a = attrappe({ varianten: [variante('M-MENGE', { menge: 0 })] });
  const vorher = { tracked: false, policy: 'DENY', menge: 3 };
  const proxy = { async execute(q, v) {
    if (q.includes('mutation MustersperreBestand')) throw new Error('timeout before write');
    return a.proxy.execute(q, v);
  } };
  await assert.rejects(freigebenImShop(proxy, { sku: 'M-MENGE', vorher }), e => e.grund === 'gegenprobe');
  const nichtBestellbar = { async execute(q, v) {
    const d = await a.proxy.execute(q, v);
    for (const n of d.productVariants?.nodes || []) n.availableForSale = false;
    return d;
  } };
  await assert.rejects(freigebenImShop(nichtBestellbar, { sku: 'M-MENGE', vorher }), e => e.grund === 'gegenprobe');
  // Exakte Zielwerte alleine duerfen auch im Bereits-Pfad nicht genuegen.
  await assert.rejects(freigebenImShop(nichtBestellbar, { sku: 'M-MENGE', vorher }), e => e.grund === 'gegenprobe');
  assert.equal((await freigebenImShop(a.proxy, { sku: 'M-MENGE', vorher })).status, 'bereits');
});

test('Stand: alte unklare Ereignisse und spaeter fehlender Zugang verlieren Vorstand und Pruefpflicht nicht', () => {
  const vorher = { tracked: false, policy: 'DENY', menge: 3 };
  const ev = [
    ereignis({ sku: 'M-ALT', von: 'Test', grund: GRUND.GESPERRT, shopify: { geschrieben: false, fehlerGrund: 'unklar', vorher }, jetzt: zeit('10:00') }),
    ereignis({ sku: 'M-ALT', von: 'Test', grund: GRUND.GESPERRT, shopify: { geschrieben: false, aenderungMoeglich: false, fehlerGrund: 'kein-zugang' }, jetzt: zeit('11:00') }),
    ereignis({ sku: 'M-ALT', von: 'Test', grund: GRUND.FREI, shopify: { geschrieben: false, fehler: 'nicht geprueft' }, jetzt: zeit('12:00') }),
  ];
  const s = stand(ev).get('M-ALT');
  assert.equal(s.shopPruefen, true);
  assert.deepEqual(s.vorher, vorher);
  assert.equal(s.freigabeFehler, 'nicht geprueft');
});

test('Stand: sicher ungeschriebener Versuch friert keinen Vorstand fuer spaetere echte Sperre ein', () => {
  const alt = { tracked: true, policy: 'DENY', menge: 3 };
  const frisch = { tracked: true, policy: 'DENY', menge: 7 };
  const ev = [ereignis({ sku: 'M-FRISCH', von: 'Test', grund: GRUND.GESPERRT,
    shopify: { geschrieben: false, aenderungMoeglich: false, vorher: alt, fehlerGrund: 'recht-fehlt' }, jetzt: zeit('10:00') })];
  assert.equal(stand(ev).get('M-FRISCH').vorher, null, 'sicher erfolgloser Versuch hat noch keinen Rueckweg');
  ev.push(ereignis({ sku: 'M-FRISCH', von: 'Test', grund: GRUND.GESPERRT,
    shopify: { geschrieben: true, vorher: frisch }, jetzt: zeit('11:00') }));
  assert.deepEqual(stand(ev).get('M-FRISCH').vorher, frisch);
});

test('Stand: alte unklare, teilweise und bestaetigte Aenderungen behalten ersten Vorstand trotz sicher erfolgloser Wiederholung', () => {
  const vorher = { tracked: true, policy: 'CONTINUE', menge: 3 };
  const spaeter = { tracked: true, policy: 'CONTINUE', menge: 7 };
  for (const erste of [
    { geschrieben: false, fehlerGrund: 'unklar' },
    { geschrieben: false, aenderungMoeglich: true, fehlerGrund: 'recht-fehlt' },
    { geschrieben: true },
  ]) {
    const ev = [
      ereignis({ sku: 'M-BEHALTEN', von: 'Test', grund: GRUND.GESPERRT,
        shopify: { ...erste, vorher }, jetzt: zeit('10:00') }),
      ereignis({ sku: 'M-BEHALTEN', von: 'Test', grund: GRUND.GESPERRT,
        shopify: { geschrieben: false, aenderungMoeglich: false, vorher: spaeter, fehlerGrund: 'recht-fehlt' }, jetzt: zeit('11:00') }),
      ereignis({ sku: 'M-BEHALTEN', von: 'Test', grund: GRUND.GESPERRT,
        shopify: { geschrieben: false, aenderungMoeglich: false, fehlerGrund: 'kein-zugang' }, jetzt: zeit('12:00') }),
      ereignis({ sku: 'M-BEHALTEN', von: 'Test', grund: GRUND.GESPERRT,
        shopify: { geschrieben: true, vorher: spaeter }, jetzt: zeit('13:00') }),
    ];
    const s = stand(ev).get('M-BEHALTEN');
    assert.deepEqual(s.vorher, vorher);
    assert.equal(s.shopPruefen, true);
  }
});

// ---------------------------------------------------------------------------
// Doppelte Muster-SKU: dieselbe Farbe im Teppichboden-Muster und im Nach-Mass-Muster (Lexikon 28.10.:
// 2028 von 3911 Muster-SKUs). Bis dahin brach die Sperre mit "mehrdeutig" ab.
// ---------------------------------------------------------------------------

/** Zwei Mustervarianten derselben SKU, mit verschiedenem Ausgangsstand, und eine Nachbar-SKU. */
function doppelt() {
  const tb = variante('M-DOP-439', { handle: 'muster-testlinie-teppichboden-400cm', menge: 1 });
  const nm = variante('M-DOP-439', { handle: 'muster-testlinie-teppich-nach-mass', tracked: true, policy: 'CONTINUE', menge: 2 });
  const nachbar = variante('M-DOP-4390', { handle: 'muster-testlinie-teppichboden-400cm' });
  return { tb, nm, nachbar, a: attrappe({ varianten: [tb, nm, nachbar] }) };
}
const stand3 = z => [z.tracked, z.policy, z.menge];

test('Doppelte Muster-SKU: beide Mustervarianten gesperrt und wieder auf ihren eigenen Vorstand freigegeben', async () => {
  const { tb, nm, nachbar, a } = doppelt();
  const r = await sperreImShop(a.proxy, { sku: 'm-dop-439', referenz: 'gid://shopify/Order/1' });
  assert.deepEqual([r.status, r.verfuegbar], ['gesperrt', false]);
  assert.deepEqual([r.variantId, r.productId, r.vorher, r.nachher], [null, null, null, null], 'Einzelwerte nur bei genau einer Variante');
  assert.deepEqual(r.varianten.map(v => [v.variantId, v.handle, v.vorher, v.nachher, v.verfuegbar, v.aenderungMoeglich, Boolean(v.bereits)]), [
    [tb.id, 'muster-testlinie-teppichboden-400cm', { tracked: false, policy: 'DENY', menge: 1 }, { tracked: true, policy: 'DENY', menge: 0 }, false, true, false],
    [nm.id, 'muster-testlinie-teppich-nach-mass', { tracked: true, policy: 'CONTINUE', menge: 2 }, { tracked: true, policy: 'DENY', menge: 0 }, false, true, false],
  ]);
  assert.deepEqual([stand3(tb), stand3(nm), stand3(nachbar)], [[true, 'DENY', 0], [true, 'DENY', 0], [false, 'DENY', 0]], 'die Nachbar-SKU bleibt unberuehrt');
  const bestand = a.mutationen().filter(m => m.name === 'MustersperreBestand');
  assert.equal(bestand.length, 2);
  assert.equal(new Set(bestand.map(m => m.variables.schluessel)).size, 2, 'je Variante ein eigener @idempotent-Schluessel');
  assert.ok(bestand.every(m => m.variables.input.referenceDocumentUri === 'gid://shopify/Order/1'));
  assert.equal(a.aufrufe.filter(x => x.name === 'MustersperreVariante').length, 2, 'einmal lesen, einmal gegenpruefen - fuer beide zusammen');

  // Zweiter Lauf: beide schon gesperrt -> nichts geschrieben.
  const vorher = a.mutationen().length;
  const zweimal = await sperreImShop(a.proxy, { sku: 'M-DOP-439' });
  assert.equal(zweimal.status, 'bereits');
  assert.ok(zweimal.varianten.every(v => v.bereits && v.aenderungMoeglich === false));
  assert.equal(a.mutationen().length, vorher);

  // Freigeben: jede Variante auf ihren eigenen Stand vor der Sperre.
  const f = await freigebenImShop(a.proxy, { sku: 'M-DOP-439', varianten: r.varianten });
  assert.deepEqual([f.status, f.verfuegbar, f.variantId], ['frei', true, null]);
  assert.deepEqual([stand3(tb), stand3(nm)], [[false, 'DENY', 1], [true, 'CONTINUE', 2]]);
  assert.deepEqual(f.varianten.map(v => [v.variantId, v.verfuegbar]), [[tb.id, true], [nm.id, true]]);
  const nachFrei = a.mutationen().length;
  assert.equal((await freigebenImShop(a.proxy, { sku: 'M-DOP-439', varianten: r.varianten })).status, 'bereits');
  assert.equal(a.mutationen().length, nachFrei, 'zweite Freigabe schreibt nichts');
});

test('Doppelte Muster-SKU: die Gegenprobe gilt je Variante - bleibt eine bestellbar, ist nichts bestaetigt', async () => {
  const { tb, nm, a } = doppelt();
  // Die Nach-Mass-Variante bleibt laut Shopify bestellbar (z. B. weiterer Standort).
  const proxy = { async execute(q, v) {
    const d = await a.proxy.execute(q, v);
    for (const n of d.productVariants?.nodes || []) if (n.id === nm.id) n.availableForSale = true;
    return d;
  } };
  await assert.rejects(sperreImShop(proxy, { sku: 'M-DOP-439' }), e => e.grund === 'gegenprobe' && e.extra.aenderungMoeglich === true
    && e.extra.varianten.map(v => [v.variantId, v.verfuegbar, v.aenderungMoeglich]).join('|') === [[tb.id, false, true], [nm.id, true, true]].join('|'));

  // Freigabe: eine Variante zurueck, die andere nicht -> Fehler; Wiederholung schreibt nur noch die fehlende.
  const b = doppelt();
  const r = await sperreImShop(b.a.proxy, { sku: 'M-DOP-439' });
  // Die Richtlinie der Nach-Mass-Variante (DENY -> CONTINUE) kommt nie an.
  const halb = { async execute(q, v) {
    if (q.includes('mutation MustersperreRichtlinie')) throw new Error('timeout before write');
    return b.a.proxy.execute(q, v);
  } };
  await assert.rejects(freigebenImShop(halb, { sku: 'M-DOP-439', varianten: r.varianten }), e => e.grund === 'gegenprobe');
  assert.deepEqual([stand3(b.tb), stand3(b.nm)], [[false, 'DENY', 1], [true, 'DENY', 2]], 'die erste ist zurueck, die zweite nur zum Teil');
  const vorher = b.a.mutationen().length;
  const f = await freigebenImShop(b.a.proxy, { sku: 'M-DOP-439', varianten: r.varianten });
  assert.equal(f.status, 'frei');
  assert.deepEqual([stand3(b.tb), stand3(b.nm)], [[false, 'DENY', 1], [true, 'CONTINUE', 2]]);
  assert.deepEqual(b.a.mutationen().slice(vorher).map(m => [m.name, m.variables.variants?.[0]?.id]), [['MustersperreRichtlinie', b.nm.id]],
    'die Wiederholung schreibt nur, was noch fehlt');
});

test('Doppelte Muster-SKU: verletzt eine Variante die Vorbedingung, wird keine gesperrt', async () => {
  const tb = variante('M-DOP-L', { handle: 'muster-testlinie-teppichboden-400cm' });
  const nm = variante('M-DOP-L', { handle: 'muster-testlinie-teppich-nach-mass', level: false });
  const a = attrappe({ varianten: [tb, nm] });
  await assert.rejects(sperreImShop(a.proxy, { sku: 'M-DOP-L' }), e => e.grund === 'kein-standort' && e.extra.aenderungMoeglich === false && /eine der Mustervarianten/.test(e.message));
  assert.deepEqual([tb.tracked, nm.tracked, a.mutationen().length], [false, false, 0]);

  const lokalLeer = variante('M-DOP-G', { handle: 'muster-testlinie-teppichboden-400cm', tracked: true });
  const zweite = variante('M-DOP-G', { handle: 'muster-testlinie-teppich-nach-mass' });
  const b = attrappe({ varianten: [lokalLeer, zweite] });
  const global = { async execute(q, v) {
    const d = await b.proxy.execute(q, v);
    for (const n of d.productVariants?.nodes || []) if (n.id === lokalLeer.id) n.availableForSale = true;
    return d;
  } };
  await assert.rejects(sperreImShop(global, { sku: 'M-DOP-G' }), e => e.grund === 'gegenprobe' && e.extra.aenderungMoeglich === false);
  assert.equal(b.mutationen().length, 0, 'auch die zweite Variante bleibt ungesperrt');
});

test('Doppelte Muster-SKU: zweite Variante abgelehnt -> erste bleibt pruefpflichtig mit Vorstand, zweite friert keinen ein', async () => {
  const { tb, nm, a } = doppelt();
  let bestand = 0;
  const proxy = { async execute(q, v) {
    if (q.includes('mutation MustersperreBestand') && ++bestand === 2) throw new Error('ACCESS_DENIED write_inventory');
    return a.proxy.execute(q, v);
  } };
  let fehler;
  await assert.rejects(sperreImShop(proxy, { sku: 'M-DOP-439' }), e => { fehler = e; return e.grund === 'recht-fehlt'; });
  assert.equal(fehler.extra.aenderungMoeglich, true, 'die erste Variante ist schon gesperrt');
  assert.deepEqual(fehler.extra.varianten.map(v => [v.variantId, v.aenderungMoeglich]), [[tb.id, true], [nm.id, false]]);
  assert.deepEqual([stand3(tb), stand3(nm)], [[true, 'DENY', 0], [true, 'CONTINUE', 2]]);

  // Ablage und Stand: Rueckweg nur fuer die angefasste Variante. Danach steigt der Bestand der zweiten,
  // das Nachholen sperrt sie mit frischem Vorstand; die Freigabe stellt beide richtig her.
  const ev = [ereignis({ sku: 'M-DOP-439', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('10:00'),
    shopify: { geschrieben: false, aenderungMoeglich: true, fehlerGrund: fehler.grund, fehler: fehler.message, varianten: fehler.extra.varianten } })];
  let s = stand(ev).get('M-DOP-439');
  assert.equal(s.shopPruefen, true);
  assert.deepEqual(s.varianten.map(v => [v.variantId, v.vorher]), [[tb.id, { tracked: false, policy: 'DENY', menge: 1 }], [nm.id, null]]);
  nm.menge = 5;
  const r = await sperreImShop(a.proxy, { sku: 'M-DOP-439' });
  assert.deepEqual(r.varianten.map(v => [Boolean(v.bereits), v.aenderungMoeglich]), [[true, false], [false, true]]);
  ev.push(ereignis({ sku: 'M-DOP-439', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('11:00'), shopify: { geschrieben: true, varianten: r.varianten } }));
  s = stand(ev).get('M-DOP-439');
  assert.deepEqual(s.varianten.map(v => v.vorher), [{ tracked: false, policy: 'DENY', menge: 1 }, { tracked: true, policy: 'CONTINUE', menge: 5 }],
    'erste behaelt den echten Vorstand (nicht "bereits gesperrt"), zweite bekommt den frischen');
  await freigebenImShop(a.proxy, { sku: 'M-DOP-439', varianten: s.varianten });
  assert.deepEqual([stand3(tb), stand3(nm)], [[false, 'DENY', 1], [true, 'CONTINUE', 5]]);
});

test('Doppelte Muster-SKU: Freigabe fasst nur Varianten an, die eine Sperre beruehrt hat - alte Ablage mit einer Variante', async () => {
  // Altes Ereignis (vor 28.10.): eine Variante, variantId und vorher direkt unter shopify.
  const tb = variante('M-ALT-1', { handle: 'muster-testlinie-teppichboden-400cm', tracked: true });
  const alt = ereignis({ sku: 'M-ALT-1', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('10:00'),
    shopify: { geschrieben: true, variantId: tb.id, productId: tb.product.id, vorher: { tracked: false, policy: 'DENY', menge: 0 } } });
  assert.equal(alt.shopify.varianten, undefined, 'altes Format bleibt, wie es war');
  const s = stand([alt]).get('M-ALT-1');
  assert.deepEqual([s.imShop, s.variantId, s.vorher], [true, tb.id, { tracked: false, policy: 'DENY', menge: 0 }]);
  assert.deepEqual(s.varianten, [{ variantId: tb.id, productId: tb.product.id, handle: null, vorher: { tracked: false, policy: 'DENY', menge: 0 }, betroffen: true }]);
  assert.deepEqual(variantenVon(alt.shopify).map(v => v.variantId), [tb.id]);

  // Seitdem ist das Nach-Mass-Muster mit derselben SKU dazugekommen (gesperrt von Hand): bleibt, wie es ist.
  const neu = variante('M-ALT-1', { handle: 'muster-testlinie-teppich-nach-mass', tracked: true });
  const a = attrappe({ varianten: [tb, neu] });
  const f = await freigebenImShop(a.proxy, { sku: 'M-ALT-1', vorher: s.vorher, varianten: s.varianten });
  assert.deepEqual([f.status, f.variantId, stand3(tb), stand3(neu)], ['frei', tb.id, [false, 'DENY', 0], [true, 'DENY', 0]]);
  assert.ok(a.mutationen().every(m => JSON.stringify(m.variables).includes(tb.inventoryItemId) || JSON.stringify(m.variables).includes(tb.id)));

  // Gibt es keine der bekannten Varianten mehr, wird nichts angefasst.
  const b = attrappe({ varianten: [neu] });
  await assert.rejects(freigebenImShop(b.proxy, { sku: 'M-ALT-1', varianten: s.varianten }), e => e.grund === 'keine-mustervariante');
  assert.equal(b.mutationen().length, 0);
});

test('Lesen: zu viele Treffer fuer eine Seite sind mehrdeutig, exakte Treffer aus Musterprodukten alle', async () => {
  const { tb, nm, a } = doppelt();
  assert.deepEqual((await leseVarianten(a.proxy, 'M-DOP-439')).map(v => v.variantId), [tb.id, nm.id]);
  const voll = { async execute(q, v) {
    const d = await a.proxy.execute(q, v);
    return { productVariants: { ...d.productVariants, pageInfo: { hasNextPage: true } } };
  } };
  await assert.rejects(leseVarianten(voll, 'M-DOP-439'), e => e.grund === 'mehrdeutig' && /zu viele/.test(e.message));
  await assert.rejects(sperreImShop(voll, { sku: 'M-DOP-439' }), e => e.grund === 'mehrdeutig' && e.extra.aenderungMoeglich === false);
  assert.equal(a.mutationen().length, 0);
});

test('Doppelte Muster-SKU: Freigabe nach abgebrochener Sperre laesst die nie angefasste Variante, wie sie ist', async () => {
  const { tb, nm, a } = doppelt();
  let bestand = 0;
  const proxy = { async execute(q, v) {
    if (q.includes('mutation MustersperreBestand') && ++bestand === 2) throw new Error('ACCESS_DENIED write_inventory');
    return a.proxy.execute(q, v);
  } };
  let fehler;
  await assert.rejects(sperreImShop(proxy, { sku: 'M-DOP-439' }), e => { fehler = e; return e.grund === 'recht-fehlt'; });
  const s = stand([ereignis({ sku: 'M-DOP-439', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('10:00'),
    shopify: { geschrieben: false, aenderungMoeglich: true, fehlerGrund: fehler.grund, fehler: fehler.message, varianten: fehler.extra.varianten } })]).get('M-DOP-439');
  assert.deepEqual(s.varianten.map(v => [v.variantId, v.betroffen]), [[tb.id, true], [nm.id, false]]);
  const vorher = a.mutationen().length;
  const f = await freigebenImShop(a.proxy, { sku: 'M-DOP-439', vorher: s.vorher, varianten: s.varianten });
  assert.deepEqual([f.status, f.variantId], ['frei', tb.id]);
  assert.deepEqual([stand3(tb), stand3(nm)], [[false, 'DENY', 1], [true, 'CONTINUE', 2]], 'die zweite war nie gesperrt und bleibt unveraendert');
  assert.ok(a.mutationen().slice(vorher).every(m => !JSON.stringify(m.variables).includes(`"${nm.inventoryItemId}"`) && !JSON.stringify(m.variables).includes(`"${nm.id}"`)));
});

test('Altes Ereignis mit Vorstand ohne variantId: spaetere Sperre mit Variante behaelt den frueheren Rueckweg (Codex-Review #1749)', async () => {
  const ursprung = { tracked: false, policy: 'DENY', menge: 3 };
  // Der alte, unklare Versuch hat die Variante ganz gesperrt (-> "bereits") bzw. nur den Bestand gesetzt.
  for (const danach of [{ tracked: true, menge: 0 }, { tracked: false, menge: 0 }]) {
    const v = variante('M-OHNEID', danach);
    const a = attrappe({ varianten: [v] });
    const ev = [ereignis({ sku: 'M-OHNEID', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('10:00'),
      shopify: { geschrieben: false, fehlerGrund: 'unklar', vorher: ursprung } })];
    const r = await sperreImShop(a.proxy, { sku: 'M-OHNEID' }); // weitere Bestellung, neuer Code
    ev.push(ereignis({ sku: 'M-OHNEID', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('11:00'),
      shopify: { geschrieben: true, bereits: r.status === 'bereits', variantId: r.variantId, productId: r.productId, vorher: r.vorher, nachher: r.nachher, varianten: r.varianten } }));
    const s = stand(ev).get('M-OHNEID');
    assert.deepEqual(s.varianten.map(x => [x.variantId, x.vorher, x.betroffen]), [[v.id, ursprung, true]], JSON.stringify(danach));
    await freigebenImShop(a.proxy, { sku: 'M-OHNEID', vorher: s.vorher, varianten: s.varianten });
    assert.deepEqual(stand3(v), [false, 'DENY', 3], 'urspruenglich unverfolgt mit 3, nicht verfolgt/1');
  }
});

test('Freigabe liest bekannte Varianten per ID: geaenderte SKU wird mit freigegeben, geloeschte uebergangen (Codex-Review #1749)', async () => {
  const gesperrtMit = r => stand([ereignis({ sku: 'M-DOP-439', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('10:00'), shopify: { geschrieben: true, varianten: r.varianten } })]).get('M-DOP-439');
  const { tb, nm, a } = doppelt();
  const s = gesperrtMit(await sperreImShop(a.proxy, { sku: 'M-DOP-439' }));
  nm.sku = 'M-DOP-439-NEU'; // SKU im Shop inzwischen geaendert - per SKU waere sie nicht mehr zu finden
  const f = await freigebenImShop(a.proxy, { sku: 'M-DOP-439', vorher: s.vorher, varianten: s.varianten });
  assert.deepEqual([f.status, f.varianten.map(v => [v.variantId, v.verfuegbar])], ['frei', [[tb.id, true], [nm.id, true]]]);
  assert.deepEqual([stand3(tb), stand3(nm)], [[false, 'DENY', 1], [true, 'CONTINUE', 2]]);
  assert.equal(a.aufrufe.filter(x => x.name === 'MustersperreVariantenNachId').length, 2, 'lesen und gegenpruefen per ID');

  const b = doppelt();
  const s2 = gesperrtMit(await sperreImShop(b.a.proxy, { sku: 'M-DOP-439' }));
  b.a.varianten.splice(b.a.varianten.indexOf(b.nm), 1); // Variante geloescht: nichts mehr freizugeben
  const f2 = await freigebenImShop(b.a.proxy, { sku: 'M-DOP-439', varianten: s2.varianten });
  assert.deepEqual([f2.status, f2.variantId, stand3(b.tb)], ['frei', b.tb.id, [false, 'DENY', 1]]);
});

test('Aelteste Ablage ohne variantId, inzwischen zwei Mustervarianten: nur die nicht bestellbare wird freigegeben', async () => {
  const gesperrt = variante('M-URALT', { handle: 'muster-testlinie-teppichboden-400cm', tracked: true });
  const neu = variante('M-URALT', { handle: 'muster-testlinie-teppich-nach-mass' });
  const a = attrappe({ varianten: [gesperrt, neu] });
  const s = stand([ereignis({ sku: 'M-URALT', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('10:00'),
    shopify: { geschrieben: false, fehlerGrund: 'unklar', vorher: { tracked: false, policy: 'DENY', menge: 3 } } })]).get('M-URALT');
  assert.deepEqual([s.varianten, s.shopPruefen], [[], true]);
  const f = await freigebenImShop(a.proxy, { sku: 'M-URALT', vorher: s.vorher, varianten: s.varianten });
  assert.equal(f.status, 'frei');
  assert.deepEqual([stand3(gesperrt), stand3(neu)], [[false, 'DENY', 3], [false, 'DENY', 0]]);
  assert.ok(a.mutationen().every(m => !JSON.stringify(m.variables).includes(`"${neu.inventoryItemId}"`) && !JSON.stringify(m.variables).includes(`"${neu.id}"`)));
});

test('Alter Vorstand ohne variantId, danach zwei ungesperrte Varianten: Zuordnung unklar -> Freigabe pruefpflichtig (Codex-Review #1749 Runde 2)', async () => {
  const ursprung = { tracked: false, policy: 'DENY', menge: 3 };
  const tb = variante('M-UNKLAR', { handle: 'muster-testlinie-teppichboden-400cm' }); // alter Versuch: 3 -> 0, unverfolgt
  const nm = variante('M-UNKLAR', { handle: 'muster-testlinie-teppich-nach-mass' });
  const a = attrappe({ varianten: [tb, nm] });
  const ev = [ereignis({ sku: 'M-UNKLAR', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('10:00'), shopify: { geschrieben: false, fehlerGrund: 'unklar', vorher: ursprung } })];
  const r = await sperreImShop(a.proxy, { sku: 'M-UNKLAR' });
  assert.ok(r.varianten.every(v => !v.bereits), 'keine war gesperrt - welche die alte war, ist nicht zu erkennen');
  ev.push(ereignis({ sku: 'M-UNKLAR', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('11:00'), shopify: { geschrieben: true, varianten: r.varianten } }));
  const s = stand(ev).get('M-UNKLAR');
  assert.equal(s.vorherUnklar, true);
  const frei = () => freigebenImShop(a.proxy, { sku: 'M-UNKLAR', vorher: s.vorher, varianten: s.varianten, vorherUnklar: s.vorherUnklar });
  const vorher = a.mutationen().length;
  await assert.rejects(frei(), e => e.grund === 'vorstand-unklar' && /von Hand freigeben/.test(e.message));
  assert.equal(a.mutationen().length, vorher, 'kein Erfolg mit Bestand 0 statt 3 - es wird nichts geschrieben');
  // Von Hand in Shopify freigegeben: "Wieder verfuegbar" ist dann erledigt, ohne zu schreiben.
  Object.assign(tb, { tracked: false, menge: 3 });
  nm.tracked = false;
  const f = await frei();
  assert.deepEqual([f.status, f.varianten.map(v => v.verfuegbar), a.mutationen().length], ['bereits', [true, true], vorher]);

  // Eindeutig bleibt eindeutig: ein alter Vorstand ohne ID nach genau einer bekannten Variante gehoert zu ihr.
  const spaet = stand([
    ereignis({ sku: 'M-UNKLAR', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('09:00'), shopify: { geschrieben: false, aenderungMoeglich: false, fehlerGrund: 'recht-fehlt', variantId: tb.id } }),
    ereignis({ sku: 'M-UNKLAR', von: 'Test', grund: GRUND.GESPERRT, jetzt: zeit('10:00'), shopify: { geschrieben: false, fehlerGrund: 'unklar', vorher: ursprung } }),
  ]).get('M-UNKLAR');
  assert.deepEqual([spaet.vorherUnklar, spaet.varianten.map(v => [v.variantId, v.vorher, v.betroffen])], [false, [[tb.id, ursprung, true]]]);
});
