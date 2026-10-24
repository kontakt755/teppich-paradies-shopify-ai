import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auftragsstatusPfad, leseAlle, setzeStatus, oeffneWieder, statusVorErledigt, filterGruppe, positionKey, STATUS_ORDER, AuftragsstatusFehler, vermerkeShopifyVersand, setzeZurueckAufOffen } from '../lib/auftragsstatus.mjs';

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-auftragsstatus-')); }

test('leseAlle liefert leeres Objekt, wenn die Datei fehlt', () => {
  const dir = tmpDir();
  const positionen = leseAlle(auftragsstatusPfad(dir));
  assert.deepEqual(positionen, {});
});

test('setzeStatus schreibt atomar und ist danach lesbar', () => {
  const dir = tmpDir();
  const file = auftragsstatusPfad(dir);
  const jetzt = new Date('2026-09-23T09:00:00Z');
  const eintrag = setzeStatus(file, { orderId: 'gid://shopify/Order/1', lineItemId: 'gid://shopify/LineItem/1', status: 'bestellt', actor: 'tobias', lieferantBestellnummer: 'LB-42', jetzt });
  assert.equal(eintrag.status, 'bestellt');
  assert.equal(eintrag.lieferantBestellnummer, 'LB-42');
  assert.equal(eintrag.bestelltVon, 'tobias');
  assert.ok(fs.existsSync(file));
  assert.ok(!fs.readdirSync(dir).some(f => f.endsWith('.tmp')), 'keine liegen gebliebene tmp-Datei');

  const key = positionKey('gid://shopify/Order/1', 'gid://shopify/LineItem/1');
  const alle = leseAlle(file);
  assert.equal(alle[key].status, 'bestellt');
});

test('setzeStatus behaelt frueher gesetzte Felder beim naechsten Schritt', () => {
  const dir = tmpDir();
  const file = auftragsstatusPfad(dir);
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'bestellt', actor: 'tobias', lieferantBestellnummer: 'LB-1' });
  const zweite = setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'geliefert', actor: 'ahmet' });
  assert.equal(zweite.status, 'geliefert');
  assert.equal(zweite.lieferantBestellnummer, 'LB-1', 'alte Bestellnummer bleibt erhalten');
  assert.ok(zweite.bestelltAm, 'fruehere Stufe bleibt im Datensatz');
});

test('setzeStatus lehnt fehlende Pflichtangaben ab', () => {
  const dir = tmpDir();
  const file = auftragsstatusPfad(dir);
  assert.throws(() => setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'bestellt', actor: '' }), AuftragsstatusFehler);
  assert.throws(() => setzeStatus(file, { orderId: '', lineItemId: '1', status: 'bestellt', actor: 'x' }), AuftragsstatusFehler);
  assert.throws(() => setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'unsinn', actor: 'x' }), AuftragsstatusFehler);
});

test('STATUS_ORDER und filterGruppe bilden offen/bestellt/unterwegs/erledigt ab', () => {
  assert.deepEqual(STATUS_ORDER, ['bestellt', 'geliefert', 'raus', 'erledigt']);
  assert.equal(filterGruppe(undefined), 'offen');
  assert.equal(filterGruppe('bestellt'), 'bestellt');
  assert.equal(filterGruppe('geliefert'), 'unterwegs');
  assert.equal(filterGruppe('raus'), 'unterwegs');
  assert.equal(filterGruppe('erledigt'), 'erledigt');
});

test('oeffneWieder: ohne Einkauf abgeschlossen -> wieder "noch nicht bestellt", Abschluss im Verlauf', () => {
  const file = auftragsstatusPfad(tmpDir());
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'erledigt', actor: 'tobias', notiz: 'Testbestellung', jetzt: new Date('2026-09-23T09:00:00Z') });
  const e = oeffneWieder(file, { orderId: '1', lineItemId: '1', actor: 'ahmet', notiz: 'war doch echt', jetzt: new Date('2026-09-24T08:00:00Z') });
  assert.equal(e.status, null);
  assert.equal(filterGruppe(e.status), 'offen');
  assert.equal(e.wiederGeoeffnetVon, 'ahmet');
  assert.equal(e.erledigtAm, undefined, 'Abschluss steht nicht mehr als aktueller Stand im Datensatz');
  assert.deepEqual(e.verlauf, [{ aktion: 'wieder geöffnet', am: '2026-09-24T08:00:00.000Z', von: 'ahmet', zurueckAuf: null, abgeschlossenAm: '2026-09-23T09:00:00.000Z', abgeschlossenVon: 'tobias', abschlussGrund: 'Testbestellung', notiz: 'war doch echt' }]);
  assert.equal(leseAlle(file)[positionKey('1', '1')].status, null);
});

test('oeffneWieder: normal durchgelaufene Position faellt auf den letzten Schritt zurueck', () => {
  const file = auftragsstatusPfad(tmpDir());
  const t = h => new Date(`2026-09-2${h}T09:00:00Z`);
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'bestellt', actor: 'x', lieferantBestellnummer: 'LB-1', jetzt: t(1) });
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'geliefert', actor: 'x', jetzt: t(2) });
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'erledigt', actor: 'x', jetzt: t(3) });
  const e = oeffneWieder(file, { orderId: '1', lineItemId: '1', actor: 'y', jetzt: t(4) });
  assert.equal(e.status, 'geliefert');
  assert.equal(e.lieferantBestellnummer, 'LB-1');
  assert.equal(e.bestelltAm, '2026-09-21T09:00:00.000Z', 'Bestelldatum bleibt fuer die Wartezeit erhalten');
});

test('oeffneWieder lehnt nicht erledigte oder unbekannte Positionen ab', () => {
  const file = auftragsstatusPfad(tmpDir());
  assert.throws(() => oeffneWieder(file, { orderId: '1', lineItemId: '1', actor: 'x' }), AuftragsstatusFehler);
  setzeStatus(file, { orderId: '1', lineItemId: '1', status: 'bestellt', actor: 'x' });
  assert.throws(() => oeffneWieder(file, { orderId: '1', lineItemId: '1', actor: 'x' }), AuftragsstatusFehler);
  assert.throws(() => oeffneWieder(file, { orderId: '1', lineItemId: '1', actor: '' }), AuftragsstatusFehler);
});

test('statusVorErledigt ignoriert Schritte nach dem Abschluss', () => {
  assert.equal(statusVorErledigt(null), null);
  assert.equal(statusVorErledigt({ status: 'erledigt', erledigtAm: '2026-09-23T09:00:00Z' }), null);
  assert.equal(statusVorErledigt({ status: 'erledigt', bestelltAm: '2026-09-22T09:00:00Z', erledigtAm: '2026-09-23T09:00:00Z' }), 'bestellt');
  assert.equal(statusVorErledigt({ status: 'erledigt', rausAm: '2026-09-25T09:00:00Z', bestelltAm: '2026-09-22T09:00:00Z', erledigtAm: '2026-09-23T09:00:00Z' }), 'bestellt');
});

test('Versand: Sendungsnummer bei "raus", Shopify-Vermerk bleibt bei Wiederholung, neuer Versand faengt leer an', () => {
  const file = auftragsstatusPfad(tmpDir());
  const pos = { orderId: 'gid://shopify/Order/1', lineItemId: 'gid://shopify/LineItem/1', actor: 'test' };
  setzeStatus(file, { ...pos, status: 'geliefert' });
  const e = setzeStatus(file, { ...pos, status: 'raus', sendungsnummer: 'N1', versanddienst: 'GLS' });
  assert.deepEqual([e.sendungsnummer, e.versanddienst], ['N1', 'GLS']);
  assert.equal(setzeStatus(file, { ...pos, status: 'bestellt', sendungsnummer: 'X' }).sendungsnummer, 'N1', 'nur bei "raus"');
  vermerkeShopifyVersand(file, { ...pos, vermerk: { status: 'gebucht', fulfillmentId: 'gid://shopify/Fulfillment/9', kundeBenachrichtigt: true, am: '2026-10-13T10:00:00Z' } });
  assert.equal(leseAlle(file)[positionKey(pos.orderId, pos.lineItemId)].shopifyVersand.status, 'gebucht');
  // Wechsel von "bestellt" auf "raus" ist ein neuer Versand: alter Vermerk weg.
  const neu = setzeStatus(file, { ...pos, status: 'raus' });
  assert.equal(neu.shopifyVersand, undefined);
  assert.equal(neu.sendungsnummer, null);
  // Zweites "raus" auf derselben Sendung: Vermerk bleibt.
  vermerkeShopifyVersand(file, { ...pos, vermerk: { status: 'gebucht' } });
  assert.equal(setzeStatus(file, { ...pos, status: 'raus' }).shopifyVersand.status, 'gebucht');
  // Erledigt und zurueck auf raus (Korrektur): Vermerk bleibt.
  setzeStatus(file, { ...pos, status: 'erledigt' });
  assert.equal(setzeStatus(file, { ...pos, status: 'raus' }).shopifyVersand.status, 'gebucht');
  // Zurueck auf offen: Vermerk wandert in den Verlauf.
  const offen = setzeZurueckAufOffen(file, { ...pos, notiz: 'Versehen' });
  assert.equal(offen.shopifyVersand, undefined);
  assert.equal(offen.verlauf.at(-1).vorher.shopifyVersand.status, 'gebucht');
  assert.equal(vermerkeShopifyVersand(file, { orderId: 'gid://shopify/Order/2', lineItemId: 'gid://shopify/LineItem/2', vermerk: { status: 'gebucht' } }), null, 'unbekannte Position: nichts angelegt');
});

test('Kettler-Vermerk: "bestellt" mit ueber=kettler bleibt bei den naechsten Schritten, null nimmt ihn zurueck', () => {
  const file = auftragsstatusPfad(tmpDir());
  const basis = { orderId: 'o1', lineItemId: 'l1', actor: 'test' };
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt', ueber: 'kettler' }).ueber, 'kettler');
  assert.equal(setzeStatus(file, { ...basis, status: 'geliefert' }).ueber, 'kettler', 'naechster Schritt behaelt den Weg');
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt' }).ueber, 'kettler', 'ohne Angabe bleibt der Vermerk');
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt', ueber: null }).ueber, null);
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt', ueber: 'irgendwas' }).ueber, null, 'nur "kettler" und "kunde" sind Wege');
  assert.equal(leseAlle(file)[positionKey('o1', 'l1')].ueber, null);
});

test('Direktversand-Vermerk: Muster mit ueber=kunde behalten den Weg bis "raus"', () => {
  const file = auftragsstatusPfad(tmpDir());
  const basis = { orderId: 'o2', lineItemId: 'l2', actor: 'test' };
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt', ueber: 'kunde' }).ueber, 'kunde');
  assert.equal(setzeStatus(file, { ...basis, status: 'raus' }).ueber, 'kunde', '"raus" ohne Angabe behaelt den Weg');
  assert.equal(setzeStatus(file, { ...basis, status: 'bestellt', ueber: null }).ueber, null, 'Mail an den Laden nimmt ihn zurueck');
});
