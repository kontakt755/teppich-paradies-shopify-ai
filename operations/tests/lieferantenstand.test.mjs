import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setzeLieferantenstand, bestaetigeBeschaffung } from '../lib/beschaffung.mjs';
import { leseAlle, setzeStatus, setzeZurueckAufOffen } from '../lib/auftragsstatus.mjs';
import { lieferantenStand, werktageSeit, beschaffungText } from '../../docs/ai-dashboard/lib/beschaffung.mjs';

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lieferantenstand-test-')), 'auftragsstatus.json');
const p = { orderId: 'o1', lineItemId: 'l1' };
const actor = 'Person Eins';
// Donnerstag, 06.11.2026, 19:00 Berlin
const jetzt = new Date('2026-11-06T18:00:00Z');
const ls = (f, schritt, felder, extra = {}) => setzeLieferantenstand(f, { ...p, schritt, felder, actor, jetzt, ...extra });
const ALLES_OK = { menge: 'ok', masse: 'ok', lieferweg: 'ok', zuschlaege: 'ok' };

test('Ablauf Offen → Angefragt → Bestellt (AB fehlt) → AB bestätigt → Geliefert, ohne zweiten Status', () => {
  const f = file();
  assert.equal(lieferantenStand(leseAlle(f)['o1::l1']).stufe, 'offen');
  const a = ls(f, 'anfrage', { am: '2026-11-05', lieferant: 'Lieferant A', notiz: 'Preis und Lieferzeit' });
  assert.equal(a.status, undefined, 'Anfrage setzt keinen Schritt');
  assert.equal(a.beschaffung.anfrage.lieferant, 'Lieferant A');
  assert.equal(lieferantenStand(a, { jetzt }).stufe, 'angefragt');
  assert.equal(lieferantenStand(a, { jetzt }).nachfassen, false, 'Do angefragt, Fr ist 1 Werktag');

  const b = setzeStatus(f, { ...p, status: 'bestellt', actor, jetzt });
  assert.equal(b.beschaffung.anfrage.am, '2026-11-05', 'Anfrage bleibt nachvollziehbar');
  const st = lieferantenStand(b, { jetzt });
  assert.equal(st.stufe, 'bestellt'); assert.equal(st.abFehlt, true); assert.equal(st.text, 'AB fehlt');

  const d = ls(f, 'bestelldaten', { am: '2026-11-06T17:38:00.000Z', referenz: 'Mail 06.11.', lieferwegOffen: 'bevorzugt gekettelt direkt zum Kunden, sonst Abholung' });
  assert.equal(d.status, 'bestellt'); assert.equal(d.bestelltAm, '2026-11-06T17:38:00.000Z');
  assert.equal(d.lieferantBestellnummer, 'Mail 06.11.');
  assert.match(beschaffungText(d), /Lieferweg offen: bevorzugt gekettelt/);
  // Montag 10.11.: 2 Werktage ohne AB -> nachfassen
  assert.equal(lieferantenStand(d, { jetzt: new Date('2026-11-10T08:00:00Z') }).nachfassen, true);
  assert.equal(lieferantenStand(d, { jetzt: new Date('2026-11-07T08:00:00Z') }).nachfassen, false, 'Freitag: 1 Werktag');

  const ab = ls(f, 'ab', { nummer: 'AB-4711', liefertermin: '2026-11-14', preis: '310,00 € netto', link: 'https://mail.google.com/mail/u/0/#all/abc', pruefung: ALLES_OK });
  assert.equal(ab.status, 'bestellt', 'AB ändert den Schritt nicht');
  assert.equal(ab.beschaffung.liefertermin, '2026-11-14');
  assert.equal(lieferantenStand(ab, { jetzt }).stufe, 'ab');
  assert.equal(lieferantenStand(ab, { jetzt: new Date('2026-11-15T09:00:00Z') }).verspaetet, true, 'nach dem Termin: verspätet');
  assert.match(beschaffungText(ab), /AB-Nr\. AB-4711 · Preis 310,00 € netto/);

  const g = bestaetigeBeschaffung(f, { ...p, actor, jetzt, soll: 1, einheit: 'stueck', felder: { angekommen: 1, verwendbar: 1 } });
  assert.equal(g.status, 'geliefert');
  assert.equal(g.beschaffung.ab.nummer, 'AB-4711', 'Wareneingang lässt die AB stehen');
  assert.deepEqual(g.verlauf.map(v => v.aktion), ['Lieferant angefragt', 'Bestelldaten ergänzt', 'AB geprüft', 'Beschaffung bestätigt']);
});

test('AB wird nie ohne Prüfung bestätigt; Abweichungen werden sichtbar', () => {
  const f = file();
  setzeStatus(f, { ...p, status: 'bestellt', actor, jetzt });
  const vorher = fs.readFileSync(f, 'utf8');
  for (const felder of [
    { nummer: 'AB-1', liefertermin: '2026-11-14' },
    { nummer: 'AB-1', liefertermin: '2026-11-14', pruefung: { menge: 'ok', masse: 'ok', lieferweg: 'ok' } },
    { nummer: 'AB-1', liefertermin: '2026-11-14', pruefung: { ...ALLES_OK, masse: 'vielleicht' } },
    { nummer: '', liefertermin: '2026-11-14', pruefung: ALLES_OK },
    { nummer: 'AB-1', liefertermin: '', pruefung: ALLES_OK },
    { nummer: 'AB-1', liefertermin: '2026-11-14', pruefung: { ...ALLES_OK, zuschlaege: 'abweichung' } },
    { nummer: 'AB-1', liefertermin: '2026-11-14', pruefung: ALLES_OK, link: 'javascript:alert(1)' },
    { nummer: 'AB-1', liefertermin: '2026-11-14', pruefung: ALLES_OK, erfunden: 1 },
  ]) assert.throws(() => ls(f, 'ab', felder));
  assert.equal(fs.readFileSync(f, 'utf8'), vorher, 'abgelehnte Angaben ändern nichts');
  const ab = ls(f, 'ab', { nummer: 'AB-1', liefertermin: '2026-11-14', pruefung: { ...ALLES_OK, masse: 'abweichung', zuschlaege: 'abweichung' }, abweichung: 'AB nennt 230 × 250 cm und 25 € Frachtzuschlag' });
  const st = lieferantenStand(ab, { jetzt });
  assert.deepEqual(st.abweichungen, ['masse', 'zuschlaege']);
  assert.equal(st.ton, 'warn');
  assert.match(st.text, /weicht ab: Maße, Zuschläge/);
  assert.match(beschaffungText(ab), /Abweichung: AB nennt 230 × 250 cm/);
});

test('Falscher Schritt wird abgelehnt: Anfrage nach Bestellung, AB/Bestelldaten vor Bestellung', () => {
  const f = file();
  assert.throws(() => ls(f, 'ab', { nummer: 'AB-1', liefertermin: '2026-11-14', pruefung: ALLES_OK }), /Zuerst „Bestellt“/);
  assert.throws(() => ls(f, 'bestelldaten', { referenz: 'x' }), /bestellten Position/);
  assert.throws(() => ls(f, 'anfrage', { am: '2026-11-09', lieferant: 'A' }), /Zukunft/);
  assert.throws(() => ls(f, 'anfrage', { am: '2026-11-05', lieferant: '' }), /Lieferant/);
  setzeStatus(f, { ...p, status: 'bestellt', actor, jetzt });
  assert.throws(() => ls(f, 'anfrage', { am: '2026-11-05', lieferant: 'A' }), /schon bestellt/);
  assert.throws(() => ls(f, 'bestelldaten', { am: '2026-11-30T10:00:00.000Z' }), /Zukunft/);
  assert.throws(() => ls(f, 'bestelldaten', { am: '06.11.2026 18:38' }), /Datum mit Uhrzeit/);
  assert.throws(() => ls(f, 'quatsch', {}), /Unbekannter Schritt/);
});

test('Zurücknehmen und „Zurück auf offen“ verlieren nichts', () => {
  const f = file();
  ls(f, 'anfrage', { am: '2026-11-05', lieferant: 'Lieferant A' });
  const z = ls(f, 'anfrageZurueck', {});
  assert.equal(z.beschaffung, undefined);
  assert.equal(z.verlauf.at(-1).vorher.lieferant, 'Lieferant A');
  setzeStatus(f, { ...p, status: 'bestellt', actor, jetzt });
  ls(f, 'bestelldaten', { lieferwegOffen: 'Abholung oder Direktversand' });
  ls(f, 'ab', { nummer: 'AB-9', liefertermin: '2026-11-14', pruefung: ALLES_OK });
  const ohneAb = ls(f, 'abZurueck', {});
  assert.equal(ohneAb.beschaffung.ab, undefined);
  assert.equal(ohneAb.beschaffung.liefertermin, '2026-11-14', 'Termin bleibt beim Zurücknehmen der AB');
  assert.equal(ohneAb.verlauf.at(-1).vorher.nummer, 'AB-9');
  ls(f, 'ab', { nummer: 'AB-10', liefertermin: '2026-11-15', pruefung: ALLES_OK });
  const offen = setzeZurueckAufOffen(f, { ...p, actor, jetzt });
  assert.equal(offen.status, null);
  for (const k of ['ab', 'bestellung', 'liefertermin']) assert.equal(offen.beschaffung?.[k], undefined, `${k} gehört zur alten Bestellung`);
  const alt = offen.verlauf.at(-1).vorher;
  assert.equal(alt.ab.nummer, 'AB-10'); assert.equal(alt.liefertermin, '2026-11-15'); assert.match(alt.bestellung.lieferwegOffen, /Abholung/);
});

test('Altbestand: Positionen ohne neue Felder lesen und schreiben sich unverändert; Liefertermin ohne AB mahnt nicht', () => {
  const f = file();
  const alt = { 'o1::l1': { orderId: 'o1', lineItemId: 'l1', status: 'bestellt', bestelltAm: '2026-10-01T10:00:00Z', beschaffung: { liefertermin: '2026-12-01', bestaetigtAm: 'x', bestaetigtVon: 'y' } },
    'o2::l2': { orderId: 'o2', lineItemId: 'l2', status: 'geliefert', ueber: 'kettler' } };
  fs.writeFileSync(f, JSON.stringify({ version: 1, positionen: alt }));
  assert.deepEqual(leseAlle(f), alt);
  const st = lieferantenStand(alt['o1::l1'], { jetzt });
  assert.equal(st.abFehlt, false); assert.equal(st.nachfassen, false); assert.equal(st.stufe, 'ab');
  ls(f, 'bestelldaten', { referenz: 'R-1' });
  assert.deepEqual(leseAlle(f)['o2::l2'], alt['o2::l2'], 'andere Positionen bleiben unberührt');
  // Beschädigte neue Felder werden erkannt statt still gelesen
  fs.writeFileSync(f, JSON.stringify({ version: 1, positionen: { 'o1::l1': { ...alt['o1::l1'], beschaffung: { ab: { nummer: 7 } } } } }));
  assert.throws(() => leseAlle(f), /beschädigt/);
});

test('werktageSeit: Wochenende zählt nicht, Berliner Kalendertag', () => {
  assert.equal(werktageSeit('2026-11-06T17:38:00Z', new Date('2026-11-06T22:00:00Z')), 0);
  assert.equal(werktageSeit('2026-11-06T17:38:00Z', new Date('2026-11-09T08:00:00Z')), 1, 'Fr bestellt, Mo = 1');
  assert.equal(werktageSeit('2026-11-06T17:38:00Z', new Date('2026-11-10T08:00:00Z')), 2);
  assert.equal(werktageSeit('2026-11-05T23:30:00Z', new Date('2026-11-06T08:00:00Z')), 0, '00:30 Berlin ist schon der 06.11.');
  assert.equal(werktageSeit('kaputt'), null);
});
