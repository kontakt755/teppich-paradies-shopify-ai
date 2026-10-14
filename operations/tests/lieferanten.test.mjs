import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aufbereiten } from '../lib/bestelluebersicht.mjs';
import { positionKey } from '../lib/auftragsstatus.mjs';
import {
  pruefeStammdaten, leseStammdaten, stammdatenPfad, stammdatenFuer, lieferantenUebersicht, lieferantDetail,
  bestellmail, mailtoLink, wartetage, warnstufe, LieferantenFehler,
  WARTE_NACHHAKEN_TAGE, WARTE_PROBLEM_TAGE, MAILTO_MAX,
  kennungAusLexikon, lexikonSchnellzugriff, lexikonProduktMitSchnellzugriff,
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
  assert.match(mail.text, /1\. Art\.-Nr\. A-4711 · Farb-Nr\. 012\n {3}Testdiele Eiche, Natur\n {3}Menge: 3 Paket\(e\) = 6,60 m²\n {3}Kommission: #T1/);
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
  assert.match(mail.text, /Lieferanschrift \(Kommission #T2\):\nTestkunde 2\nTestweg 2\n00000 Musterstadt\nDeutschland\n\n1\. Art\.-Nr\. A-0815 · Farb-Nr\. 020\n {3}Muster: Testteppich Wolke, Grau\n {3}Menge: 1 Muster/);
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

function massteppichModell({ mitEinfassungAmTeppich = true } = {}) {
  const teppich = zeile({ id: 20, sku: null, title: 'Testteppich nach Maß', variantTitle: 'Sandbeige (036)', quantity: 775, preis: '0.39',
    einkauf: [['lieferant', 'A'], ['artikelnummer', 'A-TNM'], ['farbnummer', '036'], ['bestelleinheit', 'lfm'], ['route', 'SUPPLIER_TO_TP']],
    custom: [['preis_pro_001_qm', 'true']],
    attrs: [
      ...(mitEinfassungAmTeppich ? [{ key: 'Einfassung', value: 'Gekettelt' }, { key: 'Kante umlaufend', value: '11,20 m' }, { key: 'Garn', value: 'Ton in Ton' }] : []),
      { key: 'Form', value: 'Rechteck' }, { key: 'Maße', value: '250 × 310 cm' },
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

test('Massteppich: Kettelung nur an der Kettelservice-Zeile wird trotzdem bestellt', () => {
  const mail = bestellmail({ modell: massteppichModell({ mitEinfassungAmTeppich: false }), lieferant: 'A', stammdaten: STAMM, jetzt: JETZT }).mails[0];
  assert.match(mail.text, /Einfassung: Gekettelt, umlaufend 11,20 m/);
});

test('Ware an den Kunden: Anschrift mit Telefon je Kommission statt Ladenanschrift', () => {
  // Ohne ziel: Standard ist direkt an die Kunden (Inhaber 2026-10-14).
  const mail = bestellmail({ modell: massteppichModell(), lieferant: 'A', stammdaten: STAMM, jetzt: JETZT }).mails[0];
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
