// Gemeinsame Helfer der Social-Tests: Wegwerf-Verzeichnis, Datenbank im Speicher, kuenstliche Bilder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { oeffne } from '../lib/db.mjs';

export function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-social-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function testDb(t, jetzt = () => new Date('2026-10-01T08:00:00Z')) {
  const db = oeffne(':memory:', { jetzt });
  t.after(() => db.schliessen());
  return db;
}

/** 24-Bit-BMP aus einer Funktion (x, y) -> Grauwert. */
export function bmp(breite, hoehe, grau) {
  const zeile = Math.ceil((breite * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + zeile * hoehe);
  buf.write('BM'); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(breite, 18); buf.writeInt32LE(hoehe, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  for (let y = 0; y < hoehe; y += 1) for (let x = 0; x < breite; x += 1) {
    const o = 54 + (hoehe - 1 - y) * zeile + x * 3; const g = Math.max(0, Math.min(255, Math.round(grau(x, y))));
    buf[o] = g; buf[o + 1] = g; buf[o + 2] = g;
  }
  return buf;
}

/** Renderer-Ersatz: schreibt leere Dateien, damit kein Browser noetig ist. */
export async function scheinRendern(auftraege) {
  for (const a of auftraege) { fs.mkdirSync(path.dirname(a.datei), { recursive: true }); fs.writeFileSync(a.datei, 'jpg'); }
  return auftraege.map(a => a.datei);
}

export function feedProdukt(extra = {}) {
  return {
    title: 'Solenta Eiche Hell', handle: 'solenta-eiche-hell', product_type: 'Klebevinyl', tags: ['raum: wohnzimmer'],
    created_at: '2026-01-10T10:00:00+02:00', published_at: '2026-01-10T10:00:00+02:00', body_html: '<p>Robustes Klebevinyl.</p>',
    options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
    images: [{ src: 'https://cdn.shopify.com/s/files/1/x/bodenbelag-raumbild-1.jpg?v=1', width: 2400, height: 1800, alt: null, variant_ids: [] }],
    variants: [{ id: 1, option1: 'Default Title', price: '21.21', compare_at_price: '24.95', available: true }],
    ...extra,
  };
}

/**
 * Shop-Ersatz fuer die Live-Pruefung vor dem Posten: /products/<handle>.js und die Produktseite.
 * Je Handle einstellbar: {status, location} (404, 301), tags, preis (Cent), farben, varianten
 * (ganze Varianten wie in der .js, z. B. mit unit_price), seite (HTML). Die Standardseite traegt den
 * Preisblock wie das Theme (<product-price data-product-id>), damit nur er als Shoppreis zaehlt.
 * Unbekannte Handles sind aktive Produkte ohne Besonderheiten - die Tests gehen nie ins Netz.
 */
export function scheinShop(produkte = {}) {
  const aufrufe = [];
  const antwort = (status, text, kopf = []) => ({ ok: status >= 200 && status < 300, status, headers: new Map(kopf), text: async () => text, json: async () => JSON.parse(text) });
  const holen = async (url) => {
    aufrufe.push(String(url));
    const m = /^\/products\/([^/]+?)(\.js)?$/.exec(new URL(url).pathname);
    if (!m) return antwort(404, '');
    const [, handle, js] = m;
    const p = produkte[handle] ?? {};
    if (p.status && p.status !== 200) return antwort(p.status, '', p.location ? [['location', p.location]] : []);
    const preis = p.preis ?? 5000;
    if (js) {
      return antwort(200, JSON.stringify({
        id: 1, handle, title: handle, type: 'Teppichboden', available: true, tags: p.tags ?? [],
        options: p.farben ? [{ name: 'Farbe', position: 1, values: p.farben }] : [{ name: 'Title', position: 1, values: ['Default Title'] }],
        variants: p.varianten ?? [{ id: 11, title: 'Default Title', price: preis, compare_at_price: null, available: true }],
      }));
    }
    const euro = (preis / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return antwort(200, p.seite ?? `<html><main><h1>${handle}</h1><product-price data-product-id="1"><span class="price-with-unit__current">${euro}&nbsp;€/m²</span></product-price></main></html>`);
  };
  return { holen, aufrufe };
}
