const TASK_TYPES = new Set(['ANALYSIS', 'PLAN', 'IMPLEMENTATION', 'REVIEW', 'CORRECTION', 'TEST']);

export const ROLE = Object.freeze({
  REQUIREMENTS_CHALLENGER: 'REQUIREMENTS_CHALLENGER',
  ARCHITECT: 'ARCHITECT',
  IMPLEMENTER: 'IMPLEMENTER',
  REVIEWER: 'REVIEWER',
  SECURITY_REVIEWER: 'SECURITY_REVIEWER',
  VISUAL_REVIEWER: 'VISUAL_REVIEWER',
  DETERMINISTIC_QA: 'DETERMINISTIC_QA',
});

export const MODEL_CLASS = Object.freeze({
  LIGHT: 'LIGHT',
  STANDARD: 'STANDARD',
  PREMIUM: 'PREMIUM',
});

export const EFFORT_LEVEL = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

const WRITE_TYPES = new Set(['IMPLEMENTATION', 'CORRECTION']);
const UI_PATH = /^(assets|blocks|sections|snippets|templates|layout)\//i;
const UI_OPERATION = /(theme|css|locale|accessibility|navigation|snippet|template)/i;
const ARCHITECTURE_OPERATION = /(multi_file|architecture|migration|navigation)/i;
const COMMERCE_OPERATION = /(price|cart|checkout|payment|shipping|product|variant|inventory|discount|offer|feed)/i;
const SECURITY_OPERATION = /(secret|credential|customer|payment|checkout|webhook|dns|price_logic)/i;

function normalizeTaskType(task) {
  if (task.taskType) {
    const value = String(task.taskType).toUpperCase();
    if (!TASK_TYPES.has(value)) throw new Error(`Unknown task type: ${task.taskType}`);
    return value;
  }
  const operations = task.allowedOperations ?? [];
  if (operations.every(operation => /^(read|git_status|git_diff|git_log|git_fetch|report_write)$/.test(operation))) return 'ANALYSIS';
  if (operations.some(operation => /test/i.test(operation))) return 'TEST';
  return 'IMPLEMENTATION';
}

function inferredEffects(task) {
  const effects = new Set((task.effects ?? []).map(value => String(value).toLowerCase()));
  const files = task.allowedFiles ?? [];
  const operations = task.allowedOperations ?? [];
  if (files.some(file => UI_PATH.test(file)) || operations.some(operation => UI_OPERATION.test(operation))) effects.add('ui');
  if (operations.some(operation => ARCHITECTURE_OPERATION.test(operation)) || task.architectureImpact === true) effects.add('architecture');
  if (operations.some(operation => COMMERCE_OPERATION.test(operation))) effects.add('commerce');
  if (operations.some(operation => SECURITY_OPERATION.test(operation)) || task.securityImpact === true) effects.add('security');
  if (files.some(file => /^locales\//i.test(file)) || effects.has('copy')) effects.add('content');
  return effects;
}

function addRole(roles, role, reason, mode = 'MODEL') {
  if (!roles.some(item => item.id === role)) roles.push({ id: role, reason, mode });
}

export function routeTaskPolicy(task) {
  const policyVersion = task.routing?.policyVersion ?? 1;
  const taskType = normalizeTaskType(task);
  const effects = inferredEffects(task);
  const writeTask = WRITE_TYPES.has(taskType);
  const reviewTriggers = [];

  if (task.reviewRequired === true) reviewTriggers.push('EXPLICIT_REVIEW');
  if (task.workerUncertain === true) reviewTriggers.push('WORKER_UNCERTAIN');
  if (task.risk === 'MEDIUM' && (task.allowedFiles?.length ?? 0) > 3) reviewTriggers.push('MEDIUM_OVER_THREE_TARGETS');
  if (task.risk === 'MEDIUM' && effects.has('architecture')) reviewTriggers.push('ARCHITECTURE_IMPACT');
  if (effects.has('security')) reviewTriggers.push('SECURITY_PROXIMITY');
  const reviewRequired = reviewTriggers.length > 0;
  const requirementsRequired = Boolean(task.requirementIds?.length || Object.keys(task.proposedFacts ?? {}).length || effects.has('commerce'));
  const architectureRequired = effects.has('architecture') && task.risk !== 'LOW';
  const visualRequired = writeTask && effects.has('ui') && task.visualImpact !== false;
  const visualModelRequired = visualRequired && (task.risk === 'MEDIUM' || task.visualReviewRequired === true);
  const securityRequired = effects.has('security');

  const roles = [];
  if (requirementsRequired) addRole(roles, ROLE.REQUIREMENTS_CHALLENGER, 'Fachliche Invarianten oder kaufrelevante Wirkung');
  if (architectureRequired) addRole(roles, ROLE.ARCHITECT, 'Mittlere strukturelle oder dateiübergreifende Wirkung');
  if (writeTask) addRole(roles, ROLE.IMPLEMENTER, 'Implementierungs- oder Korrekturauftrag');
  if (writeTask || taskType === 'TEST') addRole(roles, ROLE.DETERMINISTIC_QA, 'Mechanische Prüfungen vor Modellreview', 'DETERMINISTIC');
  if (reviewRequired) addRole(roles, ROLE.REVIEWER, reviewTriggers.join(', '));
  if (securityRequired) addRole(roles, ROLE.SECURITY_REVIEWER, 'Security-nahe Operation oder expliziter Security-Impact');
  if (visualModelRequired) addRole(roles, ROLE.VISUAL_REVIEWER, 'Mittlere sichtbare Storefront-Änderung');

  const modelRoles = roles.filter(role => role.mode === 'MODEL');
  const fastPath = task.risk === 'LOW' && !reviewRequired && !architectureRequired && !securityRequired && modelRoles.every(role => role.id === ROLE.IMPLEMENTER);
  const autonomyLevel = task.risk === 'HIGH' ? 'HUMAN_GATE' : fastPath ? 'FULL' : 'GUARDED';
  const modelClass = task.routing?.modelClass ?? (task.risk === 'HIGH' ? MODEL_CLASS.PREMIUM : fastPath ? MODEL_CLASS.LIGHT : MODEL_CLASS.STANDARD);
  const effortLevel = task.routing?.effortLevel ?? (task.risk === 'HIGH' ? EFFORT_LEVEL.HIGH : fastPath ? EFFORT_LEVEL.LOW : EFFORT_LEVEL.MEDIUM);
  const gate = (id, required, reason) => ({ id, required, reason: required ? reason : 'Kein Trigger' });

  return {
    policyVersion,
    taskId: task.id,
    domain: task.domain,
    taskType,
    risk: task.risk,
    effects: [...effects].sort(),
    autonomyLevel,
    fastPath,
    modelRequirement: { class: modelClass, effortLevel, sticky: true },
    roles,
    review: { required: reviewRequired, triggers: reviewTriggers },
    gates: [
      gate('requirements', requirementsRequired, 'Requirements-/Spec-Prüfung erforderlich'),
      gate('architecture', architectureRequired, 'Architekturwirkung erforderlich'),
      gate('implementation', writeTask, 'Schreibender Task'),
      gate('postflight', writeTask, 'Diff-/Risk-Guard nach jedem Schreibblock'),
      gate('tests', writeTask || taskType === 'TEST', 'Deterministische Validierung'),
      gate('review', reviewRequired, reviewTriggers.join(', ')),
      gate('security', securityRequired, 'Security-Trigger'),
      gate('visualQa', visualRequired, 'Sichtbare Storefront-Änderung'),
    ],
  };
}

export function usesAutonomyPolicy(task) {
  return (task.routing?.policyVersion ?? 1) >= 2;
}
