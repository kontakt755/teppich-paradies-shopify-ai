import test from 'node:test';
import assert from 'node:assert/strict';
import { angebotAdminLink, angebotNachricht, angebotVollstaendig, ibanGueltig, kontodatenPruefen, LINK_MAX, whatsappLink, whatsappNummer } from '../lib/angebot-nachricht.mjs';

// Oeffentliche Beispiel-IBAN aus der Bundesbank-Dokumentation, kein echtes Firmenkonto.
const BEISPIEL_IBAN = 'DE89 3704 0044 0532 0130 00';
const konto = kontodatenPruefen({ kontoinhaber: 'Test GmbH', iban: BEISPIEL_IBAN });
const angebot = {
  id: 'gid://shopify/DraftOrder/123', nummer: '#D12', kunde: 'Sabine Beispiel', telefon: '0179 1234567', betrag: 1234.5, waehrung: 'EUR',
  positionen: [{ menge: 20, titel: 'Testboden', variante: 'Sand (013)' }, { menge: 1, titel: 'Kleber', variante: null }],
};

test('ibanGueltig: Pruefsumme, Laenge und Schreibweise', () => {
  assert.equal(ibanGueltig(BEISPIEL_IBAN), true);
  assert.equal(ibanGueltig('de89370400440532013000'), true);
  assert.equal(ibanGueltig('DE89370400440532013001'), false, 'Tippfehler');
  assert.equal(ibanGueltig('DE8937040044053201300'), false, 'eine Stelle zu kurz');
  assert.equal(ibanGueltig(''), false);
  assert.equal(ibanGueltig(null), false);
});

test('kontodatenPruefen: nur vollstaendig und mit gueltiger IBAN', () => {
  assert.deepEqual(konto, { kontoinhaber: 'Test GmbH', iban: BEISPIEL_IBAN });
  assert.equal(kontodatenPruefen(null), null);
  assert.equal(kontodatenPruefen({ iban: BEISPIEL_IBAN }), null);
  assert.equal(kontodatenPruefen({ kontoinhaber: 'Test GmbH', iban: 'DE00' }), null);
});

test('angebotNachricht: Summe, Konto, Verwendungszweck, Rechtstexte', () => {
  const t = angebotNachricht(angebot, konto);
  assert.match(t, /^Guten Tag Sabine Beispiel,/);
  assert.match(t, /Angebot D12:/);
  assert.match(t, /20× Testboden \(Sand \(013\)\)\n1× Kleber\n/);
  assert.match(t, /Gesamtbetrag inkl\. MwSt\.: 1\.234,50 €/);
  assert.match(t, /IBAN DE89 3704 0044 0532 0130 00/);
  assert.match(t, /Verwendungszweck: Angebot D12/);
  assert.match(t, /senden Ihnen die Rechnung/);
  assert.match(t, /policies\/refund-policy/);
  assert.match(t, /policies\/terms-of-service/);
});

test('angebotNachricht: nennt Versand nur, wenn er im Entwurf steht', () => {
  assert.doesNotMatch(angebotNachricht(angebot, konto), /und Versand/);
  assert.match(angebotNachricht({ ...angebot, versandEingetragen: true }, konto), /inkl\. MwSt\. und Versand:/);
});

test('angebotNachricht: Mailadresse statt Name wird nicht zur Anrede', () => {
  assert.match(angebotNachricht({ ...angebot, kunde: 'kunde@example.test' }, konto), /^Guten Tag,\n/);
  assert.match(angebotNachricht({ ...angebot, kunde: null }, konto), /^Guten Tag,\n/);
});

test('angebotNachricht: ohne Konto, Betrag oder Positionen kein Text', () => {
  assert.equal(angebotNachricht(angebot, null), null);
  assert.equal(angebotNachricht({ ...angebot, betrag: 0 }, konto), null);
  assert.equal(angebotNachricht({ ...angebot, positionen: [] }, konto), null);
  assert.equal(angebotVollstaendig(null), false);
});

test('whatsappNummer: Vorwahlen vereinheitlichen, Unbrauchbares ablehnen', () => {
  assert.equal(whatsappNummer('0179 123 45 67'), '491791234567');
  assert.equal(whatsappNummer('+49 179 1234567'), '491791234567');
  assert.equal(whatsappNummer('0049 179 1234567'), '491791234567');
  assert.equal(whatsappNummer('+43 660 1234567'), '436601234567');
  assert.equal(whatsappNummer('1234567'), null, 'ohne Vorwahl nicht raten');
  assert.equal(whatsappNummer('0123'), null, 'zu kurz');
  assert.equal(whatsappNummer(null), null);
});

test('whatsappLink: Text sicher kodiert, ohne Nummer oder zu lang kein Link', () => {
  const link = whatsappLink('0179 1234567', 'Grüße & 1× Test\nZeile 2');
  assert.equal(new URL(link).searchParams.get('text'), 'Grüße & 1× Test\nZeile 2');
  assert.equal(new URL(link).pathname, '/491791234567');
  assert.equal(whatsappLink(null, 'Text'), null);
  assert.equal(whatsappLink('0179 1234567', ''), null);
  assert.equal(whatsappLink('0179 1234567', 'x'.repeat(LINK_MAX)), null);
});

test('angebotAdminLink: nur aus einer echten Entwurfs-Kennung', () => {
  assert.match(angebotAdminLink('gid://shopify/DraftOrder/123'), /\/draft_orders\/123$/);
  assert.equal(angebotAdminLink('gid://shopify/Order/123'), null);
  assert.equal(angebotAdminLink(null), null);
});
