/**
 * Klartext-Uebersetzung fuer die CLI-Ausgabe.
 *
 * Reine Darstellungsschicht. Die maschinenlesbaren Zeilen (STOP:, TASK_ID:,
 * NEXT_ALLOWED_ACTION: ...) bleiben unveraendert erhalten, damit Scripting,
 * Tests und CI weiter funktionieren. Der Klartext kommt zusaetzlich dazu.
 *
 * Regeln fuer die Texte hier:
 * - Ein bis zwei kurze Saetze.
 * - Zuerst: ist es schlimm oder harmlos.
 * - Keine Fachbegriffe ohne Erklaerung in Klammern.
 * - Nichts beschoenigen.
 */

/** Wie ernst ist ein Stop? Steuert nur die einleitende Einordnung. */
export const SEVERITY = Object.freeze({
  OK: 'OK',            // alles gut
  WAITING: 'WAITING',  // wartet auf eine Entscheidung von Ahmet
  EXTERNAL: 'EXTERNAL', // von aussen blockiert, nicht Ahmets Fehler
  BROKEN: 'BROKEN',    // etwas ist kaputt oder unsicher
});

const SEVERITY_PREFIX = Object.freeze({
  OK: 'Alles gut.',
  WAITING: 'Das musst du entscheiden.',
  EXTERNAL: 'Das ist nicht dein Fehler.',
  BROKEN: 'Da stimmt etwas nicht.',
});

const STOP_TEXT = Object.freeze({
  DONE: [SEVERITY.OK,
    'Fertig. Die Arbeit ist umgesetzt und geprueft. Veroeffentlichen musst du selbst anstossen.'],
  HUMAN_GATE: [SEVERITY.WAITING,
    'Der naechste Schritt ist geschuetzt (zum Beispiel etwas in den Shop schreiben oder veroeffentlichen). Ich halte hier absichtlich an.'],
  NEEDS_AHMET: [SEVERITY.WAITING,
    'Diese Aufgabe darf nicht automatisch laufen. Sie braucht deine Entscheidung.'],
  SECURITY_STOP: [SEVERITY.BROKEN,
    'Gestoppt aus Sicherheitsgruenden: es sollte etwas geaendert werden, das nicht erlaubt ist. Durchgelassen wurde nichts.'],
  HARD_FAIL: [SEVERITY.BROKEN,
    'Die Arbeit ist fehlgeschlagen. Es gibt einen echten Fehler, der behoben werden muss.'],
  REVIEW_LIMIT_REACHED: [SEVERITY.WAITING,
    'Drei Korrekturrunden haben nicht gereicht. Ich hoere bewusst auf, statt endlos weiterzumachen.'],
  CORRECTION_REQUIRED: [SEVERITY.WAITING,
    'Bei der Pruefung kamen Beanstandungen heraus, die noch niemand korrigiert hat.'],
  PROVIDER_UNAVAILABLE: [SEVERITY.EXTERNAL,
    'Das KI-Programm laesst sich nicht starten. Es ist nicht installiert oder nicht auffindbar.'],
  PROVIDER_AUTH_REQUIRED: [SEVERITY.WAITING,
    'Das KI-Programm ist nicht angemeldet. Du musst dich dort einmal einloggen.'],
  RATE_LIMITED: [SEVERITY.EXTERNAL,
    'Der Anbieter hat gebremst, weil zu viele Anfragen kamen. Das geht von selbst vorbei. Ich wechsle absichtlich nicht heimlich auf ein anderes Programm.'],
  BLOCKED_EXTERNAL: [SEVERITY.EXTERNAL,
    'Ein Dienst von aussen hat blockiert oder war nicht erreichbar.'],
  NEEDS_LOCAL_RUNNER: [SEVERITY.WAITING,
    'Diese Pruefung braucht deinen Mac mit echtem Browser. In der Cloud geht sie nicht.'],
  NEEDS_DETERMINISTIC_SCRIPT: [SEVERITY.WAITING,
    'Der naechste Schritt ist ein ganz normales Programm, keine KI. Das kostet nichts und muss nur gestartet werden.'],
  DIRTY_WORKTREE: [SEVERITY.WAITING,
    'Du hast ungespeicherte Aenderungen im Projekt. Ich lasse keinen Agenten darauf los, damit nichts davon verloren geht.'],
  STALE_STATE: [SEVERITY.WAITING,
    'Der gespeicherte Stand passt nicht mehr zum Projekt. Ich mache nicht auf gut Glueck weiter.'],
  RUN_LOCKED: [SEVERITY.WAITING,
    'Es laeuft bereits ein anderer Durchlauf. Zwei gleichzeitig sind nicht erlaubt.'],
  MANUAL_STOP: [SEVERITY.OK,
    'Du hast Stopp gesagt. Ich habe angehalten.'],
  MAX_ITERATIONS: [SEVERITY.WAITING,
    'Ich habe die maximale Zahl an Schritten erreicht und aufgehoert. Das ist der Schutz gegen Endlosschleifen.'],
  NO_TASK: [SEVERITY.WAITING,
    'Es gibt noch keine Aufgabe. Sag mir zuerst, was gemacht werden soll.'],
  NO_PROGRESS: [SEVERITY.WAITING,
    'Es ging nicht mehr voran: derselbe Schritt kam mehrfach ohne Ergebnis. Ich hoere auf, statt im Kreis zu laufen.'],
  UNKNOWN_BLOCKER: [SEVERITY.BROKEN,
    'Die Ursache ist unklar. Ich rate nicht und mache nicht weiter.'],
});

const ACTION_TEXT = Object.freeze({
  ROUTE_TASK: 'Zuerst muss eine Aufgabe festgelegt werden.',
  HANDOFF_IMPLEMENTER: 'Als Naechstes soll ein KI-Agent die eigentliche Arbeit machen.',
  HANDOFF_REVIEWER: 'Als Naechstes soll ein zweiter Agent die Arbeit unabhaengig pruefen.',
  RUN_STATIC_VALIDATION: 'Als Naechstes laufen die schnellen Pruefungen (ohne Browser).',
  USE_LOCAL_MAC_RUNNER: 'Als Naechstes laufen die vollen Pruefungen auf deinem Mac.',
  RETRY_SCRIPT_LATER: 'Spaeter noch einmal versuchen. Jetzt bringt es nichts.',
  STOP_HUMAN_GATE: 'Anhalten. Ohne deine Freigabe geht es nicht weiter.',
  STOP_UNKNOWN_BLOCKER: 'Anhalten, weil die Ursache unklar ist.',
  PREPARE_DRAFT_PR: 'Die Arbeit ist fertig. Ein Aenderungsvorschlag koennte erstellt werden - das machst du selbst.',
});

const VALIDATION_TEXT = Object.freeze({
  PASS: 'Pruefungen bestanden',
  FAIL: 'Pruefungen fehlgeschlagen',
  NOT_RUN: 'noch nicht geprueft',
  STALE_OR_NOT_RUN: 'Pruefung ist veraltet oder lief nie',
  DRY_RUN: 'nur Trockenlauf, nichts echt geprueft',
});

const REVIEW_TEXT = Object.freeze({
  NOT_REQUIRED: 'kein zweiter Blick noetig',
  REQUIRED: 'zweiter Blick steht noch aus',
  PASS: 'zweiter Blick erledigt, ohne Beanstandung',
});

const GATE_TEXT = Object.freeze({
  REQUIRED_FOR_PROTECTED_ACTION: 'Fuer den letzten Schritt brauchst du eine ausdrueckliche Freigabe',
  NOT_REQUIRED: 'keine Freigabe noetig',
  ROUTE_TASK: 'noch keine Aufgabe festgelegt',
});

const PROVIDER_TEXT = Object.freeze({
  AVAILABLE: 'einsatzbereit',
  UNAVAILABLE: 'nicht gefunden oder nicht installiert',
  AUTH_REQUIRED: 'installiert, aber nicht angemeldet',
  RATE_LIMITED: 'gerade gebremst',
  FAILED: 'Pruefung fehlgeschlagen',
});

const CLASS_TEXT = Object.freeze({
  A: 'mechanisch - laeuft ohne KI',
  B: 'normale Code-Aufgabe',
  C: 'komplex - mit unabhaengiger Pruefung',
  D: 'kritisch - mit Pruefung und Freigabe durch dich',
});

/** @returns {{severity: string, text: string}} */
export function explainStop(reason) {
  const [severity, text] = STOP_TEXT[reason] ?? [SEVERITY.BROKEN, 'Unbekannter Grund. Bitte melden.'];
  return { severity, text: `${SEVERITY_PREFIX[severity]} ${text}` };
}

export function explainAction(action) {
  return ACTION_TEXT[action] ?? null;
}

export function explainValidation(status) {
  return VALIDATION_TEXT[status] ?? null;
}

export function explainReview(status) {
  return REVIEW_TEXT[status] ?? null;
}

export function explainGate(gate) {
  return GATE_TEXT[gate] ?? null;
}

export function explainProvider(status) {
  return PROVIDER_TEXT[status] ?? null;
}

export function explainTaskClass(taskClass) {
  return CLASS_TEXT[taskClass] ?? null;
}

/**
 * Kurze Zusammenfassung des Gesamtzustands in einem Satz.
 * Bewusst nur aus den bereits abgeleiteten Feldern - keine eigene Logik.
 */
export function explainState(state) {
  if (!state?.taskId) return 'Es laeuft gerade keine Aufgabe.';
  const parts = [];
  const validation = explainValidation(state.validationStatus);
  if (validation) parts.push(validation);
  if (state.reviewRequired) {
    const review = explainReview(state.reviewStatus);
    if (review) parts.push(review);
  }
  const gate = explainGate(state.humanGate);
  if (gate) parts.push(gate);
  const action = explainAction(state.nextAllowedAction);
  const summary = parts.length ? `Stand: ${parts.join('; ')}.` : '';
  return action ? `${summary} ${action}`.trim() : summary;
}
