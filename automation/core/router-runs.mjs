// Bewertet .router/agent-runs und den Stop-Hook fuer router:status.
// Hintergrund 2026-09-09: 24 von 26 Laufordnern waren leer, weil der Stop-Hook
// ohne "timeout" nach 60 s gekillt wurde. Ein leerer Ordner ist aber nicht
// automatisch ein aktueller Fehler: er kann ein gerade laufendes Review sein
// oder ein historischer Abbruch von vor der Reparatur. Die Diagnose trennt das.
export const REVIEW_TIMEOUT_MS = 15 * 60_000;
export const STOP_HOOK_COMMAND_MARKER = 'codex-stop-review.mjs';

// runs: [{ name, files: string[], mtimeMs }]
export function assessAgentRuns({ runs = [], now = Date.now(), reviewTimeoutMs = REVIEW_TIMEOUT_MS, repairedAtMs = null } = {}) {
  const result = { total: runs.length, reviewed: 0, failed: 0, running: 0, aborted: 0, abortedSinceRepair: 0, abortedNames: [] };
  for (const run of runs) {
    const files = run.files ?? [];
    if (files.includes('codex-review.json') || files.includes('claude-review.json')) { result.reviewed += 1; continue; }
    if (files.includes('review-error.txt')) { result.failed += 1; continue; }
    if (files.length > 0) continue; // fremde Inhalte, kein Review-Lauf
    const age = now - Number(run.mtimeMs ?? 0);
    if (age < reviewTimeoutMs) { result.running += 1; continue; }
    result.aborted += 1;
    result.abortedNames.push(run.name);
    if (repairedAtMs != null && Number(run.mtimeMs ?? 0) > repairedAtMs) result.abortedSinceRepair += 1;
  }
  return result;
}

// Liest das konfigurierte Timeout des Stop-Hooks aus settings.json (Sekunden).
// Fehlt es, gilt der Claude-Code-Default von 60 s.
export function stopHookTimeout(settings, { reviewTimeoutMs = REVIEW_TIMEOUT_MS, marker = STOP_HOOK_COMMAND_MARKER } = {}) {
  const groups = settings?.hooks?.Stop ?? [];
  const hooks = groups.flatMap(group => group?.hooks ?? []);
  const hook = hooks.find(entry => String(entry?.command ?? '').includes(marker));
  if (!hook) return { present: false, configured: null, effectiveSeconds: null, sufficient: false };
  const configured = Number.isFinite(Number(hook.timeout)) && hook.timeout != null ? Number(hook.timeout) : null;
  const effectiveSeconds = configured ?? 60;
  return { present: true, configured, effectiveSeconds, sufficient: effectiveSeconds * 1000 >= reviewTimeoutMs };
}

// Fasst beides zu Meldungen zusammen: ein aktuelles Problem nur, wenn das Timeout
// unzureichend ist oder seit der Reparatur weiterhin Laeufe abbrechen.
export function diagnoseRouterRuns({ assessment, timeout }) {
  const problems = [];
  const notes = [];
  if (timeout.present && !timeout.sufficient) {
    problems.push(`Stop-Hook-Timeout ist ${timeout.configured == null ? 'nicht gesetzt (Claude-Code-Default 60 s)' : `${timeout.configured} s`}; ein Codex-Review braucht bis zu ${Math.round(REVIEW_TIMEOUT_MS / 60000)} min. "timeout" in .claude/settings.json setzen, sonst wird das Review vor dem Ergebnis gekillt.`);
  }
  if (assessment.abortedSinceRepair > 0) {
    problems.push(`${assessment.abortedSinceRepair} Review-Laeufe ohne Ergebnis seit dem gesetzten Timeout: die Ursache ist nicht mehr das Timeout. review-error.txt fehlt ebenfalls, also wurde der Hook von aussen beendet.`);
  } else if (assessment.aborted > 0) {
    notes.push(`${assessment.aborted} historische Laeufe ohne Ergebnis (vor der Timeout-Reparatur); kein aktueller Fehler.`);
  }
  if (assessment.running > 0) notes.push(`${assessment.running} Lauf/Laeufe noch offen (juenger als das Review-Timeout).`);
  return { problems, notes };
}
