import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../bausteine/palette.mjs', import.meta.url), 'utf8')
  .replace(/^import.*;\n/gm, '').replace(/^export\s/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
function palette() {
  const fahrten = [], timer = [];
  const api = vm.runInNewContext(quelle + '\n({ paletteItems, paletteFernSuche, paletteFern })', {
    state: { capabilities: { mode: 'local' }, tasks: [] }, AREAS: [], SAVED_VIEWS: [], URLSearchParams,
    darfAnsicht: view => !['arbeit', 'team'].includes(view), navigate: (...a) => fahrten.push(a),
    setTimeout: fn => { timer.push(fn); return timer.length; }, clearTimeout() {},
    fetchEinkauf: async pfad => pfad.startsWith('/api/kunden')
      ? { treffer: [{ key: 'test', name: 'Synthetischer Kunde' }] }
      : { treffer: { items: [] } },
  });
  return { ...api, fahrten, timer };
}

test('Packstation, Bestellungen und Muster bestellen sind auch fuer Mitarbeiter direkt auffindbar', () => {
  for (const [q, view, params] of [
    ['Packstation', 'kunden', { tab: 'muster' }],
    ['Bestellungen', 'kunden', { tab: 'bestellungen' }],
    ['Muster bestellen', 'einkauf', { tab: 'lieferant', art: 'muster', af: 'offen' }],
  ]) {
    const u = palette(), item = u.paletteItems(q)[0];
    assert.equal(item.label, q, 'genau benannter Arbeitsweg steht vor der allgemeinen Aufgabensuche');
    item.run();
    assert.deepEqual(JSON.parse(JSON.stringify(u.fahrten[0])), [view, params]);
  }
});

test('Aufgabensuche uebernimmt den eingegebenen Text in die vorhandene Teamliste', () => {
  const u = palette();
  const q = 'Synthetische Rückfrage';
  const item = u.paletteItems(q).find(i => i.kind === 'Aufgaben');
  assert.ok(item);
  item.run();
  assert.deepEqual(JSON.parse(JSON.stringify(u.fahrten[0])), ['organisation', { ob: 'team-aufgaben', oa: 'alle', og: 'alles', oq: q }]);
});

test('waehrend einer neuen Suche erscheinen keine Kunden zum alten Suchwort', async () => {
  const u = palette();
  u.paletteFernSuche('Testname', () => {});
  u.timer.shift()();
  await tick();
  assert.equal(u.paletteFern.kunden.length, 1);
  u.paletteFernSuche('Anderer Name', () => {});
  assert.equal(u.paletteFern.kunden.length, 0);
  assert.equal(u.paletteItems('Anderer Name').some(i => i.kind === 'Kunde'), false);
});

test('verzoegerte Treffer zur alten Eingabe werden nicht in die neue Suche uebernommen', async () => {
  const u = palette();
  u.paletteFernSuche('Alt', () => {});
  u.timer.shift()();
  u.paletteFernSuche('Neu', () => {});
  await tick();
  assert.equal(u.paletteFern.kunden.length, 0);
  assert.equal(u.paletteFern.q, 'Neu');
});
