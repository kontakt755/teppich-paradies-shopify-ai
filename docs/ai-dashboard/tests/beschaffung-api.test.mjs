import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { beschaffungText, restmenge } from '../lib/beschaffung.mjs';
const O = 'gid://shopify/Order/991', L = 'gid://shopify/LineItem/991';
const position = { orderId: O, lineItemId: L };
const person = { name: 'Testperson', kuerzel: 'test', rolle: 'mitarbeiter' };
function umgebung(menge = 3, anzahl = 1) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-beschaffung-api-')); fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  const ordersFile = path.join(dir, 'bestelluebersicht/orders.json');
  const daten = { orders: [{ id: O, name: '#ATTRAPPE', createdAt: '2026-10-01T10:00:00Z', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', lineItems: { nodes: Array.from({ length: anzahl }, (_, i) => ({ id: i ? `${L}-${i}` : L, title: 'Muster Testboden', sku: 'M-T991', quantity: menge, currentQuantity: menge, unfulfilledQuantity: menge, customAttributes: [], variant: { id: 'gid://shopify/ProductVariant/991', sku: 'M-T991', product: { handle: 'muster-testboden', title: 'Muster Testboden', productType: 'Musterservice' } } })) } }] };
  const schreib = (mengeNeu, offen = mengeNeu) => { for (const p of daten.orders[0].lineItems.nodes) { p.quantity = p.currentQuantity = mengeNeu; p.unfulfilledQuantity = offen; } fs.writeFileSync(ordersFile, JSON.stringify(daten)); };
  schreib(menge);
  let aufrufe = 0;
  const api = createApi({ root: dir, privatDirPath: dir, env: {}, gh: async () => '', now: () => new Date('2026-10-13T10:00:00Z'), shopifyZugang: async () => { aufrufe++; throw new Error('Shopify darf nicht aufgerufen werden'); } });
  return { dir, api, aufrufe: () => aufrufe, schreib, daten };
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

test('Frischer Export 10 → 12: Rest ist sofort sichtbar; alte Einzel- und Sammelwege bleiben ohne Write gesperrt', async () => {
  const u = umgebung(10), set = payload => u.api.einkaufAuftragsstatusSetzen({ ...position, ...payload }, person);
  await set({ aktion: 'beschaffung', felder: { angekommen: 10, verwendbar: 10 } });
  const f = path.join(u.dir, 'auftragsstatus.json'), vor = fs.readFileSync(f, 'utf8');
  u.schreib(12);
  const e = u.api.einkaufAuftragsstatus().positionen[`${O}::${L}`];
  assert.equal(e.status, 'bestellt'); assert.equal(restmenge(e), 2); assert.match(beschaffungText(e), /2 Muster fehlen/);
  assert.equal(u.api.kundenBestellungen().zeilen[0].zeitleisteAbgeschlossen, false);
  assert.equal(fs.readFileSync(f, 'utf8'), vor, 'Lesen verändert keine bestätigten Mengen');
  for (const status of ['geliefert', 'raus', 'erledigt']) {
    await assert.rejects(() => set({ status }), e => e.status === 409);
    if (status !== 'erledigt') await assert.rejects(() => set({ aktion: 'schritt', schritt: status }), e => e.status === 409);
  }
  await assert.rejects(() => u.api.kundenBestellungFertig({ orderId: O, lineItemIds: [L] }, person), e => e.status === 409);
  assert.equal(fs.readFileSync(f, 'utf8'), vor);
  const r = await set({ aktion: 'beschaffung', soll: 10, felder: { angekommen: 10, verwendbar: 10 } });
  assert.equal(r.eintrag.beschaffung.wareneingang.soll, 12); assert.equal(r.eintrag.status, 'bestellt');
  assert.equal(u.aufrufe(), 0);
});

test('Versand reduziert nur offene Menge: Gesamt-Soll und vollständig bestätigter Eingang bleiben erhalten', async () => {
  const u = umgebung(10);
  await u.api.einkaufAuftragsstatusSetzen({ ...position, aktion: 'beschaffung', felder: { angekommen: 10, verwendbar: 10 } }, person);
  u.schreib(10, 0);
  const e = u.api.einkaufAuftragsstatus().positionen[`${O}::${L}`];
  assert.equal(e.status, 'geliefert'); assert.equal(restmenge(e), 0); assert.equal(e.beschaffung.klaerung, null);
  assert.equal(u.aufrufe(), 0);
});

test('12 → 10 und Einheitenwechsel: Klärhinweis statt Kürzung/Umrechnung oder altem Abschluss', async () => {
  const u = umgebung(12), set = payload => u.api.einkaufAuftragsstatusSetzen({ ...position, ...payload }, person);
  await set({ aktion: 'beschaffung', felder: { angekommen: 12, verwendbar: 12 } });
  const f = path.join(u.dir, 'auftragsstatus.json'), vor = fs.readFileSync(f, 'utf8');
  u.schreib(10);
  let e = u.api.einkaufAuftragsstatus().positionen[`${O}::${L}`];
  assert.match(e.beschaffung.klaerung, /kleiner/); assert.equal(e.beschaffung.wareneingang.angekommen, 12);
  assert.equal(u.api.kundenBestellungen().zeilen[0].naechsterSchritt.stufe, 'problem');
  for (const status of ['geliefert', 'raus', 'erledigt']) await assert.rejects(() => set({ status }), err => err.status === 409);
  assert.equal(fs.readFileSync(f, 'utf8'), vor);
  const roh = JSON.parse(vor); roh.positionen[`${O}::${L}`].beschaffung.wareneingang.einheit = 'paket'; fs.writeFileSync(f, JSON.stringify(roh));
  const vorEinheit = fs.readFileSync(f, 'utf8');
  e = u.api.einkaufAuftragsstatus().positionen[`${O}::${L}`];
  assert.match(e.beschaffung.klaerung, /Bestelleinheit geändert/); assert.equal(e.beschaffung.wareneingang.einheit, 'paket');
  await assert.rejects(() => set({ aktion: 'beschaffung', felder: { angekommen: 10, verwendbar: 10 } }), err => err.status === 409);
  await assert.rejects(() => set({ status: 'erledigt' }), err => err.status === 409);
  assert.equal(fs.readFileSync(f, 'utf8'), vorEinheit); assert.equal(u.aufrufe(), 0);
});

test('Abgelehnte Sammelergebnisse und Übergabe aus Eigenbestand lassen beide Dateien bytegleich', async () => {
  for (const schritt of ['kein_interesse', 'kunde_hat_bestellt', 'kunde_hat_muster']) {
    const u = umgebung(3, 2), set = payload => u.api.einkaufAuftragsstatusSetzen({ ...position, ...payload }, person);
    await set({ aktion: 'schritt', schritt: 'notiz', notiz: 'Vorhandener Attrappenverlauf' });
    await set({ aktion: 'beschaffung', felder: { angekommen: 2, verwendbar: 2 } });
    if (schritt === 'kunde_hat_muster') await set({ lineItemId: undefined, aktion: 'musterHerkunft', herkunft: 'eigen_versand' });
    const sf = path.join(u.dir, 'auftragsstatus.json'), vf = path.join(u.dir, 'auftragsverlauf.json');
    const s = fs.readFileSync(sf, 'utf8'), v = fs.readFileSync(vf, 'utf8');
    await assert.rejects(() => set({ aktion: 'schritt', schritt }), e => e.status === 409);
    assert.equal(fs.readFileSync(sf, 'utf8'), s); assert.equal(fs.readFileSync(vf, 'utf8'), v);
    assert.equal(u.api.kundenBestellungen().zeilen[0].zeitleisteAbgeschlossen, false); assert.equal(u.aufrufe(), 0);
  }
});

test('Beschädigter Ereignisspeicher verhindert Sammelabschluss bevor die erste Position geschrieben wird', async () => {
  const u = umgebung(3, 2), sf = path.join(u.dir, 'auftragsstatus.json'), vf = path.join(u.dir, 'auftragsverlauf.json');
  await u.api.einkaufAuftragsstatusSetzen({ ...position, status: 'bestellt' }, person);
  const vor = fs.readFileSync(sf, 'utf8'); fs.writeFileSync(vf, '{kaputt');
  await assert.rejects(() => u.api.einkaufAuftragsstatusSetzen({ ...position, aktion: 'schritt', schritt: 'kein_interesse' }, person), /beschädigt/);
  assert.equal(fs.readFileSync(sf, 'utf8'), vor); assert.equal(fs.readFileSync(vf, 'utf8'), '{kaputt');
});

test('Gleichzeitige Übernahmen lesen die Sperre erst in ihrer Reihe; nur eine Person schreibt', async () => {
  const u = umgebung(), payload = { aktion: 'uebernahme', uebernahmeAktion: 'nehmen', positionen: [position] };
  const r = await Promise.allSettled([u.api.einkaufAuftragsstatusSetzen(payload, person), u.api.einkaufAuftragsstatusSetzen(payload, { name: 'Andere Testperson', kuerzel: 'andere', rolle: 'mitarbeiter' })]);
  assert.equal(r[0].status, 'fulfilled'); assert.equal(r[1].status, 'rejected'); assert.equal(r[1].reason.status, 409);
  assert.equal(u.api.einkaufAuftragsstatus().positionen[`${O}::${L}`].uebernahme.id, 'test');
});
