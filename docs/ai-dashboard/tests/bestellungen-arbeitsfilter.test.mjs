import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { esc, plural } from '../kern/helfer.mjs';
import { bestellArbeitsstand, bestellungAusgeblendet, bestellPruefgruende } from '../lib/bestellarbeit.mjs';
import { bestellKundenKey, gruppiereBestellzeilenNachKunde, sortKundenname, sortiereNachWichtigkeit } from '../lib/kunden-bestellgruppen.mjs';
import { warenArbeitsstand, bestellArtPasst, shopBestellarbeit } from '../lib/shop-bestellarbeit.mjs';
import { bestellZahlungOffen } from '../lib/bestellarbeit.mjs';
import { bestellzeile } from '../../../operations/lib/bestellliste.mjs';
import { auftragsAblauf, einordnung, teilstandText } from '../lib/auftrags-ablauf.mjs';
import { lieferantName as lieferantAnzeige } from '../lib/einkauf-lieferanten.mjs';
import { warteWort, warteTitel } from '../lib/ampel.mjs';
import { ampelPlakette } from '../bausteine/ampel.mjs';

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
    warenArbeitsstand, lieferantAnzeige, warteWort, warteTitel, ampelPlakette, einkauf: {}, ensureEinkaufLieferanten: () => {},
    bestellArtPasst, shopBestellarbeit, bestellZahlungOffen,
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

// ---------------------------------------------------------------------------
// Farben und naechster Schritt der Warenliste (Rundgang 06.11.2026, #1996)
// ---------------------------------------------------------------------------

const JETZT = Date.parse('2026-11-06T12:00:00Z');
const wp = (lineItemId, extra = {}) => ({ lineItemId, istMuster: false, menge: 1, lieferant: 'A', route: 'SUPPLIER_TO_TP',
  titel: 'Teppich', farbe: lineItemId === 'b' ? 'Blau' : 'Rot', grosshaendlerId: 'TEST-ARTIKEL', bestellmenge: { menge: 1, einheit: 'stk' }, ...extra });
function warenZeile(id, positionen, status = {}) {
  const a = { id, name: `#TEST-${id}`, datum: '2026-10-20T08:00:00Z', offen: true, bezahlt: 'PAID', erfuellt: 'UNFULFILLED',
    ampel: 'gruen', checks: {}, positionen, details: { kunde: { name: `Testkunde ${id}` }, tags: [] } };
  const statusAlle = Object.fromEntries(Object.entries(status).map(([k, v]) => [`${id}::${k}`, v]));
  return { ...bestellzeile(a, { statusAlle }), orderName: `#TEST-${id}` };
}
const tag = n => new Date(JETZT - n * 864e5).toISOString();
const zeileHtml = (html, id) => html.match(new RegExp(`<tr class="bq-row[^"]*" data-bq-toggle="${id}"[\\s\\S]*?</tr>`))?.[0] || '';
const standKlasse = tr => tr.match(/class="bq-fortschritt ([a-z]+)"/)?.[1];
const naechster = tr => tr.match(/<td data-l="Nächster Schritt">([\s\S]*?)<\/td>/)?.[1];

test('Warenliste: Warten ist ruhig, Unbestelltes gelb, Rot nur aus der Ampel der Warenpositionen', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: JETZT });
  const zeilen = [
    warenZeile('NEU', [wp('a')]),
    warenZeile('WARTET', [wp('a')], { a: { status: 'bestellt', bestelltAm: tag(3) } }),
    warenZeile('ALT', [wp('a')], { a: { status: 'bestellt', bestelltAm: tag(15) } }),
    warenZeile('BLOCK', [wp('a', { grosshaendlerId: 'UNGEKLAERT' })]),
  ];
  const { html } = ansicht('tab=bestellungen&bart=ware&bsort=wichtigkeit', zeilen);
  const neu = zeileHtml(html, 'NEU'), wartet = zeileHtml(html, 'WARTET'), alt = zeileHtml(html, 'ALT'), block = zeileHtml(html, 'BLOCK');
  assert.equal(standKlasse(neu), 'offen', 'bezahlt, noch nicht bestellt: zu tun');
  assert.doesNotMatch(neu, /ampel-rot/, 'eine neue Bestellung ist kein Problem');
  assert.equal(standKlasse(wartet), 'unterwegs');
  assert.doesNotMatch(wartet, /ampel-/, 'Warten beim Lieferanten ohne Verzug bleibt ruhig');
  assert.equal(naechster(wartet), 'wartet auf Lieferant · seit 3 Tagen', 'der Stand "bestellt" wird nicht wiederholt');
  assert.match(alt, /<span class="ampel ampel-rot"[^>]*><span class="ampel-zeichen" aria-hidden="true">×<\/span>Überfällig · 15 Tage beim Lieferanten<\/span>/);
  assert.match(block, /ampel-rot[^>]*>[\s\S]*?Blockiert<\/span>/, 'fehlende Bestellangaben halten auf');
  // Die Farben selbst: offen = gelb (zu tun), unterwegs = ruhig, nirgends Rot ueber die Klasse.
  const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  assert.match(css, /\.bq-fortschritt\.offen \{ color: var\(--warn\); \}/);
  assert.match(css, /\.bq-fortschritt\.unterwegs \{ color: var\(--text-2\); \}/);
  assert.doesNotMatch(css, /\.bq-fortschritt[^{]*\{[^}]*--crit/);
});

test('Warenliste: Teillieferung zeigt denselben Satz wie "Je Auftrag", ein bestaetigter Termin bleibt', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: JETZT });
  const positionen = [wp('a'), wp('b')];
  const status = { a: { status: 'geliefert', bestelltAm: tag(5), geliefertAm: tag(1) }, b: { status: 'bestellt', bestelltAm: tag(5) } };
  const z = warenZeile('TEIL', positionen, status);
  const { html } = ansicht('tab=bestellungen&bart=ware', [z,
    warenZeile('TERMIN', [wp('a')], { a: { status: 'bestellt', bestelltAm: tag(2), beschaffung: { liefertermin: '2026-11-12' } } })]);
  // "Je Auftrag": Gruppen der Bestelluebersicht, Stand je Position aus dem Auftragsfluss.
  const ab = auftragsAblauf({ id: 'TEIL' }, { gruppen: [{ lieferant: 'A', positionen: positionen.map(p => ({ ...p, orderId: 'TEIL' })) }] },
    p => status[p.lineItemId]);
  const satz = teilstandText(ab, einordnung(ab, null, new Date(JETZT)), { lieferantName: id => lieferantAnzeige(id) });
  assert.equal(satz, 'Teillieferung: 1 von 2 Warenartikeln da – fehlt noch: Teppich · Blau (Lieferant A)');
  assert.equal(naechster(zeileHtml(html, 'TEIL')), satz);
  assert.equal(naechster(zeileHtml(html, 'TERMIN')), 'Ware kommt bis 12.11.2026');
});
