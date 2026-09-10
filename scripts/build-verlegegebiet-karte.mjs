#!/usr/bin/env node
/**
 * Basiskarten fuer die Sektion "TP Verlegegebiet" rendern.
 *
 * Warum selbst rendern und nicht Kacheln zusammensetzen: fertige Rasterkacheln
 * gibt es frei nur in einfacher Aufloesung, und ihre Schriftgroesse haengt fest
 * an der Zoomstufe. Auf einem Retina-Display sind die Ortsnamen damit entweder
 * unscharf oder zu klein - beides war in der ersten Fassung sichtbar. Hier
 * werden Vektorkacheln lokal in echter doppelter Aufloesung gerendert, und die
 * Schriftgroesse ist eine eigene Entscheidung.
 *
 * Im Shop landet trotzdem nur ein fertiges WebP: zur Laufzeit gibt es keinen
 * externen Request, kein JavaScript fuer die Darstellung, keinen Layout Shift
 * und nichts, was auf dem Smartphone das Scrollen abfangen koennte.
 *
 * Aufruf (braucht Netz und das devDependency puppeteer):
 *     node scripts/build-verlegegebiet-karte.mjs
 *
 * Quellen und Lizenzen:
 *   Kacheln  OpenFreeMap (openfreemap.org) auf Basis von OpenStreetMap, ODbL.
 *            Die Namensnennung steht sichtbar unter der Karte in der Sektion.
 *   Stil     "positron" von OpenFreeMap, hier umgefaerbt auf die Shop-Palette.
 *
 * Aendert sich der Standort oder eine Groesse, muss die Geometrie im Kopf von
 * sections/tp-verlegegebiet.liquid mitgezogen werden - der Radiuskreis rechnet
 * damit und darf nicht raten. Dieses Skript gibt die Werte am Ende aus.
 */
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const WURZEL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ASSETS = path.join(WURZEL, 'assets');

const LAT = 52.7378;
const LON = 13.2485;   // Saarlandstrasse, 16515 Oranienburg

/**
 * MapLibre rechnet mit 512er-Kacheln, die uebliche Formel mit 256ern - deshalb
 * ist Zoom 8 hier so gross wie Zoom 9 dort. Die Breite ist so gewaehlt, dass
 * der 50-km-Kreis die Flaeche fuellt, ohne anzustossen.
 */
const VARIANTEN = [
  { name: 'desktop', breite: 1000, hoehe: 700, zoom: 8, stadt: 13, ort: 11.5 },
  { name: 'mobile', breite: 340, hoehe: 380, zoom: 7, stadt: 14, ort: 12 },
];

const meterProPixel = (zoom) => (156543.03392 * Math.cos((LAT * Math.PI) / 180)) / 2 ** (zoom + 1);

const SEITE = `<!doctype html>
<meta charset="utf-8">
<title>Kartenrenderer</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css">
<style>html,body{margin:0}#karte{width:100vw;height:100vh}</style>
<div id="karte"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js"></script>
<script>
  const P = new URLSearchParams(location.search);

  // Warme, sehr helle Palette - dieselbe Familie wie im Shop.
  const GRUND = '#faf8f5';
  const WASSER = '#e9e6df';
  const WALD = '#f1efe9';
  const STRASSE = '#eae5dd';
  const SCHRIFT = '#4a443c';

  const karte = new maplibregl.Map({
    container: 'karte',
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: [${LON}, ${LAT}],
    zoom: parseFloat(P.get('zoom')),
    attributionControl: false,
    interactive: false,
    fadeDuration: 0,
  });

  karte.on('load', () => {
    const stil = karte.getStyle();

    // Von der Beschriftung bleiben nur Orte stehen. Strassennummern,
    // Gewaesser- und Flughafennamen beantworten die Frage "wie weit fahren
    // wir" nicht und machen die Flaeche unruhig.
    const ORTSEBENEN = new Set(['label_city', 'label_city_capital', 'label_town']);

    for (const ebene of stil.layers) {
      if (ebene.type !== 'symbol') continue;
      if (!ORTSEBENEN.has(ebene.id)) {
        karte.setLayoutProperty(ebene.id, 'visibility', 'none');
        continue;
      }
      const gross = ebene.id !== 'label_town';
      karte.setLayoutProperty(ebene.id, 'text-size', parseFloat(P.get(gross ? 'stadt' : 'ort')));
      karte.setLayoutProperty(ebene.id, 'text-letter-spacing', 0.01);
      // Oranienburg traegt die Sektion als eigenen Marker - zweimal derselbe
      // Ortsname an derselben Stelle liest sich wie ein Fehler.
      karte.setFilter(ebene.id, ['all', ebene.filter || true, ['!=', ['get', 'name'], 'Oranienburg']]);
      karte.setPaintProperty(ebene.id, 'text-color', SCHRIFT);
      karte.setPaintProperty(ebene.id, 'text-halo-color', GRUND);
      karte.setPaintProperty(ebene.id, 'text-halo-width', 1.6);
    }

    karte.setPaintProperty('background', 'background-color', GRUND);
    for (const ebene of stil.layers) {
      if (ebene.source === 'ne2_shaded' || /shaded|hillshade/.test(ebene.id) || /boundary/.test(ebene.id)) {
        karte.setLayoutProperty(ebene.id, 'visibility', 'none');
      } else if (ebene.type === 'fill' && ebene['source-layer'] === 'water') {
        karte.setPaintProperty(ebene.id, 'fill-color', WASSER);
      } else if (ebene.id.startsWith('landcover') || /park|wood|forest/.test(ebene.id)) {
        if (ebene.type === 'fill') karte.setPaintProperty(ebene.id, 'fill-color', WALD);
      } else if (ebene.type === 'line' && /highway|road|bridge|tunnel/.test(ebene.id)) {
        karte.setPaintProperty(ebene.id, 'line-color', STRASSE);
      } else if (ebene.id === 'waterway') {
        karte.setPaintProperty(ebene.id, 'line-color', WASSER);
      }
    }

    karte.once('idle', () => { window.fertig = true; });
  });
</script>`;

const server = createServer((_, antwort) => {
  antwort.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  antwort.end(SEITE);
});
await new Promise((fertig) => server.listen(0, '127.0.0.1', fertig));
const basis = `http://127.0.0.1:${server.address().port}/`;

// SwiftShader, weil Headless-Chrome hier keinen GPU-Kontext bekommt. Ohne die
// Flags scheitert MapLibre still an "Failed to initialize WebGL".
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const geometrie = {};
for (const v of VARIANTEN) {
  for (const dichte of [1, 2]) {
    const seite = await browser.newPage();
    const fehler = [];
    seite.on('pageerror', (e) => fehler.push(e.message));
    await seite.setViewport({ width: v.breite, height: v.hoehe, deviceScaleFactor: dichte });
    await seite.goto(`${basis}?zoom=${v.zoom}&stadt=${v.stadt}&ort=${v.ort}`, { waitUntil: 'networkidle0', timeout: 90000 });
    await seite.waitForFunction('window.fertig === true', { timeout: 90000 });
    // Nach "idle" fehlen manchmal noch Schriftglyphen; ohne die Pause bleiben
    // einzelne Ortsnamen leer.
    await new Promise((r) => setTimeout(r, 1500));
    const bild = await seite.screenshot({ type: 'webp', quality: 88 });
    if (fehler.length) throw new Error(`${v.name} @${dichte}x: ${fehler.join(' | ')}`);
    const datei = path.join(ASSETS, `tp-verlegegebiet-${v.name}${dichte === 2 ? '-2x' : ''}.webp`);
    await writeFile(datei, bild);
    console.log(`${path.basename(datei)}  ${v.breite * dichte}x${v.hoehe * dichte}  ${Math.round(bild.length / 1024)} KB`);
    await seite.close();
  }
  const mpp = meterProPixel(v.zoom);
  geometrie[v.name] = { breite: v.breite, hoehe: v.hoehe, meter_pro_pixel: Number(mpp.toFixed(2)) };
  console.log(`   ${v.name}: ${mpp.toFixed(2)} m je Punkt, 50 km = ${((50000 / mpp / v.breite) * 100).toFixed(3)} % der Breite`);
}

await browser.close();
server.close();

console.log('\nGeometrie fuer sections/tp-verlegegebiet.liquid:');
console.log(JSON.stringify(geometrie, null, 2));
