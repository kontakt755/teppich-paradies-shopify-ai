import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { lieferantenStand } from '../lib/beschaffung.mjs';

const O = 'gid://shopify/Order/992', WARE = 'gid://shopify/LineItem/9921', KETTEL = 'gid://shopify/LineItem/9922';
const person = { name: 'Testperson', kuerzel: 'test', rolle: 'mitarbeiter' };
const ALLES_OK = { menge: 'ok', masse: 'ok', lieferweg: 'ok', zuschlaege: 'ok' };

function umgebung() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-lieferantenstand-api-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  const zeile = (id, title, handle, menge, attrs = []) => ({ id, title, sku: null, quantity: menge, currentQuantity: menge, unfulfilledQuantity: menge, customAttributes: attrs,
    variant: { id: `${id}-v`, sku: null, product: { handle, title, productType: 'Teppich' } } });
  const daten = { orders: [{ id: O, name: '#ATTRAPPE2', createdAt: '2026-11-06T15:50:00Z', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED',
    lineItems: { nodes: [
      zeile(WARE, 'Testteppich nach Maß', 'testteppich-nach-mass', 598, [{ key: 'Maße', value: '230 × 260 cm' }, { key: 'Einfassung', value: 'Gekettelt' }]),
      zeile(KETTEL, 'Kettelservice', 'kettelservice', 980, [{ key: 'Zu Teppich', value: 'Testteppich nach Maß' }]),
    ] } }] };
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify(daten));
  let aufrufe = 0;
  const api = createApi({ root: dir, privatDirPath: dir, env: {}, gh: async () => '', now: () => new Date('2026-11-06T19:00:00Z'),
    shopifyZugang: async () => { aufrufe++; throw new Error('Shopify darf nicht aufgerufen werden'); } });
  return { dir, api, aufrufe: () => aufrufe };
}
const setze = (u, payload, wer = person) => u.api.einkaufAuftragsstatusSetzen({ orderId: O, lineItemId: WARE, aktion: 'lieferantenstand', ...payload }, wer);

test('Lieferantenstand über die API: Leser 403, Eigenleistung 409, Übergänge ohne Shopify-Aufruf', async () => {
  const u = umgebung();
  const f = path.join(u.dir, 'auftragsstatus.json');
  await assert.rejects(() => setze(u, { schritt: 'anfrage', felder: { am: '2026-11-06', lieferant: 'Lieferant A' } }, { ...person, rolle: 'lesen' }), e => e.status === 403);
  await assert.rejects(() => setze(u, { lineItemId: KETTEL, schritt: 'anfrage', felder: { am: '2026-11-06', lieferant: 'Lieferant A' } }), e => e.status === 409 && /Eigenleistung/.test(e.message));
  await assert.rejects(() => setze(u, { lineItemId: 'fremd', schritt: 'anfrage', felder: { am: '2026-11-06', lieferant: 'A' } }), e => e.status === 400);
  assert.equal(fs.existsSync(f), false, 'abgelehnte Aufrufe schreiben nichts');

  const a = await setze(u, { schritt: 'anfrage', felder: { am: '2026-11-06', lieferant: 'Lieferant A' } });
  assert.equal(lieferantenStand(a.eintrag).stufe, 'angefragt');
  await u.api.einkaufAuftragsstatusSetzen({ orderId: O, lineItemId: WARE, status: 'bestellt' }, person);
  const d = await setze(u, { schritt: 'bestelldaten', felder: { am: '2026-11-06T17:38:00.000Z', lieferwegOffen: 'direkt oder Abholung' } });
  assert.equal(d.eintrag.bestelltAm, '2026-11-06T17:38:00.000Z');
  assert.equal(lieferantenStand(d.eintrag, { jetzt: new Date('2026-11-06T19:00:00Z') }).text, 'AB fehlt');
  await assert.rejects(() => setze(u, { schritt: 'ab', felder: { nummer: 'AB-1', liefertermin: '2026-11-14' } }), e => e.status === 400);
  const ab = await setze(u, { schritt: 'ab', felder: { nummer: 'AB-1', liefertermin: '2026-11-14', pruefung: ALLES_OK } });
  assert.equal(ab.eintrag.status, 'bestellt');
  assert.equal(ab.eintrag.beschaffung.ab.geprueftVon, person.name, 'handelnde Person aus der Sitzung');
  assert.equal(u.api.einkaufAuftragsstatus().positionen[`${O}::${KETTEL}`], undefined, 'Kettelservice bleibt ohne Lieferantenbestellung');
  assert.equal(u.aufrufe(), 0);
});
