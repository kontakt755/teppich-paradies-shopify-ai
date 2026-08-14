#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const resultsDir = path.join(root, 'qa', 'results');
const workflowDir = path.join(root, '.workflow');

function checkFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ${label} fehlt: ${path.relative(root, filePath)}`);
    return false;
  }
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`✓ ${label} vorhanden`);
    return content;
  } catch (e) {
    console.error(`❌ ${label} ungültiges JSON: ${e.message}`);
    return false;
  }
}

function verifyCompareResult(result) {
  if (!result.results || !Array.isArray(result.results)) {
    console.error('❌ Compare-Ergebnis ungültiges Format');
    return false;
  }
  const allPass = result.results.every(r => r.pass === true);
  if (!allPass) {
    console.error('❌ Compare: nicht alle Viewports PASS');
    result.results.forEach(r => console.error(`  - ${r.viewport}: ${r.pass ? 'PASS' : 'FAIL'}`));
    return false;
  }
  console.log('✓ Compare: alle Tests PASS');
  return true;
}

function verifyQaResult(result) {
  if (result.status !== 'PASS') {
    console.error(`❌ Full QA Status nicht PASS: ${result.status}`);
    return false;
  }
  if (result.newFindings && result.newFindings.length > 0) {
    console.error(`❌ Full QA hat neue Findings: ${result.newFindings.length}`);
    return false;
  }
  console.log('✓ Full QA: PASS, keine neuen Findings');
  return true;
}

function verifySalesResult(result) {
  if (!result || typeof result !== 'object') {
    console.error('❌ Sales-Report fehlt oder ungültiges Format');
    return false;
  }
  if (result.orderCompleted !== false) {
    console.error('❌ Sales-Report ist nicht fail-closed: orderCompleted muss false sein');
    return false;
  }
  if (!Array.isArray(result.results) || result.results.length !== 6) {
    console.error(`❌ Sales-Report muss 6 Flows enthalten, hat ${result.results?.length ?? 0}`);
    return false;
  }
  const allPass = result.results.every(item => item.status === 'PASS' && item.orderCompleted === false);
  if (!allPass) {
    console.error('❌ Nicht alle Sales-Flows sind PASS');
    result.results.forEach(r => console.error(`  - ${r.id}: ${r.status} (orderCompleted=${r.orderCompleted})`));
    return false;
  }
  if (result.summary?.passed !== 6 || result.summary?.failed !== 0) {
    console.error('❌ Sales-Zusammenfassung ist nicht 6/6 PASS');
    return false;
  }
  console.log('✓ Sales: 6/6 Flows PASS, orderCompleted=false');
  return true;
}

async function main() {
  console.log('\n📋 Verifiziere lokal durchgeführte Checks...\n');

  let hasAllRequired = true;

  // Check Compare results
  const compareResult = checkFileExists(path.join(resultsDir, 'compare-readiness.json'), 'Compare-Readiness');
  if (compareResult) {
    if (!verifyCompareResult(compareResult)) hasAllRequired = false;
  } else {
    hasAllRequired = false;
  }

  // Check Full QA results
  const qaResult = checkFileExists(path.join(resultsDir, 'latest.json'), 'Full QA Results');
  if (qaResult) {
    if (!verifyQaResult(qaResult)) hasAllRequired = false;
  } else {
    hasAllRequired = false;
  }

  // Check Sales results
  const salesResult = checkFileExists(path.join(resultsDir, 'sales-readiness.json'), 'Sales Readiness');
  if (salesResult) {
    if (!verifySalesResult(salesResult)) hasAllRequired = false;
  } else {
    hasAllRequired = false;
  }

  // Check workflow validation evidence
  const latestValidation = checkFileExists(path.join(workflowDir, 'latest.json'), 'Workflow Validation Evidence');
  if (latestValidation && latestValidation.status !== 'PASS') {
    console.error(`❌ Workflow Validation Status: ${latestValidation.status}`);
    hasAllRequired = false;
  }

  console.log('\n' + '='.repeat(60));
  if (!hasAllRequired) {
    console.error('\n❌ FEHLER: Lokale Verifikation erforderlich\n');
    console.error('Die folgenden Checks erfordern Netzwerkzugriff zur Live-Storefront');
    console.error('und müssen lokal vor Merge durchgeführt werden:\n');
    console.error('1. Compare-Readiness Check');
    console.error('2. Full QA Browser-Tests');
    console.error('3. Sales-Readiness Verification (6/6 Flows)\n');
    console.error('Führen Sie diese lokal aus und pushen Sie die Ergebnisse:');
    console.error('  npm run qa:compare');
    console.error('  npm run qa:check');
    console.error('  npm run sales:check\n');
    console.error('Danach sollten folgende Dateien vorhanden sein:');
    console.error('  - qa/results/compare-readiness.json');
    console.error('  - qa/results/latest.json (Full QA)');
    console.error('  - qa/results/sales-readiness.json\n');
    process.exitCode = 1;
  } else {
    console.log('✓ Alle lokalen Verifikationen bestanden\n');
    process.exitCode = 0;
  }
}

main().catch(error => {
  console.error('Fehler bei Verifikation:', error.message);
  process.exitCode = 1;
});
