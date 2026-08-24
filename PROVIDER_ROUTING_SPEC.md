# Provider Routing Specification

Version: 1.0

**Implementierungsstand (Stand: Audit 2026-08):** Dieses Dokument beschreibt Zielarchitektur. Verdrahtet und produktiv aktiv ist heute nur die Task-Klassifizierung (`workflow/router.mjs`), deren Ausgabe `IMPLEMENTER`/`REVIEWER`/`REVIEW_REQUIRED` als Textempfehlung für Menschen ausgibt (`AGENTS.md`: „Der Router empfiehlt Rollen, startet aber keine externen Agenten und ruft keine Modell-API auf.“). Der hier beschriebene automatische Providerwechsel-Ablauf, die Versuchszähler-Automatik und der Reviewer-Trigger-Mechanismus laufen als getestete, aber unverdrahtete Module unter `automation/core/` (`provider-handoff.mjs`, `review-cycle.mjs`) — kein Skript und keine CI-Pipeline ruft sie derzeit auf.

## 1. Grundsatz

Routing erfolgt regelbasiert und wird später anhand echter Laufdaten kalibriert. Codex und Claude Code arbeiten nicht standardmäßig parallel am selben Task. Der Autor eines Diffs ist nicht der unabhängige Reviewer dieses Diffs.

## 2. Standardrouting

| Task-Typ | Erster Worker | Alternative | Review |
|---|---|---|---|
| Strategie/Priorisierung | ChatGPT Chat | – | Ahmet entscheidet |
| lange Analyse, Research, Tabelle, Context Pack | ChatGPT Work | ChatGPT Chat | bei Geschäftsanomalie |
| isolierter Code-/Script-Task | Codex | Claude Code | nur bei Trigger |
| dateiübergreifende technische Aufgabe | Codex oder Claude Code nach Erfolgsdaten | jeweils anderer Provider | anomaliegetriggert |
| unabhängiger Code-Review | anderer Provider als Autor | stärkeres Diagnosemodell | nur bei Trigger |
| deterministisch prüfbare Arbeit | Tool zuerst | Worker nur für Interpretation | normalerweise keiner |

Claude Code wird ab Verfügbarkeit als echter zweiter Provider registriert, nicht als simultaner Standard-Reviewer.

Für explizit reviewpflichtige Merge-/Implementierungsaufgaben ist der sequenzielle Zielablauf: implementierender Provider → anderer Provider als Reviewer → bei strukturierten P1/P2-Findings Correction-Provider → unabhängiger Review. Der Core begrenzt dies auf drei Review-Runden; danach folgt `REVIEW_LIMIT_REACHED` statt eines weiteren Agentenaufrufs. Der Provider-Adapter, der reale Claude-/Codex-Sessions startet, ist noch nicht Teil des Core-Piloten.

## 3. Auswahlalgorithmus

1. Kann ein deterministisches Tool die Aufgabe vollständig lösen? Dann kein Modell.
2. Filter nach Domain-Capability und zulässigem Risiko.
3. Filter nach aktueller Verfügbarkeit und Taskgröße.
4. Wähle die niedrigste ausreichende Modellklasse.
5. Nutze historische Erfolgsrate, Medianlaufzeit und Retryrate erst ab ausreichender Stichprobe.
6. Protokolliere Entscheidung und tatsächliches Ergebnis.

Keine erfundenen Quota-Prozentwerte. Ein Limit wird nur als beobachtetes Providerereignis protokolliert.

## 4. Providerwechsel

Vor dem Wechsel zwingend:

1. Task-State und kompakten Fehlerbericht speichern.
2. Relevanten Diff als Diagnoseartefakt sichern.
3. Working Tree auf den sauberen Task-Ausgangspunkt zurücksetzen.
4. Verifizieren, dass keine fremden Teiländerungen verbleiben.
5. Frische Session starten.
6. Nur Context Pack, Fehlerpaket und kleine Evidenz übergeben.
7. Providerwechsel benachrichtigen.

Der neue Provider arbeitet nie auf halbfertigem Code des vorherigen Workers weiter.

## 5. Versuchszähler

- LOW: maximal 2 Implementierungsversuche insgesamt.
- MEDIUM: maximal 3 Implementierungsversuche insgesamt.
- Diagnose zählt nicht als Implementierungsversuch und darf keine Produktivänderung schreiben.
- Nach ausgeschöpften Versuchen: `PARKED` und Eintrag in `parked-tasks.md`.

Empfohlene MEDIUM-Folge:

```text
Versuch 1: Worker A
FAIL -> sichern, reset, frische Session
Versuch 2: Worker A oder anderer Provider nach Fehlerklasse
FAIL -> sichern, reset, Providerwechsel
Versuch 3: Worker B
FAIL -> Diagnose durch stärkeres Modell
weiter ungelöst -> PARKED
```

## 6. Reviewer-Trigger

Kein Reviewer nach normalem LOW + QA PASS. Unabhängiger Review nur bei mindestens einem Trigger:

- Diff wesentlich über Erwartung oder Budget
- MEDIUM berührt mehr als drei Dateien
- dieselbe zentrale Datei in mehreren aufeinanderfolgenden Tasks
- unbekannte Datei, Löschung oder Strukturänderung im Diff
- Worker meldet Unsicherheit
- Tests passen nicht zur beobachteten Shopwirkung
- Security-/Preis-/Checkout-Nähe trotz formal niedrigerem Task

Reviewer liest nur Context Pack, Diffstat, relevanten Diff und gefilterte Prüfevidenz.

Reviewer-Findings müssen `priority`, `file`, `problem`, `reason` und `recommendedFix` enthalten. Der Correction-Worker erhält primär diese Findings und keinen pauschalen Auftrag zur Gesamtoptimierung.

## 7. Telemetrie

Pro Modelllauf: Provider, Modell, Task-ID, Rollenart, Start/Ende, Laufzeit, Anzahl Modellaufrufe, Status, Retry, Providerwechsel, Reviewtrigger und Diagnose. Nach mehreren Läufen werden Routingregeln versioniert angepasst; Rohprompts und Secrets werden nicht als Telemetrie gespeichert.
