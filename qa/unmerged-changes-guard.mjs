#!/usr/bin/env node
/**
 * PRE-DEPLOY GATE: Unmerged Changes Guard
 *
 * Verhindert Deploys von Dateien, die nicht in main gemergt sind.
 * Ziel: Sicherstellen, dass nur gemergte Blöcke/Templates deployed werden.
 *
 * Typ: Class A (deterministic, kein LLM)
 * Trigger: Vor jedem `npm run workflow:preview` oder `npm run workflow:live`
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

// Dateitypen, bei denen Drift kritisch ist
const CRITICAL_PATHS = [
  /^blocks\/tp-.*\.liquid$/,
  /^sections\/.*\.liquid$/,
  /^templates\/.*\.json$/,
  /^snippets\/tp-.*\.liquid$/,
];

/**
 * Prüfe ob eine Datei nur auf dem Current Branch existiert (nicht in main)
 */
function getUnmergedFiles() {
  try {
    // Git diff zwischen current HEAD und main
    const output = execSync(
      `git diff --name-only main...HEAD`,
      { encoding: 'utf-8' }
    );

    return output.split('\n').filter(f => f.trim());
  } catch (error) {
    // Fehler = wir sind nicht auf main und main existiert nicht lokal, oder ähnlich
    console.error('❌ Cannot compare with main:', error.message);
    return [];
  }
}

/**
 * Prüfe ob die Datei in CRITICAL_PATHS liegt
 */
function isCriticalPath(filePath) {
  return CRITICAL_PATHS.some(regex => regex.test(filePath));
}

/**
 * Main Guard
 */
export function runUnmergedChangesGuard() {
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
    encoding: 'utf-8',
  }).trim();

  // Auf main? Alles OK
  if (currentBranch === 'main') {
    console.log('✅ On main branch, no unmerged-changes risk.');
    return { passed: true, findings: [] };
  }

  // Prüfe ob dieser Branch in main existiert
  let isInMain = false;
  try {
    execSync(`git merge-base --is-ancestor HEAD main`, { stdio: 'ignore' });
    isInMain = true;
  } catch {
    isInMain = false;
  }

  if (isInMain) {
    console.log(`✅ Branch '${currentBranch}' is already in main.`);
    return { passed: true, findings: [] };
  }

  // Branch ist NOT in main. Prüfe auf kritische Unterschiede
  const unmergedFiles = getUnmergedFiles();
  const criticalUnmerged = unmergedFiles.filter(isCriticalPath);

  if (criticalUnmerged.length === 0) {
    console.log(
      `⚠️  Branch '${currentBranch}' has unmerged changes, but none in critical paths.`
    );
    return { passed: true, findings: [] };
  }

  // BLOCKADE: Kritische Dateien sind ungemergt!
  console.error('');
  console.error('╔════════════════════════════════════════════════════════════════╗');
  console.error('║          🛑 UNMERGED CRITICAL FILES DETECTED                   ║');
  console.error('╚════════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error(`Branch: ${currentBranch} (NOT in main)`);
  console.error(`Critical unmerged files: ${criticalUnmerged.length}`);
  console.error('');
  console.error('Blocked files:');
  criticalUnmerged.forEach(f => {
    console.error(`  ❌ ${f}`);
  });
  console.error('');
  console.error('Fix:');
  console.error('  1. Merge branch into main:');
  console.error(`     git checkout main && git pull && git merge ${currentBranch}`);
  console.error('  2. Push to deploy:');
  console.error('     git push origin main');
  console.error('');
  console.error('Reason: This is how changes get "lost" — on branches that are never merged.');
  console.error('');

  return {
    passed: false,
    findings: criticalUnmerged.map(file => ({
      file,
      issue: 'UNMERGED_CRITICAL_FILE',
      detail: `Critical file on unmerged branch '${currentBranch}'`,
    })),
  };
}

// CLI-Ausführung
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runUnmergedChangesGuard();

  if (!result.passed) {
    process.exit(1);
  }
}

export default runUnmergedChangesGuard;
