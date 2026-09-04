#!/usr/bin/env node

/**
 * Elastium Linoleumboden - Bilder hochladen
 * 
 * Nutzen: npm run -- scripts/elastium-image-upload.mjs
 * 
 * Funktion:
 * 1. Fetcht Bild-URLs von jordanshop.de für alle 24 Farben
 * 2. Ladet Bilder zu Shopify via stagedUpload
 * 3. Appended Media zu ProductVariant
 * 4. Generiert Evidence für Audit
 */

import fetch from 'node-fetch';

const ELASTIUM_PRODUCT_ID = 'gid://shopify/Product/16045140771150';
const ELASTIUM_VARIANTS = {
  '4276': 'gid://shopify/ProductVariant/60666926039374',
  '4289': 'gid://shopify/ProductVariant/60666926465358',
  '4290': 'gid://shopify/ProductVariant/60666926498126',
  '4291': 'gid://shopify/ProductVariant/60666926530894',
  '4292': 'gid://shopify/ProductVariant/60666926563662',
  '4293': 'gid://shopify/ProductVariant/60666926596430',
  '4294': 'gid://shopify/ProductVariant/60666926629198',
  '4295': 'gid://shopify/ProductVariant/60666926661966',
  '4296': 'gid://shopify/ProductVariant/60666926694734',
  '4297': 'gid://shopify/ProductVariant/60666926727502',
  '4298': 'gid://shopify/ProductVariant/60666926760270',
  '4299': 'gid://shopify/ProductVariant/60666926793038',
  '4300': 'gid://shopify/ProductVariant/60666926825806',
  '4301': 'gid://shopify/ProductVariant/60666926858574',
  '4302': 'gid://shopify/ProductVariant/60666926891342',
  '4303': 'gid://shopify/ProductVariant/60666926924110',
  '4304': 'gid://shopify/ProductVariant/60666926956878',
  '4305': 'gid://shopify/ProductVariant/60666926989646',
  '4306': 'gid://shopify/ProductVariant/60666927022414',
  '4307': 'gid://shopify/ProductVariant/60666927055182',
  '4308': 'gid://shopify/ProductVariant/60666927087950',
  '4309': 'gid://shopify/ProductVariant/60666927120718',
  '4310': 'gid://shopify/ProductVariant/60666927153486',
  '4311': 'gid://shopify/ProductVariant/60666927186254'
};

/**
 * Step 1: jordanshop.de URL für jede Farbe generieren
 */
async function getImageUrl(colorCode) {
  // Format: https://media.jordanshop.de/original/pvc-jokaneo-elastium-linoleumboden-{code}.jpg
  const url = `https://media.jordanshop.de/original/pvc-jokaneo-elastium-linoleumboden-${colorCode}.jpg`;
  
  try {
    const resp = await fetch(url, { method: 'HEAD', timeout: 5000 });
    if (resp.status === 200) {
      return { code: colorCode, url, status: 'FOUND' };
    } else {
      return { code: colorCode, url, status: `NOT_FOUND (${resp.status})` };
    }
  } catch (err) {
    return { code: colorCode, url, status: `ERROR: ${err.message}` };
  }
}

/**
 * Step 2: Alle URLs prüfen
 */
async function validateAllUrls() {
  console.log('📸 Validiere Bild-URLs von jordanshop.de...\n');
  
  const results = [];
  for (const colorCode of Object.keys(ELASTIUM_VARIANTS)) {
    const result = await getImageUrl(colorCode);
    results.push(result);
    console.log(`  Farbe ${result.code}: ${result.status}`);
  }
  
  const found = results.filter(r => r.status === 'FOUND').length;
  const notFound = results.filter(r => r.status.includes('NOT_FOUND')).length;
  
  console.log(`\n📊 Ergebnis: ${found} gefunden, ${notFound} nicht gefunden\n`);
  
  return results;
}

/**
 * GraphQL Mutations für Image Upload
 */
const STAGED_UPLOAD_MUTATION = `
mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters {
        name
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

const APPEND_MEDIA_MUTATION = `
mutation appendMedia($variantId: ID!, $media: [CreateMediaInput!]!) {
  productVariantAppendMedia(variantId: $variantId, media: $media) {
    productVariant { id }
    userErrors { field message }
  }
}
`;

/**
 * Main: Vorbereitung für lokale Ausführung
 */
async function main() {
  console.log('🚀 Elastium Image Upload - Preparation\n');
  console.log('Produkt-ID: ' + ELASTIUM_PRODUCT_ID);
  console.log('Varianten: ' + Object.keys(ELASTIUM_VARIANTS).length);
  console.log('\n---\n');
  
  // Validiere URLs
  const urlResults = await validateAllUrls();
  
  // Generiere Upload-Plan
  console.log('📋 Upload-Plan (für manuellen MCP-Aufruf):\n');
  console.log('Schritt 1: stagedUploadsCreate für jede URL aufrufen');
  console.log('Schritt 2: productVariantAppendMedia für jede Media aufrufen\n');
  
  const commands = urlResults
    .filter(r => r.status === 'FOUND')
    .map(r => `  # Farbe ${r.code}\n  # URL: ${r.url}\n  # Variant: ${ELASTIUM_VARIANTS[r.code]}`)
    .join('\n\n');
  
  console.log(commands);
  console.log('\n---');
  console.log('\nNächste Schritte:');
  console.log('1. ✓ Diese Script ausführen (bestätigt jordanshop.de URLs)');
  console.log('2. Im Claude Code MCP aufrufen:');
  console.log('   graphql_mutation(stagedUploadsCreate)');
  console.log('3. Bilder via productVariantAppendMedia zu Varianten verlinken');
  console.log('4. Evidence sammeln und committen');
}

main().catch(console.error);

export { ELASTIUM_VARIANTS, STAGED_UPLOAD_MUTATION, APPEND_MEDIA_MUTATION };
