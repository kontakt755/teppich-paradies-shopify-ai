import test from 'node:test';
import assert from 'node:assert/strict';
import { istChatgptProjektZiel, neueUebergabeId, erstelleProzessUebergabe, uebergabeFehlerText, UEBERGABE_ANTWORT_TYP } from '../lib/prozess-uebergabe.mjs';
import { state } from '../kern/zustand.mjs';
import { viewProzesse, prozesseEingabe, prozesseKlick, verwerfeProzessKontext } from '../ansichten/prozesse.mjs';

const ZIEL = 'https://chatgpt.com/g/g-p-00000000000000000000000000000000/project';
function umgebung() {
  const gesendet = [], meldungen = [], timer = new Map(), listener = new Set();
  let zaehler = 0, zufallszaehler = 0;
  const fenster = {
    location: { origin: 'http://127.0.0.1:8001' },
    crypto: { getRandomValues: bytes => { bytes.fill(++zufallszaehler); return bytes; } },
    postMessage: (daten, origin) => gesendet.push({ daten, origin }),
    addEventListener: (typ, fn) => { if (typ === 'message') listener.add(fn); },
    removeEventListener: (typ, fn) => listener.delete(fn),
  };
  const bruecke = erstelleProzessUebergabe({ fenster, setTimer: (fn, ms) => { timer.set(++zaehler, { fn, ms }); return zaehler; }, clearTimer: id => timer.delete(id), onStatus: s => meldungen.push(s) });
  const empfangen = (daten, extra = {}) => { for (const fn of listener) fn({ source: fenster, origin: fenster.location.origin, data: { typ: UEBERGABE_ANTWORT_TYP, version: 1, ...daten }, ...extra }); };
  const bereit = () => { bruecke.pruefen(); empfangen({ id: gesendet.at(-1).daten.id, status: 'bereit' }); };
  return { fenster, bruecke, gesendet, meldungen, timer, listener, empfangen, bereit };
}

test('Direktziel ist ausschliesslich eine genaue queryfreie ChatGPT-Projektadresse', () => {
  assert.equal(istChatgptProjektZiel(ZIEL), true);
  for (const ziel of ['https://chatgpt.com/', `${ZIEL}?q=Testtext`, `${ZIEL}#Testtext`, ZIEL.replace('chatgpt.com', 'chatgpt.com.example.invalid'), ZIEL.replace('/project', '/c/test'), 'javascript:alert(1)', null]) assert.equal(istChatgptProjektZiel(ziel), false);
});

test('UUID nutzt getRandomValues mit Version 4 und RFC-Variante; keine HTTP-randomUUID-Abhaengigkeit', () => {
  assert.match(neueUebergabeId({ getRandomValues: bytes => { bytes.fill(255); return bytes; } }), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.throws(() => neueUebergabeId({}), /Zufallsquelle/);
  const bruecke = erstelleProzessUebergabe({ fenster: undefined });
  assert.equal(bruecke.pruefen(), false);
  assert.doesNotThrow(() => bruecke.beenden());
});

test('Statusprobe uebergibt keinen Text und akzeptiert nur Fenster, Herkunft, Version und bekannte Zufalls-ID', () => {
  const u = umgebung();
  u.bruecke.pruefen();
  const { daten, origin } = u.gesendet[0];
  assert.deepEqual(Object.keys(daten).sort(), ['aktion', 'id', 'typ', 'version']);
  assert.equal(origin, u.fenster.location.origin);
  for (const extra of [{ source: {} }, { origin: 'https://fremd.example.invalid' }]) u.empfangen({ id: daten.id, status: 'bereit' }, extra);
  u.empfangen({ id: 'fremd', status: 'bereit' });
  u.empfangen({ id: daten.id, status: 'bereit', version: 2 });
  assert.equal(u.bruecke.bereit, false);
  u.empfangen({ id: daten.id, status: 'bereit' });
  assert.equal(u.bruecke.bereit, true);
  u.bruecke.beenden();
});

test('Text wird einmal auf ausdruecklichen Aufruf gesendet; oeffnet ist noch kein Erfolg', () => {
  const u = umgebung(); u.bereit();
  assert.equal(u.gesendet.length, 1);
  assert.equal(u.bruecke.einfuegen(ZIEL, 'Erfundener Testauftrag'), true);
  const job = u.gesendet.at(-1).daten;
  assert.equal(job.text, 'Erfundener Testauftrag');
  assert.equal(job.ziel, ZIEL);
  assert.equal(u.bruecke.einfuegen(ZIEL, 'Zweiter Testauftrag'), false);
  assert.equal(u.gesendet.length, 2);
  u.empfangen({ id: job.id, status: 'oeffnet' });
  assert.equal(u.bruecke.laeuft, true);
  assert.ok(!u.meldungen.some(m => m.status === 'eingefuegt'));
  u.empfangen({ id: job.id, status: 'eingefuegt' });
  assert.equal(u.bruecke.laeuft, false);
  assert.equal(u.meldungen.at(-1).status, 'eingefuegt');
  assert.equal(u.timer.size, 0);
  u.bruecke.beenden();
});

test('Abbrechen sendet nur die Job-ID und ignoriert eine spaete Erfolgsmeldung', () => {
  const u = umgebung(); u.bereit(); u.bruecke.einfuegen(ZIEL, 'Erfundener Testauftrag');
  const id = u.gesendet.at(-1).daten.id;
  assert.equal(u.bruecke.abbrechen(), true);
  assert.deepEqual(u.gesendet.at(-1).daten, { typ: 'tp-prozess-uebergabe', version: 1, aktion: 'abbrechen', id });
  const anzahl = u.meldungen.length;
  u.empfangen({ id, status: 'eingefuegt' });
  assert.equal(u.meldungen.length, anzahl);
  assert.equal(u.timer.size, 0);
  u.bruecke.beenden();
  assert.equal(u.listener.size, 0);
});

test('45 Sekunden Zeitlimit brechen ab; spaete Antworten aendern den Fehler nicht', () => {
  const u = umgebung(); u.bereit(); u.bruecke.einfuegen(ZIEL, 'Erfundener Testauftrag');
  const id = u.gesendet.at(-1).daten.id;
  const wartend = [...u.timer.values()].find(t => t.ms === 45000);
  assert.ok(wartend); wartend.fn();
  assert.equal(u.gesendet.at(-1).daten.aktion, 'abbrechen');
  assert.equal(u.meldungen.at(-1).code, 'zeitlimit');
  u.empfangen({ id, status: 'eingefuegt' });
  assert.equal(u.meldungen.at(-1).code, 'zeitlimit');
  u.bruecke.beenden();
});

test('fehlender Begleiter und ungueltige Ziele werden nicht als Erfolg angezeigt', () => {
  const u = umgebung(); u.bruecke.pruefen();
  [...u.timer.values()][0].fn();
  assert.equal(u.meldungen.at(-1).code, 'begleiter_fehlt');
  assert.equal(u.bruecke.einfuegen(ZIEL, 'Testauftrag'), false);
  assert.ok(!u.gesendet.some(m => m.daten.aktion === 'einfuegen'));
  u.bereit();
  assert.equal(u.bruecke.einfuegen(`${ZIEL}?q=Testauftrag`, 'Testauftrag'), false);
  assert.equal(u.meldungen.at(-1).code, 'ungueltig');
  assert.match(uebergabeFehlerText('entwurf_vorhanden'), /nicht überschrieben/);
  assert.ok(!uebergabeFehlerText('<script>').includes('<script>'));
  assert.equal(typeof uebergabeFehlerText('__proto__'), 'string');
  u.bruecke.beenden();
});

test('Oberflaeche sendet nur nach echtem Direktklick und bricht vor Kontext-, Anbieter-, Prozesswechsel und Verwerfen ab', async () => {
  const vorher = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch, route: state.route };
  const u = umgebung();
  // Nur das Fenster wird benutzt, nicht die separat erzeugte Testbruecke.
  u.bruecke.beenden();
  const api = [];
  const elemente = { prozessDirekt: { innerHTML: '' }, prozessVorschau: { tagName: 'TEXTAREA', value: '', defaultValue: '', textContent: '' } };
  globalThis.document = { getElementById: id => elemente[id] || null, querySelector: () => null };
  globalThis.window = u.fenster;
  globalThis.fetch = async (url, optionen) => {
    api.push({ url, optionen });
    return { ok: true, json: async () => ({ standardAnbieter: 'chatgpt', bearbeitbar: false, ziele: Object.fromEntries(['email', 'angebot', 'recherche'].map(p => [p, { chatgpt: ZIEL, codex: 'codex://threads/new', claude: '' }])) }) };
  };
  state.route = { view: 'test', params: new URLSearchParams() };
  const eingeben = (feld, value) => {
    const target = { value, dataset: { prozessFeld: feld }, hasAttribute: () => false };
    target.closest = () => target;
    prozesseEingabe({ target });
  };
  const klicken = trusted => prozesseKlick({ isTrusted: trusted, target: { closest: () => ({ hasAttribute: name => name === 'data-prozess-direkt' }) }, preventDefault() {} });
  const antwort = daten => { for (const fn of u.listener) fn({ source: u.fenster, origin: u.fenster.location.origin, data: { typ: UEBERGABE_ANTWORT_TYP, version: 1, ...daten } }); };
  try {
    viewProzesse();
    await new Promise(resolve => setImmediate(resolve));
    const html = viewProzesse();
    assert.match(html, /data-prozess-direkt disabled/);
    assert.match(html, /Alternativ manuell kopieren und öffnen/);
    assert.equal(u.gesendet[0].daten.aktion, 'status');
    assert.equal(u.gesendet[0].daten.text, undefined);
    antwort({ id: u.gesendet[0].daten.id, status: 'bereit' });
    state.route.view = 'prozesse';
    eingeben('quelle', 'Erfundene Testanfrage');
    klicken(false);
    assert.equal(u.gesendet.length, 1, 'synthetischer Klick sendet keinen Auftrag');
    klicken(true);
    const erster = u.gesendet.at(-1).daten;
    assert.equal(erster.aktion, 'einfuegen');
    assert.match(erster.text, /Erfundene Testanfrage/);
    eingeben('quelle', 'Neue erfundene Testanfrage');
    assert.equal(u.gesendet.at(-1).daten.aktion, 'abbrechen');
    assert.equal(u.gesendet.at(-1).daten.id, erster.id);
    antwort({ id: erster.id, status: 'eingefuegt' });
    assert.ok(!elemente.prozessDirekt.innerHTML.includes('Im Projekt eingefügt'));
    klicken(true);
    eingeben('anbieter', 'codex');
    assert.equal(u.gesendet.at(-1).daten.aktion, 'abbrechen');
    eingeben('anbieter', 'chatgpt');
    klicken(true);
    state.route.params.set('prozess', 'angebot');
    viewProzesse();
    assert.equal(u.gesendet.at(-1).daten.aktion, 'abbrechen');
    klicken(true);
    verwerfeProzessKontext();
    assert.equal(u.gesendet.at(-1).daten.aktion, 'abbrechen');
    assert.equal(u.listener.size, 0);
    assert.deepEqual(api, [{ url: '/api/prozesse/links', optionen: { cache: 'no-store' } }], 'kein Kontext an Server oder URL');
  } finally {
    verwerfeProzessKontext();
    globalThis.document = vorher.document;
    globalThis.window = vorher.window;
    globalThis.fetch = vorher.fetch;
    state.route = vorher.route;
  }
});
