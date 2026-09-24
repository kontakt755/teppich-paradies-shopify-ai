import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { protokolliere, letzteEintraege } from '../lib/protokoll.mjs';

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-protokoll-test-'));
  return path.join(dir, 'protokoll.jsonl');
}

test('protokolliere/letzteEintraege: neueste zuerst, chmod 600', () => {
  const file = tmpFile();
  protokolliere(file, { benutzer: 'Ahmet', aktion: 'Statuswechsel', objekt: 'Issue #1', jetzt: new Date('2026-01-01T10:00:00Z') });
  protokolliere(file, { benutzer: 'Nina', aktion: 'Kommentar', objekt: 'Issue #2', jetzt: new Date('2026-01-01T11:00:00Z') });
  const eintraege = letzteEintraege(file, 50);
  assert.equal(eintraege.length, 2);
  assert.equal(eintraege[0].benutzer, 'Nina');
  assert.equal(eintraege[1].benutzer, 'Ahmet');
  const modus = fs.statSync(file).mode & 0o777;
  assert.equal(modus, 0o600);
});

test('letzteEintraege: fehlende Datei ist leere Liste, kaputte Zeilen werden uebersprungen', () => {
  assert.deepEqual(letzteEintraege(path.join(os.tmpdir(), 'nie-' + Date.now() + '.jsonl'), 50), []);
  const file = tmpFile();
  fs.writeFileSync(file, '{"benutzer":"Ok"}\nkaputt-kein-json\n{"benutzer":"Auch ok"}\n');
  const eintraege = letzteEintraege(file, 50);
  assert.equal(eintraege.length, 2);
});

test('letzteEintraege: begrenzt auf limit, neueste zuerst', () => {
  const file = tmpFile();
  for (let i = 0; i < 5; i += 1) protokolliere(file, { benutzer: `U${i}`, aktion: 'x', jetzt: new Date(2026, 0, 1, i) });
  const eintraege = letzteEintraege(file, 2);
  assert.equal(eintraege.length, 2);
  assert.equal(eintraege[0].benutzer, 'U4');
  assert.equal(eintraege[1].benutzer, 'U3');
});
