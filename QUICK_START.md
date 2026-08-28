# Claude API Router: sichere Inbetriebnahme

## Architektur

`workflow/router.mjs` bleibt die einzige Quelle für die deterministische A/B/C/D-Klassifizierung. `router_api_migration.py` ist ausschließlich ein Ausführungsadapter und erhält die bereits bestimmte Klasse.

| Klasse | Ausführung |
|---|---|
| A | lokal/deterministisch, kein LLM |
| B | Haiku |
| C | Sonnet |
| D | Sonnet; Opus nur mit expliziter Eskalation |

Die Standardmodelle sind zentral per `CLAUDE_HAIKU_MODEL`, `CLAUDE_SONNET_MODEL` und `CLAUDE_OPUS_MODEL` überschreibbar. Keine Modell-ID muss im Code angepasst werden.

## Vor dem ersten API-Aufruf

1. Anthropic SDK installieren: `python3 -m pip install anthropic`
2. Key ausschließlich über die Prozessumgebung oder einen Secret Manager setzen. Den Key nie als CLI-Argument übergeben oder ausgeben.
3. Optionale Budgetgrenzen konfigurieren:

   - `CLAUDE_DAILY_WARNING_USD`
   - `CLAUDE_MONTHLY_WARNING_USD`
   - `CLAUDE_MONTHLY_HARD_LIMIT_USD`

4. Read-only Preflight ausführen: `./api_cost_check.sh`
5. Offline-Demo ausführen: `python3 demo_run.py`
6. Tests ausführen: `python3 -m unittest tests/test_api_router.py`

## Prompt Caching

Nur stabilen, wiederverwendbaren Kontext cachen: Projektregeln, unveränderte Tool-Schemas und einen versionierten Kontext-Pack. User-Task, Git-Diff, Zeitstempel und dynamische Tool-Ergebnisse gehören hinter den Cache-Breakpoint.

Der Adapter verwendet ausschließlich die sichere 5-Minuten-TTL, deren Write-Preis auch im Tracker abgebildet ist. Ein Cache-Hit muss anhand der tatsächlichen API-Usage-Felder validiert werden; ein Marker allein garantiert keinen Hit.

## Keine Produktionsfreigabe ohne Staging

Zuerst simulierte Fehler, Budget-Stop und Cache Write→Read testen. Danach eine begrenzte Staging-Stichprobe mit Console-Spend-Limit durchführen. Der bestehende Router bleibt bis zur dokumentierten Go/No-Go-Entscheidung der Rollback-Pfad.
