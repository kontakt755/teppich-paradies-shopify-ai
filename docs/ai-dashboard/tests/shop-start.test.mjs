import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../ansichten/heute.mjs', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace(/^export\s/gm, '');
function start(query = '', session = {}) {
  const geladen = [], bloecke = [];
  const ensure = ['KundenBestellungen', 'EinkaufAuftragsstatus', 'EinkaufBestellungen', 'HeuteLieferanten',
    'MusterPacken', 'Aktualisierung', 'HeuteMusterTexte', 'KundenRueckrufe', 'KundenFaelle', 'Serviceanfragen',
    'HeuteAufgaben', 'LadenZahlen', 'ShopifyAbgleich', 'EinkaufKennzahlen', 'Shopwache', 'Akquise', 'Belege'];
  const kontext = Object.fromEntries(ensure.map(n => [`ensure${n}`, () => geladen.push(n)]));
  const state = { route: { view: 'heute', params: new URLSearchParams(query) }, session, tasks: [] };
  const block = name => () => { bloecke.push(name); return `<div>${name}</div>`; };
  const api = vm.runInNewContext(quelle + '\ndatenstandZeile=()=>"Datenstand"; viewAlltag=()=>"Expliziter Alltag"; ({viewHeute})', {
    ...kontext, state, einkauf: {}, kunden: {}, heuteDaten: {},
    musterNachfassenStand: () => ({ offen: [], erledigt: [], abgemeldet: [] }),
    versandLaeuft: () => null, startBestellarbeit: () => ({}),
    musterAutomatikBlock: () => '',
    warenbestellungenBlock: block('Waren'), bestellarbeitBlock: block('Muster'),
    aufraeumenBlock: block('Aufräumen'), shopNacharbeitBlock: block('Nacharbeit'), musterNachfassenBlock: block('Vorhandener Nachfassblock'),
    istNurLesend: () => false, darfAnsicht: () => true,
    // Inhaberzeile (Rundgang 26.10., #44): eigener Baustein, hier nur ihr Platz und ihre Abrufe.
    inhaberZeile: block('Inhaberzeile'), nebenbereichZusatz: () => ' · 2 offene Anfragen', shopwache: { daten: null },
  });
  return { html: api.viewHeute(), geladen, bloecke };
}

test('Shop ist Standard und Waren stehen vor Mustern, danach Aufraeumen und vorhandene Nacharbeit', () => {
  const r = start('', { benutzer: { name: 'Test', rolle: 'mitarbeiter' } });
  assert.match(r.html, /Shop-Übersicht/);
  assert.deepEqual(r.bloecke, ['Waren', 'Muster', 'Aufräumen', 'Nacharbeit']);
  for (const name of ['KundenBestellungen', 'EinkaufAuftragsstatus', 'EinkaufBestellungen', 'MusterPacken']) assert.ok(r.geladen.includes(name));
  for (const name of ['KundenRueckrufe', 'KundenFaelle', 'HeuteAufgaben', 'LadenZahlen', 'ShopifyAbgleich', 'EinkaufKennzahlen', 'Shopwache', 'Akquise', 'Belege']) assert.ok(!r.geladen.includes(name), `${name} gehoert nicht zum Standardabruf`);
  // Die Service-Anfragen kommen fuer die Zahl an "Weitere Bereiche" mit (#44).
  assert.ok(r.geladen.includes('Serviceanfragen'));
  assert.match(r.html, /Weitere Bereiche: Laden, Aufgaben und Technik · 2 offene Anfragen<\/summary>/);
});

test('Inhaber: eine Zeile mit Shop, Umsatz, Entscheidungen und Frist direkt unter den Warenbestellungen (#44)', () => {
  const r = start();
  assert.deepEqual(r.bloecke, ['Waren', 'Inhaberzeile', 'Muster', 'Aufräumen', 'Nacharbeit'], 'Warenkunden bleiben zuerst');
  for (const name of ['EinkaufKennzahlen', 'Shopwache']) assert.ok(r.geladen.includes(name), `${name} fuer die Inhaberzeile`);
  for (const name of ['KundenRueckrufe', 'KundenFaelle', 'HeuteAufgaben', 'LadenZahlen', 'ShopifyAbgleich', 'Akquise', 'Belege']) assert.ok(!r.geladen.includes(name), `${name} gehoert nicht zum Standardabruf`);
  assert.doesNotMatch(r.html, /Kennzahlen der letzten/, 'Kennzahlen-Kacheln erst auf Klick');
});

test('alte Alltagssichten bleiben ausdruecklich erreichbar; unbekannte Sicht bleibt Shop', () => {
  for (const sicht of ['laden', 'website', 'alles', 'inhaber']) assert.equal(start(`sicht=${sicht}`).html, 'Expliziter Alltag');
  assert.match(start('sicht=unbekannt').html, /Shop-Übersicht/);
});

test('mn=1 oeffnet den bestehenden Nachfassblock im Shop ohne allgemeine Aufgabenabrufe', () => {
  const r = start('mn=1');
  assert.deepEqual(r.bloecke, ['Waren', 'Inhaberzeile', 'Muster', 'Aufräumen', 'Nacharbeit', 'Vorhandener Nachfassblock']);
  assert.ok(!r.geladen.includes('HeuteAufgaben'));
});
