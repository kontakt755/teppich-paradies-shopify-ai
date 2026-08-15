#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { REQUIRED_LOCAL_EVIDENCE_STEPS, TRACKED_EVIDENCE_PATH, verifyLocalEvidence } from './core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const evidencePath = path.join(root, TRACKED_EVIDENCE_PATH);

function currentHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

// Evidence is stamped with git HEAD *before* it is itself committed, so
// committing it always advances HEAD past what it recorded (see core.mjs).
// When the exact commit doesn't match, ask git what actually changed between
// the evidence's commit and the commit under review; verifyLocalEvidence only
// accepts the ancestor if that diff is empty except for the evidence file
// itself. Any git failure (unreachable commit, shallow history) yields null,
// which verifyLocalEvidence treats as unverifiable and rejects, fail-closed.
function changedFilesBetween(fromSha, toSha) {
  if (!fromSha || !toSha) return null;
  const result = spawnSync('git', ['diff', '--name-only', fromSha, toSha], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.split('\n').map(line => line.trim()).filter(Boolean);
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

const changedFilesSinceEvidence = evidence?.commit && evidence.commit !== expectedCommit
  ? changedFilesBetween(evidence.commit, expectedCommit)
  : null;

try {
  verifyLocalEvidence({ evidence, expectedCommit, expectedBranch, changedFilesSinceEvidence, requiredSteps: REQUIRED_LOCAL_EVIDENCE_STEPS });
  console.log(evidence.commit === expectedCommit
    ? `✓ Evidence-Commit stimmt exakt mit HEAD überein: ${expectedCommit}`
    : `✓ Evidence-Commit ${evidence.commit} ist ein unveränderter Vorgänger von HEAD ${expectedCommit} (nur ${path.basename(evidencePath)} hat sich seither geändert)`);
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
