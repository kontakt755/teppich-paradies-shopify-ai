import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { arbeitsquellenStand } from '../lib/arbeitsquellen.mjs';
import { esc } from '../kern/helfer.mjs';

const quelltext = fs.readFileSync(new URL('../ansichten/heute.mjs', import.meta.url), 'utf8');
const listeCode = quelltext.slice(quelltext.indexOf('function arbeitsstandHeute()'), quelltext.indexOf('/**\n * "Im Hintergrund"'));
function heute(feld, daten) {
  const ok = () => ({ verfuegbar: true });
  const kunden = { bestellungen: ok(), rueckrufe: ok(), faelle: ok(), serviceanfragen: ok() };
  const aufgaben = feld === 'aufgaben' ? daten : ok();
  if (feld && feld !== 'aufgaben') kunden[feld] = daten;
  return vm.runInNewContext(listeCode + '\ntodoListe([])', {
    kunden, einkauf: { auftragsstatus: ok(), bestellungen: ok() }, heuteDaten: { aufgaben },
    belege: { daten: ok() }, shopifyAbgleich: { daten: ok() }, darfAnsicht: () => true,
    arbeitsquellenStand, esc, stoerungState: () => '', TODOS_SICHTBAR: 3,
  });
}

test('jede benoetigte noch fehlende Quelle verhindert eine vollstaendige Leermeldung', () => {
  for (const feld of ['rueckrufe', 'faelle', 'serviceanfragen', 'aufgaben']) {
    const html = heute(feld, null);
    assert.match(html, /werden noch geladen/);
    assert.match(html, /Liste wird noch ergänzt/);
    assert.doesNotMatch(html, /Keine weiteren Aufgaben offen|Alles erledigt/);
  }
});

test('ausdruecklich nicht verfuegbare Quellen bleiben sichtbar unvollstaendig', () => {
  for (const feld of ['rueckrufe', 'faelle', 'serviceanfragen', 'aufgaben']) {
    const html = heute(feld, { verfuegbar: false });
    assert.match(html, /Liste unvollständig/);
    assert.match(html, /bisher 0/);
    assert.doesNotMatch(html, /Keine weiteren Aufgaben offen|Alles erledigt/);
  }
});

test('geladene leere Zusatzaufgaben behaupten keinen Abschluss der gesamten Bestellarbeit', () => {
  const html = heute();
  assert.match(html, /Keine weiteren Aufgaben offen/);
  assert.doesNotMatch(html, /Alles erledigt|unvollständig|noch ergänzt/);
});

test('Lade- und Fehlerquellen werden getrennt genannt; leere Fehlerliste bleibt gesund', () => {
  assert.deepEqual(arbeitsquellenStand([
    ['Offen', null], ['Defekt', { fehler: 'nicht gelesen' }], ['Fehlt', { verfuegbar: false }],
    ['Gelesen', { verfuegbar: true, fehler: [] }],
  ]), { laedt: ['Offen'], fehlt: ['Defekt', 'Fehlt'], vollstaendig: false });
});
