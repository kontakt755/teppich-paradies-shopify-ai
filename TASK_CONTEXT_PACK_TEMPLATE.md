# Task Context Pack Template

Ein Pack gehört genau zu einem Task und einer frischen Worker-Session. Nicht benötigte Felder werden entfernt; Secrets, Rohlogs, vollständige HTML-Dumps und Gesamtprojektberichte sind verboten.

```yaml
TASK_ID: SHP-000
DOMAIN: shopify
RISK: LOW
TITLE: Kurzer eindeutiger Titel
GOAL: >-
  Ein konkret prüfbares Ergebnis in höchstens drei Sätzen.

ALLOWED_FILES:
  - exact/path/file.ext
  - allowed/directory/**

ALLOWED_OPERATIONS:
  - read
  - edit_existing_file
  - create_report

DIFF_BUDGET:
  MAX_FILES: 2
  MAX_CHANGED_LINES: 80

ACCEPTANCE_CRITERIA:
  - Messbares Kriterium 1
  - Messbares Kriterium 2

FORBIDDEN:
  - live_theme_push
  - theme_publish
  - product_write
  - secret_read

DEPENDENCIES:
  - SHP-000

RELEVANT_CONTEXT:
  facts:
    - Nur unmittelbar relevante, belegte Fakten
  files:
    - path/to/relevant/file.ext
  evidence:
    - Kurzer gefilterter Befund; maximal etwa 30 relevante Logzeilen

QA_COMMANDS:
  - deterministic command --scoped

EXPECTED_OUTPUTS:
  - path/to/output

HUMAN_GATE: false

REVIEW:
  REQUIRED: true
  REVIEW_ROUND: 1
  MAX_REVIEW_ROUNDS: 3
  AUTHOR_PROVIDER: claude
  REVIEW_PROVIDER: codex
```

## Strukturierte Reviewer-Findings

```yaml
FINDINGS:
  - priority: P1
    file: path/to/file.ext
    problem: Konkreter reproduzierbarer Befund
    reason: Technische oder fachliche Auswirkung
    recommendedFix: Eng begrenzte Korrektur
```

P0 führt zu `HARD_FAIL` beziehungsweise bei Secret-/Security-Ursache zu `SECURITY_STOP`. P1/P2 führen zu `CORRECTION_REQUIRED`; nach `MAX_REVIEW_ROUNDS` wird `REVIEW_LIMIT_REACHED` gespeichert und kein weiterer Agent gestartet.

## Worker-Regeln im Pack

```text
- Eine Session, ein Task; innerhalb des Tasks nicht clearen.
- Vor Änderungen Preflight-Risiko und sauberen Task-Start prüfen.
- Nur ALLOWED_FILES und ALLOWED_OPERATIONS verwenden.
- Nach jedem Schreibblock Diff Guard ausführen.
- Bei höherem tatsächlichem Risiko, Allowlist-Verstoß oder Secret: HARD STOP.
- Keine Veröffentlichung, wenn nicht als separate HIGH-Operation genehmigt.
- Abschluss: Status, Diffstat, Tests, kompakte Evidenz, offene echte Punkte.
```

## Fehlerpaket für Retry/Providerwechsel

```yaml
TASK_ID: SHP-000
ATTEMPT: 1
PROVIDER: codex
FAILURE_CLASS: assertion|tooling|environment|unknown
FIRST_RELEVANT_ASSERTION: "..."
URL: "..."
FILE: "..."
LINE: 0
RELEVANT_LOG: |
  Höchstens etwa 30 relevante Zeilen.
DIFF_SAVED_AT: path/to/artifact.diff
WORKTREE_RESTORED_TO: commit-or-snapshot
EVIDENCE_FILES:
  - small/result.json
```

Der neue Provider erhält dieses Fehlerpaket plus das ursprüngliche Context Pack, nicht die alte Session.
