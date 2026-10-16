import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../kern/zustand.mjs';
import { baueProzessAuftrag } from '../lib/prozesse.mjs';

const CODEX = 'codex://new?path=%2Ftmp%2Ftest-projekt';
const CLAUDE_CODE = 'claude://code/new?folder=%2Ftmp%2Ftest-projekt';
let zaehler = 0;

async function mitArbeitsplatz(pruefung) {
  const vorher = {
    document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch,
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    route: state.route, session: state.session, capabilities: state.capabilities,
  };
  const api = [], links = [];
  const elemente = {
    prozessAppDirekt: { innerHTML: '' },
    prozessVorschau: { tagName: 'TEXTAREA', value: '', defaultValue: '', textContent: '' },
    prozessVorgang: { tagName: 'INPUT', value: '', defaultValue: '', removeAttribute() {} },
    prozessQuelle: { tagName: 'TEXTAREA', value: '', defaultValue: '', textContent: '' },
  };
  globalThis.document = { getElementById: id => elemente[id] || null, querySelector: () => null };
  globalThis.window = { location: { assign: link => links.push(link) } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: () => assert.fail('Direkte App-Uebergabe darf nicht kopieren') } } });
  globalThis.fetch = async (url, optionen) => {
    api.push({ url, optionen });
    return { ok: true, json: async () => ({
      standardAnbieter: 'codex', bearbeitbar: false,
      ziele: {
        email: { codex: 'codex://threads/new', claude: 'claude://claude.ai/new' },
        angebot: { codex: CODEX, claude: CLAUDE_CODE },
        recherche: { codex: 'codex://threads/abc-123', claude: 'https://claude.ai/project/00000000-0000-0000-0000-000000000000' },
      },
    }) };
  };
  state.route = { view: 'test', params: new URLSearchParams() };
  state.session = { required: true, authenticated: true };
  state.capabilities = { mode: 'lokal' };
  const ui = await import(`../ansichten/prozesse.mjs?app-ui-test=${++zaehler}`);
  const eingeben = (feld, value) => {
    const target = { value, dataset: { prozessFeld: feld }, hasAttribute: () => false };
    target.closest = () => target;
    assert.equal(ui.prozesseEingabe({ target }), true);
  };
  const waehlen = (prozess, anbieter = 'codex') => {
    state.route.params.set('prozess', prozess);
    ui.viewProzesse();
    eingeben('anbieter', anbieter);
    return ui.viewProzesse();
  };
  const klicken = (isTrusted = true) => ui.prozesseKlick({ isTrusted, target: { closest: () => ({ hasAttribute: name => name === 'data-prozess-app-direkt' }) }, preventDefault() {} });
  try {
    ui.viewProzesse();
    await new Promise(resolve => setImmediate(resolve));
    state.route.view = 'prozesse';
    await pruefung({ ui, eingeben, waehlen, klicken, elemente, links });
    assert.deepEqual(api, [{ url: '/api/prozesse/links', optionen: { cache: 'no-store' } }], 'die Dashboard-API liest nur die promptfreien Projektziele');
  } finally {
    ui.verwerfeProzessKontext();
    globalThis.document = vorher.document;
    globalThis.window = vorher.window;
    globalThis.fetch = vorher.fetch;
    if (vorher.navigator) Object.defineProperty(globalThis, 'navigator', vorher.navigator);
    else delete globalThis.navigator;
    state.route = vorher.route;
    state.session = vorher.session;
    state.capabilities = vorher.capabilities;
  }
}

test('App-Entwurf braucht echten Klick; kompletter aktueller Auftrag geht nur an das native Ziel', async () => {
  await mitArbeitsplatz(({ ui, eingeben, waehlen, klicken, elemente, links }) => {
    let html = waehlen('angebot');
    assert.match(html, /data-prozess-app-direkt disabled/);
    assert.match(html, /Mit Angaben in Codex öffnen/);
    assert.match(html, /<details[^>]+id="prozessAlternative"><summary>Alternativ manuell/);
    assert.match(html, /href="codex:\/\/new\?path=%2Ftmp%2Ftest-projekt"/);
    assert.doesNotMatch(html, /(?:href|value)="[^"\n]*(?:prompt=|&amp;q=)/);
    eingeben('quelle', 'Erfundene Anfrage: ä & + 100%\nZweite Zeile 📦');
    eingeben('vorgang', 'Testvorgang');
    assert.equal(links.length, 0, 'Rendern und Eingeben starten keine App');
    klicken(false);
    assert.equal(links.length, 0, 'synthetischer Klick startet keine App');
    assert.match(elemente.prozessAppDirekt.innerHTML, /Bitte die Übergabe über den Knopf auslösen/);
    klicken();
    assert.equal(links.length, 1, 'die Uebergabe erfolgt synchron im echten Klick');
    const link = new URL(links[0]);
    assert.equal(link.protocol, 'codex:');
    assert.equal(link.searchParams.get('path'), '/tmp/test-projekt');
    assert.equal(link.searchParams.get('prompt'), baueProzessAuftrag({ prozess: 'angebot', quelle: 'Erfundene Anfrage: ä & + 100%\nZweite Zeile 📦', vorgang: 'Testvorgang' }));
    assert.match(elemente.prozessAppDirekt.innerHTML, /Übergabe angefordert/);
    assert.doesNotMatch(elemente.prozessAppDirekt.innerHTML, /eingefügt|erfolgreich|prompt=|codex:\/\//);
    html = ui.viewProzesse();
    assert.doesNotMatch(html, /href="codex:[^"]*prompt=/);
    assert.equal(elemente.prozessVorschau.value, link.searchParams.get('prompt'), 'nur der pruefbare Klartext, kein App-Link, steht in der Vorschau');
  });
});

test('Claude Code erhaelt Ordner und Entwurf; generische Ziele benennen das fehlende Projekt', async () => {
  await mitArbeitsplatz(({ eingeben, waehlen, klicken, elemente, links }) => {
    let html = waehlen('angebot', 'claude');
    assert.match(html, /Mit Angaben in Claude Code öffnen/);
    assert.match(html, /Ordnerdialog/);
    assert.doesNotMatch(html, /Noch kein Projekt hinterlegt/);
    eingeben('quelle', 'Erfundene Angebotsangaben');
    klicken();
    const link = new URL(links[0]);
    assert.equal(link.hostname, 'code');
    assert.equal(link.searchParams.get('folder'), '/tmp/test-projekt');
    assert.match(link.searchParams.get('q'), /Erfundene Angebotsangaben/);
    assert.match(elemente.prozessAppDirekt.innerHTML, /Entwurf in Claude Code prüfen und dort starten/);
    html = waehlen('email', 'claude');
    assert.match(html, /Mit Angaben in Claude öffnen/);
    assert.match(html, /Noch kein Projekt hinterlegt/);
    klicken();
    assert.equal(new URL(links[1]).hostname, 'claude.ai');
    assert.match(new URL(links[1]).searchParams.get('q'), /Arbeitsauftrag: E-Mail vorbereiten/);
    html = waehlen('email', 'codex');
    assert.match(html, /Noch kein Projekt hinterlegt/);
    assert.doesNotMatch(html, /Im Projekt eingefügt/);
  });
});

test('Cloud-Projekte und bestehende Chats behalten den manuellen Weg ohne falschen Direktknopf', async () => {
  await mitArbeitsplatz(({ eingeben, waehlen, klicken, links }) => {
    eingeben('quelle', 'Erfundene Recherchefrage');
    for (const anbieter of ['codex', 'claude']) {
      const html = waehlen('recherche', anbieter);
      assert.doesNotMatch(html, /data-prozess-app-direkt|id="prozessAlternative"/);
      assert.match(html, /class="btn btn-primary" data-prozess-kopieren/);
      klicken();
    }
    assert.equal(links.length, 0, 'auch ein erzwungener Ereignisaufruf uebergibt kein nicht unterstuetztes Ziel');
  });
});

test('Zu lange Angaben bleiben vollstaendig erhalten und werden nicht teilweise uebergeben', async () => {
  await mitArbeitsplatz(({ ui, eingeben, waehlen, klicken, elemente, links }) => {
    waehlen('angebot');
    const quelle = 'Ä'.repeat(2500);
    eingeben('quelle', quelle);
    const vorher = elemente.prozessVorschau.value;
    klicken();
    assert.equal(links.length, 0);
    assert.match(elemente.prozessAppDirekt.innerHTML, /für die direkte App-Übergabe zu lang/);
    assert.equal(elemente.prozessVorschau.value, vorher);
    assert.match(ui.viewProzesse(), new RegExp(quelle));
    assert.match(vorher, new RegExp(quelle));
  });
});

test('Kontextwechsel, Verwerfen und abgelaufene Sitzung lassen keinen alten App-Status oder Start zurueck', async () => {
  await mitArbeitsplatz(({ ui, eingeben, waehlen, klicken, elemente, links }) => {
    waehlen('angebot');
    eingeben('quelle', 'Erster erfundener Entwurf');
    klicken();
    eingeben('quelle', 'Zweiter erfundener Entwurf');
    assert.doesNotMatch(elemente.prozessAppDirekt.innerHTML, /Übergabe angefordert/);
    klicken();
    eingeben('anbieter', 'claude');
    assert.doesNotMatch(ui.viewProzesse(), /Übergabe angefordert/);
    klicken();
    waehlen('email', 'claude');
    assert.doesNotMatch(ui.viewProzesse(), /Übergabe angefordert/);
    const anzahl = links.length;
    state.route.view = 'heute';
    klicken();
    assert.equal(links.length, anzahl);
    state.route.view = 'prozesse';
    state.session.authenticated = false;
    klicken();
    assert.equal(links.length, anzahl, 'eine abgelaufene Sitzung darf auch vor dem naechsten Rendern keine App starten');
    assert.equal(elemente.prozessVorschau.value, '');
    assert.equal(elemente.prozessAppDirekt.innerHTML, '');
    state.session.authenticated = true;
    eingeben('quelle', 'Dritter erfundener Entwurf');
    klicken();
    ui.verwerfeProzessKontext();
    assert.equal(elemente.prozessAppDirekt.innerHTML, '', 'Logout/pagehide leert auch einen im Browser-Cache verbleibenden Status');
    assert.equal(elemente.prozessVorschau.value, '');
    assert.match(ui.viewProzesse(), /data-prozess-app-direkt disabled/);
  });
});

test('Abgelehnte App-Navigation meldet keinen Erfolg und stellt keinen fremden Fehlertext dar', async () => {
  await mitArbeitsplatz(({ eingeben, waehlen, klicken, elemente, links }) => {
    waehlen('angebot');
    eingeben('quelle', 'Erfundener privater Entwurf');
    window.location.assign = () => { throw new Error('<img src=x> Erfundener privater Entwurf'); };
    klicken();
    assert.equal(links.length, 0);
    assert.match(elemente.prozessAppDirekt.innerHTML, /Die App konnte nicht geöffnet werden/);
    assert.doesNotMatch(elemente.prozessAppDirekt.innerHTML, /<img|Erfundener privater Entwurf|Übergabe angefordert/);
  });
});
