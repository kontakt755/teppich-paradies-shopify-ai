import './_testumgebung.mjs'; // vor Server-Imports
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { PRIVAT_DIR } from './_testumgebung.mjs';
import { anzeigename, BlattFehler, bewertungText, blaetterHtml, istNah, musterZiel, whatsappNummer } from '../../../domains/shopify/muster-begleitblatt/vorlage.mjs';

// Ausschliesslich synthetische Kunden und Artikel. Chromium und qrencode laufen hier nicht -
// der Test reicht Ersatz herein; die echte Erzeugung prueft der Klicktest aus dem Changelog.
const qr = url => `data:qr,${encodeURIComponent(url)}`;
const WHATSAPP = { anzeige: '0179 2612211', wa: '491792612211' };
const zeile = (name, farbe = 'Sand (1)', url = 'https://www.teppich-paradies.net/products/x?variant=1&utm_source=musterblatt') => ({ name, farbe, typ: 'Klickvinyl', url });
const umschlag = (muster, extra = {}) => ({ nummern: ['#T1'], name: 'Sabine Beispiel', tag: '01.11.2026', nah: false, muster, ...extra });
const blaetterZahl = html => html.match(/class="blatt"/g)?.length || 0;

test('Namen: Anrede weg, reine Klein- oder Grossschreibung gross, Gemischtes bleibt', () => {
  assert.equal(anzeigename('Frau Helen Beispiel'), 'Helen Beispiel');
  assert.equal(anzeigename('yvonne beispiel-muster'), 'Yvonne Beispiel-Muster');
  assert.equal(anzeigename('JÖRG BEISPIEL'), 'Jörg Beispiel');
  assert.equal(anzeigename('Marita van Beispiel'), 'Marita van Beispiel');
});

test('WhatsApp: Eintrag gilt, ohne Eintrag die Firmennummer, Unsinn bricht ab', () => {
  assert.deepEqual(whatsappNummer('0151 2345678'), { anzeige: '0151 2345678', wa: '491512345678' });
  assert.equal(whatsappNummer(undefined).wa, '491792612211');
  assert.throws(() => whatsappNummer('kein Anschluss'), BlattFehler);
});

test('Nah nur, wenn die ganze Postleitzahl innerhalb von 50 km liegt; Unbekanntes ist fern', () => {
  assert.equal(istNah('16515'), true);
  assert.equal(istNah('14612'), true);
  assert.equal(istNah('80331'), false);
  assert.equal(istNah(''), false);
  assert.equal(istNah(undefined), false);
  const tabelle = JSON.parse(fs.readFileSync(new URL('../../../assets/tp-verlegegebiet-orte.json', import.meta.url), 'utf8')).plz;
  const grenzfall = Object.keys(tabelle).find(p => Array.isArray(tabelle[p]) && tabelle[p][0] <= 50 && tabelle[p][1] > 50);
  assert.ok(grenzfall, 'Tabelle hat keine Postleitzahl ueber die Grenze hinweg');
  assert.equal(istNah(grenzfall), false);
});

test('Bewertung nur aus dem erfolgreichen Stand, sonst keine Note', () => {
  assert.equal(bewertungText('4,9 aus 246'), '4,9 von 5 · 246 Google-Bewertungen');
  assert.equal(bewertungText('Quelle antwortet nicht'), null);
  assert.equal(bewertungText(undefined), null);
});

const position = attrs => ({ customAttributes: Object.entries(attrs).map(([key, value]) => ({ key, value })) });
const katalog = (handle, varianten, produktgruppe = 'Teppich nach Maß') => new Map([[handle, { handle, produktgruppe, varianten }]]);
const variante = (nr, farbe, verfuegbar = true, titel = farbe) => ({ id: `gid://shopify/ProductVariant/${nr}`, farbe, titel, verfuegbar });

test('Kaufseite: Variante und Farbe muessen im Lexikon stimmen, sonst gibt es kein Blatt', () => {
  const m = { bestellt: { titel: 'Muster Testlinea Teppich nach Maß', farbe: 'Sand (1)' } };
  const q = position({ _Quellprodukt: 'testlinea', _Quellvariante_ID: '7' });
  const gut = katalog('testlinea', [variante(7, 'Sand (1)', true, 'Sand (1) / 200 cm')]);
  const ziel = musterZiel(m, q, gut);
  assert.equal(ziel.name, 'Testlinea Teppich nach Maß');
  assert.equal(ziel.url, 'https://www.teppich-paradies.net/products/testlinea?variant=7&utm_source=musterblatt');
  assert.throws(() => musterZiel(m, position({}), gut), e => e instanceof BlattFehler && /nicht bekannt/.test(e.message));
  assert.throws(() => musterZiel(m, q, new Map()), e => e instanceof BlattFehler && /nicht verfügbar/.test(e.message));
  assert.throws(() => musterZiel(m, q, katalog('testlinea', [variante(8, 'Sand (1)')])), /nicht verfügbar/);
  assert.throws(() => musterZiel(m, q, katalog('testlinea', [variante(7, 'Sand (1)', false)])), /nicht verfügbar/);
  assert.throws(() => musterZiel(m, q, katalog('testlinea', [variante(7, 'Grau (2)')])), /passt nicht/);
});

test('Kostenloses Muster: Link ueber das Etikett, ohne Farbzeile, mit Produktgruppe', () => {
  const m = { bestellt: { titel: 'Muster: Testlinea Eiche', farbe: null }, etikett: { url: 'https://www.teppich-paradies.net/products/testlinea-eiche' } };
  const ziel = musterZiel(m, position({}), katalog('testlinea-eiche', [variante(1, 'Eiche')], 'Klickvinyl'));
  assert.deepEqual([ziel.name, ziel.farbe, ziel.typ], ['Testlinea Eiche', null, 'Klickvinyl']);
  assert.match(blaetterHtml([umschlag([ziel])], { whatsapp: WHATSAPP, qr }), /Testlinea Eiche<\/strong>Klickvinyl/);
});

test('Vorlage: Boden und Teppich nach Mass, Einzahl, Region, Name wird maskiert', () => {
  const boden = blaetterHtml([umschlag([zeile('Testboden'), zeile('Testboden', 'Grau (2)')])], { whatsapp: WHATSAPP, qr });
  assert.match(boden, /Ihre Muster sind da\. So finden Sie in drei Schritten Ihren Boden\./);
  assert.match(boden, /Preis und Menge/);
  assert.match(boden, /Wir liefern deutschlandweit/);
  assert.equal(blaetterZahl(boden), 1);
  const teppich = blaetterHtml([umschlag([zeile('Testlinea Teppich nach Maß')], { nah: true })], { whatsapp: WHATSAPP, qr });
  assert.match(teppich, /Ihr Muster ist da\. So finden Sie in drei Schritten Ihren Teppich\./);
  assert.match(teppich, /Maß klären und bestellen/);
  assert.match(teppich, /In Ihrer Nähe:<\/strong> Beratung in unserem Laden/);
  assert.doesNotMatch(teppich, /Aufmaß vor Ort/);
  const boese = blaetterHtml([umschlag([zeile('Test')], { name: '<b>Bobby</b>' })], { whatsapp: WHATSAPP, qr });
  assert.match(boese, /&lt;b&gt;Bobby&lt;\/b&gt;,/);
});

test('Vorlage: ab 4 Mustern zweites Blatt, die Reihenfolge bleibt', () => {
  const muster = [1, 2, 3, 4].map(n => zeile(`Testboden ${n}`));
  const html = blaetterHtml([umschlag(muster)], { whatsapp: WHATSAPP, qr });
  assert.equal(blaetterZahl(html), 2);
  assert.match(html, /Muster 1 bis 3 von 4, die weiteren auf Blatt 2/);
  assert.ok(html.indexOf('Ihre weiteren Muster') < html.indexOf('Testboden 4'));
  assert.ok(html.indexOf('Testboden 3') < html.indexOf('Ihre weiteren Muster'));
  assert.equal(blaetterZahl(blaetterHtml([umschlag(muster.slice(0, 3))], { whatsapp: WHATSAPP, qr })), 1);
});

test('Vorlage: Note nur zusammen mit dem Pflichtsatz, WhatsApp-Code nennt die erste Bestellnummer', () => {
  const mit = blaetterHtml([umschlag([zeile('T')])], { whatsapp: WHATSAPP, bewertung: '4,9 von 5 · 246 Google-Bewertungen', qr });
  assert.ok(mit.indexOf('246 Google-Bewertungen') < mit.indexOf('Wir prüfen nicht, ob die Verfasser bei uns gekauft haben.'));
  const ohne = blaetterHtml([umschlag([zeile('T')])], { whatsapp: WHATSAPP, qr });
  assert.doesNotMatch(ohne, /Google-Bewertungen|Wir prüfen nicht/);
  assert.match(ohne, new RegExp(encodeURIComponent('https://wa.me/491792612211?text=')));
  assert.match(ohne, /Musterbestellung%2520%2523T1/);
});

const lineItem = (id, titel, farbe, handle, variante) => ({ id: `gid://shopify/LineItem/${id}`, sku: 'TP-MUSTER-000', title: titel, variantTitle: farbe, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [{ key: '_Quellprodukt', value: handle }, { key: '_Quellvariante_ID', value: variante }, { key: 'Farbe', value: farbe }], originalUnitPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } },
  variant: { id: 'gid://shopify/ProductVariant/900', sku: 'TP-MUSTER-000', title: farbe, metafields: { nodes: [] }, product: { handle: 'muster', title: titel, productType: 'Muster', metafields: { nodes: [] } } } });
const bestellung = (n, name, plz, zeilen) => ({ id: `gid://shopify/Order/${n}`, name: `#${n}`, createdAt: '2026-10-18T06:00:00Z', cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', tags: [], customAttributes: [],
  customer: { id: `gid://shopify/Customer/${n}`, displayName: name, email: `k${n}@example.invalid` },
  shippingAddress: { name, address1: 'Testweg 7', address2: null, zip: plz, city: 'Musterstadt', country: 'Germany' },
  totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: zeilen } });

function umgebung(t, { einstellungen = null, bewertung = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-begleitblatt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ quellvarianten: [], orders: [
    bestellung(801, 'frau anna beispiel', '16515', [lineItem(8011, 'Muster Testlinea Teppich nach Maß', 'Sand (1)', 'testlinea', '7')]),
    bestellung(802, 'Bert Beispiel', '80331', [lineItem(8021, 'Muster Testboden', 'Grau (2)', 'testboden', '8')]),
    bestellung(803, 'Carla Beispiel', '80331', [lineItem(8031, 'Muster Ausgelaufen', 'Rot (3)', 'ausgelaufen', '9')]),
  ] }));
  if (einstellungen) { fs.mkdirSync(path.join(dir, 'muster-begleitblatt')); fs.writeFileSync(path.join(dir, 'muster-begleitblatt/einstellungen.json'), JSON.stringify(einstellungen)); }
  if (bewertung) { fs.mkdirSync(path.join(dir, 'google-bewertung')); fs.writeFileSync(path.join(dir, 'google-bewertung/status.json'), JSON.stringify({ meldung: bewertung })); }
  fs.mkdirSync(path.join(dir, 'lexikon'));
  fs.writeFileSync(path.join(dir, 'lexikon/produkte.json'), JSON.stringify({ produkte: [
    { handle: 'testlinea', produktgruppe: 'Teppich nach Maß', varianten: [variante(7, 'Sand (1)')] },
    { handle: 'testboden', produktgruppe: 'Teppichboden', varianten: [variante(8, 'Grau (2)')] },
  ] }));
  const gedruckt = [];
  const api = createApi({ root: dir, privatDirPath: dir, now: () => new Date('2026-10-21T12:00:00Z'), begleitblattQr: qr,
    begleitblattPdf: async html => { gedruckt.push(html); return { pdf: Buffer.from('%PDF-test'), zuVoll: [] }; } });
  return { dir, api, gedruckt };
}

test('API: ein Umschlag als PDF, Name bereinigt, Region aus der Postleitzahl, nichts geschrieben', async t => {
  const { api, gedruckt, dir } = umgebung(t, { einstellungen: { whatsapp: '0151 2345678' }, bewertung: '4,9 aus 246' });
  const vorher = fs.readdirSync(dir).sort();
  const r = await api.kundenMusterBegleitblatt({ nummern: '801' });
  assert.equal(String(r.inhalt), '%PDF-test');
  assert.equal(r.name, 'Begleitblatt 801.pdf');
  assert.deepEqual(r.ausgelassen, []);
  assert.equal(gedruckt.length, 1);
  assert.match(gedruckt[0], />Anna Beispiel,<\/h1>/);
  assert.match(gedruckt[0], /In Ihrer Nähe:/);
  assert.match(gedruckt[0], /0151 2345678/);
  assert.match(gedruckt[0], /Bestellt am 18\.10\.2026/);
  assert.match(gedruckt[0], /246 Google-Bewertungen/);
  assert.doesNotMatch(gedruckt[0], /Bert Beispiel/);
  assert.deepEqual(fs.readdirSync(dir).sort(), vorher);
});

test('API: Sammeldruck laesst einen Umschlag ohne Kaufseite aus und meldet ihn, die uebrigen kommen', async t => {
  const { api, gedruckt } = umgebung(t);
  const r = await api.kundenMusterBegleitblatt({ nummern: '801,802,803' });
  assert.equal(r.name, 'Begleitblaetter.pdf');
  assert.deepEqual(r.ausgelassen, [{ nummer: '#803', grund: 'Muster Ausgelaufen (Rot (3)) ist im Shop nicht verfügbar.' }]);
  assert.equal(blaetterZahl(gedruckt[0]), 2);
  assert.match(gedruckt[0], /0179 2612211/);
  assert.doesNotMatch(gedruckt[0], /Google-Bewertungen/);
});

test('API: nur ein Umschlag ohne Kaufseite ist ein Fehler mit Grund; Falsches wird abgelehnt', async t => {
  const { api, gedruckt } = umgebung(t);
  await assert.rejects(api.kundenMusterBegleitblatt({ nummern: '803' }), e => e.status === 422 && /#803: .*nicht verfügbar/.test(e.message));
  await assert.rejects(api.kundenMusterBegleitblatt({ nummern: '999' }), e => e.status === 404);
  for (const falsch of ['', 'abc', '801,', '1;2']) await assert.rejects(api.kundenMusterBegleitblatt({ nummern: falsch }), e => e.status === 400);
  assert.equal(gedruckt.length, 0);
});

test('API: Gesperrtes Muster steht nicht auf dem Blatt; ist keins mehr uebrig, gibt es keins', async t => {
  const { api, gedruckt } = umgebung(t);
  const echt = api.kundenMusterPacken.bind(api);
  const mitSperre = gesperrt => () => {
    const liste = echt();
    return { ...liste, kunden: liste.kunden.map(k => ({ ...k, muster: k.muster.flatMap(m => (gesperrt ? [m, { ...m, lineItemId: 'weg', gesperrt: { imShop: true }, bestellt: { ...m.bestellt, titel: 'Muster Gesperrt' } }] : [{ ...m, gesperrt: { imShop: true } }])) })) };
  };
  api.kundenMusterPacken = mitSperre(true);
  await api.kundenMusterBegleitblatt({ nummern: '801' });
  assert.doesNotMatch(gedruckt[0], /Gesperrt/);
  assert.match(gedruckt[0], /Ihr Muster ist da\./);
  api.kundenMusterPacken = mitSperre(false);
  await assert.rejects(api.kundenMusterBegleitblatt({ nummern: '801' }), e => e.status === 422 && /kein Muster mehr/.test(e.message));
});

test('API: Ohne Produktdaten sagt die Meldung das, statt alle Muster fuer ausgelaufen zu halten', async t => {
  const { dir, api, gedruckt } = umgebung(t);
  fs.rmSync(path.join(dir, 'lexikon/produkte.json'));
  await assert.rejects(api.kundenMusterBegleitblatt({ nummern: '801' }), e => e.status === 503 && /Produktdaten fehlen/.test(e.message));
  assert.equal(gedruckt.length, 0);
});

test('API: Zu voller Umschlag wird gemeldet, ist es der einzige, gibt es einen Fehler', async t => {
  const { dir } = umgebung(t);
  const api = createApi({ root: dir, privatDirPath: dir, begleitblattQr: qr, begleitblattPdf: async () => ({ pdf: null, zuVoll: ['#801'] }) });
  await assert.rejects(api.kundenMusterBegleitblatt({ nummern: '801' }), e => e.status === 422 && /passt nicht auf das Blatt/.test(e.message));
});

test('Route: Eingabe wird geprueft, nur GET', async t => {
  const { dir } = umgebung(t);
  process.env.TP_PRIVAT_DIR = dir;
  const { requestHandler } = await import('../../../scripts/serve-dashboard.mjs?case=begleitblatt');
  t.after(() => { process.env.TP_PRIVAT_DIR = PRIVAT_DIR; });
  const server = http.createServer(requestHandler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}/api/kunden/muster-begleitblatt`;
  assert.equal((await fetch(`${url}?nummern=abc`)).status, 400);
  assert.equal((await fetch(`${url}?nummern=999`)).status, 404);
  assert.equal((await fetch(`${url}?nummern=801`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 405);
});
