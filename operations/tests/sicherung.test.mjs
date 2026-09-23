import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sichern, alteSicherungenAufraeumen, vorhandeneQuellen, SICHERUNGSPFADE } from '../scripts/sicherung.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tp-sicherung-'));
}

function beispielPrivatDir() {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'auftragsstatus.json'), JSON.stringify({ version: 1, positionen: { '1::1': { status: 'bestellt' } } }));
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

  // Inhalt tatsaechlich lesbar und der Auftragsstatus tatsaechlich drin -
  // das ist die eine Datei, die bei einem Festplattenschaden sonst weg waere.
  const liste = execFileSync('tar', ['-tzf', ergebnis.archiv], { encoding: 'utf8' });
  assert.match(liste, /auftragsstatus\.json/);
  assert.match(liste, /lexikon\/lexikon\.json/);

  const entpackt = tmpDir();
  execFileSync('tar', ['-xzf', ergebnis.archiv, '-C', entpackt]);
  const inhalt = JSON.parse(fs.readFileSync(path.join(entpackt, 'auftragsstatus.json'), 'utf8'));
  assert.equal(inhalt.positionen['1::1'].status, 'bestellt');
});

test('sichern: wirft eine klare Meldung, wenn gar keine Quelle existiert', () => {
  const dir = tmpDir(); // leer
  assert.throws(() => sichern({ privatDir: dir, ziel: path.join(dir, 'sicherungen') }), /Keine Betriebsdaten/);
});

test('sichern: SICHERUNGSPFADE enthaelt auftragsstatus.json (der einzige unwiederbringliche Teil)', () => {
  assert.ok(SICHERUNGSPFADE.includes('auftragsstatus.json'));
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
