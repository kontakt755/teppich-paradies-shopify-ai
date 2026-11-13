// Ausschliesslich erfundene Werte und Seitenausschnitte, kein Netz, keine Vertragskonditionen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isoWoche, gelDieselAusSeite, gelDieselNachtragen, gelDieselMeldung } from '../lib/gel-diesel.mjs';
import { main, ladeSeite } from '../scripts/gel-diesel-nachtragen.mjs';
import { leseVersandtarife } from '../lib/versandtarife.mjs';
import { liesStatus, routinenStand } from '../lib/routinen.mjs';

const zeile = (kw, wert) => `<tr><td><span class="uael-table__text-inner">${kw}* </span></td><td><span class="uael-table__text-inner">${wert}</span></td></tr>`;
// Wie die echte Seite: Ueberschrift nennt die Folgewoche, Tabelle neueste zuerst, ein Skript mit Stoerzeile.
const SEITE = `<html><head><meta property="og:description" content="Abrechnung KW 47/2026: 19,8% Vorgehensweise"/>
<script>var x = 'KW 46/2026 99%';</script></head><body><h2>Abrechnung KW 47/2026: 19,8%</h2><table><tbody>${[
  ['KW 53/2026', '17,5%'], ['KW 52/2026', '17,9%'], ['KW 48/2026', '19,0%'], ['KW 47/2026', '19,8%'],
  ['KW 46/2026', '20,4%'], ['KW 45/2026', '21.1%'], ['KW 01/2026', '18,2%'], ['KW 52/2025', '18,7%'],
  ['KW 01/2025', '22,2%'], ['KW 20/2026', '0,0%'],
].map(([kw, w]) => zeile(kw, w)).join('')}</tbody></table></body></html>`;

test('isoWoche: Montag bis Sonntag, Jahreswechsel und 53. Woche', () => {
  assert.deepEqual(isoWoche('2026-11-09'), { jahr: 2026, woche: 46, von: '2026-11-09', bis: '2026-11-15' });
  assert.equal(isoWoche('2026-11-15').woche, 46, 'Sonntag gehoert noch zur Woche');
  assert.equal(isoWoche('2026-11-16').woche, 47);
  assert.deepEqual(isoWoche('2026-01-01'), { jahr: 2026, woche: 1, von: '2025-12-29', bis: '2026-01-04' });
  assert.deepEqual(isoWoche('2025-12-29'), { jahr: 2026, woche: 1, von: '2025-12-29', bis: '2026-01-04' });
  assert.deepEqual(isoWoche('2025-12-28'), { jahr: 2025, woche: 52, von: '2025-12-22', bis: '2025-12-28' });
  assert.deepEqual(isoWoche('2026-12-31'), { jahr: 2026, woche: 53, von: '2026-12-28', bis: '2027-01-03' });
  assert.deepEqual(isoWoche('2027-01-01'), { jahr: 2026, woche: 53, von: '2026-12-28', bis: '2027-01-03' });
  assert.deepEqual(isoWoche('2027-01-04'), { jahr: 2027, woche: 1, von: '2027-01-04', bis: '2027-01-10' });
  for (const falsch of ['2026-02-30', '13.11.2026', '', undefined]) assert.throws(() => isoWoche(falsch), /Datum ungültig/);
});

test('Seite: richtige Woche, Zeitraum Montag bis Sonntag, Skripttext und Ueberschrift stoeren nicht', () => {
  assert.deepEqual(gelDieselAusSeite(SEITE, '2026-11-12'), { satz: 0.204, von: '2026-11-09', bis: '2026-11-15' });
  assert.deepEqual(gelDieselAusSeite(SEITE, '2026-11-17'), { satz: 0.198, von: '2026-11-16', bis: '2026-11-22' });
  assert.equal(gelDieselAusSeite(SEITE, '2026-11-23').satz, 0.19);
});

test('Seite: Komma und Punkt als Dezimalzeichen, ohne Rundungsrest', () => {
  assert.equal(gelDieselAusSeite(SEITE, '2026-11-04').satz, 0.211, 'Punkt');
  assert.equal(gelDieselAusSeite(SEITE, '2026-11-17').satz, 0.198, 'Komma');
  assert.equal(gelDieselAusSeite('KW 46/2026* 23,7%', '2026-11-10').satz, 0.237);
  assert.equal(gelDieselAusSeite('KW 46/2026*\t24,6%\nKW 45/2026*\t24,0%', '2026-11-10').satz, 0.246, 'reiner Text mit Tabulator');
  assert.equal(gelDieselAusSeite('<td>KW&nbsp;46/2026*</td><td>24&#44;6&nbsp;%</td>', '2026-11-10').satz, 0.246, 'Entitaeten');
});

test('Seite: Jahreswechsel - KW 01, KW 52 und KW 53 mit dem richtigen Jahr', () => {
  assert.deepEqual(gelDieselAusSeite(SEITE, '2026-01-02'), { satz: 0.182, von: '2025-12-29', bis: '2026-01-04' }, 'KW 01/2026, nicht KW 01/2025');
  assert.deepEqual(gelDieselAusSeite(SEITE, '2025-12-23'), { satz: 0.187, von: '2025-12-22', bis: '2025-12-28' });
  assert.deepEqual(gelDieselAusSeite(SEITE, '2026-12-30'), { satz: 0.175, von: '2026-12-28', bis: '2027-01-03' });
  assert.equal(gelDieselAusSeite(SEITE, '2027-01-01').satz, 0.175, '1.1.2027 gehoert zur KW 53/2026');
  assert.equal(gelDieselAusSeite(SEITE, '2025-01-01').satz, 0.222, 'KW 01/2025');
});

test('Seite: fehlende Woche, unplausibler oder widerspruechlicher Wert ist ein Fehler', () => {
  assert.throws(() => gelDieselAusSeite(SEITE, '2026-07-22'), /KW 30\/2026 steht nicht auf der GEL-Seite/);
  assert.throws(() => gelDieselAusSeite('', '2026-11-10'), /KW 46\/2026 steht nicht/);
  assert.throws(() => gelDieselAusSeite('Abrechnung KW 46/2026: 24,6%', '2026-11-10'), /steht nicht/, 'nur die Ueberschrift reicht nicht');
  assert.throws(() => gelDieselAusSeite('KW 46/2026* 61,0%', '2026-11-10'), /nicht plausibel/);
  assert.throws(() => gelDieselAusSeite('KW 46/2026* 246%', '2026-11-10'), /nicht plausibel/);
  assert.equal(gelDieselAusSeite('KW 46/2026* 60,0%', '2026-11-10').satz, 0.6, 'Grenze gilt');
  assert.throws(() => gelDieselAusSeite(SEITE, '2026-05-14'), /0,0 % ist nicht plausibel \(erlaubt 5 bis 60 %\)/, '0 % ist ein Seitenfehler, kein Satz');
  assert.throws(() => gelDieselAusSeite('KW 46/2026* 4,9%', '2026-11-10'), /nicht plausibel/);
  assert.equal(gelDieselAusSeite('KW 46/2026* 5,0%', '2026-11-10').satz, 0.05, 'untere Grenze gilt');
  assert.throws(() => gelDieselAusSeite('KW 46/2026* 24,6% KW 46/2026* 24,7%', '2026-11-10'), /verschiedenen Werten/);
  assert.equal(gelDieselAusSeite('KW 46/2026* 24,6% KW 46/2026* 24.6%', '2026-11-10').satz, 0.246, 'derselbe Wert zweimal ist kein Widerspruch');
});

// --- Tarifdatei -----------------------------------------------------------------------------

function tarif() {
  const zeilen = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, ...Array.from({ length: 33 }, (_, i) => i + 21)];
  return {
    version: 1,
    felder: zeilen.map(z => ({ zeile: z, label: 'Testfeld', typ: 'number' })),
    saetze: {
      'GLS Energie': 0.1, 'GLS Diesel Floater': 0.2, 'GEL Diesel': 0.3,
      'GLS gültig von': '2026-11-01', 'GLS gültig bis': '2026-11-30', 'GEL gültig von': '2026-11-02', 'GEL gültig bis': '2026-11-08',
      'GEL Maut je kg': 0.01,
    },
    gls: [[10, 3], [20, 7]], gel: [[10, 10, 8], [20, 20, 16]],
    inseln: { plz: {}, namen: ['Testinsel'], matrix: [[10, 1]] },
    hinweise: [['GEL Diesel', 'Der Satz steht auch als Text, nicht nur als Schluessel.']],
  };
}
/** Legt eine private Umgebung mit tarife.json an (4 Leerzeichen eingerueckt wie die echte Datei). */
function umgebung(t, aendern = x => x) {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-gel-diesel-'));
  const ordner = path.join(privat, 'versandkosten');
  fs.mkdirSync(ordner);
  const datei = path.join(ordner, 'tarife.json');
  fs.writeFileSync(datei, aendern(`${JSON.stringify(tarif(), null, 4)}\n`), { mode: 0o600 });
  t.after(() => fs.rmSync(privat, { recursive: true, force: true }));
  return { privat, datei, ordner, env: { TP_PRIVAT_DIR: privat } };
}
const dateien = ordner => fs.readdirSync(ordner).sort();

test('Nachtragen: nur drei Felder aendern sich, Format bleibt, Sicherung und Gegenprobe', t => {
  const { datei, ordner } = umgebung(t);
  const vorher = fs.readFileSync(datei, 'utf8');
  const r = gelDieselNachtragen(datei, SEITE, '2026-11-12');
  assert.deepEqual(r, { geaendert: true, alt: { satz: 0.3, von: '2026-11-02', bis: '2026-11-08' }, neu: { satz: 0.204, von: '2026-11-09', bis: '2026-11-15' } });
  const erwartet = vorher.replace('"GEL Diesel": 0.3', '"GEL Diesel": 0.204')
    .replace('"GEL gültig von": "2026-11-02"', '"GEL gültig von": "2026-11-09"').replace('"GEL gültig bis": "2026-11-08"', '"GEL gültig bis": "2026-11-15"');
  assert.notEqual(erwartet, vorher);
  assert.equal(fs.readFileSync(datei, 'utf8'), erwartet, 'Rest der Datei Zeichen fuer Zeichen gleich');
  assert.equal(fs.readFileSync(`${datei}.bak-2026-11-12-gel-diesel`, 'utf8'), vorher, 'datierte Sicherung ist der Stand davor');
  assert.deepEqual(dateien(ordner), ['tarife.json', 'tarife.json.bak-2026-11-12-gel-diesel'], 'keine Nebendatei uebrig');
  assert.equal(fs.statSync(datei).mode & 0o777, 0o600);
  assert.equal(leseVersandtarife(datei).verfuegbar, true);
  assert.equal(gelDieselMeldung(r), 'GEL-Diesel: 30,0 % → 20,4 %, gültig 09.11.–15.11.2026.');
});

test('Nachtragen: ohne Aenderung wird nichts geschrieben, auch keine Sicherung', t => {
  const { datei, ordner } = umgebung(t);
  gelDieselNachtragen(datei, SEITE, '2026-11-12');
  fs.rmSync(`${datei}.bak-2026-11-12-gel-diesel`);
  const alt = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(datei, alt, alt);
  const r = gelDieselNachtragen(datei, SEITE, '2026-11-14');
  assert.equal(r.geaendert, false);
  assert.equal(fs.statSync(datei).mtimeMs, alt.getTime(), 'Datei nicht angefasst');
  assert.deepEqual(dateien(ordner), ['tarife.json']);
  assert.equal(gelDieselMeldung(r), 'GEL-Diesel unverändert: 20,4 %, gültig 09.11.–15.11.2026.');
});

test('Nachtragen: Trockenlauf rechnet und prueft, schreibt aber nichts', t => {
  const { datei, ordner } = umgebung(t);
  const vorher = fs.readFileSync(datei);
  const r = gelDieselNachtragen(datei, SEITE, '2026-11-12', { trocken: true });
  assert.deepEqual(r, { geaendert: true, trocken: true, alt: { satz: 0.3, von: '2026-11-02', bis: '2026-11-08' }, neu: { satz: 0.204, von: '2026-11-09', bis: '2026-11-15' } });
  assert.ok(vorher.equals(fs.readFileSync(datei)), 'Datei unveraendert');
  assert.deepEqual(dateien(ordner), ['tarife.json'], 'keine Sicherung, keine Nebendatei');
  assert.throws(() => gelDieselNachtragen(datei, SEITE, '2026-07-22', { trocken: true }), /steht nicht auf der GEL-Seite/, 'Fehler zaehlen auch im Trockenlauf');
});

test('Nachtragen: bei jedem Fehler bleibt die Datei unveraendert, ohne Sicherung und Nebendatei', t => {
  const faelle = [
    ['fehlende Woche', x => x, SEITE, '2026-07-22', /steht nicht auf der GEL-Seite/],
    ['unplausibler Wert', x => x, 'KW 46/2026* 75,0%', '2026-11-10', /nicht plausibel/],
    ['ungueltiges Datum', x => x, SEITE, '12.11.2026', /Datum ungültig/],
    ['Feld doppelt', x => x.replace('{\n', '{\n    "GEL Diesel": 1,\n'), SEITE, '2026-11-17', /nicht genau einmal/],
    ['Tarifdatei schon unvollstaendig', x => x.replace('"version": 1', '"version": 2'), SEITE, '2026-11-17', /Tarifdatei unvollständig/],
    ['Zeitraum der anderen Dienste kaputt', x => x.replace('"GLS gültig bis": "2026-11-30"', '"GLS gültig bis": "2026-10-01"'), SEITE, '2026-11-17', /Tarifzeitraum ungültig/],
    ['kein JSON', () => '{', SEITE, '2026-11-17', /JSON/],
  ];
  for (const [name, aendern, seite, datum, fehler] of faelle) {
    const { datei, ordner } = umgebung(t, aendern);
    const vorher = fs.readFileSync(datei);
    assert.throws(() => gelDieselNachtragen(datei, seite, datum), fehler, name);
    assert.ok(vorher.equals(fs.readFileSync(datei)), `${name}: Datei unveraendert`);
    assert.deepEqual(dateien(ordner), ['tarife.json'], `${name}: nichts daneben`);
  }
  assert.throws(() => gelDieselNachtragen('/gibt/es/nicht/tarife.json', SEITE, '2026-11-17'), /ENOENT/);
});

// --- Skript -----------------------------------------------------------------------------

const DIENSTAG = new Date('2026-11-17T09:30:00+01:00');

test('Skript: schreibt, meldet in einem Satz und setzt den Status auf ok', async t => {
  const { privat, datei, env } = umgebung(t);
  const ausgabe = [];
  const code = await main([], { env, jetzt: DIENSTAG, aus: z => ausgabe.push(z), fehler: z => ausgabe.push(z), ladeSeite: async () => SEITE, melde: () => assert.fail('keine Mitteilung') });
  assert.equal(code, 0);
  assert.deepEqual(ausgabe, [`${DIENSTAG.toISOString()} GEL-Diesel: 30,0 % → 19,8 %, gültig 16.11.–22.11.2026.`]);
  assert.equal(JSON.parse(fs.readFileSync(datei, 'utf8')).saetze['GEL Diesel'], 0.198);
  const s = liesStatus(privat, 'gel-diesel');
  assert.deepEqual([s.ok, s.letzterErfolg], [true, DIENSTAG.toISOString()]);
  // Zweiter Lauf am Folgetag: nichts mehr zu tun.
  await main([], { env, jetzt: new Date(DIENSTAG.getTime() + 86_400_000), aus: z => ausgabe.push(z), fehler: z => ausgabe.push(z), ladeSeite: async () => SEITE });
  assert.match(ausgabe[1], /GEL-Diesel unverändert: 19,8 %/);
});

test('Skript --trocken: zeigt nur, was geschrieben wuerde - weder Tarifdatei noch Status noch Mitteilung', async t => {
  const { privat, datei, ordner, env } = umgebung(t);
  const vorher = fs.readFileSync(datei);
  const ausgabe = [];
  const deps = seite => ({ env, jetzt: DIENSTAG, aus: z => ausgabe.push(z), fehler: z => ausgabe.push(z), ladeSeite: async () => seite, melde: () => assert.fail('keine Mitteilung') });
  assert.equal(await main(['--trocken'], deps(SEITE)), 0);
  assert.deepEqual(ausgabe, [`${DIENSTAG.toISOString()} TROCKENLAUF, nichts geschrieben: GEL-Diesel: 30,0 % → 19,8 %, gültig 16.11.–22.11.2026.`]);
  assert.ok(vorher.equals(fs.readFileSync(datei)));
  assert.deepEqual(dateien(ordner), ['tarife.json']);
  assert.deepEqual(liesStatus(privat, 'gel-diesel'), {}, 'kein Status geschrieben');
  assert.equal(await main(['--trocken'], deps('KW 40/2026* 20,0%')), 1, 'Fehler im Trockenlauf: Exit 1, aber kein roter Status');
  assert.match(ausgabe[1], /GEL-Diesel FEHLER: KW 47\/2026 steht nicht/);
  assert.deepEqual(liesStatus(privat, 'gel-diesel'), {});
  assert.equal(await main(['--trocken', '--jetzt'], { env, fehler: () => {} }), 2);
});

test('Skript: Fehler steht im Protokoll und im Status, Mitteilung nur beim ersten Mal, Datei bleibt', async t => {
  const { privat, datei, env } = umgebung(t);
  const vorher = fs.readFileSync(datei);
  const fehlerzeilen = [], mitteilungen = [];
  const deps = (jetzt, seite) => ({ env, jetzt, aus: () => {}, fehler: z => fehlerzeilen.push(z), ladeSeite: async () => seite, melde: (...m) => mitteilungen.push(m) });
  assert.equal(await main([], deps(DIENSTAG, 'KW 40/2026* 20,0%')), 1);
  assert.equal(await main([], deps(new Date(DIENSTAG.getTime() + 3_600_000), 'KW 40/2026* 20,0%')), 1);
  assert.match(fehlerzeilen[0], /GEL-Diesel FEHLER: KW 47\/2026 steht nicht auf der GEL-Seite/);
  assert.equal(mitteilungen.length, 1);
  assert.deepEqual([mitteilungen[0][0], liesStatus(privat, 'gel-diesel').ok, liesStatus(privat, 'gel-diesel').art], ['GEL-Dieselzuschlag', false, 'nachtragen']);
  assert.ok(vorher.equals(fs.readFileSync(datei)));
  // Netzfehler zaehlt genauso; unbekanntes Argument ist Exit 2.
  assert.equal(await main([], { ...deps(DIENSTAG), ladeSeite: async () => { throw new Error('GEL-Seite nicht erreichbar: aus'); } }), 1);
  assert.equal(await main(['--jetzt'], { env, fehler: () => {} }), 2);
  // Im Control Center: eingerichtet (Plist da) und gestoert.
  const agents = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-agents-'));
  t.after(() => fs.rmSync(agents, { recursive: true, force: true }));
  fs.writeFileSync(path.join(agents, 'net.teppich-paradies.gel-diesel.plist'), '');
  const [r] = routinenStand(privat, { jetzt: DIENSTAG, agentsDir: agents });
  assert.deepEqual([r.id, r.ok, r.titel], ['gel-diesel', false, 'GEL-Dieselzuschlag']);
});

test('Seite laden: genau ein Wiederholversuch bei Netzfehler oder 5xx, 4xx sofort', async () => {
  const antwort = (status, text = '') => ({ status, ok: status < 400, text: async () => text, body: null });
  const mit = folge => { const aufrufe = []; return { aufrufe, fetchImpl: async u => { aufrufe.push(u); const n = folge[Math.min(aufrufe.length, folge.length) - 1]; if (n instanceof Error) throw n; return n; } }; };
  let f = mit([antwort(503), antwort(200, 'ok')]);
  assert.equal(await ladeSeite({ fetchImpl: f.fetchImpl, pauseMs: 0 }), 'ok');
  assert.equal(f.aufrufe.length, 2);
  f = mit([new TypeError('fetch failed'), antwort(200, 'ok')]);
  assert.equal(await ladeSeite({ fetchImpl: f.fetchImpl, pauseMs: 0 }), 'ok');
  f = mit([new TypeError('fetch failed')]);
  await assert.rejects(ladeSeite({ fetchImpl: f.fetchImpl, pauseMs: 0 }), /nicht erreichbar: fetch failed/);
  assert.equal(f.aufrufe.length, 2, 'nie mehr als ein Wiederholversuch');
  f = mit([antwort(503)]);
  await assert.rejects(ladeSeite({ fetchImpl: f.fetchImpl, pauseMs: 0 }), /HTTP 503/);
  assert.equal(f.aufrufe.length, 2);
  f = mit([antwort(404)]);
  await assert.rejects(ladeSeite({ fetchImpl: f.fetchImpl, pauseMs: 0 }), /HTTP 404/);
  assert.equal(f.aufrufe.length, 1, '4xx wird nicht wiederholt');
  assert.ok(f.aufrufe[0].startsWith('https://www.gel-express.de/'));
});
