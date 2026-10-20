import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { datenkopieAnlegen, istDatenkopie, datenkopieLoeschen, verwaisteDatenkopien } from '../../../scripts/dashboard-datenkopie.mjs';
import { pruefOrdnerAnlegen, istPruefOrdner, altePruefOrdnerLoeschen, pruefOrdnerBehalten } from '../../../scripts/dashboard-pruefung-ordner.mjs';
import { ordnerBenutzt, besitzSetzen } from '../../../scripts/dashboard-temp-besitz.mjs';

const spaeter = () => Date.now() + 5 * 86400_000;
const ruhig = { prozesse: () => '', lebt: () => false, benutzt: () => false };

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-temp-besitz-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

for (const [art, anlegen, erkennen, bereinigen] of [
  ['daten', datenkopieAnlegen, istDatenkopie, o => {
    const kandidaten = verwaisteDatenkopien(o);
    for (const p of kandidaten) datenkopieLoeschen(p, o.tmp);
    return kandidaten;
  }],
  ['pruefung', pruefOrdnerAnlegen, istPruefOrdner, altePruefOrdnerLoeschen],
]) {
  test(`${art}: fremde, aktive und unklar benutzte Ordner bleiben; eigene verwaiste verschwinden`, t => {
    const tmp = sandbox(t);
    const eigen = anlegen(tmp);
    fs.writeFileSync(path.join(eigen, 'beleg.txt'), 'synthetisch');
    const fremd = path.join(tmp, `tp-dashboard-${art}-abcdef`);
    fs.mkdirSync(fremd);
    const optionen = { tmp, jetzt: spaeter(), ...ruhig };
    assert.deepEqual(bereinigen({ ...optionen, lebt: () => true }), [], 'lebender Besitzer');
    assert.deepEqual(bereinigen({ ...optionen, benutzt: () => true }), [], 'offene Dateien/cwd');
    assert.deepEqual(bereinigen({ ...optionen, benutzt: () => null }), [], 'unbekannte Nutzung');
    assert.ok(fs.existsSync(eigen));
    assert.deepEqual(bereinigen(optionen), [eigen]);
    assert.ok(fs.existsSync(fremd), 'passender Name ohne Kennung ist fremd');
  });

  test(`${art}: Symlink mit .. darf keinen Ordner ausserhalb des Tempbereichs freigeben`, t => {
    const root = sandbox(t);
    const tmp = path.join(root, 'tmp');
    const fremd = path.join(root, 'fremd');
    fs.mkdirSync(tmp);
    fs.mkdirSync(path.join(fremd, 'innen'), { recursive: true });
    const ziel = anlegen(fremd);
    fs.symlinkSync(path.join(fremd, 'innen'), path.join(tmp, 'link'));
    const traversal = `${tmp}/link/../${path.basename(ziel)}`;
    assert.equal(erkennen(traversal, tmp), false);
    if (art === 'daten') assert.equal(datenkopieLoeschen(traversal, tmp), false);
    assert.deepEqual(bereinigen({ tmp, jetzt: spaeter(), ...ruhig }), []);
    assert.ok(fs.existsSync(ziel));
  });

  test(`${art}: kopierte oder verlinkte Besitzkennung autorisiert keinen fremden Ordner`, t => {
    const tmp = sandbox(t);
    const eigen = anlegen(tmp);
    const fremd = path.join(tmp, `tp-dashboard-${art}-abcdef`);
    fs.mkdirSync(fremd);
    const marker = '.tp-dashboard-temp.json';
    fs.copyFileSync(path.join(eigen, marker), path.join(fremd, marker));
    assert.equal(erkennen(fremd, tmp), false, 'andere Verzeichnisidentitaet');
    fs.unlinkSync(path.join(fremd, marker));
    fs.symlinkSync(path.join(eigen, marker), path.join(fremd, marker));
    assert.equal(erkennen(fremd, tmp), false, 'verlinkte Kennung');
  });
}

test('--aus behaelt auch einen frueher automatisch erzeugten Ordner dauerhaft', t => {
  const tmp = sandbox(t);
  const aus = pruefOrdnerAnlegen(tmp);
  pruefOrdnerBehalten(aus, tmp);
  assert.deepEqual(altePruefOrdnerLoeschen({ tmp, jetzt: spaeter(), ...ruhig }), []);
  assert.ok(fs.existsSync(aus));
});

for (const variante of ['unterordner', 'symlink']) {
  test(`--aus schuetzt auch ${variante} eines alten Pruefungsordners dauerhaft`, t => {
    const tmp = sandbox(t);
    const alt = pruefOrdnerAnlegen(tmp);
    let aus = path.join(alt, 'noch-nicht-angelegt', 'bericht');
    if (variante === 'symlink') {
      aus = path.join(tmp, 'eigene-ablage');
      fs.symlinkSync(alt, aus);
    }
    const optionen = { tmp, jetzt: spaeter(), ...ruhig };
    assert.deepEqual(altePruefOrdnerLoeschen({ ...optionen, aus }), [], 'aktuell gewaehlte Ablage');
    pruefOrdnerBehalten(aus, tmp);
    assert.deepEqual(altePruefOrdnerLoeschen(optionen), [], 'auch spaetere Laeufe erhalten die Ablage');
    assert.ok(fs.existsSync(alt));
  });
}

test('echter Kindprozess mit Tempordner als cwd bleibt geschuetzt', {
  skip: process.platform === 'win32', timeout: 10000,
}, async t => {
  const tmp = sandbox(t);
  const ordner = datenkopieAnlegen(tmp);
  const kind = spawn(process.execPath, ['-e', 'console.log("bereit"); setInterval(() => {}, 1000)'], {
    cwd: ordner, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await once(kind.stdout, 'data');
    assert.equal(ordnerBenutzt(ordner), true);
    assert.deepEqual(verwaisteDatenkopien({ tmp, jetzt: spaeter(), prozesse: () => '', lebt: () => false }), []);
    besitzSetzen(ordner, 'daten', { pid: kind.pid });
    assert.equal(datenkopieLoeschen(ordner, tmp), false, 'uebernommene Kopie eines lebenden Servers');
    assert.equal(datenkopieLoeschen(ordner, tmp, { verwaist: true }), false, 'Orphan-Auswahl wird vor dem Loeschen erneut geprueft');
  } finally {
    const ende = once(kind, 'exit');
    kind.kill();
    await ende;
  }
  const benutzt = ordnerBenutzt(ordner);
  // Fehlende lsof-Rechte/Installation duerfen niemals als 'frei' gelten.
  assert.ok(benutzt === false || benutzt === null);
});
