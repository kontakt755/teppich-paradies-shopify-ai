#!/usr/bin/env node
/**
 * Jordan-Produktbilder nach Shopify uebernehmen.
 *
 *   node scripts/jordan-media-scrape.mjs snippet PVCJOKANEO
 *   node scripts/jordan-media-scrape.mjs plan data/jokaleum-neocare-images.json <productGid>
 *
 * ─── Warum zwei Schritte ───────────────────────────────────────────────
 * Die Trefferbilder der Jordan-Suche stehen NICHT im ausgelieferten HTML.
 * `curl` bekommt HTTP 200 und 175 KB, darin aber nur drei <img>-Tags — die
 * Produktbilder haengt erst clientseitiges JavaScript ein. Deshalb muss das
 * Einsammeln durch einen echten Browser laufen (`snippet` gibt das JS dafuer
 * aus); die Uebernahme nach Shopify laeuft danach rein ueber die Admin-API.
 *
 * ─── Drei Fallen, je eine Sitzung teuer ────────────────────────────────
 * 1. Die Suche liegt unter /de-DE/search. Ohne Sprachpraefix leitet der Shop
 *    wortlos auf die Startseite um — man sucht dann in der Startseite.
 * 2. Die Bild-URL enthaelt NICHT den Farbcode, sondern eine interne Artikel-ID
 *    (…/1127838-8FXC-prod.JPG fuer Farbe 4289). URLs aus dem Farbcode zu bauen
 *    ergibt durchgaengig 404. Der Farbcode steht ausschliesslich im alt-Text.
 * 3. Ausgeliefert wird ueber images.intellishop.cloud; das Original steckt
 *    base64-kodiert (URL-Alphabet) im letzten Pfadsegment. Ohne Dekodieren
 *    bekommt man skalierte WebP-Derivate statt des Original-JPG.
 *
 * ─── Upload ────────────────────────────────────────────────────────────
 * `productCreateMedia` mit `originalSource` laedt die fremde URL selbst.
 * Der in aelteren Notizen beschriebene `stagedUploadsCreate`-Umweg ist
 * unnoetig, solange die Quell-URL oeffentlich erreichbar ist.
 */

import { readFileSync } from 'node:fs';

const BROWSER_SNIPPET = (sku) => `// 1. Browser oeffnen auf:
//    https://www.jordanshop.de/de-DE/search?query=${sku}
// 2. Je Ergebnisseite (?page=1, 2, …) dieses Snippet ausfuehren
//    und die Ausgaben zusammenfuehren:

function decodeCdnSource(src) {
  const segment = src.match(/\\/([A-Za-z0-9_-]{40,})(?:\\.webp)?(?:\\?|$)/);
  if (!segment) return null;
  let b64 = segment[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  try { return atob(b64); } catch { return null; }
}

JSON.stringify(Object.fromEntries(
  [...document.querySelectorAll('img')]
    .map((img) => [img.alt.match(/\\b(\\d{4})\\b/)?.[1], decodeCdnSource(img.src)])
    .filter(([code, url]) => code && url?.includes('media.jordanshop.de'))
), null, 1)`;

function buildPlan(catalogPath, productGid) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const withImage = Object.entries(catalog.farben).filter(([, url]) => url);
  const withoutImage = Object.keys(catalog.farben).filter((code) => !catalog.farben[code]);

  console.log(`Artikel ${catalog.artikelnummer ?? '?'} — ${withImage.length} Farben mit Bild, ${withoutImage.length} ohne.\n`);

  console.log('Schritt 1 — Bilder anlegen (productCreateMedia):');
  console.log(JSON.stringify({
    productId: productGid,
    media: withImage.map(([code, url]) => ({
      originalSource: url,
      alt: `${catalog.produkt ?? catalog.artikelnummer} Farbe ${code}`,
      mediaContentType: 'IMAGE',
    })),
  }, null, 2));

  console.log('\nSchritt 2 — je Farbe die zurueckgegebene MediaImage-ID an die');
  console.log('passende Variante haengen (productVariantAppendMedia, Feld');
  console.log('variantMedia: [{ variantId, mediaIds }] — NICHT media/mediaId).');

  if (withoutImage.length) {
    console.log(`\nOhne Bild bei Jordan, offener Fall: ${withoutImage.join(', ')}`);
  }
}

const [command, ...args] = process.argv.slice(2);

if (command === 'snippet' && args[0]) {
  console.log(BROWSER_SNIPPET(args[0]));
} else if (command === 'plan' && args[0] && args[1]) {
  buildPlan(args[0], args[1]);
} else {
  console.error([
    'Aufruf:',
    '  node scripts/jordan-media-scrape.mjs snippet <ARTIKELNUMMER>',
    '  node scripts/jordan-media-scrape.mjs plan <katalog.json> <productGid>',
  ].join('\n'));
  process.exit(1);
}
