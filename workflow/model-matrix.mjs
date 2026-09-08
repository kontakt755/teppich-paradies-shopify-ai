// Einzige Quelle fuer die Modellwahl je Task-Klasse und Rolle.
//
// Bis 2026-09-08 vergab workflow/router.mjs zwar modelTier NONE/STANDARD/STRONG,
// aber kein Aufruf hat daraus je ein --model abgeleitet: der Agent-Loop lief mit
// dem Account-Default, die Analyse mit Haiku, Codex mit seinem Konfig-Default
// (gpt-5.6-terra, effort low). Diese Datei bildet Klasse -> Primary / Reviewer /
// Corrector / Final Check ab und liefert die Eskalationsleiter.
//
// Modellnamen sind belegt, nicht geraten:
// - Claude-Aliasse laut `claude --help --model`: fable, opus, sonnet, haiku
// - Codex-Slugs laut ~/.codex/models_cache.json (Stand 2026-09-08)
//
// Prioritaeten laut Auftrag: Qualitaet > Zuverlaessigkeit > keine wiederholten
// Fehler > Architektur > Cross-Provider-Review > Geschwindigkeit > Kosten.
// Claude Max 20x traegt die Hauptlast, ChatGPT Plus (Codex) wird nur dort
// eingesetzt, wo ein unabhaengiger Gegencheck echten Mehrwert hat.

import fs from 'node:fs';
import path from 'node:path';

export const PROVIDER = Object.freeze({ CLAUDE: 'CLAUDE', CODEX: 'CODEX', SCRIPT: 'SCRIPT' });

// Staerke-Rang je Provider, aufsteigend. Wird fuer Eskalation und fuer die
// Corrector-Regel gebraucht: ein Corrector darf nie schwaecher sein als der
// Implementer.
export const CLAUDE_MODELS = Object.freeze(['haiku', 'sonnet', 'opus', 'fable']);
export const CODEX_MODELS = Object.freeze(['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra']);
export const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
// Opus und Fable gelten als gleichwertige Spitzenmodelle; die Eskalation
// wechselt zwischen ihnen, statt nur den Effort zu erhoehen.
const PEER_MODEL = Object.freeze({ fable: 'opus', opus: 'fable' });

// Faehigkeitsniveau providerunabhaengig, damit "Corrector nie schwaecher als
// Implementer" und "Fallback auf gleichem Niveau" pruefbar sind.
const STRENGTH = Object.freeze({ haiku: 1, sonnet: 2, opus: 3, fable: 3, 'gpt-5.6-luna': 1, 'gpt-5.6-terra': 2, 'gpt-5.6-sol': 2, 'gpt-6-astra': 3 });
export function modelStrength(step) {
  return step?.model ? (STRENGTH[step.model] ?? 0) : 0;
}

export const STRATEGY = Object.freeze({ QUALITY: 'quality', LEGACY: 'legacy' });

export function activeStrategy(env = process.env) {
  return env.TP_ROUTING_STRATEGY === STRATEGY.LEGACY ? STRATEGY.LEGACY : STRATEGY.QUALITY;
}

const step = (provider, model, effort) => Object.freeze({ provider, model, effort });

// Task-Klasse | Primary | Reviewer | Corrector | Final Check | Haiku erlaubt?
// A  haiku low            -                 = Primary        deterministisch          ja
// B  fable medium         codex sol medium  = Primary        deterministisch          nur wenn trivial (dann Klasse A)
// C  fable high           codex astra high  = Primary        codex sol medium         nein
// D  opus high            codex astra xhigh = Primary        codex sol high           nur Hilfsaufgaben
//    + Security Review durch fable high (zweites Claude-Modell, nicht der Autor)
const QUALITY_PLANS = Object.freeze({
  A: Object.freeze({
    taskClass: 'A',
    primary: step(PROVIDER.CLAUDE, 'haiku', 'low'),
    reviewer: null,
    secondReviewer: null,
    securityReviewer: null,
    finalCheck: 'DETERMINISTIC',
    haikuAllowed: 'YES',
    expectedModelCalls: [1, 1],
  }),
  B: Object.freeze({
    taskClass: 'B',
    primary: step(PROVIDER.CLAUDE, 'fable', 'medium'),
    reviewer: step(PROVIDER.CODEX, 'gpt-5.6-sol', 'medium'),
    secondReviewer: null,
    securityReviewer: null,
    finalCheck: 'DETERMINISTIC',
    haikuAllowed: 'ONLY_TRIVIAL',
    expectedModelCalls: [2, 3],
  }),
  C: Object.freeze({
    taskClass: 'C',
    primary: step(PROVIDER.CLAUDE, 'fable', 'high'),
    reviewer: step(PROVIDER.CODEX, 'gpt-6-astra', 'high'),
    secondReviewer: step(PROVIDER.CODEX, 'gpt-5.6-sol', 'medium'),
    securityReviewer: null,
    finalCheck: 'REVIEWER_THEN_DETERMINISTIC',
    haikuAllowed: 'NO',
    expectedModelCalls: [3, 5],
  }),
  D: Object.freeze({
    taskClass: 'D',
    primary: step(PROVIDER.CLAUDE, 'opus', 'high'),
    reviewer: step(PROVIDER.CODEX, 'gpt-6-astra', 'xhigh'),
    secondReviewer: step(PROVIDER.CODEX, 'gpt-5.6-sol', 'high'),
    securityReviewer: step(PROVIDER.CLAUDE, 'fable', 'high'),
    finalCheck: 'REVIEWER_THEN_DETERMINISTIC',
    haikuAllowed: 'HELPER_ONLY',
    expectedModelCalls: [5, 7],
  }),
});

// Legacy = Verhalten vor der Matrix: kein --model, Effort medium, Codex mit
// Konfig-Default. Nur als Rollback ueber TP_ROUTING_STRATEGY=legacy.
const LEGACY_PLAN = Object.freeze({
  primary: step(PROVIDER.CLAUDE, null, 'medium'),
  reviewer: step(PROVIDER.CODEX, null, null),
  secondReviewer: null,
  securityReviewer: null,
  finalCheck: 'DETERMINISTIC',
  haikuAllowed: 'LEGACY',
  expectedModelCalls: [2, 7],
});

export function buildModelPlan(taskClass, { env = process.env } = {}) {
  if (!QUALITY_PLANS[taskClass]) throw new TypeError(`Unbekannte Task-Klasse: ${taskClass}`);
  const strategy = activeStrategy(env);
  const base = strategy === STRATEGY.LEGACY ? { ...LEGACY_PLAN, taskClass } : QUALITY_PLANS[taskClass];
  // Corrector = Primary. Ein schwaecheres Modell darf die Loesung eines
  // staerkeren nie korrigieren; die Eskalation hebt ihn hoechstens an.
  return { ...base, corrector: base.primary, strategy, schemaVersion: 1 };
}

// Rolle | bevorzugt | Alternative | Fallback
export const ROLE_MATRIX = Object.freeze({
  REQUIREMENTS_CHALLENGER: { preferred: step(PROVIDER.CLAUDE, 'opus', 'high'), alternative: step(PROVIDER.CODEX, 'gpt-6-astra', 'high'), fallback: step(PROVIDER.CLAUDE, 'fable', 'high') },
  ARCHITECT: { preferred: step(PROVIDER.CLAUDE, 'opus', 'xhigh'), alternative: step(PROVIDER.CLAUDE, 'fable', 'xhigh'), fallback: step(PROVIDER.CODEX, 'gpt-6-astra', 'high') },
  IMPLEMENTER: { preferred: step(PROVIDER.CLAUDE, 'fable', 'high'), alternative: step(PROVIDER.CLAUDE, 'opus', 'high'), fallback: step(PROVIDER.CODEX, 'gpt-6-astra', 'high') },
  DEBUGGER: { preferred: step(PROVIDER.CLAUDE, 'opus', 'xhigh'), alternative: step(PROVIDER.CLAUDE, 'fable', 'xhigh'), fallback: step(PROVIDER.CODEX, 'gpt-6-astra', 'xhigh') },
  REVIEWER: { preferred: step(PROVIDER.CODEX, 'gpt-6-astra', 'high'), alternative: step(PROVIDER.CODEX, 'gpt-5.6-sol', 'medium'), fallback: step(PROVIDER.CLAUDE, 'opus', 'high') },
  CORRECTOR: { preferred: 'SAME_AS_IMPLEMENTER', alternative: step(PROVIDER.CLAUDE, 'opus', 'high'), fallback: step(PROVIDER.CODEX, 'gpt-6-astra', 'high') },
  SECURITY_REVIEWER: { preferred: step(PROVIDER.CODEX, 'gpt-6-astra', 'xhigh'), alternative: step(PROVIDER.CLAUDE, 'fable', 'high'), fallback: step(PROVIDER.CLAUDE, 'opus', 'high') },
  VISUAL_REVIEWER: { preferred: step(PROVIDER.CLAUDE, 'fable', 'medium'), alternative: step(PROVIDER.CLAUDE, 'sonnet', 'medium'), fallback: step(PROVIDER.SCRIPT, 'qa:visual', null) },
  DETERMINISTIC_QA: { preferred: step(PROVIDER.SCRIPT, 'npm test', null), alternative: step(PROVIDER.CLAUDE, 'haiku', 'low'), fallback: null },
});

function effortUp(effort) {
  const index = EFFORT_LEVELS.indexOf(effort ?? 'medium');
  return EFFORT_LEVELS[Math.min(index + 1, EFFORT_LEVELS.indexOf('xhigh'))];
}

// Eskalationsleiter fuer den Implementer/Corrector. `round` zaehlt die
// gescheiterten Versuche desselben Schritts (1 = erster Fehlschlag).
//   haiku      -> Aufgabe wird als B behandelt: fable medium (kein 5x Haiku)
//   1. Fehler  -> gleicher Schritt, Effort eine Stufe hoeher
//   2. Fehler  -> Peer-Modell (fable <-> opus) mit effort high
//   3. Fehler  -> Provider-Wechsel: Codex gpt-6-astra high
//   danach     -> null = Human Gate
export function escalateStep(current, { round = 1, reason = 'REPEATED_FAILURE' } = {}) {
  if (!current) return null;
  if (current.provider === PROVIDER.CLAUDE && current.model === 'haiku') {
    return { ...step(PROVIDER.CLAUDE, 'fable', 'medium'), reason: `${reason}:RECLASSIFY_A_TO_B` };
  }
  if (round <= 1) {
    const raised = effortUp(current.effort);
    if (raised !== current.effort) return { ...step(current.provider, current.model, raised), reason: `${reason}:EFFORT_UP` };
  }
  if (round <= 2 && current.provider === PROVIDER.CLAUDE) {
    const peer = PEER_MODEL[current.model] ?? 'opus';
    if (peer !== current.model) return { ...step(PROVIDER.CLAUDE, peer, 'high'), reason: `${reason}:PEER_MODEL` };
  }
  if (round <= 3 && current.provider === PROVIDER.CLAUDE) {
    return { ...step(PROVIDER.CODEX, 'gpt-6-astra', 'high'), reason: `${reason}:CROSS_PROVIDER` };
  }
  return null;
}

// Fallback bei Rate Limit oder erschoepftem Kontingent. Die Faehigkeit bleibt
// erhalten, nur der Provider wechselt; ein Reviewer darf dabei nie auf das
// Modell des Autors fallen.
export function rateLimitFallback(current, { authorModel = null } = {}) {
  if (!current) return null;
  if (current.provider === PROVIDER.CODEX) {
    const model = authorModel === 'opus' ? 'fable' : 'opus';
    return { ...step(PROVIDER.CLAUDE, model, current.effort === 'low' ? 'medium' : (current.effort ?? 'high')), reason: 'CODEX_RATE_LIMIT:CLAUDE_INDEPENDENT_MODEL', crossProvider: false };
  }
  if (current.provider === PROVIDER.CLAUDE) {
    const model = current.model === 'haiku' || current.model === 'sonnet' ? 'gpt-5.6-sol' : 'gpt-6-astra';
    return { ...step(PROVIDER.CODEX, model, current.effort ?? 'high'), reason: 'CLAUDE_RATE_LIMIT:CODEX', crossProvider: true };
  }
  return null;
}

// Fingerabdruck einer Fehlerlage, damit "derselbe Fehler nochmal" erkannt wird.
export function failureSignature(findings = []) {
  return findings
    .map(finding => `${finding.priority ?? ''}|${(finding.file ?? '').trim()}|${String(finding.problem ?? finding.message ?? '').trim().toLowerCase().slice(0, 120)}`)
    .sort()
    .join('\n');
}

export function isRateLimitError(error) {
  return /(?:usage|rate|quota).{0,40}limit|limit.{0,40}(?:reached|resets)|rate_limit_error|too many requests|\b429\b|insufficient_quota|exceeded your current quota/i
    .test(`${error?.message ?? ''}\n${error?.commandOutput ?? ''}`);
}

// Codex liegt seit dem ChatGPT-Desktop-Bundle nicht im PATH; der Stop-Hook hat
// deshalb seit Einfuehrung jede Pruefung still uebersprungen (0 von 17 Laeufen
// mit codex-review.json). Reihenfolge: ausdrueckliche Variable, PATH, Bundle.
export function resolveCodexBinary({ env = process.env, io = fs } = {}) {
  const candidates = [
    env.CODEX_CLI_PATH,
    ...(env.PATH ?? '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'codex')),
    '/Applications/ChatGPT.app/Contents/Resources/codex',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { io.accessSync(candidate, fs.constants.X_OK); return candidate; } catch { /* naechster Kandidat */ }
  }
  return null;
}

export function codexArgsForStep(reviewStep) {
  if (!reviewStep?.model) return [];
  return ['-m', reviewStep.model, ...(reviewStep.effort ? ['-c', `model_reasoning_effort="${reviewStep.effort}"`] : [])];
}

export function claudeArgsForStep(implementStep) {
  if (!implementStep) return [];
  return [...(implementStep.model ? ['--model', implementStep.model] : []), ...(implementStep.effort ? ['--effort', implementStep.effort] : [])];
}

export function describeStep(value) {
  if (!value) return '-';
  if (typeof value === 'string') return value;
  return `${value.provider.toLowerCase()}:${value.model ?? 'default'}${value.effort ? `/${value.effort}` : ''}`;
}

export function formatModelPlan(plan) {
  return [
    `PRIMARY_MODEL: ${describeStep(plan.primary)}`,
    `REVIEWER_MODEL: ${describeStep(plan.reviewer)}`,
    `SECOND_REVIEWER: ${describeStep(plan.secondReviewer)}`,
    `SECURITY_REVIEWER: ${describeStep(plan.securityReviewer)}`,
    `CORRECTOR_MODEL: ${describeStep(plan.corrector)}`,
    `FINAL_CHECK: ${plan.finalCheck}`,
    `HAIKU_ALLOWED: ${plan.haikuAllowed}`,
    `EXPECTED_MODEL_CALLS: ${plan.expectedModelCalls[0]}-${plan.expectedModelCalls[1]}`,
    `ROUTING_STRATEGY: ${plan.strategy}`,
  ].join('\n');
}
