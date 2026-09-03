#!/usr/bin/env node

/**
 * QA Artifacts Manager
 *
 * Manages QA test outputs:
 * - Stores raw artifacts locally for debugging
 * - Extracts only relevant assertions
 * - Limits worker output to ≤30 relevant lines
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidence, formatEvidenceForConsole } from './evidence-filter.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.join(__dir, 'artifacts');
const RESULTS_DIR = path.join(__dir, 'results');

// Ensure directories exist
function ensureDirectories() {
  for (const dir of [ARTIFACTS_DIR, RESULTS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Store raw QA result and generate filtered evidence
 */
export function storeQAResult(testName, rawResult, options = {}) {
  ensureDirectories();

  const timestamp = new Date().toISOString().split('T')[0];
  const baseFilename = `${testName}-${timestamp}`;

  // Store raw artifact
  const rawPath = path.join(ARTIFACTS_DIR, `${baseFilename}-raw.json`);
  fs.writeFileSync(rawPath, JSON.stringify(rawResult, null, 2));
  console.log(`✓ Raw artifact: ${rawPath}`);

  // Generate and store filtered evidence
  const evidence = buildEvidence(rawResult);
  const evidencePath = path.join(RESULTS_DIR, `${baseFilename}-evidence.json`);
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`✓ Evidence: ${evidencePath}`);

  // Output formatted console message (≤30 lines)
  if (options.verbose) {
    console.log('\n--- Filtered Output ---');
    console.log(formatEvidenceForConsole(evidence));
    console.log('--- End Filtered Output ---\n');
  }

  return {
    rawPath,
    evidencePath,
    evidence
  };
}

/**
 * List all stored artifacts
 */
export function listArtifacts() {
  ensureDirectories();

  console.log('📦 Raw Artifacts:');
  const rawFiles = fs.readdirSync(ARTIFACTS_DIR).filter(f => f.endsWith('-raw.json'));
  if (rawFiles.length === 0) {
    console.log('  (none)');
  } else {
    rawFiles.forEach(f => console.log(`  - ${f}`));
  }

  console.log('\n📋 Filtered Evidence:');
  const evidenceFiles = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('-evidence.json'));
  if (evidenceFiles.length === 0) {
    console.log('  (none)');
  } else {
    evidenceFiles.forEach(f => console.log(`  - ${f}`));
  }
}

/**
 * Get latest evidence for a test
 */
export function getLatestEvidence(testName) {
  ensureDirectories();

  const evidenceFiles = fs
    .readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith(testName) && f.endsWith('-evidence.json'))
    .sort()
    .reverse();

  if (evidenceFiles.length === 0) {
    return null;
  }

  const latestPath = path.join(RESULTS_DIR, evidenceFiles[0]);
  return JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
}

/**
 * Clean old artifacts (older than N days)
 */
export function cleanOldArtifacts(days = 7) {
  ensureDirectories();
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

  let deleted = 0;
  for (const dir of [ARTIFACTS_DIR, RESULTS_DIR]) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoffTime) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    }
  }

  return deleted;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  switch (command) {
    case 'list':
      listArtifacts();
      break;

    case 'clean':
      const days = parseInt(process.argv[3]) || 7;
      const deleted = cleanOldArtifacts(days);
      console.log(`✓ Cleaned ${deleted} artifacts older than ${days} days`);
      break;

    case 'help':
    default:
      console.log(`
QA Artifacts Manager

Usage:
  qa-artifacts-manager.mjs list              List all stored artifacts
  qa-artifacts-manager.mjs clean [days]      Clean artifacts older than N days (default: 7)
  qa-artifacts-manager.mjs help              Show this help message

Raw artifacts are stored in: qa/artifacts/
Filtered evidence is stored in: qa/results/

Each QA test run stores:
  - {test}-{date}-raw.json - Complete unfiltered output
  - {test}-{date}-evidence.json - Filtered assertions (≤30 lines)
      `);
  }
}
