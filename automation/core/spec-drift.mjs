import fs from 'node:fs';
import { globMatches } from './risk-guard.mjs';

const SEVERITIES = new Set(['HARD', 'REVIEW']);

function validateRegistry(registry) {
  if (!registry || typeof registry !== 'object' || !Array.isArray(registry.invariants)) throw new Error('Invalid invariant registry');
  const ids = new Set();
  for (const invariant of registry.invariants) {
    if (!invariant.id || ids.has(invariant.id)) throw new Error(`Invalid or duplicate invariant id: ${invariant.id}`);
    ids.add(invariant.id);
    if (!SEVERITIES.has(invariant.severity)) throw new Error(`Invariant ${invariant.id} has invalid severity`);
    if (!invariant.facts || typeof invariant.facts !== 'object' || Array.isArray(invariant.facts)) throw new Error(`Invariant ${invariant.id} requires facts`);
    if (invariant.constraints !== undefined && !Array.isArray(invariant.constraints)) throw new Error(`Invariant ${invariant.id} constraints must be an array`);
  }
  return structuredClone(registry);
}

export function loadInvariantRegistry(filePath) {
  return validateRegistry(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function fixedPrefix(pattern) {
  return String(pattern).replaceAll('\\', '/').split(/[*?]/, 1)[0];
}

function filesOverlap(taskFile, invariantPattern) {
  const taskPrefix = fixedPrefix(taskFile);
  const invariantPrefix = fixedPrefix(invariantPattern);
  return taskFile === invariantPattern
    || globMatches(taskFile, invariantPattern)
    || (taskPrefix.length > 0 && invariantPrefix.length > 0 && (taskPrefix.startsWith(invariantPrefix) || invariantPrefix.startsWith(taskPrefix)));
}

function selectorMatches(invariant, task, policy) {
  const selector = invariant.appliesWhen ?? {};
  if (selector.always === true) return true;
  const effects = new Set(policy?.effects ?? task.effects ?? []);
  if (selector.effects?.some(effect => effects.has(effect))) return true;
  if (selector.operations?.some(operation => task.allowedOperations?.includes(operation))) return true;
  if (selector.files?.some(pattern => task.allowedFiles?.some(file => filesOverlap(file, pattern)))) return true;
  return false;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class SpecDriftGuard {
  constructor({ registry }) {
    this.registry = validateRegistry(registry);
  }

  evaluate({ task, policy }) {
    const requested = new Set(task.requirementIds ?? []);
    const known = new Set(this.registry.invariants.map(invariant => invariant.id));
    const unknownRequirementIds = [...requested].filter(id => !known.has(id));
    const applicable = this.registry.invariants.filter(invariant => requested.has(invariant.id) || selectorMatches(invariant, task, policy));
    const proposedFacts = task.proposedFacts ?? {};
    const conflicts = [];
    for (const invariant of applicable) for (const [key, expected] of Object.entries(invariant.facts)) {
      if (Object.hasOwn(proposedFacts, key) && !sameValue(proposedFacts[key], expected)) {
        conflicts.push({ invariantId: invariant.id, fact: key, expected, proposed: proposedFacts[key], severity: invariant.severity });
      }
    }
    const hardConflict = unknownRequirementIds.length > 0 || conflicts.some(conflict => conflict.severity === 'HARD');
    const reviewConflict = conflicts.some(conflict => conflict.severity === 'REVIEW');
    return {
      status: hardConflict ? 'FAIL' : reviewConflict ? 'REVIEW_REQUIRED' : 'PASS',
      unknownRequirementIds,
      applicable: applicable.map(invariant => ({ id: invariant.id, title: invariant.title, severity: invariant.severity, constraints: invariant.constraints ?? [] })),
      conflicts,
    };
  }
}
