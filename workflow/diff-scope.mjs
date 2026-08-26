/**
 * Diff-Scoping: trennt Aenderungen eines konkreten Agentenlaufs von
 * Aenderungen, die vorher schon im Working Tree lagen.
 *
 * Hintergrund: Mit --allow-dirty laeuft ein Agent auf einem Working Tree, der
 * bereits nicht committete Aenderungen enthaelt. Ohne Scoping wuerden diese
 * fremden Aenderungen dem Agenten zugerechnet - der Reviewer wuerde sie
 * bewerten und der RiskGuard sie pruefen. Beides ist falsch.
 *
 * Vorgehen:
 * 1. Vor dem Agentenlauf einen Baseline-Snapshot aufnehmen (HEAD + Hash und
 *    Inhaltskopie jeder bereits geaenderten Datei).
 * 2. Nach dem Lauf den aktuellen Zustand erneut aufnehmen.
 * 3. Die Differenz beider Aufnahmen ist der agentenspezifische Delta-Diff.
 *
 * Der Working Tree wird dabei NIEMALS veraendert: kein stash, kein reset,
 * kein commit, kein checkout. Es werden ausschliesslich Kopien gelesen.
 *
 * Fail-safe: Alles, was sich nicht eindeutig dem Agentenlauf zuordnen laesst,
 * fuehrt zu einem Stop - niemals zu stiller Uebernahme.
 */

import { createHash } from 'node:crypto';
import { globMatches } from '../automation/core/risk-guard.mjs';

export const SCOPE_STATUS = Object.freeze({
  OK: 'OK',
  SECURITY_STOP: 'SECURITY_STOP',
  NEEDS_AHMET: 'NEEDS_AHMET',
});

/**
 * Pfade, die nie einem Agenten zugerechnet werden. Der Orchestrator selbst
 * schreibt hier waehrend des Laufs (State, Evidence, Baseline-Kopien).
 */
export const SCOPE_IGNORED = Object.freeze([
  '.workflow/**',
  '.git/**',
  'node_modules/**',
  'qa/evidence/local-verification.json',
]);

export function isIgnoredForScope(file, ignored = SCOPE_IGNORED) {
  return ignored.some(pattern => globMatches(file, pattern));
}

const normalize = value => String(value).replaceAll('\\', '/').replace(/^\.\//, '');

/**
 * Nimmt einen Baseline-Snapshot auf.
 *
 * @param {object} options
 * @param {string} options.head            aktueller HEAD-Commit
 * @param {Array<{path: string, hash: string|null}>} options.entries
 *        Alle aktuell nicht committeten Dateien mit Inhalts-Hash.
 *        hash === null bedeutet: geloescht.
 * @param {string} [options.runId]
 */
export function captureBaseline({ head, entries = [], runId = null, now = () => new Date().toISOString() }) {
  const files = {};
  for (const entry of entries) {
    const file = normalize(entry.path);
    if (isIgnoredForScope(file)) continue;
    files[file] = entry.hash ?? null;
  }
  return { schemaVersion: 1, runId, head, files, capturedAt: now() };
}

/**
 * Vergleicht Baseline und Ist-Zustand und ordnet jede Aenderung zu.
 *
 * @param {object} options
 * @param {object} options.baseline        Ergebnis von captureBaseline()
 * @param {string} options.head            HEAD nach dem Agentenlauf
 * @param {Array<{path: string, hash: string|null}>} options.entries Ist-Zustand
 * @param {string[]} options.allowedFiles  Allowlist des Tasks
 * @param {string[]} options.declaredFiles Vom Agenten gemeldete Dateien
 * @returns {{
 *   status: string, agentFiles: string[], preexistingUntouched: string[],
 *   undeclared: string[], outsideAllowlist: string[], phantom: string[],
 *   headMoved: boolean, reason: string|null, detail: string|null
 * }}
 */
export function classifyScope({ baseline, head, entries = [], allowedFiles = [], declaredFiles = [] }) {
  if (!baseline || typeof baseline !== 'object' || !baseline.files) {
    return {
      status: SCOPE_STATUS.NEEDS_AHMET, agentFiles: [], preexistingUntouched: [], undeclared: [],
      outsideAllowlist: [], phantom: [], headMoved: false, reason: 'NO_BASELINE',
      detail: 'Ohne Baseline laesst sich nicht feststellen, was der Agent geaendert hat.',
    };
  }

  const current = {};
  for (const entry of entries) {
    const file = normalize(entry.path);
    if (isIgnoredForScope(file)) continue;
    current[file] = entry.hash ?? null;
  }

  const headMoved = Boolean(baseline.head && head && baseline.head !== head);
  const declared = new Set(declaredFiles.map(normalize).filter(file => !isIgnoredForScope(file)));

  const changed = [];
  const preexistingUntouched = [];
  for (const file of new Set([...Object.keys(baseline.files), ...Object.keys(current)])) {
    const before = Object.hasOwn(baseline.files, file) ? baseline.files[file] : undefined;
    const after = Object.hasOwn(current, file) ? current[file] : undefined;
    if (before === after) {
      // War vorher schon geaendert und ist unveraendert geblieben:
      // gehoert eindeutig NICHT zum Agentenlauf.
      if (before !== undefined) preexistingUntouched.push(file);
      continue;
    }
    changed.push(file);
  }

  const outsideAllowlist = changed.filter(file => !allowedFiles.some(pattern => globMatches(file, pattern)));
  const undeclared = changed.filter(file => !outsideAllowlist.includes(file) && !declared.has(file));
  const agentFiles = changed.filter(file => !outsideAllowlist.includes(file) && declared.has(file));
  // Vom Agenten gemeldet, aber real nicht veraendert (z. B. wieder
  // zurueckgeaendert). Harmlos, wird nur berichtet.
  const phantom = [...declared].filter(file => !changed.includes(file));

  const sorted = list => [...new Set(list)].sort();
  const base = {
    agentFiles: sorted(agentFiles), preexistingUntouched: sorted(preexistingUntouched),
    undeclared: sorted(undeclared), outsideAllowlist: sorted(outsideAllowlist),
    phantom: sorted(phantom), headMoved,
  };

  // Reihenfolge der Pruefung: der haerteste Befund gewinnt.
  if (base.outsideAllowlist.length) {
    return {
      ...base, status: SCOPE_STATUS.SECURITY_STOP, reason: 'CHANGED_OUTSIDE_ALLOWLIST',
      detail: `Aenderungen ausserhalb der erlaubten Dateien: ${base.outsideAllowlist.join(', ')}`,
    };
  }
  if (headMoved) {
    return {
      ...base, status: SCOPE_STATUS.NEEDS_AHMET, reason: 'HEAD_MOVED_DURING_RUN',
      detail: `HEAD hat sich waehrend des Laufs von ${baseline.head} auf ${head} bewegt. Wahrscheinlich hat parallel jemand committet.`,
    };
  }
  if (base.undeclared.length) {
    return {
      ...base, status: SCOPE_STATUS.NEEDS_AHMET, reason: 'UNDECLARED_CHANGE',
      detail: `Diese Dateien haben sich veraendert, wurden vom Agenten aber nicht gemeldet: ${base.undeclared.join(', ')}. `
        + 'Das kann eine parallele Sitzung gewesen sein und wird nicht stillschweigend uebernommen.',
    };
  }
  return { ...base, status: SCOPE_STATUS.OK, reason: null, detail: null };
}

/** Stabiler Fingerprint ueber den agentenspezifischen Diff. */
export function fingerprintScope({ agentFiles = [], diff = '' }) {
  const hash = createHash('sha256');
  for (const file of [...agentFiles].sort()) hash.update(file).update('\0');
  hash.update('\0diff\0').update(String(diff ?? ''));
  return hash.digest('hex');
}

/** Kompakte Zusammenfassung fuer Reports und Klartextausgabe. */
export function summarizeScope(scope) {
  if (!scope) return 'kein Diff-Scoping aktiv';
  const parts = [`vom Agenten: ${scope.agentFiles.length}`];
  if (scope.preexistingUntouched.length) parts.push(`vorher vorhanden und unberuehrt: ${scope.preexistingUntouched.length}`);
  if (scope.undeclared.length) parts.push(`ungeklaert: ${scope.undeclared.length}`);
  if (scope.outsideAllowlist.length) parts.push(`ausserhalb der Allowlist: ${scope.outsideAllowlist.length}`);
  if (scope.phantom.length) parts.push(`gemeldet aber unveraendert: ${scope.phantom.length}`);
  return parts.join(', ');
}
