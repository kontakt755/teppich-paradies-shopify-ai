import { HardStopError, globMatches } from './risk-guard.mjs';

const normalize = value => String(value).replaceAll('\\', '/').replace(/^\.\//, '');
const NON_BUDGET_PATTERNS = Object.freeze(['automation/reports/**', 'automation/state/**']);

export class DiffBudgetReviewError extends Error {
  constructor(reason, evidence = {}) {
    super(reason);
    this.name = 'DiffBudgetReviewError';
    this.status = 'REVIEW_REQUIRED';
    this.evidence = evidence;
  }
}

export function parseGitNumstat(output) {
  if (typeof output !== 'string') throw new TypeError('Git numstat output must be a string');
  return output.split(/\r?\n/).filter(Boolean).map(line => {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match) throw new HardStopError('Unrecognized git numstat line');
    const file = normalize(match[3].replace(/^.* => /, '').replace(/[{}]/g, ''));
    return { file, added: match[1] === '-' ? 0 : Number(match[1]), deleted: match[2] === '-' ? 0 : Number(match[2]), binary: match[1] === '-' };
  });
}

export class DiffBudgetGuard {
  constructor({ riskGuard, nonBudgetPatterns = NON_BUDGET_PATTERNS }) {
    this.riskGuard = riskGuard;
    this.nonBudgetPatterns = nonBudgetPatterns;
  }

  evaluate({ task, entries, actualOperations = task.allowedOperations, resources = [] }) {
    if (!Number.isInteger(task.maxFiles) || task.maxFiles < 0) throw new HardStopError('Task MAX_FILES is missing or invalid');
    if (!Number.isInteger(task.maxChangedLines) || task.maxChangedLines < 0) throw new HardStopError('Task MAX_CHANGED_LINES is missing or invalid');
    const files = [...new Set(entries.map(entry => normalize(entry.file)))];
    for (const file of files) {
      if (!this.riskGuard.map.paths.some(rule => globMatches(file, rule.pattern))) throw new HardStopError(`Unknown file: ${file}`, { file });
    }
    const risk = this.riskGuard.postflight({ task, changedFiles: files, actualOperations, resources });
    const budgetEntries = entries.filter(entry => !this.nonBudgetPatterns.some(pattern => globMatches(entry.file, pattern)));
    const budgetFiles = new Set(budgetEntries.map(entry => normalize(entry.file))).size;
    const changedLines = budgetEntries.reduce((sum, entry) => sum + entry.added + entry.deleted, 0);
    if (budgetFiles > task.maxFiles) throw new DiffBudgetReviewError('MAX_FILES exceeded', { actual: budgetFiles, maximum: task.maxFiles });
    if (changedLines > task.maxChangedLines) throw new DiffBudgetReviewError('MAX_CHANGED_LINES exceeded', { actual: changedLines, maximum: task.maxChangedLines });
    return { status: 'PASS', files: budgetFiles, changedLines, excludedInfrastructureFiles: files.length - budgetFiles, risk };
  }
}
