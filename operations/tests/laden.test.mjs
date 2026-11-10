// Ansicht "Laden": Ablagen (Personen, Zustaendigkeit, Aufgaben) und "Kunde antwortet nicht".
// Nur erfundene Daten (Person A, Testkunde).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ladenPersonenPfad, ladenZustaendigPfad, ladenAufgabenPfad, lesePersonen, leseZustaendig, setzeZustaendig,
  leseAufgaben, legeAufgabeAn, erledigeAufgabe, kundeWartet, ladenMails, LadenFehler, AUFGABE_TEXT_MAX,
} from '../lib/laden.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-laden-'));
const PERSONEN = ['Person A', 'Person B'];
const JETZT = new Date('2026-11-10T10:00:00Z');

test('Lesefehler: fehlende Datei ist leer, beschaedigte wirft und bleibt unveraendert', () => {
  const dir = tmp();
  assert.equal(lesePersonen(ladenPersonenPfad(dir)), null);
  assert.deepEqual(leseZustaendig(ladenZustaendigPfad(dir)), {});
  assert.deepEqual(leseAufgaben(ladenAufgabenPfad(dir)), []);
  const kaputt = '{"aufgaben": [{"id": "a1"';
  for (const [pfad, lesen] of [[ladenPersonenPfad(dir), lesePersonen], [ladenZustaendigPfad(dir), leseZustaendig], [ladenAufgabenPfad(dir), leseAufgaben]]) {
    fs.writeFileSync(pfad, kaputt);
    assert.throws(() => lesen(pfad), /beschädigt/);
  }
  // Ein Klick darf eine beschaedigte Ablage nie durch eine neue mit einem Eintrag ersetzen.
  assert.throws(() => legeAufgabeAn(ladenAufgabenPfad(dir), { art: 'Sonstiges', text: 'x' }), /beschädigt/);
  assert.throws(() => setzeZustaendig(ladenZustaendigPfad(dir), { schluessel: 'aufgabe:a1', wer: 'Person A', personen: PERSONEN }), /beschädigt/);
  assert.equal(fs.readFileSync(ladenAufgabenPfad(dir), 'utf8'), kaputt);
  assert.equal(fs.readFileSync(ladenZustaendigPfad(dir), 'utf8'), kaputt);
});

test('Personen: Liste bereinigt, falsche Form meldet, was zu tun ist', () => {
  const datei = ladenPersonenPfad(tmp());
  fs.writeFileSync(datei, JSON.stringify([' Person A ', 'Person A', '', 'Person B']));
  assert.deepEqual(lesePersonen(datei), PERSONEN);
  fs.writeFileSync(datei, '{"a":1}');
  assert.throws(() => lesePersonen(datei), /Liste von Namen/);
  fs.writeFileSync(datei, '[]');
  assert.equal(lesePersonen(datei), null);
});

test('Zustaendigkeit: uebernehmen, zurueckgeben, nur Namen aus der Liste, kein stilles Ueberschreiben', () => {
  const datei = ladenZustaendigPfad(tmp());
  const ok = setzeZustaendig(datei, { schluessel: 'rueckruf:gid://shopify/Order/1', wer: 'Person A', personen: PERSONEN, jetzt: JETZT });
  assert.deepEqual(ok, { wer: 'Person A', seit: JETZT.toISOString() });
  assert.deepEqual(Object.keys(leseZustaendig(datei)), ['rueckruf:gid://shopify/Order/1']);
  assert.throws(() => setzeZustaendig(datei, { schluessel: 'rueckruf:gid://shopify/Order/1', wer: 'Person B', personen: PERSONEN }), /Person A kümmert sich schon/);
  assert.throws(() => setzeZustaendig(datei, { schluessel: 'fall:1', wer: 'Fremder', personen: PERSONEN }), LadenFehler);
  for (const schlecht of ['', 'x:1', 'fall:', 'fall:a b', '../x', 'fall:' + 'a'.repeat(200), undefined]) {
    assert.throws(() => setzeZustaendig(datei, { schluessel: schlecht, wer: 'Person A', personen: PERSONEN }), LadenFehler, `Schluessel ${schlecht}`);
  }
  assert.equal(setzeZustaendig(datei, { schluessel: 'rueckruf:gid://shopify/Order/1', wer: null, personen: PERSONEN }), null);
  assert.deepEqual(leseZustaendig(datei), {});
});

test('Aufgaben: anlegen mit Art und Text, Pflichtfelder, Laenge, erledigen setzt erledigtAm', () => {
  const datei = ladenAufgabenPfad(tmp());
  const a = legeAufgabeAn(datei, { art: 'Rolle schneiden', text: '  3 m Testteppich  ', jetzt: JETZT });
  assert.equal(a.text, '3 m Testteppich');
  assert.equal(a.erledigtAm, null);
  assert.throws(() => legeAufgabeAn(datei, { art: 'Egal', text: 'x' }), /Art/);
  assert.throws(() => legeAufgabeAn(datei, { art: 'Sonstiges', text: '   ' }), /beschreiben/);
  assert.throws(() => legeAufgabeAn(datei, { art: 'Sonstiges', text: 'x'.repeat(AUFGABE_TEXT_MAX + 1) }), /Zeichen/);
  assert.equal(leseAufgaben(datei).length, 1);
  assert.throws(() => erledigeAufgabe(datei, { id: 'gibtsnicht' }), /gibt es nicht/);
  const fertig = erledigeAufgabe(datei, { id: a.id, jetzt: JETZT });
  assert.equal(fertig.erledigtAm, JETZT.toISOString());
  assert.equal(leseAufgaben(datei)[0].erledigtAm, JETZT.toISOString());
});

test('Kunde antwortet nicht: nur wenn laut Zeitleiste der Kunde dran ist, nicht bei Test, Storno oder Musterbestellung', () => {
  const zeile = (id, extra = {}) => ({
    orderId: id, orderName: `#${id}`, kundenname: 'Testkunde', email: 'k@example.invalid', datum: '2026-10-20T10:00:00Z',
    zahlungsstatus: 'PAID', fulfillmentstatus: 'FULFILLED', auftrag: { positionen: [] },
    zeitleisteSchritt: { stufe: 'warten', wer: 'kunde', text: 'Kunde schaut sich die Muster an', wartetSeitTagen: 12 }, ...extra,
  });
  const r = kundeWartet([
    zeile('1'), zeile('2', { testbestellung: true }), zeile('3', { storniert: true }), zeile('5', { auftragsart: 'muster' }),
    zeile('4', { zeitleisteSchritt: { stufe: 'warten', wer: 'lieferant', text: 'Beim Lieferanten', wartetSeitTagen: 20 } }),
  ], { jetzt: JETZT });
  assert.deepEqual(r.map(x => [x.orderId, x.tage, x.text]), [['1', 12, 'Kunde schaut sich die Muster an']]);
});

test('Mails: ohne Postfach nicht eingerichtet und leer', () => {
  assert.deepEqual(ladenMails(), { eingerichtet: false, eintraege: [] });
});
