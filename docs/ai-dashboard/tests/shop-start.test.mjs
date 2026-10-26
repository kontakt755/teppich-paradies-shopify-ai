import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../ansichten/heute.mjs', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace(/^export\s/gm, '');
function start(query = '') {
  const geladen = [], bloecke = [];
  const ensure = ['KundenBestellungen', 'EinkaufAuftragsstatus', 'EinkaufBestellungen', 'HeuteLieferanten',
    'MusterPacken', 'Aktualisierung', 'HeuteMusterTexte', 'KundenRueckrufe', 'KundenFaelle', 'Serviceanfragen',
    'HeuteAufgaben', 'LadenZahlen', 'ShopifyAbgleich', 'EinkaufKennzahlen', 'Shopwache', 'Akquise', 'Belege'];
  const kontext = Object.fromEntries(ensure.map(n => [`ensure${n}`, () => geladen.push(n)]));
  const state = { route: { view: 'heute', params: new URLSearchParams(query) }, session: {} };
  const block = name => () => { bloecke.push(name); return `<div>${name}</div>`; };
  const api = vm.runInNewContext(quelle + '\ndatenstandZeile=()=>"Datenstand"; viewAlltag=()=>"Expliziter Alltag"; ({viewHeute})', {
    ...kontext, state, einkauf: {}, kunden: {}, heuteDaten: {},
    musterNachfassenStand: () => ({ offen: [], erledigt: [], abgemeldet: [] }),
    versandLaeuft: () => null, startBestellarbeit: () => ({}),
    musterAutomatikBlock: () => '',
    warenbestellungenBlock: block('Waren'), bestellarbeitBlock: block('Muster'),
    aufraeumenBlock: block('Aufräumen'), shopNacharbeitBlock: block('Nacharbeit'), musterNachfassenBlock: block('Vorhandener Nachfassblock'),
    istNurLesend: () => false, darfAnsicht: () => true,
  });
  return { html: api.viewHeute(), geladen, bloecke };
}

test('Shop ist Standard und Waren stehen vor Mustern, danach Aufraeumen und vorhandene Nacharbeit', () => {
  const r = start();
  assert.match(r.html, /Shop-Übersicht/);
  assert.deepEqual(r.bloecke, ['Waren', 'Muster', 'Aufräumen', 'Nacharbeit']);
  for (const name of ['KundenBestellungen', 'EinkaufAuftragsstatus', 'EinkaufBestellungen', 'MusterPacken']) assert.ok(r.geladen.includes(name));
  for (const name of ['KundenRueckrufe', 'KundenFaelle', 'Serviceanfragen', 'HeuteAufgaben', 'LadenZahlen', 'ShopifyAbgleich', 'EinkaufKennzahlen', 'Shopwache', 'Akquise', 'Belege']) assert.ok(!r.geladen.includes(name), `${name} gehoert nicht zum Standardabruf`);
});

test('alte Alltagssichten bleiben ausdruecklich erreichbar; unbekannte Sicht bleibt Shop', () => {
  for (const sicht of ['laden', 'website', 'alles', 'inhaber']) assert.equal(start(`sicht=${sicht}`).html, 'Expliziter Alltag');
  assert.match(start('sicht=unbekannt').html, /Shop-Übersicht/);
});

test('mn=1 oeffnet den bestehenden Nachfassblock im Shop ohne allgemeine Aufgabenabrufe', () => {
  const r = start('mn=1');
  assert.deepEqual(r.bloecke, ['Waren', 'Muster', 'Aufräumen', 'Nacharbeit', 'Vorhandener Nachfassblock']);
  assert.ok(!r.geladen.includes('HeuteAufgaben'));
});
