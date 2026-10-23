import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const quelltext = pfad => fs.readFileSync(new URL(`../${pfad}`, import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
const leer = () => ({ verfuegbar: true, eintraege: [], gruppen: [], team: [], anzahl: 0 });
const mitAufgabe = () => ({ ...leer(), anzahl: 1, eintraege: [{ id: 'test-1', titel: 'Synthetische Aufgabe', typ: 'TASK', status: 'INBOX', prioritaet: 'NORMAL' }] });

function aufgaben() {
  const config = { jetzt: 1000, antwort: leer(), render: null, aktiv: null, felder: [], dialogOffen: false };
  const reads = [], writes = [];
  const state = { capabilities: { mode: 'local' }, route: { view: 'organisation', params: new URLSearchParams() } };
  const text = [quelltext('bausteine/karten.mjs'), quelltext('ansichten/organisation/gemeinsam.mjs'), quelltext('ansichten/organisation.mjs')].join('\n');
  const api = vm.runInNewContext(text + '\n({ org, ensureOrgListe, ensureOrgDaten, ensureOrgDetail, orgFrisch, viewOrganisation, orgKlickZuruecksetzen })', {
    state, URLSearchParams,
    document: {
      body: {}, get activeElement() { return config.aktiv; },
      querySelector: () => config.dialogOffen ? {} : null,
      querySelectorAll: () => config.felder,
    },
    Date: class extends Date { static now() { return config.jetzt; } },
    esc: v => String(v ?? ''), fmtDate: v => String(v), fmtDateTime: v => String(v), istNurLesend: () => false,
    fetchEinkauf: async pfad => { reads.push(pfad); return typeof config.antwort === 'function' ? config.antwort(pfad) : config.antwort; },
    orgSchreiben: async (...args) => { writes.push(args); throw new Error('Kein Schreiben im Lesetest'); },
    render() { config.render?.(); },
  });
  return { ...api, config, state, reads, writes };
}

test('Aufgabenfehler ist keine leere Liste; gezielter Retry erhaelt Filter und schreibt nichts', async () => {
  const u = aufgaben();
  u.state.route.params.set('oq', 'Testsuche');
  u.config.antwort = { verfuegbar: false, fehler: true, hinweis: 'Testserver nicht erreichbar' };
  assert.match(u.viewOrganisation(), /Lade/);
  await tick();
  const html = u.viewOrganisation();
  assert.match(html, /Testserver nicht erreichbar/);
  assert.match(html, /data-org-neuladen/);
  assert.ok(!/Noch nichts erfasst|Nichts offen|Nichts vorhanden/.test(html));
  assert.ok(!html.includes('data-action="reload"'));
  assert.equal(u.reads.length, 1, 'Fehlerrendern darf keine Abrufschleife ausloesen');
  u.config.antwort = leer();
  assert.equal(u.orgKlickZuruecksetzen({ target: { closest: s => s === '[data-org-neuladen]' ? {} : null }, preventDefault() {} }), true);
  await tick();
  assert.match(u.reads[1], /q=Testsuche/);
  assert.equal(u.org.listeFehler, null);
  assert.equal(u.writes.length, 0);
});

test('TTL und stiller Hook aktualisieren neue Aufgaben; Lesefehler behalten denselben gueltigen Stand', async () => {
  const u = aufgaben(); u.config.antwort = mitAufgabe();
  await u.ensureOrgListe();
  const vorher = u.org.liste;
  u.config.jetzt += 29_999;
  await u.ensureOrgDaten();
  assert.equal(u.reads.length, 1);
  u.config.jetzt += 1;
  u.config.antwort = { verfuegbar: false, fehler: true, hinweis: 'Testfehler' };
  await u.ensureOrgDaten();
  assert.equal(u.org.liste, vorher);
  const html = u.viewOrganisation();
  assert.match(html, /Synthetische Aufgabe/);
  assert.match(html, /letzte geladene Stand/);
  assert.match(html, /Testfehler/);
  assert.equal(u.reads.length, 2);
  u.config.jetzt += 30_000;
  u.config.antwort = { ...mitAufgabe(), eintraege: [{ ...mitAufgabe().eintraege[0], titel: 'Neue Teamaufgabe' }] };
  await u.ensureOrgDaten();
  assert.match(u.viewOrganisation(), /Neue Teamaufgabe/);
  assert.equal(u.org.listeFehler, null);
});

test('Filterwechsel zeigt keine alten Fremdtreffer und spaete Antworten ueberschreiben keine neue Suche', async () => {
  const u = aufgaben(); u.config.antwort = mitAufgabe(); await u.ensureOrgListe();
  let erste;
  u.config.antwort = () => new Promise(resolve => { erste = resolve; });
  u.state.route.params.set('oq', 'alt');
  const lauf = u.ensureOrgListe();
  assert.equal(u.org.liste, null);
  u.state.route.params.set('oq', 'neu'); u.config.antwort = leer();
  await u.ensureOrgListe();
  erste(mitAufgabe()); await lauf;
  assert.equal(u.org.liste.eintraege.length, 0);
  assert.match(u.org.key, /neu$/);
});

test('lange Ladezeit und fehlgeschlagener Abruf verursachen keine Render-Abrufschleife', async () => {
  const u = aufgaben(); let fertig;
  u.config.antwort = () => new Promise(resolve => { fertig = resolve; });
  const lauf = u.ensureOrgListe();
  u.config.render = () => u.viewOrganisation();
  u.config.jetzt += 50_000;
  u.viewOrganisation();
  assert.equal(u.reads.length, 1);
  fertig({ verfuegbar: false, hinweis: 'Nicht lesbar' }); await lauf;
  assert.equal(u.reads.length, 1);
  assert.match(u.viewOrganisation(), /Nicht lesbar/);
});

test('stiller Hook laesst andere Ansichten und offene Detailformulare unangetastet', async () => {
  const u = aufgaben();
  u.state.route.view = 'kunden'; await u.ensureOrgDaten();
  u.state.route.view = 'organisation'; u.state.route.params.set('oid', 'test-1'); await u.ensureOrgDaten();
  assert.equal(u.reads.length, 0);
});

test('Detail-Lesefehler behauptet nicht nicht gefunden und besitzt gezielten Wiederholungsweg', async () => {
  const u = aufgaben();
  u.state.route.params.set('oid', 'test-1');
  u.config.antwort = { verfuegbar: false, fehler: true, hinweis: 'Detail-Testfehler' };
  u.viewOrganisation(); await tick();
  const html = u.viewOrganisation();
  assert.match(html, /Detail-Testfehler/);
  assert.match(html, /data-org-neuladen/);
  assert.ok(!html.includes('Nicht gefunden.'));
  const vorher = u.reads.length;
  u.orgKlickZuruecksetzen({ target: { closest: s => s === '[data-org-neuladen]' ? {} : null }, preventDefault() {} });
  await tick();
  assert.equal(u.reads.length, vorher + 1);
  assert.match(u.reads.at(-1), /\/api\/org\/eintrag\?id=test-1/);
});

test('wartende Kunden bleiben auch ohne aktive Faelle sichtbar, inklusive direktem Bestellweg', () => {
  const kunden = { faelle: { verfuegbar: true, faelle: [], ausgeblendet: [], wartend: 3 }, loadingFaelle: false };
  const view = vm.runInNewContext(quelltext('bausteine/karten.mjs') + '\n' + quelltext('ansichten/kunden/faelle.mjs') + '\nviewKundenFaelle', {
    kunden, state: { route: { params: new URLSearchParams() } }, esc: v => String(v ?? ''),
  });
  const html = view();
  assert.match(html, /3 Kunden warten/);
  assert.match(html, /href="#\/kunden\?tab=bestellungen"/);
  assert.ok(!html.includes('Nichts offen.'));
  kunden.faelle.wartend = 0;
  assert.match(view(), /Nichts offen/);
  kunden.faelle = { verfuegbar: false, fehler: true, hinweis: 'Testfehler' };
  assert.match(view(), /konnten nicht geladen werden/);
  assert.ok(!view().includes('Nichts offen'));
});


test('laufender Listenabruf aktualisiert Cache, rendert aber keinen inzwischen geoeffneten Detailkontext', async () => {
  const u = aufgaben(); let fertig; let renders = 0;
  u.config.render = () => { renders++; };
  u.config.antwort = () => new Promise(resolve => { fertig = resolve; });
  const lauf = u.ensureOrgListe();
  u.state.route.params.set('oid', 'test-1');
  u.config.aktiv = { matches: () => true, value: 'Ungespeicherter Titel' };
  const antwort = mitAufgabe(); fertig(antwort); await lauf;
  assert.equal(u.org.liste, antwort);
  assert.equal(u.org.loading, false);
  assert.equal(renders, 0, 'Listenantwort darf das Detail mit neu getipptem Titel nicht ersetzen');
  assert.equal(u.config.aktiv.value, 'Ungespeicherter Titel');
});

test('Listenabruf prueft nach dem await erneut aktive Eingaben, offene Dialoge und ungespeicherte Felder', async () => {
  const faelle = [
    { aktiv: { matches: () => true } },
    { dialogOffen: true },
    { felder: [{ tagName: 'TEXTAREA', value: 'Neu', defaultValue: 'Alt' }] },
    { felder: [{ tagName: 'INPUT', type: 'checkbox', checked: true, defaultChecked: false }] },
    { felder: [{ tagName: 'SELECT', options: [{ selected: true, defaultSelected: false }] }] },
  ];
  for (const eingabe of faelle) {
    const u = aufgaben(); let fertig; let renders = 0;
    u.config.render = () => { renders++; };
    u.config.antwort = () => new Promise(resolve => { fertig = resolve; });
    const lauf = u.ensureOrgListe();
    Object.assign(u.config, eingabe);
    const antwort = mitAufgabe(); fertig(antwort); await lauf;
    assert.equal(u.org.liste, antwort);
    assert.equal(renders, 0);
  }
});

test('Listenantwort rendert nur den weiterhin passenden sauberen Listenkontext', async () => {
  for (const geaendert of [false, true]) {
    const u = aufgaben(); let fertig; let renders = 0;
    u.config.render = () => { renders++; };
    u.config.antwort = () => new Promise(resolve => { fertig = resolve; });
    const lauf = u.ensureOrgListe();
    if (geaendert) u.state.route.params.set('oq', 'Andere Suche');
    u.config.felder = [{ tagName: 'TEXTAREA', value: 'Unveraendert', defaultValue: 'Unveraendert' }];
    fertig(mitAufgabe()); await lauf;
    assert.equal(renders, geaendert ? 0 : 1);
  }
});
