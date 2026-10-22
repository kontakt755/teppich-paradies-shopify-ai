import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { bestellzeile } from '../../../operations/lib/bestellliste.mjs';
import { esc, plural } from '../kern/helfer.mjs';
import { bestellArbeitsstand, bestellungAusgeblendet, bestellPruefgruende, bestellZahlungOffen } from '../lib/bestellarbeit.mjs';
import { bestellArtPasst, warenArbeitsstand, shopBestellarbeit } from '../lib/shop-bestellarbeit.mjs';
import { bestellKundenKey, gruppiereBestellzeilenNachKunde, sortKundenname, sortiereNachWichtigkeit } from '../lib/kunden-bestellgruppen.mjs';

const quelle = fs.readFileSync(new URL('../ansichten/kunden/bestellungen.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
function zeile(id, arten = [false], staende = [], extra = {}) {
  const a = { id, name: `#TEST-${id}`, datum: '2026-10-22T08:00:00Z', offen: true, bezahlt: 'PAID', erfuellt: 'UNFULFILLED',
    ampel: 'gruen', checks: {}, details: { kunde: { name: 'Testkunde' }, tags: [] },
    positionen: arten.map((istMuster, i) => ({ lineItemId: `p${i}`, istMuster, menge: 1,
      bestellmenge: { menge: 1, einheit: istMuster ? 'muster' : 'paket' } })) };
  const statusAlle = Object.fromEntries(staende.map((status, i) => [`${id}::p${i}`, status ? { status } : null]));
  return { ...bestellzeile(a, { statusAlle }), ...extra };
}
function ansicht(query, zeilen, extras = {}) {
  const state = { route: { view: 'kunden', params: new URLSearchParams(query) } };
  const vorher = state.route.params.toString();
  const bestellungen = { verfuegbar: true, zeilen, ...extras };
  const r = vm.runInNewContext(`${quelle}\n({ html:viewKundenBestellungen(),
    liste:bestellzeileGefiltert(kunden.bestellungen.zeilen,state.route.params),
    offen:bestellungenOffen({art:'ware'}), gesamt:bestellungenOffen(),
    sichtbar:bestellzeileGefiltert(kunden.bestellungen.zeilen,state.route.params).filter(z=>!istErledigt(z)).map(z=>z.orderId),
    params:state.route.params.toString() })`, {
    URLSearchParams, state, kunden: { bestellungen, erweitert: new Set() },
    bestellArbeitsstand, bestellungAusgeblendet, bestellPruefgruende, bestellZahlungOffen,
    bestellArtPasst, warenArbeitsstand, shopBestellarbeit,
    bestellKundenKey, gruppiereBestellzeilenNachKunde, sortKundenname, sortiereNachWichtigkeit,
    esc, plural, istNurLesend: () => true, fmtDateTime: () => '', fmtDate: () => '', geldText: () => '',
    statusText: () => '', ZAHLUNG_TEXT: {}, emptyState: t => t, stoerungState: () => 'Lesefehler',
    bestellinhalt: () => ({ muster: { anzahl: 0 }, ware: { anzahl: 0 } }),
  });
  assert.equal(r.params, vorher, 'Darstellung darf Art-, Such- oder Statuskontext nicht umschreiben');
  return { ...r, ids: Array.from(r.liste, z => z.orderId), sichtbar: Array.from(r.sichtbar) };
}

test('ohne Art bleiben alte direkte Suchlinks vollstaendig einschliesslich Muster und gemischt', () => {
  const z = [zeile('W'), zeile('M', [true]), zeile('G', [false, true])];
  const r = ansicht('tab=bestellungen&bfilter=alle&bq=TEST&bsort=orderName&bdir=asc', z);
  assert.deepEqual(r.ids, ['G', 'M', 'W']);
  assert.match(r.html, /data-param="bart" data-value="" aria-pressed="true">Waren und Muster/);
});

test('explizite Waren- und Musterwahl sind orthogonal zu allen vorhandenen Statusfiltern', () => {
  const z = [zeile('W'), zeile('M', [true]), zeile('G', [false, true]),
    zeile('MW-PENDING', [false, true], [], { zahlungsstatus: 'PENDING' }),
    zeile('M-PENDING', [true], [], { zahlungsstatus: 'PENDING' }),
    zeile('W-STORNO', [false], [], { storniert: true }), zeile('M-STORNO', [true], [], { storniert: true })];
  assert.deepEqual(ansicht('tab=bestellungen&bart=ware&bfilter=alle&bsort=orderName&bdir=asc', z).ids,
    ['G', 'MW-PENDING', 'W', 'W-STORNO']);
  assert.deepEqual(ansicht('tab=bestellungen&bart=muster&bfilter=alle&bsort=orderName&bdir=asc', z).ids,
    ['G', 'M', 'M-PENDING', 'M-STORNO', 'MW-PENDING']);
  assert.deepEqual(ansicht('tab=bestellungen&bart=ware&bfilter=offen', z).ids, ['MW-PENDING']);
  assert.deepEqual(ansicht('tab=bestellungen&bart=ware&bfilter=storniert', z).ids, ['W-STORNO']);
});

test('Warenliste zeigt bei gemischt den Warenstand, laesst Ursprung und Gesamtbestellaktionen unangetastet', () => {
  const z = zeile('G', [false, true], ['geliefert', null], { naechsterSchritt: { text: 'Muster bestellen' } });
  const r = ansicht('tab=bestellungen&bart=ware&bsort=wichtigkeit', [z]);
  assert.match(r.html, /Ware eingetroffen/);
  assert.match(r.html, /An Kunden rausgeben/);
  assert.doesNotMatch(r.html, /Muster bestellen/);
  assert.equal(r.liste[0].fortschritt.stufe, 'offen', 'Originalfortschritt bleibt an der Gesamtbestellung');
  assert.equal(r.liste[0].auftrag.positionen.length, 2, 'Details verlieren keine Musterposition');
  assert.equal(z.fortschritt.stufe, 'offen', 'Ableitung aendert keine Quelle');
});

test('offene Warenliste, Navigationszahl und Startseitenprojektion zaehlen exakt dieselben Auftraege', () => {
  const z = [zeile('W'), zeile('M', [true]), zeile('G-W-FERTIG', [false, true], ['erledigt']),
    zeile('G-M-FERTIG', [false, true], [null, 'erledigt']),
    zeile('HAKEN', [false], [], { abgehakt: {} }),
    zeile('VERSANDT', [false], [], { fulfillmentstatus: 'FULFILLED' }),
    zeile('VERSANDT-ZAHLUNG', [false], [], { fulfillmentstatus: 'FULFILLED', zahlungsstatus: 'PENDING' }),
    zeile('TEST', [false], [], { testbestellung: true }), zeile('STORNO', [false], [], { storniert: true })];
  const r = ansicht('tab=bestellungen&bart=ware&bsort=wichtigkeit', z);
  const arbeit = shopBestellarbeit({ verfuegbar: true, zeilen: z });
  assert.equal(r.offen, 4);
  assert.equal(r.offen, r.sichtbar.length);
  assert.equal(r.offen, arbeit.offen);
  assert.deepEqual(r.sichtbar.sort(), arbeit.zeilen.map(a => a.zeile.orderId).sort());
  assert.match(r.html, /4 Bestellungen ·/);
});

test('Kontroll- und Abschlussfilter beziehen sich bewusst auf den gewaehlten Warenanteil', () => {
  const z = [zeile('WARE-FERTIG', [false, true], ['erledigt']), zeile('MUSTER-FERTIG', [false, true], [null, 'erledigt']),
    zeile('HAKEN', [false, true], [], { abgehakt: {} }), zeile('MUSTER', [true], [], { abgehakt: {} })];
  assert.deepEqual(ansicht('tab=bestellungen&bart=ware&bfilter=fertig', z).ids, ['WARE-FERTIG']);
  assert.deepEqual(ansicht('tab=bestellungen&bart=ware&bfilter=pruefen', z).ids, ['HAKEN']);
  const r = ansicht('tab=bestellungen&bart=ware', z);
  const pruef = r.html.match(/href="([^"]*)">1 Bestellung braucht Kontrolle/)[1].replaceAll('&amp;', '&');
  const p = new URLSearchParams(pruef.split('?')[1]);
  assert.equal(p.get('bart'), 'ware');
  assert.equal(p.get('bfilter'), 'pruefen');
});

test('Artwahl bewahrt Suche, Sortierung und weitere Filter im Weg zu allen Treffern', () => {
  const q = 'tab=bestellungen&bart=ware&bfilter=offen&bq=TEST&bsort=orderName&bdir=asc&bseite=4';
  const r = ansicht(q, []);
  assert.match(r.html, /data-param="bart" data-value="ware" aria-pressed="true">Waren/);
  const href = r.html.match(/href="([^"]*)">In allen Bestellungen suchen/)[1].replaceAll('&amp;', '&');
  const p = new URLSearchParams(href.split('?')[1]);
  assert.equal(p.get('bart'), 'ware');
  assert.equal(p.get('bfilter'), 'alle');
  assert.equal(p.get('bq'), 'TEST');
  assert.equal(p.get('bsort'), 'orderName');
  assert.equal(p.get('bdir'), 'asc');
  assert.equal(p.has('bseite'), false);
});

test('Navigation gibt bei Fehler keine scheinbar fertige Null zurueck', () => {
  assert.equal(ansicht('tab=bestellungen&bart=ware', [], { verfuegbar: false }).offen, null);
  assert.equal(ansicht('tab=bestellungen&bart=ware', [], { fehler: ['Fehler'] }).offen, null);
});
