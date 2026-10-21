import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen: TP_PRIVAT_DIR auf einen Testordner
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { leseAkquiseCsv, wendeAenderungAn, faelligeWiedervorlagen, vorlageAusMarkdown, nachrichtFuer, akquiseId, naechsteFirmen, akquiseFortschritt, kontaktTeile, mailtoLink, warumInteressant, kmAbOranienburg, tageBis, titelKurz, richtpreisZeile, angebotsEntwurf, pruefeReferenz, angeschriebenVon } from '../lib/akquise.mjs';
import { ausTed } from '../../../operations/lib/ausschreibungen.mjs';
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

test('Als Naechstes: faellig zuerst, dann neu nach Wohnungen und Naehe; spaeter zurueckgelegte warten', () => {
  const firmen = [
    { id: 'klein-nah', name: 'K', ort: 'Oranienburg', status: 'neu', wohnungen: '' },
    { id: 'gross', name: 'G', ort: 'Eberswalde', status: 'neu', wohnungen: '2.500' },
    { id: 'mittel-fern', name: 'M', ort: 'Nauen', status: 'neu', wohnungen: '' },
    { id: 'faellig', name: 'F', ort: 'Velten', status: 'angeschrieben', wiedervorlage: '2026-10-19' },
    { id: 'spaeter', name: 'S', ort: 'Velten', status: 'neu', wiedervorlage: '2026-10-27' },
    { id: 'wartet', name: 'W', status: 'angeschrieben', wiedervorlage: '2026-11-01' },
  ];
  assert.deepEqual(naechsteFirmen(firmen, '2026-10-20').map(f => f.id), ['faellig', 'gross', 'klein-nah', 'mittel-fern']);
  assert.deepEqual(akquiseFortschritt([...firmen, { status: 'auftrag' }, { status: 'kein-interesse' }]), { gesamt: 8, angeschrieben: 4, antworten: 1, auftraege: 1 });
  assert.equal(kmAbOranienburg('Berlin-Pankow'), 28);
  assert.equal(kmAbOranienburg('Irgendwo'), null);
  assert.match(warumInteressant({ ort: 'Oranienburg', wohnungen: '1200' }), /^Rund 1\.200 Wohnungen.*direkt bei uns in Oranienburg\.$/);
});

test('Nachgefasst: Status bleibt, Wiedervorlage +14, Zaehler steigt', () => {
  const n = wendeAenderungAn({ status: 'angeschrieben', wiedervorlage: '2026-10-20' }, { aktion: 'nachgefasst' }, '2026-10-20');
  assert.equal(n.status, 'angeschrieben');
  assert.equal(n.wiedervorlage, '2026-11-03');
  assert.equal(n.nachgefasst, 1);
  assert.throws(() => wendeAenderungAn({}, { aktion: 'loeschen' }, '2026-10-20'));
});

test('Kontakt, mailto und Frist', () => {
  assert.deepEqual(kontaktTeile('info@muster.example / 03301 1234-0'), { email: 'info@muster.example', telefon: '03301 1234-0', telLink: '0330112340' });
  assert.deepEqual(kontaktTeile('03301 802834').email, '');
  assert.equal(kontaktTeile('').telefon, '');
  const m = mailtoLink('a@b.example', 'An: X\n\nBetreff: Boden & mehr\n\nHallo X');
  assert.equal(m, 'mailto:a@b.example?subject=Boden%20%26%20mehr&body=Hallo%20X');
  assert.equal(tageBis('2026-10-27', '2026-10-20'), 7);
  assert.equal(tageBis('', '2026-10-20'), null);
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
  assert.equal(d.firmen[0].kontakt, 'x');
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

test('Server: Akquise fuer Mitarbeiter offen, Rolle lesen schreibt nichts (403)', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const u = umgebung();
  fs.mkdirSync(u.privat, { recursive: true });
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, path.join(u.privat, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = u.privat;
  Object.assign(process.env, u.env);
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=akquise-rollen');
  delete process.env.TP_DASHBOARD_PASSWORT;
  const post = (base, keks, pfad, body) => fetch(`${base}/api/${pfad}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: JSON.stringify(body) });
  try {
    await mitServer(mod.requestHandler, async base => {
      const keks = {};
      for (const [name, pw] of [['lena', 'platzhalter-lesen-1'], ['mona', 'platzhalter-mitarbeiter-1']]) {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort: pw }) });
        keks[name] = r.headers.get('set-cookie').split(';')[0];
      }
      for (const [pfad, body] of [['akquise/aendern', { id: 'muster-wohnbau-eg', status: 'angeschrieben' }], ['akquise/referenz', { orderId: '1', notiz: 'x' }], ['einkauf/kundentermin', { orderId: '1', termin: '2026-10-22' }]]) {
        assert.equal((await post(base, keks.lena, pfad, body)).status, 403, `lesen ${pfad}`);
      }
      assert.equal(fs.existsSync(path.join(u.privat, 'akquise', 'status.json')), false);
      assert.equal((await fetch(`${base}/api/akquise/liste`, { headers: { cookie: keks.mona } })).status, 200);
      assert.equal((await post(base, keks.mona, 'akquise/aendern', { id: 'muster-wohnbau-eg', status: 'angeschrieben' })).status, 200);
      assert.equal((await post(base, keks.mona, 'akquise/referenz', { orderId: '1', auftrag: '#1001', notiz: 'Vinyl 3 Räume' })).status, 200);
      assert.equal((await post(base, keks.mona, 'einkauf/kundentermin', { orderId: '1', termin: '2026-10-22' })).status, 200);
      const stand = JSON.parse(fs.readFileSync(path.join(u.privat, 'akquise', 'status.json'), 'utf8'));
      assert.equal(stand.firmen['muster-wohnbau-eg'].angeschriebenVon, 'Mona Mitarbeiter');
    });
  } finally {
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
    for (const k of Object.keys(u.env)) delete process.env[k];
  }
});

test('Ausschreibung: Land und Kategorie fallen aus dem TED-Titel weg', () => {
  assert.equal(titelKurz('Deutschland – Bodenbelagsarbeiten – Rahmenvertrag über Bodenbelagsarbeiten auf Abruf'), 'Rahmenvertrag über Bodenbelagsarbeiten auf Abruf');
  assert.equal(titelKurz('Deutschland – Bauarbeiten – Bundesrat - Anbau - Bodenbelagarbeiten'), 'Bundesrat - Anbau - Bodenbelagarbeiten');
  assert.equal(titelKurz('Sanierung Kita – Bodenbelag'), 'Sanierung Kita – Bodenbelag');
  assert.equal(ausTed({ notices: [{ 'publication-number': '1-2026', 'notice-title': { deu: 'Deutschland – Bodenbelagsarbeiten – Schule Nord' } }] })[0].titel, 'Schule Nord');
});

test('Richtpreis: nur sichtbar mit Datei, ohne Freigabe der Hinweis, Entwurf ohne erfundene Preise', () => {
  assert.equal(richtpreisZeile(null), null);
  const rp = { freigegeben: false, positionen: [{ text: 'Vinyl inkl. Verlegung', preis_m2: 17.95 }] };
  assert.equal(richtpreisZeile(rp).text, 'Richtpreis noch nicht freigegeben (Inhaber)');
  assert.equal(richtpreisZeile({ freigegeben: true, positionen: [{ text: 'X', preis_m2: null }] }).freigegeben, false);
  assert.equal(richtpreisZeile({ ...rp, freigegeben: true }).text, 'Vinyl inkl. Verlegung ab 17,95 €/m²');
  assert.match(angebotsEntwurf('Muster eG', rp), /- Vinyl inkl\. Verlegung: Preis nach Aufmaß/);
  assert.match(angebotsEntwurf('Muster eG', { ...rp, freigegeben: true }), /Muster eG[\s\S]*17,95 € je m²/);
});

test('Referenz pruefen und Fortschritt nach Namen', () => {
  assert.throws(() => pruefeReferenz({ orderId: '1' }), /notieren/);
  assert.deepEqual(pruefeReferenz({ orderId: '1', auftrag: '#1001', notiz: ' Vinyl ' }), { orderId: '1', auftrag: '#1001', notiz: 'Vinyl' });
  assert.deepEqual(angeschriebenVon([{ status: 'angeschrieben', angeschriebenVon: 'Tobias' }, { status: 'antwort', angeschriebenVon: 'Tobias' }, { status: 'angeschrieben', angeschriebenVon: 'Ahmet' }, { status: 'neu' }]), [['Tobias', 2], ['Ahmet', 1]]);
});

test('Kundentermin: am Vortag ein To-do im Laden mit fertigem Erinnerungstext', () => {
  const quellen = { kundentermine: [{ orderId: '1', auftragName: '#1001', kundeName: 'Frau Muster', termin: '2026-10-21' }, { orderId: '2', auftragName: '#1002', termin: '2026-10-25' }] };
  const t = leiteTodosAb(quellen, { sicht: 'laden', jetzt: new Date('2026-10-20T09:00:00') }).filter(x => x.art === 'kundentermin');
  assert.equal(t.length, 1);
  assert.equal(t[0].titel, 'Kunde an Termin morgen erinnern: #1001');
  assert.match(t[0].knopf.kopiertext, /^Guten Tag Frau Muster,[\s\S]*morgen, 21\.10\.2026, zu Ihrer Bestellung #1001/);
});
