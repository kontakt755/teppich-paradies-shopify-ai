import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aktualisiere, argumente } from '../scripts/aktualisieren.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tp-aktualisieren-'));
}

test('argumente: --nur akzeptiert nur bekannte Teile', () => {
  assert.deepEqual(argumente(['--nur', 'lexikon,kennzahlen']).nur, ['lexikon', 'kennzahlen']);
  assert.throws(() => argumente(['--nur', 'unbekannt']), /Unbekannter Teil/);
});

test('alle drei Teile erfolgreich: Status enthaelt Zeitpunkt, Dauer, Anzahl je Teil', async () => {
  const dir = tmpDir();
  const teilFn = {
    lexikon: async () => ({ anzahl: 12 }),
    bestellungen: async () => ({ anzahl: 5, hinweis: '2/2 Quellvarianten geladen' }),
    kennzahlen: async () => ({ anzahl: 40 }),
  };
  const { statusDatei, status, ergebnisse } = await aktualisiere({ dir, teilFn });
  assert.equal(statusDatei, path.join(dir, 'aktualisierung.json'));
  assert.equal(ergebnisse.length, 3);
  for (const teil of ['lexikon', 'bestellungen', 'kennzahlen']) {
    assert.equal(status.teile[teil].erfolg, true);
    assert.ok(status.teile[teil].zeitpunkt);
    assert.equal(typeof status.teile[teil].dauerMs, 'number');
  }
  assert.equal(status.teile.lexikon.anzahl, 12);
  assert.equal(status.teile.bestellungen.meldung, '2/2 Quellvarianten geladen');

  const aufDisk = JSON.parse(fs.readFileSync(statusDatei, 'utf8'));
  assert.deepEqual(aufDisk, status);
});

test('Fehler in einem Teil verhindert die anderen nicht', async () => {
  const dir = tmpDir();
  const teilFn = {
    lexikon: async () => { throw new Error('Kein Zugang in .env.local'); },
    bestellungen: async () => ({ anzahl: 3 }),
    kennzahlen: async () => ({ anzahl: 9 }),
  };
  const { status, ergebnisse } = await aktualisiere({ dir, teilFn });
  assert.equal(ergebnisse.find(r => r.teil === 'lexikon').erfolg, false);
  assert.equal(status.teile.lexikon.meldung, 'Kein Zugang in .env.local');
  assert.equal(status.teile.bestellungen.erfolg, true);
  assert.equal(status.teile.kennzahlen.erfolg, true);
});

test('--nur fuehrt nur die angegebenen Teile aus und behaelt den alten Stand der anderen', async () => {
  const dir = tmpDir();
  const ersteRunde = {
    lexikon: async () => ({ anzahl: 1 }),
    bestellungen: async () => ({ anzahl: 2 }),
    kennzahlen: async () => ({ anzahl: 3 }),
  };
  const erste = await aktualisiere({ dir, teilFn: ersteRunde });
  const altesLexikon = erste.status.teile.lexikon;

  const zweiteRunde = {
    lexikon: async () => { throw new Error('sollte nicht laufen'); },
    bestellungen: async () => ({ anzahl: 99 }),
    kennzahlen: async () => { throw new Error('sollte nicht laufen'); },
  };
  const { status, ergebnisse } = await aktualisiere({ dir, nur: ['bestellungen'], teilFn: zweiteRunde });
  assert.equal(ergebnisse.length, 1);
  assert.deepEqual(status.teile.lexikon, altesLexikon);
  assert.equal(status.teile.bestellungen.anzahl, 99);
});

test('fehlende Zieldatei ist kein Fehler: erster Lauf legt sie neu an', async () => {
  const dir = tmpDir();
  const teilFn = { lexikon: async () => ({ anzahl: 0 }), bestellungen: async () => ({ anzahl: 0 }), kennzahlen: async () => ({ anzahl: 0 }) };
  assert.equal(fs.existsSync(path.join(dir, 'aktualisierung.json')), false);
  const { status } = await aktualisiere({ dir, teilFn });
  assert.equal(status.teile.lexikon.erfolg, true);
});
