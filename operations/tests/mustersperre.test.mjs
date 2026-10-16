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
  freigabeZiel, GRUND, MustersperreFehler,
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
  // Gleiche SKU zweimal: die Variante des Musterprodukts gewinnt; zwei Musterprodukte = Handarbeit.
  const muster = variante('M-DOPPEL');
  const fremd = variante('M-DOPPEL', { handle: 'kostenloses-muster' });
  const a = attrappe({ varianten: [fremd, muster] });
  assert.equal((await sperreImShop(a.proxy, { sku: 'M-DOPPEL' })).variantId, muster.id);
  assert.equal(fremd.tracked, false, 'die fremde Variante bleibt unberuehrt');
  await assert.rejects(sperreImShop(attrappe({ varianten: [variante('M-D2'), variante('M-D2')] }).proxy, { sku: 'M-D2' }), e => e.grund === 'mehrdeutig');
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
