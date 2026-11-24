import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { durchgang, entwurfAblegen, holeAusDropbox, ordner, pruefeAuftrag } from '../lib/mail-entwuerfe.mjs';
import { main } from '../scripts/mail-entwuerfe.mjs';

const ZUGANG = { benutzer: 'kontakt@beispiel.test', passwort: 'geheim', absender: 'kontakt@beispiel.test', absenderName: 'Beispiel' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mail-entwuerfe-'));
function auftrag(privat, name, inhalt, anhaenge = {}) {
  const { eingang } = ordner(privat);
  fs.mkdirSync(eingang, { recursive: true });
  for (const [n, b] of Object.entries(anhaenge)) fs.writeFileSync(path.join(eingang, n), b);
  fs.writeFileSync(path.join(eingang, name), typeof inhalt === 'string' ? inhalt : JSON.stringify(inhalt));
}

test('Auftrag mit Anhang wird Entwurf (multipart, Cc, Anhang base64) und landet in erledigt/', async () => {
  const privat = tmp();
  auftrag(privat, 'a.json', { an: 'kunde@beispiel.test', cc: ['buero@beispiel.test'], betreff: 'Formular Übergabe', text: 'Hallo,\nanbei.', anhaenge: ['Formular ä 1.pdf'] }, { 'Formular ä 1.pdf': '%PDF-1.4 test' });
  const abgelegt = [];
  const e = await durchgang({ privat, zugang: ZUGANG, ablegen: async (z, d) => abgelegt.push(d), jetzt: new Date('2026-11-24T10:00:00Z') });
  assert.deepEqual(e, [{ datei: 'a.json', status: 'angelegt' }]);
  const d = abgelegt[0];
  assert.match(d, /^To: kunde@beispiel\.test$/m);
  assert.match(d, /^Cc: buero@beispiel\.test$/m);
  assert.match(d, /multipart\/mixed/);
  assert.match(d, /application\/pdf; name="Formular_a_1\.pdf"/);
  assert.ok(d.includes(Buffer.from('%PDF-1.4 test').toString('base64')));
  const o = ordner(privat);
  assert.deepEqual(fs.readdirSync(o.eingang), []);
  const [erl] = fs.readdirSync(o.erledigt);
  assert.deepEqual(fs.readdirSync(path.join(o.erledigt, erl)).sort(), ['Formular ä 1.pdf', 'a.json']);
});

test('fehlender Anhang wartet, nach 24 h Fehler; kaputter Auftrag geht nach fehler/', async () => {
  const privat = tmp();
  auftrag(privat, 'w.json', { an: 'k@beispiel.test', betreff: 'x', text: 'y', anhaenge: ['fehlt.pdf'] });
  auftrag(privat, 'k.json', '{kaputt');
  const ablegen = async () => assert.fail('darf nicht ablegen');
  const e = await durchgang({ privat, zugang: ZUGANG, ablegen });
  assert.deepEqual(e.map(x => [x.datei, x.status]), [['k.json', 'fehler'], ['w.json', 'wartet']]);
  assert.ok(fs.existsSync(path.join(ordner(privat).eingang, 'w.json')));
  const spaet = await durchgang({ privat, zugang: ZUGANG, ablegen, jetzt: new Date(Date.now() + 25 * 3600_000) });
  assert.deepEqual(spaet.map(x => x.status), ['fehler']);
  for (const d of fs.readdirSync(ordner(privat).fehler)) assert.ok(fs.existsSync(path.join(ordner(privat).fehler, d, 'FEHLER.txt')));
});

test('Pruefung: Pfade, Typen, Adressen', () => {
  const v = tmp();
  assert.match(pruefeAuftrag({ an: 'a@b.de', betreff: 'x', text: 'y', anhaenge: ['../x.pdf'] }, v).fehler, /Anhang ungültig/);
  assert.match(pruefeAuftrag({ an: 'a@b.de', betreff: 'x', text: 'y', anhaenge: ['x.exe'] }, v).fehler, /Dateityp/);
  assert.match(pruefeAuftrag({ an: 'kein', betreff: 'x', text: 'y' }, v).fehler, /an/);
  assert.match(pruefeAuftrag({ an: 'a@b.de', text: 'y' }, v).fehler, /betreff/);
  assert.ok(pruefeAuftrag({ an: ['a@b.de'], betreff: 'x', text: 'y' }, v).auftrag);
});

test('Netzfehler: Auftrag bleibt liegen', async () => {
  const privat = tmp();
  auftrag(privat, 'a.json', { an: 'k@beispiel.test', betreff: 'x', text: 'y' });
  await assert.rejects(durchgang({ privat, zugang: ZUGANG, ablegen: async () => { throw new Error('IMAP weg'); } }), /IMAP weg/);
  assert.ok(fs.existsSync(path.join(ordner(privat).eingang, 'a.json')));
});

test('main: leerer Eingang meldet nicht an', async () => {
  assert.equal(await main({ privat: tmp(), dropbox: null, zugangLesen: () => assert.fail('keine Anmeldung') }), 0);
});

test('entwurfAblegen: APPEND mit Literal nur in den \\Drafts-Ordner, kein Senden', async () => {
  const gesendet = [];
  const sock = new EventEmitter();
  const antwort = t => setImmediate(() => sock.emit('data', Buffer.from(t)));
  sock.write = (d) => {
    const t = String(d);
    gesendet.push(t);
    const m = /^(A\d+) (\w+)/.exec(t);
    if (t === '\r\n') return antwort(`${sock.marke} OK [APPENDUID 1 2] APPEND completed\r\n`);
    if (!m) return;
    if (m[2] === 'LOGIN') antwort(`${m[1]} OK\r\n`);
    if (m[2] === 'LIST') antwort(`* LIST (\\HasNoChildren \\Drafts) "/" "[Gmail]/Entw&APw-rfe"\r\n* LIST (\\All) "/" "[Gmail]/Alle Nachrichten"\r\n${m[1]} OK\r\n`);
    if (m[2] === 'APPEND') { sock.marke = m[1]; antwort('+ go ahead\r\n'); }
    if (m[2] === 'LOGOUT') antwort(`${m[1]} OK\r\n`);
  };
  sock.destroy = sock.end = () => {};
  await entwurfAblegen(ZUGANG, 'Subject: x\r\n\r\nHallo\r\n', { zeitLimitMs: 2000, verbinden: () => { antwort('* OK hallo\r\n'); return sock; } });
  const append = gesendet.find(t => / APPEND /.test(t));
  assert.equal(append, 'A3 APPEND "[Gmail]/Entw&APw-rfe" (\\Draft \\Seen) {21}\r\n');
  assert.ok(gesendet.includes('Subject: x\r\n\r\nHallo\r\n'));
  assert.ok(!gesendet.some(t => /SMTP|STORE|EXPUNGE|COPY/.test(t)));
});

test('Dropbox: Dateien wandern nach eingang/, Unterordner, versteckte und belegte Namen bleiben', () => {
  const privat = tmp();
  const quelle = path.join(tmp(), 'TP Mail-Entwuerfe');
  const { eingang } = ordner(privat);
  fs.mkdirSync(path.join(quelle, 'unter'), { recursive: true });
  fs.mkdirSync(eingang, { recursive: true });
  for (const n of ['a.json', '.dropbox', 'b.json']) fs.writeFileSync(path.join(quelle, n), n);
  fs.writeFileSync(path.join(eingang, 'b.json'), 'alt');
  assert.deepEqual(holeAusDropbox(quelle, eingang), ['a.json']);
  assert.deepEqual(fs.readdirSync(quelle).sort(), ['.dropbox', 'b.json', 'unter']);
  assert.equal(fs.readFileSync(path.join(eingang, 'a.json'), 'utf8'), 'a.json');
  assert.deepEqual(holeAusDropbox(null, eingang), []);
});

test('Formular: Vorlage aus vorlagen/ wird gefuellt, angehaengt und bleibt liegen; Fehler beim Fuellen -> fehler/', async () => {
  const privat = tmp();
  const o = ordner(privat);
  fs.mkdirSync(o.vorlagen, { recursive: true });
  fs.writeFileSync(path.join(o.vorlagen, 'antrag.pdf'), '%PDF leer');
  auftrag(privat, 'f.json', { an: 'k@beispiel.test', betreff: 'Antrag', text: 'anbei', formular: { vorlage: 'antrag.pdf', werte: { Name: 'Muster' }, name: 'Antrag Müller.pdf' } });
  const gefuellt = [];
  const fuellen = (vorlage, werte, ziel) => { gefuellt.push([path.basename(vorlage), werte]); fs.writeFileSync(ziel, '%PDF gefuellt'); fs.writeFileSync(`${ziel}.png`, 'png'); };
  const abgelegt = [];
  const e = await durchgang({ privat, zugang: ZUGANG, ablegen: async (z, d) => abgelegt.push(d), fuellen });
  assert.deepEqual(e, [{ datei: 'f.json', status: 'angelegt' }]);
  assert.deepEqual(gefuellt, [['antrag.pdf', { Name: 'Muster' }]]);
  assert.match(abgelegt[0], /filename="Antrag_Muller\.pdf"/);
  assert.ok(abgelegt[0].includes(Buffer.from('%PDF gefuellt').toString('base64')));
  assert.ok(fs.existsSync(path.join(o.vorlagen, 'antrag.pdf')), 'Vorlage aus vorlagen/ bleibt');
  const [erl] = fs.readdirSync(o.erledigt);
  assert.deepEqual(fs.readdirSync(path.join(o.erledigt, erl)).sort(), ['Antrag_Muller.pdf', 'Antrag_Muller.pdf.png', 'f.json']);

  auftrag(privat, 'g.json', { an: 'k@beispiel.test', betreff: 'x', text: 'y', formular: { vorlage: 'antrag.pdf', werte: { Falsch: 1 } } });
  const f = await durchgang({ privat, zugang: ZUGANG, ablegen: async () => assert.fail('nie ablegen'), fuellen: () => { throw new Error('Formular: unbekanntes Feld Falsch'); } });
  assert.deepEqual(f, [{ datei: 'g.json', status: 'fehler', grund: 'Formular: unbekanntes Feld Falsch' }]);
});

test('Formular: Pruefung der Angaben, fehlende Vorlage wartet', () => {
  const v = tmp();
  const basis = { an: 'a@b.de', betreff: 'x', text: 'y' };
  assert.match(pruefeAuftrag({ ...basis, formular: { vorlage: '../x.pdf', werte: {} } }, v).fehler, /vorlage/);
  assert.match(pruefeAuftrag({ ...basis, formular: { vorlage: 'x.pdf', werte: [] } }, v).fehler, /werte/);
  assert.match(pruefeAuftrag({ ...basis, formular: { vorlage: 'x.pdf', werte: {} } }, v).warten, /Formularvorlage/);
});

const VMA = 'kontakt755/teppich-paradies-vma';
const COMMIT = 'a'.repeat(40);
const sha = b => createHash('sha256').update(b).digest('hex');
const XLSX = Buffer.from('PK\x03\x04 erfundene Tabelle');

test('anhaenge_git: Datei genau aus dem Commit, Pruefsumme stimmt -> Anhang', async () => {
  const privat = tmp();
  auftrag(privat, 'v.json', { an: 'k@beispiel.test', betreff: 'VMA', text: 'anbei', anhaenge_git: { repo: VMA, commit: COMMIT, dateien: [{ pfad: 'ausgabe/2026-11/VMA Müller.xlsx', sha256: sha(XLSX) }] } });
  const geholt = [];
  const abgelegt = [];
  const e = await durchgang({ privat, zugang: ZUGANG, ablegen: async (z, d) => abgelegt.push(d), holen: (...a) => { geholt.push(a); return XLSX; } });
  assert.deepEqual(e, [{ datei: 'v.json', status: 'angelegt' }]);
  assert.deepEqual(geholt, [[VMA, COMMIT, 'ausgabe/2026-11/VMA Müller.xlsx']]);
  assert.match(abgelegt[0], /spreadsheetml\.sheet; name="VMA_Muller\.xlsx"/);
  assert.ok(abgelegt[0].includes(XLSX.toString('base64')));
});

test('anhaenge_git: falsche Pruefsumme oder 404 -> fehler/, Netzfehler -> bleibt liegen', async () => {
  const privat = tmp();
  const ablegen = async () => assert.fail('nie ablegen');
  auftrag(privat, 'a.json', { an: 'k@beispiel.test', betreff: 'x', text: 'y', anhaenge_git: { repo: VMA, commit: COMMIT, dateien: [{ pfad: 'ausgabe/a.xlsx', sha256: 'b'.repeat(64) }] } });
  assert.deepEqual(await durchgang({ privat, zugang: ZUGANG, ablegen, holen: () => XLSX }), [{ datei: 'a.json', status: 'fehler', grund: 'sha256 weicht ab: ausgabe/a.xlsx' }]);
  auftrag(privat, 'b.json', { an: 'k@beispiel.test', betreff: 'x', text: 'y', anhaenge_git: { repo: VMA, commit: COMMIT, dateien: [{ pfad: 'ausgabe/b.xlsx', sha256: sha(XLSX) }] } });
  const nichtDa = () => { throw Object.assign(new Error('Git: ausgabe/b.xlsx: gh: Not Found (HTTP 404)'), { auftragFalsch: true }); };
  assert.equal((await durchgang({ privat, zugang: ZUGANG, ablegen, holen: nichtDa }))[0].status, 'fehler');
  auftrag(privat, 'c.json', { an: 'k@beispiel.test', betreff: 'x', text: 'y', anhaenge_git: { repo: VMA, commit: COMMIT, dateien: [{ pfad: 'ausgabe/c.xlsx', sha256: sha(XLSX) }] } });
  await assert.rejects(durchgang({ privat, zugang: ZUGANG, ablegen, holen: () => { throw new Error('Git: Zeitlimit'); } }), /Zeitlimit/);
  assert.ok(fs.existsSync(path.join(ordner(privat).eingang, 'c.json')));
});

test('anhaenge_git: Erlaubnisliste, Pfad nur unter ausgabe/, voller Commit, Typ', () => {
  const v = tmp();
  const g = (x) => pruefeAuftrag({ an: 'a@b.de', betreff: 'x', text: 'y', anhaenge_git: { repo: VMA, commit: COMMIT, dateien: [{ pfad: 'ausgabe/x.xlsx', sha256: 'c'.repeat(64) }], ...x } }, v);
  assert.ok(g({}).git);
  assert.match(g({ repo: 'kontakt755/anderes' }).fehler, /nicht erlaubt/);
  assert.match(g({ commit: 'abc123' }).fehler, /Commit/);
  for (const pfad of ['ausgabe/../geheim.xlsx', 'quelle/x.xlsx', '/ausgabe/x.xlsx', 'ausgabe//x.xlsx', 'ausgabe\\..\\x.xlsx'])
    assert.match(g({ dateien: [{ pfad, sha256: 'c'.repeat(64) }] }).fehler, /Git-Pfad/, pfad);
  assert.match(g({ dateien: [{ pfad: 'ausgabe/x.exe', sha256: 'c'.repeat(64) }] }).fehler, /Dateityp/);
  assert.match(g({ dateien: [{ pfad: 'ausgabe/x.xlsx', sha256: 'kurz' }] }).fehler, /sha256/);
});
