import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auftragsstatusPfad, leseAlle, setzeStatus, oeffneWieder, statusVorErledigt, filterGruppe, positionKey, STATUS_ORDER, AuftragsstatusFehler } from '../lib/auftragsstatus.mjs';

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
