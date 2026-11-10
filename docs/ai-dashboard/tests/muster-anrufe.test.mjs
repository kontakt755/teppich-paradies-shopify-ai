// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import * as anrufLib from '../lib/muster-anrufe.mjs';
import * as ideenLib from '../lib/muster-ideen.mjs';
import { kundenLinkWert } from '../lib/kunden-linkwert.mjs';
import { ANRUF_ERGEBNISSE, ANRUF_NUR_MIT_RUECKRUFWUNSCH, RUECKFRAGE_VORLAGE, musterAnrufliste, rueckfrageLink, wiedervorlageTag } from '../lib/muster-anrufe.mjs';
import { MUSTER_ALTERNATIVEN, MUSTER_VERMUTUNGEN, musterKennzahlen, vermutungGenannt } from '../lib/muster-ideen.mjs';
import { SICHERUNGSPFADE } from '../../../operations/scripts/sicherung.mjs';
import { leseMusterAnrufe, musterAnrufePfad, trageAnrufEin } from '../../../operations/lib/muster-anrufe.mjs';

// Nur erfundene Daten.
const JETZT = new Date('2026-01-20T10:00:00Z');
const vor = n => new Date(JETZT.getTime() - n * 86_400_000).toISOString();
const zeile = (nr, { tage = 6, kunde = nr, ...rest } = {}) => ({
  orderId: `o${nr}`, orderName: `#T${nr}`, auftragsart: 'muster', kundenname: `Testkunde ${kunde}`, kundenSchluessel: `email:k${kunde}@example.invalid`,
  email: `k${kunde}@example.invalid`, telefon: '–', beratungOffen: false,
  auftrag: { details: { lieferadresse: { telefon: `+4930${nr}` } }, positionen: [{ istMuster: true, titel: 'Muster Testvelours', farbe: 'Sand' }] },
  verlauf: [{ schritt: 'raus', zustand: 'erledigt', am: vor(tage) }], ...rest,
});
const eintrag = (ergebnis, extra = {}) => ({ ergebnis, aktualisiertAm: vor(1), aktualisiertVon: 'Anna', verlauf: [], ...extra });

test('Liste: erst ab 5 Tagen, nicht nach 30 Tagen, kein Test, kein Storno, kein Abgeschlossener', () => {
  const m = musterAnrufliste([
    zeile(1, { tage: 4 }), zeile(2, { tage: 5 }), zeile(3, { tage: 31 }), zeile(4, { testbestellung: true }),
    zeile(5, { storniert: true }), zeile(6, { zeitleisteAbgeschlossen: true }), zeile(7, { auftragsart: 'ware' }),
    zeile(8, { verlauf: [] }),
  ], {}, { jetzt: JETZT, nurMitWunsch: false });
  assert.deepEqual(m.anrufen.map(z => z.orderNames[0]), ['#T2']);
});

test('Liste: mehrere Musterbestellungen eines Kunden sind ein Anruf', () => {
  const m = musterAnrufliste([zeile(1, { kunde: 9, tage: 6 }), zeile(2, { kunde: 9, tage: 8 })], {}, { jetzt: JETZT, nurMitWunsch: false });
  assert.equal(m.anrufen.length, 1);
  assert.deepEqual(m.anrufen[0].orderIds, ['o1', 'o2']);
  assert.equal(m.anrufen[0].tage, 8);
});

test('Sperre § 7 UWG: ohne Rückrufwunsch verlässt die Nummer den Server nicht, E-Mail bleibt', () => {
  const m = musterAnrufliste([zeile(1), zeile(2, { beratungOffen: true })], {}, { jetzt: JETZT, nurMitWunsch: true });
  assert.deepEqual(m.anrufen.map(z => z.orderNames[0]), ['#T2']);
  assert.equal(m.anrufen[0].telefon, '+49302', 'Nummer aus der Lieferadresse');
  assert.deepEqual(m.gesperrt.map(z => z.orderNames[0]), ['#T1']);
  assert.equal(m.gesperrt[0].telefon, null);
  assert.doesNotMatch(JSON.stringify(m.gesperrt), /\+4930/);
  assert.ok(m.gesperrt[0].email);
});

test('Spalten: ohne Nummer steht auch mit Sperre bei der E-Mail, mit Nummer gesperrt nur das Ja oder Nein', () => {
  const ohne = zeile(1);
  ohne.auftrag.details.lieferadresse.telefon = null;
  const m = musterAnrufliste([ohne, zeile(2)], {}, { jetzt: JETZT, nurMitWunsch: true });
  assert.deepEqual(m.ohneNummer.map(z => [z.orderNames[0], z.hatNummer]), [['#T1', false]]);
  assert.deepEqual(m.gesperrt.map(z => [z.orderNames[0], z.hatNummer, z.telefon]), [['#T2', true, null]]);
});

test('Ohne Sperre: alle mit Nummer anrufen, ohne Nummer per E-Mail', () => {
  const ohne = zeile(1);
  ohne.auftrag.details.lieferadresse.telefon = null;
  const m = musterAnrufliste([ohne, zeile(2)], {}, { jetzt: JETZT, nurMitWunsch: false });
  assert.deepEqual(m.ohneNummer.map(z => z.orderNames[0]), ['#T1']);
  assert.deepEqual(m.anrufen.map(z => z.orderNames[0]), ['#T2']);
});

test('Abgemeldete und „Möchte keine Anrufe“ stehen nicht auf der Liste, auch nicht mit späterer Bestellung', () => {
  const m = musterAnrufliste([zeile(1), zeile(2, { kunde: 5 }), zeile(3, { kunde: 5 })], { o2: eintrag('keine_anrufe', { abgeschlossen: true }) },
    { jetzt: JETZT, nurMitWunsch: false, abgemeldet: ['K1@example.invalid'] });
  assert.equal(m.anrufen.length, 0);
  assert.equal(m.erledigt.length, 1);
});

test('Wiedervorlage: erst am Tag wieder dran, danach vorne', () => {
  const e = { o1: eintrag('ueberlegt_noch', { wiedervorlage: '2026-01-25' }), o2: eintrag('nicht_erreicht', { wiedervorlage: '2026-01-20' }) };
  const m = musterAnrufliste([zeile(1), zeile(2), zeile(3, { tage: 20 })], e, { jetzt: JETZT, nurMitWunsch: false });
  assert.deepEqual(m.spaeter.map(z => z.orderNames[0]), ['#T1']);
  assert.deepEqual(m.anrufen.map(z => z.orderNames[0]), ['#T2', '#T3']);
});

test('Gründe: je Kunde die letzte Aussage, „nicht erreicht“ zählt nicht, häufigste zuerst', () => {
  const e = {
    o1: eintrag('woanders_gekauft', { abgeschlossen: true }), o2: eintrag('woanders_gekauft', { abgeschlossen: true }),
    o3: eintrag('zu_teuer', { abgeschlossen: true, aktualisiertAm: vor(3) }), o4: eintrag('gefaellt_nicht', { abgeschlossen: true, aktualisiertAm: vor(1) }),
    o5: eintrag('nicht_erreicht'),
  };
  const m = musterAnrufliste([zeile(1), zeile(2), zeile(3, { kunde: 7 }), zeile(4, { kunde: 7 }), zeile(5)], e, { jetzt: JETZT, nurMitWunsch: false });
  assert.deepEqual(m.gruende.map(g => [g.wert, g.anzahl]), [['woanders_gekauft', 2], ['gefaellt_nicht', 1]]);
});

test('Rückfrage-Mail: nennt die Muster, keine Platzhalter, Abmelde-Satz und Firmenangaben, nichts ohne Adresse', () => {
  const m = musterAnrufliste([zeile(1)], {}, { jetzt: JETZT, nurMitWunsch: true });
  const link = rueckfrageLink(m.gesperrt[0], 'Anna');
  const text = decodeURIComponent(link);
  assert.match(text, /^mailto:k1@example\.invalid\?subject=Wie gefallen/);
  assert.match(text, /Guten Tag Testkunde 1,/);
  assert.match(text, /– Testvelours: Sand/);
  assert.match(text, /Abmelden/);
  assert.match(text, /HRB 9141/);
  assert.doesNotMatch(text, /[{}]/);
  assert.equal(rueckfrageLink({ email: null }), null);
  assert.ok(RUECKFRAGE_VORLAGE.text.includes('{Farben}'));
});

test('Sonntag rutscht auf Montag', () => {
  assert.equal(wiedervorlageTag(1, new Date(2026, 0, 24, 12)), '2026-01-26');
  assert.equal(wiedervorlageTag(1, new Date(2026, 0, 19, 12)), '2026-01-20');
});

test('Ablage: Pflichtangaben, drei Versuche enden von selbst, Notiz ohne Ergebnis ändert es nicht, kaputte Datei wirft', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-anrufe-'));
  const file = musterAnrufePfad(dir);
  assert.throws(() => trageAnrufEin(file, { orderIds: ['o1'], actor: 'Anna' }), /Ergebnis anklicken/);
  assert.throws(() => trageAnrufEin(file, { orderIds: [], ergebnis: 'zu_teuer', actor: 'Anna' }), /Bestellung fehlt/);
  assert.throws(() => trageAnrufEin(file, { orderIds: ['o1'], ergebnis: 'gibtsnicht', actor: 'Anna' }), /Unbekanntes Ergebnis/);
  for (const n of [1, 2]) {
    const e = trageAnrufEin(file, { orderIds: ['o1'], ergebnis: 'nicht_erreicht', actor: 'Anna', jetzt: JETZT }).o1;
    assert.deepEqual([e.versuche, e.abgeschlossen, e.ergebnis], [n, false, 'nicht_erreicht']);
    assert.ok(e.wiedervorlage);
  }
  const notiz = trageAnrufEin(file, { orderIds: ['o1'], notiz: 'Mailbox', actor: 'Anna', jetzt: JETZT }).o1;
  assert.deepEqual([notiz.ergebnis, notiz.versuche, notiz.notiz], ['nicht_erreicht', 2, 'Mailbox']);
  const drei = trageAnrufEin(file, { orderIds: ['o1'], ergebnis: 'nicht_erreicht', actor: 'Anna', jetzt: JETZT }).o1;
  assert.deepEqual([drei.ergebnis, drei.abgeschlossen, drei.wiedervorlage], ['versuche_aus', true, null]);
  assert.equal(leseMusterAnrufe(file).o1.verlauf.length, 4);
  fs.writeFileSync(file, '{kaputt');
  assert.throws(() => leseMusterAnrufe(file), /beschädigt/);
  assert.ok(SICHERUNGSPFADE.includes('muster-anrufe.json'));
});

test('Jedes Ergebnis ist eindeutig und bleibt offen oder schließt ab', () => {
  assert.equal(new Set(ANRUF_ERGEBNISSE.map(e => e.wert)).size, ANRUF_ERGEBNISSE.length);
  for (const e of ANRUF_ERGEBNISSE) assert.ok(Boolean(e.fertig) !== Boolean(e.tage), e.wert);
});

// ---- Server gegen die echte Zeitleiste
const muster = (id, farbe) => ({
  id: `gid://shopify/LineItem/${id}`, sku: `M-TEST-${id}`, title: 'Muster Testvelours', variantTitle: farbe, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [{ key: 'Produkt', value: 'Testvelours' }], originalUnitPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/9${id}`, sku: `M-TEST-${id}`, title: farbe, metafields: { nodes: [] }, lieferant: { nodes: [] },
    product: { id: 'gid://shopify/Product/9', handle: 'muster-testvelours', title: 'Muster Testvelours', productType: 'Musterservice', metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
});
const bestellung = (nr, kunde) => ({
  id: `gid://shopify/Order/${nr}`, name: `#T${nr}`, createdAt: '2026-01-01T10:00:00Z', cancelledAt: null,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
  customer: { id: `gid://shopify/Customer/${kunde}`, displayName: `Testkunde ${kunde}`, email: `testkunde${kunde}@example.invalid`, phone: null },
  shippingAddress: { name: `Testkunde ${kunde}`, phone: `+4930000${kunde}` },
  totalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: [muster(nr, 'Sand')] },
});
const ORDER = n => `gid://shopify/Order/${n}`;
const ANNA = { name: 'Anna', rolle: 'mitarbeiter' };

async function umgebung() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-anrufe-api-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [bestellung(1, 1), bestellung(2, 1), bestellung(3, 2)] }));
  const uhr = { jetzt: new Date('2026-01-02T10:00:00Z') };
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, now: () => uhr.jetzt });
  uhr.jetzt = new Date('2026-01-06T10:00:00Z');
  for (const n of [1, 2, 3]) {
    for (const s of ['bestellt', 'geliefert', 'raus']) await api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId: ORDER(n), schritt: s }, ANNA);
  }
  uhr.jetzt = new Date('2026-01-12T10:00:00Z');
  const verlauf = (id, s) => api.kundenBestellungen().zeilen.find(z => z.orderId === id).verlauf.find(v => v.schritt === s);
  return { dir, uhr, api, verlauf };
}

test('Server: Liste bündelt je Kunde, zeigt die Nummer der Lieferadresse, Bestellung muss eine Musterbestellung sein', async () => {
  assert.equal(ANRUF_NUR_MIT_RUECKRUFWUNSCH, false, 'am 05.11. im Chat aufgehoben, w-270');
  const { api } = await umgebung();
  const m = api.kundenMusterAnrufe();
  assert.equal(m.verfuegbar, true);
  assert.deepEqual(m.anrufen.map(z => z.orderIds.length).sort(), [1, 2]);
  assert.match(m.anrufen[0].telefon, /^\+4930000/);
  assert.equal(m.gesperrt.length, 0);
  await assert.rejects(api.kundenMusterAnrufSetzen({ orderIds: ['gid://shopify/Order/999'], ergebnis: 'zu_teuer' }, ANNA), e => e.status === 404);
  await assert.rejects(api.kundenMusterAnrufSetzen({ orderIds: [ORDER(3)] }, ANNA), e => e.status === 400);
  await assert.rejects(api.kundenMusterAnrufSetzen({ orderIds: [ORDER(3)], ergebnis: 'zu_teuer' }, { name: 'Lena', rolle: 'lesen' }), e => e.status === 403);
});

test('Server: „woanders gekauft“ schließt beide Bestellungen des Kunden und beendet die Nachfrage-Mails', async () => {
  const { api, verlauf } = await umgebung();
  const r = await api.kundenMusterAnrufSetzen({ orderIds: [ORDER(1), ORDER(2)], ergebnis: 'woanders_gekauft', notiz: 'Beim Mitbewerber' }, ANNA);
  assert.equal(r.zeitleisteFehler, null);
  assert.deepEqual(r.stand.gruende.map(g => [g.wert, g.anzahl]), [['woanders_gekauft', 1]]);
  assert.equal(r.stand.erledigt.length, 1);
  assert.equal(r.stand.erledigt[0].verlauf[0].notiz, 'Beim Mitbewerber');
  for (const id of [ORDER(1), ORDER(2)]) {
    const e = verlauf(id, 'ergebnis');
    assert.deepEqual([e.ergebnis, e.zustand, e.von], ['kein_interesse', 'erledigt', 'Anna']);
    assert.match(e.notiz, /Hat woanders gekauft – Beim Mitbewerber/);
  }
  const offen = await api.kundenNachfassenSenden({ probe: true, senden: async () => { throw new Error('kein Versand'); } });
  assert.ok(!(offen.geplant || []).some(g => [ORDER(1), ORDER(2)].includes(g.orderId)), 'keine Nachfrage-Mail mehr');
});

test('Server: Gespräch zählt als nachgefasst, „nicht erreicht“ nicht; Korrektur holt den Kunden zurück', async () => {
  const { api, verlauf } = await umgebung();
  await api.kundenMusterAnrufSetzen({ orderIds: [ORDER(3)], ergebnis: 'nicht_erreicht' }, ANNA);
  assert.notEqual(verlauf(ORDER(3), 'nachgefasst')?.zustand, 'erledigt');
  await api.kundenMusterAnrufSetzen({ orderIds: [ORDER(3)], ergebnis: 'ueberlegt_noch', notiz: 'Meldet sich' }, ANNA);
  assert.equal(verlauf(ORDER(3), 'nachgefasst').zustand, 'erledigt');
  await api.kundenMusterAnrufSetzen({ orderIds: [ORDER(3)], ergebnis: 'ueberlegt_noch' }, ANNA);
  assert.equal(verlauf(ORDER(3), 'nachgefasst').anzahl || 1, 1, 'zweites Gespräch zählt nicht doppelt');

  let r = await api.kundenMusterAnrufSetzen({ orderIds: [ORDER(3)], ergebnis: 'gefaellt_nicht' }, ANNA);
  assert.equal(r.stand.erledigt.length, 1);
  assert.equal(verlauf(ORDER(3), 'ergebnis').ergebnis, 'kein_interesse');
  r = await api.kundenMusterAnrufSetzen({ orderIds: [ORDER(3)], ergebnis: 'ueberlegt_noch', notiz: 'War ein Versehen' }, ANNA);
  assert.equal(r.zeitleisteFehler, null);
  assert.equal(r.stand.erledigt.length, 0);
  assert.equal(r.stand.spaeter.length, 1);
  assert.notEqual(verlauf(ORDER(3), 'ergebnis').ergebnis, 'kein_interesse');
});

test('Server: POST steht in der write-Liste, GET ist eine bekannte Route', () => {
  const quelle = fs.readFileSync(new URL('../../../scripts/serve-dashboard.mjs', import.meta.url), 'utf8');
  assert.match(quelle, /simple === 'kunden\/muster-anrufe' && req\.method === 'POST'\) \|\|/);
  assert.match(quelle, /kunden\\\/muster-anrufe\|/);
});

test('Kennzahlen: Wartezeit, nicht Verschicktes und Warenkunden ohne Muster, Test und Storno zählen nicht', () => {
  const am = (tage) => vor(tage);
  const m = (nr, kunde, raus, datum) => ({ orderId: `o${nr}`, auftragsart: 'muster', kundenSchluessel: kunde, datum, verlauf: raus ? [{ schritt: 'raus', zustand: 'erledigt', am: raus }] : [] });
  const k = musterKennzahlen([
    m(1, 'a', am(10), am(14)), m(2, 'b', am(2), am(14)), m(3, 'c', am(1), am(4)),
    m(4, 'd', null, am(9)), m(5, 'e', null, am(2)),
    { ...m(6, 'f', null, am(30)), testbestellung: true }, { ...m(7, 'g', null, am(30)), storniert: true },
    { orderId: 'w1', auftragsart: 'ware', kundenSchluessel: 'a', datum: am(1) }, { orderId: 'w2', auftragsart: 'ware', kundenSchluessel: 'x', datum: am(1) },
  ], { nochJungeMusterkunden: 3, musterkundenMitWarenkauf: 1 }, { jetzt: JETZT });
  assert.deepEqual([k.tageBisVersand, k.ueberZehnTage], [4, 1]);
  assert.deepEqual([k.nichtVerschickt, k.nichtVerschicktLange], [2, 1]);
  assert.deepEqual([k.musterKunden, k.warenKunden, k.warenOhneMuster], [5, 2, 1]);
  assert.deepEqual([k.nochJung, k.mitWarenkauf, k.reifOhneKauf], [3, 1, null]);
});

test('Ideen: jede Vermutung verweist auf echte Ergebnisse, Zahlen fehlen ohne Daten still, keine festen Zahlen im Text', () => {
  const werte = new Set(ANRUF_ERGEBNISSE.map(e => e.wert));
  const leer = musterKennzahlen([], null);
  for (const v of MUSTER_VERMUTUNGEN) {
    for (const g of v.gruende) assert.ok(werte.has(g), `${v.titel}: ${g}`);
    assert.equal(v.zahl(leer), null, v.titel);
    assert.doesNotMatch(`${v.titel} ${v.text}`, /\d/, 'öffentliches Repository: Zahlen nur zur Laufzeit');
  }
  assert.ok(MUSTER_ALTERNATIVEN.length >= 5);
  assert.equal(vermutungGenannt(MUSTER_VERMUTUNGEN[1], [{ wert: 'zu_spaet', anzahl: 2 }, { wert: 'woanders_gekauft', anzahl: 3 }, { wert: 'zu_teuer', anzahl: 9 }]), 5);
});

test('Server: die Liste bringt die Kennzahlen mit', async () => {
  const { api } = await umgebung();
  const k = api.kundenMusterAnrufe().kennzahlen;
  assert.equal(k.musterKunden, 2);
  assert.equal(k.tageBisVersand, 5, 'Bestellt am 1.1., verschickt am 6.1.');
  assert.equal(k.warenKunden, 0);
});

// Die Ansicht im Browser: Quelltext ohne Importe, die Bausteine des Kerns als einfache Ersatzteile.
const ansichtQuelle = fs.readFileSync(new URL('../ansichten/kunden/muster-anrufe.mjs', import.meta.url), 'utf8')
  .replace(/^import.*;\n/gm, '').replace(/^export\s/gm, '');
function anrufAnsicht(m, query = '') {
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  return vm.runInNewContext(`${ansichtQuelle}\nviewMusterAnrufe()`, {
    ...anrufLib, ...ideenLib, kundenLinkWert, URLSearchParams,
    // Nachfrage-Mails (w-284): Zeile und Karte sind eigene Bausteine (tests/nachfrage-mails-umzug.test.mjs).
    ensureKundenBestellungen() {}, ensureHeuteMusterTexte() {}, musterNachfassenStand: () => ({ offen: [], erledigt: [] }),
    nachfrageMailsZeile: (stand, auf) => `<div class="nm-zeile" data-auf="${auf}">Automatische Nachfrage-Mails</div>`,
    musterNachfassenBlock: (stand, opt) => `<section class="nm-karte" data-eingebettet="${opt?.eingebettet}"></section>`,
    state: { session: {}, route: { params: new URLSearchParams(query) } }, kunden: { musterAnrufe: m }, esc, fmtDate: d => String(d), plural: (n, a, b) => `${n} ${n === 1 ? a : b}`,
    toast() {}, fetchEinkauf: async () => null, orgSchreiben: async () => null, istNurLesend: () => false, render() {}, $: () => null,
    emptyState: (t, h) => `<div class="empty">${esc(t)} ${esc(h)}</div>`, stoerungState: () => '', telLink: t => `<a href="tel:${esc(t)}">${esc(t)}</a>`,
  });
}

test('Ansicht: ohne Kunden ohne Nummer keine leere E-Mail-Spalte, die Telefonkarten liegen im Raster ueber die volle Breite', () => {
  const m = { ...musterAnrufliste([zeile(1), zeile(2)], {}, { jetzt: JETZT, nurMitWunsch: false }), verfuegbar: true, gruende: [] };
  assert.equal(m.ohneNummer.length, 0);
  const html = anrufAnsicht(m);
  assert.doesNotMatch(html, /Keine Telefonnummer: per E-Mail/);
  assert.doesNotMatch(html, /anruf-spalten/);
  assert.match(html, /Telefonnummer vorhanden: anrufen <span class="muted small">2<\/span>/);
  assert.match(html, /class="rows anruf-raster"/);
  // Arbeit zuerst: die Liste steht vor der Auswertung, die Regeln in einer Zeile davor.
  assert.ok(html.indexOf('anruf-zeile') < html.indexOf('Warum gekauft wird oder nicht'));
  assert.match(html, /Ab 5 Tagen nach Versand · erst fragen, ob es passt · nach 3× „Nicht erreicht“ Schluss · „Möchte keine Anrufe“ gilt dauerhaft/);
  assert.equal((html.match(/class="small muted[^"]*"[^>]*>(Ab \d|Am Telefon)/g) || []).length, 1, 'ein Regelsatz statt zwei');
});

test('Ansicht: ein Kunde ohne Nummer bringt die zweite Spalte zurueck; Spaeter und Abgeschlossen bleiben unter der Auswertung', () => {
  const ohne = zeile(3);
  ohne.auftrag.details.lieferadresse.telefon = null;
  const m = { ...musterAnrufliste([zeile(1), ohne], {}, { jetzt: JETZT, nurMitWunsch: false }), verfuegbar: true, gruende: [] };
  m.spaeter = [{ ...m.anrufen[0], schluessel: 'spaeter-1' }];
  const html = anrufAnsicht(m);
  assert.match(html, /<div class="anruf-spalten">/);
  assert.match(html, /Keine Telefonnummer: per E-Mail <span class="muted small">1<\/span>/);
  assert.doesNotMatch(html, /anruf-raster/, 'zwei Spalten nebeneinander, kein Raster in der Spalte');
  assert.ok(html.indexOf('Warum gekauft wird oder nicht') < html.indexOf('Später nochmal'));
  // Nur Kunden ohne Nummer: die E-Mail-Spalte steht allein und volle Breite, keine leere Telefonspalte.
  const nurOhne = anrufAnsicht({ ...musterAnrufliste([ohne], {}, { jetzt: JETZT, nurMitWunsch: false }), verfuegbar: true, gruende: [] });
  assert.doesNotMatch(nurOhne, /Telefonnummer vorhanden/);
  assert.match(nurOhne, /Keine Telefonnummer: per E-Mail[\s\S]*class="rows anruf-raster"/);
});

test('Ansicht: nur Kunden ohne Freigabe (Anruf nur mit Rueckrufwunsch) - der Titel fordert nicht zum Anrufen auf', () => {
  // Rueckweg in lib/muster-anrufe.mjs: ANRUF_NUR_MIT_RUECKRUFWUNSCH wieder auf true. Ohne Wunsch
  // steht dann jeder Kunde mit Nummer unter "gesperrt" und bekommt nur die Mail.
  const m = { ...musterAnrufliste([zeile(1), zeile(2)], {}, { jetzt: JETZT, nurMitWunsch: true }), verfuegbar: true, gruende: [] };
  assert.equal(m.anrufen.length, 0);
  assert.equal(m.gesperrt.length, 2);
  const html = anrufAnsicht(m);
  assert.match(html, /Telefonnummer vorhanden <span class="muted small">2<\/span>/);
  assert.doesNotMatch(html, /Telefonnummer vorhanden: anrufen/);
  assert.match(html, /Ohne Rückrufwunsch ist der Anruf noch nicht freigegeben/);
  // Ein Kunde mit Wunsch dazu: dann gibt es wieder jemanden zum Anrufen.
  const mitWunsch = { ...musterAnrufliste([zeile(1), zeile(2, { beratungOffen: true })], {}, { jetzt: JETZT, nurMitWunsch: true }), verfuegbar: true, gruende: [] };
  assert.match(anrufAnsicht(mitWunsch), /Telefonnummer vorhanden: anrufen <span class="muted small">2<\/span>/);
});

test('w-284: Nachfrage-Mails stehen ganz oben im Reiter, die Karte nur mit mn=1 und eingebettet', () => {
  const m = { ...musterAnrufliste([zeile(1)], {}, { jetzt: JETZT, nurMitWunsch: false }), verfuegbar: true, gruende: [] };
  const zu = anrufAnsicht(m);
  assert.match(zu, /data-auf="false">Automatische Nachfrage-Mails/);
  assert.doesNotMatch(zu, /nm-karte/);
  assert.ok(zu.indexOf('nm-zeile') < zu.indexOf('anruf-regel'), 'vor der Anrufliste');
  const auf = anrufAnsicht(m, 'tab=anrufe&mn=1');
  assert.match(auf, /data-auf="true"/);
  assert.match(auf, /<section class="nm-karte" data-eingebettet="true">/);
  assert.ok(auf.indexOf('nm-karte') < auf.indexOf('anruf-zeile'));
  // Auch wenn die Anrufliste fehlt oder laedt, bleibt der Stand der Mails sichtbar.
  assert.match(anrufAnsicht({ verfuegbar: false, hinweis: 'Test' }), /Automatische Nachfrage-Mails/);
});

test('WhatsApp nur mit Einwilligung, Nummer international', () => {
  assert.match(anrufLib.whatsappLink('0176 123 45 67'), /^https:\/\/wa\.me\/491761234567\?text=Hallo/);
  assert.match(anrufLib.whatsappLink('+49 (176) 1234567'), /wa\.me\/491761234567\?/);
  assert.match(anrufLib.whatsappLink('0041 79 123 45 67'), /wa\.me\/41791234567\?/);
  assert.equal(anrufLib.whatsappLink('–'), null);
  const r = anrufLib.musterAnrufliste([zeile(91, { nachfrageErlaubt: true }), zeile(92, { nachfrageErlaubt: false })], {}, { jetzt: JETZT, nurMitWunsch: false });
  const alle = [...r.anrufen, ...r.ohneNummer, ...r.gesperrt];
  assert.equal(alle.find(z => z.orderIds[0] === 'o91')?.whatsapp, true);
  assert.equal(alle.find(z => z.orderIds[0] === 'o92')?.whatsapp, false);
});
