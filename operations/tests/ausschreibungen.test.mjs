import test from 'node:test';
import assert from 'node:assert/strict';
import { tedAbfrage, ausTed, ausOcds, bereinigen, neuSeit } from '../lib/ausschreibungen.mjs';

// Nur erfundene Daten.
const release = (cpv, region) => ({
  ocid: `ocds-${cpv}-${region}`, buyer: { id: 'K1', name: 'Testbau GmbH' },
  parties: [{ id: 'K1', address: { locality: 'Oranienburg', region } }],
  tender: { title: 'Bodenbelag Kita', tenderPeriod: { endDate: '2026-11-02T10:00:00+01:00' }, items: [{ classification: { id: cpv }, deliveryAddress: { region } }] },
});

test('TED-Abfrage traegt CPV, Regionen und Fristbeginn', () => {
  const q = tedAbfrage('2026-10-19').query;
  assert.match(q, /45432100/);
  assert.match(q, /DE40A/);
  assert.match(q, />=20261019$/);
});

test('TED-Antwort: deutscher Titel bevorzugt', () => {
  const [t] = ausTed({ notices: [{ 'publication-number': '1-2026', 'notice-title': { hun: 'x', deu: 'Boden' }, 'buyer-name': { deu: ['Amt'] }, 'deadline-receipt-tender-date-lot': ['2026-11-01+01:00'] }] });
  assert.equal(t.titel, 'Boden');
  assert.equal(t.auftraggeber, 'Amt');
  assert.equal(t.frist, '2026-11-01');
});

test('OCDS: nur passende CPV im Umkreis', () => {
  assert.equal(ausOcds(release('45432100-5', 'DE40A')).ort, 'Oranienburg');
  assert.equal(ausOcds(release('72000000', 'DE40A')), null);
  assert.equal(ausOcds(release('45432100', 'DEB35')), null);
});

test('bereinigen und neuSeit', () => {
  const a = { id: 'a', titel: 'X', auftraggeber: 'Y', frist: '2026-11-01' };
  const alt = { id: 'b', titel: 'Z', auftraggeber: 'Y', frist: '2026-10-01' };
  const doppelt = { ...a, id: 'c' };
  assert.deepEqual(bereinigen([a, alt, doppelt], '2026-10-19').map(t => t.id), ['a']);
  assert.deepEqual(neuSeit([a], [{ id: 'a' }]), []);
});
