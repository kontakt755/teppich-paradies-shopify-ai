#!/bin/bash
# Hook: Reagiert auf Agent-Fehler und loggt Remote-Session Fehler automatisch
# Wird von Claude Code aufgerufen, wenn ein Agent fehlschlägt

set +e  # Fehler ignorieren, weiter machen

if [ -z "$CLAUDE_CODE_REMOTE" ] || [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0  # Nur in Remote-Sessions
fi

# Wenn der Fehler jordanshop.de oder "Egress-Policy" erwähnt, log es automatisch
ERROR_MESSAGE="${1:-}"

if echo "$ERROR_MESSAGE" | grep -qE "jordanshop|Egress-Policy|external.*blocked|403"; then
  cd "${CLAUDE_PROJECT_DIR:-.}"

  # Schreibe den Fehler in die Fehler-Datenbank
  node -e "
    import('./automation/core/remote-session-error-handler.mjs').then(mod => {
      mod.logError({
        errorId: 'JORDANSHOP_EGRESS_POLICY_BLOCKED',
        errorMessage: '$ERROR_MESSAGE',
        errorContext: {
          agentFailed: true,
          autoDetected: true,
        }
      });
      console.log('✓ Fehler geloggt für Auto-Issue-Erstellung');
    });
  " 2>/dev/null || true

  # Alarmsystem
  node automation/scripts/remote-session-alert.mjs 2>/dev/null || true

  # GitHub Issue erstellen
  node automation/scripts/create-remote-session-issue.mjs 2>/dev/null || true
fi

exit 0
