// Einkaufspreise aus AB und Rechnung (Benutzer 2026-11-13). Aufbau der Zeilen wie im echten Beleg von
// Lieferant C, Zahlen und Artikelnummern erfunden.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preiseAusText, preiseOffen, lieferbelegePfad, leseBelege } from '../lib/lieferbelege.mjs';
import { preiseNachtragen } from '../scripts/lieferbelege.mjs';

const KOPF = 'Pos.  Material-Nr.   Geb.fakt.  Menge in ME   Menge in VPME   E-Preis  Gesamtwert';
const AB = `${KOPF}
__________________________________________________________________________
10      8001-000001      10,00      1  STK  =  10,000  KG      6,00      60,00
        Testvorstrich             10,0 kg
20      2059-000001       4,00  3,500  LMT  =  14,000  QMT     5,00      70,00
30      9999-000001                 1  STK  =   1,000  STK     2,50   1.002,50*
Summe Positionen        1.132,50`;

test('preiseAusText: Artikelnummer, Menge in der Verkaufseinheit und Nettowert je Zeile; fremdes Format null', () => {
  assert.deepEqual(preiseAusText(AB), [
    { artikel: '8001-000001', menge: 1, einheit: 'STK', netto: 60 },
    { artikel: '2059-000001', menge: 3.5, einheit: 'LMT', netto: 70 },
    { artikel: '9999-000001', menge: 1, einheit: 'STK', netto: 1002.5 },
  ]);
  assert.deepEqual(preiseAusText(`${KOPF}\nSumme Positionen 0,00`), [], 'Format erkannt, keine Zeile');
  assert.equal(preiseAusText('AUFTRAGSBESTÄTIGUNG\nWarenwert : 271,52'), null);
  assert.equal(preiseAusText(null), null);
});

test('Nachtragen: nur neue AB und Rechnungen mit PDF, abgelegt werden Zeilen ohne PDF-Text, Unlesbares wird nicht erneut geholt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-belegpreise-'));
  const jetzt = new Date('2026-11-13T10:00:00Z');
  const b = (id, o = {}) => ({ id, art: 'ab', datum: '2026-11-12T08:00:00Z', von: 'ab@lieferant-c.example', anhaenge: ['4711.PDF'], ...o });
  fs.mkdirSync(path.dirname(lieferbelegePfad(dir)), { recursive: true });
  fs.writeFileSync(lieferbelegePfad(dir), JSON.stringify({ version: 1, absender: {}, geprueft: {}, laeufe: [], belege: {
    a1: b('a1', { datum: '2026-11-11T08:00:00Z' }), a2: b('a2', { art: 'rechnung' }), a3: b('a3', { datum: '2026-11-10T08:00:00Z' }),
    alt: b('alt', { datum: '2026-11-01T08:00:00Z' }), ls: b('ls', { art: 'lieferschein' }), ohne: b('ohne', { anhaenge: [] }), fertig: b('fertig', { preise: null }),
  } }));
  assert.deepEqual(preiseOffen({ privatDir: dir, jetzt }).map(x => x.id), ['a2', 'a1', 'a3'], 'neueste zuerst');

  const mail = text => Buffer.from(`From: ab@lieferant-c.example\r\nSubject: AB\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="g"\r\n\r\n--g\r\nContent-Type: text/plain\r\n\r\nim Anhang\r\n--g\r\nContent-Type: application/pdf; name="4711.PDF"\r\nContent-Disposition: attachment; filename="4711.PDF"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(`%PDF-1.4 ${text}`).toString('base64')}\r\n--g--\r\n`);
  const sitzung = async (zugang, arbeit) => arbeit({
    suche: async () => [1, 2],
    daten: async () => [{ uid: 1, id: 'a1' }, { uid: 2, id: 'a2' }],
    nachricht: async uid => mail(uid === 1 ? 'PREIS' : 'FREMD'),
  });
  const analyse = inhalt => ({ text: inhalt.toString().includes('PREIS') ? AB : 'Rechnung in anderem Aufbau' });
  const r = await preiseNachtragen({ privatDir: dir, jetzt, sitzung, analyse, zugang: { benutzer: 'a', passwort: 'test-passwort' } });
  assert.deepEqual(r, { gelesen: 2, offen: 1, mitPreis: 1 });
  const d = leseBelege(lieferbelegePfad(dir)).belege;
  assert.deepEqual(d.a1.preise.positionen[0], { artikel: '8001-000001', menge: 1, einheit: 'STK', netto: 60 });
  assert.equal(d.a2.preise, null, 'anderes Format: nicht erneut holen');
  assert.equal(d.a3.preise, undefined, 'nicht gefunden: bleibt offen');
  assert.ok(!JSON.stringify(d).includes('Testvorstrich'), 'kein PDF-Text in der Ablage');
  assert.deepEqual(preiseOffen({ privatDir: dir, jetzt }).map(x => x.id), ['a3']);
  fs.rmSync(dir, { recursive: true, force: true });
});
