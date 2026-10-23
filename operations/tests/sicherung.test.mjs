import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sichern, alteSicherungenAufraeumen, vorhandeneQuellen, SICHERUNGSPFADE } from '../scripts/sicherung.mjs';
import { betriebszustand } from '../lib/betriebszustand.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tp-sicherung-'));
}

function beispielPrivatDir() {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'auftragsstatus.json'), JSON.stringify({ version: 1, positionen: { '1::1': { status: 'bestellt' } } }));
  fs.writeFileSync(path.join(dir, 'muster-druckliste.json'), JSON.stringify({ schema: 1, eintraege: [{ id: 'test-druckauftrag', status: 'in_druck' }] }));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  fs.writeFileSync(path.join(dir, 'lexikon', 'lexikon.json'), '[]');
  fs.mkdirSync(path.join(dir, 'kennzahlen'));
  fs.writeFileSync(path.join(dir, 'kennzahlen', 'shop-snapshot.json'), '{}');
  return dir;
}

test('vorhandeneQuellen: nur tatsaechlich existierende Pfade', () => {
  const dir = beispielPrivatDir();
  const gefunden = vorhandeneQuellen(dir);
  assert.ok(gefunden.includes('auftragsstatus.json'));
  assert.ok(gefunden.includes('lexikon'));
  assert.ok(!gefunden.includes('einkauf-klaerung'));
});

test('sichern: schreibt <datum>.tar.gz mit dem Auftragsstatus darin', () => {
  const dir = beispielPrivatDir();
  const ziel = path.join(dir, 'sicherungen');
  const jetzt = new Date('2026-09-23T06:00:00.000Z');

  const ergebnis = sichern({ privatDir: dir, ziel, jetzt });

  assert.equal(ergebnis.archiv, path.join(ziel, '2026-09-23.tar.gz'));
  assert.ok(fs.existsSync(ergebnis.archiv));
  assert.ok(ergebnis.quellen.includes('auftragsstatus.json'));
  assert.ok(ergebnis.uebersprungen.includes('bestelluebersicht'));
  assert.equal(fs.statSync(ergebnis.archiv).mode & 0o777, 0o600);

  // Inhalt tatsaechlich lesbar und der Auftragsstatus tatsaechlich drin -
  // das ist die eine Datei, die bei einem Festplattenschaden sonst weg waere.
  const liste = execFileSync('tar', ['-tzf', ergebnis.archiv], { encoding: 'utf8' });
  assert.match(liste, /auftragsstatus\.json/);
  assert.match(liste, /lexikon\/lexikon\.json/);

  const entpackt = tmpDir();
  execFileSync('tar', ['-xzf', ergebnis.archiv, '-C', entpackt]);
  const inhalt = JSON.parse(fs.readFileSync(path.join(entpackt, 'auftragsstatus.json'), 'utf8'));
  assert.equal(inhalt.positionen['1::1'].status, 'bestellt');
  const druckliste = JSON.parse(fs.readFileSync(path.join(entpackt, 'muster-druckliste.json'), 'utf8'));
  assert.equal(druckliste.eintraege[0].status, 'in_druck', 'auch noch ungepruefte Druckauftraege sind wiederherstellbar');
});

test('unlesbares Archiv laesst vorhandene Sicherung und Erfolgsbeleg unveraendert', () => {
  const dir = beispielPrivatDir();
  const jetzt = new Date('2026-10-23T08:00:00Z');
  const { archiv } = sichern({ privatDir: dir, jetzt });
  const alt = fs.readFileSync(archiv);
  const beleg = fs.readFileSync(path.join(dir, 'sicherungsstand.json'));
  const tar = (_befehl, args) => {
    if (args[0] === '-czf') fs.writeFileSync(args[1], 'beschaedigtes Archiv');
    else throw new Error('Archiv kann nicht gelesen werden');
  };
  assert.throws(() => sichern({ privatDir: dir, jetzt, tar }), /nicht gelesen/);
  assert.deepEqual(fs.readFileSync(archiv), alt);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'sicherungsstand.json')), beleg);
  assert.ok(!fs.readdirSync(path.dirname(archiv)).some(n => n.endsWith('.tmp')));
});

test('lesbares, aber unvollstaendiges Archiv gilt nicht als Erfolg', () => {
  const dir = beispielPrivatDir();
  const tar = (_befehl, args) => {
    if (args[0] === '-czf') fs.writeFileSync(args[1], 'falsches Archiv');
    else return 'kennzahlen/\n';
  };
  assert.throws(() => sichern({ privatDir: dir, jetzt: new Date('2026-10-23T08:00:00Z'), tar }), /unvollstaendig/);
  assert.ok(!fs.existsSync(path.join(dir, 'sicherungsstand.json')));
});

test('taeglicher Solltermin wird schon vor 48 Stunden als verpasst erkannt', () => {
  const dir = beispielPrivatDir();
  const f = path.join(dir, 'sicherungsstand.json');
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-21T20:36:00Z' }));
  const r = betriebszustand(dir, { jetzt: new Date('2026-10-23T08:00:00Z') }).sicherung;
  assert.equal(r.status, 'alt');
  assert.equal(r.grund, 'taeglicher-solltermin-verpasst');
  assert.equal(r.erwartetFuer, '2026-10-22');
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-22T20:36:00Z' }));
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-23T08:00:00Z') }).sicherung.status, 'ok');
});

test('Solltermin hat eine halbe Stunde Laufzeit und folgt Berlin auch beim Winterzeitwechsel', () => {
  const dir = beispielPrivatDir();
  const f = path.join(dir, 'sicherungsstand.json');
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-24T20:36:00Z' }));
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-25T21:59:59Z') }).sicherung.status, 'ok');
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-25T22:00:00Z') }).sicherung.status, 'alt');
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-25T21:36:00Z' }));
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-26T08:00:00Z') }).sicherung.status, 'ok');
});

test('ein morgendlicher Anmeldelauf verdeckt keinen ausgefallenen Abendlauf', () => {
  const dir = beispielPrivatDir();
  const f = path.join(dir, 'sicherungsstand.json');
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-22T06:00:00Z' }));
  for (const zeit of ['2026-10-22T21:10:00Z', '2026-10-23T08:00:00Z']) {
    assert.equal(betriebszustand(dir, { jetzt: new Date(zeit) }).sicherung.status, 'alt');
  }
  fs.writeFileSync(f, JSON.stringify({ letzterErfolg: '2026-10-23T06:00:00Z' }));
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-23T08:00:00Z') }).sicherung.status, 'ok');
  assert.equal(betriebszustand(dir, { jetzt: new Date('2026-10-23T21:10:00Z') }).sicherung.status, 'alt');
});

test('sichern: wirft eine klare Meldung, wenn gar keine Quelle existiert', () => {
  const dir = tmpDir(); // leer
  assert.throws(() => sichern({ privatDir: dir, ziel: path.join(dir, 'sicherungen') }), /Keine Betriebsdaten/);
});

test('sichern: SICHERUNGSPFADE enthaelt auftragsstatus.json (der einzige unwiederbringliche Teil)', () => {
  assert.ok(SICHERUNGSPFADE.includes('auftragsstatus.json'));
  assert.ok(SICHERUNGSPFADE.includes('muster-packen.json'));
  assert.ok(SICHERUNGSPFADE.includes('bestellmarken.json'));
});

test('alteSicherungenAufraeumen: loescht nur Archive aelter als die Frist, laesst fremde Dateien in Ruhe', () => {
  const ziel = tmpDir();
  fs.writeFileSync(path.join(ziel, '2026-08-01.tar.gz'), 'alt');
  fs.writeFileSync(path.join(ziel, '2026-09-20.tar.gz'), 'neu');
  fs.writeFileSync(path.join(ziel, 'notizen.txt'), 'nicht anfassen');

  const { geloescht } = alteSicherungenAufraeumen({ ziel, aufbewahrenTage: 30, jetzt: new Date('2026-09-23T00:00:00.000Z') });

  assert.deepEqual(geloescht, ['2026-08-01.tar.gz']);
  assert.ok(!fs.existsSync(path.join(ziel, '2026-08-01.tar.gz')));
  assert.ok(fs.existsSync(path.join(ziel, '2026-09-20.tar.gz')));
  assert.ok(fs.existsSync(path.join(ziel, 'notizen.txt')));
});

test('alteSicherungenAufraeumen: leeres/fehlendes Zielverzeichnis ist kein Fehler', () => {
  const ziel = path.join(tmpDir(), 'existiert-nicht');
  const { geloescht } = alteSicherungenAufraeumen({ ziel, jetzt: new Date() });
  assert.deepEqual(geloescht, []);
});
