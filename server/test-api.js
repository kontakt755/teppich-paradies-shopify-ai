#!/usr/bin/env node

/**
 * Test-Skript für Google Rating API
 * Testet die API lokal mit Demo-Daten
 *
 * Usage:
 *   npm test
 *   npm test -- --real  (mit echtem API-Key)
 */

const http = require('http');

const args = process.argv.slice(2);
const useRealApi = args.includes('--real');

require('dotenv').config();

const app = require('./index');

// Demo-Server nur für Tests starten
const server = app.listen(3001, () => {
  console.log('\n🧪 Testing Google Rating API...\n');
  runTests();
});

async function runTests() {
  const tests = [
    { name: 'Health Check', path: '/health' },
    { name: 'Google Rating API', path: '/api/store/google-rating' }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await testEndpoint(test.path, test.name);
      passed++;
    } catch (error) {
      console.error(`❌ ${test.name}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('✅ All tests passed! API is ready to deploy.\n');
  } else {
    console.log('⚠️  Some tests failed. Check configuration.\n');
    process.exit(1);
  }

  server.close();
}

async function testEndpoint(path, name) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ ${name}`);
            console.log(`   Status: ${res.statusCode}`);
            console.log(`   Response: ${JSON.stringify(json, null, 2).split('\n').slice(0, 3).join('\n')}`);
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏸ Test stopped');
  server.close();
  process.exit(0);
});
