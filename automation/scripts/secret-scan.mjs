#!/usr/bin/env node
import path from 'node:path';
import { discoverGitFiles, formatScanResult, scanFiles } from '../core/secret-scan.mjs';

const root = process.cwd();
const explicit = process.argv.slice(2);
const git = process.env.TP_GIT_BINARY || 'git';
try {
  const files = explicit.length ? explicit : discoverGitFiles({ root, git });
  const result = scanFiles({ root: path.resolve(root), files });
  process.stdout.write(`${formatScanResult(result)}\n`);
  process.exitCode = result.status === 'PASS' ? 0 : 2;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ status: 'BLOCK', error: 'SCAN_FAILED', errorClass: error.name })}\n`);
  process.exitCode = 2;
}
