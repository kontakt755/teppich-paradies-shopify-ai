// Screenshot-Ordner von npm run dashboard:pruefen (ohne --aus): sie zeigen echte Kunden-
// und Einkaufsdaten und blieben bis 2026-10-19 fuer immer im Temp-Ordner liegen (59 Ordner).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { istPruefOrdner, altePruefOrdner, altePruefOrdnerLoeschen, pruefOrdnerAnlegen, pruefOrdnerBehalten } from '../../../scripts/dashboard-pruefung-ordner.mjs';

const EIN_TAG_MS = 24 * 60 * 60 * 1000;

// Eigener "Temp-Ordner" je Test, damit nie ein echter Screenshot-Ordner des Rechners zaehlt.
function mitTmp(run) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-pruefung-ordner-test-'));
  try { return run(tmp); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

const pruefOrdner = pruefOrdnerAnlegen;

test('nur ein echtes Verzeichnis tp-dashboard-pruefung-XXXXXX direkt im Temp-Ordner gilt als Screenshot-Ordner', () => mitTmp(tmp => {
  const ordner = pruefOrdner(tmp);
  assert.equal(istPruefOrdner(ordner, tmp), true);

  const fremd = path.join(tmp, 'pruefung');
  fs.mkdirSync(fremd);
  assert.equal(istPruefOrdner(fremd, tmp), false, 'falscher Name (z. B. --aus)');
  const tiefer = path.join(fremd, 'tp-dashboard-pruefung-abcdef');
  fs.mkdirSync(tiefer);
  assert.equal(istPruefOrdner(tiefer, tmp), false, 'nicht direkt im Temp-Ordner');
  const link = path.join(tmp, 'tp-dashboard-pruefung-link00');
  fs.symlinkSync(fremd, link);
  assert.equal(istPruefOrdner(link, tmp), false, 'ein Link wird nie geloescht');
  const datei = path.join(tmp, 'tp-dashboard-pruefung-datei0');
  fs.writeFileSync(datei, '');
  assert.equal(istPruefOrdner(datei, tmp), false, 'eine Datei ist kein Ordner');
  assert.equal(istPruefOrdner(path.join(tmp, 'tp-dashboard-pruefung-fehlt0'), tmp), false, 'fehlt');
  assert.equal(istPruefOrdner(ordner, fremd), false, 'anderer Temp-Ordner');
  assert.equal(istPruefOrdner('', tmp), false);
  assert.equal(istPruefOrdner(undefined, tmp), false);
}));

test('alte Screenshot-Ordner: nur aelter als drei Tage, nur mit genau diesem Namen', () => mitTmp(tmp => {
  const alt = pruefOrdner(tmp);
  fs.writeFileSync(path.join(alt, 'heute-desktop.png'), 'bild');
  fs.writeFileSync(path.join(alt, 'bericht.json'), '{}');
  fs.mkdirSync(path.join(tmp, 'tp-dashboard-pruefung-zu-lang-fuer-mkdtemp'));
  fs.mkdirSync(path.join(tmp, 'tp-dashboard-daten-abcdef'));
  const ziel = path.join(tmp, 'eigene-pruefung');
  fs.mkdirSync(ziel);
  fs.writeFileSync(path.join(ziel, 'bericht.json'), '{}');
  fs.symlinkSync(ziel, path.join(tmp, 'tp-dashboard-pruefung-link00'));

  // Gerade angelegt: der Benutzer sieht sich die Bilder vielleicht noch an.
  assert.deepEqual(altePruefOrdner({ tmp, jetzt: Date.now() + 2 * EIN_TAG_MS, lebt: () => false, benutzt: () => false }), []);
  assert.deepEqual(altePruefOrdner({ tmp, jetzt: Date.now() + 4 * EIN_TAG_MS, lebt: () => false, benutzt: () => false }), [alt]);
}));

test('Loeschen entfernt nur die alten Ordner samt Inhalt, nie das Ziel eines Links', () => mitTmp(tmp => {
  const alt = pruefOrdner(tmp);
  fs.writeFileSync(path.join(alt, 'kunden-handy.png'), 'bild');
  const ziel = path.join(tmp, 'eigene-pruefung');
  fs.mkdirSync(ziel);
  fs.writeFileSync(path.join(ziel, 'bericht.json'), '{}');
  fs.symlinkSync(ziel, path.join(tmp, 'tp-dashboard-pruefung-link00'));
  fs.symlinkSync(ziel, path.join(alt, 'verlinkt'));

  assert.deepEqual(altePruefOrdnerLoeschen({ tmp, jetzt: Date.now() + 4 * EIN_TAG_MS, lebt: () => false, benutzt: () => false }), [alt]);
  assert.equal(fs.existsSync(alt), false);
  assert.ok(fs.existsSync(path.join(ziel, 'bericht.json')), 'Ziel des Links bleibt');
  assert.ok(fs.lstatSync(path.join(tmp, 'tp-dashboard-pruefung-link00')).isSymbolicLink(), 'Link bleibt');
  assert.deepEqual(altePruefOrdnerLoeschen({ tmp, jetzt: Date.now() + 4 * EIN_TAG_MS, lebt: () => false, benutzt: () => false }), []);
}));

test('fehlender Temp-Ordner: nichts zu tun, kein Fehler', () => {
  assert.deepEqual(altePruefOrdner({ tmp: path.join(os.tmpdir(), 'gibt-es-nicht-tp-pruefung') }), []);
});
