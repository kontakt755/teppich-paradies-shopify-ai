#!/usr/bin/env node

/**
 * OmniRoute API Test Suite
 * Tests the local OmniRoute gateway safely
 *
 * Usage: node test-omniroute-api.js
 */

const http = require('http');

const OMNIROUTE_URL = 'http://localhost:20128';
const TIMEOUT = 30000;

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${colors.reset}`);
}

function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(OMNIROUTE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: TIMEOUT,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  log(colors.blue, '\n🚀 OmniRoute API Test Suite');
  log(colors.blue, '============================\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Health Check
  log(colors.cyan, '1️⃣  Health Check...');
  try {
    const res = await makeRequest('/health');
    if (res.status === 200) {
      log(colors.green, '   ✅ Server is healthy');
      passed++;
    } else {
      log(colors.red, `   ❌ Unexpected status: ${res.status}`);
      failed++;
    }
  } catch (err) {
    log(colors.red, `   ❌ Connection failed: ${err.message}`);
    failed++;
    process.exit(1);
  }

  // Test 2: Health Endpoint with Body
  log(colors.cyan, '\n2️⃣  Health Endpoint Details...');
  try {
    const res = await makeRequest('/health');
    const health = JSON.parse(res.body);
    if (health.status === 'ok') {
      log(colors.green, '   ✅ Health status OK');
      log(colors.yellow, `   • Version: ${health.version || 'unknown'}`);
      log(colors.yellow, `   • Uptime: ${health.uptime || 'unknown'}`);
      passed++;
    } else {
      log(colors.yellow, `   ⚠️  Health status: ${JSON.stringify(health)}`);
    }
  } catch (err) {
    log(colors.yellow, `   ⚠️  Could not parse health response: ${err.message}`);
  }

  // Test 3: Models List
  log(colors.cyan, '\n3️⃣  Available Models...');
  try {
    const res = await makeRequest('/v1/models');
    if (res.status === 200) {
      const data = JSON.parse(res.body);
      const modelCount = data.data?.length || 0;
      if (modelCount > 0) {
        log(colors.green, `   ✅ Found ${modelCount} models`);
        const firstThree = data.data.slice(0, 3).map(m => m.id || m);
        firstThree.forEach(m => log(colors.yellow, `      • ${m}`));
        passed++;
      } else {
        log(colors.yellow, '   ⚠️  No models found');
      }
    } else {
      log(colors.red, `   ❌ Failed to fetch models: ${res.status}`);
      failed++;
    }
  } catch (err) {
    log(colors.yellow, `   ⚠️  ${err.message}`);
  }

  // Test 4: Chat Completion (Auto Model)
  log(colors.cyan, '\n4️⃣  Chat Completion Test...');
  try {
    const payload = {
      model: 'auto',
      messages: [
        { role: 'user', content: 'Reply with exactly one word: SUCCESS' }
      ],
      max_tokens: 10,
    };

    const res = await makeRequest('/v1/chat/completions', 'POST', payload);
    if (res.status === 200) {
      const data = JSON.parse(res.body);
      if (data.choices && data.choices[0]?.message?.content) {
        const content = data.choices[0].message.content.trim();
        log(colors.green, `   ✅ AI responded: "${content}"`);
        passed++;
      } else {
        log(colors.yellow, `   ⚠️  Unexpected response format`);
        log(colors.yellow, `   ${JSON.stringify(data).substring(0, 100)}...`);
      }
    } else {
      log(colors.red, `   ❌ Chat failed: ${res.status}`);
      log(colors.red, `   ${res.body.substring(0, 100)}`);
      failed++;
    }
  } catch (err) {
    log(colors.red, `   ❌ ${err.message}`);
    failed++;
  }

  // Test 5: Dashboard Availability
  log(colors.cyan, '\n5️⃣  Dashboard & Monitoring...');
  try {
    const res = await makeRequest('/');
    if ([200, 301, 302].includes(res.status)) {
      log(colors.green, '   ✅ Dashboard is available');
      log(colors.yellow, `   → Visit: ${OMNIROUTE_URL}`);
      passed++;
    } else {
      log(colors.yellow, `   ⚠️  Dashboard status: ${res.status}`);
    }
  } catch (err) {
    log(colors.yellow, `   ⚠️  Dashboard check: ${err.message}`);
  }

  // Summary
  log(colors.blue, '\n============================');
  log(colors.blue, '📊 Test Summary');
  log(colors.blue, '============================\n');
  log(colors.green, `✅ Passed: ${passed}`);
  log(colors.red, `❌ Failed: ${failed}`);
  log(colors.blue, `📍 Total:  ${passed + failed}\n`);

  if (failed === 0) {
    log(colors.green, '🎉 All tests passed! OmniRoute is ready to use.\n');
    log(colors.yellow, 'Next steps:');
    log(colors.yellow, `  1. Visit: ${OMNIROUTE_URL}`);
    log(colors.yellow, `  2. Configure Claude Code with endpoint: ${OMNIROUTE_URL}/v1`);
    log(colors.yellow, `  3. Use "auto" model for automatic provider selection\n`);
    process.exit(0);
  } else {
    log(colors.red, `⚠️  Some tests failed.\n`);
    log(colors.yellow, 'Make sure OmniRoute is running:');
    log(colors.yellow, `  npm install -g omniroute && omniroute`);
    log(colors.yellow, `  OR`);
    log(colors.yellow, `  docker run -p 20128:20128 diegosouzapw/omniroute\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch((err) => {
  log(colors.red, `\n❌ Fatal error: ${err.message}\n`);
  process.exit(1);
});
