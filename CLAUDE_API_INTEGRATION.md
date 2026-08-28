# Integrationsvertrag

1. Eine aufrufende Komponente klassifiziert eine Aufgabe mit `workflow/router.mjs`.
2. Für Klasse A führt sie die lokale/deterministische Aktion aus.
3. Für B/C/D ruft sie `ClaudeExecutionAdapter.route_request()` mit `task_class` und einem echten, statischen Kontext-Pack auf.
4. Der Adapter schreibt die tatsächliche API-Usage atomar in SQLite.
5. Fehler werden mit Typ und Attempt, aber ohne Key oder Prompt-Inhalt geloggt.

Der Adapter liest keine Repository-Dateien selbst und erzeugt keinen Mock-Kontext. Dadurch bleibt die bestehende Routerlogik maßgeblich und Kontext kann vor dem API-Aufruf bewusst versioniert, gekürzt und auf Cache-Tauglichkeit geprüft werden.

## Explizite Opus-Eskalation

`escalate_to_opus=True` darf nur nach einer dokumentierten Hard-Escalation gesetzt werden. Ein Budget-Hard-Limit gewinnt immer gegen eine Eskalation.

## Nicht enthalten

Der Adapter ersetzt weder Codex noch Claude Code als interaktive Entwicklungsumgebung und startet keine Tools, Shell-Kommandos oder Shopify-Aktionen. Diese Trennung ist absichtlich.
