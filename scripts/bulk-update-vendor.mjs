#!/usr/bin/env node
/**
 * Bulk update vendor field on all active products to "ORVA"
 * Respects Shopify API rate limits with controlled batching
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');

// Load environment
if (!fs.existsSync(envPath)) {
  console.error(`❌ .env.local not found at ${envPath}`);
  console.error('Please ensure you have configured Shopify API credentials.');
  process.exit(1);
}

const env = {};
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && !key.startsWith('#')) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const SHOP = env.SHOPIFY_SHOP || process.env.SHOPIFY_SHOP;
const ACCESS_TOKEN = env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_ADMIN_API_TOKEN;

if (!SHOP || !ACCESS_TOKEN) {
  console.error('❌ Missing SHOPIFY_SHOP or SHOPIFY_ADMIN_API_TOKEN in .env.local');
  process.exit(1);
}

const API_URL = `https://${SHOP}/admin/api/2024-07/graphql.json`;
const BATCH_SIZE = 25;
const DELAY_MS = 1000; // 1 second between batches to respect rate limits
const NEW_VENDOR = 'ORVA';

/**
 * GraphQL query to fetch all active products
 */
const FETCH_PRODUCTS_QUERY = `
  query GetActiveProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active") {
      edges {
        node {
          id
          title
          vendor
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * GraphQL mutation to update vendor
 */
const UPDATE_VENDOR_MUTATION = `
  mutation UpdateVendor($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        vendor
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Execute GraphQL request
 */
async function executeGraphQL(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    console.error('GraphQL Error:', data.errors);
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

/**
 * Fetch all active products with pagination
 */
async function fetchAllProducts() {
  const products = [];
  let hasNextPage = true;
  let cursor = null;
  let pageCount = 0;

  console.log('📦 Fetching all active products...');

  while (hasNextPage) {
    try {
      const data = await executeGraphQL(FETCH_PRODUCTS_QUERY, {
        first: 50,
        after: cursor,
      });

      const { edges, pageInfo } = data.products;
      products.push(...edges.map(e => e.node));

      pageCount++;
      console.log(`  Page ${pageCount}: ${edges.length} products (total: ${products.length})`);

      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;

      // Small delay between pagination requests
      if (hasNextPage) await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error(`❌ Error fetching page ${pageCount + 1}:`, error.message);
      throw error;
    }
  }

  return products;
}

/**
 * Update vendor for a single product
 */
async function updateProductVendor(productId, currentVendor) {
  try {
    const data = await executeGraphQL(UPDATE_VENDOR_MUTATION, {
      input: {
        id: productId,
        vendor: NEW_VENDOR,
      },
    });

    const { product, userErrors } = data.productUpdate;

    if (userErrors.length > 0) {
      console.warn(
        `  ⚠️  ${productId}: ${userErrors.map(e => e.message).join(', ')}`
      );
      return { success: false, productId, error: userErrors[0].message };
    }

    return { success: true, productId, from: currentVendor, to: product.vendor };
  } catch (error) {
    console.error(`  ❌ ${productId}: ${error.message}`);
    return { success: false, productId, error: error.message };
  }
}

/**
 * Process products in batches
 */
async function processBatches(products) {
  const results = {
    total: products.length,
    updated: 0,
    failed: 0,
    errors: [],
  };

  console.log(`\n🔄 Updating ${products.length} products in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(products.length / BATCH_SIZE);

    console.log(`\n📋 Batch ${batchNum}/${totalBatches} (${batch.length} products):`);

    const batchPromises = batch.map(product =>
      updateProductVendor(product.id, product.vendor)
    );

    const batchResults = await Promise.all(batchPromises);

    batchResults.forEach(result => {
      if (result.success) {
        results.updated++;
        console.log(`  ✓ ${result.productId}: ${result.from} → ${result.to}`);
      } else {
        results.failed++;
        results.errors.push(result);
        console.log(`  ✗ ${result.productId}: ${result.error}`);
      }
    });

    // Delay before next batch to respect API rate limits
    if (i + BATCH_SIZE < products.length) {
      console.log(`  ⏱️  Waiting ${DELAY_MS}ms before next batch...`);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  return results;
}

/**
 * Main execution
 */
async function main() {
  console.log(`🚀 Bulk Vendor Update Script`);
  console.log(`Store: ${SHOP}`);
  console.log(`New Vendor: ${NEW_VENDOR}\n`);

  try {
    // Step 1: Fetch all products
    const products = await fetchAllProducts();
    console.log(`✓ Fetched ${products.length} active products\n`);

    if (products.length === 0) {
      console.log('⚠️  No active products found.');
      process.exit(0);
    }

    // Step 2: Ask for confirmation
    console.log(`ℹ️  Ready to update vendor to "${NEW_VENDOR}" for ${products.length} products.`);
    console.log('   (This will be done in batches with rate-limit delays)\n');

    // Step 3: Process batches
    const results = await processBatches(products);

    // Step 4: Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total products: ${results.total}`);
    console.log(`✓ Successfully updated: ${results.updated}`);
    console.log(`✗ Failed: ${results.failed}`);

    if (results.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      results.errors.forEach(err => {
        console.log(`  - ${err.productId}: ${err.error}`);
      });
    }

    console.log('='.repeat(60));

    if (results.failed === 0) {
      console.log('\n✅ All products updated successfully!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${results.failed} products failed. Check errors above.`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
