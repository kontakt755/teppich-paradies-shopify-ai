import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { esc, plural } from '../kern/helfer.mjs';
import { bestellArbeitsstand, bestellungAusgeblendet, bestellPruefgruende } from '../lib/bestellarbeit.mjs';
import { bestellKundenKey, gruppiereBestellzeilenNachKunde, sortKundenname, sortiereNachWichtigkeit } from '../lib/kunden-bestellgruppen.mjs';

// Echtes Ansichtsmodul mit denselben reinen Regeln; Browserzugriffe werden abgegrenzt.
const quelle = fs.readFileSync(new URL('../ansichten/kunden/bestellungen.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const zeile = (orderId, extra = {}) => ({ orderId, orderName: orderId, kundenname: 'Testkunde',
  datum: '2026-10-20', zahlungsstatus: 'PAID', fulfillmentstatus: 'UNFULFILLED',
  tags: { beratung: [], typ: [], sonstige: [] }, auftrag: { positionen: [] }, ...extra });
function ansicht(query = 'tab=bestellungen', zeilen = []) {
  const state = { route: { view: 'kunden', params: new URLSearchParams(query) } };
  const vorher = state.route.params.toString();
  const api = vm.runInNewContext(`${quelle}\n({html:viewKundenBestellungen(), gefiltert:bestellzeileGefiltert(kunden.bestellungen.zeilen,state.route.params), params:state.route.params.toString()})`, {
    URLSearchParams, state, kunden: { bestellungen: { verfuegbar: true, zeilen }, erweitert: new Set() },
    bestellArbeitsstand, bestellungAusgeblendet, bestellPruefgruende,
    bestellKundenKey, gruppiereBestellzeilenNachKunde, sortKundenname, sortiereNachWichtigkeit,
    esc, plural, istNurLesend: () => true, fmtDateTime: () => '', fmtDate: () => '', geldText: () => '',
    statusText: () => '', ZAHLUNG_TEXT: {}, emptyState: text => text,
    bestellinhalt: () => ({ muster: { anzahl: 0 }, ware: { anzahl: 0 } }),
  });
  assert.equal(api.params, vorher, 'Zeichnen darf bestehende Route/Suche/Sortierung nicht umschreiben');
  return api;
}
const filterKnoepfe = html => [...html.matchAll(/<button\b[^>]*\bdata-param="bfilter"[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]);
const werte = html => filterKnoepfe(html).map(x => x.match(/data-value="([^"]*)"/)[1]);
const haupt = html => html.match(/<div class="chips bq-filter-haupt"[\s\S]*?<\/div>/)?.[0];
const weitere = html => html.match(/<details class="bq-filter-extra"[\s\S]*?<\/details>/)?.[0];
const summary = html => weitere(html).match(/<summary>([\s\S]*?)<\/summary>/)[1];

test('vier Arbeitsfilter sind direkt sichtbar, alle sieben Sonderfilter bleiben im nativen Aufklappbereich', () => {
  const { html } = ansicht();
  assert.deepEqual(werte(haupt(html)), ['', 'fertig', 'pruefen', 'alle']);
  assert.match(haupt(html), /data-value="" aria-pressed="true">Offen<\/button>/);
  assert.doesNotMatch(haupt(html), /Nicht fertig|Zahlung offen|Testbestellung/);
  assert.deepEqual(werte(weitere(html)), ['offen', 'bezahlt', 'unerfuellt', 'storniert', 'beratung', 'muster', 'test']);
  assert.equal(summary(html), 'Weitere Filter');
  assert.doesNotMatch(weitere(html), /^<details[^>]*\sopen(?:\s|>)/);
  assert.equal(filterKnoepfe(html).length, 11, 'kein bisheriger Filter darf wegfallen');
});

test('jeder aktive Sonderfilter ist im Summary benannt und automatisch aufgeklappt', () => {
  const filter = { offen: 'Zahlung offen', bezahlt: 'Bezahlt', unerfuellt: 'Unerfüllt', storniert: 'Storniert',
    beratung: 'Beratung offen', muster: 'Muster', test: 'Testbestellung' };
  for (const [wert, label] of Object.entries(filter)) {
    const { html } = ansicht(`tab=bestellungen&bfilter=${wert}`);
    assert.match(weitere(html), /^<details class="bq-filter-extra" open>/);
    assert.equal(summary(html), `Weitere Filter · ${label}`);
    assert.ok(filterKnoepfe(weitere(html)).some(k => k.includes(`data-value="${wert}" aria-pressed="true"`)));
    assert.equal(filterKnoepfe(haupt(html)).filter(k => k.includes('aria-pressed="true"')).length, 0);
  }
});

test('Hauptfilter halten den Sonderbereich geschlossen und markieren die richtige vorhandene Auswahl', () => {
  for (const wert of ['nicht_fertig', 'fertig', 'pruefen', 'alle']) {
    const { html } = ansicht(`tab=bestellungen&bfilter=${wert}`);
    const routenwert = wert === 'nicht_fertig' ? '' : wert;
    assert.ok(filterKnoepfe(haupt(html)).some(k => k.includes(`data-value="${routenwert}" aria-pressed="true"`)));
    assert.doesNotMatch(weitere(html), /^<details[^>]*\sopen(?:\s|>)/);
  }
});

test('Musterfilter erhaelt Suche, Sortierrichtung und Blaetterparameter sowie den Suchweg in alle Bestellungen', () => {
  const query = 'tab=bestellungen&bfilter=muster&bq=Blau&bsort=orderName&bdir=asc&bseite=4';
  const zeilen = [zeile('B', { auftrag: { positionen: [{ istMuster: true, titel: 'Test Blau' }] } }),
    zeile('A', { tags: { beratung: [], typ: ['Muster'], sonstige: [] }, kundenname: 'Blau Test' }),
    zeile('C', { kundenname: 'Blau Test' }), zeile('D', { auftrag: { positionen: [{ istMuster: true, titel: 'Test Grau' }] } })];
  const { html, gefiltert } = ansicht(query, zeilen);
  assert.deepEqual(Array.from(gefiltert, z => z.orderId), ['A', 'B']);
  assert.match(html, /value="Blau" data-param="bq"/);
  assert.match(html, /Sortiert nach Bestellnr\. aufsteigend/);
  const href = html.match(/href="([^"]*)">In allen Bestellungen suchen/)[1].replaceAll('&amp;', '&');
  const params = new URLSearchParams(href.split('?')[1]);
  assert.equal(params.get('bfilter'), 'alle');
  assert.equal(params.get('bq'), 'Blau');
  assert.equal(params.get('bsort'), 'orderName');
  assert.equal(params.get('bdir'), 'asc');
  assert.equal(params.has('bseite'), false, 'Suchwechsel darf nicht auf einer alten leeren Seite landen');
});

test('Kontrolle und Abschluss bleiben echte Arbeitslisten mit alten Treffern statt verstecktem Archiv', () => {
  const zeilen = [zeile('PRUEFEN', { datum: '2020-01-01', abgehakt: {} }),
    zeile('FERTIG', { datum: '2020-01-01', fertig: true }), zeile('STORNO', { storniert: true }),
    zeile('TEST', { testbestellung: true })];
  const kontrolle = ansicht('tab=bestellungen&bfilter=pruefen', zeilen);
  assert.deepEqual(Array.from(kontrolle.gefiltert, z => z.orderId), ['PRUEFEN']);
  assert.match(kontrolle.html, /data-bq-toggle="PRUEFEN"/);
  const fertig = ansicht('tab=bestellungen&bfilter=fertig', zeilen);
  assert.match(fertig.html, /data-bq-toggle="FERTIG"/);
  assert.doesNotMatch(fertig.html, /ältere über die Suche/);
  const alle = ansicht('tab=bestellungen&bfilter=alle', zeilen);
  for (const id of ['PRUEFEN', 'FERTIG', 'STORNO']) assert.match(alle.html, new RegExp(`data-bq-toggle="${id}"`));
  assert.doesNotMatch(alle.html, /data-bq-toggle="TEST"/);
});
