import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const audited = new Set([
  'cart.js', 'cart-discount.js', 'cart-drawer.js', 'cart-note.js', 'events.js', 'morph.js',
  'product-form.js', 'quick-add.js', 'section-renderer.js', 'tp-farbe.js', 'variant-picker.js',
]);
const files = fs.readdirSync('assets').filter((name) => name.endsWith('.js')).sort();
const count = (source, regex) => [...source.matchAll(regex)].length;

const inventory = files.map((name) => {
  const file = path.join('assets', name);
  const source = fs.readFileSync(file, 'utf8');
  const connected = count(source, /connectedCallback\s*\(/g);
  const disconnected = count(source, /disconnectedCallback\s*\(/g);
  const abortFields = count(source, /#[A-Za-z0-9_]*(?:abort|controller)[A-Za-z0-9_]*\s*=\s*new AbortController\(\)/gi);
  const abortAssignments = count(source, /this\.#[A-Za-z0-9_]*(?:abort|controller)[A-Za-z0-9_]*\s*=\s*new AbortController\(\)/gi);
  const abortCalls = count(source, /this\.#[A-Za-z0-9_]*(?:abort|controller)[A-Za-z0-9_]*\??\.abort\(\)/gi);
  const initializedControllerFields = [...source.matchAll(/#([A-Za-z0-9_]*(?:abort|controller)[A-Za-z0-9_]*)\s*=\s*new AbortController\(\)/gi)].map((match) => match[1]);
  const oneShotControllerFields = initializedControllerFields.filter((field) => {
    const assignments = count(source, new RegExp(`(?:this\\.)?#${field}\\s*=\\s*new AbortController\\(\\)`, 'g'));
    const aborted = new RegExp(`this\\.#${field}\\??\\.abort\\(\\)`).test(source);
    return assignments === 1 && aborted;
  });
  const addBound = count(source, /addEventListener\([\s\S]{0,160}?\.bind\(this\)/g);
  const removeBound = count(source, /removeEventListener\([\s\S]{0,160}?\.bind\(this\)/g);
  const globalListeners = count(source, /(?:document|window)\.addEventListener\(/g);
  const fetches = count(source, /\bfetch\s*\(/g);
  const catches = count(source, /(?:\.catch\s*\(|\bcatch\s*\()/g);
  const customElements = count(source, /customElements\.define\(/g);
  const candidateFlags = [];
  if (connected && disconnected && oneShotControllerFields.length > 0) {
    candidateFlags.push('field-controller-created-once');
  }
  if (addBound) candidateFlags.push('bound-listener-registration');
  if (removeBound) candidateFlags.push('bound-listener-removal');
  if (fetches && catches === 0) candidateFlags.push('fetch-without-local-catch');
  if (globalListeners >= 2) candidateFlags.push('multiple-global-listeners');
  return {
    file,
    sha256: createHash('sha256').update(source).digest('hex'),
    lines: source.split('\n').length,
    auditedPreviously: audited.has(name),
    metrics: { connected, disconnected, abortFields, abortAssignments, abortCalls, oneShotControllerFields, addBound, removeBound, globalListeners, fetches, catches, customElements },
    candidateFlags,
  };
});

const candidates = inventory
  .filter((item) => item.candidateFlags.length > 0)
  .sort((a, b) => Number(a.auditedPreviously) - Number(b.auditedPreviously) || b.candidateFlags.length - a.candidateFlags.length || a.file.localeCompare(b.file));

const quickAdd = inventory.find((item) => item.file === 'assets/quick-add.js');
if (!quickAdd || !quickAdd.candidateFlags.includes('field-controller-created-once') || !quickAdd.candidateFlags.includes('bound-listener-removal')) {
  throw new Error('Expected quick-add lifecycle candidate not detected');
}

const report = {
  session: 'S27',
  task: 'JS-001a',
  status: 'PASS',
  totals: {
    javascriptFiles: inventory.length,
    lines: inventory.reduce((sum, item) => sum + item.lines, 0),
    customElementDefinitions: inventory.reduce((sum, item) => sum + item.metrics.customElements, 0),
    filesWithConnectedCallback: inventory.filter((item) => item.metrics.connected > 0).length,
    filesWithGlobalListeners: inventory.filter((item) => item.metrics.globalListeners > 0).length,
    filesWithFetch: inventory.filter((item) => item.metrics.fetches > 0).length,
    flaggedFiles: candidates.length,
  },
  nextCandidate: {
    file: 'assets/quick-add.js',
    reason: 'Source shows a field AbortController aborted on disconnect but not renewed, plus add/remove calls using fresh bind(this) functions. Execute original lifecycle before confirming any issue.',
    scope: 'JS-001b QuickAddComponent connect/disconnect/reconnect event behavior; do not repeat its already reviewed modal/morph source boundary.',
  },
  candidates,
  inventory,
  limits: 'Static regex inventory for prioritization, not defect proof. Existing audited files are marked to avoid replay. Minified/vendor scripts remain counted if present. No browser, network, live theme or runtime execution.',
};

fs.writeFileSync('audit/evidence/js-runtime-inventory-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${report.totals.javascriptFiles} JS files, ${report.totals.flaggedFiles} flagged; next ${report.nextCandidate.file}`);
