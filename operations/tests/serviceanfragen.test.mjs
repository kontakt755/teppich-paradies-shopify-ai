import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { anlegen, aendern, leseAlle, serviceanfragenPfad } from '../lib/serviceanfragen.mjs';
import { SICHERUNGSPFADE } from '../scripts/sicherung.mjs';

function datei() { return serviceanfragenPfad(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-service-'))); }
const BASIS = { datum: '2026-10-16', leistung: 'verlegeservice', quelle: 'formular', name: 'Max Muster' };

test('Anlegen vergibt fortlaufende Nummern, dieselbe Mail nur einmal', () => {
  const f = datei();
  assert.deepEqual(leseAlle(f), []);
  const a = anlegen(f, { ...BASIS, mailId: 'm-1' }, { actor: 'Ben' });
  const b = anlegen(f, BASIS, { actor: 'Ben' });
  assert.deepEqual([a.eintrag.id, b.eintrag.id], ['S-001', 'S-002']);
  const nochmal = anlegen(f, { ...BASIS, mailId: 'm-1', name: 'anders' }, { actor: 'Lauf' });
  assert.equal(nochmal.doppelt, true);
  assert.equal(nochmal.eintrag.id, 'S-001');
  assert.equal(leseAlle(f).length, 2);
});

test('Aendern: nur mitgeschickte Felder, Statuswechsel im Verlauf, Kontakt bleibt Pflicht', () => {
  const f = datei();
  anlegen(f, BASIS, { actor: 'Ben', jetzt: new Date('2026-10-16T08:00:00Z') });
  const e = aendern(f, 'S-001', { status: 'angebot', notiz: 'Angebot 1.240 €' }, { actor: 'Ina', jetzt: new Date('2026-10-17T09:00:00Z') });
  assert.equal(e.name, 'Max Muster');
  assert.equal(e.leistung, 'verlegeservice');
  assert.equal(e.aktualisiertVon, 'Ina');
  assert.deepEqual(e.verlauf.map(v => v.was), ['angelegt (Neu)', 'Neu → Angebot']);
  const ohneWechsel = aendern(f, 'S-001', { notiz: 'nachgefasst' }, { actor: 'Ina' });
  assert.equal(ohneWechsel.verlauf.length, 2);
  assert.throws(() => aendern(f, 'S-001', { name: '' }, { actor: 'Ina' }), /mindestens eins/);
  assert.throws(() => aendern(f, 'S-009', { status: 'neu' }, { actor: 'Ina' }), /gibt es nicht/);
});

test('Beschaedigte Datei wirft und bleibt stehen - wird gesichert', () => {
  const f = datei();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '{"eintraege": [');
  assert.throws(() => leseAlle(f), /beschädigt/);
  assert.throws(() => anlegen(f, BASIS, { actor: 'Ben' }), /beschädigt/);
  assert.equal(fs.readFileSync(f, 'utf8'), '{"eintraege": [');
  assert.ok(SICHERUNGSPFADE.includes('serviceanfragen.json'));
});
