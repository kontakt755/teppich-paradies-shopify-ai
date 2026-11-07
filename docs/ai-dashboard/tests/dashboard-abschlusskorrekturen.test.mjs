import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { aufkleberFuer } from '../lib/muster-packen.mjs';
import { plural } from '../kern/helfer.mjs';
import { warenArbeitsstand } from '../lib/shop-bestellarbeit.mjs';
import { lieferantName as lieferantAnzeige } from '../lib/einkauf-lieferanten.mjs';
import { warteWort, warteTitel } from '../lib/ampel.mjs';
import { ampelPlakette } from '../bausteine/ampel.mjs';

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
    document: { addEventListener: (typ, handler) => { if (typ === 'toggle') toggle = handler; } },
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
    warenArbeitsstand, lieferantAnzeige, warteWort, warteTitel, ampelPlakette, einkauf: {}, ensureEinkaufLieferanten: () => {},
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

// Gepackt = verschickt (06.11.2026): jeder Weg zu "gepackt" fragt erst in der Karte, gebucht wird mit dem Ja.
function packKlicks({ fehler = null, liste = [{ packSchluessel: 'A', name: 'Testkunde', bestellungen: [{ orderId: 'A', orderName: '#T1' }], muster: [{ lineItemId: 'L1', abgehakt: null }, { lineItemId: 'L2', abgehakt: { zeit: 'x' } }] }], antwort = { ok: true, versand: [{ orderId: 'A', orderName: '#T1', status: 'gebucht', kundeBenachrichtigt: true }] } } = {}) {
  const geschrieben = [], toasts = [];
  let gezeichnet = 0;
  const api = ladeAnsicht('muster-packen.mjs', {
    kunden: { musterPacken: { verfuegbar: true, kunden: liste } },
    window: { confirm: () => assert.fail('kein Browser-Dialog: die Rueckfrage steht in der Karte') },
    orgSchreiben: async (_, d) => { geschrieben.push(JSON.parse(JSON.stringify(d))); if (fehler) throw fehler; return antwort; },
    fetchEinkauf: async () => ({ verfuegbar: true, kunden: [] }),
    render: () => { gezeichnet++; }, toast: (t, ton) => { toasts.push([t, ton || '']); },
    plural: (n, a, b) => `${n} ${n === 1 ? a : b}`, umschlagKennung: k => k.bestellungen.map(b => b.orderName).join(' / '),
    document: { getElementById: () => null },
  }, '({ musterPackenKlick, frage: () => versandFrage })');
  const klick = (selektor, knopf) => api.musterPackenKlick({ target: { closest: s => (s === selektor ? knopf : null) }, preventDefault() {} });
  return { api, klick, geschrieben, toasts, gezeichnet: () => gezeichnet };
}

test('Umschlag gepackt und Restumfang fragen erst in der Karte, Abbrechen schreibt nichts', () => {
  for (const [daten, art] of [[{ mpAktion: 'gepackt', mpK: 'A', mpWert: '1' }, 'gepackt'], [{ mpAktion: 'gepackt', mpK: 'A', mpWert: '1', mpRestumfang: '1' }, 'restumfang']]) {
    const u = packKlicks();
    const knopf = { dataset: daten, disabled: false };
    assert.equal(u.klick('[data-mp-aktion]', knopf), true);
    assert.equal(JSON.stringify(u.api.frage()), JSON.stringify({ pk: 'A', art }));
    assert.equal(knopf.disabled, false);
    assert.equal(u.geschrieben.length, 0, 'die Frage allein bucht nichts');
    assert.equal(u.klick('[data-mp-frage-weg]', {}), true);
    assert.equal(u.api.frage(), null);
    assert.equal(u.geschrieben.length, 0);
  }
});

test('"Ja, gepackt und verschickt" schickt gepackt mit verschicken, bei "Alle da" genau die offenen Muster', async () => {
  const u = packKlicks();
  u.klick('[data-mp-alle-eingelegt]', { dataset: { mpAlleEingelegt: 'A' } });
  assert.equal(JSON.stringify(u.api.frage()), JSON.stringify({ pk: 'A', art: 'alle' }));
  const ja = { dataset: { mpVersandJa: 'A', mpArt: 'alle' }, disabled: false, textContent: '' };
  assert.equal(u.klick('[data-mp-versand-ja]', ja), true);
  assert.equal(ja.disabled, true, 'kein zweiter Klick waehrend der Buchung');
  for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r));
  assert.deepEqual(u.geschrieben, [{ packSchluessel: 'A', aktion: 'gepackt', gepackt: true, verschicken: true, alleEingelegt: true, lineItemIds: ['L1'] }]);
  assert.equal(u.api.frage(), null);
  assert.match(u.toasts.at(-1)[0], /^Gepackt und verschickt · #T1 Testkunde · der Kunde bekommt die Versandmail/);

  const v = packKlicks({ antwort: { ok: true, versand: [{ orderId: 'A', orderName: '#T1', status: 'fehler', meldung: 'kein Zugang' }] } });
  v.klick('[data-mp-aktion]', { dataset: { mpAktion: 'gepackt', mpK: 'A', mpWert: '1', mpRestumfang: '1' } });
  v.klick('[data-mp-versand-ja]', { dataset: { mpVersandJa: 'A', mpArt: 'restumfang' } });
  for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r));
  assert.deepEqual(v.geschrieben, [{ packSchluessel: 'A', aktion: 'gepackt', gepackt: true, verschicken: true, restumfangGeprueft: true }]);
  assert.deepEqual(v.toasts.at(-1), ['Gepackt und verschickt · #T1 Testkunde – aber nicht sauber eingetragen. Hinweis oben in der Packstation.', 'crit']);
});

test('Sperrt der Server (409), sagt die Rueckmeldung "nicht gepackt" und die Frage ist zu', async () => {
  const sperre = Object.assign(new Error('Die Muster dieses Umschlags haben sich geändert. Bitte neu laden und erneut prüfen.'), { status: 409 });
  const u = packKlicks({ fehler: sperre });
  u.klick('[data-mp-aktion]', { dataset: { mpAktion: 'gepackt', mpK: 'A', mpWert: '1' } });
  u.klick('[data-mp-versand-ja]', { dataset: { mpVersandJa: 'A', mpArt: 'gepackt' } });
  for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r));
  assert.equal(u.api.frage(), null);
  assert.deepEqual(u.toasts.at(-1), ['Nicht gepackt, nichts verschickt: Die Muster dieses Umschlags haben sich geändert. Bitte neu laden und erneut prüfen.', 'crit']);
});

test('Altfall: "Verschickt – Kunde informieren…" fragt, das Ja schickt aktion verschickt; "Gepackt zuruecknehmen" bleibt ohne Frage', async () => {
  const u = packKlicks();
  u.klick('[data-mp-versand-frage]', { dataset: { mpVersandFrage: 'A', mpArt: 'verschickt' } });
  assert.equal(JSON.stringify(u.api.frage()), JSON.stringify({ pk: 'A', art: 'verschickt' }));
  u.klick('[data-mp-versand-ja]', { dataset: { mpVersandJa: 'A', mpArt: 'verschickt' } });
  for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r));
  assert.deepEqual(u.geschrieben, [{ packSchluessel: 'A', aktion: 'verschickt' }]);
  const zurueck = packKlicks();
  zurueck.klick('[data-mp-aktion]', { dataset: { mpAktion: 'gepackt', mpK: 'A', mpWert: '0' } });
  assert.equal(zurueck.api.frage(), null);
  for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r));
  assert.deepEqual(zurueck.geschrieben, [{ packSchluessel: 'A', aktion: 'gepackt', gepackt: false }]);
});

test('Eingelegt im Reiter "Muster kommt an": Haken speichern, Feld leeren, Rueckmeldung merken, Fokus zurueck ins Feld', async () => {
  const muster = abgehakt => ({ lineItemId: 'L1', abgehakt: abgehakt ? { zeit: 'x' } : null });
  const daten = abgehakt => ({ verfuegbar: true, kunden: [{ packSchluessel: 'A', muster: [muster(abgehakt)] }] });
  const kunden = { musterPacken: daten(false) };
  const state = { route: { view: 'kunden', params: new URLSearchParams('tab=muster&mp=laden&mh=3n55') } };
  const geschrieben = [], adressen = [];
  let fokus = 0, gezeichnet = 0;
  const knopf = { dataset: { mpEingelegt: 'L1' }, disabled: false };
  const api = ladeAnsicht('muster-packen.mjs', {
    state, kunden, toast() {}, render: () => { gezeichnet++; },
    orgSchreiben: async (_, d) => { geschrieben.push(d); },
    fetchEinkauf: async () => daten(true),
    history: { replaceState: (_, __, url) => adressen.push(url) },
    parseRoute: () => { state.route.params = new URLSearchParams(adressen.at(-1).split('?')[1]); },
    document: { addEventListener() {}, getElementById: id => (id === 'mpHandFeld' ? { focus: () => { fokus++; } } : null) },
  }, '({ musterPackenKlick, meldung: () => handMeldung })');
  assert.equal(api.musterPackenKlick({ target: { closest: s => (s === '[data-mp-eingelegt]' ? knopf : null) }, preventDefault() {} }), true);
  assert.equal(knopf.disabled, true);
  await new Promise(r => setImmediate(r));
  // Objekte aus der vm-Sandbox haben einen anderen Prototyp: als JSON vergleichen.
  assert.equal(JSON.stringify(geschrieben), JSON.stringify([{ packSchluessel: 'A', aktion: 'haken', lineItemIds: ['L1'], an: true }]));
  assert.deepEqual(adressen, ['#/kunden?tab=muster&mp=laden']);
  assert.equal(api.meldung(), 'A');
  assert.equal(fokus, 1);
  assert.ok(gezeichnet >= 1);
});

test('Eingelegt ohne bestaetigten Haken laesst Suchtext und Meldung stehen', async () => {
  const kunden = { musterPacken: { verfuegbar: true, kunden: [{ packSchluessel: 'A', muster: [{ lineItemId: 'L1', abgehakt: null }] }] } };
  const state = { route: { view: 'kunden', params: new URLSearchParams('tab=muster&mp=laden&mh=3n55') } };
  let geleert = false;
  const api = ladeAnsicht('muster-packen.mjs', {
    state, kunden, toast() {}, render() {},
    orgSchreiben: async () => { throw new Error('Netz weg'); },
    fetchEinkauf: async () => kunden.musterPacken,
    history: { replaceState: () => { geleert = true; } }, parseRoute() {},
    document: { addEventListener() {}, getElementById: () => null },
  }, '({ musterPackenKlick, meldung: () => handMeldung })');
  api.musterPackenKlick({ target: { closest: s => (s === '[data-mp-eingelegt]' ? { dataset: { mpEingelegt: 'L1' } } : null) }, preventDefault() {} });
  await new Promise(r => setImmediate(r));
  assert.equal(geleert, false);
  assert.equal(api.meldung(), null);
});

test('"Diese Umschläge vorbereiten" druckt die gezeigten Umschläge in Listenreihenfolge und vermerkt sie danach als vorbereitet', async () => {
  const umschlag = (pk, extra = {}) => ({ packSchluessel: pk, name: pk, bereich: 'warten', gepackt: null, gedruckt: null, fehlt: [],
    muster: [{ lineItemId: `${pk}1`, anzahl: 1, etikett: { sku: `M-${pk}` } }], adressAufkleber: { name: pk }, ...extra });
  // C hat inzwischen keine vollstaendige Zuordnung mehr, D wurde zwischendurch gepackt: beide fallen heraus.
  const liste = [umschlag('A'), umschlag('B'), umschlag('C', { fehlt: ['Farbe'] }), umschlag('D', { gepackt: { zeit: 'x' } })];
  let druck = null;
  const vermerkt = [];
  const klick = ladeAnsicht('muster-packen.mjs', {
    kunden: { musterPacken: { kunden: liste } },
    aufkleberFuer, plural,
    oeffneEtikettenDruck: o => { druck = o; },
    istNurLesend: () => false,
    orgSchreiben: async (_, body) => { vermerkt.push(`${body.packSchluessel}:${body.aktion}`); },
    fetchEinkauf: async () => null,
    document: { querySelector: () => null },
    render: () => {}, toast: () => {},
  }, 'musterPackenKlick');
  const knopf = { dataset: { mpVorbereiten: 'B A C D' } };
  assert.equal(klick({ target: { closest: s => (s === '[data-mp-vorbereiten]' ? knopf : null) }, preventDefault() {} }), true);
  assert.deepEqual(Array.from(druck.etiketten, e => e.sku || e.name), ['M-B', 'B', 'M-A', 'A'], 'je Umschlag erst das Muster, dann die Adresse');
  assert.equal(druck.titel, 'Aufkleber · 2 Umschläge vorbereiten');
  assert.deepEqual(vermerkt, [], 'vor dem Druck wird nichts vermerkt');
  druck.druckFertig();
  for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r));
  assert.deepEqual(vermerkt, ['B:gedruckt', 'A:gedruckt']);
});
