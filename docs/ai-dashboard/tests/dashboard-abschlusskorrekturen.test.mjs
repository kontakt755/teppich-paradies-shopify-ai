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

function bestellTestAnsicht(filter, zeilen) {
  const kunden = { bestellungen: { verfuegbar: true, zeilen }, erweitert: new Set() };
  return ladeAnsicht('bestellungen.mjs', {
    state: { route: { params: new URLSearchParams(`tab=bestellungen&bfilter=${filter}`) } }, kunden,
    bestellungAusgeblendet: z => !!(z.abgehakt || z.fertig || z.fulfillmentstatus === 'FULFILLED'),
    bestellPruefgruende: z => z.abgehakt && !z.fertig && z.fulfillmentstatus !== 'FULFILLED' ? ['Versand offen'] : [],
    bestellArbeitsstand: () => ({ stand: 'Offen', naechstes: 'Prüfen' }),
    istNurLesend: () => true, esc: v => String(v ?? ''),
    fmtDateTime: () => '', fmtDate: () => '', geldText: () => '',
    statusText: () => '', ZAHLUNG_TEXT: {},
    plural: (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`,
    bestellinhalt: () => ({ muster: { anzahl: 0 }, ware: { anzahl: 0 } }),
    emptyState: t => t,
  }, 'viewKundenBestellungen()');
}
const alteBestellzeile = (orderName, zusatz = {}) => ({ orderId: orderName, orderName, kundenname: 'Testkunde', datum: '2020-01-01', tags: { beratung: [], typ: [], sonstige: [] }, ...zusatz });

test('expliziter Abschlussfilter zeigt auch alte Bestellungen paginiert statt sie zu verstecken', () => {
  const zeilen = Array.from({ length: 26 }, (_, i) => alteBestellzeile(`ALT${i}`, { fertig: true }));
  const html = bestellTestAnsicht('fertig', zeilen);
  assert.match(html, /ALT0/);
  assert.match(html, /Seite 1 von 2/);
  assert.doesNotMatch(html, /ältere über die Suche/);
});

test('Gesamtliste zeigt Storno und Archiv; Kontrolle holt manuelle Haken in die sichtbare Liste', () => {
  const zeilen = [alteBestellzeile('MANUELL', { abgehakt: {} }), alteBestellzeile('VERSANDT', { fulfillmentstatus: 'FULFILLED' }), alteBestellzeile('STORNO', { storniert: true })];
  const alle = bestellTestAnsicht('alle', zeilen);
  for (const nr of ['MANUELL', 'VERSANDT', 'STORNO']) assert.match(alle, new RegExp(nr));
  const kontrolle = bestellTestAnsicht('pruefen', zeilen);
  assert.match(kontrolle, /MANUELL/);
  assert.doesNotMatch(kontrolle, /VERSANDT|STORNO/);
});

test('abgebrochene Restumfang-Pruefung setzt keine Packmarke und laesst den Knopf bedienbar', () => {
  const knopf = { dataset: { mpAktion: 'gepackt', mpK: 'A', mpWert: '1', mpRestumfang: '1' }, disabled: false };
  let bestaetigungen = 0;
  const klick = ladeAnsicht('muster-packen.mjs', {
    kunden: { musterPacken: { kunden: [] } },
    window: { confirm: () => { bestaetigungen++; return false; } },
    orgSchreiben: () => { throw new Error('Darf bei Abbruch nicht schreiben'); },
  }, 'musterPackenKlick');
  assert.equal(klick({ target: { closest: s => s === '[data-mp-aktion]' ? knopf : null }, preventDefault() {} }), true);
  assert.equal(bestaetigungen, 1);
  assert.equal(knopf.disabled, false);
});
