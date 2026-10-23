import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { arbeitsFingerabdruck, exportFingerabdruck, erzeugeArbeitsabgleich } from '../lib/arbeitsdaten.mjs';

const status = (kennung = 'lokal1', exportAm = '2026-10-22T10:00:00Z') => ({ verfuegbar: true,
  teile: { bestellungen: { zeitpunkt: exportAm } }, arbeitsstand: { verfuegbar: true, kennung } });
function spaeter() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function umgebung() {
  const u = { stand: status(), frei: true, route: 'packen', anfragen: [], fehler: [], metadaten: [], render: 0, invalidiert: 0 };
  const pfade = ['/api/einkauf/auftragsstatus', '/api/einkauf/bestellungen', '/api/kunden/bestellungen',
    '/api/kunden/muster-packen', '/api/einkauf/belege', '/api/einkauf/shopify-abgleich'];
  u.speicher = pfade.map((pfad, i) => ({ pfad, gruppe: i < 4 ? 'bestellarbeit' : pfad,
    daten: { verfuegbar: true, stand: 'alt' }, laedt: false, bezug: 'eins' }));
  u.antwort = async pfad => ({ verfuegbar: true, stand: `neu:${pfad}` });
  u.pruefe = erzeugeArbeitsabgleich({
    holen: async pfad => { u.anfragen.push(pfad); return pfad === '/api/aktualisierung/status' ? u.statusAntwort?.() || u.stand : u.antwort(pfad); },
    quellen: () => u.speicher.map(s => ({ pfad: s.pfad, gruppe: s.gruppe, lesen: () => s.daten,
      setzen: d => { s.daten = d; }, laedt: () => s.laedt, bezug: () => s.bezug })),
    darfAktualisieren: () => u.frei, kontext: () => u.route,
    statusUebernehmen: s => u.metadaten.push(s),
    vorUebernahme: ({ exportGeaendert }) => { if (exportGeaendert) { u.invalidiert++; for (const s of u.speicher) s.daten = null; } },
    nachUebernahme: () => { u.render++; }, fehlerMelden: f => u.fehler.push(f),
  });
  return u;
}

test('Fingerabdruck erkennt lokale Aenderungen und behaelt Exportzeitpunkte als unabhaengiges Signal', () => {
  assert.equal(arbeitsFingerabdruck(status()), arbeitsFingerabdruck(status()));
  assert.notEqual(arbeitsFingerabdruck(status('lokal1')), arbeitsFingerabdruck(status('lokal2')));
  assert.notEqual(arbeitsFingerabdruck(status('lokal1')), arbeitsFingerabdruck(status('lokal1', '2026-10-22T11:00:00Z')));
  assert.notEqual(arbeitsFingerabdruck({ verfuegbar: false, arbeitsstand: { kennung: '1' } }), arbeitsFingerabdruck({ verfuegbar: false, arbeitsstand: { kennung: '2' } }));
  assert.equal(exportFingerabdruck({ ...status(), arbeitsstand: null }), exportFingerabdruck(status()));
});

test('geladene Arbeitsquellen werden gemeinsam ersetzt; unveraenderter Stand verursacht keine weiteren Datenabfragen', async () => {
  const u = umgebung();
  assert.equal(await u.pruefe(), true);
  assert.ok(u.speicher.every(s => s.daten.stand === `neu:${s.pfad}`));
  assert.equal(u.render, 1);
  const vorher = u.anfragen.length;
  assert.equal(await u.pruefe(), false);
  assert.equal(u.anfragen.length, vorher + 1, 'nur Metadaten lesen');
  u.stand = status('lokal2');
  assert.equal(await u.pruefe(), true);
  assert.equal(u.render, 2);
});

test('gleiche Quelle fuer Heute und Einkauf wird nur einmal geladen; unbesuchte Quellen bleiben unangetastet', async () => {
  const u = umgebung();
  u.speicher[1].pfad = u.speicher[0].pfad;
  u.speicher[2].daten = null;
  await u.pruefe();
  assert.equal(u.anfragen.filter(p => p === u.speicher[0].pfad).length, 1);
  assert.equal(u.anfragen.includes('/api/kunden/bestellungen'), false);
  assert.equal(u.speicher[2].daten, null);
});

test('defekter Packabruf behaelt die ganze Bestellgruppe und laesst unabhaengige Belege/Abgleich nachladen', async () => {
  const u = umgebung();
  await u.pruefe();
  const alte = u.speicher.map(s => s.daten);
  u.stand = status('lokal2');
  u.antwort = async pfad => pfad === '/api/kunden/muster-packen' ? { verfuegbar: false, fehler: true }
    : { verfuegbar: true, stand: 'teilweise-neu' };
  assert.equal(await u.pruefe(), false);
  assert.ok(u.speicher.slice(0, 4).every((s, i) => s.daten === alte[i]));
  assert.ok(u.speicher.slice(4).every(s => s.daten.stand === 'teilweise-neu'));
  assert.match(u.fehler.at(-1), /betroffene Bereiche bleibt der bisherige Stand erhalten/);
  assert.equal(u.render, 2);
  u.antwort = async () => ({ verfuegbar: true, stand: 'jetzt-vollstaendig' });
  assert.equal(await u.pruefe(), true);
  assert.ok(u.speicher.every(s => s.daten.stand === 'jetzt-vollstaendig'));
  assert.equal(u.fehler.at(-1), null);
});

test('defekte Belege verstecken keine neuen Bestellungen und sperren den spaeteren Versuch nicht', async () => {
  for (const ausfall of [{ verfuegbar: false }, { fehler: true }, null, new Error('Testfehler')]) {
    const u = umgebung();
    await u.pruefe();
    const alterBeleg = u.speicher[4].daten;
    u.stand = status('lokal2', '2026-10-22T11:00:00Z');
    u.antwort = async pfad => {
      if (pfad !== '/api/einkauf/belege') return { verfuegbar: true, stand: 'neue-bestellung' };
      if (ausfall instanceof Error) throw ausfall;
      return ausfall;
    };
    assert.equal(await u.pruefe(), false);
    assert.ok(u.speicher.slice(0, 4).every(s => s.daten.stand === 'neue-bestellung'));
    assert.equal(u.speicher[4].daten, alterBeleg);
    assert.equal(u.speicher[5].daten.stand, 'neue-bestellung');
    assert.equal(u.invalidiert, 0, 'Teilabruf leert keine alten Export-Caches');
    assert.ok(u.fehler.at(-1));
    u.antwort = async () => ({ verfuegbar: true, stand: 'jetzt-vollstaendig' });
    assert.equal(await u.pruefe(), true, 'die Teiluebernahme bestaetigt nicht den gesamten Fingerabdruck');
    assert.ok(u.speicher.every(s => s.daten.stand === 'jetzt-vollstaendig'));
    assert.equal(u.invalidiert, 1, 'vollstaendiger Nachholversuch invalidiert den neuen Export');
    assert.equal(u.fehler.at(-1), null);
  }
});

test('abgelehnter oder geworfener Abruf loescht keine Daten und entsperrt den naechsten Lauf', async () => {
  const u = umgebung();
  const alte = u.speicher.map(s => s.daten);
  u.antwort = async () => { throw new Error('Testverbindung unterbrochen'); };
  assert.equal(await u.pruefe(), false);
  assert.ok(u.speicher.every((s, i) => s.daten === alte[i]));
  u.antwort = async () => ({ verfuegbar: true });
  assert.equal(await u.pruefe(), true);
});

test('vor dem ersten Await beschaeftigt: kein Netzabruf und kein Neuzeichnen', async () => {
  const u = umgebung(); u.frei = false;
  assert.equal(await u.pruefe(), false);
  assert.deepEqual(u.anfragen, []);
  assert.equal(u.render, 0);
});

test('Tippen waehrend der Statusabfrage verwirft die Antwort ohne Status- oder Datenuebernahme', async () => {
  const u = umgebung(); const tor = spaeter();
  u.statusAntwort = () => tor.promise;
  const lauf = u.pruefe();
  u.frei = false;
  tor.resolve(status());
  assert.equal(await lauf, false);
  assert.equal(u.metadaten.length, 0);
  assert.equal(u.anfragen.length, 1);
  assert.equal(u.render, 0);
  u.frei = true; u.statusAntwort = null;
  assert.equal(await u.pruefe(), true);
});

test('Dialog oder Eingabe waehrend des Datenabrufs wird nach dem Await erneut geprueft', async () => {
  const u = umgebung(); const tor = spaeter();
  const alte = u.speicher.map(s => s.daten);
  u.antwort = () => tor.promise;
  const lauf = u.pruefe();
  await Promise.resolve(); await Promise.resolve();
  assert.ok(u.anfragen.length > 1);
  u.frei = false;
  tor.resolve({ verfuegbar: true, stand: 'darf-nicht-uebernommen-werden' });
  assert.equal(await lauf, false);
  assert.ok(u.speicher.every((s, i) => s.daten === alte[i]));
  assert.equal(u.render, 0);
  u.frei = true;
  assert.equal(await u.pruefe(), true, 'derselbe Stand bleibt nach Ende der Eingabe nachholbar');
});

test('Tabwechsel, neue Kundenauswahl oder zwischenzeitliche lokale Aenderung werden nicht ueberschrieben', async () => {
  for (const aendern of [u => { u.route = 'kundenakte'; }, u => { u.speicher[0].bezug = 'zwei'; },
    u => { u.speicher[0].daten = { verfuegbar: true, stand: 'manuell-neuer' }; }]) {
    const u = umgebung(); const tor = spaeter();
    u.antwort = () => tor.promise;
    const lauf = u.pruefe();
    await Promise.resolve(); await Promise.resolve();
    aendern(u);
    tor.resolve({ verfuegbar: true, stand: 'veraltet' });
    assert.equal(await lauf, false);
    assert.ok(u.speicher.every(s => s.daten.stand !== 'veraltet'));
  }
});

test('laufende ensure-Abfragen und parallele Timer laufen nicht gegen den Arbeitsabgleich', async () => {
  const u = umgebung(); u.speicher[0].laedt = true;
  assert.equal(await u.pruefe(), false);
  assert.equal(u.anfragen.length, 1);
  u.speicher[0].laedt = false;
  const tor = spaeter(); u.statusAntwort = () => tor.promise;
  const erster = u.pruefe();
  assert.equal(await u.pruefe(), false);
  assert.equal(u.anfragen.length, 2, 'zweiter Lauf holt nicht parallel denselben Status');
  tor.resolve(status());
  assert.equal(await erster, true);
});

test('Exportwechsel nutzt die bisherige Invalidierung erst nach sicheren vollstaendigen Antworten und stellt Arbeitsdaten sofort wieder her', async () => {
  const u = umgebung();
  await u.pruefe();
  u.stand = status('lokal1', '2026-10-22T11:00:00Z');
  u.antwort = async () => ({ verfuegbar: false });
  assert.equal(await u.pruefe(), false);
  assert.equal(u.invalidiert, 0);
  assert.ok(u.speicher.every(s => s.daten !== null));
  u.antwort = async () => ({ verfuegbar: true, stand: 'neuer-export' });
  assert.equal(await u.pruefe(), true);
  assert.equal(u.invalidiert, 1);
  assert.ok(u.speicher.every(s => s.daten.stand === 'neuer-export'));
});

test('Fehler im Statusendpunkt ist sichtbar und laesst bisherige Arbeitsdaten stehen', async () => {
  const u = umgebung(); u.stand = { fehler: true };
  const alte = u.speicher.map(s => s.daten);
  assert.equal(await u.pruefe(), false);
  assert.ok(u.fehler.at(-1));
  assert.ok(u.speicher.every((s, i) => s.daten === alte[i]));
  assert.equal(u.anfragen.length, 1);
});

test('Statfehler haelt lesbare Arbeitsgruppen nicht zurueck und bestaetigt keine vollstaendige Kennung', async () => {
  const u = umgebung();
  u.stand = { ...status(), arbeitsstand: { verfuegbar: false, kennung: null } };
  u.antwort = async pfad => pfad === '/api/einkauf/belege' ? { verfuegbar: false }
    : { verfuegbar: true, stand: 'trotz-statfehler-neu' };
  const alterBeleg = u.speicher[4].daten;
  assert.equal(await u.pruefe(), false);
  assert.ok(u.speicher.slice(0, 4).every(s => s.daten.stand === 'trotz-statfehler-neu'));
  assert.equal(u.speicher[4].daten, alterBeleg);
  assert.ok(u.fehler.at(-1));
  const vorher = u.anfragen.length;
  assert.equal(await u.pruefe(), false);
  assert.ok(u.anfragen.length > vorher + 1, 'Statfehler bleibt unabhaengig vom leeren Hash nachholbar');
  u.stand = status();
  u.antwort = async () => ({ verfuegbar: true, stand: 'wieder-vollstaendig' });
  assert.equal(await u.pruefe(), true);
  assert.equal(u.fehler.at(-1), null);
});

/** Echter Datenstand-Baustein mit nur den DOM-/Netz-Andockstellen als Attrappen. */
function datenstandUmgebung() {
  const u = { render: 0, anfragen: [], intervalle: [], ereignisse: new Map(), hinweis: {
    setAttribute() {}, removeAttribute() {}, innerHTML: '', hidden: true }, stand: status() };
  u.state = { capabilities: { mode: 'local' }, route: { view: 'heute', params: new URLSearchParams() }, session: {} };
  const alt = () => ({ verfuegbar: true, stand: 'alt' });
  u.einkauf = { auftragsstatus: alt(), bestellungen: alt(), lieferanten: alt() };
  u.kunden = { bestellungen: alt(), musterPacken: alt(), faelle: alt(), rueckrufe: alt(),
    detail: alt(), detailKey: 'test<&', loadingDetail: false, serviceanfragen: alt() };
  u.belege = { daten: alt(), geladenAm: 0 };
  u.shopifyAbgleich = { daten: alt(), am: 0 };
  u.heuteDaten = { lieferanten: alt(), lieferantenAm: 0, aufgaben: alt(), aufgabenAm: 0 };
  u.doc = { hidden: false, activeElement: null, body: {}, querySelector: () => null,
    querySelectorAll: () => [], addEventListener: (art, fn) => { u.ereignisse.set(art, fn); } };
  u.antwort = async () => ({ verfuegbar: true, stand: 'neu' });
  const quelltext = fs.readFileSync(new URL('../bausteine/datenstand.mjs', import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
  u.modul = vm.runInNewContext(quelltext + '\n({ pruefe, starteDatenstand, beschaeftigt })', {
    ...u, document: u.doc, URLSearchParams, erzeugeArbeitsabgleich,
    $: () => u.hinweis, esc: String, fmtDateTime: String, veralteteQuellen: () => [],
    hinweisSatz: () => '', quelleFuerSeite: () => null, DATENSTAND_LABEL: {}, vorText: String,
    fetchEinkauf: async pfad => { u.anfragen.push(pfad); return pfad === '/api/aktualisierung/status' ? u.stand : u.antwort(pfad); },
    verwirfDatenspeicher: () => assert.fail('ohne Exportwechsel keine Invalidierung'),
    render: () => { u.render++; },
    ensureOrgDaten: () => { u.orgAbrufe = (u.orgAbrufe || 0) + 1; },
    setInterval: (fn, ms) => { u.intervalle.push({ fn, ms }); },
  });
  return u;
}

test('echter Datenstand verdrahtet Kernquellen gemeinsam und schuetzt Beleg-/Abgleich-TTL nach Fehlern', async () => {
  const u = datenstandUmgebung();
  const alterBeleg = u.belege.daten;
  const alterAbgleich = u.shopifyAbgleich.daten;
  u.antwort = async pfad => ['/api/einkauf/belege', '/api/einkauf/shopify-abgleich'].includes(pfad)
    ? { verfuegbar: false } : { verfuegbar: true, stand: 'neu' };
  assert.equal(await u.modul.pruefe(), false);
  for (const d of [u.einkauf.bestellungen, u.einkauf.auftragsstatus, u.kunden.bestellungen,
    u.kunden.musterPacken, u.kunden.faelle, u.kunden.rueckrufe, u.kunden.detail, u.einkauf.lieferanten,
    u.heuteDaten.lieferanten, u.heuteDaten.aufgaben, u.kunden.serviceanfragen]) assert.equal(d.stand, 'neu');
  assert.equal(u.belege.daten, alterBeleg);
  assert.equal(u.shopifyAbgleich.daten, alterAbgleich);
  assert.ok(Date.now() - u.belege.geladenAm < 1000, 'ensureBelege laedt beim Rendern nicht sofort denselben Fehler nach');
  assert.ok(Date.now() - u.shopifyAbgleich.am < 1000, 'ensureShopifyAbgleich laedt beim Rendern nicht sofort denselben Fehler nach');
  assert.equal(u.anfragen.filter(p => p === '/api/einkauf/lieferanten').length, 1);
  assert.ok(u.anfragen.includes(`/api/kunden/detail?${new URLSearchParams({ key: 'test<&' })}`));
  assert.ok(u.anfragen.includes(`/api/org/liste?${new URLSearchParams({ bereich: 'alle-aufgaben', ansicht: 'offen', gruppe: 'alles' })}`));
  assert.ok(u.anfragen.includes('/api/kunden/serviceanfragen'));
  assert.match(u.hinweis.innerHTML, /Nicht aktuell/);
  assert.equal(u.render, 1);

  u.stand = status('lokal2');
  const kernAlt = [u.einkauf.bestellungen, u.einkauf.auftragsstatus, u.kunden.bestellungen, u.kunden.musterPacken];
  u.antwort = async pfad => pfad === '/api/einkauf/auftragsstatus' ? { fehler: true }
    : { verfuegbar: true, stand: 'noch-neuer' };
  assert.equal(await u.modul.pruefe(), false);
  assert.deepEqual([u.einkauf.bestellungen, u.einkauf.auftragsstatus, u.kunden.bestellungen, u.kunden.musterPacken], kernAlt);
  assert.equal(u.belege.daten.stand, 'noch-neuer');
  assert.equal(u.shopifyAbgleich.daten.stand, 'noch-neuer');
});

test('echter Datenstand verwendet einen 30-Sekunden-Takt und Tab-Rueckkehr mit Eingabeschutz', async () => {
  const u = datenstandUmgebung();
  u.modul.starteDatenstand();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(u.intervalle.map(t => t.ms), [30_000]);
  const anfragen = u.anfragen.length;
  const orgAbrufe = u.orgAbrufe;
  u.doc.hidden = true;
  await u.intervalle[0].fn();
  u.ereignisse.get('visibilitychange')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(u.anfragen.length, anfragen);
  u.doc.hidden = false;
  u.doc.activeElement = { matches: () => true };
  u.ereignisse.get('visibilitychange')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(u.anfragen.length, anfragen, 'Fokus im Eingabefeld verhindert den Rueckkehrabruf');
  assert.equal(u.orgAbrufe, orgAbrufe, 'Aufgaben bleiben bei verborgenem Tab und waehrend Eingaben ebenfalls geschuetzt');
  u.doc.activeElement = null;
  u.ereignisse.get('visibilitychange')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(u.anfragen.length, anfragen + 1, 'Tab-Rueckkehr fragt denselben Leselauf ab');
  assert.equal(u.orgAbrufe, orgAbrufe + 1, 'Aufgaben werden auch bei gleicher Arbeitsrevision geprueft');
});

test('bestehende Beleg-/Abgleich-Nachlader bewahren verfuegbare Daten bei Fehlern und begrenzen Wiederholungen', async () => {
  for (const [datei, objekt, ensure, zeit] of [['belege', 'belege', 'ensureBelege', 'geladenAm'],
    ['shopify-abgleich', 'shopifyAbgleich', 'ensureShopifyAbgleich', 'am']]) {
    const quelle = fs.readFileSync(new URL(`../ansichten/einkauf/${datei}.mjs`, import.meta.url), 'utf8')
      .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
    const u = { anfragen: 0, antwort: { verfuegbar: false, fehler: true } };
    const api = vm.runInNewContext(quelle + `\n({ daten: ${objekt}, ensure: ${ensure} })`, {
      state: { route: { view: 'heute' } }, render: () => {},
      fetchEinkauf: async () => { u.anfragen++; return u.antwort; },
    });
    const alt = { verfuegbar: true, arbeit: [{ id: 'synthetisch' }] };
    api.daten.daten = alt;
    api.ensure();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(api.daten.daten, alt, `${datei}: vorhandene Arbeit bleibt erhalten`);
    assert.equal(api.daten.laedt, false);
    assert.ok(Date.now() - api.daten[zeit] < 1000);
    api.ensure();
    assert.equal(u.anfragen, 1, `${datei}: Render startet keinen sofortigen Fehlerkreislauf`);

    api.daten.daten = null;
    api.ensure();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(api.daten.daten, u.antwort, `${datei}: initialer Fehler wird sichtbar`);
    api.ensure();
    assert.equal(u.anfragen, 2, `${datei}: auch initialer Fehler hat eine Versuchspause`);

    u.antwort = { verfuegbar: true, arbeit: [{ id: 'neuer-stand' }] };
    api.ensure({ neu: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(api.daten.daten, u.antwort, `${datei}: spaeterer Erfolg wird uebernommen`);
  }
});
