import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Die Oberflaeche besteht aus ES-Modulen ohne Build-Schritt. Was ein Bundler
// sonst beim Bauen merkt, faellt hier erst im Browser auf - und nur in der
// Ansicht, die gerade offen ist. Diese Pruefungen lesen deshalb den Quelltext:
// jeder Import muss aufgehen, die Schichten bleiben getrennt, nichts laedt den
// Einstieg ein zweites Mal.

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, '..');

function frontendDateien() {
  const dateien = [path.join(WURZEL, 'app.js'), path.join(WURZEL, 'ereignisse.mjs')];
  for (const ordner of ['kern', 'bausteine', 'ansichten', 'lib']) {
    const lauf = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) lauf(p);
        else if (/\.(mjs|js)$/.test(e.name)) dateien.push(p);
      }
    };
    lauf(path.join(WURZEL, ordner));
  }
  return dateien;
}

const rel = p => path.relative(WURZEL, p).split(path.sep).join('/');

/** Alle Importe einer Datei: [{ quelle, namen }]. Nur statische Importe - dynamische gibt es nicht. */
function importe(datei) {
  const text = fs.readFileSync(datei, 'utf8');
  return [...text.matchAll(/^import\s+(?:\{([^}]*)\}\s+from\s+)?'([^']+)';/gm)].map(m => ({
    quelle: m[2],
    namen: (m[1] || '').split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean),
  }));
}

function exporte(datei) {
  const text = fs.readFileSync(datei, 'utf8');
  const namen = new Set();
  for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) namen.add(m[1]);
  for (const m of text.matchAll(/^export\s+\{([^}]*)\}/gm)) m[1].split(',').forEach(s => { const n = s.trim().split(/\s+as\s+/).pop(); if (n) namen.add(n); });
  return namen;
}

const DATEIEN = frontendDateien();
const GRAPH = new Map(DATEIEN.map(d => [rel(d), importe(d).map(i => ({ ...i, ziel: rel(path.resolve(path.dirname(d), i.quelle)) }))]));

test('jeder Import zeigt auf eine vorhandene Datei und einen vorhandenen Export', () => {
  for (const d of DATEIEN) {
    for (const i of importe(d)) {
      assert.match(i.quelle, /^\.\.?\/.+\.(mjs|js)$/, `${rel(d)}: Import '${i.quelle}' muss relativ sein und die Endung nennen (kein Build-Schritt)`);
      const ziel = path.resolve(path.dirname(d), i.quelle);
      assert.ok(fs.existsSync(ziel), `${rel(d)}: importiert ${i.quelle}, die Datei gibt es nicht`);
      const vorhanden = exporte(ziel);
      for (const n of i.namen) assert.ok(vorhanden.has(n), `${rel(d)}: ${i.quelle} exportiert "${n}" nicht`);
    }
  }
});

test('index.html laedt genau den Einstieg, und niemand importiert ihn', () => {
  const html = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
  const skripte = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(skripte, ['./app.js'], 'index.html soll nur ./app.js als Modul laden');
  // Ein Import von app.js aus einem Modul wuerde den Einstieg (und init) ein
  // zweites Mal ausfuehren, sobald sich die Adresse auch nur um ein ?v= unterscheidet.
  for (const [datei, liste] of GRAPH) {
    for (const i of liste) assert.notEqual(i.ziel, 'app.js', `${datei} darf den Einstieg app.js nicht importieren`);
  }
});

test('kern/ kennt keine Ansicht, lib/ kennt nur sich selbst', () => {
  // Einzige Ausnahme: nach dem Zeichnen wird das Aufgaben-Panel nachgefuehrt.
  const AUSNAHMEN = new Set(['kern/render.mjs -> bausteine/aufgaben-panel.mjs']);
  for (const [datei, liste] of GRAPH) {
    for (const i of liste) {
      if (datei.startsWith('lib/')) assert.ok(i.ziel.startsWith('lib/'), `${datei} (laeuft auch im Server) darf nur aus lib/ importieren, nicht ${i.ziel}`);
      if (datei.startsWith('kern/') && !AUSNAHMEN.has(`${datei} -> ${i.ziel}`)) {
        assert.ok(i.ziel.startsWith('kern/') || i.ziel.startsWith('lib/'), `${datei} darf nur aus kern/ und lib/ importieren, nicht ${i.ziel}`);
      }
      if (datei.startsWith('bausteine/') || datei.startsWith('ansichten/')) {
        assert.notEqual(i.ziel, 'ereignisse.mjs', `${datei} darf die Ereignisverteilung nicht importieren`);
      }
    }
  }
});

test('die Module haengen nicht im Kreis voneinander ab', () => {
  // Kreise funktionieren bei ES-Modulen nur, solange niemand zur Ladezeit auf
  // ein const des anderen zugreift - das bricht dann je nach Ladereihenfolge.
  const zustand = new Map();
  const pfad = [];
  const besuche = (knoten) => {
    if (zustand.get(knoten) === 'fertig') return;
    if (zustand.get(knoten) === 'offen') {
      assert.fail(`Importkreis: ${[...pfad.slice(pfad.indexOf(knoten)), knoten].join(' -> ')}`);
    }
    zustand.set(knoten, 'offen'); pfad.push(knoten);
    for (const i of GRAPH.get(knoten) || []) besuche(i.ziel);
    pfad.pop(); zustand.set(knoten, 'fertig');
  };
  for (const knoten of GRAPH.keys()) besuche(knoten);
});

test('jede Route hat ihre Datei unter ansichten/', () => {
  const app = fs.readFileSync(path.join(WURZEL, 'app.js'), 'utf8');
  const views = app.match(/const VIEWS = \{([^}]+)\}/);
  assert.ok(views, 'VIEWS-Tabelle in app.js nicht gefunden');
  for (const [, route] of views[1].matchAll(/([a-z]+):\s*view/g)) {
    assert.ok(fs.existsSync(path.join(WURZEL, 'ansichten', `${route}.mjs`)), `Route "${route}" hat keine Datei ansichten/${route}.mjs`);
  }
});
