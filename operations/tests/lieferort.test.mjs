import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lieferortAusText, lieferorteOffen, lieferbelegePfad, leseBelege } from '../lib/lieferbelege.mjs';
import { lieferorteNachtragen } from '../scripts/lieferbelege.mjs';
import { stammdatenPfad } from '../lib/lieferanten.mjs';

const KETTLER = { plz: '10999', strasse: 'Musterallee 5' };
// Aufbau wie der echte Schein: Anschriftblock links, Belegkopf rechts, "Kundenadresse" (immer unsere) weiter unten.
const schein = (block, lieferung = 'per LKW Tour: X01 täglich') => `${block[0]}                 *L I E F E R S C H E I N*
${block[1]}                 AUCH AUFTRAGSBESTÄTIGUNG
${block[2]}                 NUMMER : 352961 KD050
${block[3] || ''}            DATUM :11.11.26 0285
                             Tel.: 0331/97994616
Ihre Auftragsnummer: #1041 TESTKUNDE
Versandliste: 279206
------------------------------------------------------------------
Lieferung   : ${lieferung}
Kundenadresse:
Teppich - Paradies               Oranienburg GmbH
Saarlandstr. 73-81               DE 16515 Oranienburg
`;
const LADEN = ['Teppich - Paradies', 'Oranienburg GmbH', 'Saarlandstr. 73-81', '16515 Oranienburg'];
const KUNDE = ['Anlieferung', 'Erika Beispiel', 'Beispielweg 3', '12345 Beispielstadt'];

test('Lieferort: Laden, Kettler, Kunde, Abholung geht vor, ohne Postleitzahl unklar, fremdes Format null', () => {
  const o = { kettler: KETTLER };
  assert.equal(lieferortAusText(schein(LADEN), o), 'laden');
  assert.equal(lieferortAusText(schein(['Anlieferung', 'Kettelstudio', 'Musterallee 5', '10999 Berlin']), o), 'kettler');
  assert.equal(lieferortAusText(schein(KUNDE), o), 'kunde');
  assert.equal(lieferortAusText(schein(KUNDE, 'Abholung Tour: XXAB Abholung'), o), 'abholung', 'Druckadresse des Kunden ist bei Abholung kein Lieferort');
  assert.equal(lieferortAusText(schein(['Baustelle', 'Erika Beispiel', 'ohne Ort']), o), 'unklar');
  assert.equal(lieferortAusText(schein(KUNDE), {}), 'unklar', 'ohne hinterlegten Kettler wird nicht geraten');
  assert.equal(lieferortAusText('Delivery Note 4711\n12345 Beispielstadt', o), null);
});

test('Nachtragen: liest nur offene Lieferscheine mit PDF, legt nur den Ort ab und laesst nicht Gefundenes offen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-lieferort-'));
  const jetzt = new Date('2026-11-12T10:00:00Z');
  const b = (id, o = {}) => ({ id, art: 'lieferschein', datum: '2026-11-11T08:00:00Z', von: 'lieferschein@lieferant-a.example', anhaenge: ['KD050_1.pdf'], ...o });
  fs.mkdirSync(path.dirname(lieferbelegePfad(dir)), { recursive: true });
  fs.writeFileSync(lieferbelegePfad(dir), JSON.stringify({ version: 1, absender: {}, geprueft: {}, laeufe: [], belege: {
    a1: b('a1'), a2: b('a2'), a3: b('a3'), alt: b('alt', { datum: '2026-11-01T08:00:00Z' }), ab: b('ab', { art: 'ab' }), ohne: b('ohne', { anhaenge: [] }), fertig: b('fertig', { lieferort: null }),
  } }));
  fs.mkdirSync(path.dirname(stammdatenPfad(dir)), { recursive: true });
  fs.writeFileSync(stammdatenPfad(dir), JSON.stringify({ version: 1, lieferanten: {}, absender: { kettelservice: { name: 'Kettelstudio', strasse: KETTLER.strasse, plz: KETTLER.plz, ort: 'Berlin' } } }));
  assert.deepEqual(lieferorteOffen({ privatDir: dir, jetzt }).map(x => x.id), ['a1', 'a2', 'a3']);

  const mail = text => Buffer.from(`From: lieferschein@lieferant-a.example\r\nSubject: Lieferschein\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="g"\r\n\r\n--g\r\nContent-Type: text/plain\r\n\r\nim Anhang\r\n--g\r\nContent-Type: application/octet-stream; name="KD050_1.pdf"\r\nContent-Disposition: attachment; filename="KD050_1.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(`%PDF-1.4 ${text}`).toString('base64')}\r\n--g--\r\n`);
  const suchen = [];
  const sitzung = async (zugang, arbeit) => arbeit({
    suche: async (q) => { suchen.push(q); return [1, 2, 9]; },
    daten: async () => [{ uid: 1, id: 'a1' }, { uid: 2, id: 'a2' }, { uid: 9, id: 'fremd' }],
    nachricht: async uid => mail(uid === 1 ? 'KUNDE' : 'FREMD'),
  });
  const analyse = inhalt => ({ text: inhalt.toString().includes('KUNDE') ? schein(KUNDE) : 'Delivery Note' });
  const r = await lieferorteNachtragen({ privatDir: dir, jetzt, sitzung, analyse, zugang: { benutzer: 'a', passwort: 'test-passwort' } });
  assert.deepEqual(r, { gelesen: 2, offen: 1 });
  assert.deepEqual(suchen, ['from:lieferschein@lieferant-a.example has:attachment newer_than:10d']);
  const belege = leseBelege(lieferbelegePfad(dir)).belege;
  assert.equal(belege.a1.lieferort.ort, 'kunde');
  assert.equal(belege.a2.lieferort, null, 'anderes Format: gelesen, wird nicht gezeigt und nicht erneut geholt');
  assert.equal(belege.a3.lieferort, undefined, 'nicht gefunden bleibt offen');
  assert.ok(!JSON.stringify(belege).includes('Beispielweg'), 'die Anschrift des Kunden wird nicht abgelegt');
  assert.deepEqual(lieferorteOffen({ privatDir: dir, jetzt }).map(x => x.id), ['a3']);
});
