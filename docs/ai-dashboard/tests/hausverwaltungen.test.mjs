import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen: TP_PRIVAT_DIR auf einen Testordner
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import * as regeln from '../lib/hausverwaltungen.mjs';
import { tageBis } from '../lib/akquise.mjs';
import { leiteTodosAb } from '../lib/todos.mjs';

const { wendeHvAenderungAn, leererBestand, hvFaellig, sortiereHv, hvKennzahlen, telHref } = regeln;

// Ausgedachte Verwaltungen und Adressen - echte Kontakte gehoeren nie ins Repository.
let zaehler = 0;
const kontext = (heute = '2026-10-28') => ({ heute, von: 'Mona Mitarbeiter', neueId: () => `hv-test${++zaehler}` });
const anwenden = (bestand, eingabe, heute) => wendeHvAenderungAn(bestand, eingabe, kontext(heute));

function mitObjektUndAngebot() {
  let b = anwenden(leererBestand(), { ebene: 'verwaltung', daten: { name: 'Muster Hausverwaltung GmbH', ansprechpartner: 'Frau Beispiel', telefon: '03301 000000', email: 'info@muster.example' } });
  const vid = b.ergebnis.id;
  b = anwenden(b.bestand, { ebene: 'objekt', verwaltungId: vid, daten: { adresse: 'Musterweg 1, 16515 Musterstadt', wohnungen: '24', vorOrt: 'Hausmeister Herr Test, 0170 0000000' } });
  const oid = b.ergebnis.id;
  b = anwenden(b.bestand, { ebene: 'angebot', verwaltungId: vid, objektId: oid, daten: { art: 'angebot', lexware: 'AG-0001', datum: '2026-10-01', stand: 'offen' } });
  return { bestand: b.bestand, vid, oid, aid: b.ergebnis.id };
}

test('Verwaltung anlegen: Name Pflicht, Doppel abgelehnt, Kontakt geprueft, Stempel gesetzt', () => {
  const r = anwenden(leererBestand(), { ebene: 'verwaltung', daten: { name: '  Muster Hausverwaltung GmbH ', telefon: '' } });
  const v = r.bestand.verwaltungen[0];
  assert.equal(v.name, 'Muster Hausverwaltung GmbH');
  assert.equal(v.status, 'neu');
  assert.equal(v.geaendertVon, 'Mona Mitarbeiter');
  assert.deepEqual(v.objekte, []);
  assert.throws(() => anwenden(r.bestand, { ebene: 'verwaltung', daten: { name: 'muster hausverwaltung gmbh' } }), /gibt es schon/);
  assert.throws(() => anwenden(leererBestand(), { ebene: 'verwaltung', daten: { name: '' } }), /Name fehlt/);
  assert.throws(() => anwenden(leererBestand(), { ebene: 'verwaltung', daten: { name: 'X', email: 'kaputt@' } }), /E-Mail/);
  assert.throws(() => anwenden(leererBestand(), { ebene: 'verwaltung', daten: { name: 'X', telefon: '12' } }), /Telefon/);
  assert.throws(() => anwenden(leererBestand(), { ebene: 'verwaltung', daten: { name: 'X', status: 'quatsch' } }), /Stand/);
  assert.throws(() => anwenden(leererBestand(), { ebene: 'verwaltung', daten: { name: 'X', wiedervorlage: 'morgen' } }), /Datum/);
  assert.throws(() => anwenden(leererBestand(), { ebene: 'gibtsnicht', daten: {} }), /Unbekannte/);
  // Der alte Bestand bleibt unberuehrt - der Server schreibt erst, wenn alles geprueft ist.
  const alt = leererBestand();
  anwenden(alt, { ebene: 'verwaltung', daten: { name: 'Neu' } });
  assert.equal(alt.verwaltungen.length, 0);
});

test('Stand: angeschrieben ohne Datum setzt Wiedervorlage +14, eigenes Datum bleibt, kein Interesse leert sie', () => {
  const v0 = anwenden(leererBestand(), { ebene: 'verwaltung', daten: { name: 'Muster' } });
  const id = v0.ergebnis.id;
  const a = anwenden(v0.bestand, { ebene: 'verwaltung', id, daten: { status: 'angeschrieben', wiedervorlage: '' } }, '2026-10-20');
  assert.equal(a.ergebnis.verwaltung.wiedervorlage, '2026-11-03');
  assert.equal(a.ergebnis.verwaltung.letzteAktion, '2026-10-20');
  const b = anwenden(v0.bestand, { ebene: 'verwaltung', id, daten: { status: 'angeschrieben', wiedervorlage: '2026-10-25' } }, '2026-10-20');
  assert.equal(b.ergebnis.verwaltung.wiedervorlage, '2026-10-25');
  const c = anwenden(a.bestand, { ebene: 'verwaltung', id, daten: { status: 'kein-interesse', wiedervorlage: '2026-11-03' } });
  assert.equal(c.ergebnis.verwaltung.wiedervorlage, '');
  // Nur mitgeschickte Felder aendern sich.
  const d = anwenden(a.bestand, { ebene: 'verwaltung', id, daten: { notiz: 'Rückruf erbeten' } });
  assert.equal(d.ergebnis.verwaltung.status, 'angeschrieben');
  assert.equal(d.ergebnis.verwaltung.notiz, 'Rückruf erbeten');
});

test('Objekt und Angebot: anlegen, bearbeiten, Pflichtangaben, Entfernen nur von unten nach oben', () => {
  const { bestand, vid, oid, aid } = mitObjektUndAngebot();
  const o = bestand.verwaltungen[0].objekte[0];
  assert.equal(o.wohnungen, 24);
  assert.equal(o.angebote[0].lexware, 'AG-0001');
  assert.equal(o.angebote[0].stand, 'offen');
  assert.throws(() => anwenden(bestand, { ebene: 'objekt', verwaltungId: vid, daten: { adresse: '' } }), /Adresse fehlt/);
  assert.throws(() => anwenden(bestand, { ebene: 'objekt', verwaltungId: vid, daten: { adresse: 'X', wohnungen: 'viele' } }), /ganze Zahl/);
  assert.equal(anwenden(bestand, { ebene: 'objekt', verwaltungId: vid, daten: { adresse: 'X', wohnungen: '1.200' } }).bestand.verwaltungen[0].objekte[1].wohnungen, 1200);
  assert.throws(() => anwenden(bestand, { ebene: 'objekt', verwaltungId: 'hv-fremd', daten: { adresse: 'X' } }), /nicht gefunden/);
  assert.throws(() => anwenden(bestand, { ebene: 'angebot', verwaltungId: vid, objektId: oid, daten: { art: 'angebot' } }), /Lexware-Nummer, Auftrag in der App oder eine Notiz/);
  assert.throws(() => anwenden(bestand, { ebene: 'angebot', verwaltungId: vid, objektId: oid, daten: { art: 'rechnung', notiz: 'x' } }), /Angebot oder Auftrag/);
  const angenommen = anwenden(bestand, { ebene: 'angebot', verwaltungId: vid, objektId: oid, id: aid, daten: { stand: 'angenommen', auftragsApp: 'A-17' } });
  assert.deepEqual([angenommen.ergebnis.verwaltung.objekte[0].angebote[0].stand, angenommen.ergebnis.verwaltung.objekte[0].angebote[0].lexware], ['angenommen', 'AG-0001']);
  // Verwaltung mit Objekten und Objekt mit Angeboten lassen sich nicht mit einem Klick entfernen.
  assert.throws(() => anwenden(bestand, { ebene: 'verwaltung', id: vid, entfernen: true }), /noch Objekte/);
  assert.throws(() => anwenden(bestand, { ebene: 'objekt', verwaltungId: vid, id: oid, entfernen: true }), /noch Angebote/);
  const ohneAngebot = anwenden(bestand, { ebene: 'angebot', verwaltungId: vid, objektId: oid, id: aid, entfernen: true });
  const ohneObjekt = anwenden(ohneAngebot.bestand, { ebene: 'objekt', verwaltungId: vid, id: oid, entfernen: true });
  const leer = anwenden(ohneObjekt.bestand, { ebene: 'verwaltung', id: vid, entfernen: true });
  assert.equal(leer.bestand.verwaltungen.length, 0);
  assert.equal(leer.ergebnis.entfernt, true);
});

test('Liste: faellige zuerst, dann nach Datum, A-Z, kein Interesse am Ende; Zahlen und To-do', () => {
  const liste = [
    { id: 'z', name: 'Zeta', status: 'angeschrieben', wiedervorlage: '2026-11-10' },
    { id: 'a', name: 'Alpha', status: 'neu' },
    { id: 'f', name: 'Fällig', status: 'antwort', wiedervorlage: '2026-10-27' },
    { id: 'k', name: 'Kein', status: 'kein-interesse', wiedervorlage: '2026-10-01' },
    { id: 'h', name: 'Heute', status: 'kunde', wiedervorlage: '2026-10-28' },
  ];
  assert.deepEqual(hvFaellig(liste, '2026-10-28').map(v => v.id), ['f', 'h']);
  assert.deepEqual(sortiereHv(liste, '2026-10-28').map(v => v.id), ['f', 'h', 'z', 'a', 'k']);
  const { bestand } = mitObjektUndAngebot();
  assert.deepEqual(hvKennzahlen(bestand.verwaltungen[0]), { objekte: 1, wohnungen: 24, offeneAngebote: 1, auftraege: 0 });
  assert.equal(telHref('03301 / 000-000'), '03301000000');
  const todo = leiteTodosAb({ hausverwaltungen: hvFaellig(liste, '2026-10-28') }, { sicht: 'inhaber' }).find(t => t.id === 'hausverwaltungen');
  assert.equal(todo.titel, 'Hausverwaltungen: 2 wieder melden');
  assert.equal(todo.knopf.href, '#/hausverwaltungen');
  const eins = leiteTodosAb({ hausverwaltungen: [liste[2]] }, { sicht: 'inhaber' }).find(t => t.id === 'hausverwaltungen');
  assert.equal(eins.knopf.href, '#/hausverwaltungen?hv=f');
  assert.equal(leiteTodosAb({ hausverwaltungen: [] }, { sicht: 'inhaber' }).some(t => t.id === 'hausverwaltungen'), false);
});

function umgebung() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-hv-'));
  return { dir, privat: path.join(dir, 'privat') };
}

test('API: leer ohne Datei, Speichern landet privat (nur Besitzer lesbar), kaputtes JSON wird nicht ueberschrieben', async () => {
  const u = umgebung();
  const api = createApi({ root: u.dir, privatDirPath: u.privat, now: () => new Date('2026-10-28T08:00:00Z') });
  assert.deepEqual(await api.hausverwaltungenListe(), { verfuegbar: true, verwaltungen: [] });
  const r = await api.hausverwaltungenSpeichern({ ebene: 'verwaltung', daten: { name: 'Muster Hausverwaltung GmbH', status: 'angeschrieben' } }, { name: 'Mona Mitarbeiter' });
  assert.equal(r.ok, true);
  assert.match(r.id, /^hv-[0-9a-f]{10}$/);
  assert.equal(r.verwaltung.wiedervorlage, '2026-11-11');
  const datei = path.join(u.privat, 'hausverwaltungen', 'verwaltungen.json');
  assert.equal(fs.statSync(datei).mode & 0o777, 0o600);
  const o = await api.hausverwaltungenSpeichern({ ebene: 'objekt', verwaltungId: r.id, daten: { adresse: 'Musterweg 1', wohnungen: '12' } });
  assert.equal(o.verwaltung.objekte[0].wohnungen, 12);
  assert.equal((await api.hausverwaltungenListe()).verwaltungen[0].objekte.length, 1);
  await assert.rejects(api.hausverwaltungenSpeichern({ ebene: 'objekt', verwaltungId: r.id, daten: { adresse: '' } }), /Adresse fehlt/);
  fs.writeFileSync(datei, '{kaputt');
  await assert.rejects(api.hausverwaltungenListe(), /beschädigt/);
  await assert.rejects(api.hausverwaltungenSpeichern({ ebene: 'verwaltung', daten: { name: 'Noch eine' } }), /beschädigt/);
  assert.equal(fs.readFileSync(datei, 'utf8'), '{kaputt');
});

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: Hausverwaltungen fuer Mitarbeiter offen, Rolle lesen schreibt nichts (403)', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const u = umgebung();
  fs.mkdirSync(u.privat, { recursive: true });
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, path.join(u.privat, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = u.privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=hausverwaltungen-rollen');
  delete process.env.TP_DASHBOARD_PASSWORT;
  const post = (base, keks, body) => fetch(`${base}/api/hausverwaltungen/speichern`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: JSON.stringify(body) });
  try {
    await mitServer(mod.requestHandler, async base => {
      const keks = {};
      for (const [name, pw] of [['lena', 'platzhalter-lesen-1'], ['mona', 'platzhalter-mitarbeiter-1']]) {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort: pw }) });
        keks[name] = r.headers.get('set-cookie').split(';')[0];
      }
      const neu = { ebene: 'verwaltung', daten: { name: 'Muster Hausverwaltung GmbH' } };
      assert.equal((await post(base, keks.lena, neu)).status, 403);
      assert.equal(fs.existsSync(path.join(u.privat, 'hausverwaltungen', 'verwaltungen.json')), false);
      assert.equal((await fetch(`${base}/api/hausverwaltungen/liste`, { headers: { cookie: keks.lena } })).status, 200);
      assert.equal((await fetch(`${base}/api/hausverwaltungen/speichern`, { headers: { cookie: keks.mona } })).status, 405);
      const r = await post(base, keks.mona, neu);
      assert.equal(r.status, 200);
      assert.equal((await post(base, keks.mona, neu)).status, 400);
      const gespeichert = JSON.parse(fs.readFileSync(path.join(u.privat, 'hausverwaltungen', 'verwaltungen.json'), 'utf8'));
      assert.equal(gespeichert.verwaltungen[0].geaendertVon, 'Mona Mitarbeiter');
      const protokoll = fs.readFileSync(path.join(u.privat, 'protokoll.jsonl'), 'utf8');
      assert.match(protokoll, /"aktion":"Hausverwaltung angelegt","objekt":"Muster Hausverwaltung GmbH"/);
    });
  } finally {
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
  }
});

/* ---- Ansicht (ohne Browser: Modul mit Platzhaltern im vm) ---------------------------------- */

const quelltext = fs.readFileSync(new URL('../ansichten/hausverwaltungen.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** detail: true oeffnet die angelegte Verwaltung, ein Text eine bestimmte (auch eine fehlende) ID. */
function ansicht({ lesen = false, detail = false } = {}) {
  const dialogRoot = { innerHTML: '' };
  const state = { route: { view: 'hausverwaltungen', params: new URLSearchParams() } };
  const api = vm.runInNewContext(`${quelltext}\n({ hausverwaltungen, viewHausverwaltungen, hausverwaltungenKlick })`, {
    ...regeln, tageBis, esc, fmtDate: v => v, toast() {}, render() {}, state,
    istNurLesend: () => lesen, fetchEinkauf: async () => ({}), orgSchreiben: async () => ({}),
    emptyState: (t, h) => `<div class="empty">${esc(t)} ${esc(h)}</div>`, stoerungState: () => '<div class="notice crit">Störung</div>',
    // Formular-Ereignisse brauchen einen Browser (dashboard:pruefen); hier zaehlt nur das Markup.
    $: sel => (sel === '#dialogRoot form' ? { querySelector: () => ({ focus() {}, addEventListener() {} }), addEventListener() {} } : dialogRoot),
    location: { hash: '' }, window: { confirm: () => false },
  });
  const { bestand } = mitObjektUndAngebot();
  bestand.verwaltungen[0].notiz = '<script>nicht ausfuehren</script>';
  api.hausverwaltungen.daten = { verfuegbar: true, verwaltungen: bestand.verwaltungen };
  const vid = bestand.verwaltungen[0].id;
  if (detail) state.route.params.set('hv', detail === true ? vid : detail);
  return { ...api, dialogRoot, vid };
}

test('Ansicht: Liste mit Kontakt und Zahlen, Detail mit Objekt und Angebot, alles escaped', () => {
  const l = ansicht();
  const html = l.viewHausverwaltungen();
  assert.match(html, /<h1>Hausverwaltungen<\/h1>/);
  assert.match(html, /data-hv-neu/);
  assert.match(html, /href="tel:03301000000"/);
  assert.match(html, /1 Objekt · 24 Wohnungen · 1 Angebot offen/);
  const detail = ansicht({ detail: true }).viewHausverwaltungen();
  assert.match(detail, /Musterweg 1, 16515 Musterstadt/);
  assert.match(detail, /Lexware <b>AG-0001<\/b>/);
  assert.match(detail, /seit \d+ Tagen offen – nachfassen/);
  assert.match(detail, /href="tel:01700000000">anrufen/);
  assert.ok(!detail.includes('<script>nicht'));
  assert.match(detail, /&lt;script&gt;/);
  assert.match(ansicht({ detail: 'hv-gibtsnicht' }).viewHausverwaltungen(), /gibt es nicht mehr/);
});

test('Ansicht: Rolle lesen sieht keine Knoepfe; Klick auf "+ Objekt" oeffnet den Dialog mit Pflichtfeld', () => {
  const l = ansicht({ lesen: true });
  assert.ok(!l.viewHausverwaltungen().includes('data-hv-neu'));
  const d = ansicht({ lesen: true, detail: true });
  assert.ok(!/data-hv-(objekt|angebot|bearbeiten)/.test(d.viewHausverwaltungen()));
  const m = ansicht({ detail: true });
  assert.match(m.viewHausverwaltungen(), /data-hv-objekt="" data-hv-v=/);
  const ziel = { dataset: { hvObjekt: '', hvV: m.vid } };
  assert.equal(m.hausverwaltungenKlick({ target: { closest: s => (s === '[data-hv-objekt]' ? ziel : null) } }), true);
  assert.match(m.dialogRoot.innerHTML, /Neues Objekt · Muster Hausverwaltung GmbH/);
  assert.match(m.dialogRoot.innerHTML, /name="adresse"[^>]*required/);
  assert.ok(!m.dialogRoot.innerHTML.includes('data-hv-entfernen'));
  assert.equal(m.hausverwaltungenKlick({ target: { closest: () => null } }), false);
});

test('Ansicht: ohne Eintraege ein Leerzustand mit dem naechsten Schritt', () => {
  const l = ansicht();
  l.hausverwaltungen.daten = { verfuegbar: true, verwaltungen: [] };
  assert.match(l.viewHausverwaltungen(), /Noch keine Hausverwaltung eingetragen\. Mit „\+ Hausverwaltung“/);
});
