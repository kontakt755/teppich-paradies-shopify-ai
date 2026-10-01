import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aufbereiten } from '../lib/bestelluebersicht.mjs';
import { auftragsstatusPfad, leseAlle, setzeStatus } from '../lib/auftragsstatus.mjs';
import { fortschritt } from '../lib/bestellliste.mjs';
import { WARTE_NACHHAKEN_TAGE, WARTE_PROBLEM_TAGE } from '../lib/lieferanten.mjs';
import {
  auftragsverlaufPfad, leseVerlauf, haengeEreignisAn, zeitleiste, naechsterSchritt, zeitleistenFuerModell, folgebestellung,
  auftragsart, dringendsterSchritt, setzbareSchritte, AuftragsverlaufFehler,
  NACHFASSEN_NACH_TAGEN, MUSTER_ANGEKOMMEN_ANNAHME_TAGE, ERGEBNIS_KLAEREN_NACH_TAGEN,
} from '../lib/auftragsverlauf.mjs';

// Nur erfundene Daten: Pseudonym-Lieferant A, Testkunden.
const mf = (namespace, key, value) => ({ namespace, key, value });
const tag = n => new Date(Date.UTC(2026, 0, n, 10)).toISOString(); // n-ter Januar 2026, 10 Uhr
const am = n => new Date(Date.UTC(2026, 0, n, 12));

function ware(id, route = 'SUPPLIER_TO_TP') {
  return {
    id: `gid://shopify/LineItem/${id}`, sku: `TEST-A-${id}`, title: 'Testdiele Eiche', variantTitle: 'Natur', quantity: 2, currentQuantity: 2, unfulfilledQuantity: 2,
    customAttributes: [], originalUnitPriceSet: { shopMoney: { amount: '10.00', currencyCode: 'EUR' } },
    variant: { id: `gid://shopify/ProductVariant/${id}`, sku: `TEST-A-${id}`, title: 'Natur',
      metafields: { nodes: [mf('einkauf', 'lieferant', 'A'), mf('einkauf', 'artikelnummer', 'A-4711'), mf('einkauf', 'bestelleinheit', 'paket'), mf('einkauf', 'route', route)] },
      lieferant: { nodes: [] }, product: { id: 'gid://shopify/Product/1', handle: 'testdiele', title: 'Testdiele Eiche', metafields: { nodes: [mf('custom', 'qm_pro_paket', '2,2')] }, grosshandel: { nodes: [] } } },
  };
}
function muster(id) {
  return {
    id: `gid://shopify/LineItem/${id}`, sku: `M-TEST-${id}`, title: 'Muster Testteppich', variantTitle: 'Grau', quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
    customAttributes: [{ key: 'Produkt', value: 'Testteppich' }], originalUnitPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } },
    variant: { id: `gid://shopify/ProductVariant/9${id}`, sku: `M-TEST-${id}`, title: 'Grau', metafields: { nodes: [] }, lieferant: { nodes: [] },
      product: { id: 'gid://shopify/Product/9', handle: 'muster', title: 'Muster', productType: 'Musterservice', metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
  };
}
function bestellung(nr, zeilen, { kunde = 1, erstellt = 1, erfuellt = 'UNFULFILLED', fulfillments = [], cancelledAt = null } = {}) {
  return {
    id: `gid://shopify/Order/${nr}`, name: `#T${nr}`, createdAt: tag(erstellt), cancelledAt,
    displayFinancialStatus: 'PAID', displayFulfillmentStatus: erfuellt, customAttributes: [], tags: [],
    customer: { id: `gid://shopify/Customer/${kunde}`, displayName: `Testkunde ${kunde}`, email: `testkunde${kunde}@example.invalid` },
    totalPriceSet: { shopMoney: { amount: '20.00', currencyCode: 'EUR' } },
    fulfillments, lineItems: { nodes: zeilen },
  };
}
const modellAus = (...orders) => aufbereiten({ orders }, { jetzt: am(1) });
const einAuftrag = (order) => modellAus(order).auftraege[0];
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-verlauf-'));
const zustaende = z => Object.fromEntries(z.verlauf.map(s => [s.schritt, s.zustand]));

function statusBis(auftrag, bis, { ab = 2 } = {}) {
  // Legt den Positionsstatus wie der bestehende Einkauf-Tab an: bestellt (Tag ab), geliefert (+2), raus (+3).
  const dir = tmp(); const file = auftragsstatusPfad(dir);
  const plan = { bestellt: ab, geliefert: ab + 2, raus: ab + 3, erledigt: ab + 4 };
  for (const s of ['bestellt', 'geliefert', 'raus', 'erledigt']) {
    for (const p of auftrag.positionen) setzeStatus(file, { orderId: auftrag.id, lineItemId: p.lineItemId, status: s, actor: 'Mitarbeiter 1', jetzt: new Date(tag(plan[s])) });
    if (s === bis) break;
  }
  return leseAlle(file);
}

test('Auftragsart: nur Muster = Musterstrecke, sonst Warenstrecke', () => {
  assert.equal(auftragsart(einAuftrag(bestellung(1, [muster(1), muster(2)]))), 'muster');
  assert.equal(auftragsart(einAuftrag(bestellung(2, [ware(1)]))), 'ware');
  assert.equal(auftragsart(einAuftrag(bestellung(3, [ware(1), muster(2)]))), 'ware');
  assert.deepEqual(setzbareSchritte('ware'), ['bestellt', 'geliefert', 'raus', 'erledigt']);
});

test('Musterstrecke ohne Status: angefragt automatisch, naechster Schritt "bei Lieferant bestellen" (wir)', () => {
  const a = einAuftrag(bestellung(1, [muster(1)]));
  const z = zeitleiste(a, { jetzt: am(3) });
  assert.deepEqual(z.verlauf.map(s => s.schritt), ['angefragt', 'bestellt', 'geliefert', 'raus', 'kunde_hat_muster', 'nachgefasst', 'ergebnis']);
  assert.equal(z.verlauf[0].zustand, 'erledigt');
  assert.equal(z.verlauf[0].automatisch, true);
  assert.equal(z.verlauf[0].am, tag(1));
  assert.equal(z.verlauf[1].zustand, 'aktuell');
  assert.equal(z.verlauf[3].label, 'Gelabelt und an Kunden verschickt');
  assert.deepEqual({ wer: z.naechsterSchritt.wer, aktion: z.naechsterSchritt.aktion, stufe: z.naechsterSchritt.stufe, faelligSeitTagen: z.naechsterSchritt.faelligSeitTagen },
    { wer: 'wir', aktion: 'bestellt', stufe: 'faellig', faelligSeitTagen: 2 });
  assert.deepEqual(Object.keys(z.naechsterSchritt).sort(), ['aktion', 'annahme', 'detail', 'faelligSeitTagen', 'knopf', 'stufe', 'text', 'wartetSeitTagen', 'wer']);
});

test('Muster beim Lieferanten: warten, ab 7 Tagen nachhaken, ab 14 Tagen Problem (Schwellen aus lieferanten.mjs)', () => {
  const a = einAuftrag(bestellung(1, [muster(1)]));
  const statusAlle = statusBis(a, 'bestellt');
  const bei = t => zeitleiste(a, { statusAlle, jetzt: am(2 + t) }).naechsterSchritt;
  assert.deepEqual([bei(3).wer, bei(3).stufe, bei(3).faelligSeitTagen, bei(3).aktion], ['lieferant', 'warten', null, 'geliefert']);
  assert.equal(bei(WARTE_NACHHAKEN_TAGE - 1).stufe, 'warten');
  assert.equal(bei(WARTE_NACHHAKEN_TAGE).stufe, 'nachhaken');
  assert.equal(bei(WARTE_NACHHAKEN_TAGE).faelligSeitTagen, 0);
  assert.match(bei(WARTE_NACHHAKEN_TAGE).text, /nachhaken/);
  assert.equal(bei(WARTE_PROBLEM_TAGE).stufe, 'problem');
  assert.equal(bei(WARTE_PROBLEM_TAGE).faelligSeitTagen, WARTE_PROBLEM_TAGE - WARTE_NACHHAKEN_TAGE);
});

test('Muster bei uns: labeln und verschicken (wir); wer und wann stehen am erledigten Schritt', () => {
  const a = einAuftrag(bestellung(1, [muster(1), muster(2)]));
  const z = zeitleiste(a, { statusAlle: statusBis(a, 'geliefert'), jetzt: am(5) });
  assert.equal(z.verlauf[2].zustand, 'erledigt');
  assert.equal(z.verlauf[2].von, 'Mitarbeiter 1');
  assert.equal(z.verlauf[2].am, tag(4));
  assert.equal(z.verlauf[2].automatisch, false);
  assert.deepEqual([z.naechsterSchritt.wer, z.naechsterSchritt.aktion, z.naechsterSchritt.stufe], ['wir', 'raus', 'faellig']);
});

test('Teilweise bestellt: Schritt bleibt offen und nennt den Teilstand', () => {
  const a = einAuftrag(bestellung(1, [muster(1), muster(2)]));
  const dir = tmp(); const file = auftragsstatusPfad(dir);
  setzeStatus(file, { orderId: a.id, lineItemId: a.positionen[0].lineItemId, status: 'bestellt', actor: 'Mitarbeiter 1', jetzt: new Date(tag(2)) });
  const z = zeitleiste(a, { statusAlle: leseAlle(file), jetzt: am(3) });
  assert.equal(z.verlauf[1].zustand, 'aktuell');
  assert.deepEqual(z.verlauf[1].teil, { erledigt: 1, gesamt: 2 });
  assert.equal(z.naechsterSchritt.aktion, 'bestellt');
  assert.match(z.naechsterSchritt.text, /1 von 2/);
});

test('"Kunde hat Muster" wird nach N Tagen nur vorgeschlagen, nie still gesetzt', () => {
  const a = einAuftrag(bestellung(1, [muster(1)]));
  const statusAlle = statusBis(a, 'raus'); // verschickt am 5.
  const frueh = zeitleiste(a, { statusAlle, jetzt: am(5 + MUSTER_ANGEKOMMEN_ANNAHME_TAGE - 1) });
  assert.deepEqual([frueh.naechsterSchritt.wer, frueh.naechsterSchritt.stufe, frueh.naechsterSchritt.annahme], ['kunde', 'warten', false]);
  const spaet = zeitleiste(a, { statusAlle, jetzt: am(5 + 20) });
  assert.equal(zustaende(spaet).kunde_hat_muster, 'aktuell', 'auch nach 20 Tagen nicht automatisch gesetzt');
  assert.deepEqual([spaet.naechsterSchritt.wer, spaet.naechsterSchritt.aktion, spaet.naechsterSchritt.stufe, spaet.naechsterSchritt.annahme], ['wir', 'kunde_hat_muster', 'faellig', true]);
  assert.equal(zustaende(spaet).nachgefasst, 'offen');
});

test('Nachfassen wird 5 Tage nach "Kunde hat Muster" faellig', () => {
  assert.equal(NACHFASSEN_NACH_TAGEN, 5);
  const a = einAuftrag(bestellung(1, [muster(1)]));
  const statusAlle = statusBis(a, 'raus');
  const ereignisse = [{ schritt: 'kunde_hat_muster', am: tag(7), von: 'Mitarbeiter 2' }];
  const bei = t => zeitleiste(a, { statusAlle, ereignisse, jetzt: am(7 + t) });
  assert.deepEqual([bei(4).naechsterSchritt.wer, bei(4).naechsterSchritt.stufe, bei(4).naechsterSchritt.faelligSeitTagen], ['kunde', 'warten', null]);
  const faellig = bei(6);
  assert.deepEqual([faellig.naechsterSchritt.wer, faellig.naechsterSchritt.aktion, faellig.naechsterSchritt.stufe, faellig.naechsterSchritt.faelligSeitTagen], ['wir', 'nachgefasst', 'faellig', 1]);
  assert.match(faellig.naechsterSchritt.text, /Nachfassen: Muster liegen seit 6 Tagen beim Kunden/);
  assert.equal(faellig.verlauf[4].von, 'Mitarbeiter 2');
  assert.equal(bei(5).naechsterSchritt.faelligSeitTagen, 0);
});

test('Nach dem Nachfassen: Kunde ist dran, nach 14 Tagen Ergebnis klaeren; Ergebnis schliesst ab', () => {
  const a = einAuftrag(bestellung(1, [muster(1)]));
  const statusAlle = statusBis(a, 'raus');
  const basis = [{ schritt: 'kunde_hat_muster', am: tag(7), von: 'Mitarbeiter 2' }, { schritt: 'nachgefasst', am: tag(13), von: 'Mitarbeiter 2', notiz: 'überlegt noch' }];
  const wartet = zeitleiste(a, { statusAlle, ereignisse: basis, jetzt: am(15) });
  assert.deepEqual([wartet.naechsterSchritt.wer, wartet.naechsterSchritt.aktion, wartet.naechsterSchritt.stufe], ['kunde', 'ergebnis', 'warten']);
  assert.equal(wartet.verlauf[5].notiz, 'überlegt noch');
  const lang = zeitleiste(a, { statusAlle, ereignisse: basis, jetzt: am(13 + ERGEBNIS_KLAEREN_NACH_TAGEN) });
  assert.deepEqual([lang.naechsterSchritt.wer, lang.naechsterSchritt.stufe], ['wir', 'faellig']);
  const fertig = zeitleiste(a, { statusAlle, ereignisse: [...basis, { schritt: 'kein_interesse', am: tag(16), von: 'Mitarbeiter 2' }], jetzt: am(17) });
  assert.equal(fertig.abgeschlossen, true);
  assert.equal(fertig.naechsterSchritt, null);
  assert.deepEqual([fertig.verlauf.at(-1).ergebnis, fertig.verlauf.at(-1).label, fertig.verlauf.at(-1).zustand], ['kein_interesse', 'Kein Interesse', 'erledigt']);
});

test('Automatisch erkannt: Shopify-Versand = an Kunden verschickt, Zustellung = Kunde hat Muster', () => {
  const sendung = status => [{ status: 'SUCCESS', displayStatus: status, createdAt: tag(4), updatedAt: tag(6), trackingInfo: [{ number: 'TEST123', company: 'Testpost', url: null }] }];
  const unterwegs = einAuftrag(bestellung(1, [muster(1)], { erfuellt: 'FULFILLED', fulfillments: sendung('IN_TRANSIT') }));
  const z = zeitleiste(unterwegs, { jetzt: am(5) });
  assert.deepEqual(zustaende(z), { angefragt: 'erledigt', bestellt: 'uebersprungen', geliefert: 'uebersprungen', raus: 'erledigt', kunde_hat_muster: 'aktuell', nachgefasst: 'offen', ergebnis: 'offen' });
  assert.deepEqual([z.verlauf[3].automatisch, z.verlauf[3].quelle, z.verlauf[3].am, z.verlauf[3].hinweis], [true, 'Shopify-Versand', tag(4), 'Sendung TEST123 (Testpost)']);
  assert.equal(z.naechsterSchritt.wer, 'kunde');

  const zugestellt = einAuftrag(bestellung(1, [muster(1)], { erfuellt: 'FULFILLED', fulfillments: sendung('DELIVERED') }));
  const z2 = zeitleiste(zugestellt, { jetzt: am(8) });
  assert.deepEqual([z2.verlauf[4].zustand, z2.verlauf[4].automatisch, z2.verlauf[4].quelle, z2.verlauf[4].am], ['erledigt', true, 'Sendungsverfolgung', tag(6)]);
  assert.equal(z2.naechsterSchritt.aktion, 'nachgefasst');

  // Teilversand ist kein sicherer Beleg, stornierte Sendungen zaehlen nicht.
  const teil = einAuftrag(bestellung(1, [muster(1)], { erfuellt: 'PARTIALLY_FULFILLED', fulfillments: sendung('IN_TRANSIT') }));
  assert.equal(zustaende(zeitleiste(teil, { jetzt: am(5) })).raus, 'offen');
});

test('Automatisch erkannt: spaetere Warenbestellung desselben Kunden = "Kunde hat bestellt"', () => {
  const modell = modellAus(
    bestellung(1, [muster(1)], { kunde: 1, erstellt: 1 }),
    bestellung(2, [muster(2)], { kunde: 1, erstellt: 3 }),      // weitere Musterbestellung zaehlt nicht
    bestellung(3, [ware(3)], { kunde: 1, erstellt: 9 }),
    bestellung(4, [ware(4)], { kunde: 2, erstellt: 5 }),        // anderer Kunde
    bestellung(5, [muster(5)], { kunde: 2, erstellt: 6 }),      // Muster NACH der Ware: kein Ergebnis
  );
  assert.equal(folgebestellung(modell.auftraege[0], modell.auftraege.slice(0, 3)).name, '#T3');
  const zl = zeitleistenFuerModell(modell, { jetzt: am(10) });
  const m1 = zl.get('gid://shopify/Order/1');
  const e = m1.verlauf.at(-1);
  assert.deepEqual([e.zustand, e.automatisch, e.ergebnis, e.quelle, e.folgeOrderName, e.am], ['erledigt', true, 'kunde_hat_bestellt', 'Spätere Bestellung', '#T3', tag(9)]);
  assert.equal(m1.abgeschlossen, false, 'erkannt, aber nicht still abgeschlossen');
  assert.deepEqual([m1.naechsterSchritt.wer, m1.naechsterSchritt.aktion, m1.naechsterSchritt.stufe], ['wir', 'kunde_hat_bestellt', 'faellig']);
  assert.match(m1.naechsterSchritt.text, /#T3/);
  assert.equal(zl.get('gid://shopify/Order/5').verlauf.at(-1).zustand, 'offen');
  assert.equal(zl.get('gid://shopify/Order/3').auftragsart, 'ware');
});

test('Warenstrecke: bestellen -> Lieferant -> an Kunden raus -> abschliessen; Direktversand ohne "Geliefert an uns"', () => {
  const a = einAuftrag(bestellung(1, [ware(1)]));
  const offen = zeitleiste(a, { jetzt: am(2) });
  assert.deepEqual(offen.verlauf.map(s => s.schritt), ['kunde_hat_bestellt', 'bestellt', 'geliefert', 'raus', 'erledigt']);
  assert.deepEqual([offen.naechsterSchritt.wer, offen.naechsterSchritt.aktion], ['wir', 'bestellt']);
  const bestellt = zeitleiste(a, { statusAlle: statusBis(a, 'bestellt'), jetzt: am(2 + 8) });
  assert.deepEqual([bestellt.naechsterSchritt.wer, bestellt.naechsterSchritt.aktion, bestellt.naechsterSchritt.stufe], ['lieferant', 'geliefert', 'nachhaken']);
  const da = zeitleiste(a, { statusAlle: statusBis(a, 'geliefert'), jetzt: am(5) });
  assert.deepEqual([da.naechsterSchritt.wer, da.naechsterSchritt.aktion], ['wir', 'raus']);
  const raus = statusBis(a, 'raus');
  assert.deepEqual([zeitleiste(a, { statusAlle: raus, jetzt: am(6) }).naechsterSchritt.wer, zeitleiste(a, { statusAlle: raus, jetzt: am(6) }).naechsterSchritt.stufe], ['kunde', 'warten']);
  assert.deepEqual([zeitleiste(a, { statusAlle: raus, jetzt: am(13) }).naechsterSchritt.wer, zeitleiste(a, { statusAlle: raus, jetzt: am(13) }).naechsterSchritt.aktion], ['wir', 'erledigt']);
  const fertig = zeitleiste(a, { statusAlle: statusBis(a, 'erledigt'), jetzt: am(9) });
  assert.equal(fertig.abgeschlossen, true);
  assert.equal(fertig.naechsterSchritt, null);

  const direkt = einAuftrag(bestellung(2, [ware(2, 'SUPPLIER_TO_SITE')]));
  const zd = zeitleiste(direkt, { statusAlle: statusBis(direkt, 'bestellt'), jetzt: am(4) });
  assert.deepEqual(zd.verlauf.map(s => s.schritt), ['kunde_hat_bestellt', 'bestellt', 'raus', 'erledigt']);
  assert.deepEqual([zd.naechsterSchritt.wer, zd.naechsterSchritt.aktion], ['lieferant', 'raus']);
});

test('Storniert: nichts mehr zu tun', () => {
  const a = modellAus(bestellung(1, [ware(1)], { cancelledAt: tag(2) })).auftraege[0];
  const z = zeitleiste(a, { jetzt: am(5) });
  assert.equal(z.abgeschlossen, true);
  assert.equal(z.naechsterSchritt, null);
});

test('Abwaertskompatibel: Statusdatei im alten Format wird unveraendert gelesen und ergibt denselben Fortschritt', () => {
  const a = einAuftrag(bestellung(1, [ware(1), ware(2)]));
  const m = einAuftrag(bestellung(2, [muster(3)]));
  const dir = tmp(); const file = auftragsstatusPfad(dir);
  // Altes Format, wie es der Einkauf-Tab seit jeher schreibt - inklusive "Ohne Einkauf abschliessen" (erledigt ohne Vorstufen).
  const alt = { version: 1, positionen: {
    [`${a.id}::${a.positionen[0].lineItemId}`]: { orderId: a.id, lineItemId: a.positionen[0].lineItemId, status: 'geliefert', aktualisiertAm: tag(5), aktualisiertVon: 'tester', bestelltAm: tag(2), bestelltVon: 'tester', lieferantBestellnummer: 'AB-1', geliefertAm: tag(5), geliefertVon: 'tester' },
    [`${a.id}::${a.positionen[1].lineItemId}`]: { orderId: a.id, lineItemId: a.positionen[1].lineItemId, status: 'bestellt', aktualisiertAm: tag(3), aktualisiertVon: 'tester', bestelltAm: tag(3), bestelltVon: 'tester' },
    [`${m.id}::${m.positionen[0].lineItemId}`]: { orderId: m.id, lineItemId: m.positionen[0].lineItemId, status: 'erledigt', aktualisiertAm: tag(4), aktualisiertVon: 'tester', erledigtAm: tag(4), erledigtVon: 'tester', erledigtNotiz: 'Ohne Einkauf abgeschlossen' },
  } };
  const roh = JSON.stringify(alt, null, 2);
  fs.writeFileSync(file, roh);
  const statusAlle = leseAlle(file);

  const z = zeitleiste(a, { statusAlle, jetzt: am(6) });
  assert.deepEqual(zustaende(z), { kunde_hat_bestellt: 'erledigt', bestellt: 'erledigt', geliefert: 'aktuell', raus: 'offen', erledigt: 'offen' });
  assert.equal(z.verlauf[1].am, tag(3), 'Datum der Position, die den Schritt zuletzt erreicht hat');
  assert.deepEqual(z.verlauf[2].teil, { erledigt: 1, gesamt: 2 });
  assert.equal(fortschritt(a, statusAlle).stufe, 'bestellt', 'bestehende Auswertung unveraendert');

  const zm = zeitleiste(m, { statusAlle, jetzt: am(30) });
  assert.equal(zm.abgeschlossen, true, 'im alten Modell abgeschlossene Musterbestellung erzeugt keine neue Aufgabe');
  assert.equal(zm.naechsterSchritt, null);
  assert.deepEqual([zm.verlauf.at(-1).ergebnis, zm.verlauf.at(-1).notiz], ['erledigt', 'Ohne Einkauf abgeschlossen']);

  // Ereignisse landen in einer eigenen Datei - die Statusdatei bleibt Byte fuer Byte gleich.
  haengeEreignisAn(auftragsverlaufPfad(dir), { orderId: m.id, schritt: 'notiz', actor: 'Mitarbeiter 1', notiz: 'Test' });
  assert.equal(fs.readFileSync(file, 'utf8'), roh);
  // Und der bestehende Schreibweg funktioniert auf der alten Datei weiter.
  const neu = setzeStatus(file, { orderId: a.id, lineItemId: a.positionen[1].lineItemId, status: 'geliefert', actor: 'tester', jetzt: new Date(tag(6)) });
  assert.equal(neu.bestelltAm, tag(3));
  assert.equal(zeitleiste(a, { statusAlle: leseAlle(file), jetzt: am(6) }).naechsterSchritt.aktion, 'raus');
});

test('Ablage: nur anhaengen, wer und wann je Ereignis, "zurueck" hebt auf statt zu loeschen', () => {
  const dir = tmp(); const file = auftragsverlaufPfad(dir);
  assert.deepEqual(leseVerlauf(file), {});
  haengeEreignisAn(file, { orderId: 'o1', schritt: 'kunde_hat_muster', actor: 'Mitarbeiter 1', jetzt: new Date(tag(7)) });
  haengeEreignisAn(file, { orderId: 'o1', schritt: 'notiz', actor: 'Mitarbeiter 2', notiz: 'Kunde ist bis Freitag im Urlaub', jetzt: new Date(tag(8)) });
  haengeEreignisAn(file, { orderId: 'o1', schritt: 'zurueck', bezug: 'kunde_hat_muster', actor: 'Mitarbeiter 1', jetzt: new Date(tag(9)) });
  const e = leseVerlauf(file).o1.ereignisse;
  assert.deepEqual(e.map(x => [x.schritt, x.von, x.am]), [['kunde_hat_muster', 'Mitarbeiter 1', tag(7)], ['notiz', 'Mitarbeiter 2', tag(8)], ['zurueck', 'Mitarbeiter 1', tag(9)]]);
  assert.ok(!fs.readdirSync(dir).some(f => f.endsWith('.tmp')));

  const a = einAuftrag(bestellung(1, [muster(1)]));
  const z = zeitleiste(a, { statusAlle: statusBis(a, 'raus'), ereignisse: e, jetzt: am(9) });
  assert.equal(zustaende(z).kunde_hat_muster, 'aktuell', 'zurueckgenommen');
  assert.deepEqual(z.verlaufNotizen, [{ am: tag(8), von: 'Mitarbeiter 2', text: 'Kunde ist bis Freitag im Urlaub' }]);

  assert.throws(() => haengeEreignisAn(file, { orderId: 'o1', schritt: 'bestellt', actor: 'x' }), AuftragsverlaufFehler);
  assert.throws(() => haengeEreignisAn(file, { orderId: 'o1', schritt: 'notiz', actor: 'x', notiz: '  ' }), AuftragsverlaufFehler);
  assert.throws(() => haengeEreignisAn(file, { orderId: 'o1', schritt: 'nachgefasst' }), AuftragsverlaufFehler);
  assert.throws(() => haengeEreignisAn(file, { orderId: '', schritt: 'nachgefasst', actor: 'x' }), AuftragsverlaufFehler);
  fs.writeFileSync(file, '{kaputt');
  assert.deepEqual(leseVerlauf(file), {});
});

test('naechsterSchritt ist rein und waehlbar: dringendster Schritt ueber mehrere Auftraege', () => {
  const a = einAuftrag(bestellung(1, [muster(1)]));
  const statusAlle = statusBis(a, 'bestellt');
  const z = zeitleiste(a, { statusAlle, jetzt: am(20) });
  const { naechsterSchritt: n, ...stand } = z;
  assert.deepEqual(naechsterSchritt(stand, { auftrag: a, jetzt: am(20) }), n);
  assert.deepEqual(naechsterSchritt(stand, { auftrag: a, jetzt: am(20) }), n, 'zweiter Aufruf, gleiches Ergebnis');
  assert.equal(naechsterSchritt({ ...stand, abgeschlossen: true }), null);
  const warten = { stufe: 'warten', faelligSeitTagen: null, wartetSeitTagen: 3 };
  const faellig = { stufe: 'faellig', faelligSeitTagen: 2 };
  assert.equal(dringendsterSchritt([warten, null, faellig, n]), n);
  assert.equal(n.stufe, 'problem');
  assert.equal(dringendsterSchritt([warten, faellig]), faellig);
  assert.equal(dringendsterSchritt([]), null);
});
