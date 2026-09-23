# Orchestrator Core Phase Report

GitHub Remote eingerichtet: JA

Remote privat bestätigt: JA

Erster Push erfolgreich: JA

SHP-004: PASS

SHP-005: PASS

Runner Tests: PASS – 7

Risk Guard Tests: PASS – 11

Hard-Stop Tests: PASS

Resume Test: PASS

Parked-Test: PASS

Needs-Ahmet-Test: PASS

Commits:

- `8c97ab95bb39b7b301dbfd036a50ee6ad0050dfe` – SHP-004 Manifest-/State-Runner
- `fc1a04b61f499dbb3f1a8f392387bf0da0b6ca74` – SHP-005 Deterministischer Risk Guard

Remote Push aktuell: JA

Live Theme verändert: NEIN

Dev Theme verändert: NEIN

Fallback verändert: NEIN

## GitHub

- Repository: `kontakt755/teppich-paradies-shopify-ai`
- Sichtbarkeit: PRIVATE
- Remote: `origin`
- Hauptbranch/Upstream: `main` / `origin/main`
- Pre-Push-Secret-Check: 0 Treffer; keine Secret-Inhalte ausgegeben

## SHP-004

Der domainneutrale Core verwaltet Manifest, Task- und Run-State, atomare Schreibvorgänge, exklusives Locking, Heartbeat, Resume und Dependency-Reihenfolge. `PASS`, `FAIL`, `PARKED`, `NEEDS_AHMET`, `SKIPPED_DEPENDENCY` und `BLOCKED` sind terminal; ein unterbrochenes `RUNNING` wird beim Resume kontrolliert neu eingeplant. Abgeschlossene und geparkte Tasks starten nicht erneut. State-/Heartbeat-Schreibfehler stoppen den Lauf.

## SHP-005

Die maschinenlesbare Shopify Risk Map liegt in `domains/shopify/risk-map.json`. Die Entscheidung ist deterministisch und verwendet deklarierte Operationen, tatsächliche Dateien/Pfade und geschützte Ressourcen. Jede Datei und Operation muss explizit erlaubt sein. Unbekannte Operationen, Allowlist-Verstöße sowie ein höheres tatsächliches Diff-Risiko erzeugen `HardStopError`. HIGH läuft nicht autonom und erzeugt `NEEDS_AHMET` sowie einen kompakten `needs-ahmet.md`-Eintrag. Unveröffentlichte Produktentwürfe bleiben ausdrücklich MEDIUM.

## Verifikation

Die 18 Core-Tests decken ab:

1. normaler LOW Task
2. normaler MEDIUM Task
3. HIGH → NEEDS_AHMET
4. fehlende Dependency
5. PARKED wird übersprungen
6. Resume nach Abbruch
7. Lock verhindert Doppelstart
8. Datei außerhalb Allowlist → HARD STOP
9. höher riskanter tatsächlicher Diff → HARD STOP
10. unbekannte Operation → HARD STOP
11. State-/Heartbeat-Schreibfehler → STOP
12. Roadmap Block Complete
13. geschützte Live-/Fallback-Ressourcen → HIGH/HARD STOP
14. unveröffentlichter Draft → MEDIUM

Empfohlener nächster Task: SHP-006
