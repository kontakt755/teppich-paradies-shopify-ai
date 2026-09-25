import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setzeStatus, leseAlle, RUECKRUF_STATUS, RUECKRUF_STATUS_LABEL } from '../lib/rueckrufe.mjs';

function tmpDatei() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-rueckruf-'));
  return path.join(dir, 'rueckrufe.json');
}

test('„Nicht erreicht" mit Wiedervorlage - erledigt räumt sie wieder weg', () => {
  const file = tmpDatei();
  const a = setzeStatus(file, { orderId: 'gid://1', status: 'nicht_erreicht', actor: 'Ben', wiedervorlage: '2026-09-28' });
  assert.equal(a.status, 'nicht_erreicht');
  assert.equal(a.wiedervorlage, '2026-09-28');

  // Ein Datum ohne Form wird nicht still geschluckt
  assert.throws(() => setzeStatus(file, { orderId: 'gid://1', status: 'nicht_erreicht', actor: 'Ben', wiedervorlage: '28.9.' }), /JJJJ-MM-TT/);

  const b = setzeStatus(file, { orderId: 'gid://1', status: 'erledigt', actor: 'Ben' });
  assert.equal(b.wiedervorlage, null, 'erledigt braucht keine Wiedervorlage mehr');
  assert.equal(leseAlle(file)['gid://1'].status, 'erledigt');
});

test('Der Status trägt, wer angerufen hat - nicht mehr ein GitHub-Login', () => {
  const file = tmpDatei();
  const e = setzeStatus(file, { orderId: 'gid://7', status: 'angerufen', actor: 'Ben Beispiel', notiz: 'Maße besprochen' });
  assert.equal(e.aktualisiertVon, 'Ben Beispiel');
  assert.equal(e.angerufenVon, 'Ben Beispiel');
  assert.equal(e.notiz, 'Maße besprochen');
});

test('Alle vier Status haben eine deutsche Beschriftung', () => {
  for (const s of RUECKRUF_STATUS) assert.ok(RUECKRUF_STATUS_LABEL[s], `${s} fehlt`);
  assert.equal(RUECKRUF_STATUS_LABEL.nicht_erreicht, 'Nicht erreicht');
});
