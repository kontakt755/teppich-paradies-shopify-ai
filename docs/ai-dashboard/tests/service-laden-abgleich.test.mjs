import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceQuellHash, abgleichAus, createServiceLadenAbgleich, serviceMitLaden } from '../../../scripts/service-laden-abgleich.mjs';
const ID = 'a1234567890abcde', h = serviceQuellHash(ID);
const basis = 'https://script.google.com/macros/s/test/exec';
const env = { LADEN_ZAHLEN_URL: basis, LADEN_ZAHLEN_SCHLUESSEL: 'test-service-key' };
const entry = { id: 'S-001', mailId: ID, status: 'kontaktiert', name: 'Max Muster' };
const data = (treffer = [{ quellHash: h, anzahl: 1, auftragId: 'A1', status: 'angebot', standMs: 1234 }]) => ({ version: 1, stand: new Date().toISOString(), treffer });
test('Quellhash ist plattformgleich und enthaelt keine rohe Gmail-ID', () => {
  assert.match(h, /^[a-f0-9]{64}$/); assert.equal(h, serviceQuellHash(ID.toUpperCase())); assert.ok(!h.includes(ID));
});
test('nur vollstaendige eindeutige Antworten ohne fremde Hashes und Statuswerte annehmen', () => {
  assert.equal(abgleichAus(data(), [h]).get(h).auftragId, 'A1');
  assert.equal(abgleichAus(data([]), [h]), null);
  assert.equal(abgleichAus(data([{ quellHash: '0'.repeat(64), anzahl: 0 }]), [h]), null);
  assert.equal(abgleichAus(data([{ quellHash: h, anzahl: 1, auftragId: 'A1', status: 'geraten', standMs: 0 }]), [h]), null);
  assert.equal(abgleichAus({ ...data(), stand: '2000-01-01T00:00:00Z' }, [h]), null);
});
test('ohne bestehenden Zugang keine Anfrage, mit Zugang nur Hashes und vorhandener interner Schluessel', async () => {
  let reads = 0;
  const missing = createServiceLadenAbgleich({ root: '/nicht-vorhanden', env: {}, holen: () => { reads++; } });
  assert.equal((await missing.abrufen([entry])).verfuegbar, false); assert.equal(reads, 0);
  const c = createServiceLadenAbgleich({ env, holen: async url => {
    reads++; const u = new URL(url); assert.equal(u.searchParams.get('ansicht'), 'serviceabgleich');
    assert.equal(u.searchParams.get('q'), h); assert.ok(!String(url).includes(ID));
    return { ok: true, text: async () => JSON.stringify(data()) };
  } });
  const r = await c.abrufen([entry]); await c.abrufen([entry]); assert.equal(reads, 1);
  const linked = serviceMitLaden([entry], r, r.basis)[0];
  assert.equal(linked.status, 'kontaktiert'); assert.equal(linked.laden.status, 'angebot');
  assert.equal(new URL(linked.laden.url).searchParams.get('auftrag'), 'A1');
  assert.deepEqual(entry, { id: 'S-001', mailId: ID, status: 'kontaktiert', name: 'Max Muster' });
});
test('mehrdeutige Zuordnung erzeugt keinen Link, Google-Anmeldeseite gilt als nicht verfuegbar', async () => {
  const r = serviceMitLaden([entry], { zuordnung: new Map([[h, { anzahl: 2 }]]) }, basis)[0];
  assert.deepEqual(r.laden, { anzahl: 2 });
  const c = createServiceLadenAbgleich({ env, holen: async () => ({ ok: true, text: async () => '<html>anmelden</html>' }) });
  const unavailable = await c.abrufen([entry]); assert.equal(unavailable.verfuegbar, false);
  assert.ok(!JSON.stringify(unavailable).includes(env.LADEN_ZAHLEN_SCHLUESSEL));
});
