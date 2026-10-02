import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { bereinigeOrt, EingangFehler, erkenneTyp, findeZugang, liesZugaenge, pruefeAngaben, titelFuer, zugangAnlegen, zugangSperren } from '../lib/eingang.mjs';
import { tmpDir } from './_hilfe.mjs';

test('Einwilligung wird nicht mehr abgefragt, sie liegt immer vor', () => {
  assert.equal(pruefeAngaben({ ort: 'Oranienburg' }).einwilligung, true);
  assert.equal(pruefeAngaben({ einwilligung: 'true' }).einwilligung, true);
});

test('Ort: bekannte Orte werden erkannt, Adressen nie gespeichert', () => {
  assert.deepEqual(bereinigeOrt('oranienburg'), { ort: 'Oranienburg', bekannt: true, verworfen: false });
  assert.equal(bereinigeOrt('Berlin Pankow').ort, 'Berlin-Pankow');
  assert.equal(bereinigeOrt('Berliner Str. 12, Oranienburg').ort, 'Oranienburg', 'der Ort bleibt, die Strasse faellt weg');
  assert.deepEqual(bereinigeOrt('Musterweg 5'), { ort: null, bekannt: false, verworfen: true });
  assert.deepEqual(bereinigeOrt('Summt'), { ort: 'Summt', bekannt: false, verworfen: false });
  assert.equal(bereinigeOrt('').ort, null);
});

test('Angaben werden auf bekannte Werte gebracht und gekuerzt', () => {
  const a = pruefeAngaben({ einwilligung: true, ort: 'Velten', bodenart: 'klebevinyl', raum: 'wohnzimmer', taetigkeit: ['Altbelag entfernt', 'Verlegung'], vorherNachher: 'beides', besonderheit: 'x'.repeat(500), produkt: '  Selene 620 ' });
  assert.equal(a.bodenart, 'Klebevinyl'); assert.equal(a.raum, 'Wohnzimmer');
  assert.deepEqual(a.taetigkeit, ['Altbelag entfernt', 'Verlegung']);
  assert.equal(a.besonderheit.length, 300); assert.equal(a.produkt, 'Selene 620');
  assert.equal(pruefeAngaben({ einwilligung: true, vorherNachher: 'quatsch' }).vorherNachher, '');
  assert.match(titelFuer(a, new Date('2026-10-01T10:00:00')), /^Velten – Wohnzimmer – Klebevinyl – vorher\/nachher \(1\.10\.2026\)$/);
});

test('Dateityp kommt aus dem Inhalt, nicht aus dem Namen', () => {
  assert.equal(erkenneTyp(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(erkenneTyp(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic')])), 'image/heic');
  assert.equal(erkenneTyp(Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypqt  ')])), 'video/quicktime');
  assert.equal(erkenneTyp(Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisom')])), 'video/mp4');
  assert.equal(erkenneTyp(Buffer.from('<?php echo 1; ?>')), null);
});

test('Zugang: nur der Hash liegt auf der Platte, Sperren wirkt sofort', (t) => {
  const datei = path.join(tmpDir(t), 'zugaenge.json');
  const { token } = zugangAnlegen('Mehmet', { datei });
  const liste = liesZugaenge(datei);
  assert.equal(JSON.stringify(liste).includes(token), false);
  assert.equal(findeZugang(token, liste).name, 'Mehmet');
  assert.equal(findeZugang(`${token}x`, liste), null);
  assert.equal(findeZugang('kurz', liste), null);
  assert.equal(zugangSperren('mehmet', { datei }), 1);
  assert.equal(findeZugang(token, liesZugaenge(datei)), null);
});
