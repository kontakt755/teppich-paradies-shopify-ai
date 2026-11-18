import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { frageAnlegen, frageBeantworten, leseFragen, fragenUebersicht, WerkbankFrageFehler } from '../lib/werkbank-fragen.mjs';
import { main } from '../../scripts/werkbank-frage.mjs';

const ordner = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-werkbank-fragen-'));
const BEISPIEL = {
  werkbankId: 'w-901', titel: 'Beispielaufgabe Startseite',
  frage: 'Welches Bild soll oben stehen?',
  optionen: [{ label: 'Bild B', beschreibung: 'ruhiger' }, { label: 'Bild A', beschreibung: 'heller' }],
  empfehlung: 'Bild A', freitextErlaubt: true,
};

test('werkbank:frage - neu, offen, beantwortet, uebernommen', () => {
  const dir = ordner();
  const datei = path.join(dir, 'werkbank-fragen.json');
  const eingabe = path.join(dir, 'frage.json');
  fs.writeFileSync(eingabe, JSON.stringify(BEISPIEL));
  const aus = [];
  const lauf = (...a) => { aus.length = 0; main(a, { datei, aus: x => aus.push(x) }); return aus.join('\n'); };

  assert.equal(lauf('neu', '--datei', eingabe), 'q-w-901-1');
  assert.match(lauf('neu', '--datei', eingabe), /gab es schon/, 'gleiche offene Frage nicht doppelt');
  const offen = JSON.parse(lauf('offen'));
  assert.equal(offen.length, 1);
  assert.equal(offen[0].optionen[0].label, 'Bild A', 'Empfehlung steht zuerst');
  assert.deepEqual(JSON.parse(lauf('beantwortet')), []);
  assert.throws(() => lauf('uebernommen', 'q-w-901-1'), /noch nicht beantwortet/);

  assert.throws(() => frageBeantworten(datei, { id: 'q-w-901-1', label: 'Bild C' }), /Unbekannte Option/);
  frageBeantworten(datei, { id: 'q-w-901-1', label: 'Bild B', freitext: 'mit Text' }, { von: 'Ina' });
  assert.throws(() => frageBeantworten(datei, { id: 'q-w-901-1', label: 'Bild A' }), /schon beantwortet/);
  const beantwortet = JSON.parse(lauf('beantwortet'));
  assert.equal(beantwortet[0].antwort.label, 'Bild B');
  assert.equal(beantwortet[0].antwort.von, 'Ina');
  assert.equal(lauf('uebernommen', 'q-w-901-1'), 'q-w-901-1 uebernommen');
  assert.deepEqual(JSON.parse(lauf('beantwortet')), []);
  assert.equal(fragenUebersicht(leseFragen(datei)).beantwortet.length, 1, 'bleibt als zuletzt beantwortet sichtbar');
  assert.equal(lauf('neu', '--datei', eingabe), 'q-w-901-2', 'nach der Antwort darf dieselbe Frage neu gestellt werden');
});

test('werkbank-fragen - Eingaben werden geprueft, Freitext nur wenn erlaubt', () => {
  const datei = path.join(ordner(), 'f.json');
  assert.throws(() => frageAnlegen(datei, { ...BEISPIEL, werkbankId: '228' }), WerkbankFrageFehler);
  assert.throws(() => frageAnlegen(datei, { ...BEISPIEL, optionen: [{ label: 'nur eine' }] }), /2 bis 4/);
  assert.throws(() => frageAnlegen(datei, { ...BEISPIEL, empfehlung: 'gibt es nicht' }), /empfehlung/);
  const { frage } = frageAnlegen(datei, { ...BEISPIEL, freitextErlaubt: false });
  assert.throws(() => frageBeantworten(datei, { id: frage.id, freitext: 'hallo' }), /Freitext/);
  assert.throws(() => frageBeantworten(datei, { id: frage.id }), /Option/);
});

test('werkbank-fragen - fehlende Datei ist leer, kaputte ist ein Fehler', () => {
  const datei = path.join(ordner(), 'f.json');
  assert.deepEqual(leseFragen(datei), []);
  fs.writeFileSync(datei, '{kaputt');
  assert.throws(() => leseFragen(datei), /beschädigt/);
  assert.throws(() => frageAnlegen(datei, BEISPIEL), /beschädigt/);
  assert.equal(fs.readFileSync(datei, 'utf8'), '{kaputt', 'kaputte Datei bleibt unangetastet');
});
