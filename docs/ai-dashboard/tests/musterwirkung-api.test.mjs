import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
function umgebung(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-musterwirkung-api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ordner = path.join(dir, 'bestelluebersicht');
  fs.mkdirSync(ordner);
  const datei = path.join(ordner, 'orders.json');
  const verboten = () => assert.fail('Analyse darf kein Fachsystem oder Schreibwerkzeug aufrufen');
  const api = createApi({ root: dir, privatDirPath: dir, gh: verboten, shopifyZugang: verboten, rebuild: verboten, now: () => new Date('2026-10-22T12:00:00Z') });
  return { api, dir, datei };
}

test('Musteranalyse unterscheidet fehlend, echt leer und syntaktisch defekt ohne Businesswrites', t => {
  const { api, dir, datei } = umgebung(t);
  assert.equal(api.kundenMusterwirkung().verfuegbar, false);
  assert.equal(fs.existsSync(datei), false);
  fs.writeFileSync(datei, JSON.stringify({ orders: [], exportiertAm: '2026-10-22T10:00:00Z' }));
  const vor = fs.readFileSync(datei, 'utf8');
  const leer = api.kundenMusterwirkung();
  assert.equal(leer.verfuegbar, true);
  assert.equal(leer.abdeckung.bestellungenImExport, 0);
  assert.equal(fs.readFileSync(datei, 'utf8'), vor);
  assert.deepEqual(fs.readdirSync(dir), ['bestelluebersicht']);
  fs.writeFileSync(datei, '{kaputt');
  assert.throws(() => api.kundenMusterwirkung(), e => e.status === 500);
  assert.equal(fs.readFileSync(datei, 'utf8'), '{kaputt');
});

test('neue Rohdatei ersetzt den Analysecache; Aggregate enthalten keine Kundendaten oder Belegkennungen', t => {
  const { api, dir, datei } = umgebung(t);
  fs.writeFileSync(datei, JSON.stringify({ orders: [] }));
  assert.equal(api.kundenMusterwirkung().abdeckung.bestellungenImExport, 0);
  const raw = { exportiertAm: '2026-10-22T10:00:00Z', orders: [{ id: 'gid://shopify/Order/990001', name: '#SYNTHETISCH', createdAt: '2026-10-01T10:00:00Z', displayFinancialStatus: 'PAID',
    customer: { id: 'gid://shopify/Customer/9988', displayName: 'Synthetischer Privatname', email: 'privat@example.invalid' },
    shippingAddress: { address1: 'Privater Testweg 123' }, lineItems: { nodes: [] } }] };
  fs.writeFileSync(datei, JSON.stringify(raw));
  const text = fs.readFileSync(datei, 'utf8');
  const r = api.kundenMusterwirkung();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.abdeckung.bestellungenImExport, 1);
  assert.doesNotMatch(JSON.stringify(r), /Synthetischer Privatname|privat@example|Privater Testweg|990001|9988|#SYNTHETISCH/);
  assert.equal(fs.readFileSync(datei, 'utf8'), text);
  assert.deepEqual(fs.readdirSync(dir), ['bestelluebersicht']);
  fs.writeFileSync(datei, JSON.stringify({ orders: [{ id: 'unvollstaendig' }] }));
  assert.equal(api.kundenMusterwirkung().verfuegbar, false, 'semantisch defekt ist nicht echte Null');
});
