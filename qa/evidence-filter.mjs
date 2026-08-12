import fs from 'node:fs';
import path from 'node:path';

const MAX_LOG_LINES = 30;
const MAX_LINE_LENGTH = 500;
const MAX_ASSERTION_LENGTH = 800;

const scopePriority = new Map([
  ['Allowlist', 0], ['Secrets', 1], ['Theme Check', 2], ['Live Shop', 3],
  ['Browser', 4], ['Bilder', 5], ['Shop-Smoke', 6]
]);

function cleanText(value, maxLength = MAX_LINE_LENGTH) {
  return String(value ?? '')
    .replace(/data:(?:image|application)\/[^\s"']+/gi, '[inline data omitted]')
    .replace(/<html[\s\S]*?<\/html>/gi, '[HTML omitted]')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/[\t ]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function classify(item) {
  const joined = `${item.scope ?? ''} ${item.message ?? ''}`.toLowerCase();
  if (joined.includes('allowlist')) return 'allowlist';
  if (joined.includes('secret')) return 'secret';
  if (item.scope === 'Theme Check') return 'theme-check';
  if (/navigation|http \d|ohne antwort/.test(joined)) return 'navigation-http';
  if (item.scope === 'Browser') return 'browser';
  if (item.scope === 'Bilder') return 'asset';
  if (/assert|erwartet|fehlt|unerwünscht|overflow/.test(joined)) return 'assertion';
  return 'unknown';
}

function itemKey(item) {
  return [item.scope, item.page, item.viewport, item.message].map(value => String(value ?? '')).join('|');
}

function relevantLines(item) {
  const candidates = [item.message];
  if (item.data && typeof item.data === 'object') {
    for (const key of ['message', 'url', 'file', 'check', 'assertion', 'stack']) {
      if (item.data[key] != null) candidates.push(item.data[key]);
    }
  }
  return candidates.flatMap(value => String(value ?? '').split(/\r?\n/))
    .map(line => cleanText(line)).filter(Boolean).slice(0, MAX_LOG_LINES);
}

function toEvidence(item, result) {
  const message = cleanText(item.message, MAX_ASSERTION_LENGTH);
  const pageResult = (result.pages ?? []).find(page =>
    page.page === item.page && (item.viewport == null || page.viewport === item.viewport)
  );
  const lineMatch = message.match(/(?:Zeile|line)\s+(\d+)/i);
  return {
    checkName: cleanText(item.data?.check ?? item.scope ?? 'Unknown'),
    firstRelevantAssertion: message,
    url: cleanText(item.data?.url ?? pageResult?.finalUrl ?? pageResult?.url ?? '') || null,
    viewport: cleanText(item.viewport ?? '') || null,
    file: cleanText(item.data?.file ?? (item.scope === 'Theme Check' ? item.page : '')) || null,
    line: item.data?.line ?? (lineMatch ? Number(lineMatch[1]) : null),
    errorClass: classify(item),
    relevantLog: relevantLines(item)
  };
}

export function buildEvidence(result) {
  const errors = (result.checks ?? []).filter(item => item.severity === 'error').sort((a, b) => {
    const rank = (scopePriority.get(a.scope) ?? 99) - (scopePriority.get(b.scope) ?? 99);
    return rank || itemKey(a).localeCompare(itemKey(b), 'de');
  });
  if (!errors.length) return {
    version: 1, status: 'PASS', exitCode: result.exitCode ?? 0,
    summary: 'Keine relevanten QA-Fehler.', failureCount: 0,
    primaryFailure: null, additionalFailures: []
  };
  const evidence = errors.map(item => toEvidence(item, result));
  return {
    version: 1, status: 'FAIL', exitCode: result.exitCode ?? 1,
    summary: `${evidence.length} relevante QA-Fehler; kompakte Evidenz erzeugt.`,
    failureCount: evidence.length, primaryFailure: evidence[0],
    additionalFailures: evidence.slice(1, 5).map(item => ({
      checkName: item.checkName, firstRelevantAssertion: item.firstRelevantAssertion,
      url: item.url, viewport: item.viewport, file: item.file, line: item.line,
      errorClass: item.errorClass
    })),
    truncatedAdditionalFailures: Math.max(0, evidence.length - 5)
  };
}

export function writeEvidence(evidence, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

export function formatEvidenceForConsole(evidence) {
  if (evidence.status === 'PASS') return 'QA evidence: PASS – keine relevanten Fehler.';
  const failure = evidence.primaryFailure;
  return [
    `QA evidence: FAIL – ${evidence.failureCount} relevante Fehler`,
    `Check: ${failure.checkName}`, `Fehlerklasse: ${failure.errorClass}`,
    `Assertion: ${failure.firstRelevantAssertion}`,
    failure.url ? `URL: ${failure.url}` : null,
    failure.viewport ? `Viewport: ${failure.viewport}` : null,
    failure.file ? `Datei: ${failure.file}` : null,
    failure.line ? `Zeile: ${failure.line}` : null,
    ...failure.relevantLog.map(line => `> ${line}`)
  ].filter(Boolean).slice(0, 38).join('\n');
}

export const evidenceLimits = Object.freeze({
  maxLogLines: MAX_LOG_LINES, maxLineLength: MAX_LINE_LENGTH,
  maxAssertionLength: MAX_ASSERTION_LENGTH, maxAdditionalFailures: 4
});
