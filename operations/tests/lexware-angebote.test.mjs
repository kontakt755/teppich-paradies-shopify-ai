import test from 'node:test';
import assert from 'node:assert/strict';
import { angeboteAusLexware, nachfassFaellig } from '../lib/lexware-angebote.mjs';

const q = (o = {}) => ({ id: 'a1', voucherType: 'quotation', voucherStatus: 'open', voucherNumber: 'AG1', voucherDate: '2026-11-01T00:00:00.000+01:00', contactName: 'Muster, Max', totalAmount: 100.5, currency: 'EUR', archived: false, viewUrl: 'https://app.lexware.de/permalink/quotations/view/a1', ...o });

test('Ablage: nur offene/ueberfaellige Angebote, schlanke Felder, nur Lexware-Links', () => {
  const d = angeboteAusLexware([{ quotations: [q(), q({ id: 'a2', voucherStatus: 'accepted' }), q({ id: 'a3', voucherStatus: 'overdue', viewUrl: 'https://boese.example/x' })] }], new Date('2026-11-18T08:00:00Z'));
  assert.deepEqual(d.angebote.map(a => a.id), ['a1', 'a3']);
  assert.deepEqual(d.angebote[0], { id: 'a1', nummer: 'AG1', datum: '2026-11-01', kunde: 'Muster, Max', betrag: 100.5, waehrung: 'EUR', url: 'https://app.lexware.de/permalink/quotations/view/a1' });
  assert.equal(d.angebote[1].url, null);
  assert.throws(() => angeboteAusLexware({ fehler: 'x' }), /quotations/);
});

test('Faellig: ab Tag 5, nicht erreicht erst am Folgetag, zweites Nachfassen ab Tag 12', () => {
  const a = { datum: '2026-11-01' };
  const am = t => new Date(`2026-11-${String(t).padStart(2, '0')}T10:00:00`);
  assert.equal(nachfassFaellig(a, null, am(5)), false);
  assert.equal(nachfassFaellig(a, null, am(6)), true);
  assert.equal(nachfassFaellig(a, { status: 'erledigt' }, am(20)), false);
  assert.equal(nachfassFaellig(a, { status: 'nicht_erreicht', nicht_erreichtAm: am(6).toISOString() }, am(6)), false);
  assert.equal(nachfassFaellig(a, { status: 'nicht_erreicht', nicht_erreichtAm: am(6).toISOString() }, am(7)), true);
  const angerufen = { status: 'angerufen', angerufenAm: am(6).toISOString() };
  assert.equal(nachfassFaellig(a, angerufen, am(12)), false);
  assert.equal(nachfassFaellig(a, angerufen, am(13)), true);
  assert.equal(nachfassFaellig(a, { status: 'angerufen', angerufenAm: am(14).toISOString() }, am(20)), false);
});
