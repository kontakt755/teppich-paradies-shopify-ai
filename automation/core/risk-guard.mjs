import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from './state-store.mjs';

const RANK = Object.freeze({ LOW: 0, MEDIUM: 1, HIGH: 2 });

export class HardStopError extends Error {
  constructor(reason, evidence = {}) {
    super(reason);
    this.name = 'HardStopError';
    this.evidence = evidence;
  }
}

const normalize = value => String(value).replaceAll('\\', '/').replace(/^\.\//, '');

export function globMatches(filePath, pattern) {
  const glob = normalize(pattern);
  let source = '';
  for (let index = 0; index < glob.length; index++) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') {
      const followedBySlash = glob[index + 2] === '/';
      source += followedBySlash ? '(?:.*/)?' : '.*';
      index += followedBySlash ? 2 : 1;
    } else if (character === '*') source += '[^/]*';
    else if (character === '?') source += '[^/]';
    else source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'i').test(normalize(filePath));
}

export function highestRisk(...risks) {
  return risks.filter(Boolean).reduce((highest, risk) => {
    if (!(risk in RANK)) throw new HardStopError(`Unknown risk class: ${risk}`);
    return RANK[risk] > RANK[highest] ? risk : highest;
  }, 'LOW');
}

export function loadRiskMap(filePath) {
  const map = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!map.operations || !Array.isArray(map.paths) || !map.defaultPathRisk) throw new Error('Invalid risk map');
  return map;
}

export class RiskGuard {
  constructor({ riskMap }) {
    this.map = riskMap;
  }

  operationRisk(operation) {
    const risk = this.map.operations[operation];
    if (!risk) throw new HardStopError(`Unknown operation: ${operation}`, { operation });
    return risk;
  }

  pathRisk(filePath) {
    const matches = this.map.paths.filter(rule => globMatches(filePath, rule.pattern)).map(rule => rule.risk);
    return matches.length ? highestRisk(...matches) : this.map.defaultPathRisk;
  }

  resourceRisk(resource) {
    if (!resource) return 'LOW';
    return this.map.protectedResources?.[resource] ?? 'LOW';
  }

  assertAllowlist(task, files, operations) {
    for (const operation of operations) {
      if (!task.allowedOperations.includes(operation)) throw new HardStopError(`Operation outside allowlist: ${operation}`, { operation });
      this.operationRisk(operation);
    }
    for (const file of files) {
      if (!task.allowedFiles.some(pattern => globMatches(file, pattern))) throw new HardStopError(`File outside allowlist: ${normalize(file)}`, { file: normalize(file) });
    }
  }

  evaluate({ task, files = task.allowedFiles, operations = task.allowedOperations, resources = [] }) {
    if (!(task.risk in RANK)) throw new HardStopError(`Unknown declared risk: ${task.risk}`);
    this.assertAllowlist(task, files, operations);
    const operationRisk = highestRisk(...operations.map(operation => this.operationRisk(operation)));
    const pathRisk = highestRisk(...files.map(file => this.pathRisk(file)));
    const resourceRisk = highestRisk(...resources.map(resource => this.resourceRisk(resource)));
    const effectiveRisk = highestRisk(operationRisk, pathRisk, resourceRisk);
    if (RANK[effectiveRisk] > RANK[task.risk]) throw new HardStopError(`Effective risk ${effectiveRisk} exceeds task risk ${task.risk}`, { operationRisk, pathRisk, resourceRisk, effectiveRisk });
    return { declaredRisk: task.risk, operationRisk, pathRisk, resourceRisk, effectiveRisk };
  }

  postflight({ task, changedFiles, actualOperations = task.allowedOperations, resources = [] }) {
    return this.evaluate({ task, files: changedFiles, operations: actualOperations, resources });
  }
}

export function routeRiskDecision({ task, evaluation, statePath, needsAhmetPath, io = fs, now = () => new Date() }) {
  const effectiveRisk = evaluation?.effectiveRisk ?? task.risk;
  if (effectiveRisk !== 'HIGH') return { status: 'PENDING', effectiveRisk };
  const state = { taskId: task.id, status: 'NEEDS_AHMET', effectiveRisk: 'HIGH', updatedAt: now().toISOString(), reason: 'HIGH tasks never run autonomously' };
  atomicWriteJson(statePath, state, io);
  const entry = `\n## ${task.id}\n\n- Status: NEEDS_AHMET\n- Risk: HIGH\n- Grund: ${state.reason}\n`;
  io.mkdirSync(path.dirname(needsAhmetPath), { recursive: true });
  const existing = io.existsSync(needsAhmetPath) ? io.readFileSync(needsAhmetPath, 'utf8') : '# Needs Ahmet\n';
  if (!existing.includes(`## ${task.id}\n`)) io.writeFileSync(needsAhmetPath, `${existing.trimEnd()}${entry}`);
  return state;
}
