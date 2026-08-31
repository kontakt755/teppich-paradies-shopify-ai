import { MODEL_CLASS, ROLE } from './task-router.mjs';

const REVIEW_ROLES = new Set([ROLE.REVIEWER, ROLE.SECURITY_REVIEWER, ROLE.VISUAL_REVIEWER]);
const MODEL_CLASS_RANK = new Map([
  [MODEL_CLASS.LIGHT, 1],
  [MODEL_CLASS.STANDARD, 2],
  [MODEL_CLASS.PREMIUM, 3],
]);

function providerSupportsModelClass(provider, requiredModelClass) {
  if (!requiredModelClass || !provider.modelClass) return true;
  return (MODEL_CLASS_RANK.get(provider.modelClass) ?? 0) >= (MODEL_CLASS_RANK.get(requiredModelClass) ?? Number.POSITIVE_INFINITY);
}

function capabilityHeadroom(provider, requiredModelClass) {
  if (!requiredModelClass || !provider.modelClass) return 0;
  return (MODEL_CLASS_RANK.get(provider.modelClass) ?? 99) - (MODEL_CLASS_RANK.get(requiredModelClass) ?? 0);
}

function normalizeSessionPart(value) {
  return String(value ?? 'unknown').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function sessionGroup(role) {
  if (role === ROLE.IMPLEMENTER) return 'worker';
  if (REVIEW_ROLES.has(role)) return `review-${normalizeSessionPart(role)}`;
  return normalizeSessionPart(role);
}

function createSessionId(taskId, role) {
  return `tp-${normalizeSessionPart(taskId)}-${sessionGroup(role)}`.slice(0, 256);
}

function scoreProvider(provider, preferredProviders, requiredModelClass) {
  const preference = preferredProviders.indexOf(provider.id);
  const preferenceScore = preference === -1 ? 100 : preference;
  const measuredReliability = provider.sampleCount >= 5 ? -(provider.successRate ?? 0) : 0;
  return [preferenceScore, capabilityHeadroom(provider, requiredModelClass), provider.costRank ?? 99, measuredReliability, provider.id];
}

function compareScore(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

export function selectProvider({ role, providers, authorProvider = null, preferredProviders = [], requiredModelClass = null, effortLevel = null, taskId = 'task' }) {
  const candidates = providers.filter(provider =>
    provider.available === true &&
    provider.roles?.includes(role) &&
    providerSupportsModelClass(provider, requiredModelClass) &&
    (!REVIEW_ROLES.has(role) || provider.id !== authorProvider)
  );
  if (!candidates.length) return { status: 'UNAVAILABLE', role, reason: REVIEW_ROLES.has(role) ? 'Kein unabhängiger Provider verfügbar' : 'Kein geeigneter Provider verfügbar' };
  candidates.sort((left, right) => compareScore(scoreProvider(left, preferredProviders, requiredModelClass), scoreProvider(right, preferredProviders, requiredModelClass)));
  const provider = candidates[0];
  return {
    status: 'SELECTED',
    role,
    provider: provider.id,
    upstreamProvider: provider.upstreamProvider ?? provider.id,
    gateway: provider.gateway ?? 'DIRECT',
    model: provider.model ?? null,
    modelClass: provider.modelClass ?? requiredModelClass,
    requiredModelClass,
    effortLevel,
    costRank: provider.costRank ?? null,
    cacheSessionKey: createSessionId(taskId, role),
    sticky: true,
  };
}

export function buildProviderPlan({ policy, providers, authorProvider = null, preferredProviders = [] }) {
  let effectiveAuthor = authorProvider;
  return policy.roles.map(role => {
    if (role.mode === 'DETERMINISTIC') return { status: 'DETERMINISTIC', role: role.id };
    const route = selectProvider({
      role: role.id,
      providers,
      authorProvider: effectiveAuthor,
      preferredProviders,
      requiredModelClass: policy.modelRequirement?.class,
      effortLevel: policy.modelRequirement?.effortLevel,
      taskId: policy.taskId,
    });
    if (role.id === ROLE.IMPLEMENTER && route.status === 'SELECTED') effectiveAuthor = route.provider;
    return route;
  });
}

export function buildTaskRoutingDecision({ task, policy, providers, preferredProviders = [], existingDecision = null }) {
  if (existingDecision) {
    if (existingDecision.taskId !== task.id) throw new Error(`Persisted routing decision belongs to ${existingDecision.taskId}, not ${task.id}`);
    return structuredClone(existingDecision);
  }
  const routes = buildProviderPlan({ policy, providers, preferredProviders });
  const unavailable = routes.filter(route => route.status === 'UNAVAILABLE');
  return {
    version: 1,
    taskId: task.id,
    policyVersion: policy.policyVersion,
    status: unavailable.length ? 'UNAVAILABLE' : 'READY',
    sticky: true,
    modelRequirement: structuredClone(policy.modelRequirement ?? null),
    routes,
    unavailable,
  };
}

export function providerRouteForPhase(decision, phase) {
  if (!decision?.routes) return null;
  const selected = decision.routes.filter(route => route.status === 'SELECTED');
  if (phase === 'IMPLEMENT' || phase === 'CORRECT') {
    return selected.find(route => route.role === ROLE.IMPLEMENTER)
      ?? selected.find(route => !REVIEW_ROLES.has(route.role))
      ?? null;
  }
  if (phase === 'REVIEW') {
    return selected.find(route => route.role === ROLE.SECURITY_REVIEWER)
      ?? selected.find(route => route.role === ROLE.REVIEWER)
      ?? selected.find(route => route.role === ROLE.VISUAL_REVIEWER)
      ?? null;
  }
  return null;
}
