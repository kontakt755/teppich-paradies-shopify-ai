// Lokale Ablagen des Control Centers: nur eine FEHLENDE Datei gilt als leer.
//
// Bis 2026-10-12 lieferten fuenf Ablagen bei jedem Lesefehler (kaputtes JSON,
// fehlende Leserechte) einen leeren Stand. Der naechste Klick schrieb dann eine
// Datei mit genau einem Eintrag - alles andere war weg. Diese Tests halten fest:
// beschaedigt -> Fehler, und die beschaedigte Datei bleibt Byte fuer Byte stehen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leseAlle as leseAuftragsstatus, setzeStatus as setzeAuftragsstatus, auftragsstatusPfad } from '../lib/auftragsstatus.mjs';
import { leseAlle as leseRueckrufe, setzeStatus as setzeRueckruf, rueckrufePfad } from '../lib/rueckrufe.mjs';
import { leseAlle as leseFallmarken, setzeMarke, fallmarkenPfad } from '../lib/fallmarken.mjs';
import { lies as leseOrganisation, dateiPfad as organisationPfad, baueEintrag, kommentiere, OrganisationFehler } from '../lib/organisation-speicher.mjs';
import { leseBenutzer, BenutzerFehler } from '../lib/benutzer.mjs';

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-lesefehler-')); }

const KAPUTT = '{"positionen": {"gid://shopify/Order/1::gid://shopify/LineItem/1": {"status": "bestellt"'; // abgeschnitten

function kaputteDatei(datei) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, KAPUTT);
  return datei;
}

test('Auftragsstatus: fehlend -> leer, beschaedigt -> Fehler, und ein Klick ueberschreibt nichts', () => {
  const dir = tmpDir();
  const datei = auftragsstatusPfad(dir);
  assert.deepEqual(leseAuftragsstatus(datei), {});
  kaputteDatei(datei);
  assert.throws(() => leseAuftragsstatus(datei), /auftragsstatus\.json ist beschädigt/);
  assert.throws(() => setzeAuftragsstatus(datei, { orderId: 'o2', lineItemId: 'l2', status: 'bestellt', actor: 'test' }), /beschädigt/);
  assert.equal(fs.readFileSync(datei, 'utf8'), KAPUTT, 'die beschaedigte Datei bleibt unveraendert');
  // Eine leere Datei (0 Byte) enthaelt nichts, das verloren gehen koennte.
  fs.writeFileSync(datei, '');
  assert.deepEqual(leseAuftragsstatus(datei), {});
});

test('Rueckrufe: beschaedigt -> Fehler statt leerer Liste, Datei bleibt stehen', () => {
  const datei = kaputteDatei(rueckrufePfad(tmpDir()));
  assert.throws(() => leseRueckrufe(datei), /rueckrufe\.json ist beschädigt/);
  assert.throws(() => setzeRueckruf(datei, { orderId: 'o1', status: 'angerufen', actor: 'test' }), /beschädigt/);
  assert.equal(fs.readFileSync(datei, 'utf8'), KAPUTT);
});

test('Fallmarken: beschaedigt -> Fehler statt "nichts markiert", Datei bleibt stehen', () => {
  const datei = kaputteDatei(fallmarkenPfad(tmpDir()));
  assert.throws(() => leseFallmarken(datei), /fallmarken\.json ist beschädigt/);
  assert.throws(() => setzeMarke(datei, 'email:a@example.com', { grund: 'erledigt' }), /beschädigt/);
  assert.equal(fs.readFileSync(datei, 'utf8'), KAPUTT);
});

test('Aufgaben & Notizen: beschaedigt -> Fehler; Eingabefehler tragen eine eigene Klasse (Server: 400)', () => {
  const dir = tmpDir();
  const datei = organisationPfad(dir);
  assert.deepEqual(leseOrganisation(datei).eintraege, []);
  kaputteDatei(datei);
  assert.throws(() => leseOrganisation(datei), /eintraege\.json ist beschädigt/);
  assert.equal(fs.readFileSync(datei, 'utf8'), KAPUTT);
  assert.throws(() => baueEintrag({ titel: '  ' }), e => e instanceof OrganisationFehler && /Titel/.test(e.message));
  assert.throws(() => baueEintrag({ titel: 'x', status: 'QUATSCH' }), OrganisationFehler);
  const e = baueEintrag({ titel: 'Rueckruf' });
  assert.throws(() => kommentiere(e, '   '), OrganisationFehler);
});

test('Benutzer: beschaedigt -> BenutzerFehler statt leerer Liste (sonst ueberschriebe der naechste Zugang alle anderen)', () => {
  const datei = path.join(tmpDir(), 'benutzer.json');
  assert.deepEqual(leseBenutzer(datei), []);
  fs.writeFileSync(datei, '{"benutzer": [{"name": "Test"');
  assert.throws(() => leseBenutzer(datei), e => e instanceof BenutzerFehler && /beschädigt/.test(e.message));
});

test('Leserechte fehlen: auch das ist ein Fehler, nicht "leer"', { skip: process.getuid?.() === 0 ? 'als root greift chmod nicht' : false }, () => {
  const datei = path.join(tmpDir(), 'auftragsstatus.json');
  fs.writeFileSync(datei, JSON.stringify({ version: 1, positionen: { a: { status: 'bestellt' } } }));
  fs.chmodSync(datei, 0o000);
  try {
    assert.throws(() => leseAuftragsstatus(datei), /nicht lesbar \(EACCES\)/);
  } finally {
    fs.chmodSync(datei, 0o600);
  }
});
