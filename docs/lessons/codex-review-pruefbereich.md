# Wenn das Codex-Review fremde Arbeit anmahnt

**Regel:** Zuerst nachsehen, welchen Diff der Reviewer gelesen hat. Empfohlene
Korrekturen, die fremde Commits „herausloesen" oder fremde Dateien aufraeumen
wollen, niemals ausfuehren. Nach drei Runden `REVIEW_LIMIT_REACHED`.

## Diagnose

```
git -C <hauptcheckout> log --oneline -1     # HEAD dort
git diff --name-only origin/main..<eigener-branch>
```

Weichen die beiden auseinander, prueft der Reviewer einen fremden Arbeitsstand.

## Wie es dazu kam

**Bis 2026-09-10** passierte das in jedem Worktree zuverlaessig: Beide Hooks
nahmen `CLAUDE_PROJECT_DIR` (den Hauptcheckout), wo die eigenen Commits gar
nicht liegen — wohl aber die einer parallel laufenden Sitzung.
`resolveReviewDir` in `automation/core/review-scope.mjs` behebt das.

**Seit 2026-09-11** misst der Reviewer an einer eigenen Datei:
`.router/claude-handoffs/<TASK-ID>.review.md` enthaelt nur Auftrag und
verbindliche Grenzen. Vorher bekam er das Hand-off des Implementers, in dem die
Voranalyse des Routers steht — sie stammt von einem kleinen Drittmodell ohne
Repository-Zugriff und wurde so zum Pruefmassstab. Ebenfalls nie im
Pruefbereich: `docs/ai-dashboard/issues.json`, weil der Dashboard-Bot die Datei
waehrend der Sitzung neu schreibt.

**Seit 2026-09-15** entscheidet der Urheber, nicht der Zeitpunkt: Zwei Hooks
(`record-session-write.mjs` fuer Edit/Write, `record-bash-write.mjs` fuer jeden
Shell-Befehl, per `git status` vorher/nachher plus mtime) halten unter
`.router/claude-writes/` fest, welche Pfade die eigene Sitzung geschrieben hat.
Der Stop-Hook nimmt nur diese in den Pruefbereich; alles andere im Working Tree
wird dem Reviewer als „nicht von dieser Sitzung geschrieben, kein Befund"
genannt. Die Baseline vom ersten Prompt reichte nicht — sie kannte nicht, was
andere Sitzungen *waehrend* einer langen Sitzung schreiben (Sitzung 413c819c:
Einfass-Konfigurator, Bestellmail, `launch.json`, `SEO_REPORT.md` standen
komplett im Pruefbereich, Codex verlangte zweimal, sie zu „isolieren"). Fehlt
der Bestand (aeltere Hooks) oder ist er gedeckelt, wird weiter alles geprueft.

## Zwei Grenzen, die man kennen muss

**Die Hooks laufen immer aus dem Hauptcheckout** (`CLAUDE_PROJECT_DIR`), egal
in welchem Worktree die Sitzung arbeitet. Steht der Hauptcheckout auf einem
Branch ohne diese Commits, laeuft die alte Logik — genau so lief am 2026-09-15
ein Fix vom Vortag nicht, weil der Hauptcheckout auf
`feature/ux-kaufbereich-2026-09-15` stand. Pruefen:
`ls <hauptcheckout>/.router/claude-writes/` muss Eintraege haben.

**Arbeit, die nur auf Remote-Branches oder in einem anderen Worktree liegt,
sieht der Reviewer nicht** — er liest den Working Tree des
Sitzungsverzeichnisses. Ausnahme seit 2026-09-16: Liegt das Ergebnis als
gemergter Commit vor (gebaut im Wegwerf-Worktree, Sitzungsordner auf fremdem
Branch — Sitzung 413c819c, PR #343), hinterlegt die Sitzung
`.router/claude-handoffs/<TASK-ID>.ergebnis.json` mit
`{ "commit": "<sha>", "basis": "<sha>", "pr": <nummer> }`, und der Pruefbereich
wird `git diff <basis> <commit>` statt des Working Trees, sichtbar in der
`.review.md`. Angenommen werden nur Commits, die von `origin/main` oder einem
anderen `origin/*`-Branch erreichbar sind; ein Zeiger, der das nicht erfuellt,
wird verworfen und genannt.

## Warum die Korrekturen nie blind laufen

Sie lauteten dreimal hintereinander, fremde Commits „herauszuloesen" und fremde
ungetrackte Dateien aufzuraeumen. Beides haette die uncommittete Arbeit anderer
Sitzungen zerstoert. Fremde Aenderungen gehoeren dem Branch, auf dem sie
entstanden sind; Evidence fuer fremden Code zu erzeugen waere eine falsche
Zusicherung.
