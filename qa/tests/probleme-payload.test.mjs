import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { baueEingabe, ladeFreigegebeneArtikelHandles, ladeProbleme, pruefeFreigabe } from '../../scripts/probleme-payload.mjs';

const ARTIKEL = new Set(['teppichboden-pflegen-und-flecken-entfernen']);

const meta = (extra = {}) => ({
  handle: 'test-problem',
  symptom: 'Der Boden zeigt Flecken',
  belag: 'Teppichboden',
  ursachen: ['Ein Fleck wurde nicht sofort behandelt.'],
  artikel: 'teppichboden-pflegen-und-flecken-entfernen',
  profi_noetig: false,
  status: 'freigegeben',
  ...extra,
});

test('ein Eintrag ohne Ziel-Artikel wird gesperrt - die entscheidende Regel', () => {
  const gruende = pruefeFreigabe(meta({ artikel: '' }), ARTIKEL).join(' ');
  assert.match(gruende, /kein Ziel-Artikel eingetragen/);
  assert.throws(() => baueEingabe(meta({ artikel: '' }), ARTIKEL), /nicht anlegbar/);
});

test('ein Ziel-Artikel, den es im Repo nicht als freigegeben gibt, sperrt ebenfalls', () => {
  const gruende = pruefeFreigabe(meta({ artikel: 'erfundener-artikel' }), ARTIKEL).join(' ');
  assert.match(gruende, /existiert nicht als freigegebener oder veroeffentlichter Ratgeber-Artikel/);
  assert.throws(() => baueEingabe(meta({ artikel: 'erfundener-artikel' }), ARTIKEL), /nicht anlegbar/);
});

test('status idee wird nicht angelegt, auch mit gueltigem Ziel', () => {
  assert.match(pruefeFreigabe(meta({ status: 'idee' }), ARTIKEL).join(' '), /status ist "idee"/);
});

test('fehlendes symptom, belag oder ursachen sperren', () => {
  assert.match(pruefeFreigabe(meta({ symptom: '' }), ARTIKEL).join(' '), /symptom fehlt/);
  assert.match(pruefeFreigabe(meta({ belag: '' }), ARTIKEL).join(' '), /belag fehlt/);
  assert.match(pruefeFreigabe(meta({ belag: 'Laminat' }), ARTIKEL).join(' '), /belag "Laminat" ist kein erlaubter Wert/);
  assert.match(pruefeFreigabe(meta({ ursachen: [] }), ARTIKEL).join(' '), /ursachen fehlen/);
  assert.match(pruefeFreigabe(meta({ profi_noetig: 'ja' }), ARTIKEL).join(' '), /profi_noetig ist kein Boolean/);
});

test('freigegebener Eintrag: Metaobjekt-Eingabe mit richtigen Feldern und Typen', () => {
  const { metaobject } = baueEingabe(meta(), ARTIKEL);
  assert.equal(metaobject.type, 'tp_bodenproblem');
  assert.equal(metaobject.handle, 'test-problem');
  const feld = key => metaobject.fields.find(f => f.key === key);
  assert.equal(feld('symptom').value, 'Der Boden zeigt Flecken');
  assert.equal(feld('belag').value, 'Teppichboden');
  assert.deepEqual(JSON.parse(feld('ursachen').value), ['Ein Fleck wurde nicht sofort behandelt.']);
  assert.equal(feld('artikel').value, 'teppichboden-pflegen-und-flecken-entfernen');
  assert.equal(feld('profi_noetig').value, 'false');
});

test('profi_noetig true wird als String "true" geschrieben', () => {
  const { metaobject } = baueEingabe(meta({ profi_noetig: true }), ARTIKEL);
  assert.equal(metaobject.fields.find(f => f.key === 'profi_noetig').value, 'true');
});

test('ladeFreigegebeneArtikelHandles liest ueber alle Bereichsordner und nur freigegebene/veroeffentlichte Artikel', () => {
  const ratgeberOrdner = path.resolve(import.meta.dirname, '../../content/ratgeber');
  const handles = ladeFreigegebeneArtikelHandles(ratgeberOrdner);
  assert.ok(handles.has('teppichboden-pflegen-und-flecken-entfernen'));
  assert.ok(handles.has('rollenbreite-und-bahnen-planen'));
});

test('ladeFreigegebeneArtikelHandles liefert ein leeres Set fuer einen nicht existierenden Ordner', () => {
  const handles = ladeFreigegebeneArtikelHandles('/pfad/den/es/nicht/gibt');
  assert.equal(handles.size, 0);
});

test('ladeProbleme verlangt, dass Dateiname und handle uebereinstimmen', () => {
  const ordner = path.resolve(import.meta.dirname, '../../content/probleme');
  assert.doesNotThrow(() => ladeProbleme(ordner));
});

test('die echten Problem-Eintraege: jedes Ziel loest auf einen echten, freigegebenen Ratgeber-Artikel auf; die meisten haben noch kein Ziel', () => {
  const problemeOrdner = path.resolve(import.meta.dirname, '../../content/probleme');
  const ratgeberOrdner = path.resolve(import.meta.dirname, '../../content/ratgeber');
  const freigegeben = ladeFreigegebeneArtikelHandles(ratgeberOrdner);
  const probleme = ladeProbleme(problemeOrdner);
  assert.ok(probleme.length >= 15, 'rund 20 Eintraege erwartet');

  let mitZiel = 0;
  for (const eintrag of probleme) {
    assert.ok(fs.existsSync(path.join(problemeOrdner, `${eintrag.handle}.json`)), `${eintrag.handle}: Datei muss existieren`);
    if (eintrag.artikel) {
      mitZiel += 1;
      assert.ok(
        freigegeben.has(eintrag.artikel),
        `${eintrag.handle}: Ziel-Artikel "${eintrag.artikel}" muss ein echter, freigegebener Ratgeber-Artikel sein`
      );
      assert.equal(eintrag.status, 'freigegeben', `${eintrag.handle}: hat ein Ziel, sollte also freigegeben sein`);
      assert.deepEqual(pruefeFreigabe(eintrag, freigegeben), [], `${eintrag.handle}: sollte anlegbar sein`);
    } else {
      assert.equal(eintrag.status, 'idee', `${eintrag.handle}: ohne Ziel sollte status idee sein (Backlog)`);
      assert.ok(pruefeFreigabe(eintrag, freigegeben).length > 0, `${eintrag.handle}: muss gesperrt sein`);
    }
  }
  assert.ok(mitZiel > 0, 'mindestens ein Eintrag sollte bereits ein Ziel haben');
  assert.ok(mitZiel < probleme.length, 'die meisten Probleme sollten (noch) kein Ziel haben - es gibt nur 5 Ratgeber-Artikel');
});
