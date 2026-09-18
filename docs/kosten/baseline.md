# Verbrauchsmessung Phase 0 — Baseline

Startdatum: 2026-09-18 · Mac: kontakt755@teppich (main) · Phase: Leer-Session / Startkontext

## Verbrauch nach Tag

| Datum | Mac | Klasse | Modell | Aufgabe (kurz) | Requests | Input-Tokens | Output-Tokens | Cache-Read | Cache-Write | Dauer | Nutzung Woche % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-09-11…2026-09-18 | kontakt755@teppich | — | Gemini (47), GPT-5.6-sol (20), Sonnet (9), andere (1) | Router-Anteil seit 2026-09-11 (Ledger) | 77 | — | — | 0 | 0 | — | — |
| 2026-09-18 | kontakt755@teppich | A | Haiku 4.5 | Leer-Session / Startkontext | 1 | 134 | 37 | 1.2M | 44k | 1m | 1% |
| 2026-09-18 | Mac-mini-von-Ahmet.local | A | Haiku 4.5 | Leer-Session / Startkontext | 1 | 50 | 10 | 399.6k | 45.2k | — | <0.1% |
| 2026-09-18 | kontakt755@teppich | B | Haiku 4.5 | Teppichrechner: Kostenaufteilung entfernen | 1 | — | — | 1.7M | 68.7k | 2m | 7% |
| 2026-09-18 | kontakt755@teppich | B | Haiku 4.5 | Teppich-Produktseite UI/UX Redesign | 272 | 991 | 45.8k | 15.6M | 367.8k | 17m | — |
| 2026-09-18 | Mac-mini-von-Ahmet | D | Opus 5 | Zuschnitt-Attribute an Warenkorbzeilen binden (#363), Vorschau + Live, Live-Test | — | — | — | — | — | 25m | — |

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
- **2026-09-18**: Router repariert, stale Review-Lauf entfernt, Voranalyse wieder aktiv
