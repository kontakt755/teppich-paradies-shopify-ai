const ROUTE_TRIGGER = /\b(analysier|untersuch|recherch|plan|implement|reparier|beheb|fix|problem|fehler|optimier|review|prüf|mehrere|vollständig|komplett)\w*/i;
const PROTECTED_TRIGGER = /\b(preis|price|checkout|zahlung|payment|versand|shipping|produkt.*lösch|delete.*product|dns|domain|live[- ]?theme|veröffentl|publish)\w*/i;
const SHORT_FOLLOW_UP = /^(ja|nein|okay|ok|weiter|danke|fertig|nochmal|warum|wieso|wie genau)[.!?\s]*$/i;
// Ein Auftrag, der zeilenweise eingeht (Aufzaehlungspunkte, Ueberschriften mit
// Doppelpunkt), hat am 2026-09-08 rund 25 Voranalysen fuer einen einzigen
// Auftrag ausgeloest. Solche Fragmente sind kein eigenstaendiger Auftrag.
const LIST_FRAGMENT = /^(?:[*\-•]\s+\S.*|[^\n]{0,80}:)$/s;

export function shouldRouteClaudePrompt(prompt) {
  const normalized = typeof prompt === 'string' ? prompt.trim() : '';
  if (!normalized || normalized.startsWith('/') || SHORT_FOLLOW_UP.test(normalized)) return false;
  if (LIST_FRAGMENT.test(normalized) && !PROTECTED_TRIGGER.test(normalized)) return false;
  return normalized.length >= 160 || ROUTE_TRIGGER.test(normalized) || PROTECTED_TRIGGER.test(normalized);
}

function describe(step) {
  if (!step) return '-';
  return `${step.provider.toLowerCase()}:${step.model ?? 'default'}${step.effort ? `/${step.effort}` : ''}`;
}

export function buildRoutingLine(routing) {
  if (!routing?.plan) return '';
  const { taskClass, plan } = routing;
  return `Routing-Matrix: Klasse ${taskClass} → Implementer ${describe(plan.primary)}, Review ${describe(plan.reviewer)}${plan.securityReviewer ? `, Security-Review ${describe(plan.securityReviewer)}` : ''}, Corrector = Implementer, erwartete Modellaufrufe ${plan.expectedModelCalls[0]}-${plan.expectedModelCalls[1]}, Haiku erlaubt: ${plan.haikuAllowed}.`;
}

export function buildClaudeHookContext(result) {
  if (result.status === 'HUMAN_GATE') {
    return 'Router-Sicherheitsentscheidung: HIGH-Risk. Analysiere den Auftrag, aber führe keine geschäftskritische oder irreversible Änderung aus. Frage vor Live-Theme-, Preis-, Produkt-, Checkout-, Zahlungs-, Versand-, DNS- oder Löschoperationen ausdrücklich nach Freigabe.';
  }
  const routingLine = buildRoutingLine(result.routing);
  if (result.status === 'READY_NO_BRIEF') {
    return `${routingLine}\nKlasse A: deterministisch pruefen (npm test bzw. passende Guards), kein Modell-Review noetig. Keine Live-Veröffentlichung oder geschützte Shopify-Änderung ohne ausdrückliche Freigabe.`;
  }
  // Reine Frage (2026-09-11): der Implementierungszyklus wuerde Claude zu
  // Code fuer eine Wissensfrage draengen - genau der Vorfall vom 2026-09-11.
  // Der Stop-Hook prueft hier nur, wenn die Sitzung tatsaechlich etwas aendert.
  if (result.classified?.taskTypeSource === 'QUESTION') {
    return `${routingLine ? `${routingLine}\n` : ''}Router-Voranalyse (${result.classified.risk}/${result.policy.modelRequirement.class}, ${result.route.model}):\n${result.analysis}\n\nDer Auftrag ist eine Frage: beantworte sie belegt aus dem Repository und den Projektregeln, ohne ungefragt Code zu ändern. Änderst du auf ausdrücklichen Wunsch doch etwas, startet der Stop-Hook automatisch eine unabhängige read-only Codex-Prüfung; ohne Änderung entfällt sie. Keine Live-Veröffentlichung oder geschützte Shopify-Änderung ohne ausdrückliche Freigabe.`;
  }
  return `${routingLine ? `${routingLine}\n` : ''}Router-Voranalyse (${result.classified.risk}/${result.policy.modelRequirement.class}, ${result.route.model}):\n${result.analysis}\n\nVerbindlicher Fertigstellungszyklus:\n1. Lies AGENTS.md und untersuche den bestehenden Code.\n2. Implementiere die kleinste vollständige Änderung.\n3. Führe passende Tests aus, behebe Fehler und teste erneut.\n4. Beim Abschluss startet der Stop-Hook automatisch eine unabhängige read-only Codex-Prüfung mit dem Reviewer-Modell der Matrix. Starte deshalb nicht selbst einen zweiten Review-Aufruf.\n5. Bei CHANGES_REQUIRED erhältst du die Befunde automatisch: korrigiere sie, teste erneut und schließe erneut ab (höchstens 3 Review-Runden).\n6. Stoppe nur bei PASS oder einem echten Human Gate; berichte dann kompakt Belege und offene Punkte.\nManuelle Prüfung bei Bedarf: npm run agents:review -- --task-file "${result.handoffPath}"\nKeine Live-Veröffentlichung oder geschützte Shopify-Änderung ohne ausdrückliche Freigabe.`;
}
