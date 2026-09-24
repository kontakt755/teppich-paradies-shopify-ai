import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  leseBenutzer, schreibeBenutzer, hashPasswort, pruefePasswort, authentifiziere,
  benutzerAnlegen, passwortSetzen, benutzerDeaktivieren, findeAktivenBenutzer,
  BenutzerFehler, validiereRolle,
} from '../lib/benutzer.mjs';

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-benutzer-test-'));
  return path.join(dir, 'benutzer.json');
}

test('leseBenutzer: fehlende Datei ist leere Liste, kein Fehler', () => {
  assert.deepEqual(leseBenutzer(path.join(os.tmpdir(), 'nie-vorhanden-' + Date.now() + '.json')), []);
});

test('hashPasswort/pruefePasswort: richtiges Passwort stimmt, falsches nicht, nie Klartext im Hash', () => {
  const hash = hashPasswort('platzhalter-testkennwort-1');
  assert.equal(pruefePasswort('platzhalter-testkennwort-1', hash), true);
  assert.equal(pruefePasswort('falsch', hash), false);
  assert.ok(!hash.includes('platzhalter-testkennwort-1'));
  assert.match(hash, /^scrypt:[0-9a-f]+:[0-9a-f]+$/);
});

test('benutzerAnlegen: legt an, verweigert doppeltes Kuerzel und zu kurzes Passwort', () => {
  let liste = benutzerAnlegen([], { name: 'Ahmet', kuerzel: 'ahmet', passwort: 'platzhalter-lang-1', rolle: 'inhaber' });
  assert.equal(liste.length, 1);
  assert.equal(liste[0].aktiv, true);
  assert.ok(!('passwort' in liste[0]));
  assert.throws(() => benutzerAnlegen(liste, { name: 'Zweiter', kuerzel: 'Ahmet', passwort: 'platzhalter-lang-2', rolle: 'mitarbeiter' }), BenutzerFehler);
  assert.throws(() => benutzerAnlegen(liste, { name: 'Kurz', kuerzel: 'kurz', passwort: '123', rolle: 'lesen' }), BenutzerFehler);
  assert.throws(() => validiereRolle('admin'));
});

test('authentifiziere: aktiver Benutzer mit richtigem Passwort, deaktivierter nicht', () => {
  let liste = benutzerAnlegen([], { name: 'Nina', kuerzel: 'nina', passwort: 'platzhalter-lang-3', rolle: 'mitarbeiter' });
  assert.deepEqual(authentifiziere(liste, 'nina', 'platzhalter-lang-3'), { name: 'Nina', kuerzel: 'nina', rolle: 'mitarbeiter' });
  assert.equal(authentifiziere(liste, 'nina', 'falsch'), null);
  // Login per Klartextnamen funktioniert genauso wie per Kuerzel.
  assert.ok(authentifiziere(liste, 'Nina', 'platzhalter-lang-3'));

  liste = benutzerDeaktivieren(liste, 'nina');
  assert.equal(authentifiziere(liste, 'nina', 'platzhalter-lang-3'), null);
  assert.equal(findeAktivenBenutzer(liste, 'nina'), null);
});

test('passwortSetzen: aendert nur den Hash, wirft bei unbekanntem Kuerzel', () => {
  let liste = benutzerAnlegen([], { name: 'Ben', kuerzel: 'ben', passwort: 'platzhalter-alt-1', rolle: 'lesen' });
  const alterHash = liste[0].passwortHash;
  liste = passwortSetzen(liste, 'ben', 'platzhalter-neu-1');
  assert.notEqual(liste[0].passwortHash, alterHash);
  assert.ok(authentifiziere(liste, 'ben', 'platzhalter-neu-1'));
  assert.throws(() => passwortSetzen(liste, 'unbekannt', 'platzhalter-neu-2'), BenutzerFehler);
});

test('schreibeBenutzer/leseBenutzer: Rundreise ueber die Datei, chmod 600', () => {
  const file = tmpFile();
  const liste = benutzerAnlegen([], { name: 'Rosa', kuerzel: 'rosa', passwort: 'platzhalter-datei-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, file);
  const geladen = leseBenutzer(file);
  assert.equal(geladen.length, 1);
  assert.equal(geladen[0].kuerzel, 'rosa');
  const modus = fs.statSync(file).mode & 0o777;
  assert.equal(modus, 0o600);
});
