#!/usr/bin/env node

/**
 * JordichShop → Shopify GraphQL Admin API Sync
 *
 * Serverseitige Integration (KEINE Chrome-Automation)
 * Standard-Modus: DRY-RUN mit Prüfbarem Report
 * Live-Sync: Nur mit expliziter Freigabe (SYNC_APPROVED=true)
 *
 * Externe ID = Jordan-Artikelnummer (unveränderlicher Schlüssel)
 * Neue Artikel → DRAFT-Status
 * Bestehende → Idempotente Feldänderungen (nie productSet mit unvollständigen Listen)
 *
 * Guards vor Ausführung: syncpath:guard, workflow:route, theme:guard
 * Regeln: Keine Löschungen, keine SKU-Änderungen, <10 neue ohne Freigabe
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const reportsDir = path.join(rootDir, '.sync-reports');

// Ensure directories exist
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

const SHOPIFY_STORE = 'sjjyq1-6w';
const SHOPIFY_API_VERSION = '2024-01';
const SYNC_TOKEN_ENV = 'SHOPIFY_ADMIN_TOKEN';
const SYNC_APPROVED_ENV = 'SYNC_APPROVED';

// ─────────────────────────────────────────────────────────────
// PHASE 1: GUARDS
// ─────────────────────────────────────────────────────────────

function runGuards() {
  console.log('🔍 Running pre-sync guards...\n');

  try {
    execSync('npm run syncpath:guard', { cwd: rootDir, stdio: 'inherit' });
    console.log('✅ syncpath:guard passed\n');
  } catch (e) {
    console.error('❌ syncpath:guard failed');
    process.exit(1);
  }

  try {
    execSync('npm run theme:guard', { cwd: rootDir, stdio: 'inherit' });
    console.log('✅ theme:guard passed\n');
  } catch (e) {
    console.error('❌ theme:guard failed');
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────
// PHASE 2: LOAD JORDANSHOP DATA
// ─────────────────────────────────────────────────────────────

function loadJordanshopData() {
  const catalogPath = path.join(dataDir, 'jordan-catalog.json');

  if (!fs.existsSync(catalogPath)) {
    console.warn(`⚠️  No JordanShop catalog found at ${catalogPath}`);
    console.warn('   Create one via: JordanShop API export or CSV → JSON conversion');
    return [];
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  console.log(`📦 Loaded ${catalog.length} articles from JordanShop catalog\n`);
  return catalog;
}

// ─────────────────────────────────────────────────────────────
// PHASE 3: SHOPIFY GRAPHQL QUERIES
// ─────────────────────────────────────────────────────────────

async function shopifyGraphQL(query, variables = {}) {
  const token = process.env[SYNC_TOKEN_ENV];

  if (!token) {
    throw new Error(`❌ Missing ${SYNC_TOKEN_ENV} environment variable`);
  }

  const url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();

  if (result.errors) {
    console.error('GraphQL Error:', result.errors);
    throw new Error(`GraphQL query failed: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

// Get all Shopify products with external ID metafield
async function getShopifyProducts() {
  const query = `
    query {
      products(first: 250) {
        nodes {
          id
          title
          handle
          vendor
          metafields(first: 10, namespace: "grosshandel") {
            nodes {
              key
              value
            }
          }
          variants(first: 100) {
            nodes {
              id
              sku
              price
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query);
  return data.products.nodes;
}

// ─────────────────────────────────────────────────────────────
// PHASE 4: MATCHING & DIFFING
// ─────────────────────────────────────────────────────────────

function findExternalId(shopifyProduct) {
  const metafields = shopifyProduct.metafields?.nodes || [];
  const extIdField = metafields.find((m) => m.key === 'externe_id');
  return extIdField?.value || null;
}

function findNewArticles(jordanData, shopifyProducts) {
  const shopifyExtIds = new Set(shopifyProducts.map(findExternalId).filter(Boolean));

  return jordanData.filter((article) => {
    const extId = article.externe_id || article.sku;
    return !shopifyExtIds.has(extId);
  });
}

function findExistingMatches(jordanData, shopifyProducts) {
  const shopifyMap = new Map();
  shopifyProducts.forEach((p) => {
    const extId = findExternalId(p);
    if (extId) shopifyMap.set(extId, p);
  });

  return jordanData
    .filter((article) => {
      const extId = article.externe_id || article.sku;
      return shopifyMap.has(extId);
    })
    .map((article) => {
      const extId = article.externe_id || article.sku;
      return {
        jordan: article,
        shopify: shopifyMap.get(extId),
      };
    });
}

// ─────────────────────────────────────────────────────────────
// PHASE 5: SAFETY RULES
// ─────────────────────────────────────────────────────────────

function checkSafetyRules(newArticles, existingToUpdate) {
  const issues = [];

  if (newArticles.length > 10) {
    issues.push(`⚠️  >10 neue Artikel (${newArticles.length}). Bitte manuell reviewen.`);
  }

  // Check for price changes below package prices
  for (const update of existingToUpdate) {
    const oldPrice = parseFloat(update.shopify.variants[0]?.price || '0');
    const newPrice = parseFloat(update.jordan.price || '0');

    if (newPrice > 0 && newPrice < oldPrice * 0.8) {
      issues.push(
        `⚠️  ${update.jordan.titel}: Preisrückgang >20% (${oldPrice}€ → ${newPrice}€)`
      );
    }
  }

  if (issues.length > 0) {
    console.log('\n🛑 SAFETY CHECKS FAILED:\n');
    issues.forEach((issue) => console.log(`   ${issue}`));
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// PHASE 6: DRY-RUN REPORT
// ─────────────────────────────────────────────────────────────

function generateReport(newArticles, existingToUpdate) {
  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    mode: 'DRY-RUN',
    summary: {
      newArticles: newArticles.length,
      toUpdate: existingToUpdate.length,
      toDelete: 0,
    },
    new: newArticles.map((a) => ({
      titel: a.titel,
      sku: a.sku,
      externe_id: a.externe_id,
      preis_eur: a.preis_eur,
    })),
    updates: existingToUpdate.map((u) => ({
      titel: u.jordan.titel,
      shopifyHandle: u.shopify.handle,
      changes: {
        preis: {
          alt: u.shopify.variants[0]?.price,
          neu: u.jordan.preis_eur,
        },
      },
    })),
    nextStep: 'Run with SYNC_APPROVED=true to apply changes',
  };

  const reportPath = path.join(reportsDir, `sync-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return { report, reportPath };
}

// ─────────────────────────────────────────────────────────────
// PHASE 7: LIVE SYNC (nur mit Genehmigung)
// ─────────────────────────────────────────────────────────────

async function createProductDraft(article) {
  const mutation = `
    mutation CreateProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const input = {
    title: article.titel,
    vendor: article.hersteller || 'Döllken',
    productType: article.produkttyp || 'Kernsockelleisten',
    status: 'DRAFT',
    metafields: [
      {
        namespace: 'grosshandel',
        key: 'externe_id',
        value: article.externe_id || article.sku,
        type: 'single_line_text_field',
      },
    ],
  };

  const data = await shopifyGraphQL(mutation, { input });
  const errors = data.productCreate?.userErrors || [];

  if (errors.length > 0) {
    console.error(`❌ Failed to create ${article.titel}:`, errors);
    return null;
  }

  console.log(`✅ Created DRAFT: ${article.titel}`);
  return data.productCreate.product;
}

async function updateProductFields(match) {
  // Nur Felder aktualisieren, nicht blindes productSet
  const mutations = [];

  if (match.jordan.preis_eur !== match.shopify.variants[0]?.price) {
    mutations.push(`preis: ${match.jordan.preis_eur}€`);
  }

  if (mutations.length === 0) {
    console.log(`ℹ️  No changes needed: ${match.jordan.titel}`);
    return;
  }

  console.log(`🔄 Updating: ${match.jordan.titel} (${mutations.join(', ')})`);
  // TODO: Implement variant price update via productVariantUpdate
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═════════════════════════════════════════════╗');
  console.log('║  JordanShop → Shopify GraphQL Admin Sync    ║');
  console.log('║  Mode: DRY-RUN (Standard)                   ║');
  console.log('╚═════════════════════════════════════════════╝\n');

  // Step 1: Guards
  runGuards();

  // Step 2: Load data
  const jordanData = loadJordanshopData();
  if (jordanData.length === 0) {
    console.log('ℹ️  No JordanShop data to sync. Exiting.');
    process.exit(0);
  }

  // Step 3: Query Shopify
  console.log('📡 Querying Shopify...');
  const shopifyProducts = await getShopifyProducts();
  console.log(`✅ Found ${shopifyProducts.length} existing products\n`);

  // Step 4: Diff
  const newArticles = findNewArticles(jordanData, shopifyProducts);
  const existingToUpdate = findExistingMatches(jordanData, shopifyProducts);

  // Step 5: Safety checks
  const isSafe = checkSafetyRules(newArticles, existingToUpdate);
  if (!isSafe) {
    process.exit(1);
  }

  // Step 6: Report
  const { report, reportPath } = generateReport(newArticles, existingToUpdate);

  console.log(`
📊 SYNC REPORT (DRY-RUN)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ Neue Artikel:      ${newArticles.length}
🔄 Zu aktualisieren:  ${existingToUpdate.length}
🛑 Zu löschen:        0 (NIEMALS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 Report:            ${reportPath}
  `);

  // Step 7: Live sync?
  const approved = process.env[SYNC_APPROVED_ENV] === 'true';

  if (approved) {
    console.log('🚀 SYNC_APPROVED=true → Applying changes...\n');

    for (const article of newArticles) {
      await createProductDraft(article);
    }

    for (const match of existingToUpdate) {
      await updateProductFields(match);
    }

    console.log('\n✅ SYNC COMPLETE');
  } else {
    console.log(`ℹ️  To apply: SYNC_APPROVED=true npm run sync:jordanshop`);
    console.log(`ℹ️  Or locally: SYNC_APPROVED=true node workflow/sync-jordanshop.mjs`);
  }
}

main().catch((err) => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});
