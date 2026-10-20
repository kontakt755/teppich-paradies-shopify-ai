import test from 'node:test';
import assert from 'node:assert/strict';
import {
  waehleProdukt, empfaengerAusShopify, absenderAusEnv, pdfAnfrage, zugangAusEnv, kaufeMarken,
  PRODUKTE, InternetmarkeFehler,
} from '../lib/internetmarke.mjs';

const env = {
  INTERNETMARKE_ABSENDER_NAME: 'Testfirma', INTERNETMARKE_ABSENDER_STRASSE: 'Teststr. 1',
  INTERNETMARKE_ABSENDER_PLZ: '10115', INTERNETMARKE_ABSENDER_ORT: 'Berlin',
};
const kunde = { firstName: 'Erika', lastName: 'Muster', address1: 'Weg 2', zip: '16515', city: 'Oranienburg', countryCodeV2: 'DE' };

test('wenige Muster -> Grossbrief, mehr -> Maxibrief, zu viele -> null', () => {
  assert.equal(waehleProdukt(1).code, PRODUKTE.grossbrief.code);
  assert.equal(waehleProdukt(2).code, PRODUKTE.grossbrief.code);
  assert.equal(waehleProdukt(3).code, PRODUKTE.maxibrief.code);
  assert.equal(waehleProdukt(6).code, PRODUKTE.maxibrief.code);
  assert.equal(waehleProdukt(7), null);
});

test('Empfaenger aus Shopify, Ausland und Luecken brechen ab', () => {
  const e = empfaengerAusShopify({ ...kunde, company: 'Firma GmbH' });
  assert.deepEqual(e, { name: 'Erika Muster', addressLine1: 'Weg 2', postalCode: '16515', city: 'Oranienburg', country: 'DEU', additionalName: 'Firma GmbH' });
  assert.throws(() => empfaengerAusShopify({ ...kunde, countryCodeV2: 'AT' }), InternetmarkeFehler);
  assert.throws(() => empfaengerAusShopify({ ...kunde, zip: '' }), /postalCode/);
  assert.throws(() => empfaengerAusShopify(null), InternetmarkeFehler);
});

test('Absender nur aus .env', () => {
  assert.equal(absenderAusEnv(env).city, 'Berlin');
  assert.throws(() => absenderAusEnv({}), /Absender fehlt/);
});

test('PDF-Anfrage summiert Preise und nummeriert Seiten', () => {
  const pos = { produkt: PRODUKTE.grossbrief, absender: absenderAusEnv(env), empfaenger: empfaengerAusShopify(kunde) };
  const a = pdfAnfrage({ shopOrderId: 7, pageFormatId: 1, positionen: [pos, { ...pos, produkt: PRODUKTE.maxibrief }] });
  assert.equal(a.total, 470);
  assert.equal(a.shopOrderId, '7');
  assert.deepEqual(a.positions.map(p => [p.productCode, p.position.page]), [[21, 1], [31, 2]]);
  assert.throws(() => pdfAnfrage({ shopOrderId: 1, pageFormatId: 1, positionen: [] }), InternetmarkeFehler);
});

test('ohne Zugangsdaten oder ohne MODUS=echt bleibt es trocken - kein Netz', async () => {
  assert.equal(zugangAusEnv({}).modus, 'trocken');
  const halb = { INTERNETMARKE_CLIENT_ID: 'a', INTERNETMARKE_CLIENT_SECRET: 'b', INTERNETMARKE_PORTOKASSE_BENUTZER: 'c', INTERNETMARKE_PORTOKASSE_PASSWORT: 'd', INTERNETMARKE_SEITENFORMAT: '1' };
  assert.equal(zugangAusEnv(halb).modus, 'trocken');
  assert.equal(zugangAusEnv({ ...halb, INTERNETMARKE_MODUS: 'echt' }).modus, 'echt');
  const pos = { produkt: PRODUKTE.grossbrief, absender: absenderAusEnv(env), empfaenger: empfaengerAusShopify(kunde) };
  const r = await kaufeMarken(zugangAusEnv({}), [pos], { fetchFn: () => { throw new Error('kein Netz erwartet'); } });
  assert.equal(r.modus, 'trocken');
  assert.equal(r.anfrage.total, 180);
});

test('echter Ablauf gegen nachgebaute API: Login, Korb, Kauf', async () => {
  const aufrufe = [];
  const antwort = (daten, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(daten) });
  const fetchFn = async (url, opt) => {
    aufrufe.push(url.split('/v1/')[1]);
    if (url.endsWith('/user')) return antwort({ access_token: 'T', walletBalance: 1000 });
    if (url.endsWith('/shoppingcart')) return antwort({ shopOrderId: '99' });
    assert.equal(JSON.parse(opt.body).shopOrderId, '99');
    return antwort({ link: 'https://x/m.pdf', walletBallance: 820, shoppingCart: { voucherList: [{ voucherId: 'V1' }] } });
  };
  const zugang = zugangAusEnv({ INTERNETMARKE_CLIENT_ID: 'a', INTERNETMARKE_CLIENT_SECRET: 'b', INTERNETMARKE_PORTOKASSE_BENUTZER: 'c', INTERNETMARKE_PORTOKASSE_PASSWORT: 'd', INTERNETMARKE_SEITENFORMAT: '1', INTERNETMARKE_MODUS: 'echt' });
  const pos = { produkt: PRODUKTE.grossbrief, absender: absenderAusEnv(env), empfaenger: empfaengerAusShopify(kunde) };
  const r = await kaufeMarken(zugang, [pos], { fetchFn });
  assert.deepEqual(aufrufe, ['user', 'app/shoppingcart', 'app/shoppingcart/pdf']);
  assert.equal(r.pdfLink, 'https://x/m.pdf');
  assert.deepEqual(r.marken, [{ voucherId: 'V1', trackId: null }]);
  assert.equal(r.guthabenCent, 820);
});

test('zu wenig Guthaben bricht vor dem Kauf ab', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'T', walletBalance: 100 }) });
  const zugang = zugangAusEnv({ INTERNETMARKE_CLIENT_ID: 'a', INTERNETMARKE_CLIENT_SECRET: 'b', INTERNETMARKE_PORTOKASSE_BENUTZER: 'c', INTERNETMARKE_PORTOKASSE_PASSWORT: 'd', INTERNETMARKE_SEITENFORMAT: '1', INTERNETMARKE_MODUS: 'echt' });
  const pos = { produkt: PRODUKTE.grossbrief, absender: absenderAusEnv(env), empfaenger: empfaengerAusShopify(kunde) };
  await assert.rejects(kaufeMarken(zugang, [pos], { fetchFn }), /Portokasse reicht nicht/);
});
