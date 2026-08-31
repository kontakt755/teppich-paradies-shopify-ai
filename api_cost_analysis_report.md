# Claude API: Kostenmodell und Grenzen

## Status

Frühere Aussagen wie `$5.29/Monat`, `73.6 % Einsparung`, „unlimited“ oder „produktionsbereit“ sind keine belastbaren Aussagen und wurden entfernt.

## Abrechnung

Jeder erfolgreiche Request wird getrennt erfasst:

- reguläre Input-Tokens
- Output-Tokens
- Cache-Creation-Tokens
- Cache-Read-Tokens
- Modell, A/B/C/D-Klasse, Request-ID und Attempt
- Erfolg oder Fehler

Kosten basieren auf den Usage-Feldern der API-Antwort. Cache Writes und Cache Reads sind keine regulären Input-Tokens und werden separat abgerechnet. Die Preiskonfiguration ist zentral in `api_cost_monitor.py` und über Umgebungsvariablen überschreibbar.

## Was eine Prognose benötigt

Eine seriöse Monatsprognose benötigt echte Staging-Telemetrie für:

- Anzahl und Mix von A/B/C/D-Aufgaben
- Input-, Output- und Thinking-Tokens je Klasse
- Cache-Write- und Cache-Read-Rate innerhalb der TTL
- Retry-Rate und Opus-Eskalationen

Bis diese Daten vorliegen, sind Simulationen nur illustrative Planungswerte. Sie dürfen nicht gegen ein Chat-Abo gerechnet werden, als wären beide Workloads identisch.

## Budgetschutz

Das Projekt unterstützt konfigurierbare Tages- und Monatswarnungen sowie ein Monats-Hard-Limit. Zusätzlich muss in der Anthropic Console ein organisatorisches Spend-Limit gesetzt werden. Bei einem Hard-Limit wird kein weiterer LLM-Request gestartet.
