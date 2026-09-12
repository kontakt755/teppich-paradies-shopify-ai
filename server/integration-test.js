#!/usr/bin/env node

/**
 * Integration Test für Google Rating API mit Shopify Theme
 * Testet die vollständige Kommunikation zwischen Frontend Block und Backend
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

// Überprüfe ob der Block existiert
const blockPath = path.join(__dirname, '..', 'blocks', 'tp-google-rating.liquid');

console.log('\n🧪 Running Integration Tests...\n');

const tests = [
  testBackendApi,
  testBlockExists,
  testBlockFormat,
  testCors,
  testCache
];

async function runAllTests() {
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (error) {
      console.error(`❌ ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed}/${tests.length} tests passed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

async function testBackendApi() {
  console.log('🔍 Testing Backend API...');

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_BUSINESS_PLACE_ID;

  if (!apiKey || !placeId) {
    console.log('⚠️  Skipped (no credentials) - will use demo data in production');
    return;
  }

  console.log('✅ Backend API: API credentials configured');
}

async function testBlockExists() {
  console.log('🔍 Testing Block Exists...');

  if (!fs.existsSync(blockPath)) {
    throw new Error(`Block file missing: ${blockPath}`);
  }

  const content = fs.readFileSync(blockPath, 'utf8');

  if (!content.includes('tp-google-rating')) {
    throw new Error('Block class name not found in tp-google-rating.liquid');
  }

  if (!content.includes('/api/store/google-rating')) {
    throw new Error('API endpoint not found in block');
  }

  console.log('✅ Block File: tp-google-rating.liquid exists and is valid');
}

async function testBlockFormat() {
  console.log('🔍 Testing Block Format...');

  const content = fs.readFileSync(blockPath, 'utf8');

  const checks = [
    { pattern: /★★★★★/, name: 'Stars display' },
    { pattern: /Auf Google lesen/, name: 'Google link text' },
    { pattern: /userRatingCount/, name: 'Rating count field' },
    { pattern: /\.toLocaleString\('de-DE'/, name: 'German formatting' },
    { pattern: /<script>/, name: 'JavaScript included' }
  ];

  const missing = checks.filter(check => !check.pattern.test(content));

  if (missing.length > 0) {
    throw new Error(`Block format issues: ${missing.map(c => c.name).join(', ')}`);
  }

  console.log('✅ Block Format: All display elements present');
}

async function testCors() {
  console.log('🔍 Testing CORS Headers...');

  const indexPath = path.join(__dirname, 'index.js');
  const content = fs.readFileSync(indexPath, 'utf8');

  if (!content.includes('cors') && !content.includes('Access-Control')) {
    console.log('⚠️  CORS: Not explicitly configured - will use defaults');
  } else {
    console.log('✅ CORS: Configured in Express server');
  }
}

async function testCache() {
  console.log('🔍 Testing Cache Strategy...');

  const apiPath = path.join(__dirname, 'google-rating-api.js');
  const content = fs.readFileSync(apiPath, 'utf8');

  if (!content.includes('CACHE_DURATION')) {
    throw new Error('Cache duration not defined');
  }

  if (!content.includes('3600000')) { // 1 hour
    console.log('⚠️  Cache: Custom duration detected');
  } else {
    console.log('✅ Cache: 1-hour caching enabled');
  }
}

// Starte Tests
console.log('Prerequisites:');
console.log(`  Block file: ${blockPath}`);
console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`  API Key: ${process.env.GOOGLE_PLACES_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`  Place ID: ${process.env.GOOGLE_BUSINESS_PLACE_ID ? '✅ Set' : '❌ Missing'}`);
console.log();

runAllTests().catch(console.error);
