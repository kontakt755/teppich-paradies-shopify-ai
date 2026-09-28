// Sitzungsmodell aus der Matrix (#670). workflow:route soll das Modell der
// Matrix fuer die laufende Sitzung setzen. Geprueft am 2026-09-26:
// - Desktop-App: set_session_model / set_session_effort (ccd_session_mgmt)
//   verweigern ausdruecklich die eigene Sitzung ("a session must not silently
//   re-price its own turns"); ein Kindprozess wie workflow/cli.mjs hat gar
//   keinen Zugriff. Der Wechsel geht nur ueber das Modellmenue.
// - Terminal-CLI: nur der Nutzer per /model bzw. /effort.
// Deshalb Rueckfall auf eine maschinenlesbare Ausgabe mit genau einer
// Handlungsanweisung; ohne Sitzung (CI, Skript) nur die Ausgabe.

export function sitzungsZugriff(env = process.env) {
  if (env.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop' && env.CLAUDE_CODE_HOST_SESSION_ID) return 'desktop';
  if (env.CLAUDECODE === '1') return 'cli';
  return 'keiner';
}

export function sessionModelDirective(plan, env = process.env) {
  const step = plan?.primary;
  const zugriff = sitzungsZugriff(env);
  if (!step || step.provider !== 'CLAUDE' || !step.model) {
    return { zugriff, model: null, effort: null, gesetzt: false, lines: ['SESSION_MODEL: - (Implementer ist kein Claude-Modell)'] };
  }
  const { model, effort = null } = step;
  const ziel = `${model}${effort ? `/${effort}` : ''}`;
  const aktuellerEffort = env.CLAUDE_EFFORT || null;
  const lines = [`SESSION_MODEL: ${ziel}`];
  if (zugriff === 'desktop') {
    lines.push(`SESSION_MODEL_ACTION: Modellmenue der Desktop-App auf ${model}${effort ? `, Effort ${effort}` : ''} stellen (eigene Sitzung laesst sich per Tool nicht umstellen)${aktuellerEffort && effort && aktuellerEffort !== effort ? `; aktueller Effort ${aktuellerEffort}` : ''}. Der Wechsel gilt ab der naechsten Runde.`);
  } else if (zugriff === 'cli') {
    lines.push(`SESSION_MODEL_ACTION: /model ${model}${effort ? ` und /effort ${effort}` : ''} im Terminal eingeben.`);
  } else {
    lines.push('SESSION_MODEL_ACTION: - (keine Sitzung, nur Ausgabe)');
  }
  return { zugriff, model, effort, gesetzt: false, lines };
}
