# `docs/ai-dashboard/issues.json` gehoert dem Bot

**Regel:** Nie mitcommitten; Dateien gezielt mit `git add <datei>` stagen.
Zuruecksetzen ist fuer genau diesen Pfad erlaubt — die einzige Ausnahme im
Verwerfen-Verbot von `.claude/hooks/git-gh-guard.mjs`.

## Warum es eine Ausnahme braucht

Lokal erzeugen `npm run task` und `npm run dashboard` die Datei neu; auf `main`
committet der Workflow `dashboard-data.yml` sie stuendlich. Ohne Ausnahme gibt
es bei jedem Push einen Konflikt mit dem Sync-Workflow — und ein abgelehnter
Push mit „fetch first" ist meist nur dieser Bot: `git pull --rebase origin main`,
dann erneut pushen.

## Wie eng die Ausnahme ist

Sie gilt nur fuer exakt diesen Pfad: `git checkout -- docs/ai-dashboard/issues.json`
und `git restore …`. `git checkout -- .`, ein zweiter Pfad dahinter oder eine
andere Datei bleiben blockiert. Ein angehaengtes `2>/dev/null`, `>/dev/null`
oder `2>&1` ist erlaubt — eine Umleitung in eine **echte** Datei dagegen nicht,
denn `… > wichtig.txt` wuerde diese Datei ueberschreiben.
`qa/tests/git-gh-guard.test.mjs` haelt die Ausnahme eng.

## Wie es vorher lief (bis 2026-09-09)

Die Ausnahme fehlte, Doku und Hook widersprachen sich, und der Ausweg war ein
Stash pro Sitzung — im zwischen allen Worktrees geteilten Stash-Stack, wo ihn
eine andere Sitzung faelschlich poppen konnte.

## Warum der Hook jede Stelle im Befehl prueft

Er prueft **jede** Stelle, an der ein `git`/`gh`-Aufruf beginnt, nicht nur den
Anfang. Sonst rutscht dieselbe Operation hinter einem Vorspann durch:
`git update-ref -d` war blockiert, `xargs -n1 git update-ref -d` lief durch.
Das faellt bewusst fail-closed aus — steht ein verbotener Befehl nur als Text in
einer Zeile, wird auch das blockiert. Fuer Fliesstext, der solche Befehle
erwaehnt, ist ein Heredoc der Weg; dessen Inhalt behandelt der Hook als Daten.
