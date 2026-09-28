---
name: ai-orchestrator
description: Router und Orchestrator verstehen und reparieren - Klassen A-D, Modellmatrix, workflow:state/next/continue, Voranalyse-Hook, Codex-Stop-Review, Prompt-Caching, Gedaechtnis-Sync, Context Mode. Verwenden, wenn das Codex-Review fremde Arbeit anmahnt, jemand behauptet der Router laufe nicht, bei Aenderungen an workflow/router.mjs, model-matrix.mjs oder .claude/hooks/.
---

# AI-Orchestrator

Ausgelagert aus CLAUDE.md (#670).

## AI-Orchestrator

- `workflow/router.mjs` — einzige Quelle fuer die Klassifikation A/B/C/D
- `workflow/core.mjs` — Zustandsautomat, Manifest-Laden, Risk-Engine
- `router_api_migration.py` — Python-Adapter fuer Claude-API-Aufrufe
- `api_cost_monitor.py` — Budget und Rate-Limits

Klassen und Modelle kommen aus **einer** Quelle, `workflow/model-matrix.mjs`
(Prioritaet Qualitaet vor Kosten):
**A** trivial → `haiku` low, kein Modell-Review ·
**B** normale Entwicklung → `fable` medium, Review Codex `gpt-5.6-sol` ·
**C** komplex → `fable` high, Review Codex `gpt-6-astra`, Zweitblick `gpt-5.6-sol` ·
**D** kritisch → `opus` high, Review Codex `gpt-6-astra` xhigh, Security-Review `fable`.
Corrector ist immer das Implementer-Modell; die Eskalationsleiter geht nur nach
oben. Haiku ist ein Werkzeug fuer Klasse A und Voranalysen, nie Hauptentwickler.
Rollback: `TP_ROUTING_STRATEGY=legacy`. Der Python-Adapter liest
`CLAUDE_HAIKU_MODEL`, `CLAUDE_FABLE_MODEL`, `CLAUDE_OPUS_MODEL` — keine IDs hart verdrahten.

**Ein Modell pro Session.** Der Prompt-Cache ist modellgebunden; jeder Wechsel
mitten in der Session laedt den gesamten Kontext zum vollen Preis neu. Modell am
Anfang ueber `workflow:route` waehlen, Session nach der Aufgabe schliessen.

Zustaende: `PENDING → RUNNING → IMPLEMENT → REVIEW → PASS`, daneben
`CORRECTION_REQUIRED`, `PARKED`, `SKIPPED_DEPENDENCY`, `NEEDS_AHMET`,
`HARD_FAIL`, `SECURITY_STOP`. Blocker aus `workflow:state`: `RATE_LIMIT`,
`UPSTREAM`, `CODE_DEFECT`, `UNKNOWN_BLOCKER`.

```
npm run workflow:state     # Klassifikationen und Blocker
npm run workflow:next      # naechste zulaessige Aufgabe
npm run workflow:continue  # nach menschlichem Eingriff weiter
```

### Laeuft der Router gerade?

`npm run router:status` antwortet mit Belegen. Die Voranalyse haengt am
`UserPromptSubmit`-Hook, das Codex-Review am `Stop`-Hook (`.claude/settings.json`).
Genau zwei Laufzeit-Belege, keine weiteren: `.router/ai-usage.jsonl` (jeder
Provider-Aufruf) und `.router/manifest-run/`. **In einem Worktree fehlt das
alles** — `.router/` ist gitignored. → `docs/lessons/router-belege.md`

### Wenn das Codex-Review fremde Arbeit anmahnt

**Zuerst nachsehen, welchen Diff es gelesen hat:**

```
git -C <hauptcheckout> log --oneline -1
git diff --name-only origin/main..<eigener-branch>
```

Der Pruefbereich sind nur die Pfade, die die eigene Sitzung geschrieben hat
(`.router/claude-writes/`, Hooks `record-session-write.mjs` und
`record-bash-write.mjs`); Massstab ist `.router/claude-handoffs/<TASK-ID>.review.md`.
Die Hooks laufen immer aus dem Hauptcheckout (`CLAUDE_PROJECT_DIR`) — steht
der auf einem alten Branch, laeuft alte Logik. Liegt das Ergebnis als gemergter
Commit vor, zeigt `<TASK-ID>.ergebnis.json` (`{ commit, basis, pr }`) darauf;
angenommen nur, wenn von `origin/*` erreichbar.

**Empfohlene Korrekturen niemals blind ausfuehren** — „fremde Commits
herausloesen" oder „ungetrackte Dateien aufraeumen" zerstoert die Arbeit
anderer Sitzungen. Nach drei Runden `REVIEW_LIMIT_REACHED`: Befunde berichten,
aufhoeren. → `docs/lessons/codex-review-pruefbereich.md`

### Prompt-Caching

Nur stabilen, wiederverwendbaren Kontext cachen (Projektregeln, Tool-Schemata,
versionierte Context-Packs). Aufgabe, Diffs, Zeitstempel und dynamische
Tool-Ergebnisse gehoeren **hinter** den Cache-Breakpoint. Cache-Treffer ueber
die tatsaechlichen `usage`-Felder pruefen, nicht ueber Marker. API-Key nur ueber
Umgebungsvariable oder Secret-Manager. Vor dem ersten Aufruf `./api_cost_check.sh`
(read-only) und `python3 demo_run.py` (offline).

## Gedaechtnis auf mehreren Macs (#665)

Claudes Gedaechtnis-Ordner (`~/.claude/projects/<projekt>/memory`) ist ein
Checkout des **privaten** Repos `tp-claude-gedaechtnis`. `gedaechtnis-sync.sh`
zieht beim Sitzungsstart und schiebt beim Stop; ohne `.git` oder Netz tut er
still nichts. Obsidian oeffnet denselben Ordner als Vault. Neuer Mac:
`git clone git@github.com:<konto>/tp-claude-gedaechtnis.git <pfad>/memory`.
Das Repo bleibt privat - es enthaelt Lieferanten-Interna. Zweiter Speicher
verboten: dauerhafte Erkenntnisse gehoeren nach `docs/lessons/`, nicht doppelt.

## Context Mode (grosse Ausgaben aus dem Kontext halten)

`.mcp.json` bindet Context Mode **nur als MCP-Server** ein, Version gepinnt,
**ohne** das Plugin mit seinen Hooks (das faengt Bash/`curl` ab und umgeht die
Hook-Sperren). Fuer Ausgaben ueber ~50 Zeilen (lange Logs, `git log --stat`,
Testlaeufe, Bulk-JSON) `ctx_execute` / `ctx_batch_execute` mit `intent` nutzen;
kurze Befehle, Git-Schreibbefehle und Deploys bleiben im Bash-Tool.
`.claude/hooks/context-mode-guard.mjs` schickt jeden Shell-Befehl darin durch
`git-gh-guard` und `theme-delete-guard`, erlaubt nur shell/javascript/typescript/python
und verbietet Prozessstarts ausserhalb von `shell`. **Nie** `/plugin install
context-mode` und kein `ctx_upgrade` — Versionswechsel nur ueber `.mcp.json` per PR.
