import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
const O = 'gid://shopify/Order/991', L = 'gid://shopify/LineItem/991';
const position = { orderId: O, lineItemId: L };
const person = { name: 'Testperson', kuerzel: 'test', rolle: 'mitarbeiter' };
function umgebung() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-beschaffung-api-')); fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders: [{ id: O, name: '#ATTRAPPE', createdAt: '2026-10-01T10:00:00Z', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', lineItems: { nodes: [{ id: L, title: 'Muster Testboden', sku: 'M-T991', quantity: 3, currentQuantity: 3, unfulfilledQuantity: 3, customAttributes: [], variant: { id: 'gid://shopify/ProductVariant/991', sku: 'M-T991', product: { handle: 'muster-testboden', title: 'Muster Testboden', productType: 'Musterservice' } } }] } }] }));
  let aufrufe = 0;
  const api = createApi({ root: dir, privatDirPath: dir, env: {}, gh: async () => '', now: () => new Date('2026-10-13T10:00:00Z'), shopifyZugang: async () => { aufrufe++; throw new Error('Shopify darf nicht aufgerufen werden'); } });
  return { dir, api, aufrufe: () => aufrufe };
}
test('Wareneingang nimmt belegte Bestellmenge, nicht die manipulierte Client-Sollmenge; Leser 403; kein Shopify-Aufruf', async () => {
  const u = umgebung();
  await assert.rejects(() => u.api.einkaufAuftragsstatusSetzen({ ...position, aktion: 'beschaffung', felder: { liefertermin: '2026-10-20' } }, { ...person, rolle: 'lesen' }), e => e.status === 403);
  const r = await u.api.einkaufAuftragsstatusSetzen({ ...position, aktion: 'beschaffung', soll: 100, felder: { angekommen: 2, verwendbar: 2, liefertermin: '2026-10-20' } }, person);
  assert.equal(r.eintrag.beschaffung.wareneingang.soll, 3); assert.equal(r.eintrag.status, 'bestellt'); assert.equal(u.aufrufe(), 0);
  const z = u.api.kundenBestellungen().zeilen.find(x => x.orderId === O);
  assert.match(z.naechsterSchritt.text, /zugesagt zum 20\.10\.2026/);
  assert.equal(z.naechsterSchritt.stufe, 'warten');
  const vor = fs.readFileSync(path.join(u.dir, 'auftragsstatus.json'), 'utf8');
  await assert.rejects(() => u.api.einkaufAuftragsstatusSetzen({ ...position, aktion: 'schritt', schritt: 'geliefert' }, person), /Fehlmenge/);
  assert.equal(fs.readFileSync(path.join(u.dir, 'auftragsstatus.json'), 'utf8'), vor);
  await assert.rejects(() => u.api.einkaufAuftragsstatusSetzen({ ...position, lineItemId: 'fremd', aktion: 'beschaffung', felder: { angekommen: 3, verwendbar: 3 } }, person), e => e.status === 400);
});
test('Übernahme wird aus Sitzung zugeordnet; fremdes Freigeben und unbekannte Position ändern nichts', async () => {
  const u = umgebung(), payload = { aktion: 'uebernahme', uebernahmeAktion: 'nehmen', positionen: [position], actor: 'Gefälschter Client' };
  const r = await u.api.einkaufAuftragsstatusSetzen(payload, person); assert.equal(r.eintraege[`${O}::${L}`].uebernahme.person, person.name);
  const zweit = { name: 'Zweite Testperson', kuerzel: 'zweit', rolle: 'mitarbeiter' };
  await assert.rejects(() => u.api.einkaufAuftragsstatusSetzen({ ...payload, uebernahmeAktion: 'freigeben' }, zweit), e => e.status === 403);
  await assert.rejects(() => u.api.einkaufAuftragsstatusSetzen({ ...payload, uebernahmeAktion: 'uebernehmen' }, zweit), e => e.status === 403);
  await u.api.einkaufAuftragsstatusSetzen({ ...payload, uebernahmeAktion: 'uebernehmen' }, { ...zweit, rolle: 'inhaber' });
  assert.equal(u.api.einkaufAuftragsstatus().positionen[`${O}::${L}`].uebernahme.id, 'zweit'); assert.equal(u.aufrufe(), 0);
});
test('Beschädigter Positionsspeicher verweigert Beschaffung/Übernahme ohne Datenverlust', async () => {
  const u = umgebung(), f = path.join(u.dir, 'auftragsstatus.json'); fs.writeFileSync(f, '{kaputt');
  for (const payload of [{ ...position, aktion: 'beschaffung', felder: { liefertermin: '2026-10-20' } }, { aktion: 'uebernahme', uebernahmeAktion: 'nehmen', positionen: [position] }]) await assert.rejects(() => u.api.einkaufAuftragsstatusSetzen(payload, person));
  assert.equal(fs.readFileSync(f, 'utf8'), '{kaputt');
});
