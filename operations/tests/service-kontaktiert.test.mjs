// Serviceanfragen "neu" -> "kontaktiert", sobald im Gesendet-Ordner eine Antwort an die Adresse steht. Ohne Netz, ohne Privatordner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { anlegen, leseAlle } from '../lib/serviceanfragen.mjs';
import { serviceKontaktiertAbgleichen } from '../lib/service-kontaktiert.mjs';

const JETZT = new Date('2026-11-11T10:00:00Z');
const neu = (datei, email, datum) => anlegen(datei, { leistung: 'verlegeservice', quelle: 'mail', datum, name: 'Testkunde', email }, { actor: 'test', jetzt: JETZT }).eintrag;

const gesendet = zeilen => async (zugang, arbeit) => arbeit({
  suche: async () => zeilen.map((_, i) => i + 1),
  kopf: async uid => Buffer.from(zeilen[uid - 1]),
});

test('Antwort nach dem Anfragetag setzt "kontaktiert", sonst bleibt "neu"; Verlauf nennt den Abgleich', async () => {
  const datei = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-service-kontakt-')), 'serviceanfragen.json');
  const a = neu(datei, 'a@example.com', '2026-11-05');
  const b = neu(datei, 'b@example.com', '2026-11-05');
  const c = neu(datei, 'c@example.com', '2026-11-10');
  const mitNurLesenFn = gesendet([
    'To: A@example.com\r\nDate: Fri, 06 Nov 2026 09:00:00 +0100\r\n\r\n',
    'To: c@example.com\r\nDate: Mon, 02 Nov 2026 09:00:00 +0100\r\n\r\n', // vor der Anfrage: zaehlt nicht
  ]);
  const gesetzt = await serviceKontaktiertAbgleichen(datei, { hauptZugang: { benutzer: 'x', passwort: 'y' }, mitNurLesenFn, jetzt: JETZT });
  assert.deepEqual(gesetzt, [a.id]);
  const alle = leseAlle(datei);
  assert.equal(alle.find(e => e.id === a.id).status, 'kontaktiert');
  assert.match(alle.find(e => e.id === a.id).verlauf.at(-1).wer, /Postfach-Abgleich/);
  assert.equal(alle.find(e => e.id === b.id).status, 'neu');
  assert.equal(alle.find(e => e.id === c.id).status, 'neu');
});

test('Ohne Hauptpostfach oder ohne offene Anfrage mit Adresse wird nichts gelesen', async () => {
  const datei = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-service-kontakt-')), 'serviceanfragen.json');
  neu(datei, 'a@example.com', '2026-11-05');
  const nie = async () => { throw new Error('darf nicht lesen'); };
  assert.deepEqual(await serviceKontaktiertAbgleichen(datei, { hauptZugang: null, mitNurLesenFn: nie }), []);
  assert.deepEqual(await serviceKontaktiertAbgleichen(path.join(path.dirname(datei), 'leer.json'), { hauptZugang: { benutzer: 'x', passwort: 'y' }, mitNurLesenFn: nie }), []);
});
