// Ansicht "Laden": Zeilen und Fristen (lib), Antworten der API und Rollen am Server.
// Nur erfundene Daten (Person A, Testkunde); Namen kommen aus einer Wegwerf-Datei, nie aus dem Repository.
import './_testumgebung.mjs'; // muss zuerst stehen
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { rueckrufePfad, rueckrufAusMailAnlegen } from '../../../operations/lib/rueckrufe.mjs';
import { ladenPersonenPfad, ladenZustaendigPfad, ladenAufgabenPfad } from '../../../operations/lib/laden.mjs';
import { ladenTodos, liegtZuLange, teileSpalte } from '../lib/laden.mjs';

const JETZT = new Date('2026-11-10T10:00:00Z');
const vorTagen = n => new Date(JETZT.getTime() - n * 86400000).toISOString();

test('Zeilen: Rueckruf, Kunde antwortet nicht (erst ab 14 Tagen) und offene Aufgaben; Frist je Art aus FRISTEN', () => {
  const todos = ladenTodos({
    rueckrufe: [
      { orderId: 'o1', kundenname: 'Testkunde', thema: 'Beratung', telefon: '030 1', datum: vorTagen(8), status: 'offen' },
      { orderId: 'o2', kundenname: 'Testkunde 2', thema: 'Beratung', telefon: null, datum: vorTagen(1), status: 'erledigt' },
    ],
    kundeWartet: [{ orderId: 'b1', kundenname: 'Testkunde 3', text: 'Kunde schaut sich die Muster an', tage: 15 }, { orderId: 'b2', kundenname: 'Testkunde 4', text: 'x', tage: 9 }],
    aufgaben: [{ id: 'a1', art: 'Rolle schneiden', text: '3 m', erstelltAm: vorTagen(3), erledigtAm: null }, { id: 'a2', art: 'Sonstiges', text: 'fertig', erstelltAm: vorTagen(5), erledigtAm: vorTagen(1) }],
  }, { jetzt: JETZT });
  assert.deepEqual(todos.map(t => [t.schluessel, t.ton]), [['rueckruf:o1', 'crit'], ['aufgabe:a1', 'crit'], ['fall:b1', 'warn']]);
  assert.equal(todos[0].alter, '8 Tage');
  assert.equal(todos[0].text, 'Beratung – 030 1');
});

test('Rote Zeile: nur offene Eintraege in der roten Stufe, Mails und Aufgaben getrennt gezaehlt', () => {
  const m = { ton: 'crit', zustaendig: null }; const frei = { ton: 'warn', zustaendig: null }; const mein = { ton: 'crit', zustaendig: { wer: 'Person A', seit: vorTagen(1) } };
  assert.equal(liegtZuLange([m], [m, frei, mein]), 'Liegt zu lange: 1 Mail und 1 Aufgabe – das hat noch niemand übernommen.');
  assert.equal(liegtZuLange([], [m, m]), 'Liegt zu lange: 2 Aufgaben – das hat noch niemand übernommen.');
  assert.equal(liegtZuLange([frei], [mein]), null);
  const { offen, inArbeit } = teileSpalte([frei, mein, m]);
  assert.equal(offen.length, 2); assert.equal(offen[0], m, 'rot zuerst'); assert.equal(inArbeit.length, 1);
});

function umgebung({ personen = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-laden-api-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [] }));
  rueckrufAusMailAnlegen(rueckrufePfad(dir), { mailId: 'm1', name: 'Testkunde', telefon: '030 123', eingangAm: vorTagen(8), muster: ['Testteppich Sand'] }, { actor: 'test', jetzt: JETZT });
  if (personen) fs.writeFileSync(ladenPersonenPfad(dir), JSON.stringify(['Person A', 'Person B']));
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, env: {}, now: () => JETZT });
  return { dir, api };
}

test('API: Uebersicht, Aufgabe anlegen, uebernehmen, zurueckgeben, erledigen', () => {
  const { dir, api } = umgebung();
  let d = api.ladenUebersicht();
  assert.deepEqual(d.personen, ['Person A', 'Person B']);
  assert.deepEqual(d.mails, { eingerichtet: false, eintraege: [] });
  assert.equal(d.todos.length, 1);
  assert.equal(d.todos[0].schluessel, 'rueckruf:mail-m1');
  assert.equal(d.todos[0].zustaendig, null);

  const { id } = api.ladenAufgabeAnlegen({ art: 'Rolle schneiden', text: '2 m Testteppich' }, { name: 'Person A' });
  d = api.ladenUebersicht();
  assert.deepEqual(d.todos.map(t => t.schluessel).sort(), ['aufgabe:' + id, 'rueckruf:mail-m1'].sort());

  api.ladenZustaendigSetzen({ schluessel: `aufgabe:${id}`, wer: 'Person B' });
  assert.equal(api.ladenUebersicht().todos.find(t => t.aufgabeId === id).zustaendig.wer, 'Person B');
  assert.throws(() => api.ladenZustaendigSetzen({ schluessel: `aufgabe:${id}`, wer: 'Person A' }), e => e.status === 400 && /Person B kümmert sich/.test(e.message));
  api.ladenZustaendigSetzen({ schluessel: `aufgabe:${id}`, wer: null });
  assert.equal(api.ladenUebersicht().todos.find(t => t.aufgabeId === id).zustaendig, null);

  api.ladenZustaendigSetzen({ schluessel: `aufgabe:${id}`, wer: 'Person A' });
  api.ladenAufgabeErledigen({ id });
  assert.deepEqual(api.ladenUebersicht().todos.map(t => t.schluessel), ['rueckruf:mail-m1'], 'Erledigtes erscheint nicht mehr');
  assert.deepEqual(JSON.parse(fs.readFileSync(ladenZustaendigPfad(dir), 'utf8')), {}, 'Zustaendigkeit der erledigten Aufgabe ist weg');
});

test('API: Eingaben werden serverseitig geprueft, ohne Namensliste kein Uebernehmen', () => {
  const { dir, api } = umgebung();
  const fehler = (fn, teil) => assert.throws(fn, e => e.status === 400 && teil.test(e.message));
  fehler(() => api.ladenZustaendigSetzen({ schluessel: 'rueckruf:x', wer: 'Fremder' }), /Namen/);
  fehler(() => api.ladenZustaendigSetzen({ schluessel: 'quatsch', wer: 'Person A' }), /Unbekannter Eintrag/);
  fehler(() => api.ladenAufgabeAnlegen({ art: 'Egal', text: 'x' }), /Art/);
  fehler(() => api.ladenAufgabeAnlegen({ art: 'Sonstiges', text: '' }), /beschreiben/);
  fehler(() => api.ladenAufgabeAnlegen({ art: 'Sonstiges', text: 'x'.repeat(201) }), /Zeichen/);
  fehler(() => api.ladenAufgabeErledigen({ id: 'nix' }), /gibt es nicht/);
  fs.rmSync(ladenPersonenPfad(dir));
  assert.equal(api.ladenUebersicht().personen, null);
  fehler(() => api.ladenZustaendigSetzen({ schluessel: 'rueckruf:x', wer: 'Person A' }), /Namensliste/);
  // Beschaedigte Ablage: Fehler statt leerer Liste, Datei bleibt.
  fs.writeFileSync(ladenAufgabenPfad(dir), '{"aufgaben": [');
  assert.throws(() => api.ladenUebersicht(), /beschädigt/);
  assert.throws(() => api.ladenAufgabeAnlegen({ art: 'Sonstiges', text: 'x' }), /beschädigt/);
  assert.equal(fs.readFileSync(ladenAufgabenPfad(dir), 'utf8'), '{"aufgaben": [');
});

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: Rolle "lesen" darf die Uebersicht sehen, aber nichts schreiben (403); Mitarbeiter 200', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const { dir } = umgebung();
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, path.join(dir, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = dir;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=laden');
  delete process.env.TP_DASHBOARD_PASSWORT;
  await mitServer(mod.requestHandler, async base => {
    const anmelden = async (name, passwort) => {
      const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort }) });
      assert.equal(r.status, 200);
      return r.headers.get('set-cookie').split(';')[0];
    };
    const post = (keks, pfad, rumpf) => fetch(`${base}${pfad}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: JSON.stringify(rumpf) });
    const lena = await anmelden('lena', 'platzhalter-lesen-1');
    const mona = await anmelden('mona', 'platzhalter-mitarbeiter-1');
    const neu = { art: 'Sonstiges', text: 'Testaufgabe' };
    for (const [pfad, rumpf] of [['/api/laden/zustaendig', { schluessel: 'rueckruf:mail-m1', wer: 'Person A' }], ['/api/laden/aufgabe', neu], ['/api/laden/aufgabe-erledigt', { id: 'x' }]]) {
      assert.equal((await post(lena, pfad, rumpf)).status, 403, `lesen: ${pfad}`);
    }
    assert.equal((await fetch(`${base}/api/laden/uebersicht`, { headers: { cookie: lena } })).status, 200, 'lesen darf zuschauen');
    const angelegt = await post(mona, '/api/laden/aufgabe', neu);
    assert.equal(angelegt.status, 200);
    const { id } = await angelegt.json();
    assert.equal((await post(mona, '/api/laden/zustaendig', { schluessel: `aufgabe:${id}`, wer: 'Person A' })).status, 200);
    const u = await (await fetch(`${base}/api/laden/uebersicht`, { headers: { cookie: mona } })).json();
    assert.equal(u.todos.find(t => t.aufgabeId === id).zustaendig.wer, 'Person A');
    assert.equal((await post(mona, '/api/laden/aufgabe', { art: 'Sonstiges', text: '' })).status, 400);
    assert.equal((await post(mona, '/api/laden/aufgabe-erledigt', { id })).status, 200);
  });
});
