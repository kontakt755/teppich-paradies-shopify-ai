const ROUTE_TRIGGER = /\b(analysier|untersuch|recherch|plan|implement|reparier|beheb|fix|problem|fehler|optimier|review|prüf|mehrere|vollständig|komplett)\w*/i;
const PROTECTED_TRIGGER = /\b(preis|price|checkout|zahlung|payment|versand|shipping|produkt.*lösch|delete.*product|dns|domain|live[- ]?theme|veröffentl|publish)\w*/i;
const SHORT_FOLLOW_UP = /^(ja|nein|okay|ok|weiter|danke|fertig|nochmal|warum|wieso|wie genau)[.!?\s]*$/i;

export function shouldRouteClaudePrompt(prompt) {
  const normalized = typeof prompt === 'string' ? prompt.trim() : '';
  if (!normalized || normalized.startsWith('/') || SHORT_FOLLOW_UP.test(normalized)) return false;
  return normalized.length >= 160 || ROUTE_TRIGGER.test(normalized) || PROTECTED_TRIGGER.test(normalized);
}

export function buildClaudeHookContext(result) {
  if (result.status === 'HUMAN_GATE') {
    return 'Router-Sicherheitsentscheidung: HIGH-Risk. Analysiere den Auftrag, aber führe keine geschäftskritische oder irreversible Änderung aus. Frage vor Live-Theme-, Preis-, Produkt-, Checkout-, Zahlungs-, Versand-, DNS- oder Löschoperationen ausdrücklich nach Freigabe.';
  }
  return `Router-Voranalyse (${result.classified.risk}/${result.policy.modelRequirement.class}, ${result.route.model}):\n${result.analysis}\n\nArbeite mit dem bestehenden Code, lies zuerst AGENTS.md, ändere nur den erforderlichen Umfang und führe passende Tests aus. Keine Live-Veröffentlichung oder geschützte Shopify-Änderung ohne ausdrückliche Freigabe.`;
}
