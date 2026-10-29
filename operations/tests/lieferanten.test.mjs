import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aufbereiten, kopierText } from '../lib/bestelluebersicht.mjs';
import { positionKey } from '../lib/auftragsstatus.mjs';
import { UNGEKLAERT } from '../lib/umrechnung.mjs';
import {
  pruefeStammdaten, leseStammdaten, stammdatenPfad, stammdatenFuer, lieferantenUebersicht, lieferantDetail,
  bestellmail, mailtoLink, wartetage, warnstufe, LieferantenFehler,
  WARTE_NACHHAKEN_TAGE, WARTE_PROBLEM_TAGE, MAILTO_MAX,
  kennungAusLexikon, lexikonSchnellzugriff, lexikonProduktMitSchnellzugriff, kettlerGrund, kettlerAutomatisch, kuerzereSeiteCm,
  kettelZuschnitt, KETTEL_PUFFER_CM,
} from '../lib/lieferanten.mjs';

// Nur synthetische Testdaten: Pseudonyme (Lieferant A/B, *.example), erfundene Kunden.
const mf = (namespace, key, value) => ({ namespace, key, value });

function zeile({ id, sku, title, variantTitle = null, quantity = 1, attrs = [], einkauf = [], lieferant = [], custom = [], productType = null, preis = '19.90' }) {
  return {
    id: `gid://shopify/LineItem/${id}`, sku, title, variantTitle, quantity, currentQuantity: quantity, unfulfilledQuantity: quantity,
    customAttributes: attrs,
    originalUnitPriceSet: { shopMoney: { amount: preis, currencyCode: 'EUR' } },
    variant: {
      id: `gid://shopify/ProductVariant/${id}`, sku, title: variantTitle ?? 'Default Title',
      metafields: { nodes: einkauf.map(([k, v]) => mf('einkauf', k, v)) },
      lieferant: { nodes: lieferant.map(([k, v]) => mf('lieferant', k, v)) },
      product: {
        id: `gid://shopify/Product/${id}`, handle: `testprodukt-${id}`, title, productType,
        metafields: { nodes: custom.map(([k, v]) => mf('custom', k, v)) },
        grosshandel: { nodes: [] },
      },
    },
  };
}

function bestellung(nr, zeilen, extra = {}) {
  return {
    id: `gid://shopify/Order/9000${nr}`, name: `#T${nr}`, createdAt: `2026-01-0${nr}T10:00:00Z`, cancelledAt: null,
    displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
    customer: { id: `gid://shopify/Customer/500${nr}`, displayName: `Testkunde ${nr}`, email: `testkunde${nr}@example.invalid` },
    shippingAddress: { name: `Testkunde ${nr}`, address1: `Testweg ${nr}`, zip: '00000', city: 'Musterstadt', country: 'Deutschland' },
    lineItems: { nodes: zeilen }, ...extra,
  };
}

const paket = zeile({ id: 1, sku: 'TEST-A-1', title: 'Testdiele Eiche', variantTitle: 'Natur', quantity: 3,
  einkauf: [['lieferant', 'A'], ['artikelnummer', 'A-4711'], ['farbnummer', '012'], ['bestelleinheit', 'paket'], ['route', 'SUPPLIER_TO_TP']],
  custom: [['qm_pro_paket', '2,2']] });
// Bestelleinheit fehlt -> Menge UNGEKLAERT -> darf nicht in die Mail.
const ohneMenge = zeile({ id: 2, sku: 'TEST-A-2', title: 'Testteppich Wolke', variantTitle: 'Grau',
  einkauf: [['lieferant', 'A'], ['artikelnummer', 'A-0815'], ['route', 'SUPPLIER_TO_TP']] });
// Keine Artikelnummer beim Lieferanten.
const ohneNummer = zeile({ id: 3, sku: null, title: 'Testleiste', variantTitle: 'Weiß',
  einkauf: [['lieferant', 'A'], ['bestelleinheit', 'stueck'], ['route', 'SUPPLIER_TO_TP']] });
const stueckB = zeile({ id: 4, sku: 'TEST-B-1', title: 'Testmatte', variantTitle: 'Anthrazit', quantity: 2,
  einkauf: [['lieferant', 'B'], ['artikelnummer', 'B-77'], ['bestelleinheit', 'stueck'], ['route', 'SUPPLIER_TO_TP']] });
const muster1 = zeile({ id: 5, sku: 'M-TEST-1', title: 'Muster Testteppich', variantTitle: 'Grau', preis: '0.00',
  attrs: [{ key: '_Quellvariante_ID', value: '777' }, { key: 'Produkt', value: 'Testteppich Wolke' }, { key: 'Farbe', value: 'Grau' }] });
const muster2 = zeile({ id: 6, sku: 'M-TEST-2', title: 'Muster Testteppich', variantTitle: 'Blau', preis: '0.00',
  attrs: [{ key: '_Quellvariante_ID', value: '778' }, { key: 'Produkt', value: 'Testteppich Wolke' }, { key: 'Farbe', value: 'Blau' }] });

const quellvariante = (id, artikel, farbnr) => ({
  id: `gid://shopify/ProductVariant/${id}`, sku: `TEST-Q-${id}`, title: 'Quelle',
  metafields: { nodes: [mf('einkauf', 'lieferant', 'A'), mf('einkauf', 'artikelnummer', artikel), ...(farbnr ? [mf('einkauf', 'farbnummer', farbnr)] : [])] },
  lieferant: { nodes: [] },
  product: { id: `gid://shopify/Product/${id}`, handle: 'testteppich-wolke', title: 'Testteppich Wolke', metafields: { nodes: [] }, grosshandel: { nodes: [] } },
});

const JETZT = new Date('2026-01-20T10:00:00Z');

function modell(extra = {}) {
  return aufbereiten({
    orders: [
      bestellung(1, [paket, ohneMenge, ohneNummer]),
      bestellung(2, [stueckB, muster1]),
      bestellung(3, [muster2], { shippingAddress: null }),
    ],
    quellvarianten: [quellvariante(777, 'A-0815', '020'), quellvariante(778, 'A-0815', null)],
    ...extra,
  }, { jetzt: JETZT });
}

const STAMM = pruefeStammdaten(JSON.parse(fs.readFileSync(new URL('../lib/lieferanten.beispiel.json', import.meta.url), 'utf8')));

// ---------------------------------------------------------------- Stammdaten

test('Beispieldatei ist gueltig und traegt nur Pseudonyme', () => {
  assert.deepEqual(STAMM.fehler, []);
  assert.deepEqual(Object.keys(STAMM.lieferanten), ['A', 'B']);
  const a = STAMM.lieferanten.A;
  assert.equal(a.name, 'Lieferant A');
  assert.equal(a.ware.weg, 'portal');
  assert.equal(a.muster.ansprechperson, 'Frau Muster');
  assert.equal(a.lieferzeitWerktage, 5);
  assert.deepEqual(a.fehlend, []);
  assert.equal(a.hinterlegt, true);
  const roh = fs.readFileSync(new URL('../lib/lieferanten.beispiel.json', import.meta.url), 'utf8');
  for (const adresse of roh.match(/[\w.-]+@[\w.-]+/g)) assert.match(adresse, /\.example$/, `${adresse} ist keine .example-Adresse`);
  for (const url of roh.match(/https?:\/\/[^\s"]+/g)) assert.match(new URL(url).hostname, /\.example$/);
});

test('fehlende Datei: nichts hinterlegt, kein Fehler', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-lief-'));
  const s = leseStammdaten(stammdatenPfad(dir));
  assert.equal(s.vorhanden, false);
  assert.deepEqual(s.fehler, []);
  assert.deepEqual(s.lieferanten, {});
  const a = stammdatenFuer(s, 'a');
  assert.equal(a.id, 'A');
  assert.equal(a.hinterlegt, false);
  assert.equal(a.kundennummer, null);
  assert.equal(a.ware.weg, null);
  assert.equal(a.name, 'Lieferant A');
  assert.ok(a.fehlend.includes('kundennummer') && a.fehlend.includes('ware.weg') && a.fehlend.includes('muster.lieferung'));
});

test('kaputte Datei wird gemeldet statt geworfen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-lief-'));
  fs.mkdirSync(path.join(dir, 'lieferanten'));
  fs.writeFileSync(stammdatenPfad(dir), '{ kein json');
  const s = leseStammdaten(stammdatenPfad(dir));
  assert.equal(s.vorhanden, true);
  assert.match(s.fehler[0], /beschädigt/);
  assert.deepEqual(s.lieferanten, {});
});

test('Validierung: ungueltige Werte werden zu "nicht hinterlegt" und stehen in fehler', () => {
  const s = pruefeStammdaten({
    lieferanten: {
      a: {
        anzeigename: '  Lieferant A ', kundennummer: 4711,
        ware: { weg: 'Fax', portalUrl: 'javascript:alert(1)', mail: 'kein-at.example', telefon: 'ruf an' },
        muster: { weg: 'MAIL', mail: 'muster@lieferant-a.example?bcc=fremd@boese.example', lieferung: 'mond' },
        lieferzeitWerktage: 'bald',
        einkaufspreisRabatt: '40 %',
      },
      'zu lange kennung mit leerzeichen': {},
      _kommentar: 'wird ignoriert',
      B: 'kein objekt',
    },
  });
  const a = s.lieferanten.A;
  assert.equal(a.anzeigename, 'Lieferant A');
  assert.equal(a.kundennummer, '4711');
  assert.equal(a.ware.weg, null);
  assert.equal(a.ware.portalUrl, null);
  assert.equal(a.ware.mail, null);
  assert.equal(a.ware.telefon, null);
  assert.equal(a.muster.weg, 'mail');
  assert.equal(a.muster.mail, null, 'Adresse mit ?bcc= darf nie in einen mailto:-Link');
  assert.equal(a.muster.lieferung, null);
  assert.equal(a.lieferzeitWerktage, null);
  assert.equal(JSON.stringify(a).includes('40 %'), false, 'unbekannte Felder (Konditionen) werden nicht durchgereicht');
  assert.equal(s.fehler.length, 9);
  assert.ok(s.fehler.some(f => /lieferanten\.A\.ware\.weg/.test(f)));
  assert.ok(s.fehler.some(f => /Kennung ungueltig/.test(f)));
  assert.equal(s.lieferanten.B, undefined);
  assert.ok(a.fehlend.includes('ware.weg') && a.fehlend.includes('muster.mail'));
});

test('kein Objekt als Datei-Inhalt', () => {
  assert.equal(pruefeStammdaten([]).fehler.length, 1);
  assert.equal(pruefeStammdaten({ lieferanten: [] }).fehler.length, 1);
  assert.deepEqual(pruefeStammdaten({}).fehler, []);
});

// ---------------------------------------------------------------- Schwellen

test('Wartetage und Warnstufen wie im Frontend', () => {
  const vor = tage => new Date(JETZT.getTime() - tage * 864e5).toISOString();
  assert.equal(wartetage({ status: 'bestellt', bestelltAm: vor(8) }, JETZT), 8);
  assert.equal(wartetage({ status: 'geliefert', bestelltAm: vor(20), geliefertAm: vor(2) }, JETZT), 2);
  assert.equal(wartetage({ status: 'raus', bestelltAm: vor(20) }, JETZT), null);
  assert.equal(wartetage(null, JETZT), null);
  assert.equal(warnstufe(6), null);
  assert.equal(warnstufe(7), 'nachhaken');
  assert.equal(warnstufe(13), 'nachhaken');
  assert.equal(warnstufe(14), 'problem');
  assert.equal(warnstufe(null), null);
});

test('Schwellen stimmen mit dem Frontend ueberein (AF_WARTE_WARN / AF_WARTE_CRIT)', (t) => {
  const wurzel = new URL('../../docs/ai-dashboard/', import.meta.url);
  const dateien = fs.readdirSync(wurzel, { recursive: true }).filter(f => /\.(m?js)$/.test(String(f)) && !String(f).includes('tests'));
  let warn = null; let crit = null;
  for (const f of dateien) {
    const text = fs.readFileSync(new URL(String(f), wurzel), 'utf8');
    warn ??= text.match(/AF_WARTE_WARN\s*=\s*(\d+)/)?.[1] ?? null;
    crit ??= text.match(/AF_WARTE_CRIT\s*=\s*(\d+)/)?.[1] ?? null;
  }
  if (warn === null || crit === null) { t.skip('Konstanten im Frontend nicht gefunden (umbenannt?)'); return; }
  assert.equal(Number(warn), WARTE_NACHHAKEN_TAGE);
  assert.equal(Number(crit), WARTE_PROBLEM_TAGE);
});

// --------------------------------------------------------------- Uebersicht

function statusFuer(m, eintraege) {
  const alle = {};
  for (const [orderNr, lineNr, e] of eintraege) {
    const orderId = `gid://shopify/Order/9000${orderNr}`; const lineItemId = `gid://shopify/LineItem/${lineNr}`;
    alle[positionKey(orderId, lineItemId)] = { orderId, lineItemId, ...e };
  }
  return alle;
}

test('Uebersicht: Stufen, aelteste Bestellung, ueberfaellige, Muster - je Lieferant', () => {
  const m = modell();
  const statusAlle = statusFuer(m, [
    [1, 1, { status: 'bestellt', bestelltAm: '2026-01-04T10:00:00Z', lieferantBestellnummer: 'AB-1' }], // 16 Tage -> Problem
    [1, 2, { status: 'geliefert', bestelltAm: '2026-01-02T10:00:00Z', geliefertAm: '2026-01-12T10:00:00Z' }], // 8 Tage -> Nachhaken
    [2, 5, { status: 'bestellt', bestelltAm: '2026-01-18T10:00:00Z' }],
    [2, 4, { status: 'erledigt', erledigtAm: '2026-01-10T10:00:00Z' }],
  ]);
  const u = lieferantenUebersicht(m, { statusAlle, stammdaten: STAMM, jetzt: JETZT });
  assert.deepEqual(u.schwellen, { nachhakenTage: 7, problemTage: 14 });
  assert.deepEqual(u.lieferanten.map(l => l.id), ['A', 'B']);
  const a = u.lieferanten[0];
  assert.deepEqual(a.positionen, { zuBestellen: 1, bestellt: 1, unterwegs: 1 });
  assert.deepEqual(a.muster, { zuBestellen: 1, bestellt: 1, unterwegs: 0 });
  assert.equal(a.aeltesteOffeneBestellungTage, 16);
  assert.equal(a.aeltesteUnbestellteTage, 19);
  assert.deepEqual(a.ueberfaellig, { nachhaken: 1, problem: 1 });
  assert.equal(a.stammdaten.kundennummer, 'K-000001');
  assert.deepEqual(a.gruppen, [{ schluessel: 'A|SUPPLIER_TO_TP|TP', route: 'SUPPLIER_TO_TP', lieferziel: 'TP', zuBestellen: 1 }]);
  const b = u.lieferanten[1];
  assert.deepEqual(b.positionen, { zuBestellen: 0, bestellt: 0, unterwegs: 0 }, 'erledigte Position zaehlt nicht mehr');
  assert.equal(b.aeltesteOffeneBestellungTage, null);
});

test('Uebersicht ohne Bestelldaten und ohne Stammdaten: leer statt Fehler', () => {
  assert.deepEqual(lieferantenUebersicht(null).lieferanten, []);
  const nurStamm = lieferantenUebersicht(null, { stammdaten: STAMM });
  assert.deepEqual(nurStamm.lieferanten.map(l => [l.id, l.positionen.zuBestellen]), [['A', 0], ['B', 0]]);
  const ohneStamm = lieferantenUebersicht(modell(), { jetzt: JETZT });
  assert.equal(ohneStamm.lieferanten[0].stammdaten.hinterlegt, false);
  assert.equal(ohneStamm.lieferanten[0].name, 'Lieferant A');
});

test('nicht zugeordnete Positionen erscheinen als eigener Eintrag am Ende', () => {
  const frei = zeile({ id: 9, sku: 'TEST-X', title: 'Testware ohne Lieferant', einkauf: [['bestelleinheit', 'stueck']] });
  const m = aufbereiten({ orders: [bestellung(4, [frei]), bestellung(2, [stueckB])] }, { jetzt: JETZT });
  const u = lieferantenUebersicht(m, { stammdaten: STAMM, jetzt: JETZT });
  const letzter = u.lieferanten.at(-1);
  assert.equal(letzter.id, 'UNGEKLAERT');
  assert.equal(letzter.zugeordnet, false);
  assert.equal(letzter.name, 'Lieferant nicht zugeordnet');
  assert.equal(letzter.positionen.zuBestellen, 1);
});

test('Detail liefert Positionslisten, unbekannte Kennung null', () => {
  const m = modell();
  const d = lieferantDetail(m, 'a', { stammdaten: STAMM, jetzt: JETZT });
  assert.equal(d.ware.zuBestellen.length, 3);
  assert.equal(d.musterPositionen.zuBestellen.length, 2);
  assert.deepEqual(d.ueberfaelligePositionen, []);
  const p = d.ware.zuBestellen.find(x => x.artikelnummer === 'A-4711');
  assert.equal(p.farbnummer, '012');
  assert.equal(p.menge, 3);
  assert.equal(p.einheit, 'paket');
  assert.equal(lieferantDetail(m, 'Z', { stammdaten: STAMM }), null);
  assert.equal(lieferantDetail(m, '', { stammdaten: STAMM }), null);
});

test('keine Preise und kein einkauf-Block in Uebersicht, Detail und Mail', () => {
  const m = modell();
  const alles = JSON.stringify([
    lieferantenUebersicht(m, { stammdaten: STAMM, jetzt: JETZT }),
    lieferantDetail(m, 'A', { stammdaten: STAMM, jetzt: JETZT }),
    bestellmail({ modell: m, lieferant: 'A', art: 'ware', stammdaten: STAMM, jetzt: JETZT }),
    bestellmail({ modell: m, lieferant: 'A', art: 'muster', stammdaten: STAMM, jetzt: JETZT }),
  ]);
  assert.equal(/"preis"|"betrag"|19\.9|"einkauf"|"waehrung"|marge/i.test(alles), false);
});

// --------------------------------------------------------------- Bestellmail

test('Ware: fertige Mail, ungeklaerte Positionen getrennt als fehlt', () => {
  const r = bestellmail({ modell: modell(), lieferant: 'A', art: 'ware', gruppe: 'A|SUPPLIER_TO_TP|TP', ziel: 'laden', stammdaten: STAMM, jetzt: JETZT });
  assert.equal(r.automatischGesendet, false);
  assert.equal(r.mails.length, 1);
  const mail = r.mails[0];
  assert.equal(mail.weg, 'portal');
  assert.equal(mail.portalUrl, 'https://lieferant-a.example/haendler');
  assert.equal(mail.an, 'bestellung@lieferant-a.example');
  assert.equal(mail.betreff, 'Bestellung – Kd.-Nr. K-000001 – #T1');
  assert.equal(mail.positionen.length, 1);
  assert.match(mail.text, /^Guten Tag Frau Muster,\n\nwir bestellen folgende Ware:/);
  assert.match(mail.text, /Unsere Kundennummer: K-000001/);
  assert.equal(/Testdiele|Natur/.test(mail.text), false, 'keine Shop-Produktnamen in der Mail an den Lieferanten');
  assert.match(mail.text, /1\. Art\.-Nr\. A-4711 · Farb-Nr\. 012\n {3}Menge: 3 Paket\(e\) = 6,60 m²\n {3}Kommission: #T1/);
  assert.match(mail.text, /Lieferanschrift:\nBeispielhandel GmbH\nMusterweg 1\n00000 Musterstadt/);
  assert.match(mail.text, /Viele Grüße\nErika Beispiel\nBeispielhandel GmbH$/);
  assert.equal(mail.text.includes('A-0815'), false, 'Position ohne Menge darf nicht in der Mail stehen');
  assert.equal(mail.text.includes('Testleiste'), false);
  assert.deepEqual(mail.fehlt.map(f => [f.titel, f.gruende.length]), [['Testteppich Wolke', 1], ['Testleiste', 1]]);
  assert.match(mail.fehlt[0].gruende[0], /Bestellmenge ungeklärt \(Bestelleinheit fehlt/);
  assert.match(mail.fehlt[1].gruende[0], /Artikelnummer beim Lieferanten fehlt/);
  assert.deepEqual(mail.stammdatenFehlt, []);
  assert.equal(mail.lieferziel, 'laden');
  assert.ok(mail.mailto.startsWith('mailto:bestellung@lieferant-a.example?subject=Bestellung%20'));
  assert.equal(mail.mailtoGekuerzt, false);
});

test('Ware: bereits bestellte Positionen werden nicht noch einmal bestellt', () => {
  const m = modell();
  const statusAlle = statusFuer(m, [[1, 1, { status: 'bestellt', bestelltAm: '2026-01-19T10:00:00Z' }]]);
  const mail = bestellmail({ modell: m, lieferant: 'A', statusAlle, stammdaten: STAMM, jetzt: JETZT }).mails[0];
  assert.equal(mail.positionen.length, 0);
  assert.equal(mail.bereitsBestellt, 1);
  assert.equal(mail.text, null);
  assert.equal(mail.mailto, null);
  assert.equal(mail.fehlt.length, 2);
});

test('Ware ohne Stammdaten: Text zum Kopieren, kein Empfaenger, Luecken benannt', () => {
  const mail = bestellmail({ modell: modell(), lieferant: 'A', ziel: 'laden', jetzt: JETZT }).mails[0];
  assert.equal(mail.an, null);
  assert.equal(mail.mailto, null);
  assert.equal(mail.weg, null);
  assert.deepEqual(mail.stammdatenFehlt, ['kundennummer', 'ware.weg', 'ware.mail']);
  assert.equal(mail.betreff, 'Bestellung – #T1');
  assert.match(mail.text, /^Sehr geehrte Damen und Herren,/);
  assert.match(mail.text, /Lieferung bitte an unsere bekannte Geschäftsadresse\./);
  assert.equal(mail.text.includes('Kundennummer'), false);
  assert.match(mail.text, /Mit freundlichen Grüßen\nTeppich Paradies$/);
});

test('Ware Direktversand: Kundenanschrift steht in der Mail, ohne Anschrift fehlt die Position', () => {
  const direkt = zeile({ id: 7, sku: 'TEST-B-2', title: 'Testmatte', variantTitle: 'Rot',
    einkauf: [['lieferant', 'B'], ['artikelnummer', 'B-78'], ['bestelleinheit', 'stueck'], ['route', 'SUPPLIER_DIRECT'], ['neutralversand', 'VERIFIED']] });
  const m = aufbereiten({ orders: [bestellung(5, [direkt]), bestellung(6, [{ ...direkt, id: 'gid://shopify/LineItem/8' }], { shippingAddress: null })] }, { jetzt: JETZT });
  const r = bestellmail({ modell: m, lieferant: 'B', stammdaten: STAMM, jetzt: JETZT });
  assert.equal(r.mails.length, 2, 'Direktversand verschiedener Kunden wird nie gemischt');
  const [mit, ohne] = r.mails;
  assert.equal(mit.lieferziel, 'kunde');
  assert.match(mit.text, /Bitte liefern Sie direkt an unseren Kunden:\nTestkunde 5\nTestweg 5\n00000 Musterstadt\nDeutschland/);
  assert.equal(mit.an, 'order@lieferant-b.example');
  assert.deepEqual(mit.stammdatenFehlt, ['kundennummer']);
  assert.equal(ohne.positionen.length, 0);
  assert.deepEqual(ohne.fehlt[0].gruende, ['Lieferanschrift des Kunden fehlt']);
});

test('Muster direkt an Kunden: Anschrift je Bestellung, fehlende Anschrift und Farbnummer werden gemeldet', () => {
  const r = bestellmail({ modell: modell(), lieferant: 'A', art: 'muster', stammdaten: STAMM, jetzt: JETZT });
  assert.equal(r.mails.length, 1);
  const mail = r.mails[0];
  assert.equal(mail.an, 'muster@lieferant-a.example');
  assert.equal(mail.ansprechperson, 'Frau Muster');
  assert.equal(mail.lieferziel, 'kunde');
  assert.equal(mail.betreff, 'Musterbestellung – Kd.-Nr. K-000001 – 1 Muster – #T2');
  assert.match(mail.text, /bitte senden Sie folgende Muster direkt an unsere Kunden:/);
  assert.match(mail.text, /Lieferanschrift \(Kommission #T2\):\nTestkunde 2\nTestweg 2\n00000 Musterstadt\nDeutschland\n\n1\. Art\.-Nr\. A-0815 · Farb-Nr\. 020\n {3}Menge: 1 Muster/);
  assert.deepEqual(mail.fehlt.map(f => f.gruende), [['Lieferanschrift des Kunden fehlt']]);
  assert.deepEqual(mail.ohneBestellung, []);
});

test('Muster an den Laden (ziel ueberstimmt Stammdaten): alle in einer Liste, Farbe ohne Nummer als Hinweis', () => {
  const mail = bestellmail({ modell: modell(), lieferant: 'A', art: 'muster', ziel: 'laden', stammdaten: STAMM, jetzt: JETZT }).mails[0];
  assert.equal(mail.lieferziel, 'laden');
  assert.equal(mail.positionen.length, 2);
  assert.deepEqual(mail.fehlt, []);
  assert.match(mail.text, /bitte senden Sie uns folgende Muster:/);
  assert.match(mail.text, /\n1× Art\.-Nr\. A-0815\n/);
  assert.equal(mail.betreff, 'Musterbestellung');
  assert.equal(mail.text.includes('Testteppich'), false);
  assert.equal(/Kommission|Lieferanschrift|Geschäftsadresse/.test(mail.text), false);
  assert.match(mail.hinweise[0], /1 Position\(en\) ohne Farbnummer/);
});

// Hersteller, bei denen einkauf.artikelnummer unsere eigene SKU ist: die Mustermail nennt
// ihre Bezeichnung (einkauf.farbname), sonst erkennt der Hersteller das Muster nicht.
const herstellerQuelle = (id, { lieferant = 'E', artikel, farbnr, farbname = null }) => ({
  id: `gid://shopify/ProductVariant/${id}`, sku: artikel, title: 'Quelle',
  metafields: { nodes: [mf('einkauf', 'lieferant', lieferant), mf('einkauf', 'artikelnummer', artikel), mf('einkauf', 'farbnummer', farbnr), ...(farbname ? [mf('einkauf', 'farbname', farbname)] : [])] },
  lieferant: { nodes: [] },
  product: { id: `gid://shopify/Product/${id}`, handle: `herstellerprodukt-${id}`, title: 'Herstellerprodukt', metafields: { nodes: [] }, grosshandel: { nodes: [] } },
});
const herstellerMuster = (id, quelle) => zeile({ id, sku: `M-H-${id}`, title: 'Muster Herstellerprodukt', variantTitle: 'Farbe', preis: '0.00',
  attrs: [{ key: '_Quellvariante_ID', value: String(quelle) }] });
function herstellerModell(lieferant = 'E') {
  return aufbereiten({
    orders: [bestellung(4, [herstellerMuster(41, 901), herstellerMuster(42, 902), herstellerMuster(43, 903)])],
    quellvarianten: [
      herstellerQuelle(901, { lieferant, artikel: 'TEST-QUALI-1Q00-400', farbnr: '1Q00', farbname: 'Testquali 1Q00' }),
      herstellerQuelle(902, { lieferant, artikel: 'TEST-3786-072', farbnr: '072', farbname: 'Testflor 3786/072' }),
      // Ohne Bezeichnung (Vinyl): die Artikelnummer ist die echte, die gleiche Farbnummer nicht doppelt.
      herstellerQuelle(903, { lieferant, artikel: 'J-0000-03', farbnr: 'J-0000-03' }),
    ],
  }, { jetzt: JETZT });
}
const herstellerStamm = nachBezeichnung => pruefeStammdaten({ lieferanten: { E: { kundennummer: 'K-5', muster: { weg: 'mail', mail: 'muster@lieferant-e.example', ansprechperson: 'Frau Beispiel', lieferung: 'kunde', nachBezeichnung } } } });

test('Herstellermuster (muster.nachBezeichnung): Mail nennt die Bezeichnung des Herstellers statt unserer SKU', () => {
  const st = herstellerStamm(true);
  assert.deepEqual(st.fehler, []);
  assert.equal(st.lieferanten.E.muster.nachBezeichnung, true);
  const mail = bestellmail({ modell: herstellerModell(), lieferant: 'E', art: 'muster', stammdaten: st, jetzt: JETZT }).mails[0];
  assert.equal(mail.an, 'muster@lieferant-e.example');
  assert.equal(mail.positionen.length, 3);
  assert.match(mail.text, /^Guten Tag Frau Beispiel,/);
  assert.match(mail.text, /Lieferanschrift \(Kommission #T4\):\nTestkunde 4\nTestweg 4\n00000 Musterstadt/);
  assert.match(mail.text, /\n1\. Testquali 1Q00\n {3}Menge: 1 Muster\n/);
  assert.match(mail.text, /\n2\. Testflor 3786\/072\n/);
  assert.match(mail.text, /\n3\. Art\.-Nr\. J-0000-03\n/);
  assert.equal(/TEST-QUALI|TEST-3786|Farb-Nr\./.test(mail.text), false, 'keine eigene SKU, keine doppelte Farbnummer');
  const laden = bestellmail({ modell: herstellerModell(), lieferant: 'E', art: 'muster', ziel: 'laden', stammdaten: st, jetzt: JETZT }).mails[0];
  assert.match(laden.text, /\n1× Testquali 1Q00\n1× Testflor 3786\/072\n1× Art\.-Nr\. J-0000-03\n/);
});

test('Ohne muster.nachBezeichnung bleibt es bei Artikel- und Farbnummer, auch wenn ein Farbname da ist', () => {
  const st = herstellerStamm(false);
  assert.equal(st.lieferanten.E.muster.nachBezeichnung, false);
  const mail = bestellmail({ modell: herstellerModell(), lieferant: 'E', art: 'muster', ziel: 'laden', stammdaten: st, jetzt: JETZT }).mails[0];
  assert.match(mail.text, /\n1× Art\.-Nr\. TEST-QUALI-1Q00-400 · Farb-Nr\. 1Q00\n1× Art\.-Nr\. TEST-3786-072 · Farb-Nr\. 072\n1× Art\.-Nr\. J-0000-03\n/);
  assert.equal(mail.text.includes('Testquali'), false);
  // Teilstring ist kein Treffer: Farbnummer "4" bleibt bei "TEPDOLCE4_004" stehen (eigener Fall A).
  const a = aufbereiten({ orders: [bestellung(2, [muster1])], quellvarianten: [quellvariante(777, 'TEST4_004', '4')] }, { jetzt: JETZT });
  assert.match(bestellmail({ modell: a, lieferant: 'A', art: 'muster', ziel: 'laden', stammdaten: STAMM, jetzt: JETZT }).mails[0].text, /\n1× Art\.-Nr\. TEST4_004 · Farb-Nr\. 4\n/);
});

// Dieselben Hersteller bei Ware: einkauf.artikelnummer ist unsere SKU je Breite, die
// Bezeichnung steht in einkauf.farbname. Menge, Rollenbreite und Fertigmass bleiben, wie sie sind.
function herstellerWareModell(lieferant = 'E') {
  const e = (artikel, farbnr, farbname, einheit) => [['lieferant', lieferant], ['artikelnummer', artikel], ['farbnummer', farbnr], ...(farbname ? [['farbname', farbname]] : []), ['bestelleinheit', einheit], ['route', 'SUPPLIER_TO_TP']];
  const rolle = zeile({ id: 30, sku: 'TEST-QUALI-1Q00-400', title: 'Testquali Teppichboden', variantTitle: '400 cm', quantity: 1,
    einkauf: e('TEST-QUALI-1Q00-400', '1Q00', 'Testquali 1Q00', 'lfm'), custom: [['rollenbreite', '4']],
    attrs: [{ key: 'Gewünschte Länge', value: '500 cm' }] });
  const mass = zeile({ id: 31, sku: null, title: 'Testflor nach Maß', variantTitle: 'Blau', quantity: 775, preis: '0.39',
    einkauf: e('TEST-3786-072', '072', 'Testflor 3786/072', 'lfm'), custom: [['preis_pro_001_qm', 'true']],
    attrs: [{ key: 'Einfassung', value: 'Gekettelt' }, { key: 'Form', value: 'Rechteck' }, { key: 'Maße', value: '250 × 310 cm' }] });
  // Ohne Bezeichnung (Vinyl): die Artikelnummer ist schon die echte, die gleiche Farbnummer nicht doppelt.
  const vinyl = zeile({ id: 32, sku: 'J-0000-03', title: 'Testvinyl', variantTitle: 'Eiche', quantity: 2,
    einkauf: e('J-0000-03', 'J-0000-03', null, 'paket'), custom: [['qm_pro_paket', '2,2']] });
  return aufbereiten({ orders: [bestellung(4, [rolle, mass, vinyl], { shippingAddress: { name: 'Testkunde 4', address1: 'Testweg 4', zip: '00000', city: 'Musterstadt', country: 'Deutschland', phone: '+49 000 0000' } })] }, { jetzt: JETZT });
}
const herstellerWareStamm = nachBezeichnung => pruefeStammdaten({ lieferanten: { E: { kundennummer: 'K-5', ware: { weg: 'mail', mail: 'bestellung@lieferant-e.example', nachBezeichnung } } } });

test('Herstellerware (ware.nachBezeichnung): Mail nennt die Bezeichnung des Herstellers statt unserer SKU', () => {
  const st = herstellerWareStamm(true);
  assert.deepEqual(st.fehler, []);
  assert.equal(st.lieferanten.E.ware.nachBezeichnung, true);
  assert.equal(st.lieferanten.E.muster.nachBezeichnung, false, 'Ware und Muster getrennt');
  // Standard: direkt an den Kunden, je Kommission ein Block.
  const mail = bestellmail({ modell: herstellerWareModell(), lieferant: 'E', art: 'ware', stammdaten: st, jetzt: JETZT }).mails[0];
  assert.equal(mail.an, 'bestellung@lieferant-e.example');
  assert.equal(mail.lieferziel, 'kunde');
  assert.equal(mail.positionen.length, 3);
  assert.deepEqual(mail.fehlt, []);
  assert.match(mail.text, /\n1\. Testquali 1Q00\n {3}Menge: 5,00 lfm × 4,00 m\n {3}Kommission: #T4\n/);
  assert.match(mail.text, /\n2\. Testflor 3786\/072\n {3}Menge: 1 Stück nach Maß\n {3}Fertigmaß: 250 × 310 cm \(Rechteck\)\n {3}Einfassung: Gekettelt\n/);
  assert.match(mail.text, /\n3\. Art\.-Nr\. J-0000-03\n {3}Menge: 2 Paket\(e\) = 4,40 m²\n/);
  assert.equal(/TEST-QUALI|TEST-3786|Farb-Nr\./.test(mail.text), false, 'keine eigene SKU, keine doppelte Farbnummer');
  // An den Laden: dieselben Kopfzeilen, die Kommission bleibt.
  const laden = bestellmail({ modell: herstellerWareModell(), lieferant: 'E', art: 'ware', ziel: 'laden', stammdaten: st, jetzt: JETZT }).mails[0];
  assert.match(laden.text, /\n1\. Testquali 1Q00\n {3}Menge: 5,00 lfm × 4,00 m\n {3}Kommission: #T4 · Testkunde 4\n/);
  assert.match(laden.text, /\n3\. Art\.-Nr\. J-0000-03\n/);
  assert.equal(/TEST-QUALI|TEST-3786/.test(laden.text), false);
});

test('Ohne ware.nachBezeichnung bleibt es bei Artikel- und Farbnummer; Lieferant A unveraendert', () => {
  for (const wert of [false, 'ja', undefined]) {
    const st = herstellerWareStamm(wert);
    assert.deepEqual(st.fehler, []);
    assert.equal(st.lieferanten.E.ware.nachBezeichnung, false, String(wert));
    const mail = bestellmail({ modell: herstellerWareModell(), lieferant: 'E', art: 'ware', ziel: 'laden', stammdaten: st, jetzt: JETZT }).mails[0];
    assert.match(mail.text, /\n1\. Art\.-Nr\. TEST-QUALI-1Q00-400 · Farb-Nr\. 1Q00\n {3}Menge: 5,00 lfm × 4,00 m\n/);
    assert.match(mail.text, /\n2\. Art\.-Nr\. TEST-3786-072 · Farb-Nr\. 072\n/);
    assert.match(mail.text, /\n3\. Art\.-Nr\. J-0000-03\n/);
    assert.equal(/Testquali|Testflor/.test(mail.text), false, String(wert));
  }
  // Lieferant A fuellt einkauf.farbname ebenfalls (Dekorwoerter): ohne Feld bleibt die Mail, wie sie war.
  assert.equal(STAMM.lieferanten.A.ware.nachBezeichnung, false);
  const mitFarbname = { ...paket, variant: { ...paket.variant, metafields: { nodes: [...paket.variant.metafields.nodes, mf('einkauf', 'farbname', 'Testdekor Eiche')] } } };
  const a = aufbereiten({ orders: [bestellung(1, [mitFarbname])] }, { jetzt: JETZT });
  const text = bestellmail({ modell: a, lieferant: 'A', art: 'ware', ziel: 'laden', stammdaten: STAMM, jetzt: JETZT }).mails[0].text;
  assert.match(text, /\n1\. Art\.-Nr\. A-4711 · Farb-Nr\. 012\n {3}Menge: 3 Paket\(e\) = 6,60 m²\n/);
  assert.equal(text.includes('Testdekor'), false);
});

test('Muster ohne festgelegtes Lieferziel: nichts wird aufgenommen', () => {
  const mail = bestellmail({ modell: modell(), lieferant: 'A', art: 'muster', jetzt: JETZT }).mails[0];
  assert.equal(mail.positionen.length, 0);
  assert.equal(mail.text, null);
  assert.equal(mail.fehlt.length, 2);
  assert.match(mail.fehlt[0].gruende[0], /Lieferziel für Muster nicht festgelegt/);
});

test('Muster ohne Quellvariante (keine Artikelnummer) landet in fehlt', () => {
  const m = aufbereiten({ orders: [bestellung(2, [muster1])], quellvarianten: [] }, { jetzt: JETZT });
  const r = bestellmail({ modell: m, lieferant: 'UNGEKLAERT', art: 'muster', ziel: 'laden', stammdaten: STAMM, jetzt: JETZT });
  assert.deepEqual(r.mails[0].fehlt[0].gruende, ['Artikelnummer beim Lieferanten fehlt']);
  assert.equal(r.mails[0].an, null);
});

test('Eingaben werden geprueft; unbekannter Lieferant liefert keine Mail', () => {
  const m = modell();
  assert.throws(() => bestellmail({ modell: m, lieferant: '' }), LieferantenFehler);
  assert.throws(() => bestellmail({ modell: m, lieferant: 'A', art: 'fax' }), LieferantenFehler);
  assert.throws(() => bestellmail({ modell: m, lieferant: 'A', art: 'muster', ziel: 'mond' }), LieferantenFehler);
  assert.throws(() => bestellmail({ modell: m, lieferant: 'A', gruppe: 'A|X|Y' }), /Gruppe nicht gefunden/);
  assert.deepEqual(bestellmail({ modell: m, lieferant: 'C' }).mails, []);
});

// -------------------------------------------------------------------- mailto

test('mailto: Umlaute, Zeilenumbrueche und Sonderzeichen korrekt kodiert', () => {
  const { mailto, gekuerzt } = mailtoLink({ an: 'muster@lieferant-a.example', betreff: 'Bestellung – Größe & Maß #T1', text: 'Zeile 1\nZeile 2 + 50%?' });
  assert.equal(gekuerzt, false);
  assert.equal(mailto, 'mailto:muster@lieferant-a.example?subject=Bestellung%20%E2%80%93%20Gr%C3%B6%C3%9Fe%20%26%20Ma%C3%9F%20%23T1&body=Zeile%201%0D%0AZeile%202%20%2B%2050%25%3F');
  const u = new URL(mailto);
  assert.equal(u.searchParams.get('subject'), 'Bestellung – Größe & Maß #T1');
  assert.equal(decodeURIComponent(mailto.split('&body=')[1]), 'Zeile 1\r\nZeile 2 + 50%?');
});

test('mailto: bei Ueberlaenge nur Empfaenger und Betreff', () => {
  const text = 'Position mit langer Bezeichnung äöü\n'.repeat(80);
  const { mailto, gekuerzt } = mailtoLink({ an: 'muster@lieferant-a.example', betreff: 'Musterbestellung', text });
  assert.equal(gekuerzt, true);
  assert.equal(mailto, 'mailto:muster@lieferant-a.example?subject=Musterbestellung');
  assert.ok(mailto.length <= MAILTO_MAX);
});

test('mailto: ohne oder mit ungueltigem Empfaenger kein Link', () => {
  assert.deepEqual(mailtoLink({ an: null, betreff: 'x', text: 'y' }), { mailto: null, gekuerzt: false });
  assert.equal(mailtoLink({ an: 'a@b.example?cc=x@y.example', betreff: 'x' }).mailto, null);
});

test('lange Musterbestellung: Link gekuerzt, Text vollstaendig', () => {
  const viele = Array.from({ length: 30 }, (_, i) => zeile({ id: 100 + i, sku: `M-TEST-${i}`, title: 'Muster Testteppich', variantTitle: `Farbe ${i}`, preis: '0.00',
    attrs: [{ key: '_Quellvariante_ID', value: '777' }, { key: 'Produkt', value: 'Testteppich Wolke' }] }));
  const m = aufbereiten({ orders: [bestellung(2, viele)], quellvarianten: [quellvariante(777, 'A-0815', '020')] }, { jetzt: JETZT });
  const mail = bestellmail({ modell: m, lieferant: 'A', art: 'muster', stammdaten: STAMM, jetzt: JETZT }).mails[0];
  assert.equal(mail.positionen.length, 30);
  assert.equal(mail.mailtoGekuerzt, true);
  assert.match(mail.mailto, /^mailto:muster@lieferant-a\.example\?subject=Musterbestellung[^&]*$/);
  assert.match(mail.text, /30\. Art\.-Nr\. A-0815/);
});

// ------------------------------------------------- Muster "haben wir da" (musterherkunft.mjs)

test('Muster aus eigenem Bestand: nicht in der Mail, nicht "zu bestellen", mit Grund unter ohneBestellung', async () => {
  const { wendeAufModellAn } = await import('../lib/musterherkunft.mjs');
  const m = modell();
  // Bestellung #T2 (Muster 1): persoenlich vorbeibringen - Wahl fuer die ganze Bestellung.
  wendeAufModellAn(m, [{ orderId: 'gid://shopify/Order/90002', lineItemId: null, herkunft: 'eigen_vorbei', am: '2026-01-15T10:00:00Z', von: 'Mitarbeiter 1' }]);
  const mail = bestellmail({ modell: m, lieferant: 'A', art: 'muster', ziel: 'laden', stammdaten: STAMM, jetzt: JETZT }).mails[0];
  assert.equal(mail.positionen.length, 1, 'nur das zweite Muster bleibt in der Mail');
  assert.equal(mail.text.includes('Farb-Nr. 020'), false);
  assert.deepEqual(mail.ohneBestellung.map(f => [f.orderName, f.gruende]), [['#T2', ['aus eigenem Bestand – wird persönlich vorbeigebracht']]]);
  const a = lieferantenUebersicht(m, { stammdaten: STAMM, jetzt: JETZT }).lieferanten.find(l => l.id === 'A');
  assert.deepEqual(a.muster, { zuBestellen: 1, bestellt: 0, unterwegs: 0 });
  assert.equal(a.musterEigenerBestand, 1);
});

// ------------------------------------------------------ Schnellzugriff (Lexikon)

const ARTIKEL_B = { artikelnummer: 'B-6924', farbnummer: '004', produktname: 'Testfell 35 rund silber' };

test('Lexikon-Kuerzel: "B" und "Lieferant B" ergeben B, Leeres und UNGEKLAERT nichts', () => {
  assert.equal(kennungAusLexikon('B'), 'B');
  assert.equal(kennungAusLexikon('Lieferant b'), 'B');
  assert.equal(kennungAusLexikon(''), null);
  assert.equal(kennungAusLexikon(null), null);
  assert.equal(kennungAusLexikon('UNGEKLAERT'), null);
  assert.equal(kennungAusLexikon('irgendein Freitext'), null);
});

test('Schnellzugriff: Lieferant nur mit Mail -> fertige Bestellmail mit Artikel- und Farbnummer, ohne Shop-Namen', () => {
  const st = pruefeStammdaten({ lieferanten: { B: { kundennummer: 'K-42', ware: { weg: 'mail', mail: 'order@lieferant-b.example', telefon: '+49 30 2222222' }, mail: { anrede: 'Hallo,' } } } });
  const sz = lexikonSchnellzugriff(st, 'B', { artikel: ARTIKEL_B });
  assert.equal(sz.lieferant, 'B');
  assert.equal(sz.weg, 'mail');
  assert.equal(sz.hinweis, null);
  assert.equal(sz.kundennummer, 'K-42');
  assert.deepEqual(sz.aktionen.map(a => a.weg), ['mail', 'telefon'], 'Hauptweg zuerst, dann die weiteren Kontakte');
  const mail = sz.aktionen[0];
  assert.equal(mail.label, 'Bestellmail an Lieferant B');
  assert.equal(mail.an, 'order@lieferant-b.example');
  assert.equal(mail.betreff, 'Bestellung – Kd.-Nr. K-42 – Art.-Nr. B-6924');
  assert.match(mail.text, /^Hallo,\n/);
  assert.match(mail.text, /Unsere Kundennummer: K-42/);
  assert.match(mail.text, /Art\.-Nr\. B-6924 · Farb-Nr\. 004\n {3}Testfell 35 rund silber\n {3}Menge: /);
  assert.match(mail.text, /Lieferanschrift: /);
  assert.ok(mail.mailto.startsWith('mailto:order@lieferant-b.example?subject='));
  assert.equal(sz.aktionen[1].label, 'Anrufen');
  assert.equal(sz.aktionen[1].nummer, '+49 30 2222222');
});

test('Schnellzugriff: Hauptweg Portal bzw. Telefon steht vorn', () => {
  const portal = lexikonSchnellzugriff(STAMM, 'A', { artikel: { artikelnummer: 'A-1' } });
  assert.deepEqual(portal.aktionen.map(a => a.weg), ['portal', 'mail', 'telefon']);
  assert.equal(portal.aktionen[0].label, 'Im Portal bestellen');
  assert.equal(portal.aktionen[0].href, 'https://lieferant-a.example/haendler');
  const tel = pruefeStammdaten({ lieferanten: { C: { ware: { weg: 'telefon', telefon: '+49 30 3333333', mail: 'c@lieferant-c.example' } } } });
  assert.deepEqual(lexikonSchnellzugriff(tel, 'C').aktionen.map(a => a.weg), ['telefon', 'mail']);
});

test('Schnellzugriff ohne Stammdaten: keine Aktion, Hinweis sagt was fehlt - nichts geraten', () => {
  const sz = lexikonSchnellzugriff(pruefeStammdaten({}), 'B', { artikel: ARTIKEL_B });
  assert.deepEqual(sz.aktionen, []);
  assert.equal(sz.weg, null);
  assert.match(sz.hinweis, /Bestellweg von Lieferant B nicht hinterlegt/);
  assert.equal(sz.stammdatenEintrag, false);
  assert.match(sz.hinweis, /lieferanten\/stammdaten\.json/, 'ohne Eintrag fuehrt keine Lieferantenseite weiter - die Datei steht im Hinweis');
  const leer = lexikonSchnellzugriff(pruefeStammdaten({ lieferanten: { B: { muster: { lieferung: 'laden' } } } }), 'B');
  assert.equal(leer.stammdatenEintrag, true, 'mit Eintrag zeigt der Einkauf, was fehlt');
  assert.doesNotMatch(leer.hinweis, /stammdaten\.json/);
  assert.equal(lexikonSchnellzugriff(null, 'B').aktionen.length, 0, 'auch ohne Stammdatendatei');
  assert.equal(lexikonSchnellzugriff(STAMM, null), null, 'ohne Lieferant kein Schnellzugriff');
});

test('Schnellzugriff fuer Muster nutzt den Musterweg und schreibt eine Musterbestellung', () => {
  const sz = lexikonSchnellzugriff(STAMM, 'A', { artikel: { artikelnummer: 'A-4711', farbnummer: '023' }, art: 'muster' });
  assert.equal(sz.art, 'muster');
  assert.equal(sz.aktionen[0].weg, 'mail');
  assert.equal(sz.aktionen[0].label, 'Musterbestellung an Lieferant A');
  assert.equal(sz.aktionen[0].an, 'muster@lieferant-a.example');
  assert.match(sz.aktionen[0].text, /1× Art\.-Nr\. A-4711 · Farb-Nr\. 023/);
  assert.ok(sz.aktionen[0].betreff.startsWith('Musterbestellung'));
});

test('Lexikon-Produkt: Schnellzugriff nur an Varianten ohne Direkt- und Suchlink, Export bleibt unveraendert', () => {
  const produkt = {
    handle: 'testteppich',
    varianten: [
      { id: 'v1', einkauf: { lieferant: 'A', artikelnummer: 'A-1', url: 'https://lieferant-a.example/a-1' }, link: { status: 'vorhanden', grund: null, suchlink: null } },
      { id: 'v2', einkauf: { lieferant: 'A', artikelnummer: 'A-2' }, link: { status: 'nur_artikelnummer', grund: 'x', suchlink: 'https://lieferant-a.example/suche?q=A-2' } },
      { id: 'v3', einkauf: { lieferant: 'B', ...ARTIKEL_B }, link: { status: 'nur_artikelnummer', grund: 'Artikelnummer vorhanden, aber kein Link hinterlegt (Lieferant B)', suchlink: null } },
      { id: 'v4', einkauf: { lieferant: null }, link: { status: 'fehlt', grund: 'keine Einkaufsdaten', suchlink: null } },
      { id: 'm1', original: { gefunden: true, lieferant: 'B', artikelnummer: 'B-6924', url: null, suchlink: null } },
      { id: 'm2', original: { gefunden: true, lieferant: 'A', artikelnummer: 'A-1', url: 'https://lieferant-a.example/a-1' } },
    ],
  };
  const vorher = JSON.stringify(produkt);
  const r = lexikonProduktMitSchnellzugriff(produkt, STAMM);
  assert.equal(JSON.stringify(produkt), vorher, 'das Exportobjekt wird nicht veraendert');
  const [v1, v2, v3, v4, m1, m2] = r.varianten;
  assert.equal(v1.link.schnellzugriff, undefined);
  assert.equal(v2.link.schnellzugriff, undefined, 'Suchlink reicht als Schnellzugriff');
  assert.equal(v3.link.schnellzugriff.aktionen[0].label, 'Bestellmail an Lieferant B');
  assert.equal(v4.link.schnellzugriff, undefined, 'ohne Lieferant bleibt der Grund stehen');
  assert.equal(m1.original.schnellzugriff.art, 'muster');
  assert.equal(m1.original.schnellzugriff.aktionen[0].an, 'order@lieferant-b.example');
  assert.equal(m2.original.schnellzugriff, undefined);
});

// ------------------------------------------- Teppich nach Mass: Zuschnitt, Ketteln, Kunde

function massteppichModell({ mitEinfassungAmTeppich = true, masse = '250 × 310 cm', form = 'Rechteck', quantity = 775, route = 'SUPPLIER_TO_TP' } = {}) {
  const teppich = zeile({ id: 20, sku: null, title: 'Testteppich nach Maß', variantTitle: 'Sandbeige (036)', quantity, preis: '0.39',
    einkauf: [['lieferant', 'A'], ['artikelnummer', 'A-TNM'], ['farbnummer', '036'], ['bestelleinheit', 'lfm'], ['route', route]],
    custom: [['preis_pro_001_qm', 'true']],
    attrs: [
      ...(mitEinfassungAmTeppich ? [{ key: 'Einfassung', value: 'Gekettelt' }, { key: 'Kante umlaufend', value: '11,20 m' }, { key: 'Garn', value: 'Ton in Ton' }] : []),
      { key: 'Form', value: form }, { key: 'Maße', value: masse },
      { key: '_Zuschnitt aus Rolle', value: '400 cm' }, { key: '_Gruppe', value: 'Kabc' },
    ] });
  const kettel = zeile({ id: 21, sku: null, title: 'Kettelservice', variantTitle: 'je 0,01 laufender Meter', quantity: 1120,
    attrs: [{ key: 'Kante umlaufend', value: '11,20 m' }, { key: '_Gruppe', value: 'Kabc' }] });
  kettel.variant.product.handle = 'kettelservice';
  return aufbereiten({ orders: [bestellung(4, [teppich, kettel], { shippingAddress: { name: 'Testkunde 4', address1: 'Testweg 4', zip: '00000', city: 'Musterstadt', country: 'Deutschland', phone: '+49 000 0000' } })] }, { jetzt: JETZT });
}

test('Massteppich: Fertigmass, Rolle, Ketteln und Kunde stehen in der Mail, kein interner Rastervermerk', () => {
  const mail = bestellmail({ modell: massteppichModell(), lieferant: 'A', ziel: 'laden', stammdaten: STAMM, jetzt: JETZT }).mails[0];
  assert.match(mail.text, /Menge: 1 Stück nach Maß\n {3}Fertigmaß: 250 × 310 cm \(Rechteck\)\n {3}Einfassung: Gekettelt, umlaufend 11,20 m, Garn Ton in Ton\n {3}Kommission: #T4 · Testkunde 4/);
  assert.equal(mail.text.includes('Lieferantenraster'), false);
  assert.equal(/Rolle|lfm/.test(mail.text), false, 'Rollenbreite entscheidet der Lieferant');
  assert.equal(mail.text.includes('Kettelservice'), false, 'Kettelservice ist keine eigene Bestellposition');
  assert.equal(mail.zielWaehlbar, true);
});

test('Massteppich: unlesbare und nichtpositive Maße fehlen im Bestelltext mit Klärgrund', () => {
  for (const masse of ['unbekannt', '0 × 310 cm', '250 × 0 cm', '-250 × 310 cm', '250 × -310 cm', 'Infinity × 310 cm', '250 × Infinity cm']) {
    const modell = massteppichModell({ masse });
    const p = modell.auftraege[0].positionen[0];
    assert.equal(p.bestellmenge.menge, UNGEKLAERT, masse);
    assert.match(p.bestellmenge.grund, /Fertigmaß.*Breite und Länge prüfen/, masse);
    const mail = bestellmail({ modell, lieferant: 'A', stammdaten: STAMM, jetzt: JETZT }).mails[0];
    assert.equal(mail.positionen.length, 0, masse);
    assert.equal(mail.fehlt.length, 1, masse);
    assert.equal(mail.fehlt[0].lineItemId, p.lineItemId, masse);
    assert.match(mail.fehlt[0].gruende.join(' · '), /Bestellmenge ungeklärt.*Fertigmaß/, masse);
    assert.equal(mail.text, null, masse);
    assert.equal(mail.mailto, null, masse);
  }
});

test('Massteppich: gültiger runder Teppich bleibt ein Stück mit unverändertem Durchmesser im Bestelltext', () => {
  const modell = massteppichModell({ masse: 'Ø 200 cm', form: 'Rund', quantity: 400 });
  const p = modell.auftraege[0].positionen[0];
  assert.equal(p.bestellmenge.menge, 1);
  assert.equal(p.bestellmenge.einheit, 'stueck');
  // Ziel Laden: der Lieferant kettelt selbst, also ohne Kettelpuffer (den deckt ein eigener Test ab).
  const mail = bestellmail({ modell, lieferant: 'A', ziel: 'laden', stammdaten: STAMM, jetzt: JETZT }).mails[0];
  assert.equal(mail.positionen.length, 1);
  assert.equal(mail.fehlt.length, 0);
  assert.match(mail.text, /Menge: 1 Stück nach Maß\n {3}Fertigmaß: Ø 200 cm \(Rund\)/);
  assert.equal(/Rolle|lfm/.test(mail.text), false);
});

test('Massteppich: Kettelung nur an der Kettelservice-Zeile wird trotzdem bestellt', () => {
  // Ziel Laden: der Lieferant kettelt selbst (ohne Ziel ginge es nach der Regel zum Kettler).
  const mail = bestellmail({ modell: massteppichModell({ mitEinfassungAmTeppich: false }), lieferant: 'A', ziel: 'laden', stammdaten: STAMM, jetzt: JETZT }).mails[0];
  assert.match(mail.text, /Einfassung: Gekettelt, umlaufend 11,20 m/);
});

test('Ware an den Kunden: Anschrift mit Telefon je Kommission statt Ladenanschrift', () => {
  // Standard ist direkt an die Kunden (Inhaber 2026-10-14); gekettelte Massteppiche gingen ohne
  // ziel nach der Regel zum Kettler, deshalb hier ausdruecklich "kunde".
  const mail = bestellmail({ modell: massteppichModell(), lieferant: 'A', ziel: 'kunde', stammdaten: STAMM, jetzt: JETZT }).mails[0];
  assert.equal(mail.lieferziel, 'kunde');
  assert.match(mail.text, /direkt an unsere Kunden liefern/);
  assert.match(mail.text, /Kommission #T4 – Lieferanschrift:\n {3}Testkunde 4\n {3}Testweg 4\n {3}00000 Musterstadt\n {3}Deutschland\n {3}Tel\. \+49 000 0000/);
  assert.equal(mail.text.includes('Beispielhandel GmbH\nMusterweg 1'), false);
});

test('Ware: ware.lieferung "laden" in den Stammdaten macht den Laden zum Standard', () => {
  const st = pruefeStammdaten({ lieferanten: { A: { ware: { lieferung: 'laden' } } } });
  assert.deepEqual(st.fehler, []);
  const mail = bestellmail({ modell: massteppichModell(), lieferant: 'A', stammdaten: st, jetzt: JETZT }).mails[0];
  assert.equal(mail.lieferziel, 'laden');
  assert.equal(bestellmail({ modell: massteppichModell(), lieferant: 'A', ziel: 'kunde', stammdaten: st, jetzt: JETZT }).mails[0].lieferziel, 'kunde');
});

test('Ware: duzen in den Stammdaten - die ganze Mail ohne "Sie"', () => {
  const st = pruefeStammdaten({ lieferanten: { A: { mail: { anrede: 'Hallo Testperson,', duzen: true } } } });
  const text = bestellmail({ modell: massteppichModell(), lieferant: 'A', stammdaten: st, jetzt: JETZT }).mails[0].text;
  assert.match(text, /^Hallo Testperson,/);
  assert.match(text, /Bitte bestätige uns den Auftrag/);
  assert.equal(/\bSie\b/.test(text), false, text);
  assert.match(text, /Viele Grüße/);
});

// ------------------------------------------- Ware ueber unseren Kettelservice (2026-10-19)

const ROH = JSON.parse(fs.readFileSync(new URL('../lib/lieferanten.beispiel.json', import.meta.url), 'utf8'));
// Die Beispieldatei traegt den Kettelservice; fuer "nicht hinterlegt" wird er herausgenommen.
const STAMM_KETTLER = STAMM;
const STAMM_OHNE_KETTLER = pruefeStammdaten({ ...ROH, absender: { ...ROH.absender, kettelservice: undefined } });

test('Kettler: ohne Anschrift in den Stammdaten nicht waehlbar, mit Anschrift schon', () => {
  const ohne = bestellmail({ modell: massteppichModell(), lieferant: 'A', ziel: 'laden', stammdaten: STAMM_OHNE_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(ohne.kettlerMoeglich, false);
  assert.deepEqual(ohne.kettlerVorschlag, []);
  const mit = bestellmail({ modell: massteppichModell(), lieferant: 'A', ziel: 'laden', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(mit.kettlerMoeglich, true);
  assert.deepEqual(lieferantenUebersicht(null, { stammdaten: STAMM_KETTLER }).kettelservice, { name: 'Beispiel-Kettelei', ort: 'Musterstadt' });
  assert.equal(lieferantenUebersicht(null, { stammdaten: STAMM_OHNE_KETTLER }).kettelservice, null);
});

test('Kettler: Massteppich geht im Fertigmass, aber ungekettelt an die Kettler-Anschrift', () => {
  const mail = bestellmail({ modell: massteppichModell(), lieferant: 'A', ziel: 'kettler', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(mail.lieferziel, 'kettler');
  assert.equal(mail.kettlerAutomatisch, false, 'von Hand gewaehlt');
  assert.equal(mail.positionen.length, 1);
  assert.match(mail.text, /bitte an unseren Kettelservice liefern/);
  // Zuschnittmass bestellen (Fertigmass + 3 cm je Laenge und Breite, #1684), nur ohne Ketteln.
  assert.match(mail.text, /Menge: 1 Stück nach Maß\n {3}Zuschnittmaß: 253 × 313 cm \(Rechteck\)\n {3}Ohne Einfassung – bitte genau im Zuschnittmaß zuschneiden, nicht ketteln/);
  assert.equal(mail.text.includes('250 × 310'), false, 'der Lieferant sieht nur das Zuschnittmass');
  assert.deepEqual(mail.kettelPuffer.map(v => [v.orderName, v.fertigmass, v.zuschnittmass]), [['#T4', '250 × 310 cm', '253 × 313 cm']]);
  assert.equal(/Einfassung: Gekettelt|lfm von der/.test(mail.text), false, 'weder ketteln noch Meterware');
  assert.equal(mail.text.includes('Testkunde 4'), false);
  assert.match(mail.text, /an unseren Kettelservice:\nBeispiel-Kettelei\nKettelweg 5\n00001 Musterstadt\nTel\. \+49 30 2222222/);
  assert.match(mail.betreff, /Lieferung an Kettelservice/);
});

test('Kettler-Regel: gekettelter Massteppich kommt ohne Auswahl in eine eigene Kettler-Mail, der Rest bleibt', () => {
  const m = massteppichModell({ masse: '150 × 230 cm' });
  m.gruppen[0].positionen.push(...modell().gruppen.find(g => g.lieferant === 'A').positionen);
  const r = bestellmail({ modell: m, lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT });
  assert.equal(r.mails.length, 2);
  const [kettler, rest] = r.mails;
  assert.equal(kettler.lieferziel, 'kettler');
  assert.equal(kettler.kettlerAutomatisch, true);
  assert.deepEqual(kettler.positionen.map(p => p.orderName), ['#T4']);
  assert.match(kettler.text, /Zuschnittmaß: 153 × 233 cm \(Rechteck\)\n {3}Ohne Einfassung/);
  assert.equal(rest.lieferziel, 'kunde');
  assert.deepEqual(rest.kettelPuffer, [], 'ohne Kettler kein Puffer');
  assert.equal(rest.positionen.some(p => p.orderName === '#T4'), false);
  // Ein Ziel aus dem Dialog gilt fuer alles - keine Aufteilung.
  assert.equal(bestellmail({ modell: m, lieferant: 'A', ziel: 'kunde', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails.length, 1);
  // Ohne hinterlegten Kettler keine Aufteilung.
  assert.equal(bestellmail({ modell: m, lieferant: 'A', stammdaten: STAMM_OHNE_KETTLER, jetzt: JETZT }).mails.length, 1);
  // Schon bestellt: keine eigene Kettler-Mail mehr, der Artikel zaehlt in der normalen Mail.
  const t4 = m.gruppen[0].positionen.find(p => p.orderName === '#T4');
  const statusAlle = { [positionKey(t4.orderId, t4.lineItemId)]: { status: 'bestellt', bestelltAm: '2026-01-19T10:00:00Z' } };
  const nachher = bestellmail({ modell: m, lieferant: 'A', stammdaten: STAMM_KETTLER, statusAlle, jetzt: JETZT });
  assert.equal(nachher.mails.length, 1);
  assert.equal(nachher.mails[0].lieferziel, 'kunde');
  // Auch 2 m und mehr geht zum Kettler (Inhaber 2026-10-19 abends: alle gekettelten).
  const gross = bestellmail({ modell: massteppichModell({ masse: '390 × 500 cm' }), lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(gross.lieferziel, 'kettler');
  assert.equal(gross.kettlerAutomatisch, true);
  assert.match(gross.text, /Zuschnittmaß: 393 × 503 cm \(Rechteck\)\n {3}Ohne Einfassung/);
});

test('Kettler-Regel auch bei Direktversand des Lieferanten: Kettler-Mail statt Lieferung an den Kunden', () => {
  const m = massteppichModell({ masse: '150 × 230 cm', route: 'SUPPLIER_DIRECT' });
  const [kettler] = bestellmail({ modell: m, lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails;
  assert.equal(kettler.lieferziel, 'kettler');
  assert.equal(kettler.kettlerAutomatisch, true);
  assert.equal(kettler.positionen.length, 1);
  assert.match(kettler.text, /Zuschnittmaß: 153 × 233 cm \(Rechteck\)\n {3}Ohne Einfassung/);
  assert.match(kettler.text, /an unseren Kettelservice:\nBeispiel-Kettelei/);
  assert.equal(/direkt an unseren Kunden|Testkunde 4/.test(kettler.text), false, 'nicht an den Kunden');
  assert.equal(kettler.zielWaehlbar, false, 'Umschalten wuerde in den Direktversand zurueckfallen');
  // Ein Ziel fuer andere Gruppen desselben Lieferanten hebt die Regel bei Direktversand nicht auf.
  assert.equal(bestellmail({ modell: m, lieferant: 'A', ziel: 'laden', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0].lieferziel, 'kettler');
  // Auch 2 m und mehr geht zum Kettler statt direkt an den Kunden.
  const gross = bestellmail({ modell: massteppichModell({ masse: '200 × 300 cm', route: 'SUPPLIER_DIRECT' }), lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(gross.lieferziel, 'kettler');
  assert.equal(/direkt an unseren Kunden/.test(gross.text), false);
  // Ohne hinterlegten Kettler bleibt es beim Direktversand.
  assert.equal(bestellmail({ modell: m, lieferant: 'A', stammdaten: STAMM_OHNE_KETTLER, jetzt: JETZT }).mails[0].lieferziel, 'kunde');
  // Baustellenlieferungen bleiben, wie sie sind.
  const bau = bestellmail({ modell: massteppichModell({ masse: '150 × 230 cm', route: 'SUPPLIER_TO_SITE' }), lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(bau.lieferziel, 'baustelle');
});

test('Kettler gewaehlt, aber keine Anschrift hinterlegt: Position fehlt mit Grund', () => {
  const mail = bestellmail({ modell: massteppichModell(), lieferant: 'A', ziel: 'kettler', stammdaten: STAMM_OHNE_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(mail.positionen.length, 0);
  assert.match(mail.fehlt[0].gruende.join(' '), /Anschrift unseres Kettelservice fehlt/);
});

// ------------------------------------------- Kettelpuffer +3 cm (Inhaber 2026-10-25, #1684)

test('Kettelpuffer: Zuschnittmass ist Fertigmass + 3 cm je Laenge und Breite, einmal - nicht je Kante', () => {
  assert.equal(KETTEL_PUFFER_CM, 3);
  assert.deepEqual(kettelZuschnitt(['Fertigmaß: 180 × 250 cm (Rechteck)']), { fertig: '180 × 250 cm', zuschnitt: '183 × 253 cm', form: 'Rechteck', breiteCm: 183, laengeCm: 253 });
  assert.deepEqual(kettelZuschnitt(['Fertigmaß: Ø 200 cm (Rund)']), { fertig: 'Ø 200 cm', zuschnitt: 'Ø 203 cm', form: 'Rund', breiteCm: 203, laengeCm: 203 });
  assert.equal(kettelZuschnitt(['Fertigmaß: 180 × 250 cm']).form, null, 'ohne Form');
  assert.equal(kettelZuschnitt(['Einfassung: Gekettelt']), null, 'ohne Fertigmass kein Zuschnittmass');
  assert.equal(kettelZuschnitt(['Fertigmaß: unbekannt']), null);
  assert.equal(kettelZuschnitt(['Fertigmaß: 0 × 250 cm']), null);
});

test('Kettelpuffer: 180 × 250 wird beim Kettler-Weg als 183 × 253 bestellt, Quelle und Wiederholung bleiben unveraendert', () => {
  const m = massteppichModell({ masse: '180 × 250 cm' });
  const erst = bestellmail({ modell: m, lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(erst.lieferziel, 'kettler');
  assert.match(erst.text, /Menge: 1 Stück nach Maß\n {3}Zuschnittmaß: 183 × 253 cm \(Rechteck\)\n {3}Ohne Einfassung – bitte genau im Zuschnittmaß zuschneiden/);
  assert.deepEqual(erst.kettelPuffer.map(v => [v.fertigmass, v.zuschnittmass]), [['180 × 250 cm', '183 × 253 cm']]);
  // Fertigmass bleibt in den Daten (Kettler, Kundenansicht, Packhilfe) - getrennt vom Zuschnittmass.
  assert.deepEqual(erst.positionen[0].ausfuehrung.filter(z => z.startsWith('Fertigmaß:')), ['Fertigmaß: 180 × 250 cm (Rechteck)']);
  assert.deepEqual(m.gruppen[0].positionen[0].ausfuehrung.filter(z => z.startsWith('Fertigmaß:')), ['Fertigmaß: 180 × 250 cm (Rechteck)']);
  // Neu oeffnen, neu erzeugen: der Puffer kommt nicht ein zweites Mal dazu.
  for (let i = 0; i < 3; i += 1) assert.equal(bestellmail({ modell: m, lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0].text, erst.text);
  assert.equal(/186|256/.test(erst.text), false);
  // Von Hand "Kettler" gewaehlt: dieselbe Regel.
  const hand = bestellmail({ modell: m, lieferant: 'A', ziel: 'kettler', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.match(hand.text, /Zuschnittmaß: 183 × 253 cm \(Rechteck\)/);
});

test('Kettelpuffer: kettelt der Lieferant selbst, bleibt das Fertigmass mit Einfassung', () => {
  const mail = bestellmail({ modell: massteppichModell({ masse: '180 × 250 cm' }), lieferant: 'A', ziel: 'laden', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.match(mail.text, /Fertigmaß: 180 × 250 cm \(Rechteck\)\n {3}Einfassung: Gekettelt/);
  assert.equal(/Zuschnittmaß|183 × 253/.test(mail.text), false);
  assert.deepEqual(mail.kettelPuffer, []);
  // Ohne hinterlegten Kettler kettelt der Lieferant - auch dann kein Puffer.
  const ohne = bestellmail({ modell: massteppichModell({ masse: '180 × 250 cm' }), lieferant: 'A', stammdaten: STAMM_OHNE_KETTLER, jetzt: JETZT }).mails[0];
  assert.match(ohne.text, /Fertigmaß: 180 × 250 cm \(Rechteck\)\n {3}Einfassung: Gekettelt/);
});

test('Kettelpuffer: Ware ohne Ketteln bekommt auch beim Kettler-Weg keinen Puffer', () => {
  const mail = bestellmail({ modell: modell(), lieferant: 'A', ziel: 'kettler', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(mail.lieferziel, 'kettler');
  assert.ok(mail.positionen.length > 0);
  assert.equal(/Zuschnittmaß|Kettelpuffer/.test(mail.text), false);
  assert.deepEqual(mail.kettelPuffer, []);
});

test('Kettelpuffer: runder Teppich wird mit Durchmesser + 3 cm bestellt', () => {
  const mail = bestellmail({ modell: massteppichModell({ masse: 'Ø 200 cm', form: 'Rund', quantity: 400 }), lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(mail.lieferziel, 'kettler');
  assert.match(mail.text, /Menge: 1 Stück nach Maß\n {3}Zuschnittmaß: Ø 203 cm \(Rund\)/);
});

test('Kettelpuffer: passt das Zuschnittmass nicht mehr in die Rolle, wird geklaert statt still gekuerzt', () => {
  // Rolle 400 cm (Property "_Zuschnitt aus Rolle"): 400 × 500 waere 403 × 503 - zu breit.
  const mail = bestellmail({ modell: massteppichModell({ masse: '400 × 500 cm' }), lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(mail.lieferziel, 'kettler');
  assert.equal(mail.positionen.length, 0);
  assert.equal(mail.text, null);
  assert.match(mail.fehlt[0].gruende.join(' · '), /Zuschnittmaß 403 × 503 cm \(Fertigmaß \+ 3 cm Kettelpuffer\) passt nicht in die Rollenbreite 400 cm – vor der Bestellung klären/);
  // Gedreht passt es: die kuerzere Seite zaehlt (397 + 3 = 400).
  const passt = bestellmail({ modell: massteppichModell({ masse: '500 × 397 cm' }), lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(passt.fehlt.length, 0);
  assert.match(passt.text, /Zuschnittmaß: 503 × 400 cm/);
  // Kettelt der Lieferant selbst, gilt die Pruefung nicht.
  const lieferant = bestellmail({ modell: massteppichModell({ masse: '400 × 500 cm' }), lieferant: 'A', ziel: 'laden', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(lieferant.fehlt.length, 0);
});

test('Kettelpuffer: nur echtes Ketteln - Raummass, Matte, Band und Herstellereinfassung bleiben im Fertigmass', () => {
  for (const einfassung of ['ohne Einfassung', 'Zugeschnitten', 'Fertig eingefasst', 'Einfassband', 'Paspelband', 'Cover']) {
    const m = massteppichModell({ masse: '180 × 250 cm' });
    m.gruppen[0].positionen[0].ausfuehrung = ['Fertigmaß: 180 × 250 cm (Rechteck)', `Einfassung: ${einfassung}`];
    const mail = bestellmail({ modell: m, lieferant: 'A', ziel: 'kettler', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
    assert.equal(mail.fehlt.length, 0, einfassung);
    assert.match(mail.text, /Fertigmaß: 180 × 250 cm \(Rechteck\)\n {3}Ohne Einfassung – bitte im Fertigmaß zuschneiden/, einfassung);
    assert.equal(/Zuschnittmaß|183/.test(mail.text), false, einfassung);
    assert.deepEqual(mail.kettelPuffer, [], einfassung);
    assert.equal(kopierText(m.gruppen[0]).includes('Zuschnitt'), false, einfassung);
  }
});

test('Kettelpuffer: andere Schreibweisen werden richtig gelesen oder geklaert, nie falsch gerechnet', () => {
  const z = t => kettelZuschnitt([`Fertigmaß: ${t}`])?.zuschnitt ?? null;
  assert.equal(z('180x250 cm'), '183 × 253 cm');
  assert.equal(z('180 x 250 cm (Rechteck)'), '183 × 253 cm');
  assert.equal(z('180,5 × 250 cm'), '183,5 × 253 cm');
  assert.equal(z('180 ×\n250 cm (Rechteck)'), '183 × 253 cm', 'Zeilenumbruch aus einer Bestellbearbeitung');
  assert.equal(z('1,80 × 2,50 m'), null, 'Meter: klaeren statt 4 × 5 cm');
  assert.equal(z('200 cm'), null, 'einzelnes Mass ohne Ø ist mehrdeutig');
  assert.equal(z('Ø 200 × 300 cm'), null);
  const m = massteppichModell({ masse: '180 × 250 cm' });
  m.gruppen[0].positionen[0].ausfuehrung = ['Fertigmaß: 1,80 × 2,50 m (Rechteck)', 'Einfassung: Gekettelt'];
  const mail = bestellmail({ modell: m, lieferant: 'A', ziel: 'kettler', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(mail.positionen.length, 0);
  assert.match(mail.fehlt[0].gruende.join(' · '), /Kein lesbares Fertigmaß .* von Hand klären/);
});

test('Kettelpuffer: auch die Kopierliste fuer Portal und eigene Mail nennt das Zuschnittmass', () => {
  const m = massteppichModell({ masse: '180 × 250 cm' });
  const p = m.gruppen[0].positionen[0];
  assert.equal(p.kettelZusatz, ' · über unseren Kettler: Zuschnitt 183 × 253 cm (+3 cm je Länge und Breite)');
  assert.match(kopierText(m.gruppen[0]), /1 Stück nach Maß · 180 × 250 cm · über unseren Kettler: Zuschnitt 183 × 253 cm \(\+3 cm je Länge und Breite\) \| Kd\.-Best\. #T4/);
});

test('Kettelpuffer: ohne bekannte Rollenbreite meldet der Dialog es, statt still zu bestellen', () => {
  const m = massteppichModell({ masse: '180 × 250 cm' });
  m.gruppen[0].positionen[0].ausRolleCm = null;
  const mail = bestellmail({ modell: m, lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(mail.kettelPuffer[0].rolleUnbekannt, true);
  const mit = bestellmail({ modell: massteppichModell({ masse: '180 × 250 cm' }), lieferant: 'A', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.equal(mit.kettelPuffer[0].rolleUnbekannt, false);
});

test('Kettler nur fuer Ware, nicht fuer Muster', () => {
  assert.throws(() => bestellmail({ modell: modell(), lieferant: 'A', art: 'muster', ziel: 'kettler', stammdaten: STAMM_KETTLER, jetzt: JETZT }), LieferantenFehler);
});

test('Kettler-Regel und Vorschlag: gekettelt mit Fertigmass automatisch, ohne Fertigmass nur bei Kunden in der Naehe', () => {
  assert.equal(kettlerAutomatisch({ ausfuehrung: ['Fertigmaß: 150 × 230 cm', 'Einfassung: Gekettelt'] }), true);
  assert.equal(kettlerAutomatisch({ ausfuehrung: ['Fertigmaß: 400 × 500 cm', 'Einfassung: Gekettelt'] }), true, 'auch ueber 2 m');
  assert.equal(kettlerAutomatisch({ ausfuehrung: ['Fertigmaß: Ø 300 cm (Rund)', 'Einfassung: Gekettelt'] }), true, 'auch rund');
  assert.equal(kettlerAutomatisch({ ausfuehrung: ['Fertigmaß: 100 × 150 cm'] }), false, 'ohne Einfassung kein Kettler');
  assert.equal(kettlerAutomatisch({ ausfuehrung: ['Einfassung: Gekettelt'] }), false, 'ohne Fertigmass kann der Lieferant nicht zuschneiden');
  // Ziel im Dialog von Hand gewaehlt: die gekettelte Position wird fuer den Kettler vorgeschlagen.
  const gross = bestellmail({ modell: massteppichModell(), lieferant: 'A', ziel: 'laden', stammdaten: STAMM_KETTLER, jetzt: JETZT }).mails[0];
  assert.deepEqual(gross.kettlerVorschlag.map(v => [v.orderName, v.grund]), [['#T4', 'gekettelt – Ketteln beim Kettler']]);
  const p = { ausfuehrung: ['Einfassung: Gekettelt'] };
  assert.match(kettlerGrund(p, { plz: '13585', ort: 'Berlin' }), /in der Nähe \(13585 Berlin\)/);
  assert.match(kettlerGrund(p, { plz: '16515', ort: 'Oranienburg' }), /in der Nähe/);
  assert.equal(kettlerGrund(p, { plz: '80331', ort: 'München' }), null);
  assert.equal(kuerzereSeiteCm(['Fertigmaß: Ø 160 cm (Rund)']), 160);
  assert.equal(kuerzereSeiteCm(['Fertigmaß: 300 × 180 cm']), 180);
  assert.equal(kuerzereSeiteCm([]), null);
});

test('Uebersicht: Lieferant mit ueberfaelligen Posten steht vor A-Z', () => {
  const m = modell();
  const statusAlle = statusFuer(m, [
    [1, 1, { status: 'bestellt', bestelltAm: '2026-01-18T10:00:00Z' }],
    [2, 4, { status: 'bestellt', bestelltAm: '2026-01-01T10:00:00Z' }], // Lieferant B, 19 Tage -> Problem
  ]);
  const u = lieferantenUebersicht(m, { statusAlle, stammdaten: STAMM, jetzt: JETZT });
  assert.deepEqual(u.lieferanten.map(l => [l.id, l.ueberfaellig.problem]), [['B', 1], ['A', 0]]);
});
