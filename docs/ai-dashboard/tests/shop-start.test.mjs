import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { problemeBlock, problemOrderIds, rotMuster } from '../ansichten/heute/probleme.mjs';
import { aufraeumenBlock, aufraeumenUnterProblem } from '../ansichten/heute/aufraeumen.mjs';
import { arbeitsquellenStand } from '../lib/arbeitsquellen.mjs';
import { selbstAbschickenStand, selbstAbschickenBlock } from '../ansichten/heute/selbst-abschicken.mjs';
import { rausgebenOhne } from '../lib/todos.mjs';
import { lieferantName as lieferantAnzeige } from '../lib/einkauf-lieferanten.mjs';

const quelle = fs.readFileSync(new URL('../ansichten/heute.mjs', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace(/^export\s/gm, '');
function start(query = '', session = {}, { todos = [], abgleich = null, bestellungen = undefined, auftragsstatus = undefined, echtesAufraeumen = false, heuteDaten = {} } = {}) {
  const geladen = [], bloecke = [], sichten = [], waren = {};
  const rolle = session.benutzer?.rolle || 'inhaber';
  // Spiegel von ANSICHT_ROLLEN (kern/router.mjs): Shop-Kontrolle, Technik und Genossenschaften nur beim Inhaber.
  const darfAnsicht = name => rolle === 'inhaber' || !['shopwache', 'arbeit', 'akquise', 'insights'].includes(name);
  const ensure = ['KundenBestellungen', 'EinkaufAuftragsstatus', 'EinkaufBestellungen', 'HeuteLieferanten',
    'MusterPacken', 'MusterAnrufe', 'Aktualisierung', 'HeuteMusterTexte', 'KundenRueckrufe', 'KundenFaelle', 'Serviceanfragen',
    'HeuteAufgaben', 'LadenZahlen', 'ShopifyAbgleich', 'EinkaufKennzahlen', 'Shopwache', 'Akquise', 'Belege'];
  const kontext = Object.fromEntries(ensure.map(n => [`ensure${n}`, () => geladen.push(n)]));
  const state = { route: { view: 'heute', params: new URLSearchParams(query) }, session, tasks: [] };
  const block = name => () => { bloecke.push(name); return `<div>${name}</div>`; };
  const api = vm.runInNewContext(quelle + '\ndatenstandZeile=()=>"Datenstand"; viewAlltag=()=>"Expliziter Alltag"; ({viewHeute})', {
    ...kontext, state, einkauf: { auftragsstatus }, kunden: { bestellungen }, heuteDaten, lieferantAnzeige,
    // "Von uns abschicken" (#1995): die echten, reinen Funktionen - ohne Bestellstand kein Block.
    selbstAbschickenStand, selbstAbschickenBlock, rausgebenOhne,
    musterNachfassenStand: () => ({ offen: [], erledigt: [], abgemeldet: [] }),
    versandLaeuft: () => null, startBestellarbeit: () => ({}),
    musterAutomatikBlock: () => '',
    // Rundgang 06.11. (#1996): die Erfolge der Musterautomatik als Zeile im Hintergrund, die Anrufzahl im Musterblock.
    musterAutomatikZeile: () => '<div class="heute-hg-zeile">Musterautomatik</div>', musterAnrufeOffen: () => 24,
    warenbestellungenBlock: o => { Object.assign(waren, o); bloecke.push('Waren'); return '<div>Waren</div>'; }, bestellarbeitBlock: o => { bloecke.push('Muster'); return `<div>Muster</div><div>Anrufe ${o.anrufe}</div>`; },
    aufraeumenBlock: echtesAufraeumen ? aufraeumenBlock : block('Aufräumen'), shopNacharbeitBlock: block('Nacharbeit'),
    istNurLesend: () => false, darfAnsicht,
    // Rote To-dos oben (w-206): echte problemeBlock, die Ableitung liefert die uebergebenen To-dos.
    problemeBlock, problemOrderIds, rotMuster, aufraeumenUnterProblem, arbeitsquellenStand, shopifyAbgleich: { daten: abgleich }, leiteTodosAb: (q, opt) => { sichten.push(opt.sicht); return todos; }, sortiereTodos: x => x,
    nachfassTodo: () => ({}), belegTodos: () => [], shopifyAbgleichTodos: () => [], datenstandTodo: () => [], veralteteQuellen: () => [],
    belege: { daten: null }, akquiseFaellig: () => [], hausverwaltungenFaellig: () => [], hinweisText: x => x, sichtFuer: () => 'laden',
    esc: s => String(s ?? ''), alterText: t => `${t} Tage`,
    // Inhaberzeile (Rundgang 26.10., #44): eigener Baustein, hier nur ihr Platz und ihre Abrufe.
    // Restrollen-Zeile (2026-11-06): eigener Baustein mit eigenem Test (sonderposten-restrollen.test.mjs).
    restrollenZeile: () => '',
    warenkennzahlBlock: block('Warenkennzahl'), inhaberZeile: block('Inhaberzeile'), nebenbereichZusatz: () => ' · 2 offene Anfragen', shopwache: { daten: null },
  });
  return { html: api.viewHeute(), geladen, bloecke, sichten, waren };
}

test('Shop ist Standard und Waren stehen vor Mustern, danach Aufraeumen und vorhandene Nacharbeit', () => {
  const r = start('', { benutzer: { name: 'Test', rolle: 'mitarbeiter' } });
  assert.match(r.html, /Shop-Übersicht/);
  assert.deepEqual(r.bloecke, ['Waren', 'Muster', 'Aufräumen', 'Nacharbeit']);
  for (const name of ['KundenBestellungen', 'EinkaufAuftragsstatus', 'EinkaufBestellungen', 'MusterPacken']) assert.ok(r.geladen.includes(name));
  // Fuer die roten To-dos oben (w-206) kommen dieselben Quellen wie in der Gesamtübersicht mit.
  for (const name of ['KundenRueckrufe', 'ShopifyAbgleich', 'Belege']) assert.ok(r.geladen.includes(name), `${name} fuer die roten To-dos`);
  // Kundenfaelle und Team-Aufgaben gehoeren in den Nebenbereich - ihre To-dos stehen nie oben, also kein Abruf.
  for (const name of ['KundenFaelle', 'HeuteAufgaben', 'LadenZahlen', 'EinkaufKennzahlen', 'Shopwache', 'Akquise']) assert.ok(!r.geladen.includes(name), `${name} gehoert nicht zum Standardabruf eines Mitarbeiters`);
  // Die Service-Anfragen kommen fuer die Zahl an "Weitere Bereiche" mit (#44).
  assert.ok(r.geladen.includes('Serviceanfragen'));
  assert.match(r.html, /Weitere Bereiche: Laden, Aufgaben und Technik · 2 offene Anfragen<\/summary>/);
});

test('Inhaber: Warenkennzahl zuerst, dann Warenbestellungen, darunter die Inhaberzeile (#44, Prüfung 05.11.)', () => {
  const r = start();
  assert.deepEqual(r.bloecke, ['Warenkennzahl', 'Waren', 'Inhaberzeile', 'Muster', 'Aufräumen', 'Nacharbeit'], 'Warenkunden bleiben zuerst');
  for (const name of ['EinkaufKennzahlen', 'Shopwache']) assert.ok(r.geladen.includes(name), `${name} fuer die Inhaberzeile`);
  for (const name of ['KundenFaelle', 'HeuteAufgaben', 'LadenZahlen', 'Akquise']) assert.ok(!r.geladen.includes(name), `${name} gehoert nicht zum Standardabruf`);
  assert.doesNotMatch(r.html, /Kennzahlen der letzten/, 'Kennzahlen-Kacheln erst auf Klick');
});

test('rote To-dos stehen als "Probleme" unter den Warenbestellungen; gelbe nicht (w-206, Prüfung 05.11.)', () => {
  const todos = [
    { id: 'routinen', art: 'routinen', bereich: 'website', ton: 'crit', titel: 'Mac-Dienst gestört: Postfach', kontext: 'Fehler', alterTage: 1 },
    { id: 'entfernt', art: 'entfernt', bereich: 'laden', ton: 'crit', titel: 'Aus Bestellung entfernt: #T1 – Lieferantenbestellung stornieren?', kontext: 'Testkunde', alterTage: 3, knopf: { text: 'Abhaken…', abhaken: 'gid://1' } },
    { id: 'gelb', art: 'bestellen', bereich: 'laden', ton: 'warn', titel: 'Bestellen: Ware bei Lieferant A', kontext: 'Testkunde', alterTage: 3, knopf: { text: 'Bestellen', href: '#/einkauf' } },
    { id: 'anfrage', art: 'service', bereich: 'laden', ton: 'crit', titel: 'Bei Testkundin melden: neue Anfrage Treppe', kontext: 'Formular', alterTage: 13, knopf: { text: 'Anfrage öffnen', href: '#/kunden?tab=service' } },
  ];
  const r = start('', {}, { todos });
  assert.match(r.html, /Probleme · 2</);
  assert.ok(r.html.indexOf('<div>Waren</div>') < r.html.indexOf('heute-probleme'), 'erst die Warenkunden, dann die Probleme');
  assert.match(r.html, /data-todo="routinen"/); assert.match(r.html, /data-todo="entfernt"/);
  assert.doesNotMatch(r.html, /data-todo="bestellen"/, 'gelb bleibt hinter "Weitere Bereiche"');
  assert.doesNotMatch(r.html, /data-todo="service"/, 'Laden-Anfragen bleiben im Nebenbereich (Inhaber 22.10.)');
  assert.match(r.html, /data-entfernt-abhaken="gid:\/\/1"/, 'derselbe Knopf wie in der Arbeitsliste');
  assert.deepEqual(r.bloecke, ['Warenkennzahl', 'Waren', 'Inhaberzeile', 'Muster', 'Aufräumen', 'Nacharbeit'], 'die uebrige Reihenfolge bleibt');
  assert.deepEqual(r.sichten, ['alles'], 'der Inhaber sieht alles Rote, egal bei wem es liegt');
  // Mitarbeiter: eigene Sicht "laden" - Website und Technik gehoeren nicht auf seine Liste (21.10.).
  const m = start('', { benutzer: { name: 'Test', rolle: 'mitarbeiter' } }, { todos: [todos[1]] });
  assert.deepEqual(m.sichten, ['laden']);
  assert.match(m.html, /Probleme · 1</);
  assert.ok(!m.geladen.includes('Shopwache'), 'Shop-Kontrolle sieht nur der Inhaber');
  // Ohne Rot kein Block - der Kopf der Startseite geht direkt in die Warenbestellungen ueber.
  assert.doesNotMatch(start('', {}, { todos: [todos[2]] }).html, /heute-probleme/);
});

test('alte Alltagssichten bleiben ausdruecklich erreichbar; unbekannte Sicht bleibt Shop', () => {
  for (const sicht of ['laden', 'website', 'alles', 'inhaber']) assert.equal(start(`sicht=${sicht}`).html, 'Expliziter Alltag');
  assert.match(start('sicht=unbekannt').html, /Shop-Übersicht/);
});

// w-284 (07.11.2026): die Nachfrage-Mails stehen unter Kunden › Kunden nach Produkt fragen. Heute zeichnet
// die Karte nicht mehr - alte Links #/heute?mn=1 leitet der Router um (tests/nachfrage-mails-umzug.test.mjs).
test('mn=1 zeichnet auf Heute keinen Nachfassblock mehr (Shop und Alltagssicht)', () => {
  const r = start('mn=1');
  assert.deepEqual(r.bloecke, ['Warenkennzahl', 'Waren', 'Inhaberzeile', 'Muster', 'Aufräumen', 'Nacharbeit']);
  assert.ok(!r.geladen.includes('HeuteAufgaben'));
  assert.doesNotMatch(quelle, /musterNachfassenBlock|Muster-Nachfragen<\/span>/, 'weder Karte noch Hintergrundzeile auf Heute');
});

test('w-222: gescheiterter Abgleich mit Shopify steht auf der Shop-Übersicht, gerade ladender nicht', () => {
  const kaputt = start('', {}, { abgleich: { fehler: true } });
  assert.match(kaputt.html, /Liste unvollständig:<\/b> Abgleich mit Shopify konnte nicht geladen werden/);
  assert.ok(kaputt.html.indexOf('<div>Waren</div>') < kaputt.html.indexOf('heute-probleme'), 'dort, wo sonst die Probleme stehen');
  assert.doesNotMatch(start('', {}, { abgleich: null }).html, /heute-probleme/, 'Laden ist kein Fehler');
  assert.doesNotMatch(start('', {}, { abgleich: { verfuegbar: true, abweichungen: [] } }).html, /heute-probleme/);
});

// Erfundene Testdaten (#1995): eine Bestellung mit einer Position aus eigenem Lager und einer, die bei uns liegt.
const TEST_BESTELLUNGEN = { verfuegbar: true, zeilen: [{
  orderId: 'gid://test/Order/1', orderName: '#TEST-1', kundenname: 'Testkunde', offen: true, datum: '2026-11-01T09:00:00Z',
  positionsstatus: { l1: null, u1: { status: 'geliefert', geliefertAm: '2026-11-05T09:00:00Z' } },
  auftrag: { positionen: [
    { lineItemId: 'l1', titel: 'Testunterlage', farbe: 'grau', kundenmenge: '6 m²', sku: 'TEST-LAGER-1', lagerware: true, lagerHinweis: 'Rolle hinten links' },
    { lineItemId: 'u1', titel: 'Testboden', farbe: 'beige', kundenmenge: '12 m²', sku: 'TEST-WARE-1', route: 'SUPPLIER_TO_TP' },
  ] },
}] };

test('Von uns abschicken (#1995): direkt unter den Warenbestellungen, nur mit Arbeit, rausgeben-To-do nicht doppelt', () => {
  // Wie lib/todos.mjs sie baut: je eingetroffener Position ein Teil (rausgebenOhne nimmt die gezeigten heraus).
  const rausgeben = (nr, teile) => ({ id: `rausgeben:gid://test/Order/${nr}`, art: 'rausgeben', bereich: 'laden', ton: 'crit', titel: `Ware ist da – rausgeben: #TEST-${nr}`, alterTage: 6,
    schluessel: teile.map(t => t.schluessel), rausgeben: { kunde: 'Testkunde', orderName: `#TEST-${nr}`, teile, lagermuster: null } });
  const todos = [
    rausgeben(1, [{ schluessel: 'gid://test/Order/1::u1', istMuster: false, text: 'Testboden', tage: 6 }]),
    rausgeben(2, [{ schluessel: 'gid://test/Order/2::x1', istMuster: false, text: 'Anderer Testboden', tage: 6 }]),
  ];
  const r = start('', {}, { todos, bestellungen: TEST_BESTELLUNGEN });
  assert.match(r.html, /Von uns abschicken · 2</);
  const waren = r.html.indexOf('<div>Waren</div>');
  const block = r.html.indexOf('heuteSelbstAbschicken');
  assert.ok(waren < block && block < r.html.indexOf('heute-probleme'), 'unter den Warenbestellungen, vor den Problemen');
  assert.match(r.html, /noch zuschneiden/); assert.match(r.html, /eingetroffen – noch packen/);
  assert.match(r.html, /Rolle hinten links/, 'Hinweis aus der Regeldatei');
  assert.match(r.html, /data-selbst="zugeschnitten"/); assert.match(r.html, /data-selbst="gepackt"/);
  assert.match(r.html, /data-af-set data-af-status="raus"/, '"Verschickt…" oeffnet den vorhandenen Versand-Dialog');
  assert.doesNotMatch(r.html, /#TEST-1<\/div>|rausgeben: #TEST-1/, 'das To-do zu derselben Position steht nicht ein zweites Mal');
  assert.match(r.html, /rausgeben: #TEST-2/, 'ein To-do zu anderer Ware bleibt');
  // E7: gemischt (Ware im Block, Muster nicht) - das To-do bleibt nur fuer das Muster, die Ware steht einmal.
  const gemischt = start('', {}, { todos: [rausgeben(1, [{ schluessel: 'gid://test/Order/1::u1', istMuster: false, text: 'Testboden', tage: 6 },
    { schluessel: 'gid://test/Order/1::m1', istMuster: true, text: 'Muster grau', tage: 6 }])], bestellungen: TEST_BESTELLUNGEN });
  assert.match(gemischt.html, /Muster ist da – an Testkunde rausgeben/);
  assert.doesNotMatch(gemischt.html, /Ware ist da – rausgeben: #TEST-1/);
  // Frisch geladener Stand (nach einem Klick) gewinnt vor dem mitgelieferten Positionsstand.
  const nach = start('', {}, { bestellungen: TEST_BESTELLUNGEN, auftragsstatus: { positionen: {
    'gid://test/Order/1::l1': { status: 'raus' }, 'gid://test/Order/1::u1': { status: 'raus' } } } });
  assert.doesNotMatch(nach.html, /heuteSelbstAbschicken/, 'ohne Arbeit kein Block');
  // Beschaedigte Regeldatei: nie still - der Block meldet es auch ohne Zeilen.
  const kaputt = start('', {}, { bestellungen: { verfuegbar: true, zeilen: [], lagerwareFehler: 'lagerware.json ist beschädigt.' } });
  assert.match(kaputt.html, /notice crit[^>]*>lagerware\.json ist beschädigt\./);
});

test('Musterautomatik als ruhige Zeile im Hintergrund, Anrufzahl im Musterblock (#1996)', () => {
  const r = start();
  const hg = r.html.slice(r.html.indexOf('class="heute-hintergrund"'));
  assert.match(hg, /Musterautomatik/, 'die Zeile steht unter "Im Hintergrund"');
  assert.ok(r.html.indexOf('Musterautomatik') > r.html.indexOf('<div>Muster</div>'), 'nach Muster & Packstation, nicht davor');
  assert.match(r.html, /<div>Anrufe 24<\/div>/, 'dieselbe Zahl wie am Menuepunkt');
});

// Erfunden (#1996): eine Musterbestellung, die 17 Tage beim Lieferanten liegt - rot "nachfragen" UND Aufraeumfall.
test('Eine Bestellung einmal: rot unter Probleme mit Abschließen/Läuft noch, nicht noch einmal unter Aufräumen', () => {
  const fallVon = (id, name, tage) => ({ orderId: id, orderName: name, kundenname: 'Testkunde', offen: true, datum: '2026-10-19T09:00:00Z',
    aufraeumen: { art: 'muster', grund: 'ruhe', tage, belege: [], vorschlag: { text: 'Testvorschlag', notiz: null }, lineItemIds: [`${id}-1`] } });
  const bestellungen = { verfuegbar: true, zeilen: [fallVon('gid://test/Order/49', '#TEST-49', 17), fallVon('gid://test/Order/50', '#TEST-50', 15)] };
  const todos = [{ id: 'nachhaken:A', orderIds: ['gid://test/Order/49'], art: 'nachhaken', bereich: 'laden', ton: 'crit', titel: 'Beim Lieferanten nachfragen: Muster bestellt, noch nicht da', kontext: 'Testkunde', alterTage: 17, knopf: { text: 'Nachfragen', href: '#/einkauf?ab=verzug' } }];
  const r = start('', {}, { todos, bestellungen, echtesAufraeumen: true });
  const probleme = r.html.slice(r.html.indexOf('heute-probleme'), r.html.indexOf('</section>', r.html.indexOf('heute-probleme')));
  assert.match(probleme, /data-todo="nachhaken"[\s\S]*data-aufraeumen-abschliessen="gid:\/\/test\/Order\/49"[\s\S]*data-aufraeumen-laeuft="gid:\/\/test\/Order\/49"/);
  assert.match(r.html, /Alte Bestellungen aufräumen · 1</, 'nur noch die andere Bestellung');
  assert.equal((r.html.match(/data-aufraeumen="gid:\/\/test\/Order\/49"/g) || []).length, 1, '#TEST-49 steht einmal');
  assert.match(r.html, /data-aufraeumen="gid:\/\/test\/Order\/50"/);
  // Gelb steht nicht unter Probleme: dann bleibt der Fall im Aufraeumen-Block.
  const gelb = start('', {}, { todos: [{ ...todos[0], ton: 'warn' }], bestellungen, echtesAufraeumen: true });
  assert.match(gelb.html, /Alte Bestellungen aufräumen · 2</, 'gelb steht nicht unter Probleme, also bleibt der Fall im Block');
});

test('Warenbestellungen bekommen die Lieferantennamen der Seite - der Teilstand-Satz wie in "Je Auftrag" (#1996)', () => {
  const r = start('', {}, { heuteDaten: { lieferanten: { lieferanten: [{ id: 'A', name: 'Testlieferant' }] } } });
  assert.equal(typeof r.waren.lieferantName, 'function');
  assert.equal(r.waren.lieferantName('A'), 'Testlieferant');
  assert.equal(r.waren.lieferantName('B'), 'Lieferant B', 'ohne Stammdaten der neutrale Ersatz');
});
