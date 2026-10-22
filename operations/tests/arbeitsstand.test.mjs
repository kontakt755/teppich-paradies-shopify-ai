import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { arbeitsstand } from '../lib/arbeitsstand.mjs';

function umgebung(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-arbeitsstand-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function schreibe(dir, datei, text = '{}') {
  const ziel = path.join(dir, datei);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, text);
  return ziel;
}

test('fehlende Ablagen sind ein stabiler eigener Stand; Kennung enthaelt keine Pfade oder Inhalte', t => {
  const dir = umgebung(t);
  const leer = arbeitsstand(dir);
  assert.deepEqual(arbeitsstand(dir), leer);
  assert.equal(leer.verfuegbar, true);
  assert.match(leer.kennung, /^[a-f0-9]{64}$/);
  const ziel = schreibe(dir, 'muster-packen.json', '{"notiz":"PRIVATER TESTINHALT"}');
  const datei = arbeitsstand(dir);
  assert.notEqual(datei.kennung, leer.kennung);
  assert.deepEqual(arbeitsstand(dir), datei);
  assert.doesNotMatch(JSON.stringify(datei), /PRIVATER TESTINHALT|tp-arbeitsstand|muster-packen/);
  fs.unlinkSync(ziel);
  assert.deepEqual(arbeitsstand(dir), leer, 'Entfernen ist wieder der explizit fehlende Stand');
});

test('alle vorhandenen Arbeitsablagen einschliesslich Beleglauf und echter Bestellmarkendatei werden beobachtet', t => {
  const dir = umgebung(t);
  let vorher = arbeitsstand(dir).kennung;
  for (const datei of ['auftragsstatus.json', 'muster-packen.json', 'bestellmarken.json',
    'musterherkunft.json', 'musterlager.json', 'lieferbelege/belege.json', 'auftragsverlauf.json',
    'bestelluebersicht/kundentermine.json', 'lieferanten/stammdaten.json']) {
    const ziel = schreibe(dir, datei, '{"laeufe":[]}');
    const angelegt = arbeitsstand(dir).kennung;
    assert.notEqual(angelegt, vorher, datei);
    fs.writeFileSync(`${ziel}.neu`, '{"laeufe":[{"am":"2026-10-22T12:00:00Z"}]}');
    fs.renameSync(`${ziel}.neu`, ziel);
    vorher = arbeitsstand(dir).kennung;
    assert.notEqual(vorher, angelegt, `${datei}: atomarer Wechsel muss erkannt werden`);
  }
});

test('andere Dateifehler werden sichtbar und niemals wie ENOENT behandelt oder mit Pfaden ausgegeben', t => {
  const dir = umgebung(t);
  for (const code of ['EACCES', 'EIO']) {
    const r = arbeitsstand(dir, { stat: datei => {
      if (datei.endsWith('muster-packen.json')) throw Object.assign(new Error(`privater Pfad: ${datei}`), { code });
      throw Object.assign(new Error(), { code: 'ENOENT' });
    } });
    assert.equal(r.verfuegbar, false);
    assert.equal(r.kennung, null);
    assert.deepEqual(r.fehler, [{ quelle: 'Packstation', code }]);
    assert.doesNotMatch(JSON.stringify(r), /privater Pfad|tp-arbeitsstand/);
  }
  fs.mkdirSync(path.join(dir, 'bestellmarken.json'));
  assert.deepEqual(arbeitsstand(dir).fehler, [{ quelle: 'Bestellmarken', code: 'KEINE_DATEI' }]);
});
