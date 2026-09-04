# Remote-Session Error Handling

## Problem

Früher: Wenn ein jordanshop.de Import in Remote-Sessions (claude.ai/code) fehlschlug, blieb der Fehler undokumentiert. Der nächste Arbeiter/Kollege würde auf das gleiche Problem stoßen, ohne zu wissen, dass die Lösung "lokal arbeiten" ist.

## Lösung — 3 Komponenten

### 1. **Error Logger** (`automation/core/remote-session-error-handler.mjs`)
Speichert Remote-Session Fehler in der Datenbank:
```
automation/database/remote-session-errors.json
```

```mjs
import { logError } from '../core/remote-session-error-handler.mjs';

logError({
  errorId: 'JORDANSHOP_EGRESS_POLICY_BLOCKED',
  errorMessage: 'Egress-Policy blocks jordanshop.de',
  errorContext: { skill: 'teppichparadies-jordanshop-import' }
});
```

### 2. **Auto-GitHub-Issue** (`automation/scripts/create-remote-session-issue.mjs`)
Erstellt automatisch ein GitHub Issue, wenn:
- Eine Remote-Session läuft
- Ein bekannter Fehler in der Error-DB ist
- Noch kein Issue für diesen Fehler existiert

Titel: `Remote-Session: jordanshop.de Zugriff blockiert`
Labels: `type: external-limitation`, `area: jordanshop-import`, `priority: p2`

### 3. **Auto-Alarm** (`automation/scripts/remote-session-alert.mjs`)
Sendet einen `CRITICAL_BLOCKER` Notification, wenn der nächste Arbeiter die Session startet.

## Integration in SessionStart-Hook

Der SessionStart-Hook (`.claude/hooks/session-start.sh`) prüft jetzt automatisch:

```bash
# SessionStart Hook — zeigt Fehler und erstellt Issues
1. Prüft auf Remote-Session Fehler
2. Erstellt GitHub Issues wenn nötig
3. Warnt vor Egress-Policy Blockade
```

**Output bei jordanshop.de Fehler:**
```
  Remote-Session Fehler-Check:
  ✅ Issue #123 erstellt für: JORDANSHOP_EGRESS_POLICY_BLOCKED

  ⚠️  WARNUNG:
  jordanshop.de Import braucht Browser-Zugriff — funktioniert nur lokal.
```

## Warum war es nicht automatisch?

**Die alte Konfiguration hatte keine Integration für:**
1. **Agent-Fehler-Catching** — wenn ein Subagent fehlschlägt, gibt es keinen globalen Hook
2. **Remote-Session-Awareness** — der Fehler passiert im Agent, nicht im Hauptprozess
3. **Skill-Error-Handler** — der Skill `teppichparadies-jordanshop-import` hatte keinen Try-Catch für Egress-Policy

**Neue Implementierung behebt das:** SessionStart prüft jetzt proaktiv, statt reaktiv auf Fehler zu warten.

## Manuelle Fehler-Logging

Falls du manuell einen Remote-Session Fehler loggen willst:

```bash
cd /Pfad/zum/teppich-paradies-shopify-ai

# Fehler loggen
node -e "
import('./automation/core/remote-session-error-handler.mjs').then(mod => {
  mod.logError({
    errorId: 'JORDANSHOP_EGRESS_POLICY_BLOCKED',
    errorMessage: 'Agent failed: Egress-Policy blocked jordanshop.de',
    errorContext: { skill: 'teppichparadies-jordanshop-import', agentId: 'xxx' }
  });
});
"

# Alarm senden
node automation/scripts/remote-session-alert.mjs

# Issue erstellen/aktualisieren
node automation/scripts/create-remote-session-issue.mjs
```

## Bekannte Remote-Session Fehler

Definiert in `automation/core/remote-session-error-handler.mjs`:

| Error ID | Pattern | Lösung |
|---|---|---|
| `JORDANSHOP_EGRESS_POLICY_BLOCKED` | `Egress-Policy\|jordanshop\.de.*blocked` | Lokal arbeiten |

## Future: Weitere Fehler hinzufügen

Um einen neuen Fehler zu unterstützen:

```mjs
// Füge zu KNOWN_REMOTE_SESSION_ERRORS hinzu:
{
  id: 'MY_NEW_ERROR',
  pattern: /mein_fehlermuster/i,
  title: 'Beschreibung des Issues',
  description: `Markdown mit Details und Lösung`,
  labels: ['type: ...', 'area: ...'],
  severity: 'warning',
}
```

Die Automation erkennt den Fehler dann automatisch beim nächsten SessionStart.
