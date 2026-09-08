# Teppich Paradies Control Center („Teppich Dashboard")

Gemeinsamer Arbeitsplatz für Geschäftsführung, Mitarbeitende und KI-Agenten. Beantwortet:
Was ist der Zustand? Was ist heute wichtig? Was ist blockiert und wer löst es? Wer arbeitet woran?
Welche Freigaben fehlen? Was wurde verändert?

Öffentlich (read-only): https://kontakt755.github.io/teppich-paradies-shopify-ai/ai-dashboard/
Lokal mit Aktionen: `npm run dashboard` → http://localhost:8001

Konzept, Statusmodell, Datenhoheit: [`docs/control-center/`](../control-center/) (Bestandsaufnahme,
Architektur, Changelog).

## Eine Wahrheit: GitHub Issues

Es gibt keinen zweiten Aufgabenspeicher. Status, Priorität, Bereich sind Labels, der Owner ist der
Assignee, alles Weitere sind Abschnitte im Issue-Body:

| Abschnitt im Body | Wird zu |
|---|---|
| `## Ziel` (auch Problem/Aufgabe/Auftrag) | Ziel / Warum |
| `## Akzeptanzkriterien` mit `- [ ]` (auch Soll-Zustand, Checkliste; Checkboxen ohne Überschrift zählen) | Definition of Done |
| `## Nächster Schritt` oder `Nächster Schritt: …` | nächster Schritt |
| `## Worker` / `## Ausführender` | Ausführende:r (Mensch oder KI) |
| `## Frist` / `Fällig: 30.09.2026` | Fälligkeit (ISO, deutsch, KW) |
| `## Blocker` oder `## Status` mit „Warte auf …" | Blocker-Grund |
| `## Abhängigkeiten` (#12, SHP-014) | Abhängigkeiten |
| `## Frage`, `## Optionen`, `## Empfehlung`, `## Entscheider` | Entscheidungsvorlage (Template „Entscheidung") |

Status-Labels und Mapping: siehe `docs/control-center/ARCHITEKTUR.md`. Bis die neuen Labels angelegt
sind (`setup-dashboard.sh`), gilt: `status:blockiert` + `reviewer:mensch` = Warten auf Freigabe.

## Betriebsarten

| | statisch (Pages, PWA) | lokal (`npm run dashboard`) |
|---|---|---|
| Datenquelle | `issues.json` (Workflow `dashboard-data`) | `issues.json`, auf Wunsch frisch über `gh` |
| Aktionen | keine – Links nach GitHub | Statuswechsel, Owner, Kommentar, Freigabe über `gh` |
| Verlauf | Zeitpunkte aus `issues.json` | Issue-Events und Kommentare |
| KI-Läufe | nicht sichtbar | Steuerzentrale + Provider-Ledger, read-only |

Das Frontend erkennt die Betriebsart über `GET /api/capabilities`.

## Dateien

```
docs/ai-dashboard/
  index.html, app.js, app.css   Oberfläche (kein Build, keine Abhängigkeiten)
  lib/model.mjs                 Regeln: Status, Body-Parser, Dringlichkeit, Übergänge – Browser UND Server
  issues.json                   generierte Daten (Schema 2), nie von Hand ändern
  tests/                        node --test (npm run dashboard:test)
scripts/build-dashboard-data.mjs  erzeugt issues.json (lokal und in Actions)
scripts/serve-dashboard.mjs       lokaler Server + /api
scripts/dashboard-api.mjs         Aktions-API (gh), serverseitige Validierung
```

## Datenfluss

```
GitHub Issues ──(Issue-Event, stündlich)──> .github/workflows/dashboard-data.yml
   │                                              │
   │                                    scripts/build-dashboard-data.mjs
   │                                              ▼
   │                                  docs/ai-dashboard/issues.json  (Commit nach main)
   │                                              │
   └──(lokal: gh, nach jeder Aktion)──────────────┴──> index.html / app.js
```

Der Browser braucht keinen Token. Der Workflow nutzt den kurzlebigen `GITHUB_TOKEN` (issues: read).
Lokal läuft alles über das im Keychain angemeldete `gh`-Konto; jede Aktion ist damit auf GitHub
auditierbar (Kommentar `## Control Center: …`) und zusätzlich in `.router/control-center-audit.jsonl`.

## Sicherheitsgrenzen

- Kein Token im Frontend, in `issues.json` liegen keine Issue-Bodies, nur extrahierte Felder.
- Server bindet nur `127.0.0.1`; schreibende Endpunkte nur POST + JSON + lokaler Origin.
- Übergänge werden serverseitig geprüft (Owner für In Arbeit, Grund für Blockiert, Bestätigung für Erledigt).
- Keine Schreibzugriffe auf Shopify, Google oder andere Systeme – nur Labels, Assignee, Kommentare in GitHub.
- Das Repository ist öffentlich: keine Kundendaten, Umsätze oder Zugangsdaten in Issues.

## Tastatur

`⌘K` / `Ctrl+K` / `/` Suche und Befehle · `j` / `k` Zeile wählen · `Enter` öffnen · `Esc` schließen.

## Häufige Fragen

**Der Datenstand ist alt.** „Systemgesundheit" zeigt den letzten Lauf des Sync-Workflows. War er
erfolgreich, hat sich seitdem einfach nichts geändert. Lokal: „Jetzt synchronisieren".

**Eine Aufgabe fehlt.** Sie braucht mindestens ein `status:`-, `type:`-, `priority:`-, `area:`- oder
`reviewer:`-Label.

**Warum „Triage nötig"?** Priorität, Owner, nächster Schritt, Bereich oder Blocker-Grund fehlen. Das
Control Center füllt nichts still auf – die Lücke ist die Arbeit.
