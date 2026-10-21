// Lieferantenbelege aus dem Postfach (Inhaber 2026-10-19): erkennen, zuordnen, abgleichen,
// Ablage mit Sperre, API und Rollen. Nur synthetische Daten: Pseudonym-Lieferanten A/B,
// erfundene Kunden, Domains unter .example.
import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  klassifiziere, referenzen, aktuellerTeil, domainVon, lieferantZurDomain, kandidatenAus, ordneZu,
  zuordnungMitEntscheidung, abgleich, belegMarke,
} from '../lib/lieferbelege.mjs';
import { lieferbelegePfad, leseBelege, uebernehmen, entscheide, bekannt, LieferbelegFehler } from '../../../operations/lib/lieferbelege.mjs';
import { createApi } from '../../../scripts/dashboard-api.mjs';

const JETZT = new Date('2026-10-16T10:00:00Z');

// --- Erkennen -------------------------------------------------------------------------------

test('klassifiziere: AB, Lieferschein, Avis, Storno, Rechnung, Beleg und was kein Beleg ist', () => {
  const k = (betreff, extra = {}) => klassifiziere({ von: 'Innendienst <innendienst@lieferant-a.example>', betreff, text: '', ...extra }).art;
  assert.equal(k('Auftragsbestätigung 4711 Kommission Beispiel'), 'ab');
  assert.equal(k('Auftr.-Best. KD050/0217 BEISPIEL'), 'ab');
  assert.equal(k('Orderbevestiging 123456'), 'ab');
  assert.equal(k('Lieferschein 80001234'), 'lieferschein');
  assert.equal(k('Ihre Sendung ist unterwegs'), 'lieferschein');
  assert.equal(k('Liefertermin für Ihren Auftrag 4711'), 'avis');
  assert.equal(k('Rechnung 2026-0815'), 'rechnung');
  assert.equal(k('Auftragsbestätigung 4711', { text: 'Leider ist die Farbe 12 nicht mehr lieferbar.' }), 'storno', 'Storno im Text geht vor AB');
  assert.equal(k('Ihre Bestellung', { anhaenge: ['Stornierung_4711.pdf'] }), 'storno');
  assert.equal(k('Dokument', { anhaenge: ['scan_001.pdf'] }), 'beleg');
  assert.equal(k('Automatische Antwort: Auftragsbestätigung'), 'ignorieren');
  assert.equal(k('Angebot 2026-77'), 'ignorieren');
  assert.equal(k('Newsletter Herbst'), 'ignorieren');
  assert.equal(klassifiziere({ von: 'kontakt@teppich-paradies.net', betreff: 'Auftragsbestätigung' }).art, 'ignorieren', 'eigene Mail');
});

test('aktuellerTeil: zitierter Verlauf zaehlt nicht (alter Auftrag, alte Nummer)', () => {
  const text = 'Anbei die AB.\n\nAm 01.10.2026 um 10:00 schrieb Einkauf:\n> Bestellung #1001 Kommission Altkunde';
  assert.equal(aktuellerTeil(text).trim(), 'Anbei die AB.');
  const r = referenzen({ betreff: 'Auftragsbestätigung 4711', text });
  assert.deepEqual(r.textNummern, []);
});

test('referenzen: Bestellnummern nach Fundort, Belegnummer, Kommission ohne unseren Firmennamen', () => {
  const r = referenzen({ betreff: 'Auftragsbestätigung 4711 Kommission Erika Beispiel #9001 Teppich Paradies Oran', text: 'Siehe auch #9002.' });
  assert.deepEqual(r.betreffNummern, ['#9001']);
  assert.deepEqual(r.textNummern, ['#9002']);
  assert.equal(r.belegnummer, '4711');
  assert.equal(r.kommission, 'Erika Beispiel');
  assert.deepEqual(r.woerter, ['erika', 'beispiel']);
  const a = referenzen({ betreff: 'Auftr.-Best. KD050/0217 MUSTERMANN' });
  assert.equal(a.belegnummer, 'KD050/0217');
  assert.equal(a.kommission, 'MUSTERMANN');
});

test('lieferantZurDomain: Stammdaten-Adressen, postfachDomains, Unterdomain, nie Freemail', () => {
  const stammdaten = { lieferanten: {
    A: { ware: { mail: 'bestellung@lieferant-a.example' }, muster: {} },
    B: { postfachDomains: ['lieferant-b.example'], ware: { mail: 'b@gmail.com' }, muster: {} },
  } };
  assert.equal(lieferantZurDomain('lieferant-a.example', { stammdaten }), 'A');
  assert.equal(lieferantZurDomain('mail.lieferant-b.example', { stammdaten }), 'B');
  assert.equal(lieferantZurDomain('gmail.com', { stammdaten }), null);
  assert.equal(lieferantZurDomain('andere.example', { stammdaten }), null);
  assert.equal(lieferantZurDomain('andere.example', { stammdaten, absender: { 'andere.example': { art: 'lieferant', lieferant: 'B' } } }), 'B');
  assert.equal(domainVon('Innendienst <AB@Lieferant-A.example>'), 'lieferant-a.example');
});

// --- Zuordnen -------------------------------------------------------------------------------

const zeile = (nr, kunde, lieferanten, { datum = '2026-10-10T10:00:00Z', fulfillment = 'UNFULFILLED', test: istTest = false } = {}) => ({
  orderId: `gid://shopify/Order/${nr}`, orderName: `#${nr}`, kundenname: kunde, datum, fulfillmentstatus: fulfillment, testbestellung: istTest, storniert: false,
  auftrag: { positionen: lieferanten.map((l, i) => ({ lineItemId: `gid://shopify/LineItem/${nr}${i}`, lieferant: l, istMuster: false, titel: `Ware ${l}` })) },
});
const KANDIDATEN = kandidatenAus([
  zeile(9001, 'Erika Beispiel', ['A']),
  zeile(9002, 'Max Mustermann', ['A', 'B']),
  zeile(9003, 'Lena Schwarz', ['B']),
  zeile(9004, 'Tom Schwarz', ['B']),
  zeile(9005, 'Testkunde', ['A'], { test: true }),
  zeile(8001, 'Erika Beispiel', ['A'], { datum: '2026-04-01T10:00:00Z' }),
]);
const beleg = (betreff, { lieferant = 'A', text = '', datum = '2026-10-14T08:00:00Z' } = {}) => ({
  id: `m-${betreff.length}`, datum, lieferant, domain: lieferant ? `lieferant-${lieferant.toLowerCase()}.example` : 'fremd.example', art: 'ab',
  refs: referenzen({ betreff, text }),
});

test('kandidatenAus: ohne Testbestellungen, Lieferanten je Bestellung', () => {
  assert.equal(KANDIDATEN.some(k => k.orderName === '#9005'), false);
  assert.deepEqual(KANDIDATEN.find(k => k.orderName === '#9002').lieferanten, ['A', 'B']);
});

test('ordneZu: sicher nur mit Nummer im Betreff UND passendem Lieferanten', () => {
  assert.equal(ordneZu(beleg('Auftragsbestätigung 4711 #9001'), KANDIDATEN).stufe, 'sicher');
  const zwei = ordneZu(beleg('AB 4711 #9001 #9002'), KANDIDATEN);
  assert.equal(zwei.stufe, 'sicher');
  assert.equal(zwei.orderIds.length, 2);
  const falscherLieferant = ordneZu(beleg('AB 4711 #9003'), KANDIDATEN);
  assert.equal(falscherLieferant.stufe, 'vorschlag', 'Lieferant A, Bestellung hat nur B');
  assert.match(falscherLieferant.grund, /passt nicht/);
  assert.equal(ordneZu(beleg('AB 4711 #9001', { lieferant: null }), KANDIDATEN).stufe, 'vorschlag', 'unbekannter Absender');
  assert.equal(ordneZu(beleg('AB 4711', { text: 'zu Ihrer Bestellung #9001' }), KANDIDATEN).stufe, 'vorschlag', 'Nummer nur im Text');
});

test('ordneZu: Name nur als Vorschlag, mehrdeutige Nachnamen nur mit Vorname, Zeitfenster', () => {
  const name = ordneZu(beleg('Auftragsbestätigung 4711 Kommission Beispiel'), KANDIDATEN);
  assert.equal(name.stufe, 'vorschlag');
  assert.deepEqual(name.orderIds, ['gid://shopify/Order/9001'], 'die Bestellung aus April liegt ausserhalb der 120 Tage');
  assert.equal(ordneZu(beleg('AB 4711 Kommission Schwarz', { lieferant: 'B' }), KANDIDATEN).stufe, 'keine', '"Schwarz" ist auch eine Farbe');
  assert.deepEqual(ordneZu(beleg('AB 4711 Kommission Lena Schwarz', { lieferant: 'B' }), KANDIDATEN).orderIds, ['gid://shopify/Order/9003']);
  assert.equal(ordneZu(beleg('AB 4711 #9001', { datum: '2026-10-01T08:00:00Z' }), KANDIDATEN).stufe, 'keine', 'Beleg vor der Bestellung');
  assert.equal(ordneZu(beleg('AB 4711 #9001'), KANDIDATEN, { abgelehnt: ['gid://shopify/Order/9001'] }).stufe, 'keine', '"Passt nicht" bleibt');
});

test('zuordnungMitEntscheidung: Mensch geht vor, Absender "kein Shop" nur ohne Nummer im Betreff', () => {
  const b = beleg('Auftragsbestätigung 4711 Kommission Beispiel');
  assert.equal(zuordnungMitEntscheidung({ ...b, entscheidung: { art: 'zugeordnet', orderIds: ['x'], von: 'Mona' } }, KANDIDATEN).stufe, 'bestaetigt');
  assert.equal(zuordnungMitEntscheidung({ ...b, entscheidung: { art: 'kein_shop', von: 'Mona' } }, KANDIDATEN).stufe, 'kein_shop');
  const absender = { 'lieferant-a.example': { art: 'kein_shop' } };
  assert.equal(zuordnungMitEntscheidung(b, KANDIDATEN, { absender }).stufe, 'kein_shop');
  assert.equal(zuordnungMitEntscheidung(beleg('AB 4711 #9001'), KANDIDATEN, { absender }).stufe, 'sicher');
});

// --- Abgleich -------------------------------------------------------------------------------

test('abgleich: AB und Lieferschein je Auftrag und Lieferant, Storno rot, Lieferschein ohne Haken gelb', () => {
  const status = (nr, i, eintrag) => [`gid://shopify/Order/${nr}::gid://shopify/LineItem/${nr}${i}`, eintrag];
  const statusAlle = Object.fromEntries([
    status(9001, 0, { status: 'bestellt', bestelltAm: '2026-10-11T09:00:00Z' }),
    status(9002, 0, { status: 'bestellt', bestelltAm: '2026-10-11T09:00:00Z' }),
    status(9002, 1, { status: 'bestellt', bestelltAm: '2026-10-12T09:00:00Z' }),
    status(9003, 0, { status: 'raus' }),
  ]);
  const kandidaten = kandidatenAus([
    zeile(9001, 'Erika Beispiel', ['A']), zeile(9002, 'Max Mustermann', ['A', 'B'], { fulfillment: 'FULFILLED' }),
    zeile(9003, 'Lena Schwarz', ['B']), zeile(9004, 'Tom Schwarz', ['B']),
  ], statusAlle);
  const mit = (id, art, betreff, lieferant, datum) => {
    const b = { id, art, datum, lieferant, domain: `lieferant-${lieferant.toLowerCase()}.example`, refs: referenzen({ betreff }), erledigt: null };
    return { ...b, zuordnung: zuordnungMitEntscheidung(b, kandidaten) };
  };
  const belege = [
    mit('ab1', 'ab', 'AB 1 #9001', 'A', '2026-10-12T08:00:00Z'),
    mit('ls1', 'lieferschein', 'Lieferschein 2 #9001', 'A', '2026-10-15T08:00:00Z'),
    mit('st1', 'storno', 'Storno #9002', 'B', '2026-10-13T08:00:00Z'),
  ];
  const { zeilen, abweichungen } = abgleich({ belege, kandidaten, jetzt: JETZT });
  const z = id => zeilen.find(x => x.id === id);
  assert.equal(z('gid://shopify/Order/9001|A').ab.id, 'ab1');
  assert.equal(z('gid://shopify/Order/9001|A').lieferschein.id, 'ls1');
  assert.equal(z('gid://shopify/Order/9001|A').ab.auszug, undefined, 'nur Kennung, nicht der ganze Beleg');
  assert.deepEqual(z('gid://shopify/Order/9002|B').hinweise, ['storno', 'shopify_weiter']);
  assert.equal(z('gid://shopify/Order/9002|A').ab, null, 'AB fehlt ist nur Information');
  assert.deepEqual(z('gid://shopify/Order/9003|B').hinweise, ['shopify_offen'], 'bei uns raus, in Shopify nicht versendet');
  assert.equal(zeilen.some(x => x.orderId === 'gid://shopify/Order/9004'), false, 'nie bestellt, kein Beleg: keine Zeile');
  assert.deepEqual(abweichungen.map(a => [a.art, a.ton]).sort(), [['lieferschein_offen', 'warn'], ['storno', 'crit']]);
  // Erledigt nimmt die Abweichung weg, der Beleg bleibt.
  belege[2].erledigt = { am: '2026-10-16', von: 'Mona' };
  assert.equal(abgleich({ belege, kandidaten, jetzt: JETZT }).abweichungen.some(a => a.art === 'storno'), false);
  assert.equal(belegMarke(belege[0]), 'AB 12.10.');
});

// --- Ablage ---------------------------------------------------------------------------------

const mail = (id, betreff, extra = {}) => ({ id, threadId: `t-${id}`, von: 'Innendienst <ab@lieferant-a.example>', datum: '2026-10-14T08:00:00Z', betreff, text: 'Anbei.', anhaenge: [], quelle: 'label', viewUrl: `https://mail.google.com/mail/u/0/#all/${id}`, ...extra });
const ordner = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-belege-'));

test('uebernehmen: jede Mail einmal, Nicht-Belege gemerkt, Stichwortsuche nur von bekannten Lieferanten', () => {
  const dir = ordner();
  const e1 = uebernehmen([
    mail('m1', 'Auftragsbestätigung 4711 #9001'),
    mail('m2', 'Newsletter'),
    mail('m3', 'Stornierung meiner Bestellung', { von: 'kunde@gmail.com', quelle: 'stichwort' }),
    mail('m4', 'Leider nicht lieferbar', { von: 'innendienst@lieferant-a.example', quelle: 'stichwort' }),
    mail('m5', 'Lieferschein 1', { viewUrl: 'https://boese.example/x' }),
  ], { privatDir: dir, jetzt: JETZT, lieferantenDomains: ['lieferant-a.example'], lauf: { bereiche: ['label', 'stichwort'] } });
  assert.deepEqual(e1.neu.map(n => [n.mailId, n.art]), [['m1', 'ab'], ['m4', 'storno'], ['m5', 'lieferschein']]);
  assert.deepEqual(e1.uebersprungen.map(u => u.mailId), ['m2', 'm3']);
  const d = leseBelege(lieferbelegePfad(dir));
  assert.equal(d.belege.m5.viewUrl, null, 'nur Links ins Postfach');
  assert.equal(d.belege.m1.refs.betreffNummern[0], '#9001');
  assert.equal(d.laeufe.length, 1);
  const e2 = uebernehmen([mail('m1', 'Auftragsbestätigung 4711 #9001'), mail('m2', 'Newsletter')], { privatDir: dir, jetzt: JETZT });
  assert.equal(e2.neu.length + e2.uebersprungen.length, 0, 'schon bekannt');
  const b = bekannt({ privatDir: dir, domains: ['lieferant-b.example'] });
  assert.deepEqual(b.mailIds, ['m1', 'm2', 'm4', 'm5'], 'm3 (unbekannter Absender) bietet der Lauf erneut an');
  assert.deepEqual(b.domains, ['lieferant-a.example', 'lieferant-b.example']);
  assert.equal(b.letzterLauf, JETZT.toISOString());
  assert.equal((fs.statSync(lieferbelegePfad(dir)).mode & 0o777).toString(8), '600');
});

test('Ablage: beschaedigte Datei ist ein Fehler (nie still leer), alte Sperre wird geraeumt', () => {
  const dir = ordner();
  const datei = lieferbelegePfad(dir);
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, '{ kaputt');
  assert.throws(() => leseBelege(datei), LieferbelegFehler);
  assert.throws(() => uebernehmen([mail('m1', 'AB 1')], { privatDir: dir }), LieferbelegFehler);
  assert.equal(fs.readFileSync(datei, 'utf8'), '{ kaputt', 'nicht ueberschrieben');
  fs.rmSync(datei);
  fs.writeFileSync(`${datei}.lock`, '');
  const alt = new Date(Date.now() - 60_000);
  fs.utimesSync(`${datei}.lock`, alt, alt);
  assert.equal(uebernehmen([mail('m1', 'Auftragsbestätigung 1')], { privatDir: dir }).neu.length, 1);
  assert.equal(fs.existsSync(`${datei}.lock`), false);
});

test('entscheide: zuordnen nur auf bekannte Bestellungen, Passt nicht sammelt, Absender kein Shop', () => {
  const dir = ordner();
  const datei = lieferbelegePfad(dir);
  uebernehmen([mail('m1', 'Auftragsbestätigung 4711 Kommission Beispiel')], { privatDir: dir, jetzt: JETZT });
  const opt = { person: 'Mona', jetzt: JETZT, gueltigeOrderIds: new Set(['gid://shopify/Order/9001']) };
  assert.throws(() => entscheide(datei, { aktion: 'zuordnen', mailId: 'm1', orderIds: ['gid://shopify/Order/1'] }, opt), /nicht gefunden/);
  assert.throws(() => entscheide(datei, { aktion: 'loeschen', mailId: 'm1' }, opt), /Unbekannte Aktion/);
  assert.throws(() => entscheide(datei, { aktion: 'erledigt', mailId: 'm1' }, { jetzt: JETZT }), /Person/);
  entscheide(datei, { aktion: 'ablehnen', mailId: 'm1', orderIds: ['a'] }, opt);
  entscheide(datei, { aktion: 'ablehnen', mailId: 'm1', orderIds: ['b'] }, opt);
  assert.deepEqual(leseBelege(datei).belege.m1.entscheidung.orderIds, ['a', 'b']);
  const z = entscheide(datei, { aktion: 'zuordnen', mailId: 'm1', orderIds: ['gid://shopify/Order/9001'] }, opt);
  assert.equal(z.beleg.entscheidung.von, 'Mona');
  entscheide(datei, { aktion: 'erledigt', mailId: 'm1', notiz: 'geprüft' }, opt);
  assert.equal(leseBelege(datei).belege.m1.erledigt.notiz, 'geprüft');
  entscheide(datei, { aktion: 'absender_kein_shop', domain: 'Lager.Example' }, opt);
  assert.equal(leseBelege(datei).absender['lager.example'].art, 'kein_shop');
  assert.throws(() => entscheide(datei, { aktion: 'absender_kein_shop', domain: 'kein domain' }, opt), /Domain/);
  entscheide(datei, { aktion: 'absender_zuruecksetzen', domain: 'lager.example' }, opt);
  assert.deepEqual(leseBelege(datei).absender, {});
});

// --- API und Server -------------------------------------------------------------------------

const mf = (namespace, key, value) => ({ namespace, key, value });
const position = (id, lieferant) => ({
  id: `gid://shopify/LineItem/${id}`, sku: `TEST-${lieferant}-${id}`, title: `Testware ${lieferant}`, variantTitle: 'Natur', quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [], originalUnitPriceSet: { shopMoney: { amount: '10.00', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/${id}`, sku: `TEST-${lieferant}-${id}`, title: 'Natur', metafields: { nodes: [mf('einkauf', 'lieferant', lieferant)] }, lieferant: { nodes: [] },
    product: { id: `gid://shopify/Product/${id}`, handle: `testware-${id}`, title: `Testware ${lieferant}`, metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
});
const bestellung = (nr, kunde, positionen) => ({
  id: `gid://shopify/Order/${nr}`, name: `#${nr}`, createdAt: '2026-10-10T10:00:00Z', cancelledAt: null, test: false,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
  customer: { id: `gid://shopify/Customer/${nr}`, displayName: kunde, email: `kunde${nr}@example.invalid` },
  totalPriceSet: { shopMoney: { amount: '10.00', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: positionen },
});

function privat() {
  const dir = ordner();
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [
    bestellung(9001, 'Erika Beispiel', [position(1, 'A')]),
    bestellung(9002, 'Max Mustermann', [position(2, 'B')]),
  ] }));
  fs.mkdirSync(path.join(dir, 'lieferanten'), { recursive: true });
  fs.copyFileSync(new URL('../../../operations/lib/lieferanten.beispiel.json', import.meta.url), path.join(dir, 'lieferanten', 'stammdaten.json'));
  uebernehmen([
    mail('m1', 'Auftragsbestätigung 4711 #9001'),
    mail('m2', 'Auftragsbestätigung 4712 Kommission Mustermann', { von: 'ab@unbekannt.example' }),
    mail('m3', 'Lieferschein 99 #9001', { datum: '2026-10-15T08:00:00Z' }),
  ], { privatDir: dir, jetzt: JETZT, lieferantenDomains: ['lieferant-a.example'] });
  return dir;
}
const apiFuer = dir => createApi({ gh: async () => '', root: dir, privatDirPath: dir, env: {}, now: () => JETZT });

test('einkaufBelege: Lieferant aus der Absenderdomain, sicher/Vorschlag, Abgleich, Auswahl', () => {
  const dir = privat();
  const r = apiFuer(dir).einkaufBelege();
  assert.equal(r.verfuegbar, true);
  const b = id => r.belege.find(x => x.id === id);
  assert.equal(b('m1').lieferant, 'A');
  assert.equal(b('m1').zuordnung.stufe, 'sicher');
  assert.equal(b('m2').lieferant, null);
  assert.equal(b('m2').zuordnung.stufe, 'vorschlag', 'nur der Name - Mensch bestaetigt');
  assert.equal(r.belege[0].id, 'm3', 'neueste zuerst');
  const zeile = r.zeilen.find(z => z.orderId === 'gid://shopify/Order/9001');
  assert.equal(zeile.ab.id, 'm1');
  assert.equal(zeile.lieferschein.id, 'm3');
  assert.equal(r.auftraege['gid://shopify/Order/9001'].orderName, '#9001');
  assert.ok(r.auftraege['gid://shopify/Order/9002'], 'auch der Vorschlag nennt seine Bestellung');
  assert.deepEqual(r.auswahl.map(a => a.orderName).sort(), ['#9001', '#9002']);
  assert.equal(r.lieferanten.A, 'Lieferant A');
  assert.equal(r.letzterLauf.neu, 3);
});

test('einkaufBelege: alte Domain aus einem Anzeigenamen wird beim Lesen aus der echten Adresse abgeleitet', () => {
  const dir = privat();
  const file = lieferbelegePfad(dir);
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  d.belege.m1.von = '"shared@lieferant-a.example" <bestellung.a@gmail.com>';
  d.belege.m1.domain = 'lieferant-a.example';
  fs.writeFileSync(file, JSON.stringify(d));
  const vorher = fs.readFileSync(file, 'utf8');
  const b = apiFuer(dir).einkaufBelege().belege.find(x => x.id === 'm1');
  assert.equal(b.domain, 'gmail.com');
  assert.equal(b.lieferant, null);
  assert.equal(b.zuordnung.stufe, 'vorschlag');
  assert.equal(fs.readFileSync(file, 'utf8'), vorher, 'keine Migration oder Schreibaktion');
});

test('einkaufBelegSetzen: Vorschlag annehmen, unbekannte Bestellung 400, beschaedigte Ablage meldet sich', () => {
  const dir = privat();
  const api = apiFuer(dir);
  const ich = { name: 'Mona Mitarbeiter', rolle: 'mitarbeiter' };
  const r = api.einkaufBelegSetzen({ aktion: 'zuordnen', mailId: 'm2', orderIds: ['gid://shopify/Order/9002'] }, ich);
  assert.equal(r.belege.find(x => x.id === 'm2').zuordnung.stufe, 'bestaetigt');
  assert.ok(r.zeilen.some(z => z.orderId === 'gid://shopify/Order/9002'), 'jetzt im Abgleich');
  assert.throws(() => api.einkaufBelegSetzen({ aktion: 'zuordnen', mailId: 'm2', orderIds: ['gid://shopify/Order/1'] }, ich), e => e.status === 400);
  fs.writeFileSync(lieferbelegePfad(dir), '{ kaputt');
  const kaputt = api.einkaufBelege();
  assert.equal(kaputt.verfuegbar, false);
  assert.match(kaputt.hinweis, /beschädigt/);
});

test('einkaufBelege: fehlender oder beschaedigter Bestellexport ist keine leere Arbeitsliste', () => {
  const dir = privat();
  const datei = path.join(dir, 'bestelluebersicht', 'orders.json');
  const ablage = lieferbelegePfad(dir);
  const vorher = fs.readFileSync(ablage, 'utf8');
  fs.rmSync(datei);
  const fehlt = apiFuer(dir).einkaufBelege();
  assert.equal(fehlt.verfuegbar, false);
  assert.equal(fehlt.fehler, true);
  assert.match(fehlt.hinweis, /Bestelldaten|orders\.json/);
  fs.writeFileSync(datei, '{');
  const kaputt = apiFuer(dir).einkaufBelege();
  assert.equal(kaputt.verfuegbar, false);
  assert.equal(kaputt.fehler, true);
  assert.ok(kaputt.hinweis);
  assert.equal(fs.readFileSync(ablage, 'utf8'), vorher, 'Belegablage bleibt unveraendert');
});

test('einkaufBelege: GraphQL-Export verlangt ein nodes-Array, echte leere Exporte bleiben verfuegbar', () => {
  const dir = privat();
  const datei = path.join(dir, 'bestelluebersicht', 'orders.json');
  for (const daten of [{ data: { orders: {} } }, { data: { orders: { nodes: null } } },
    { data: { orders: { nodes: {} } } }, { data: { orders: {} }, orders: [] }]) {
    fs.writeFileSync(datei, JSON.stringify(daten));
    const r = apiFuer(dir).einkaufBelege();
    assert.equal(r.verfuegbar, false, JSON.stringify(daten));
    assert.equal(r.fehler, true);
    assert.ok(r.hinweis);
  }
  for (const daten of [[], { orders: [] }, { orders: { nodes: [] } }, { data: { orders: { nodes: [] } } }]) {
    fs.writeFileSync(datei, JSON.stringify(daten));
    assert.equal(apiFuer(dir).einkaufBelege().verfuegbar, true, JSON.stringify(daten));
  }
});

async function mitServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: Rolle "lesen" darf lesen, aber nicht entscheiden (403); Mitarbeiter 200', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const dir = privat();
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, path.join(dir, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = dir;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=lieferbelege');
  delete process.env.TP_DASHBOARD_PASSWORT;
  try {
    await mitServer(mod.requestHandler, async (base) => {
      const anmelden = async (name, passwort) => {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort }) });
        assert.equal(r.status, 200);
        return r.headers.get('set-cookie').split(';')[0];
      };
      const post = (keks, rumpf) => fetch(`${base}/api/einkauf/belege`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: JSON.stringify(rumpf) });
      const lena = await anmelden('lena', 'platzhalter-lesen-1');
      const mona = await anmelden('mona', 'platzhalter-mitarbeiter-1');
      const gelesen = await fetch(`${base}/api/einkauf/belege`, { headers: { cookie: lena } });
      assert.equal(gelesen.status, 200);
      assert.equal((await gelesen.json()).belege.length, 3);
      assert.equal((await post(lena, { aktion: 'erledigt', mailId: 'm3' })).status, 403);
      const r = await post(mona, { aktion: 'erledigt', mailId: 'm3' });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).belege.find(b => b.id === 'm3').erledigt.von, 'Mona Mitarbeiter', 'Person aus der Sitzung');
      assert.equal((await post(mona, { aktion: 'erledigt', mailId: 'gibtsnicht' })).status, 400);
    });
  } finally {
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
  }
});

test('belegArbeit/belegTodos: Storno rot, Lieferschein gelb, eine Sammelzeile fuer Vorschlaege; ohne Bestellung, Rechnungen und Altes zaehlen nicht', async () => {
  const { belegArbeit, belegTodos } = await import('../lib/lieferbelege.mjs');
  const b = (id, stufe, extra = {}) => ({ id, art: 'ab', datum: '2026-10-14T08:00:00Z', erledigt: null, zuordnung: { stufe, orderIds: [] }, ...extra });
  const d = {
    verfuegbar: true, lieferanten: { A: 'Lieferant A' },
    belege: [b('v1', 'vorschlag'), b('o1', 'keine'), b('o2', 'keine', { art: 'rechnung' }), b('o3', 'keine', { datum: '2026-08-01T08:00:00Z' }), b('o4', 'keine', { erledigt: { von: 'Mona' } }), b('s1', 'sicher')],
    abweichungen: [
      { id: 'storno:s1:x', art: 'storno', ton: 'crit', orderName: '#9002', kundenname: 'Max Mustermann', lieferant: 'A', datum: '2026-10-13T08:00:00Z' },
      { id: 'lieferschein:l1:y', art: 'lieferschein_offen', ton: 'warn', orderName: '#9001', kundenname: null, lieferant: 'A', datum: '2026-10-15T08:00:00Z' },
    ],
  };
  const a = belegArbeit(d, { jetzt: JETZT });
  assert.deepEqual([a.vorschlaege.length, a.ohne.length, a.summe], [1, 1, 3], 'ohne Bestellung zaehlt nicht als Pruefarbeit');
  const t = belegTodos(d, { jetzt: JETZT });
  assert.deepEqual(t.map(x => [x.art, x.ton]), [['beleg_storno', 'crit'], ['beleg_lieferschein', 'warn'], ['belege_zuordnen', '']]);
  assert.equal(t[0].titel, 'Storno vom Lieferanten: #9002 Max Mustermann');
  assert.match(t[1].kontext, /Lieferant A · LS 15\.10\./);
  assert.equal(t[2].titel, 'Lieferantenbeleg zuordnen');
  assert.ok(t.every(x => x.knopf.href === '#/einkauf?tab=belege' && x.bereich === 'laden'));
  assert.deepEqual(belegTodos({ verfuegbar: false }), []);
});

test('ordneZu: notierte Lieferanten-Bestellnummer - ganz sicher, nur der letzte Teil Vorschlag', () => {
  const mitNotiz = notiz => kandidatenAus([zeile(9001, 'Erika Beispiel', ['A']), zeile(9002, 'Max Mustermann', ['A'])],
    { 'gid://shopify/Order/9001::gid://shopify/LineItem/90010': { status: 'bestellt', lieferantBestellnummer: notiz } });
  const r = ordneZu(beleg('Auftr.-Best. KD050/0198 NACHLIEFERUNG'), mitNotiz('KD050/0198 Liefertermin KW 42'));
  assert.equal(r.stufe, 'sicher');
  assert.deepEqual(r.orderIds, ['gid://shopify/Order/9001']);
  assert.equal(ordneZu(beleg('Auftr.-Best. KD050/0198 NACHLIEFERUNG'), mitNotiz('0198 / Liefertermin KW 42')).stufe, 'vorschlag', 'nur der letzte Teil notiert');
  assert.equal(ordneZu(beleg('Auftr.-Best. KD999/0198 NACHLIEFERUNG'), mitNotiz('KD050/0198')).stufe, 'vorschlag', 'anderer Vorgang mit gleicher Endnummer ist nie sicher');
  assert.equal(ordneZu(beleg('Auftr.-Best. KD050/0198', { lieferant: 'B' }), mitNotiz('KD050/0198')).stufe, 'keine', 'nur beim selben Lieferanten');
});

test('ordneAlleZu: Lieferschein erbt die Bestellung seiner AB (gleiche Vorgangsnummer), Mailverlauf nur als Vorschlag', async () => {
  const { ordneAlleZu, nummernSchluessel } = await import('../lib/lieferbelege.mjs');
  assert.equal(nummernSchluessel('KD050/0212'), nummernSchluessel('KD050_212'));
  assert.equal(nummernSchluessel('12'), null, 'zu kurz zum Verknuepfen');
  assert.equal(nummernSchluessel('14.10'), null, 'ein Datum verknuepft nichts');
  const mit = (id, betreff, extra = {}) => ({ id, art: 'ab', datum: '2026-10-14T08:00:00Z', lieferant: 'A', domain: 'lieferant-a.example', threadId: `t-${id}`, refs: referenzen({ betreff }), ...extra });
  const r = ordneAlleZu([
    mit('ab', 'Auftr.-Best. KD050/0212 #9001'),
    mit('ls', 'Lieferschein Kunde/Vorgang KD050_212, Betreff: BEISPIEL', { art: 'lieferschein', datum: '2026-10-15T08:00:00Z' }),
    mit('aw', 'AW: Rückfrage', { threadId: 't-ab' }),
    mit('fremd', 'Lieferschein Kunde/Vorgang KD050_212', { art: 'lieferschein', domain: 'andere.example', lieferant: null }),
    mit('nein', 'Lieferschein Vorgang KD050_212', { art: 'lieferschein', entscheidung: { art: 'abgelehnt', orderIds: ['gid://shopify/Order/9001'] } }),
  ], KANDIDATEN);
  const z = id => r.find(b => b.id === id).zuordnung;
  assert.equal(z('ab').stufe, 'sicher');
  assert.deepEqual([z('ls').stufe, z('ls').orderIds[0]], ['sicher', 'gid://shopify/Order/9001']);
  assert.match(z('ls').grund, /gleicher Vorgang wie AB 14\.10\./);
  assert.equal(z('aw').stufe, 'vorschlag');
  assert.equal(z('fremd').stufe, 'keine', 'anderer Absender');
  assert.equal(z('nein').stufe, 'keine', '"Passt nicht" gilt auch fuer die Verknuepfung');
});

test('ordneAlleZu: widerspruechliche Anker oder eigene andere Bestellnummer - nie sicher', async () => {
  const { ordneAlleZu } = await import('../lib/lieferbelege.mjs');
  const mit = (id, betreff, extra = {}) => ({ id, art: 'ab', datum: '2026-10-14T08:00:00Z', lieferant: 'A', domain: 'lieferant-a.example', threadId: `t-${id}`, refs: referenzen({ betreff }), ...extra });
  const zwei = ordneAlleZu([
    mit('ab1', 'Auftr.-Best. KD050/0212 #9001'),
    mit('ab2', 'Auftr.-Best. KD050/0212 #9002'),
    mit('ls', 'Lieferschein Vorgang KD050_212', { art: 'lieferschein' }),
  ], KANDIDATEN);
  assert.equal(zwei.find(b => b.id === 'ls').zuordnung.stufe, 'keine', 'zwei Anker, zwei Bestellungen');
  const anders = ordneAlleZu([
    mit('ab1', 'Auftr.-Best. KD050/0212 #9001'),
    mit('ls', 'Lieferschein Vorgang KD050_212 zu #9002', { art: 'lieferschein' }),
  ], KANDIDATEN);
  assert.notEqual(anders.find(b => b.id === 'ls').zuordnung.grund, 'gleicher Vorgang wie AB 14.10.', 'eigene Nummer #9002 widerspricht dem Anker');
  const spaet = ordneAlleZu([
    mit('ab1', 'Auftr.-Best. KD050/0212 #9001'),
    mit('ls', 'Lieferschein Vorgang KD050_212', { art: 'lieferschein', datum: '2027-06-01T08:00:00Z' }),
  ], KANDIDATEN);
  assert.equal(spaet.find(b => b.id === 'ls').zuordnung.stufe, 'keine', 'Monate spaeter: anderer Vorgang mit gleicher Nummer');
});

test('ordneAlleZu: Freemail-Vorgang nur bei derselben vollstaendigen Adresse, nie nur gleicher Domain', async () => {
  const { ordneAlleZu, adresseVon } = await import('../lib/lieferbelege.mjs');
  assert.equal(adresseVon(' Lieferant A <  BESTELLUNG.A@gmail.com  > '), 'bestellung.a@gmail.com');
  assert.equal(adresseVon('Lieferant A'), null);
  const ab = { id: 'ab', art: 'ab', datum: '2026-10-14T08:00:00Z', lieferant: null, domain: 'gmail.com',
    von: 'Lieferant A <  BESTELLUNG.A@gmail.com  >', refs: referenzen({ betreff: 'AB 123456' }),
    entscheidung: { art: 'zugeordnet', orderIds: ['gid://shopify/Order/9001'], lieferant: 'A' } };
  const ls = von => ({ id: 'ls', art: 'lieferschein', datum: '2026-10-15T08:00:00Z', lieferant: null, domain: 'gmail.com',
    von, refs: referenzen({ betreff: 'Lieferschein 123456' }) });
  const zuordnung = (anker, folge) => ordneAlleZu([anker, folge], KANDIDATEN)[1].zuordnung;
  assert.equal(zuordnung(ab, ls('bestellung.b@gmail.com')).stufe, 'keine', 'anderes Postfach ist kein sicherer Vorgang');
  assert.equal(zuordnung(ab, ls(' bestellung.a@GMAIL.COM ')).stufe, 'sicher', 'dieselbe Adresse ohne Anzeigename, andere Schreibweise');
  assert.equal(zuordnung(ab, ls('Lieferant A')).stufe, 'keine', 'fehlende Adresse bestaetigt nichts');
  assert.equal(zuordnung({ ...ab, von: null }, ls('bestellung.a@gmail.com')).stufe, 'keine', 'Anker ohne Adresse reicht nicht');
  assert.equal(zuordnung({ ...ab, domain: null }, { ...ls(null), domain: null }).stufe, 'keine', 'fehlende Domains sind kein gemeinsamer Absender');
});

test('From: Adresse im Anzeigenamen verknuepft keine fremden Postfaecher; ungueltige und mehrdeutige Angaben sind unbrauchbar', async () => {
  const { ordneAlleZu, adresseVon } = await import('../lib/lieferbelege.mjs');
  const a = '"shared@gmail.com" <bestellung.a@gmail.com>';
  const b = '"shared@gmail.com" <bestellung.b@gmail.com>';
  assert.equal(adresseVon(a), 'bestellung.a@gmail.com');
  assert.equal(adresseVon(b), 'bestellung.b@gmail.com');
  assert.equal(domainVon('"shared@lieferant-a.example" <bestellung.a@gmail.com>'), 'gmail.com', 'auch Lieferantenzuordnung nutzt das tatsaechliche Postfach');
  for (const ungueltig of ['a@gmail.com, b@gmail.com', 'Name <a@gmail.com> <b@gmail.com>', 'Name <a@gmail.com', 'a..b@gmail.com', 'a@-gmail.com']) {
    assert.equal(adresseVon(ungueltig), null, ungueltig);
    assert.equal(domainVon(ungueltig), null, ungueltig);
  }
  const r = ordneAlleZu([
    { id: 'ab', art: 'ab', datum: '2026-10-14T08:00:00Z', lieferant: null, domain: domainVon(a), von: a,
      refs: referenzen({ betreff: 'AB 123456' }), entscheidung: { art: 'zugeordnet', orderIds: ['gid://shopify/Order/9001'] } },
    { id: 'ls', art: 'lieferschein', datum: '2026-10-15T08:00:00Z', lieferant: null, domain: domainVon(b), von: b,
      refs: referenzen({ betreff: 'Lieferschein 123456' }) },
  ], KANDIDATEN);
  assert.equal(r[1].zuordnung.stufe, 'keine');
  const alt = r.map((b, i) => ({ ...b, von: i ? '"shared@lieferant-a.example" <bestellung.b@gmail.com>' : '"shared@lieferant-a.example" <bestellung.a@gmail.com>', domain: 'lieferant-a.example' }));
  assert.equal(ordneAlleZu(alt, KANDIDATEN)[1].zuordnung.stufe, 'keine', 'frueher falsch gespeicherte Domain hebt den Adressvergleich nicht auf');
});

test('abgleich: zwei Stornos - einer erledigt, der andere bleibt; Quittung je Auftrag; Shopify je Lieferant; unbekannter Absender', () => {
  const statusAlle = { 'gid://shopify/Order/9002::gid://shopify/LineItem/90020': { status: 'raus' }, 'gid://shopify/Order/9002::gid://shopify/LineItem/90021': { status: 'bestellt' } };
  const roh = zeile(9002, 'Max Mustermann', ['A', 'B'], { fulfillment: 'PARTIALLY_FULFILLED' });
  roh.auftrag.positionen[0].menge = 0; // A in Shopify versendet
  roh.auftrag.positionen[1].menge = 2; // B offen, nichts davon versendet
  roh.auftrag.positionen[1].mengeBestellt = 2;
  const kandidaten = kandidatenAus([roh, zeile(9001, 'Erika Beispiel', ['A'])], statusAlle);
  const fest = (id, art, datum, extra = {}) => ({ id, art, datum, lieferant: 'B', domain: 'lieferant-b.example', refs: {}, erledigt: null, zuordnung: { stufe: 'bestaetigt', orderIds: ['gid://shopify/Order/9002'] }, ...extra });
  const belege = [
    fest('s-alt', 'storno', '2026-10-12T08:00:00Z'),
    fest('s-neu', 'storno', '2026-10-14T08:00:00Z', { erledigt: { von: 'Mona' } }),
    // Sammelbeleg ohne bekannten Absender fuer zwei Bestellungen, fuer #9001 quittiert
    fest('sammel', 'storno', '2026-10-13T08:00:00Z', { lieferant: null, domain: 'fremd.example', zuordnung: { stufe: 'bestaetigt', orderIds: ['gid://shopify/Order/9002', 'gid://shopify/Order/9001'] }, quittiert: { 'gid://shopify/Order/9001': { von: 'Mona' } } }),
  ];
  const { zeilen, abweichungen } = abgleich({ belege, kandidaten, jetzt: JETZT });
  assert.deepEqual(abweichungen.filter(a => a.orderId === 'gid://shopify/Order/9002').map(a => a.belegId), ['s-alt', 'sammel'],
    'der aeltere offene Storno bleibt sichtbar; der Sammelbeleg ohne Lieferant haengt an keiner Zeile, bleibt aber eine Abweichung');
  assert.equal(abweichungen.find(a => a.belegId === 'sammel').lieferant, null);
  assert.equal(zeilen.some(z => z.belege.includes('sammel') && z.orderId === 'gid://shopify/Order/9002'), false, 'nicht bei beiden Lieferanten verdoppelt');
  assert.equal(abweichungen.some(a => a.orderId === 'gid://shopify/Order/9001'), false, 'fuer #9001 quittiert (einziger Lieferant, also zugeordnet)');
  const a = zeilen.find(z => z.id === 'gid://shopify/Order/9002|A');
  assert.equal(a.shopify, 'FULFILLED', 'A ist in Shopify raus, auch wenn die Bestellung nur teilweise versendet ist');
  assert.deepEqual(a.hinweise, []);
  assert.equal(zeilen.find(z => z.id === 'gid://shopify/Order/9002|B').shopify, 'UNFULFILLED');
});

test('Ablage: leere oder unvollstaendige Datei ist ein Schaden, lebende Sperre wird nicht uebernommen', () => {
  const dir = ordner();
  const datei = lieferbelegePfad(dir);
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  for (const roh of ['', '{}', '{"version":1,"belege":null,"absender":{},"geprueft":{},"laeufe":[]}']) {
    fs.writeFileSync(datei, roh);
    assert.throws(() => leseBelege(datei), LieferbelegFehler, `"${roh}" darf nicht als leer gelten`);
  }
  fs.rmSync(datei);
  // Sperre eines lebenden Prozesses (dieser Test), auch wenn sie alt aussieht: warten, dann Fehler.
  fs.writeFileSync(`${datei}.lock`, JSON.stringify({ pid: process.pid, kennung: 'fremd' }));
  const alt = new Date(Date.now() - 60_000);
  fs.utimesSync(`${datei}.lock`, alt, alt);
  assert.throws(() => uebernehmen([mail('m1', 'Auftragsbestätigung 1')], { privatDir: dir }), /gesperrt/);
  assert.equal(JSON.parse(fs.readFileSync(`${datei}.lock`, 'utf8')).kennung, 'fremd', 'fremde Sperre bleibt');
  fs.rmSync(`${datei}.lock`);
});

test('uebernehmen: Storno von einer Unterdomain des Lieferanten; Zurueckgestelltes wird spaeter uebernommen', () => {
  const dir = ordner();
  const storno = mail('s1', 'Leider nicht lieferbar', { von: 'versand@lager.lieferant-a.example', quelle: 'stichwort' });
  assert.equal(uebernehmen([storno], { privatDir: dir, jetzt: JETZT, lieferantenDomains: ['lieferant-a.example'] }).neu.length, 1);
  const fremd = mail('s2', 'Leider nicht lieferbar', { von: 'info@lieferant-b.example', quelle: 'stichwort' });
  assert.equal(uebernehmen([fremd], { privatDir: dir, jetzt: JETZT, lieferantenDomains: ['lieferant-a.example'] }).neu.length, 0);
  assert.equal(uebernehmen([fremd], { privatDir: dir, jetzt: JETZT, lieferantenDomains: ['lieferant-a.example', 'lieferant-b.example'] }).neu.length, 1, 'jetzt bekannt');
  assert.equal(leseBelege(lieferbelegePfad(dir)).geprueft.s2, undefined);
});

test('Nachpruefung #1432: nackte Belegnummer, abweichende eigene Nummern, Teilversand je Position', async () => {
  const { nummerNotiert, ordneAlleZu } = await import('../lib/lieferbelege.mjs');
  assert.equal(nummerNotiert('KD050/0198 Lieferung 2026', '2026'), 'teil', 'Jahreszahl in der Notiz ist kein Treffer');
  assert.equal(nummerNotiert('2026', '2026'), 'voll');
  assert.equal(nummerNotiert('AB 123456', '123456'), 'voll', 'Buchstaben davor stoeren nicht');
  assert.equal(nummerNotiert('KD050/0198', 'KD050/0198'), 'voll');

  const mit = (id, betreff, extra = {}) => ({ id, art: 'ab', datum: '2026-10-14T08:00:00Z', lieferant: 'A', domain: 'lieferant-a.example', threadId: `t-${id}`, refs: referenzen({ betreff }), ...extra });
  const r = ordneAlleZu([
    mit('ab', 'Auftr.-Best. KD050/0212 #9001 #9002'),
    mit('ls', 'Lieferschein Vorgang KD050_212 #9001 #9999', { art: 'lieferschein' }),
  ], KANDIDATEN);
  assert.equal(r.find(b => b.id === 'ab').zuordnung.stufe, 'sicher');
  const ls = r.find(b => b.id === 'ls').zuordnung;
  assert.equal(ls.stufe, 'vorschlag', 'eigene Nummern #9001/#9999 sind nicht die des Ankers #9001/#9002');
  assert.deepEqual(ls.orderIds, ['gid://shopify/Order/9001']);

  const roh = zeile(9002, 'Max Mustermann', ['A', 'B'], { fulfillment: 'PARTIALLY_FULFILLED' });
  Object.assign(roh.auftrag.positionen[0], { menge: 5, mengeBestellt: 10 }); // A: halb raus
  Object.assign(roh.auftrag.positionen[1], { menge: 2 }); // B: bestellte Menge unbekannt (alter Export)
  const kandidaten = kandidatenAus([roh], {
    'gid://shopify/Order/9002::gid://shopify/LineItem/90020': { status: 'bestellt' },
    'gid://shopify/Order/9002::gid://shopify/LineItem/90021': { status: 'bestellt' },
  });
  const { zeilen } = abgleich({ belege: [], kandidaten, jetzt: JETZT });
  assert.equal(zeilen.find(z => z.lieferant === 'A').shopify, 'PARTIALLY_FULFILLED', '10 bestellt, 5 offen');
  assert.equal(zeilen.find(z => z.lieferant === 'B').shopify, 'PARTIALLY_FULFILLED', 'ohne bestellte Menge gilt der Stand der Bestellung');
});

test('Nachpruefung #1432: Lieferant beim Zuordnen - Pflicht bei unbekanntem Absender und mehreren, nur passende', () => {
  const dir = privat();
  const quelle = path.join(dir, 'bestelluebersicht', 'orders.json');
  const daten = JSON.parse(fs.readFileSync(quelle, 'utf8'));
  daten.orders.push(bestellung(9003, 'Lena Schwarz', [position(3, 'A'), position(4, 'B')]));
  fs.writeFileSync(quelle, JSON.stringify(daten));
  const api = apiFuer(dir);
  const ich = { name: 'Mona Mitarbeiter', rolle: 'mitarbeiter' };
  const o = nr => `gid://shopify/Order/${nr}`;
  // m2 kommt von einem unbekannten Absender
  assert.throws(() => api.einkaufBelegSetzen({ aktion: 'zuordnen', mailId: 'm2', orderIds: [o(9003)] }, ich), e => e.status === 400 && /von welchem Lieferanten/.test(e.message));
  assert.throws(() => api.einkaufBelegSetzen({ aktion: 'zuordnen', mailId: 'm2', orderIds: [o(9001)], lieferant: 'B' }, ich), e => e.status === 400 && /liefert für die gewählte Bestellung nichts/.test(e.message));
  const r = api.einkaufBelegSetzen({ aktion: 'zuordnen', mailId: 'm2', orderIds: [o(9003)], lieferant: 'B' }, ich);
  assert.deepEqual(r.zeilen.find(z => z.id === `${o(9003)}|B`).belege, ['m2']);
  assert.equal(r.zeilen.find(z => z.id === `${o(9003)}|A`)?.belege.includes('m2') ?? false, false);
  // Bekannter Absender (m1, Lieferant A): keine Rueckfrage noetig
  assert.ok(api.einkaufBelegSetzen({ aktion: 'zuordnen', mailId: 'm1', orderIds: [o(9003)] }, ich).ok);
});

test('Nachpruefung #1432: verwaiste Sperre raeumt nur, wer die Raeum-Sperre hat; liegengebliebene Raeum-Sperre verfaellt', () => {
  const dir = ordner();
  const datei = lieferbelegePfad(dir);
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const alt = new Date(Date.now() - 60_000);
  const verwaist = () => {
    fs.writeFileSync(`${datei}.lock`, JSON.stringify({ pid: 2 ** 22 + 4711, kennung: 'tot' }));
    fs.utimesSync(`${datei}.lock`, alt, alt);
  };
  // Ein anderer raeumt gerade (frische Raeum-Sperre): nicht dazwischen loeschen, sondern warten.
  verwaist();
  fs.writeFileSync(`${datei}.lock.raeumen`, '');
  assert.throws(() => uebernehmen([mail('m1', 'Auftragsbestätigung 1')], { privatDir: dir }), /gesperrt/);
  assert.equal(JSON.parse(fs.readFileSync(`${datei}.lock`, 'utf8')).kennung, 'tot');
  // Raeum-Sperre aus einem Absturz (alt): verfaellt, dann wird geraeumt und geschrieben.
  fs.utimesSync(`${datei}.lock.raeumen`, alt, alt);
  assert.equal(uebernehmen([mail('m1', 'Auftragsbestätigung 1')], { privatDir: dir }).neu.length, 1);
  assert.equal(fs.existsSync(`${datei}.lock`), false);
  assert.equal(fs.existsSync(`${datei}.lock.raeumen`), false);
});
