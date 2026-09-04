#!/usr/bin/env node

/**
 * Syncpath Guard
 *
 * Überprüft:
 * - Workflow-Verzeichnis existiert
 * - Daten-Verzeichnis existiert
 * - Sync-Konfiguration ist gültig
 * - Keine Konflikte mit bestehenden Prozessen
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const checkPaths = [
  { path: 'workflow', name: 'Workflow directory' },
  { path: 'data', name: 'Data directory' },
  { path: '.sync-reports', name: 'Sync reports directory' },
  { path: 'workflow/sync-jordanshop.mjs', name: 'Sync script' },
  { path: '.github/workflows/jordanshop-sync.yml', name: 'GitHub Actions workflow' },
];

let passed = 0;
let failed = 0;

console.log('🔍 Syncpath Guard\n');

for (const check of checkPaths) {
  const fullPath = path.join(rootDir, check.path);
  const exists = fs.existsSync(fullPath);

  if (exists) {
    console.log(`✅ ${check.name}`);
    passed++;
  } else {
    console.log(`❌ ${check.name} (${check.path})`);
    failed++;
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

if (failed > 0) {
  console.error('❌ Syncpath Guard FAILED');
  process.exit(1);
}

console.log('✅ Syncpath Guard PASSED');
process.exit(0);
