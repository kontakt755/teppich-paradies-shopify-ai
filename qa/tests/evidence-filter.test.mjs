import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEvidence, evidenceLimits, formatEvidenceForConsole, MAX_LOG_LINES } from '../evidence-filter.mjs';

test('A: PASS produces compact PASS evidence', () => {
  const evidence = buildEvidence({ status: 'PASS', exitCode: 0, checks: [], pages: [] });
  assert.equal(evidence.status, 'PASS');
  assert.equal(evidence.failureCount, 0);
  assert.equal(evidence.primaryFailure, null);
  assert.match(formatEvidenceForConsole(evidence), /^QA evidence: PASS/);
});

test('B: simple FAIL retains the relevant fields', () => {
  const evidence = buildEvidence({
    exitCode: 1,
    checks: [{ scope: 'Shop-Smoke', page: 'Produkt', viewport: 'Mobile', severity: 'error', message: 'Warenkorbbutton fehlt' }],
    pages: [{ page: 'Produkt', viewport: 'Mobile', url: 'https://example.test/products/a', finalUrl: 'https://example.test/products/a' }]
  });
  assert.equal(evidence.status, 'FAIL');
  assert.equal(evidence.primaryFailure.checkName, 'Shop-Smoke');
  assert.equal(evidence.primaryFailure.firstRelevantAssertion, 'Warenkorbbutton fehlt');
  assert.equal(evidence.primaryFailure.url, 'https://example.test/products/a');
  assert.equal(evidence.primaryFailure.viewport, 'Mobile');
  assert.equal(evidence.primaryFailure.errorClass, 'assertion');
});

test('B2: console output is ≤30 lines and includes artifact paths', () => {
  const evidence = buildEvidence({
    exitCode: 1,
    checks: [{ scope: 'Shop-Smoke', page: 'Produkt', viewport: 'Mobile', severity: 'error', message: 'Warenkorbbutton fehlt' }],
    pages: [{ page: 'Produkt', viewport: 'Mobile', url: 'https://example.test/products/a', finalUrl: 'https://example.test/products/a' }]
  });
  const consoleOutput = formatEvidenceForConsole(evidence);
  const lines = consoleOutput.split('\n');
  assert.ok(lines.length <= MAX_LOG_LINES, `Expected ≤${MAX_LOG_LINES} lines but got ${lines.length}`);
  assert.match(consoleOutput, /Rohartefakte lokal:/);
  assert.match(consoleOutput, /qa\/results\/latest\.json/);
  assert.match(consoleOutput, /qa\/evidence\/latest-failure\.json/);
});

test('C: very large logs are sanitized and truncated', () => {
  const lines = Array.from({ length: 200 }, (_, index) => `log line ${index + 1}`).join('\n');
  const evidence = buildEvidence({
    exitCode: 1,
    checks: [{ scope: 'Browser', page: 'Produkt', viewport: 'Desktop', severity: 'error', message: 'Browserfehler', data: { stack: `${lines}\n<html>${'x'.repeat(5000)}</html>\ndata:image/png;base64,AAAA` } }]
  });
  assert.equal(evidence.primaryFailure.relevantLog.length, evidenceLimits.maxLogLines);
  assert.ok(evidence.primaryFailure.relevantLog.every(line => line.length <= evidenceLimits.maxLineLength));
  assert.doesNotMatch(evidence.primaryFailure.relevantLog.join('\n'), /data:image|<html>/i);
});

test('D: multiple failures have reproducible priority independent of input order', () => {
  const checks = [
    { scope: 'Browser', page: 'B', viewport: 'Desktop', severity: 'error', message: 'Console error' },
    { scope: 'Theme Check', page: 'snippets/a.liquid', viewport: '-', severity: 'error', message: 'Neuer error: SyntaxError (Zeile 12)' },
    { scope: 'Live Shop', page: 'A', viewport: 'Mobile', severity: 'error', message: 'HTTP 500' }
  ];
  const first = buildEvidence({ exitCode: 1, checks, pages: [] });
  const second = buildEvidence({ exitCode: 1, checks: [...checks].reverse(), pages: [] });
  assert.deepEqual(first, second);
  assert.equal(first.primaryFailure.checkName, 'Theme Check');
  assert.equal(first.primaryFailure.file, 'snippets/a.liquid');
  assert.equal(first.primaryFailure.line, 12);
});

test('E: sensitive callback queries are removed from every evidence field', () => {
  const callback = new URL('/services/login_with_shop/buyer/callback', 'https://www.teppich-paradies.net');
  callback.searchParams.set('token', 'FAKE_EVIDENCE_VALUE');
  callback.searchParams.set('foo', 'bar');
  const evidence = buildEvidence({
    exitCode: 1,
    checks: [{
      scope: 'Browser', page: 'Produkt', viewport: 'Desktop', severity: 'error',
      message: `Fehler bei ${callback.href}`,
      data: { url: callback.href, stack: `source ${callback.href}` }
    }],
    pages: []
  });
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /FAKE_EVIDENCE_VALUE|[?&]foo=bar/);
  assert.match(serialized, /services\/login_with_shop\/buyer\/callback/);
});
