/**
 * Prompt-Bau fuer Implementer / Reviewer / Corrector (Phase 5).
 *
 * Grundsatz: minimaler Kontext. Kein Repo-Dump, keine Rohlogs, keine Secrets.
 * Jeder Agent bekommt nur das, was er fuer seine Rolle braucht, plus das
 * geforderte Resultatformat.
 */

import { redactSecrets } from './agent-result.mjs';

const RESULT_CONTRACT = `ANTWORTFORMAT (zwingend)
Gib als ALLERLETZTES genau einen JSON-Block aus, eingefasst in die Marker
<<<AGENT_RESULT>>> und <<<END_AGENT_RESULT>>>. Kein Text danach.

<<<AGENT_RESULT>>>
{
  "status": "PASS | FINDINGS | FAILED | BLOCKED | SECURITY_STOP",
  "summary": "max. 5 Saetze, was konkret getan wurde",
  "changedFiles": ["pfad/relativ/zum/repo-root"],
  "actualOperations": ["operation_id aus der erlaubten Operationsliste"],
  "resources": ["angefasste geschuetzte Ressourcen, sonst leer"],
  "tests": { "status": "PASS|FAIL|NOT_RUN|SKIPPED", "commands": ["npm run ..."], "passed": 0, "failed": 0, "summary": "" },
  "findings": [],
  "blockers": ["was dich gestoppt hat, sonst leer"]
}
<<<END_AGENT_RESULT>>>

Regeln fuer das Resultat:
- "changedFiles" muss vollstaendig sein. Nicht gelistete Aenderungen gelten als Verstoss.
- Keine Secrets, Tokens, Passwoerter oder API-Keys im Resultat.
- Wenn du eine Grenze nicht einhalten kannst: status "BLOCKED" mit Begruendung in "blockers", KEINE Notloesung.`;

const SAFETY_BOUNDARIES = `HARTE SICHERHEITSGRENZEN (nicht verhandelbar)
- Nur Dateien aus der Allowlist aendern. Alles andere: sofort stoppen.
- Nur Operationen aus der erlaubten Operationsliste ausfuehren.
- KEIN git commit, git push, git merge, git reset --hard, git checkout ., git clean, git stash.
- KEINE Pull Requests erstellen oder mergen.
- KEIN Shopify Write, keine Produktanlage, keine Preis-/SKU-/Variantenaenderung.
- KEIN Theme Publish, kein Preview Push, kein Live Publish.
- KEINE DNS-, Checkout-, Payment-, Shipping-Aenderungen.
- KEINE Secrets ausgeben, loggen oder in Dateien schreiben.
- Bestehende, nicht committete Aenderungen anderer niemals verwerfen oder ueberschreiben.
- Bei Unsicherheit: stoppen und melden, nicht raten.`;

function block(title, body) {
  const text = String(body ?? '').trim();
  return text ? `\n## ${title}\n${text}\n` : '';
}

function list(values, { empty = '(keine)' } = {}) {
  const entries = (Array.isArray(values) ? values : []).map(value => String(value).trim()).filter(Boolean);
  return entries.length ? entries.map(entry => `- ${entry}`).join('\n') : empty;
}

function findingsBlock(findings) {
  if (!Array.isArray(findings) || !findings.length) return '(keine)';
  return findings.map((finding, index) => [
    `${index + 1}. [${finding.priority}] ${finding.file}`,
    `   Problem: ${finding.problem}`,
    `   Grund: ${finding.reason}`,
    `   Empfohlener Fix: ${finding.recommendedFix}`,
  ].join('\n')).join('\n');
}

/**
 * Implementer: Aufgabe, Allowlist, Risk Class, Evidence, Grenzen, Tests, Format.
 */
export function buildImplementerPrompt({ task, route, allowedFiles, allowedOperations, evidence = '', testCommands = [], git = {} }) {
  return redactSecrets([
    '# ROLLE: IMPLEMENTER',
    'Du setzt genau eine abgegrenzte Aufgabe im lokalen Repository um. Du bist nicht der Reviewer.',
    block('AUFGABE', task),
    block('EINSTUFUNG', [
      `Task-ID: ${route?.taskId ?? '-'}`,
      `Task-Klasse: ${route?.taskClass ?? '-'} (${route?.executionMode ?? '-'})`,
      `Risk Class: ${route?.riskClass ?? '-'}`,
      `Human Gate erforderlich: ${route?.humanGateRequired ? 'JA' : 'NEIN'}`,
      `Shopify Write erforderlich: ${route?.shopifyWriteRequired ? 'JA - du fuehrst ihn NICHT aus, er ist gegated' : 'NEIN'}`,
    ].join('\n')),
    block('GIT', `Branch: ${git.branch ?? '-'}\nHEAD: ${git.head ?? '-'}`),
    block('ERLAUBTE DATEIEN (Allowlist)', list(allowedFiles)),
    block('ERLAUBTE OPERATIONEN', list(allowedOperations)),
    block('EVIDENCE / KONTEXT', evidence),
    block('AUSZUFUEHRENDE TESTS', list(testCommands, { empty: '(keine - dann tests.status = NOT_RUN)' })),
    block('SICHERHEIT', SAFETY_BOUNDARIES),
    block('ANTWORT', RESULT_CONTRACT),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim());
}

/**
 * Reviewer: Aufgabe, Implementer-Ergebnis, Diff, Tests, Regeln, P0/P1/P2.
 * Bekommt bewusst KEINEN Repo-Dump und keine Rohlogs.
 */
export function buildReviewerPrompt({ task, route, implementerSummary, diff = '', testReport = '', reviewRound = 1, maxReviewRounds = 3 }) {
  return redactSecrets([
    '# ROLLE: UNABHAENGIGER REVIEWER',
    'Du hast diesen Diff NICHT geschrieben. Du pruefst ihn unabhaengig. Du aenderst nichts.',
    block('AUFGABE (Soll)', task),
    block('EINSTUFUNG', [
      `Task-ID: ${route?.taskId ?? '-'}`,
      `Task-Klasse: ${route?.taskClass ?? '-'}`,
      `Review-Runde: ${reviewRound} von ${maxReviewRounds}`,
    ].join('\n')),
    block('IMPLEMENTER-ERGEBNIS', implementerSummary),
    block('DIFF', diff ? `\`\`\`diff\n${diff}\n\`\`\`` : '(kein Diff uebergeben)'),
    block('TESTREPORT', testReport),
    block('PRUEFREGELN', [
      'Prioritaeten:',
      '- P0 = Sicherheit, Datenverlust, Secret-Leak, Allowlist-Verstoss, kaputter Build, falsche Preis-/Produktlogik. P0 stoppt hart.',
      '- P1 = funktionaler Fehler oder Regression, muss korrigiert werden.',
      '- P2 = klarer Qualitaetsmangel mit konkretem Fix.',
      '- P3 = Hinweis, loest keine Korrektur aus.',
      '',
      'Pruefe insbesondere:',
      '- Erfuellt der Diff die Aufgabe vollstaendig und ohne Nebenwirkungen?',
      '- Wurden ausschliesslich Dateien aus der Allowlist geaendert?',
      '- Gibt es unbeabsichtigte Loeschungen, Massenaenderungen oder Binaerdateien?',
      '- Wurde eine Sicherheitsgrenze oder ein Human Gate umgangen?',
      '- Passen die Tests zur behaupteten Wirkung?',
      '',
      'Erfinde keine Findings. Kein Finding ohne konkreten, umsetzbaren Fix.',
      'Bei Sicherheitsverstoss: status "SECURITY_STOP".',
    ].join('\n')),
    block('ANTWORT', `${RESULT_CONTRACT}

Als Reviewer gilt zusaetzlich:
- "status": "PASS" wenn keine P0/P1/P2-Findings, sonst "FINDINGS".
- "changedFiles" bleibt leer (du aenderst nichts).
- Jedes Finding braucht ALLE Felder: priority, file, problem, reason, recommendedFix.`),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim());
}

/**
 * Corrector: Implementierung, Findings, ausschliesslich die zu korrigierenden
 * Punkte. Kein pauschaler Auftrag zur Gesamtoptimierung.
 */
export function buildCorrectionPrompt({ task, route, implementerSummary, findings, allowedFiles, allowedOperations, testCommands = [], reviewRound = 1, maxReviewRounds = 3 }) {
  return redactSecrets([
    '# ROLLE: CORRECTION-AGENT',
    'Du behebst AUSSCHLIESSLICH die unten gelisteten Findings. Nichts anderes.',
    block('URSPRUNGSAUFGABE (nur zur Orientierung)', task),
    block('EINSTUFUNG', [
      `Task-ID: ${route?.taskId ?? '-'}`,
      `Korrekturrunde: ${reviewRound} von ${maxReviewRounds}`,
    ].join('\n')),
    block('BISHERIGE IMPLEMENTIERUNG', implementerSummary),
    block('ZU KORRIGIERENDE FINDINGS', findingsBlock(findings)),
    block('ERLAUBTE DATEIEN (Allowlist)', list(allowedFiles)),
    block('ERLAUBTE OPERATIONEN', list(allowedOperations)),
    block('AUSZUFUEHRENDE TESTS', list(testCommands, { empty: '(keine - dann tests.status = NOT_RUN)' })),
    block('ABGRENZUNG', [
      'Verboten:',
      '- Refactorings, die kein Finding verlangt.',
      '- Umformatierungen unbeteiligter Dateien.',
      '- Neue Features oder "Verbesserungen" nebenbei.',
      '- Findings stillschweigend ignorieren. Wenn ein Finding fachlich falsch ist:',
      '  status "BLOCKED" mit Begruendung in "blockers", nicht einfach uebergehen.',
    ].join('\n')),
    block('SICHERHEIT', SAFETY_BOUNDARIES),
    block('ANTWORT', `${RESULT_CONTRACT}

Als Corrector gilt zusaetzlich:
- "changedFiles" und "actualOperations" beschreiben den Zustand NACH der Korrektur.`),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim());
}

export const PROMPT_INTERNALS = Object.freeze({ RESULT_CONTRACT, SAFETY_BOUNDARIES });
