# SHP-009 – First Supervised Test Plan

Status: **VORBEREITET, NICHT AUSGEFÜHRT**

Human Gate: **JA**
Zeitbox des späteren Tests: 45 Minuten

## Harte Voraussetzungen

- Ahmet beaufsichtigt den vollständigen Lauf und gibt den Start ausdrücklich frei.
- SHP-002 bis SHP-008 sind PASS; Git-Arbeitsbaum und Task-Ausgangspunkt sind sauber.
- Live `201829679438` und Fallback `196301750606` werden nur read-only geprüft. Fehler werden ausschließlich lokal durch Fixtures simuliert.
- Claude Code ist authentifiziert und separat verfügbar. Ohne Claude wird TEST 4 nicht gestartet.
- Vor jedem Szenario: Lock frei, State gesichert, Secret Gate PASS.

## Pflichtszenarien

1. **Normaler LOW Task:** `LOW_PASS`-Fixture ausführen. Erwartet: genau ein Versuch, Diff/Risk/Secret/QA PASS, Task `PASS`, keine Task-PASS-Benachrichtigung.
2. **QA absichtlich rot:** lokale `QA_RED`-Fixture nutzen. Erwartet: Task `FAIL`, kompakte QA-Evidenz, kein weiterer abhängiger Task.
3. **Allowlist-Verstoß:** Fixture meldet eine Datei außerhalb `ALLOWED_FILES`. Erwartet: `HARD_STOP`, State `STOPPED`, wichtige Benachrichtigung, keine Datei wird angewendet.
4. **Codex → Claude:** nur simulierten Task verwenden. Erwartet: State, Fehler- und Diff-Zusammenfassung zuerst sichern; sauberer Task-Ausgangspunkt verifiziert; neue Claude-Session erhält nur Context Pack, Fehlerbericht und notwendige Evidenz. Niemals halbfertigen Codex-Working-Tree übergeben.
5. **Mehrfaches Scheitern:** Fixture dreimal gemäß Risk-/Attempt-Regel fehlschlagen lassen. Erwartet: `PARKED`; Resume nimmt den Task nicht erneut auf.

## Zusätzliche Abnahmezeilen

- `NEEDS_AHMET`: HIGH-Fixture wird nicht ausgeführt und korrekt geschrieben/benachrichtigt.
- ntfy und lokaler Sound: genau einmal je wichtigem Testevent; normale PASS-Tasks still. Empfang manuell bestätigen.
- State/Locking: atomare Dateien, zweiter Runner blockiert, Lock nach sauberem Ende entfernt.
- Resume: unterbrochenes `RUNNING` wird einmalig fortgesetzt; terminale/geparkte Tasks bleiben unangetastet.
- Restore: ausschließlich lokalen Fixture-Ausgangspunkt wiederherstellen; Hash vor/nach identisch.
- Diff Guard, Risk Guard und Secret Gate: bestehende Unit-Tests plus Szenario-Evidenz PASS.
- Abschluss: `npm.cmd run qa`, alle Automation-Tests, `git diff --check`, Secret Gate und sauberer Working Tree.

Jede Zeile wird später mit Zeitstempel, Operator, Ergebnis und kleinem Evidenzpfad abgezeichnet. Kein echter Providerwechsel und keine Shop-Beschädigung sind Teil der Vorbereitung.
