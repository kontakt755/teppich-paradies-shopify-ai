// Modell-Gate (2026-09-14): erinnert daran, Klasse-A/B-Aufgaben an
// `npm run agents:loop` zu geben, statt sie in der laufenden interaktiven
// Sitzung mit dem Client-Default (Opus) zu erledigen.
//
// Warum das noetig ist: Die Klassifizierung laeuft laengst automatisch
// (openrouter-user-prompt.mjs schreibt taskClass in den Session-Zustand), aber
// nichts erzwang sie. Am 2026-09-14 liefen fuenf als Klasse B eingestufte
// Master-Aufgaben trotzdem vollstaendig auf Opus - 77 % des Tagesverbrauchs.
//
// Bewusst WARN und nicht DENY: Ein Hook, der Edit/Write hart blockiert, legt
// bei einem Fehlalarm die gesamte Arbeitsfaehigkeit lahm - auch bei einem
// dringenden Shopify-Fix. Erst beobachten, ob die Erkennung zuverlaessig
// zwischen echtem A/B-Fix und einem Teilschritt einer groesseren C/D-Aufgabe
// trennt; auf DENY umstellen kann nur der Nutzer bewusst.

export const GATE_OFF = 'off';
export const WARNED_CLASSES = Object.freeze(['A', 'B']);

export function modelGateMessage(taskClass) {
  return `Modell-Gate: Diese Aufgabe ist als Klasse ${taskClass} eingestuft (guenstiges Modell vorgesehen), `
    + 'laeuft aber in einer interaktiven Sitzung mit dem Client-Default. Guenstiger waere '
    + '`npm run agents:loop -- --task "<Text>"`, das die Klasse in ein Modell umsetzt. '
    + 'Nur ein Hinweis, nichts ist blockiert - abschalten mit TP_MODEL_GATE=off.';
}

// Reine Entscheidung ohne Datei- oder Prozesszugriff, damit sie testbar bleibt.
//
// agentLoopActive: laeuft dieser Aufruf schon INNERHALB von agents:loop
// (TP_AGENT_LOOP_ACTIVE=1)? Dann sitzt bereits das geroutete Modell am Werk
// und eine Erinnerung waere falsch.
// alreadyWarned: in dieser Sitzung wurde schon gewarnt - sonst haengt der
// Hinweis an jedem einzelnen Edit derselben Aufgabe.
// taskClass fehlt (null): Klasse A loescht ihren Session-Zustand, und nicht
// geroutete Prompts haben nie einen. Ohne belegte Klasse wird nicht gewarnt -
// lieber keine Erinnerung als eine falsche.
export function decideModelGate({ taskClass = null, agentLoopActive = false, gateSetting = null, alreadyWarned = false } = {}) {
  if (gateSetting === GATE_OFF) return { warn: false, reason: 'GATE_OFF' };
  if (agentLoopActive) return { warn: false, reason: 'AGENT_LOOP_ACTIVE' };
  if (alreadyWarned) return { warn: false, reason: 'ALREADY_WARNED' };
  if (!taskClass) return { warn: false, reason: 'NO_TASK_CLASS' };
  if (!WARNED_CLASSES.includes(taskClass)) return { warn: false, reason: 'CLASS_NEEDS_STRONG_MODEL' };
  return { warn: true, reason: 'CHEAP_CLASS_IN_INTERACTIVE_SESSION', message: modelGateMessage(taskClass) };
}
