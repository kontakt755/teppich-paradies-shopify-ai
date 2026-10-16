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

test('Postfach: nur Service-Betreffe, jede Mail einmal, von Hand Erfasstes nicht doppelt', async () => {
  const { uebernehmen, bekannt, berlinerTag, AKTEUR } = await import('../scripts/serviceanfragen.mjs');
  const privatDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-postfach-'));
  const mail = (id, betreff, extra = '') => ({
    id, von: 'mailer@shopify.com', datum: '2026-10-15T22:30:00Z', betreff: 'Neue Kundennachricht vom 16. Oktober 2026 um 00:30',
    text: `Betreff:\n${betreff}\n\nName:\nMax Muster ${id}\n\nE-Mail:\n${id}@example.com\n${extra}\nText:\nBitte Angebot.`,
  });
  anlegen(serviceanfragenPfad(privatDir), { ...BASIS, datum: '2026-10-14', email: 'hand@example.com' }, { actor: 'Ben' });
  const mails = [
    mail('m1', 'Anfrage Treppenverlegung', '\nHerkunft:\nGoogle-Anzeige\n'),
    mail('m2', 'Anfrage Teppichreinigung'),
    { ...mail('m3', 'Anfrage Vinylboden verlegen'), text: mail('m3', 'Anfrage Vinylboden verlegen').text.replace('m3@example.com', 'hand@example.com') },
    { ...mail('m4', 'Anfrage Treppenverlegung'), von: 'jemand@example.com' },
    mail('m5', 'Anfrage von der Startseite', '\nAnliegen:\nAufmaß und Angebot\n'),
  ];
  const jetzt = new Date('2026-10-16T06:00:00Z');
  const r = uebernehmen(mails, { privatDir, jetzt });
  assert.deepEqual(r.angelegt.map(a => [a.id, a.mailId, a.leistung, a.quelle]), [['S-002', 'm1', 'treppe', 'werbung'], ['S-003', 'm5', 'aufmass', 'formular']]);
  assert.deepEqual(r.uebersprungen.map(u => u.mailId), ['m2', 'm3', 'm4']);
  assert.match(r.uebersprungen[1].grund, /schon erfasst als S-001/);
  assert.doesNotMatch(JSON.stringify(r), /Muster|example/, 'Ausgabe ohne Kundendaten');
  const alle = leseAlle(serviceanfragenPfad(privatDir));
  assert.equal(alle.find(e => e.id === 'S-002').datum, '2026-10-16', 'Datum aus dem Betreff');
  assert.equal(alle.find(e => e.id === 'S-002').erstelltVon, AKTEUR);
  assert.equal(alle.find(e => e.id === 'S-002').status, 'neu');
  // zweiter Lauf: nichts Neues, nichts doppelt
  const nochmal = uebernehmen(mails, { privatDir, jetzt });
  assert.deepEqual(nochmal, { angelegt: [], uebersprungen: [] });
  assert.equal(leseAlle(serviceanfragenPfad(privatDir)).length, 3);
  assert.deepEqual(bekannt({ privatDir }).mailIds, ['m1', 'm2', 'm3', 'm4', 'm5']);
  assert.equal(berlinerTag('2026-10-15T22:30:00Z'), '2026-10-16');
  assert.ok(SICHERUNGSPFADE.includes('serviceanfragen-postfach.json'));
});
