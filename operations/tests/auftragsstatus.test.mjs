import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auftragsstatusPfad, leseAlle, setzeStatus, filterGruppe, positionKey, STATUS_ORDER, AuftragsstatusFehler } from '../lib/auftragsstatus.mjs';

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
