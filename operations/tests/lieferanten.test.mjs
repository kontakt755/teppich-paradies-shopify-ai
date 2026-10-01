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
  const r = bestellmail({ modell: modell(), lieferant: 'A', art: 'ware', gruppe: 'A|SUPPLIER_TO_TP|TP', stammdaten: STAMM, jetzt: JETZT });
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
  const mail = bestellmail({ modell: modell(), lieferant: 'A', jetzt: JETZT }).mails[0];
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
  assert.match(mail.text, /2\. Art\.-Nr\. A-0815\n {3}Muster: Testteppich Wolke, Blau\n {3}Menge: 1 Muster\n {3}Kommission: #T3/);
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
