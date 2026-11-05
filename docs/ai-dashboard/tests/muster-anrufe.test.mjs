// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { ANRUF_ERGEBNISSE, ANRUF_NUR_MIT_RUECKRUFWUNSCH, RUECKFRAGE_VORLAGE, musterAnrufliste, rueckfrageLink, wiedervorlageTag } from '../lib/muster-anrufe.mjs';
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
  assert.equal(ANRUF_NUR_MIT_RUECKRUFWUNSCH, true, 'nur der Inhaber hebt die Sperre auf');
  const m = musterAnrufliste([zeile(1), zeile(2, { beratungOffen: true })], {}, { jetzt: JETZT });
  assert.deepEqual(m.anrufen.map(z => z.orderNames[0]), ['#T2']);
  assert.equal(m.anrufen[0].telefon, '+49302', 'Nummer aus der Lieferadresse');
  assert.deepEqual(m.gesperrt.map(z => z.orderNames[0]), ['#T1']);
  assert.equal(m.gesperrt[0].telefon, null);
  assert.doesNotMatch(JSON.stringify(m.gesperrt), /\+4930/);
  assert.ok(m.gesperrt[0].email);
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
  const m = musterAnrufliste([zeile(1)], {}, { jetzt: JETZT });
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

test('Server: Liste bündelt je Kunde, Telefonnummer gesperrt, Bestellung muss eine Musterbestellung sein', async () => {
  const { api } = await umgebung();
  const m = api.kundenMusterAnrufe();
  assert.equal(m.verfuegbar, true);
  assert.deepEqual(m.gesperrt.map(z => z.orderIds.length).sort(), [1, 2]);
  assert.doesNotMatch(JSON.stringify(m), /\+4930000/);
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
