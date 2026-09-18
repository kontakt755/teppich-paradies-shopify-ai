# Verbrauchsmessung Phase 0 — Baseline

Startdatum: 2026-09-18 · Aufgabe: #361 · Vergleich folgt in Phase 3, sobald 5 vollstaendige Aufgabenzeilen vorliegen.

## So wird gemessen

- Eine Zeile je Session, Werte aus `/cost` am Ende der Session. Nur Sessions, die nach dem
  Pull von `main` (CLAUDE.md 19,9 KB) neu gestartet wurden.
- **Startkontext = Spalte Cache-Write.** Das ist, was beim ersten Prompt einmal in den Cache
  geschrieben wird (Systemprompt, CLAUDE.md, Tool-Schemata der MCP-Server). Cache-Read waechst
  mit jeder Runde und sagt nichts ueber die Groesse des Startkontexts.
- **Input-Tokens** in `/cost` sind nur der unkachierte Anteil. Kleine Zahl = Caching greift.
- Kosten je Session ≈ Runden (Requests) × Kontext je Runde. Beide Hebel zaehlen.
- Wochenprozent aus *Einstellungen → Nutzung*, einmal pro Tag reicht.
- Phase 3 filtert nach **Modell**, nicht nach Klasse — die Klasse ist die Einstufung des
  Auftrags, das Modell das, was tatsaechlich lief.

## Verbrauch nach Session

| Datum | Mac | Klasse | Modell | Aufgabe (kurz) | Requests | Input-Tokens | Output-Tokens | Cache-Read | Cache-Write | Dauer | Nutzung Woche % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-09-11…2026-09-18 | kontakt755@teppich | — | Gemini (47), GPT-5.6-sol (20), Sonnet (9), andere (1) | Router-Anteil seit 2026-09-11 (Ledger) | 77 | — | — | — | — | — | — |
| 2026-09-18 | kontakt755@teppich | A | Haiku 4.5 | Phase-0-Setup (Startkontext: Cache-Write) | 1 | 134 | 37 | 1.2M | 44k | 1m | 1% |
| 2026-09-18 | Mac-mini-von-Ahmet.local | A | Haiku 4.5 | Phase-0-Setup (Startkontext: Cache-Write) | 1 | 50 | 10 | 399.6k | 45.2k | — | <0.1% |
| 2026-09-18 | kontakt755@teppich | B | Haiku 4.5 | Teppichrechner: Kostenaufteilung entfernen | 1 | — | — | 1.7M | 68.7k | 2m | 7% |
| 2026-09-18 | kontakt755@teppich | B | Haiku 4.5 | Teppich-Produktseite UI/UX Redesign | 272 | 991 | 45.8k | 15.6M | 367.8k | 17m | — |
| 2026-09-18 | Mac-mini-von-Ahmet | D | Opus 5 | Zuschnitt-Attribute an Warenkorbzeilen binden (#363), Vorschau + Live, Live-Test — **ohne /cost, nicht vergleichbar** | — | — | — | — | — | 25m | — |

## Ledger-Quelle (Router-/Codex-Anteil)

```
.router/ai-usage.jsonl — 77 Aufrufe (seit 2026-09-11)
Letzter Aufruf vor Reparatur: 2026-09-11T20:15:05.793Z (GEMINI_FREE/gemini-3.5-flash-lite)
```

Das Ledger erfasst nur Router-/Codex-Aufrufe (Gemini-Voranalyse, OpenRouter-Review), nicht die
interaktive Claude-Code-Session. Diese Provider melden keine Cache-Felder; die Nullen dort sagen
nichts ueber das Caching in Claude Code.

## Zwischenbefunde (Stand 2026-09-18)

- **Startkontext auf beiden Macs gleich: rund 45k Tokens.** CLAUDE.md (19,9 KB ≈ 5k Tokens)
  ist davon nur etwa ein Zehntel. Der Rest sind Systemprompt und die Tool-Schemata der
  eingebundenen MCP-Server. Naechster Messpunkt: eine Session mit deaktivierten MCP-Servern,
  die das Projekt nicht braucht (alles ausser Shopify und GitHub), Cache-Write vergleichen.
- **Runden treiben den Verbrauch:** PDP-Redesign mit 272 Requests in 17 Minuten, rund 57k
  Tokens Cache-Read je Runde. Cache-Trefferquote 97,7 % — das Caching selbst ist nicht das Problem.
- Zeilen 4 und 5 liefen als Klasse B auf Haiku; die Matrix sieht fuer B Fable vor. Fuer den
  Vergleich nach Modell filtern.

## Notizen

- Modell-Breakdown im Ledger zeigt Router-Einsatz ueber Gemini (Voranalyse), Codex (Review), Subscription-Modelle
- **2026-09-18**: Router repariert, stale Review-Lauf entfernt, Voranalyse wieder aktiv
