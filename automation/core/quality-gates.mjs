const PASS = 'PASS';
const NOT_REQUIRED = 'NOT_REQUIRED';

function evidenceRecord(value, fallbackSource) {
  if (!value) return null;
  if (value.status && value.status !== PASS) return value;
  return { status: PASS, evidence: value.evidence ?? value, source: value.source ?? fallbackSource };
}

function testEvidence(result) {
  const tests = result.testResults ?? result.tests;
  if (!Array.isArray(tests) || !tests.length) return null;
  const failed = tests.filter(test => test.status !== PASS);
  return failed.length
    ? { status: 'FAIL', evidence: { failed } }
    : { status: PASS, evidence: { count: tests.length, tests }, source: 'deterministic-tests' };
}

export function evaluateQualityGates({ policy, result, postflight, specCheck = null }) {
  const supplied = result.gateEvidence ?? {};
  const records = {};
  for (const gate of policy.gates) {
    if (!gate.required) {
      records[gate.id] = { status: NOT_REQUIRED, reason: gate.reason };
      continue;
    }
    let record = evidenceRecord(supplied[gate.id], `worker:${gate.id}`);
    if (gate.id === 'requirements' && specCheck?.status === PASS) record = { status: PASS, evidence: specCheck, source: 'spec-drift-guard' };
    if (gate.id === 'implementation' && result.status === PASS) {
      const files = result.diffEntries?.map(entry => entry.file) ?? result.changedFiles;
      if (Array.isArray(files)) record = { status: PASS, evidence: { files }, source: 'runner' };
    }
    if (gate.id === 'postflight' && postflight) record = { status: PASS, evidence: postflight, source: 'risk-guard' };
    if (gate.id === 'tests') record = testEvidence(result) ?? record;
    if (gate.id === 'review' && result.reviewRound > 0 && !(result.findings ?? []).some(finding => ['P0', 'P1', 'P2'].includes(finding.priority))) {
      record = { status: PASS, evidence: { reviewRound: result.reviewRound }, source: 'review-cycle' };
    }
    records[gate.id] = record ?? { status: 'BLOCKED', reason: `Pflichtevidenz für ${gate.id} fehlt` };
  }
  const blocking = Object.entries(records).filter(([, record]) => ![PASS, NOT_REQUIRED].includes(record.status)).map(([id, record]) => ({ id, ...record }));
  return { status: blocking.length ? 'BLOCKED' : PASS, releaseReady: blocking.length === 0, records, blocking };
}
