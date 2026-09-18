# Verbrauchsmessung Phase 0 — Baseline

Startdatum: 2026-09-18 · Mac: kontakt755@teppich (main) · Phase: Leer-Session / Startkontext

## Verbrauch nach Tag

| Datum | Mac | Klasse | Modell | Aufgabe (kurz) | Requests | Input-Tokens | Output-Tokens | Cache-Read | Cache-Write | Dauer | Nutzung Woche % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-09-18 | kontakt755@teppich | Leer-Session / Startkontext | Gemini (47), GPT-5.6-sol (20), Sonnet (9), andere (1) | Phase-0-Setup | 77 | 71.315* | — | 0 | 0 | — | 0% |

## Ledger-Quelle

```
.router/ai-usage.jsonl — 77 Aufrufe (seit 2026-09-11)
Letzter Aufruf: 2026-09-11T20:15:05.793Z (GEMINI_FREE/gemini-3.5-flash-lite)
```

## Notizen

- Token-Daten in der Ledger nicht verfügbar (nur Request-Count)
- Modell-Breakdown zeigt Router-Einsatz über Gemini (Voranalyse), Codex (Review), Subscription-Modelle
- Cache-Metriken: 0 gelesen, 0 geschrieben → noch nicht aktiv
- Baseline gilt als Referenzmessung; genaue Token pro Aufgabe folgen in Phase 1
