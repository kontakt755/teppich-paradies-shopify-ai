// Kein echtes Shopify: physische Rolleninventur und gleichzeitige Bestandsaenderungen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { korrigiereRollenbestand, verkaufeVonRolle } from '../lib/sonderposten.mjs';
import { attrappe, PRODUKT_ID, ITEM_ID } from './sonderposten-attrappe.mjs';

const OP = 'a7b26c39-887b-4b91-a159-a7e1be2cb222';
const eingabe = (werte = {}) => ({ produktId: PRODUKT_ID, inventoryItemId: ITEM_ID, erwarteterBestand: 80, operationId: OP, laengeM: 12, ...werte });
const inventur = (a, werte = {}) => korrigiereRollenbestand(a.proxy, eingabe(werte));

test('12 m bei 4 m Breite: physisch 48 m2, CAS gegen on_hand, feste Vorgangs-ID, Gegenprobe', async () => {
  const a = attrappe({ rolle: true });
  const r = await inventur(a);
  assert.equal(r.ok, true); assert.equal(r.bestandNachher, 48); assert.equal(r.restLaengeM, 12);
  const m = a.aufrufe.find(x => x.name === 'SonderpostenRolleninventur').variables;
  assert.equal(m.input.name, 'on_hand');
  assert.equal(m.input.quantities[0].changeFromQuantity, 80);
  assert.equal(m.input.quantities[0].quantity, 48);
  assert.equal(m.schluessel, `rollen-inventur-${OP}`);
  assert.match(m.input.referenceDocumentUri, new RegExp(OP));
  assert.deepEqual(a.namen(), ['SonderpostenEinzeln', 'SonderpostenRolleninventur', 'SonderpostenEinzeln']);
  // Derselbe alte Dialog kann nach Erfolg keinen inzwischen veraenderten Bestand ueberschreiben.
  a.zustand.available = 40; a.zustand.onHand = 40;
  await assert.rejects(() => inventur(a), e => e.status === 409);
  assert.equal(a.zustand.available, 40);
});

test('Dezimallaenge wird abgerundet, 5 m Breite fest aus Shopify, 0 ist leer', async () => {
  const a = attrappe({ rolle: true });
  assert.equal((await inventur(a, { laengeM: 12.13 })).bestandNachher, 48);
  const b = attrappe({ rolle: true }); b.zustand.rollenbreite = '5.0';
  assert.equal((await inventur(b, { laengeM: 20 })).bestandNachher, 100);
  const c = attrappe({ rolle: true, available: 0 });
  assert.equal((await inventur(c, { erwarteterBestand: 0, laengeM: 12 })).bestandNachher, 48, 'leere, gefuehrte Rolle darf initialisiert werden');
  assert.equal((await inventur(c, { erwarteterBestand: 48, laengeM: 0 })).bestandNachher, 0);
});

test('Gebundene, reservierte, zurueckgehaltene und unbekannte Mengen blockieren vor jeder Mutation', async () => {
  for (const name of ['committed', 'reserved', 'damaged', 'safety_stock', 'quality_control']) {
    const a = attrappe({ rolle: true }); a.zustand[name] = 1; a.zustand.onHand = 81;
    await assert.rejects(() => inventur(a), e => e.status === 409 && e.extra.grund === 'inventur-gesperrt');
    assert.deepEqual(a.namen(), ['SonderpostenEinzeln'], name);
  }
  const a = attrappe({ rolle: true });
  const original = a.proxy.execute;
  a.proxy.execute = async (q,v) => { const d = await original(q,v); if (d.product) d.product.variants.nodes[0].inventoryItem.inventoryLevel.quantities = [{ name: 'available', quantity: 80 }, { name: 'on_hand', quantity: 80 }]; return d; };
  await assert.rejects(() => inventur(a), e => e.status === 409 && /lesbar/.test(e.message));
});

test('Falsche Einheit, mehrere Varianten, fehlendes Limit oder Tracking und Ueberverkauf sperren Inventur', async () => {
  for (const werte of [{ tracked: false }, { policy: 'CONTINUE' }, { preisPro001Qm: 'true' }, { maxRollenlaenge: '0' }, { rollenbreite: '0' }, { rollenbreite: '4.009' }, { status: 'ARCHIVED' }]) {
    const a = attrappe({ rolle: true }); Object.assign(a.zustand, werte);
    await assert.rejects(() => inventur(a), e => [400,409].includes(e.status));
    assert.ok(!a.namen().includes('SonderpostenRolleninventur'));
  }
  const a = attrappe({ rolle: true }); const original = a.proxy.execute;
  a.proxy.execute = async (q,v) => { const d = await original(q,v); if (d.product) d.product.variants.nodes.push(d.product.variants.nodes[0]); return d; };
  await assert.rejects(() => inventur(a), e => e.status === 409);
});

test('Ungueltige Laenge, fehlende Vorgangs-ID/Bestandsangabe und falsches InventoryItem aendern nichts', async () => {
  for (const werte of [{ laengeM: -1 }, { laengeM: null }, { laengeM: '' }, { laengeM: 100.01 }, { laengeM: 12.123 }, { operationId: '' }, { erwarteterBestand: null }, { inventoryItemId: null }]) {
    const a = attrappe({ rolle: true });
    await assert.rejects(() => inventur(a,werte), e => e.status === 400);
    assert.deepEqual(a.namen(), []);
  }
  const a = attrappe({ rolle: true });
  await assert.rejects(() => inventur(a,{ inventoryItemId: 'gid://shopify/InventoryItem/1' }), e => e.status === 409);
});

test('Physischer Bestand aendert sich nach Lesen: on_hand-CAS lehnt ab', async () => {
  const a = attrappe({ rolle: true }); const original = a.proxy.execute;
  a.proxy.execute = async (q,v) => { if (/mutation SonderpostenRolleninventur/.test(q)) { a.zustand.onHand = 76; a.zustand.available = 76; } return original(q,v); };
  await assert.rejects(() => inventur(a), e => e.status === 409 && /gleichzeitig/.test(e.message));
  assert.equal(a.zustand.onHand, 76);
});

test('Onlinebindung nach dem Lesen bleibt beim Setzen von on_hand abgezogen', async () => {
  const a = attrappe({ rolle: true }); const original = a.proxy.execute;
  a.proxy.execute = async (q,v) => { if (/mutation SonderpostenRolleninventur/.test(q)) { a.zustand.onHand = 80; a.zustand.available = 60; a.zustand.committed = 20; } return original(q,v); };
  const r = await inventur(a);
  assert.equal(r.bestandNachher, 48); assert.equal(r.verfuegbarNachher, 28); assert.equal(r.restLaengeM, 7);
  assert.equal(a.zustand.committed, 20);
  assert.equal(r.eintrag.inventurMoeglich, false);
});

test('Fehlendes write_inventory, Antwortverlust und fehlende Gegenprobe werden eindeutig gemeldet', async () => {
  await assert.rejects(() => inventur(attrappe({ rolle: true, verweigert: true })), e => e.status === 403 && e.extra.grund === 'recht-fehlt');
  for (const antwortWeg of ['vor','nach']) {
    const a = attrappe({ rolle: true, antwortWeg });
    await assert.rejects(() => inventur(a), e => e.status === 504 && e.extra.grund === 'unklar');
    assert.equal(a.zustand.available, antwortWeg === 'nach' ? 48 : 80);
  }
  const r = await inventur(attrappe({ rolle: true, lesenScheitert: [2] }));
  assert.equal(r.gebucht, true); assert.equal(r.ok, false); assert.equal(r.gegenprobe, 'fehlgeschlagen');
});

test('12 m / Laden 10 m / Online 5 m: Laden zuerst, Online zuerst und gleichzeitiger Kauf', async () => {
  const a = attrappe({ rolle: true }); await inventur(a);
  await verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 10 });
  assert.equal(a.zustand.available, 8, 'nur 2 m frei, Onlinewunsch 5 m braucht 20 m2 und passt nicht');
  const b = attrappe({ rolle: true, available: 28 }); b.zustand.onHand = 48; b.zustand.committed = 20;
  await assert.rejects(() => verkaufeVonRolle(b.proxy,{ produktId: PRODUKT_ID, laengeM: 10 }), e => e.status === 409);
  const c = attrappe({ rolle: true, available: 48 }); const original = c.proxy.execute;
  c.proxy.execute = async (q,v) => { if (/mutation SonderpostenLadenverkauf/.test(q)) { c.zustand.available = 28; c.zustand.committed = 20; } return original(q,v); };
  await assert.rejects(() => verkaufeVonRolle(c.proxy,{ produktId: PRODUKT_ID, laengeM: 10 }), e => e.status === 409);
  assert.equal(c.zustand.available, 28, 'Onlinebestand nicht ueberschrieben');
});
