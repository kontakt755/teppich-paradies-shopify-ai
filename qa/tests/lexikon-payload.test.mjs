import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { baueEingabe, ladeEintraege, pruefeFreigabe, ERLAUBTE_GRUPPEN, METAOBJECT_TYPE } from '../../scripts/lexikon-payload.mjs';

const meta = (extra = {}) => ({
  handle: 'test-begriff',
  begriff: 'Testbegriff',
  kurz: 'Eine kurze, sachliche Definition.',
  lang: '',
  gruppe: 'Allgemein',
  synonyme: ['Testsynonym'],
  artikel: '',
  status: 'freigegeben',
  expert_input: [],
  ...extra,
});

test('Entwurf wird nicht angelegt', () => {
  assert.match(pruefeFreigabe(meta({ status: 'entwurf' })).join(' '), /status ist "entwurf"/);
  assert.throws(() => baueEingabe(meta({ status: 'entwurf' })), /nicht anlegbar/);
});

test('leeres kurz sperrt, auch bei Status freigegeben', () => {
  assert.match(pruefeFreigabe(meta({ kurz: '' })).join(' '), /kurz fehlt/);
  assert.throws(() => baueEingabe(meta({ kurz: '  ' })), /kurz fehlt/);
});

test('fehlender begriff oder handle sperrt', () => {
  assert.match(pruefeFreigabe(meta({ begriff: '' })).join(' '), /begriff fehlt/);
  assert.match(pruefeFreigabe(meta({ handle: '' })).join(' '), /handle fehlt/);
});

test('unbekannte Gruppe wird abgelehnt', () => {
  const gruende = pruefeFreigabe(meta({ gruppe: 'Laminat' })).join(' ');
  assert.match(gruende, /gruppe "Laminat" ist kein erlaubter Wert/);
  for (const erlaubt of ERLAUBTE_GRUPPEN) {
    assert.deepEqual(pruefeFreigabe(meta({ gruppe: erlaubt })), []);
  }
});

test('eine offene PRUEFEN-Marke in kurz oder lang sperrt den Eintrag', () => {
  assert.match(pruefeFreigabe(meta({ kurz: 'Text. PRUEFEN: stimmt das?' })).join(' '), /1 offene PRUEFEN-Marke/);
  assert.match(pruefeFreigabe(meta({ lang: 'PRUEFEN' })).join(' '), /1 offene PRUEFEN-Marke/);
});

test('freigegebener Eintrag: richtiger Metaobjekt-Typ, Handle und Felder', () => {
  const { metaobject } = baueEingabe(meta());
  assert.equal(metaobject.type, METAOBJECT_TYPE);
  assert.equal(metaobject.handle, 'test-begriff');
  const feld = key => metaobject.fields.find(f => f.key === key);
  assert.equal(feld('begriff').value, 'Testbegriff');
  assert.equal(feld('kurz').value, 'Eine kurze, sachliche Definition.');
  assert.equal(feld('gruppe').value, 'Allgemein');
  assert.deepEqual(JSON.parse(feld('synonyme').value), ['Testsynonym']);
  // Leere optionale Felder werden nicht als leere Metaobjekt-Felder angelegt.
  assert.equal(feld('lang'), undefined);
  assert.equal(feld('artikel'), undefined);
});

test('synonyme werden als JSON-kodierte Liste geschrieben, nicht als Array', () => {
  const { metaobject } = baueEingabe(meta({ synonyme: ['A', 'B'] }));
  const wert = metaobject.fields.find(f => f.key === 'synonyme').value;
  assert.equal(typeof wert, 'string');
  assert.deepEqual(JSON.parse(wert), ['A', 'B']);
});

test('leere synonyme-Liste erzeugt kein Feld', () => {
  const { metaobject } = baueEingabe(meta({ synonyme: [] }));
  assert.equal(metaobject.fields.find(f => f.key === 'synonyme'), undefined);
});

test('die echten Lexikon-Eintraege sind vollstaendig, eindeutig und bereit', () => {
  const ordner = path.resolve(import.meta.dirname, '../../content/lexikon');
  const eintraege = ladeEintraege(ordner);
  assert.ok(eintraege.length >= 12, `mindestens 12 Eintraege erwartet, gefunden: ${eintraege.length}`);
  assert.ok(eintraege.length <= 16, `hoechstens 16 Eintraege erwartet, gefunden: ${eintraege.length}`);

  const handles = new Set();
  for (const { datei, meta: m } of eintraege) {
    assert.equal(datei, `${m.handle}.json`, `Dateiname und handle muessen uebereinstimmen (${datei})`);
    assert.ok(!handles.has(m.handle), `Handle "${m.handle}" ist doppelt vergeben`);
    handles.add(m.handle);

    const gruende = pruefeFreigabe(m);
    assert.deepEqual(gruende, [], `${m.handle} sollte bereit sein, ist aber gesperrt: ${gruende.join('; ')}`);

    // Keine Zahl/Norm wurde als Tatsachenbehauptung verkauft, ohne dass eine
    // offene Fachfrage dazu vermerkt ist, wo die Quelle unsicher ist.
    assert.ok(Array.isArray(m.expert_input), `${m.handle}: expert_input muss eine Liste sein`);

    // baueEingabe darf fuer jeden echten, freigegebenen Eintrag nicht werfen.
    assert.doesNotThrow(() => baueEingabe(m), `${m.handle} sollte anlegbar sein`);
  }
});

test('jeder Eintrag mit "artikel" verweist auf eine im Repo vorhandene Ratgeber-Datei', () => {
  const ordner = path.resolve(import.meta.dirname, '../../content/lexikon');
  const ratgeberOrdner = path.resolve(import.meta.dirname, '../../content/ratgeber');
  const bekannteHandles = new Set();
  if (fs.existsSync(ratgeberOrdner)) {
    for (const bereich of fs.readdirSync(ratgeberOrdner, { withFileTypes: true })) {
      if (!bereich.isDirectory()) continue;
      for (const datei of fs.readdirSync(path.join(ratgeberOrdner, bereich.name))) {
        if (datei.endsWith('.json')) bekannteHandles.add(datei.replace(/\.json$/, ''));
      }
    }
  }
  const eintraege = ladeEintraege(ordner);
  for (const { meta: m } of eintraege) {
    if (!m.artikel) continue;
    assert.ok(bekannteHandles.has(m.artikel), `${m.handle}: artikel "${m.artikel}" hat keine passende Datei unter content/ratgeber/`);
  }
});
