import { DiffBudgetGuard } from '../../automation/core/diff-budget-guard.mjs';
import { loadRiskMap, RiskGuard } from '../../automation/core/risk-guard.mjs';
import { loadInvariantRegistry, SpecDriftGuard } from '../../automation/core/spec-drift.mjs';

export function createShopifyDomainPack() {
  const riskMap = loadRiskMap(new URL('./risk-map.json', import.meta.url));
  const invariantRegistry = loadInvariantRegistry(new URL('./invariants.json', import.meta.url));
  const riskGuard = new RiskGuard({ riskMap });
  return {
    domain: 'shopify',
    riskMap,
    invariantRegistry,
    riskGuard,
    diffBudgetGuard: new DiffBudgetGuard({ riskGuard }),
    specGuard: new SpecDriftGuard({ registry: invariantRegistry }),
  };
}
