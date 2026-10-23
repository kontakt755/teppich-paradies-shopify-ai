import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { esc, plural } from '../kern/helfer.mjs';
import { bestellArbeitsstand, bestellungAusgeblendet, bestellPruefgruende, bestellZahlungOffen } from '../lib/bestellarbeit.mjs';
import { bestellKundenKey, gruppiereBestellzeilenNachKunde, sortKundenname, sortiereNachWichtigkeit } from '../lib/kunden-bestellgruppen.mjs';
import { wendeFilterAn } from '../../../operations/lib/bestellliste.mjs';

const quelle = fs.readFileSync(new URL('../ansichten/kunden/bestellungen.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const zeile = (orderId, extra = {}) => ({ orderId, orderName: orderId, kundenname: `Testkunde ${orderId}`,
  datum: '2026-10-20', zahlungsstatus: 'PAID', fulfillmentstatus: 'UNFULFILLED', offen: true,
  tags: { beratung: [], typ: [], sonstige: [] }, auftrag: { positionen: [] }, ...extra });
function ansicht(zeilen, query = 'tab=bestellungen') {
  const state = { route: { view: 'kunden', params: new URLSearchParams(query) } };
  const vorher = state.route.params.toString();
  const api = vm.runInNewContext(`${quelle}\n({html:viewKundenBestellungen(), treffer:bestellzeileGefiltert(kunden.bestellungen.zeilen,state.route.params)})`, {
    URLSearchParams, state, kunden: { bestellungen: { verfuegbar: true, zeilen }, erweitert: new Set() },
    bestellArbeitsstand, bestellungAusgeblendet, bestellPruefgruende, bestellZahlungOffen,
    bestellKundenKey, gruppiereBestellzeilenNachKunde, sortKundenname, sortiereNachWichtigkeit,
    esc, plural, istNurLesend: () => true, fmtDateTime: () => '', fmtDate: () => '', geldText: () => '',
    statusText: () => '', ZAHLUNG_TEXT: {}, emptyState: text => text,
    bestellinhalt: () => ({ muster: { anzahl: 0 }, ware: { anzahl: 0 } }),
  });
  assert.equal(state.route.params.toString(), vorher);
  return api;
}
const mobil = html => html.slice(html.indexOf('<div class="rows bq-karten">'));
const karte = (html, id) => mobil(html).match(new RegExp(`<div class="row bq-karte" data-bq-toggle="${id}"[^>]*>([\\s\\S]*?)<div class="r">`))?.[1] || '';

test('Zahlung offen richtet sich nach ausstehender Zahlung statt nach offenem Versand', () => {
  const ausstehend = ['PENDING', 'AUTHORIZED', 'PARTIALLY_PAID'];
  const zeilen = [
    ...ausstehend.map(status => zeile(status, { zahlungsstatus: status, offen: false, fulfillmentstatus: 'FULFILLED' })),
    ...['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED'].map(status => zeile(status, { zahlungsstatus: status })),
    zeile('unbekannt', { zahlungsstatus: null }),
    zeile('test', { zahlungsstatus: 'PENDING', testbestellung: true }),
    zeile('storniert', { zahlungsstatus: 'PENDING', storniert: true }),
  ];
  const { treffer } = ansicht(zeilen, 'tab=bestellungen&bfilter=offen');
  assert.deepEqual(Array.from(treffer, z => z.orderId), ausstehend);
  assert.deepEqual(wendeFilterAn(zeilen, 'offen').map(z => z.orderId), ausstehend, 'Backend waehlt denselben Zahlungsumfang');
});

test('bewusster Zahlungsfilter zeigt auch alte versandte und manuell abgehakte unbezahlte Bestellungen direkt', () => {
  const zeilen = [zeile('alt-versandt', { datum: '2020-01-01', zahlungsstatus: 'PENDING', offen: false,
    fulfillmentstatus: 'FULFILLED' }), zeile('alt-abgehakt', { datum: '2020-01-02', zahlungsstatus: 'PARTIALLY_PAID', abgehakt: {} })];
  const { html } = ansicht(zeilen, 'tab=bestellungen&bfilter=offen');
  for (const id of ['alt-versandt', 'alt-abgehakt']) assert.match(html, new RegExp(`data-bq-toggle="${id}"`));
  assert.match(html, /2 Bestellungen/);
  assert.doesNotMatch(html, /class="bq-erledigt"|ältere über die Suche/);
});

test('Zahlungsfilter behaelt Suche und Sortierung sowie den Weg zu allen Bestellungen', () => {
  const zeilen = [zeile('B', { zahlungsstatus: 'PENDING', kundenname: 'Testfall Blau' }),
    zeile('A', { zahlungsstatus: 'PARTIALLY_PAID', kundenname: 'Testfall Blau' }),
    zeile('C', { zahlungsstatus: 'PENDING', kundenname: 'Testfall Grau' }),
    zeile('D', { kundenname: 'Testfall Blau' })];
  const { html, treffer } = ansicht(zeilen, 'tab=bestellungen&bfilter=offen&bq=Blau&bsort=orderName&bdir=asc');
  assert.deepEqual(Array.from(treffer, z => z.orderId), ['A', 'B']);
  assert.match(html, /value="Blau" data-param="bq"/);
  assert.match(html, /Sortiert nach Bestellnr\. aufsteigend/);
  assert.match(html, /In allen Bestellungen suchen/);
});

test('jede mobile Bestellung zeigt ohne Kundengruppierung den richtigen Kundennamen', () => {
  const zeilen = [zeile('A', { kundenname: 'Testkunde Eins & Partner' }),
    zeile('B', { kundenname: 'Testkunde Zwei <Privat>' }), zeile('C', { kundenname: 'Testkunde Drei' })];
  const { html } = ansicht(zeilen);
  for (const z of zeilen) assert.ok(karte(html, z.orderId).includes(esc(z.kundenname)), `${z.orderId}: Kunde direkt auf der mobilen Karte`);
  assert.doesNotMatch(mobil(html), /Testkunde Zwei <Privat>/);
});

test('bewusste Kundengruppierung behaelt den gemeinsamen Namen in der Gruppenueberschrift', () => {
  const zeilen = [zeile('A', { kundenname: 'Testkunde Gemeinsam', kundenSchluessel: 'test-gemeinsam' }),
    zeile('B', { kundenname: 'Testkunde Gemeinsam', kundenSchluessel: 'test-gemeinsam' })];
  const { html } = ansicht(zeilen, 'tab=bestellungen&bsort=kundenname');
  assert.match(mobil(html), /<h3>Testkunde Gemeinsam /);
  for (const z of zeilen) assert.ok(!karte(html, z.orderId).includes(z.kundenname), 'Gruppierte Karte wiederholt nicht den gemeinsamen Namen');
});

/** Beide echten Module ausfuehren; nur Netzwerk und Zeichnen sind Attrappen. */
function sammelUmgebung({ leseFehler = null, schreibFehler = null, packGeladen = true } = {}) {
  const u = { aufrufe: [], toasts: [], render: 0 };
  const alteBestellungen = { verfuegbar: true, zeilen: [zeile('test-order', { auftrag: {
    positionen: ['eins', 'zwei', 'drei'].map(lineItemId => ({ lineItemId, titel: 'Testartikel' })),
  } })] };
  const alterPackstand = packGeladen ? { verfuegbar: true, stand: 'alt' } : null;
  const kunden = { bestellungen: alteBestellungen, musterPacken: alterPackstand };
  const kontext = {
    kunden, state: { route: { view: 'kunden', params: new URLSearchParams('tab=bestellungen') } },
    URLSearchParams, musterEigen: () => false, istNurLesend: () => false,
    render: () => { u.render++; }, toast: (...args) => u.toasts.push(args),
    fetch: async (pfad, optionen) => {
      const p = JSON.parse(optionen.body);
      u.aufrufe.push({ methode: optionen.method, pfad, p });
      assert.equal(kunden.bestellungen, alteBestellungen, 'kein Neuladen oder Leeren zwischen den Positionsschritten');
      const ok = p.lineItemId !== schreibFehler;
      return { ok, status: ok ? 200 : 409, json: async () => ({ eintrag: { status: p.status }, error: 'Testkonflikt' }) };
    },
    fetchEinkauf: async pfad => {
      u.aufrufe.push({ methode: 'GET', pfad });
      if (leseFehler === 'antwort' && pfad.startsWith('/api/kunden/')) return { verfuegbar: false, fehler: true };
      if (leseFehler === 'throw' && pfad === '/api/einkauf/auftragsstatus') throw new Error('Testverbindung');
      return pfad === '/api/einkauf/auftragsstatus' ? { verfuegbar: true, positionen: {} }
        : { verfuegbar: true, stand: 'neu', zeilen: [] };
    },
  };
  const flussQuelle = fs.readFileSync(new URL('../ansichten/einkauf/auftragsfluss.mjs', import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
  const fluss = vm.runInNewContext(flussQuelle + '\n({ einkauf, AF_STATUS_LABEL, setzeAuftragsstatus, ladeStandNeu })', kontext);
  const sammel = vm.runInNewContext(quelle + '\nsetzeAuftragsstatusFuerBestellung', { ...kontext, ...fluss });
  return { ...u, kunden, alteBestellungen, alterPackstand, sammel, aufrufe: u.aufrufe, toasts: u.toasts };
}

test('Sammelstatus schreibt jede Position einmal und holt die Arbeitslisten erst einmal nach dem letzten Schritt', async () => {
  const u = sammelUmgebung();
  await u.sammel('test-order', 'bestellt');
  assert.deepEqual(u.aufrufe.map(a => a.methode), ['POST', 'POST', 'POST', 'GET', 'GET', 'GET']);
  assert.deepEqual(u.aufrufe.filter(a => a.methode === 'POST').map(a => a.p.lineItemId), ['eins', 'zwei', 'drei']);
  for (const pfad of ['/api/einkauf/auftragsstatus', '/api/kunden/bestellungen', '/api/kunden/muster-packen']) {
    assert.equal(u.aufrufe.filter(a => a.methode === 'GET' && a.pfad === pfad).length, 1);
  }
  assert.equal(u.kunden.bestellungen.stand, 'neu');
  assert.equal(u.kunden.musterPacken.stand, 'neu');
});

test('Sammelstatus erhaelt alte Listen bei Leseantwortfehlern; Schreibkonflikte werden nicht wiederholt', async () => {
  const u = sammelUmgebung({ leseFehler: 'antwort', schreibFehler: 'zwei' });
  await u.sammel('test-order', 'geliefert');
  assert.equal(u.kunden.bestellungen, u.alteBestellungen);
  assert.equal(u.kunden.musterPacken, u.alterPackstand);
  assert.equal(u.aufrufe.filter(a => a.methode === 'POST').length, 3, 'auch nach einem Konflikt oder Lesefehler kein zweiter Schreibversuch');
  assert.ok(u.toasts.some(([text]) => text.startsWith('2/3 Artikel:')));
});

test('unerwarteter Lesefehler nach Sammelstatus wird abgefangen und wiederholt keine gespeicherten Positionen', async () => {
  const u = sammelUmgebung({ leseFehler: 'throw', packGeladen: false });
  await u.sammel('test-order', 'bestellt');
  assert.equal(u.aufrufe.filter(a => a.methode === 'POST').length, 3);
  assert.equal(u.aufrufe.filter(a => a.pfad === '/api/kunden/muster-packen').length, 0, 'ungeladener Packstand bleibt unangetastet');
  assert.ok(u.toasts.some(([text, ton]) => ton === 'warn' && text.includes('3/3 Artikel gespeichert')));
});
