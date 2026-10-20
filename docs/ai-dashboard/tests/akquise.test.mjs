import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen: TP_PRIVAT_DIR auf einen Testordner
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { leseAkquiseCsv, wendeAenderungAn, faelligeWiedervorlagen, vorlageAusMarkdown, nachrichtFuer, akquiseId } from '../lib/akquise.mjs';
import { leiteTodosAb } from '../lib/todos.mjs';

// Ausgedachte Firmen - echte Kontakte gehoeren nie ins Repository.
const CSV = 'name;ort;typ;wohnungen;stand;website;kontakt;quelle\nMuster Wohnbau eG;Musterstadt;Genossenschaft;1200;;https://muster.example;x;y\nBeispiel Verwaltung GmbH;Beispielort;Verwaltung;;;;;\n';
const VORLAGE = '---\nname: x\n---\nVorspann\n\n## 1. E-Mail\n\n**Betreff:** Boden\n\nSehr geehrte Damen und Herren,\nText.\n\n## 2. Brief-Variante\n\nAn: [Name des Unternehmens]\n';

function umgebung() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-akquise-'));
  fs.writeFileSync(path.join(dir, 'liste.csv'), CSV);
  fs.writeFileSync(path.join(dir, 'vorlage.md'), VORLAGE);
  const privat = path.join(dir, 'privat');
  return { dir, privat, env: { TP_AKQUISE_CSV: path.join(dir, 'liste.csv'), TP_AKQUISE_VORLAGE: path.join(dir, 'vorlage.md') } };
}

test('CSV: Semikolon, Kopfzeile, stabile ID aus dem Namen', () => {
  const f = leseAkquiseCsv(CSV);
  assert.equal(f.length, 2);
  assert.equal(f[0].id, 'muster-wohnbau-eg');
  assert.equal(f[0].wohnungen, '1200');
  assert.equal(akquiseId('Über Wohnen'), 'uber-wohnen');
  assert.equal(leseAkquiseCsv('name;ort\n"""Eintracht"" eG";X\n')[0].name, '"Eintracht" eG');
});

test('Aenderung: angeschrieben setzt Wiedervorlage +14 Tage, Abschluss loescht sie, falscher Status wirft', () => {
  const a = wendeAenderungAn({ status: 'neu' }, { status: 'angeschrieben' }, '2026-10-20');
  assert.equal(a.wiedervorlage, '2026-11-03');
  assert.equal(a.letzteAktion, '2026-10-20');
  assert.equal(wendeAenderungAn(a, { status: 'kein-interesse' }, '2026-10-21').wiedervorlage, '');
  assert.throws(() => wendeAenderungAn({}, { status: 'quatsch' }, '2026-10-20'));
  assert.throws(() => wendeAenderungAn({}, { wiedervorlage: 'morgen' }, '2026-10-20'));
});

test('Faellig: Wiedervorlage erreicht, offene Firmen; To-do "Akquise: N Nachfassen faellig" beim Inhaber', () => {
  const firmen = [
    { id: 'a', name: 'A', status: 'angeschrieben', wiedervorlage: '2026-10-20' },
    { id: 'b', name: 'B', status: 'angeschrieben', wiedervorlage: '2026-10-21' },
    { id: 'c', name: 'C', status: 'auftrag', wiedervorlage: '2026-10-01' },
  ];
  const f = faelligeWiedervorlagen(firmen, '2026-10-20');
  assert.deepEqual(f.map(x => x.id), ['a']);
  const todos = leiteTodosAb({ akquise: f }, { sicht: 'inhaber' });
  assert.equal(todos.find(t => t.id === 'akquise').titel, 'Akquise: 1 Nachfassen fällig');
  assert.equal(leiteTodosAb({ akquise: [] }, { sicht: 'inhaber' }).some(t => t.id === 'akquise'), false);
});

test('Vorlage: E-Mail-Abschnitt ohne Markdown, Firmenname eingesetzt', () => {
  const v = vorlageAusMarkdown(VORLAGE);
  assert.equal(v, 'Betreff: Boden\n\nSehr geehrte Damen und Herren,\nText.');
  assert.match(nachrichtFuer(v, 'Muster Wohnbau eG'), /^An: Muster Wohnbau eG\n\nBetreff: Boden/);
  assert.equal(nachrichtFuer('An: [Name des Unternehmens]', 'X'), 'An: X');
});

test('API: Liste mit Standardstand, Aenderung landet privat, kaputter Stand wird nicht ueberschrieben', async () => {
  const u = umgebung();
  const api = createApi({ root: u.dir, privatDirPath: u.privat, env: u.env, now: () => new Date('2026-10-20T08:00:00Z') });
  const d = await api.akquiseListe();
  assert.equal(d.verfuegbar, true);
  assert.equal(d.firmen[0].status, 'neu');
  assert.match(d.vorlage, /^Betreff: Boden/);
  const r = await api.akquiseAendern({ id: 'muster-wohnbau-eg', status: 'angeschrieben' }, { kuerzel: 'ahmet' });
  assert.equal(r.firma.wiedervorlage, '2026-11-03');
  const gespeichert = JSON.parse(fs.readFileSync(path.join(u.privat, 'akquise', 'status.json'), 'utf8'));
  assert.equal(gespeichert.firmen['muster-wohnbau-eg'].status, 'angeschrieben');
  assert.equal((await api.akquiseListe()).firmen[0].status, 'angeschrieben');
  await assert.rejects(api.akquiseAendern({ id: 'gibt-es-nicht', status: 'neu' }), /Unbekannte Firma/);
  fs.writeFileSync(path.join(u.privat, 'akquise', 'status.json'), '{kaputt');
  await assert.rejects(api.akquiseAendern({ id: 'muster-wohnbau-eg', notiz: 'x' }), /beschädigt/);
  assert.equal(fs.readFileSync(path.join(u.privat, 'akquise', 'status.json'), 'utf8'), '{kaputt');
});

test('API: ohne Firmenliste ein Hinweis statt Fehler', async () => {
  const u = umgebung();
  const api = createApi({ root: u.dir, privatDirPath: u.privat, env: { TP_AKQUISE_CSV: path.join(u.dir, 'fehlt.csv') } });
  assert.equal((await api.akquiseListe()).verfuegbar, false);
});

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: /api/akquise/* nur fuer den Inhaber - lesen und mitarbeiter bekommen 403', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const u = umgebung();
  fs.mkdirSync(u.privat, { recursive: true });
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, path.join(u.privat, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = u.privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=akquise-rollen');
  delete process.env.TP_DASHBOARD_PASSWORT;
  try {
    await mitServer(mod.requestHandler, async base => {
      for (const [name, pw] of [['lena', 'platzhalter-lesen-1'], ['mona', 'platzhalter-mitarbeiter-1']]) {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort: pw }) });
        const keks = r.headers.get('set-cookie').split(';')[0];
        assert.equal((await fetch(`${base}/api/akquise/liste`, { headers: { cookie: keks } })).status, 403);
        const w = await fetch(`${base}/api/akquise/aendern`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: JSON.stringify({ id: 'muster-wohnbau-eg', status: 'neu' }) });
        assert.equal(w.status, 403);
      }
      assert.equal(fs.existsSync(path.join(u.privat, 'akquise', 'status.json')), false);
    });
  } finally {
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
  }
});
