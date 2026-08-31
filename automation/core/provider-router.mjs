import { ROLE } from './task-router.mjs';

const REVIEW_ROLES = new Set([ROLE.REVIEWER, ROLE.SECURITY_REVIEWER, ROLE.VISUAL_REVIEWER]);

function scoreProvider(provider, preferredProviders) {
  const preference = preferredProviders.indexOf(provider.id);
  const preferenceScore = preference === -1 ? 100 : preference;
  const measuredReliability = provider.sampleCount >= 5 ? -(provider.successRate ?? 0) : 0;
  return [preferenceScore, provider.costRank ?? 99, measuredReliability, provider.id];
}

function compareScore(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

export function selectProvider({ role, providers, authorProvider = null, preferredProviders = [] }) {
  const candidates = providers.filter(provider =>
    provider.available === true &&
    provider.roles?.includes(role) &&
    (!REVIEW_ROLES.has(role) || provider.id !== authorProvider)
  );
  if (!candidates.length) return { status: 'UNAVAILABLE', role, reason: REVIEW_ROLES.has(role) ? 'Kein unabhängiger Provider verfügbar' : 'Kein geeigneter Provider verfügbar' };
  candidates.sort((left, right) => compareScore(scoreProvider(left, preferredProviders), scoreProvider(right, preferredProviders)));
  const provider = candidates[0];
  return { status: 'SELECTED', role, provider: provider.id, model: provider.model ?? null, costRank: provider.costRank ?? null };
}

export function buildProviderPlan({ policy, providers, authorProvider = null, preferredProviders = [] }) {
  return policy.roles.map(role => role.mode === 'DETERMINISTIC'
    ? { status: 'DETERMINISTIC', role: role.id }
    : selectProvider({ role: role.id, providers, authorProvider, preferredProviders })
  );
}
