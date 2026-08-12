import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DiffBudgetGuard, DiffBudgetReviewError, parseGitNumstat } from '../core/diff-budget-guard.mjs';
import { HardStopError, RiskGuard, loadRiskMap } from '../core/risk-guard.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/diff-budget-cases.json', import.meta.url), 'utf8'));
const riskGuard = new RiskGuard({ riskMap: loadRiskMap(new URL('../../domains/shopify/risk-map.json', import.meta.url)) });
const guard = new DiffBudgetGuard({ riskGuard });
const run = (task, text) => guard.evaluate({ task, entries: parseGitNumstat(text), actualOperations: ['test_write'] });

test('files and changed lines within budget PASS', () => assert.equal(run(fixture.task, fixture.passing).status, 'PASS'));
test('files above MAX_FILES require review', () => assert.throws(() => run(fixture.task, fixture.tooManyFiles), DiffBudgetReviewError));
test('lines above MAX_CHANGED_LINES require review', () => assert.throws(() => run(fixture.task, fixture.tooManyLines), DiffBudgetReviewError));
test('outside ALLOWED_FILES is a hard stop', () => assert.throws(() => run(fixture.task, '1\t0\tqa/out.json\n'), HardStopError));
test('unknown file is a hard stop', () => assert.throws(() => run({ ...fixture.task, risk: 'MEDIUM', allowedFiles: ['mystery/**'] }, '1\t0\tmystery/x.txt\n'), /Unknown file/));
test('higher actual path risk delegates to Risk Guard hard stop', () => assert.throws(() => run({ ...fixture.task, risk: 'MEDIUM', allowedFiles: ['templates/**'] }, '1\t0\ttemplates/product.json\n'), /Effective risk HIGH exceeds/));
test('report and state files are allowlisted and risk checked but excluded from budget', () => {
  const result = run({ ...fixture.task, maxFiles: 0, maxChangedLines: 0 }, '50\t0\tautomation/reports/SHP-X.md\n20\t0\tautomation/state/run.json\n');
  assert.deepEqual({ files: result.files, lines: result.changedLines, excluded: result.excludedInfrastructureFiles }, { files: 0, lines: 0, excluded: 2 });
});
test('malformed numstat is a hard stop', () => assert.throws(() => parseGitNumstat('not-a-diff'), HardStopError));
