#!/usr/bin/env node

/**
 * QA Log Filter: Reduce QA output to first relevant assertion
 *
 * Reads JSON test result and outputs only the first ERROR/WARNING,
 * keeping output ≤30 lines for clarity.
 *
 * Usage:
 *   node qa/log-filter.mjs <input-json-file> [output-markdown-file]
 *
 * Examples:
 *   node qa/log-filter.mjs qa/results/seo-latest.json
 *   node qa/log-filter.mjs qa/results/seo-latest.json SUMMARY.md
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
if (!args[0]) {
  console.error('❌ Usage: node qa/log-filter.mjs <input-json-file> [output-markdown-file]');
  process.exit(1);
}

const inputPath = path.resolve(args[0]);
const outputPath = args[1] ? path.resolve(args[1]) : null;

// Verify input file exists
if (!fs.existsSync(inputPath)) {
  console.error(`❌ Input file not found: ${inputPath}`);
  process.exit(1);
}

try {
  // Parse test result JSON
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  if (!data.findings || !Array.isArray(data.findings)) {
    console.error('❌ Invalid test result format: missing "findings" array');
    process.exit(1);
  }

  // Build summary
  const summary = buildSummary(data);

  // Output to stdout and optionally to file
  console.log(summary.text);

  if (outputPath) {
    fs.writeFileSync(outputPath, summary.markdown, 'utf8');
    console.log(`\n✓ Saved to ${outputPath}`);
  }

  // Exit with appropriate code
  process.exit(data.exitCode || 0);
} catch (err) {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
}

/**
 * Build summary of test results
 */
function buildSummary(data) {
  const { status, summary, findings } = data;

  // Separate by severity
  const errors = findings.filter(f => f.severity === 'ERROR');
  const warnings = findings.filter(f => f.severity === 'WARNING');

  // Get first relevant finding
  const firstFinding = errors[0] || warnings[0];

  // Format text output (for stdout)
  const lines = [];
  lines.push(`╔═══════════════════════════════════════╗`);
  lines.push(`║  QA Test Summary                      ║`);
  lines.push(`╚═══════════════════════════════════════╝`);
  lines.push('');
  lines.push(`Status: ${formatStatus(status)}`);
  lines.push(`Errors: ${summary.errors} | Warnings: ${summary.warnings} | Passes: ${summary.passes}`);
  lines.push('');

  if (firstFinding) {
    lines.push('─── First Relevant Assertion ───');
    lines.push(`Severity: ${firstFinding.severity}`);
    lines.push(`Code: ${firstFinding.code}`);
    if (firstFinding.page) lines.push(`Page: ${firstFinding.page}`);
    if (firstFinding.viewport) lines.push(`Viewport: ${firstFinding.viewport}`);
    lines.push('');

    // Format message (truncate very long messages)
    const msgLines = firstFinding.message.split('\n').slice(0, 15);
    for (const line of msgLines) {
      const trimmed = line.substring(0, 80);
      lines.push(`  ${trimmed}`);
    }
    if (firstFinding.message.split('\n').length > 15) {
      lines.push(`  ... (${firstFinding.message.split('\n').length - 15} more lines)`);
    }
  }

  lines.push('');
  lines.push(`Total findings: ${findings.length}`);

  const text = lines.join('\n');

  // Format markdown output (for file)
  const markdown = [
    '# QA Test Summary',
    '',
    `**Status**: ${status}`,
    `**Errors**: ${summary.errors} | **Warnings**: ${summary.warnings} | **Passes**: ${summary.passes}`,
    '',
  ];

  if (firstFinding) {
    markdown.push('## First Relevant Assertion');
    markdown.push('');
    markdown.push(`**Severity**: ${firstFinding.severity}`);
    markdown.push(`**Code**: \`${firstFinding.code}\``);
    if (firstFinding.page) markdown.push(`**Page**: ${firstFinding.page}`);
    if (firstFinding.viewport) markdown.push(`**Viewport**: ${firstFinding.viewport}`);
    markdown.push('');
    markdown.push('**Message**:');
    markdown.push('');
    markdown.push('```');
    const msgLines = firstFinding.message.split('\n').slice(0, 12);
    for (const line of msgLines) {
      markdown.push(line);
    }
    if (firstFinding.message.split('\n').length > 12) {
      markdown.push(`... (${firstFinding.message.split('\n').length - 12} more lines)`);
    }
    markdown.push('```');
    markdown.push('');
  }

  markdown.push(`**Total Findings**: ${findings.length}`);

  return {
    text,
    markdown: markdown.join('\n')
  };
}

function formatStatus(status) {
  const icons = {
    'PASS': '✅ PASS',
    'FAIL': '❌ FAIL',
    'WARN': '⚠️  WARN'
  };
  return icons[status] || status;
}
