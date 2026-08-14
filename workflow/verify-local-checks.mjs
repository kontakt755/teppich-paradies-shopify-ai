#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { REQUIRED_LOCAL_EVIDENCE_STEPS, verifyLocalEvidence } from './core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const evidencePath = path.join(root, 'qa', 'evidence', 'local-verification.json');

function currentHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

// In CI, PR_HEAD_SHA/PR_HEAD_REF are passed explicitly from the GitHub Actions
// pull_request event context (github.event.pull_request.head.sha / head_ref).
// That is the actual commit under review - not `git rev-parse HEAD`, which on
// a pull_request-triggered checkout is a synthetic merge commit, not the PR
// branch tip. Falling back to `git rev-parse HEAD` only supports ad-hoc local
// runs on a real branch checkout outside CI.
const expectedCommit = process.env.PR_HEAD_SHA || currentHead();
const expectedBranch = process.env.PR_HEAD_REF || null;

console.log('\n📋 Verifiziere lokal durchgeführte Checks (Compare, SEO, Full QA, Sales)...\n');

let evidence = null;
let readError = null;
if (!fs.existsSync(evidencePath)) {
  readError = `Evidence-Datei fehlt: ${path.relative(root, evidencePath)}`;
} else {
  try {
    evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  } catch (error) {
    readError = `Evidence-Datei ist ungültiges JSON: ${error.message}`;
  }
}
if (readError) console.error(`❌ ${readError}`);

try {
  verifyLocalEvidence({ evidence, expectedCommit, expectedBranch, requiredSteps: REQUIRED_LOCAL_EVIDENCE_STEPS });
  console.log(`✓ Evidence-Commit stimmt mit HEAD überein: ${expectedCommit}`);
  console.log(`✓ Erforderliche Schritte PASS: ${REQUIRED_LOCAL_EVIDENCE_STEPS.join(', ')}`);
  console.log('✓ P0/P1 = 0, orderCompleted = false');
  console.log('\n' + '='.repeat(60));
  console.log('✓ Alle lokalen Verifikationen bestanden\n');
  process.exitCode = 0;
} catch (error) {
  console.error(`❌ ${error.message}`);
  console.error('\n' + '='.repeat(60));
  console.error('\n❌ FEHLER: Lokale Verifikation erforderlich\n');
  console.error('Compare, SEO, Full QA und Sales erfordern Netzwerkzugriff zur');
  console.error('Live-Storefront und können nicht in CI laufen. Führen Sie eine');
  console.error('vollständige Validierung lokal aus und committen Sie die Evidence:\n');
  console.error('  npm run workflow:validate');
  console.error('  (oder: npm run workflow:pr)\n');
  console.error(`Danach muss diese Datei für den aktuellen Commit (${expectedCommit ?? '<HEAD>'})`);
  console.error('committed und gepusht sein:');
  console.error(`  - ${path.relative(root, evidencePath)}\n`);
  process.exitCode = 1;
}
