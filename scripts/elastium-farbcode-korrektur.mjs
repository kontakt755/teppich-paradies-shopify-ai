#!/usr/bin/env node
/**
 * Korrekturplan fuer die Farbcodes des Elastium-Linoleumbodens.
 *
 *   node scripts/elastium-farbcode-korrektur.mjs
 *
 * ─── Befund ────────────────────────────────────────────────────────────
 * Shopify-Produkt 16045140771150 fuehrt 24 Farbvarianten. Nur drei davon
 * (4276, 4289, 4296) existieren beim Lieferanten. Die uebrigen 21 sind ab
 * 4290 lueckenlos hochgezaehlt — ein Zaehlmuster, kein Lieferantenschema.
 * Gleichzeitig fehlen genau die 21 echten Codes des Artikels PVCJOKANEO.
 *
 * ─── Warum die Zuordnung willkuerlich sein darf ────────────────────────
 * Die erfundenen Codes tragen keine Information: Es gibt kein Bild, keinen
 * Bestand und keine Bestellung dazu. Jede Zuordnung erfundener → echter Code
 * ist daher gleich richtig. Gewaehlt wird aufsteigend, damit das Ergebnis
 * reproduzierbar ist. Die drei korrekten Varianten bleiben unangetastet.
 *
 * ─── Ausfuehrung ───────────────────────────────────────────────────────
 * Dieses Skript AENDERT NICHTS. Es druckt die GraphQL-Variablen, die dann
 * ueber den Shopify-MCP laufen. SKU-Aenderungen sind laut CLAUDE.md eine
 * Protected Action und brauchen ausdrueckliche Freigabe.
 */

import { readFileSync } from 'node:fs';

const PRODUCT_GID = 'gid://shopify/Product/16045140771150';

const SHOPIFY_VARIANTEN = {
  4276: '60666926039374', 4289: '60666926465358', 4290: '60666926498126',
  4291: '60666926530894', 4292: '60666926563662', 4293: '60666926596430',
  4294: '60666926629198', 4295: '60666926661966', 4296: '60666926694734',
  4297: '60666926727502', 4298: '60666926760270', 4299: '60666926793038',
  4300: '60666926825806', 4301: '60666926858574', 4302: '60666926891342',
  4303: '60666926924110', 4304: '60666926956878', 4305: '60666926989646',
  4306: '60666927022414', 4307: '60666927055182', 4308: '60666927087950',
  4309: '60666927120718', 4310: '60666927153486', 4311: '60666927186254',
};

const katalog = JSON.parse(readFileSync('data/jokaleum-neocare-images.json', 'utf8'));
const echteCodes = Object.keys(katalog.farben).sort();
const shopCodes = Object.keys(SHOPIFY_VARIANTEN).sort();

const korrekt = shopCodes.filter((c) => echteCodes.includes(c));
const erfunden = shopCodes.filter((c) => !echteCodes.includes(c));
const fehlend = echteCodes.filter((c) => !shopCodes.includes(c));

if (erfunden.length !== fehlend.length) {
  console.error(`Abbruch: ${erfunden.length} erfundene, aber ${fehlend.length} fehlende Codes.`);
  console.error('Die Eins-zu-eins-Zuordnung ist dann nicht mehr gueltig — Fall von Hand pruefen.');
  process.exit(1);
}

const zuordnung = erfunden.map((alt, i) => ({
  alt,
  neu: fehlend[i],
  variantId: `gid://shopify/ProductVariant/${SHOPIFY_VARIANTEN[alt]}`,
  bildUrl: katalog.farben[fehlend[i]],
}));

console.log(`Produkt: ${PRODUCT_GID}`);
console.log(`Unveraendert (Code stimmt): ${korrekt.join(', ')}\n`);
console.log(`Umzubenennen: ${zuordnung.length} Varianten\n`);
for (const { alt, neu, bildUrl } of zuordnung) {
  console.log(`  Farbe ${alt}  →  Farbe ${neu}   ${bildUrl ? 'Bild vorhanden' : 'OHNE BILD'}`);
}

console.log('\n── Schritt 1: Optionswerte und SKUs korrigieren ──');
console.log('mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {');
console.log('  productVariantsBulkUpdate(productId: $productId, variants: $variants) {');
console.log('    productVariants { id title sku }');
console.log('    userErrors { field message }');
console.log('  }');
console.log('}');
console.log(JSON.stringify({
  productId: PRODUCT_GID,
  variants: zuordnung.map(({ neu, variantId }) => ({
    id: variantId,
    optionValues: [{ optionName: 'Farbe', name: `Farbe ${neu}` }],
    inventoryItem: { sku: `PVCJOKANEO_${neu}` },
  })),
}, null, 2));

const mitBild = zuordnung.filter((z) => z.bildUrl);
console.log('\n── Schritt 2: Bilder anlegen ──');
console.log(JSON.stringify({
  productId: PRODUCT_GID,
  media: mitBild.map(({ neu, bildUrl }) => ({
    originalSource: bildUrl,
    alt: `Jokaleum Neocare Linoleumboden Farbe ${neu}`,
    mediaContentType: 'IMAGE',
  })),
}, null, 2));

console.log('\n── Schritt 3 ──');
console.log('Die zurueckgegebenen MediaImage-IDs an die jeweilige Variante haengen:');
console.log('productVariantAppendMedia(productId, variantMedia: [{ variantId, mediaIds }])');

const ohneBild = [...zuordnung.filter((z) => !z.bildUrl).map((z) => z.neu),
  ...korrekt.filter((c) => !katalog.farben[c])];
if (ohneBild.length) {
  console.log(`\nOffener Fall — bei Jordan ohne Bild: ${ohneBild.sort().join(', ')}`);
}
