import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SECRET_PATH = /(^|\/)(\.env(?:\..+)?|\.auth(?:\/|$)|\.sessions?(?:\/|$)|tokens?(?:\/|$)|secrets?(?:\/|$)|cookies?[^/]*\.json$|credentials?[^/]*\.json$)|\.(?:pem|key|p12|pfx)$/i;
const RULES = Object.freeze([
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GITHUB_TOKEN', /\bgh[opurs]_[A-Za-z0-9]{20,}\b/],
  ['SHOPIFY_TOKEN', /\bshp(?:at|ca|cs|pa|ss)_[A-Za-z0-9]{20,}\b/i],
  ['GENERIC_API_KEY', /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i],
  ['PASSWORD_ASSIGNMENT', /\b(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{8,}/i],
  ['SESSION_COOKIE', /\b(?:cookie|session[_-]?(?:id|token))\s*[:=]\s*["']?[^\s"']{12,}/i]
]);
const normalize = value => String(value).replaceAll('\\', '/').replace(/^\.\//, '');

export function scanText({ file, text }) {
  const normalized = normalize(file);
  const findings = [];
  if (SECRET_PATH.test(normalized)) findings.push({ file: normalized, line: 1, rule: 'SECRET_FILE' });
  String(text).split(/\r?\n/).forEach((line, index) => {
    for (const [rule, pattern] of RULES) if (pattern.test(line)) findings.push({ file: normalized, line: index + 1, rule });
  });
  return findings;
}

export function discoverGitFiles({ root, git = 'git' }) {
  const output = execFileSync(git, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

export function scanFiles({ root, files, io = fs }) {
  const findings = [];
  for (const relative of files) {
    const normalized = normalize(relative);
    const absolute = path.resolve(root, normalized);
    if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) || !io.existsSync(absolute) || !io.statSync(absolute).isFile()) continue;
    const buffer = io.readFileSync(absolute);
    if (buffer.includes(0)) continue;
    findings.push(...scanText({ file: normalized, text: buffer.toString('utf8') }));
  }
  return { status: findings.length ? 'BLOCK' : 'PASS', findings };
}

export function formatScanResult(result) {
  return JSON.stringify({ status: result.status, findings: result.findings.map(({ file, line, rule }) => ({ file, line, rule })) });
}
