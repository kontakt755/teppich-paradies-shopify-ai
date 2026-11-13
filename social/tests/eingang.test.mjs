import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { GRENZEN, ablaufVon, bereinigeOrt, EingangFehler, erkenneTyp, findeZugang, liesZugaenge, LINK_GUELTIG_TAGE, pruefeAngaben, standHeute, titelFuer, zaehleHeute, zugangAnlegen, zugangGueltig, zugangSperren } from '../lib/eingang.mjs';
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

test('Zugang laeuft ab: neue Links nach 180 Tagen, alte ab ihrem Anlegedatum', (t) => {
  const datei = path.join(tmpDir(t), 'zugaenge.json');
  const jetzt = new Date('2026-10-26T09:00:00Z');
  const { token, ablauf } = zugangAnlegen('Team', { datei, jetzt });
  assert.equal(LINK_GUELTIG_TAGE, 180);
  assert.equal(ablauf, '2027-04-24T09:00:00.000Z');
  assert.equal(liesZugaenge(datei)[0].ablauf, ablauf, 'das Ablaufdatum steht in der Datei');
  assert.equal(findeZugang(token, liesZugaenge(datei), { jetzt: new Date('2027-04-24T08:59:59Z') }).name, 'Team');
  assert.equal(findeZugang(token, liesZugaenge(datei), { jetzt: new Date('2027-04-24T09:00:00Z') }), null);
  // Vor dem 26.10.2026 angelegt, ohne Ablaufdatum (der Link vom 30.09.): gilt bis 29.03.2027.
  const alt = { name: 'Team', aktiv: true, angelegt: '2026-09-30T10:00:00.000Z' };
  assert.equal(ablaufVon(alt), '2027-03-29T10:00:00.000Z');
  assert.equal(zugangGueltig(alt, jetzt), true);
  assert.equal(zugangGueltig(alt, new Date('2027-03-29T10:00:00Z')), false);
  assert.equal(zugangGueltig({ ...alt, aktiv: false }, jetzt), false, 'gesperrt bleibt gesperrt');
  assert.equal(zugangGueltig({ name: 'x', aktiv: true }, jetzt), true, 'ohne Datum nichts zu rechnen');
});

test('Tageszaehler: zaehlt je Name, beginnt jeden Tag neu, kaputte Datei faengt leer an', (t) => {
  const datei = path.join(tmpDir(t), 'upload-tageszaehler.json');
  assert.deepEqual(standHeute('Team', '2026-10-26', datei), { uploads: 0, bytes: 0 });
  zaehleHeute('Team', '2026-10-26', { uploads: 1 }, datei);
  zaehleHeute('Team', '2026-10-26', { bytes: 500 }, datei);
  zaehleHeute('Ali', '2026-10-26', { uploads: 1, bytes: 7 }, datei);
  assert.deepEqual(standHeute('Team', '2026-10-26', datei), { uploads: 1, bytes: 500 });
  assert.equal(fs.statSync(datei).mode & 0o777, 0o600);
  assert.deepEqual(standHeute('Team', '2026-10-27', datei), { uploads: 0, bytes: 0 });
  zaehleHeute('Team', '2026-10-27', { uploads: 1 }, datei);
  assert.deepEqual(JSON.parse(fs.readFileSync(datei, 'utf8')), { tag: '2026-10-27', je: { Team: { uploads: 1, bytes: 0 } } }, 'der Vortag faellt weg');
});

test('Tageszaehler: kaputte Datei hebt das Limit nicht auf, sie sperrt den Tag und heilt am naechsten', (t) => {
  const datei = path.join(tmpDir(t), 'upload-tageszaehler.json');
  const voll = { uploads: GRENZEN.maxUploadsJeTag, bytes: GRENZEN.maxBytesJeTag, defekt: true };
  for (const kaputt of ['{kaputt', '', '[]', 'null', '{"tag":"2026-10-27"}', '{"tag":5,"je":{}}', '{"tag":"2026-10-27","je":[1]}']) {
    fs.writeFileSync(datei, kaputt);
    assert.deepEqual(standHeute('Team', '2026-10-27', datei), voll, `kaputt: ${kaputt}`);
    assert.deepEqual(standHeute('Team', '2026-10-27', datei), voll, 'bleibt gesperrt, auch beim zweiten Lesen');
    assert.deepEqual(zaehleHeute('Team', '2026-10-27', { uploads: 1 }, datei), voll, 'Zaehlen schreibt die Sperre nicht frei');
    assert.deepEqual(standHeute('Ali', '2026-10-27', datei), voll, 'gilt fuer alle Namen');
  }
  assert.deepEqual(standHeute('Team', '2026-10-28', datei), { uploads: 0, bytes: 0 }, 'am naechsten Tag zaehlt es wieder');
  zaehleHeute('Team', '2026-10-28', { uploads: 1 }, datei);
  assert.deepEqual(standHeute('Team', '2026-10-28', datei), { uploads: 1, bytes: 0 });
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
