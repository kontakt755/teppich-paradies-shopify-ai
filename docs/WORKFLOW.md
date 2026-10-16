# Standard-Workflow

`AGENTS.md` bleibt die verbindliche Regelquelle (Abschnitte „Deploy“, „Vor jedem Commit“, „Werkzeuge“). Diese Seite ist nur die kurze Bedienungsanleitung; bei Widerspruch gilt `AGENTS.md`.

## Normaler Ablauf

1. Aufgabe in eigener Arbeitskopie auf einem Branch `feature/<name>`, `fix/<name>`, `chore/<name>` oder `claude/<name>` – nie direkt auf `main`.
2. Aendern und pruefen: Guards aus `AGENTS.md` („Vor jedem Commit“), `npm run workflow:validate -- --static`; bei Storefront-/Browser-Aenderungen zusaetzlich der volle Lauf `npm run workflow:validate` (nur lokal, braucht die Storefront).
3. PR gegen `main` (`gh pr create` oder `npm run workflow:pr -- --p0 0 --p1 0 --title "Titel"`, letzteres wiederholt die statischen Checks fuer den gepushten HEAD und legt hoechstens einen Draft-PR an). Review nur fuer die in `AGENTS.md` genannten kritischen Aenderungen (`/code-review` oder Codex auf den PR-Diff).
4. Vor dem Merge `npm run -s deploy:frei` (Exit 1 = ein Deploy-Fenster ist offen, warten), `npm run pr:doctor` nach jedem Merge.
5. Deploy nur aus dem Deploy-Worktree auf `main`: `npm run workflow:doctor`, dann `workflow:preview` und `workflow:live` direkt hintereinander (Befehle im Skill `deploy`). Verlangt der Benutzer den Deploy, fuehrt der Agent die Kette selbst aus; die Freigabe-Flags sind Teil des Befehls. Ein abgebrochenes Gate ist ein Befund, nie das Gate ausbauen.
6. Nach dem Livegang `domains/shopify/live-theme.json` aktualisieren (`npm run theme:guard`) und den oeffentlichen Shop ohne Preview-Parameter kontrollieren.

## Befehle

- `npm run workflow:status` / `npm run workflow:next` / `npm run workflow:state`: Zustand und naechste erlaubte Aktion aus Git und commitgebundener Evidence; veraltete oder unklare Evidence ergibt `STOP_REVIEW`, Freigaben werden nie gespeichert.
- `npm run workflow:validate`: Unit, Automation, Workflow-Tests, QA Evidence, Secret Scan, Compare, SEO, Full QA und Sales nacheinander; Sales muss 6/6 PASS und `orderCompleted: false` liefern. `-- --static` laesst die Browser-/Storefront-Schritte aus, `-- --dry-run` zeigt nur den Ablauf und meldet nie PASS. Das Flag heisst `--static`, unbekannte Flags brechen ab.
- `npm run workflow:doctor`: alle Deploy-Voraussetzungen in einem Lauf (Branch `main`, sauberer Tree, Evidence, Theme-Rollen, offenes Deploy-Fenster).
- `npm run workflow:preview -- --theme-id ID --p0 0 --p1 0 --approve-preview`: nur aus sauberem, aktuellem `main`; Ziel muss vor und nach dem Push `unpublished` sein, `settings_data.json` wird nicht ueberschrieben, alle uebrigen Theme-Dateien muessen danach exakt `main` entsprechen (`previewDiffCount === 0`). Remote-Extras werden nicht geloescht, sondern stoppen fail-closed (Abhilfe im Skill `deploy`). Oeffnet das Deploy-Fenster (`.workflow/deploy-fenster.json`), das der Guard-Hook gegen Merges nach `main` schuetzt.
- `npm run workflow:live -- --theme-id ID --p0 0 --p1 0 --approve-live --approval-text "PUBLISH LIVE" --execute`: `--theme-id` ist die Preview-ID (das Theme, das live wird). Unmittelbar vor dem Publish werden Preview-Rolle, Theme-Dateistand gegen `origin/main` (`LIVE_SOURCE`) und der `settings_data.json`-Hash erneut verifiziert; schliesst das Deploy-Fenster, auch bei Abbruch.
- `npm run workflow:scratch -- --theme-id ID`: Wegwerf-Theme zum Ausprobieren, ohne Evidence.

## Guards

Die Guards (`liquid`, `schema`, `template`, `theme`, `schrift`, `themecheck`, `essential`, `unmerged`, `menu`, `farbcode`, `bewertung`) stehen mit Zweck in der Werkzeugtabelle von `AGENTS.md`. Sie fangen Fehler ab, die `shopify theme check` nicht meldet und die Shopify beim Push still verwirft oder im Theme-Editor unsichtbar laesst. Alle laufen in der PR-Validierung und im SessionStart-Hook fuer Remote-Sessions; ein fehlgeschlagener Guard setzt die Validierung auf FAIL. Historische Reports behalten alte Theme-IDs mit Absicht, Anweisungsdateien nicht (`theme:guard`).

## GitHub Actions

PRs gegen `main` fuehren ohne Shopify-Secrets die statischen Checks aus: Unit, Automation, Workflow-Tests, QA Evidence, Secret Scan und die Guards. Compare, SEO, Full QA und Sales laufen lokal auf dem Mac, weil sie Browser, oeffentliche Storefront und stabile Netzwerkbedingungen brauchen. `pr-doctor.yml` meldet Basis-/Historienprobleme offener PRs als Kommentar, repariert aber nicht.

## iPhone / Remote

Kurze Auftraege ueber ChatGPT Remote (Codex) oder claude.ai/code (Claude) genuegen: „Neue Aufgabe starten: …“, „Weiter“, „PR vorbereiten“, „Preview erstellen“, „Live stellen“. Beide lesen `AGENTS.md` und diese Datei; es gibt keinen Router und kein Pflicht-Review zwischen ihnen (entfernt 2026-09-30). In Remote-Sessions ist die Storefront gesperrt (nur `validate --static`), Deploys laufen lokal; „Live stellen“ aus der Ferne setzt also eine lokale Sitzung voraus, die die Kette aus Schritt 5 faehrt.
