# Teppich Paradies AI Orchestrator – Master Specification

Version: 1.0  
Status: Core-Pilot teilweise implementiert; Provider-Adapter und produktive Agentenanbindung bleiben Zielarchitektur
Pilot-Domain: Shopify

## 1. Zweck und Grenzen

Das System führt klar freigegebene, reversible Unternehmensaufgaben kontrolliert aus. Es ersetzt keine geschäftliche Verantwortung und startet keine offene „Unternehmensautomatisierung“. Shopify ist der erste Domain Pack; der Core enthält keine Shopify-Regeln.

Nichtziele der ersten Ausbaustufe:

- keine autonome Veröffentlichung
- keine autonomen Preis-, Zahlungs-, Kunden- oder Bestandsänderungen
- keine Ads- oder Bestellaktionen
- kein Zugriff auf Secrets im Modellkontext
- keine unbeschränkte Task-Erzeugung während eines Laufs

## 2. Architektur

```text
Startmanifest + Budgets
          |
          v
CORE ORCHESTRATOR
  Manifest | State | Scheduler | Audit Log | Notification Policy
          |
          v
DOMAIN PACK
  risk-map | capabilities | gates | checks | worker preferences
          |
          v
TASK CONTEXT PACK
          |
          v
DETERMINISTIC RISK CHECK + ALLOWLIST + DIFF BUDGET
          |
          v
WORKER ROUTER --> Codex | Claude Code | ChatGPT Work
          |
          v
DETERMINISTIC CHECKS
          |
          +--> REVIEW --> PASS
          |       |
          |       +--> CORRECT --> REVIEW (maximal 3 Review-Runden)
          +--> REVIEW_LIMIT_REACHED / HUMAN GATE
          +--> PARKED
          +--> SKIPPED_DEPENDENCY
          +--> NEEDS_AHMET
```

ChatGPT Chat liegt oberhalb dieses Laufes: Strategie, Priorisierung, Interpretation und neue größere Ziele. Es ist kein unbeaufsichtigter Dateiarbeiter.

## 3. Core-Komponenten

### 3.1 Manifest Loader

Liest ein unveränderliches Startmanifest mit Task-IDs, Domain, erlaubtem Risiko, Abhängigkeiten, Budgets und Abbruchgrenzen. Neue Tasks dürfen während eines Laufs nur als Vorschläge entstehen; sie werden nicht automatisch in das aktive Manifest aufgenommen.

### 3.2 State Store

Persistiert pro Task mindestens:

- Status: `PENDING`, `RUNNING`, `IMPLEMENT`, `REVIEW`, `REVIEW_FINDINGS`, `CORRECTION_REQUIRED`, `CORRECT`, `PASS`, `REVIEW_LIMIT_REACHED`, `PARKED`, `SKIPPED_DEPENDENCY`, `NEEDS_AHMET`, `HARD_FAIL`, `SECURITY_STOP`
- Task-Start-Commit oder Snapshot
- Provider, Modell, Session-ID
- Versuchszähler und Diagnosezähler getrennt
- erlaubtes und tatsächliches Risiko
- Diffstat, Testresultate und kompakte Evidenz
- Startzeit, Ende, Laufzeit und Modellaufrufe

Schreibvorgänge erfolgen atomar über temporäre Datei plus Rename. Ein Lock verhindert zwei Worker auf demselben Working Tree.

### 3.3 Risk Engine

Wertet deterministisch Domain-Regeln, Pfade, Operationstypen und Datenklassen aus. Es gilt immer die höchste gefundene Risikoklasse. Vor dem Worker erfolgt ein Preflight; nach jeder Änderung ein Diff-/Operation-Audit. Ein höheres tatsächliches als erlaubtes Risiko erzeugt `HARD_STOP`.

### 3.4 Worker Router

Wählt anhand von Task-Art, Provider-Verfügbarkeit, vergangenen Ergebnissen und Kostenstufe. Derselbe Task läuft nie gleichzeitig bei Codex und Claude Code. Ein notwendiger unabhängiger Review wird nicht durch den schreibenden Worker durchgeführt.

### 3.5 Deterministic Check Runner

Führt kleine, domainabhängige Prüfketten aus. Rohlogs bleiben als Artefakt lokal; das Modell erhält nur gefilterte Fehlerauszüge. PASS ist nur möglich, wenn alle Pflichtprüfungen Exit 0 beziehungsweise den definierten Erwartungswert erreichen.

### 3.6 Diff Guard

Prüft nach jedem Schreibschritt:

- ausschließlich `ALLOWED_FILES`
- `MAX_FILES`
- `MAX_CHANGED_LINES`
- verbotene Dateitypen und Datenklassen
- Secret-Scan
- unerwartete Löschungen, Binärdateien oder Massenänderungen

Außerhalb der Allowlist gilt immer `HARD_STOP`. Budgetüberschreitung führt bei LOW zu Review/Stop gemäß Domain-Regel, bei MEDIUM mindestens zu unabhängigem Review und ohne ausdrückliche Freigabe nicht zu weiterer Implementierung.

### 3.7 Notification Adapter

Ein generisches Event-System ruft den vorhandenen ntfy-/Windows-Notifier nur auf bei:

- Lauf vollständig beendet
- `HARD_STOP`
- Allowlist-Verstoß
- Providerwechsel
- HIGH/`NEEDS_AHMET`
- schwerer technischer Blocker

Normale PASS-Ereignisse bleiben still.

## 4. Rollenmodell

| Rolle | Primäre Verantwortung | Darf schreiben? |
|---|---|---|
| ChatGPT Chat | Strategie, Priorität, Entscheidungen, Ergebnisinterpretation | nur auf ausdrücklichen Auftrag |
| ChatGPT Work | lange Analysen, Recherche, Tabellen, Reports, Context Packs | Arbeitsunterlagen, keine operative Produktion ohne Freigabe |
| Codex | Code, Scripts, Theme, mechanische technische Arbeit | innerhalb Task-Allowlist |
| Claude Code | zweiter Worker, Provider-Fallback, dateiübergreifende Aufgaben, unabhängiger Review | innerhalb Task-Allowlist; nicht parallel zum selben Task |
| Deterministische Tools | Suche, Validierung, QA, Browser, Schema, Git, Diff, Secrets | nur klar definierte mechanische Operationen |

## 5. Domain-Pack-Vertrag

Jeder Ordner `domains/<domain>/` enthält später mindestens:

```text
domain.yaml
risk-map.yaml
operations.yaml
human-gates.yaml
checks.yaml
worker-routing.yaml
context-sources.yaml
templates/
```

Der Core kennt nur dieses Schema, nicht Shopify, Lexware oder SumUp. Domain Packs dürfen Regeln verschärfen, aber globale Sicherheitsregeln nicht abschwächen.

## 6. Datenfluss und Kontextminimierung

1. Deterministische Inventarisierung erzeugt eine kleine Evidenzdatei.
2. Context Builder nimmt nur explizit relevante Abschnitte auf.
3. Secret- und personenbezogene Daten werden vor Modellübergabe blockiert oder redigiert.
4. Worker erhält genau ein Task Context Pack.
5. Rohlogs, HTML-Dumps und API-Antworten bleiben außerhalb des Prompts.
6. Der Abschluss wird als strukturierte Task Summary gespeichert.

Eine Session entspricht genau einem Task. Innerhalb des Tasks wird nicht gecleart; unabhängige Tasks starten frische Sessions.

## 7. Status- und Übergangsregeln

```text
PENDING -> RUNNING -> IMPLEMENT -> REVIEW -> PASS
                                      -> REVIEW_FINDINGS -> CORRECTION_REQUIRED -> CORRECT -> REVIEW
                                      -> REVIEW_LIMIT_REACHED (Human Gate)
                                      -> HARD_FAIL / SECURITY_STOP
                  -> PARKED
                  -> NEEDS_AHMET
PENDING -> SKIPPED_DEPENDENCY
```

Der Core implementiert hierfür `reviewRound` und `maxReviewRounds` (Default `3`). Runde 3 kann noch reviewen, ruft bei verbleibenden P1/P2-Findings aber keinen weiteren Correction-Agenten auf. Findings besitzen zwingend `priority`, `file`, `problem`, `reason` und `recommendedFix`. P0 sowie Security-/Datenverlustbefunde stoppen hart; P1/P2 wechseln in `CORRECTION_REQUIRED`.

Ein geparkter Task bleibt in späteren Läufen gesperrt, bis Ahmet oder ein genehmigtes neues Manifest ihn ausdrücklich reaktiviert.

## 8. ROADMAP BLOCK COMPLETE

Ein Roadmap Block ist exakt dann vollständig, wenn jeder im Startmanifest enthaltene LOW-/MEDIUM-Task einen der Status `PASS`, `PARKED`, `SKIPPED_DEPENDENCY` oder `NEEDS_AHMET` besitzt. Es existiert kein `RUNNING` oder `PENDING`. `REVIEW_LIMIT_REACHED` und `CORRECTION_REQUIRED` beenden die automatische Schleife, markieren den Roadmap Block aber bis zur menschlichen Entscheidung nicht als vollständig. HIGH-Tasks dürfen nicht Teil eines autonomen Startblocks sein.

## 9. Observability und Budgetdaten

Pro Lauf und Task werden Provider, Modell, Task-ID, Startzeit, Laufzeit, Modellaufrufe, Ergebnis, Versuche, Providerwechsel, Reviews und Eskalationen geloggt. Es werden keine Quotenprozente geschätzt. Routing wird erst nach mehreren realen Läufen anhand Erfolgsrate, Medianlaufzeit, Retryrate und Kostenklasse angepasst.

Reihenfolge der Ressourcennutzung:

1. deterministisches Tool
2. günstiges geeignetes Modell
3. normales Modell
4. Premium-/Diagnosemodell

## 10. Plattform- und Repository-Grundlagen

- privates Git-Repository
- `.gitattributes`: `* text=auto eol=lf`
- plattformneutrale Node-Scripts; Windows-Aufruf über `.cmd` nur am Shell-Rand
- `.gitignore` für `.env`, Auth-/Sessiondaten, temporäre Browserprofile, Reports mit sensiblen Daten, Build-/QA-Artefakte
- Formatter-, JSON-/YAML- und Theme-Checks vor Commit
- gitleaks oder gleichwertiger Secret-Scan vor jedem Push
- Restore-Probe auf unveröffentlichtem Dev Theme vor dem ersten autonomen Langlauf

## 11. Pilot-Abnahmekriterien

Der Core-Pilot ist bereit, wenn der beaufsichtigte Testplan alle fünf absichtlichen Szenarien besteht, Task-State nach Prozessabbruch fortsetzbar ist, Restore funktioniert, kein Allowlist-Verstoß committed wird, Notifications korrekt gefiltert sind und kein Theme-Publish ohne menschliches Gate möglich ist.
