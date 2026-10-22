import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Ansichtsmodul mit kleinen Browser-Stubs laden; getestet werden die echten Handler.
function ladeAnsicht(datei, kontext, ausgabe) {
  const quelltext = fs.readFileSync(new URL(`../ansichten/kunden/${datei}`, import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
    .replace(/^export\s/gm, '');
  return vm.runInNewContext(`${quelltext}\n${ausgabe}`, { URLSearchParams, ...kontext });
}

test('Neueste zuerst entfernt alte aufsteigende Richtung und Blaetterseite, erhaelt Suche', () => {
  const location = { hash: '' };
  const state = { route: { view: 'kunden', params: new URLSearchParams('tab=bestellungen&bsort=orderName&bdir=asc&bseite=3&bq=blau') } };
  const klick = ladeAnsicht('bestellungen.mjs', { state, location, musteretikettenKlick: () => false, zeitleisteKlick: () => false }, 'kundenKlickBestellungen');
  let verhindert = false;
  assert.equal(klick({ target: { closest: selector => selector === '[data-bq-neueste]' ? {} : null }, preventDefault() { verhindert = true; } }), true);
  assert.equal(verhindert, true);
  assert.equal(location.hash, '#/kunden?tab=bestellungen&bq=blau');
});

test('neues Umschlagziel ersetzt Handwahl, stilles Neuzeichnen erhaelt sie', () => {
  let toggle;
  const state = { route: { params: new URLSearchParams('umschlag=A') } };
  const api = ladeAnsicht('muster-packen.mjs', {
    state,
    document: { addEventListener: (_, handler) => { toggle = handler; } },
    kunden: { loadingMusterPacken: true },
  }, '({ zeichne: viewKundenMusterPacken, offen: () => packOffen })');
  api.zeichne();
  assert.equal(api.offen(), 'A');
  toggle({ target: { matches: () => true, open: true, dataset: { mpKunde: 'C' } } });
  api.zeichne();
  assert.equal(api.offen(), 'C');
  state.route.params.set('umschlag', 'B');
  api.zeichne();
  assert.equal(api.offen(), 'B');
  toggle({ target: { matches: () => true, open: true, dataset: { mpKunde: 'C' } } });
  state.route.params.set('mp', 'laden');
  api.zeichne();
  assert.equal(api.offen(), 'C');
  state.route.params.delete('mp');
  api.zeichne();
  assert.equal(api.offen(), 'B', 'Direktlink aus Wareneingang uebernimmt auch das unveraenderte URL-Ziel');
});
