#!/usr/bin/env node
/**
 * Basiskarten und Gebietsumriss fuer die Sektion "TP Verlegegebiet" bauen.
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
 * Der Umriss ist kein Kreis. Er entsteht aus denselben Postleitzahlen, gegen
 * die die Sektion prueft: um jede PLZ eine Voronoi-Zelle, davon die Zellen im
 * Radius vereinigt. Karte und Pruefung koennen dadurch gar nicht auseinander-
 * laufen - was die Flaeche zeigt, sagt auch die Eingabe. Ein einmaliges
 * Schrumpfen und Wiederaufblasen schneidet die Nadeln ab, die grosse Zellen in
 * duenn besiedelten Ecken sonst erzeugen.
 *
 * Aufruf (braucht Netz und das devDependency puppeteer):
 *     python3 scripts/build-verlegegebiet-orte.py    # liefert die Punkte
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
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const WURZEL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ASSETS = path.join(WURZEL, 'assets');
const PUNKTE = path.join(WURZEL, '.cache', 'verlegegebiet-punkte.json');
const UMRISS = path.join(WURZEL, 'snippets', 'tp-verlegegebiet-flaeche.liquid');

// Muss zu den Stufen des Reglers in sections/tp-verlegegebiet.liquid passen.
const RADIEN = [30, 40, 50, 60];

// Kilometer, um die der Umriss geschrumpft und wieder aufgeblasen wird.
const RUNDUNG = 5.5;

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

  // Warme, helle Palette aus der Familie des Shops, mit so viel Farbe, dass
  // die Karte lebt: Seen und Havel blau, Wald und Schorfheide gruen, Berlin
  // als warme Siedlungsflaeche. Alles entsaettigt, damit die Markenflaeche
  // darueber die kraeftigste Farbe im Bild bleibt.
  const GRUND = '#faf8f5';
  const WASSER = '#cbdde6';
  const WALD = '#e2ebdb';
  const SIEDLUNG = '#f3eee5';
  const STRASSE = '#e9e1d4';
  const SCHRIFT = '#443e36';

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
      } else if (ebene.id.startsWith('landcover') || /park|wood|forest|grass/.test(ebene.id)) {
        if (ebene.type === 'fill') karte.setPaintProperty(ebene.id, 'fill-color', WALD);
      } else if (ebene.type === 'fill' && /residential|landuse|urban|built/.test(ebene.id)) {
        karte.setPaintProperty(ebene.id, 'fill-color', SIEDLUNG);
      } else if (ebene.type === 'line' && /highway|road|bridge|tunnel/.test(ebene.id)) {
        karte.setPaintProperty(ebene.id, 'line-color', STRASSE);
      } else if (ebene.id === 'waterway') {
        karte.setPaintProperty(ebene.id, 'line-color', WASSER);
      }
    }

    karte.once('idle', () => { window.fertig = true; });
  });
</script>`;

const UMRISS_SEITE = `<!doctype html>
<meta charset="utf-8">
<title>Umriss</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Turf.js/7.1.0/turf.min.js"></script>
<script>
window.umriss = async function (radien, rundung, mitte) {
  const punkte = await (await fetch('punkte.json')).json();
  const sitze = [];
  const entfernung = {};
  for (const [plz, [lon, lat, km]] of Object.entries(punkte)) {
    sitze.push(turf.point([lon, lat], { plz }));
    entfernung[plz] = km;
  }
  // Die Zellen brauchen einen Rahmen, sonst laufen die aeusseren ins Unendliche.
  const rahmen = [mitte[0] - 3.2, mitte[1] - 2.0, mitte[0] + 3.2, mitte[1] + 2.0];
  const zellen = turf.voronoi(turf.featureCollection(sitze), { bbox: rahmen });

  const N = 256 * 2 ** 9;   // Weltbreite in Bildpunkten des Desktop-Massstabs
  const punkt = (lon, lat) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return [((lon + 180) / 360) * N, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N];
  };
  const [mx, my] = punkt(mitte[0], mitte[1]);

  const ergebnis = {};
  for (const r of radien) {
    const teile = [];
    zellen.features.forEach((zelle, i) => {
      if (zelle && entfernung[sitze[i].properties.plz] <= r) teile.push(zelle);
    });
    let form = teile[0];
    for (let i = 1; i < teile.length; i++) {
      try { form = turf.union(turf.featureCollection([form, teile[i]])); } catch (e) {}
    }
    // Schrumpfen und wieder aufblasen: schneidet die Nadeln ab, die grosse
    // Zellen in duenn besiedelten Ecken erzeugen, und rundet die Ecken.
    form = turf.buffer(form, -rundung, { units: 'kilometers' });
    form = turf.buffer(form, rundung * 1.15, { units: 'kilometers' });
    form = turf.buffer(form, -rundung * 0.15, { units: 'kilometers' });
    // Beim Schrumpfen koennen Splitter abfallen - nur das groesste Stueck zaehlt.
    if (form.geometry.type === 'MultiPolygon') {
      form = form.geometry.coordinates
        .map((c) => turf.polygon(c))
        .sort((a, b) => turf.area(b) - turf.area(a))[0];
    }
    const glatt = turf.simplify(form, { tolerance: 0.004, highQuality: true });
    const ringe = glatt.geometry.type === 'Polygon' ? [glatt.geometry.coordinates] : glatt.geometry.coordinates;
    ergebnis[r] = ringe
      .map((flaeche) => flaeche
        .map((ring) => ring
          .map(([lo, la], j) => {
            const [x, y] = punkt(lo, la);
            return (j ? 'L' : 'M') + (x - mx).toFixed(1) + ' ' + (y - my).toFixed(1);
          })
          .join('') + 'Z')
        .join(''))
      .join('');
  }
  return ergebnis;
};
<\/script>`;

const punkteRoh = await readFile(PUNKTE, 'utf8').catch(() => {
  throw new Error(`${PUNKTE} fehlt - zuerst python3 scripts/build-verlegegebiet-orte.py laufen lassen.`);
});

const server = createServer((anfrage, antwort) => {
  if (anfrage.url.startsWith('/punkte.json')) {
    antwort.writeHead(200, { 'Content-Type': 'application/json' });
    antwort.end(punkteRoh);
    return;
  }
  antwort.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  antwort.end(anfrage.url.startsWith('/umriss') ? UMRISS_SEITE : SEITE);
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

// --- Umriss ---------------------------------------------------------------
const rechenseite = await browser.newPage();
rechenseite.on('pageerror', (e) => { throw new Error(`Umriss: ${e.message}`); });
await rechenseite.goto(`${basis}umriss`, { waitUntil: 'networkidle0', timeout: 90000 });
const pfade = await rechenseite.evaluate(
  (radien, rundung, mitte) => window.umriss(radien, rundung, mitte),
  RADIEN, RUNDUNG, [LON, LAT],
);
await rechenseite.close();

const zeilen = RADIEN.map((r) => `  {%- when ${r} -%}\n    <path class="tp-vg__gebiet-form" d="${pfade[r]}" />`);
await writeFile(UMRISS, `{%- doc -%}
  Umriss des Verlegegebiets als SVG-Pfad, je Stufe des Radius-Reglers einer.

  Erzeugt von scripts/build-verlegegebiet-karte.mjs - nicht von Hand aendern.
  Die Koordinaten sind Bildpunkte des Desktop-Massstabs (185,12 m je Punkt),
  Nullpunkt ist der Standort. Die Sektion setzt sie ueber zwei viewBox-Werte
  auf die breite und die schmale Karte.

  @param {number} radius - Radius in km, muss eine der Stufen sein
{%- enddoc -%}

{%- case radius -%}
${zeilen.join('\n')}
{%- endcase -%}
`);
console.log(`\n${path.relative(WURZEL, UMRISS)}  ${RADIEN.length} Stufen, `
  + `${RADIEN.map((r) => `${r} km: ${pfade[r].length} Zeichen`).join(', ')}`);

await browser.close();
server.close();

console.log('\nGeometrie fuer sections/tp-verlegegebiet.liquid:');
console.log(JSON.stringify(geometrie, null, 2));
