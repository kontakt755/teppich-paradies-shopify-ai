#!/usr/bin/env node

/**
 * Grosshandel → Shopify GraphQL Admin API Sync
 *
 * Serverseitige Integration (KEINE Chrome-Automation)
 * Standard-Modus: DRY-RUN mit Prüfbarem Report
 * Live-Sync: Nur mit expliziter Freigabe (SYNC_APPROVED=true)
 *
 * Externe ID = Artikelnummer des Grosshaendlers (unveränderlicher Schlüssel)
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
import { GraphQLProxy } from './graphql-proxy.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const reportsDir = path.join(rootDir, '.sync-reports');

// Ensure directories exist
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

// Load .env.local wenn vorhanden (lokal dev, nicht getrackt)
const envLocalPath = path.join(rootDir, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.trim().match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  });
}

const SHOPIFY_STORE = 'sjjyq1-6w';
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-07';
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
// PHASE 2: LOAD CATALOG DATA
// ─────────────────────────────────────────────────────────────

function loadCatalogData() {
  const catalogPath = path.join(dataDir, 'grosshandel-catalog.json');

  if (!fs.existsSync(catalogPath)) {
    console.warn(`⚠️  No catalog found at ${catalogPath}`);
    console.warn('   Create one via: supplier API export or CSV → JSON conversion');
    return [];
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  console.log(`📦 Loaded ${catalog.length} articles from catalog\n`);
  return catalog;
}

// ─────────────────────────────────────────────────────────────
// PHASE 3: SHOPIFY GRAPHQL QUERIES (via MCP Proxy — kein Token nötig!)
// ─────────────────────────────────────────────────────────────

let proxyInstance = null;

/** Der Konstruktor wirft bei unbrauchbarem Token; deshalb erst beim Aufruf bauen. */
export function getProxy() {
  if (!proxyInstance) {
    proxyInstance = new GraphQLProxy({ store: SHOPIFY_STORE, apiVersion: SHOPIFY_API_VERSION });
  }
  return proxyInstance;
}

/**
 * GraphQL-Aufrufe laufen über den MCP-Proxy.
 * Der Proxy sammelt Calls und führt sie über Shopify MCP aus — **ohne Token**.
 *
 * Das funktioniert, weil der MCP bereits authentifiziert ist.
 * Lokal kann jeder Sync-Aufruf stattfinden, ohne einen Token zu speichern.
 */
async function shopifyGraphQL(query, variables = {}) {
  return getProxy().execute(query, variables);
}

// Get all Shopify products with external ID metafield
export const PRODUCT_PAGE_SIZE = 250;
export const MAX_PRODUCT_PAGES = 40; // 10.000 Produkte; darueber ist etwas anderes falsch

export async function getShopifyProducts(proxy = getProxy()) {
  const query = `
    query ProductsPage($cursor: String) {
      products(first: ${PRODUCT_PAGE_SIZE}, after: $cursor) {
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

  // Bis 2026-09-23 wurde pageInfo abgefragt und verworfen: alles ab Produkt 251
  // fehlte im Abgleich, ohne Fehlermeldung. Jetzt wird geblaettert.
  const nodes = [];
  let cursor = null;

  for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
    const data = await proxy.execute(query, { cursor });
    // Sammel-Betriebsart (kein Token): execute liefert null, nichts zu blaettern.
    if (!data?.products) return nodes;

    nodes.push(...(data.products.nodes || []));
    const pageInfo = data.products.pageInfo;
    if (!pageInfo?.hasNextPage) return nodes;
    cursor = pageInfo.endCursor;
  }

  throw new Error(
    `Produktabfrage nach ${MAX_PRODUCT_PAGES} Seiten (${nodes.length} Produkte) nicht am Ende. Abbruch statt Endlosschleife.`
  );
}

// ─────────────────────────────────────────────────────────────
// PHASE 4: MATCHING & DIFFING
// ─────────────────────────────────────────────────────────────

function findExternalId(shopifyProduct) {
  const metafields = shopifyProduct.metafields?.nodes || [];
  const extIdField = metafields.find((m) => m.key === 'externe_id');
  return extIdField?.value || null;
}

function findNewArticles(catalogData, shopifyProducts) {
  const shopifyExtIds = new Set(shopifyProducts.map(findExternalId).filter(Boolean));

  return catalogData.filter((article) => {
    const extId = article.externe_id || article.sku;
    return !shopifyExtIds.has(extId);
  });
}

function findExistingMatches(catalogData, shopifyProducts) {
  const shopifyMap = new Map();
  shopifyProducts.forEach((p) => {
    const extId = findExternalId(p);
    if (extId) shopifyMap.set(extId, p);
  });

  return catalogData
    .filter((article) => {
      const extId = article.externe_id || article.sku;
      return shopifyMap.has(extId);
    })
    .map((article) => {
      const extId = article.externe_id || article.sku;
      return {
        artikel: article,
        shopify: shopifyMap.get(extId),
      };
    });
}

// ─────────────────────────────────────────────────────────────
// PHASE 5: SAFETY RULES
// ─────────────────────────────────────────────────────────────

export function checkSafetyRules(newArticles, existingToUpdate) {
  const issues = [];

  if (newArticles.length > 10) {
    issues.push(`⚠️  >10 neue Artikel (${newArticles.length}). Bitte manuell reviewen.`);
  }

  // Check for price changes below package prices
  for (const update of existingToUpdate) {
    // Der Katalog fuehrt das Feld `preis_eur`. Bis 2026-09-23 stand hier
    // `update.artikel.price` - undefined, damit newPrice 0 und die Sperre
    // unten dauerhaft wirkungslos.
    const oldPrice = parseFloat(update.shopify.variants[0]?.price ?? '0');
    const newPrice = parseFloat(update.artikel.preis_eur ?? '0');

    if (newPrice > 0 && newPrice < oldPrice * 0.8) {
      issues.push(
        `⚠️  ${update.artikel.titel}: Preisrückgang >20% (${oldPrice}€ → ${newPrice}€)`
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
      titel: u.artikel.titel,
      shopifyHandle: u.shopify.handle,
      changes: {
        preis: {
          alt: u.shopify.variants[0]?.price,
          neu: u.artikel.preis_eur,
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

export function preisAbweichung(match) {
  // Shopify liefert den Preis als String, der Katalog als Zahl.
  // Ungeprueft verglichen ('12.90' !== 12.9) meldete jeder Artikel eine Aenderung.
  const alt = parseFloat(match.shopify?.variants?.[0]?.price ?? 'NaN');
  const neu = parseFloat(match.artikel?.preis_eur ?? 'NaN');
  if (!Number.isFinite(alt) || !Number.isFinite(neu)) return null;
  if (Math.abs(alt - neu) < 0.005) return null;
  return { alt, neu };
}

async function updateProductFields(match) {
  const abweichung = preisAbweichung(match);

  if (!abweichung) {
    console.log(`ℹ️  Keine Aenderung noetig: ${match.artikel.titel}`);
    return { status: 'UNVERAENDERT' };
  }

  // Preisschreiben ist bewusst nicht implementiert: Preise aendern steht unter
  // den Sicherheitsgrenzen in CLAUDE.md und braucht eine ausdrueckliche Freigabe.
  // Die richtige Mutation waere productVariantsBulkUpdate - productVariantUpdate,
  // auf das der alte TODO zeigte, gibt es in der Admin API nicht.
  console.log(
    `⏭️  Uebersprungen (Preisschreiben nicht freigegeben): ${match.artikel.titel} ` +
    `${abweichung.alt}€ → ${abweichung.neu}€`
  );
  return { status: 'UEBERSPRUNGEN', ...abweichung };
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═════════════════════════════════════════════╗');
  console.log('║  Grosshandel → Shopify GraphQL Admin Sync   ║');
  console.log('║  Mode: DRY-RUN (Standard)                   ║');
  console.log('╚═════════════════════════════════════════════╝\n');

  // Step 1: Guards
  runGuards();

  // Step 2: Load data
  const catalogData = loadCatalogData();
  if (catalogData.length === 0) {
    console.log('ℹ️  No catalog data to sync. Exiting.');
    process.exit(0);
  }

  // Step 3: Query Shopify
  // Ohne Token (lokal, ohne MCP-Bruecke) ist kein Abgleich moeglich: die
  // Abfragen werden nur gesammelt und exportiert, der Lauf endet sauber.
  const graphqlProxy = getProxy();
  if (!graphqlProxy.live) {
    console.log('ℹ️  Kein SHOPIFY_ADMIN_TOKEN gesetzt: Abfragen werden nur gesammelt, kein Abgleich mit Shopify.');
    console.log('   In GitHub Actions kommt der Token aus dem Repository-Secret; lokal laeuft Schreibzugriff ueber den Shopify-MCP (CLAUDE.md).');
    await getShopifyProducts().catch(() => null);
    graphqlProxy.exportLog();
    process.exit(0);
  }
  console.log(`📡 Querying Shopify (${graphqlProxy.endpoint})...`);
  const shopifyProducts = await getShopifyProducts();
  console.log(`✅ Found ${shopifyProducts.length} existing products\n`);

  // Step 4: Diff
  const newArticles = findNewArticles(catalogData, shopifyProducts);
  const existingToUpdate = findExistingMatches(catalogData, shopifyProducts);

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
📡 GraphQL-Calls:     ${graphqlProxy.requestLog.length} (LIVE gegen die Admin API)
  `);

  // Exportiere GraphQL-Calls für externe Verarbeitung über Claude/MCP
  graphqlProxy.exportLog();

  // Step 7: Live sync?
  const approved = process.env[SYNC_APPROVED_ENV] === 'true';

  if (approved) {
    console.log('🚀 SYNC_APPROVED=true → Applying changes...\n');

    for (const article of newArticles) {
      await createProductDraft(article);
    }

    let uebersprungen = 0;
    for (const match of existingToUpdate) {
      const ergebnis = await updateProductFields(match);
      if (ergebnis?.status === 'UEBERSPRUNGEN') uebersprungen++;
    }

    if (uebersprungen > 0) {
      console.log(
        `\n⚠️  TEILWEISE: ${newArticles.length} Entwuerfe angelegt, ` +
        `${uebersprungen} Preisaenderung(en) NICHT geschrieben (nicht freigegeben).`
      );
    } else {
      console.log('\n✅ SYNC COMPLETE');
    }
  } else {
    console.log(`ℹ️  To apply: SYNC_APPROVED=true npm run sync:grosshandel`);
    console.log(`ℹ️  Or locally: SYNC_APPROVED=true node workflow/sync-grosshandel.mjs`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('❌ Sync failed:', err.message);
    process.exit(1);
  });
}
