# Standard-Workflow

`AGENTS.md` bleibt die verbindliche Regelquelle. Diese Seite ist nur die kurze Bedienungsanleitung.

## Normaler Ablauf

1. Ahmet gibt Codex eine Aufgabe.
2. Codex erstellt `feature/<name>`, `fix/<name>` oder `chore/<name>` – nie Arbeit direkt auf `main`.
3. Codex ändert, testet und führt `npm run workflow:validate` aus.
4. Nach P0=0/P1=0, Commit und Branch-Push erstellt `npm run workflow:pr -- --p0 0 --p1 0 --title "Titel"` einen Draft-PR gegen `main`.
5. Ahmet prüft und gibt den Merge ausdrücklich frei. Es gibt keinen Auto-Merge.
6. Nach dem Merge wird lokales `main` auf `origin/main` aktualisiert. Ein vorhandenes, eindeutig unpublished Preview-Theme kann nach separater Freigabe mit `npm run workflow:preview -- --theme-id ID --p0 0 --p1 0 --approve-preview` aktualisiert werden.
7. Ahmet prüft die Preview-URL und gibt Live separat frei. Test-PASS, PR-Merge oder Preview-PASS veröffentlichen niemals automatisch.

## Befehle

- `npm run workflow:validate`: Unit, Automation, Workflow-Tests, QA Evidence, Secret Scan, Compare, SEO, Full QA und Sales nacheinander. Sales muss 6/6 PASS und `orderCompleted: false` liefern.
- `npm run workflow:validate -- --dry-run`: zeigt den Ablauf, führt nichts aus und meldet niemals PASS.
- `npm run workflow:pr -- --p0 0 --p1 0 --title "..."`: nur auf erlaubtem Branch, sauberem und vollständig gepushtem HEAD; validiert und erstellt höchstens einen Draft-PR.
- `npm run workflow:preview -- --theme-id ID --p0 0 --p1 0 --approve-preview`: nur aus sauberem, aktuellem `main`; Ziel muss vor und nach dem Push `unpublished` sein. `settings_data.json` wird nicht überschrieben und sein Hash muss unverändert bleiben. Vor und nach dem Push wird das Preview-Theme gelesen; alle übrigen Theme-Dateien müssen danach exakt `main` entsprechen. Remote-Dateien werden nicht automatisch gelöscht – vorhandene Extras führen stattdessen fail-closed zum Stopp.
- `npm run workflow:live`: ist standardmäßig gesperrt. Selbst eine freigegebene Preview reicht nicht.

## Live-Gate

Live ist nur möglich, wenn alle Nachweise zum aktuellen `origin/main` passen, das Preview-Theme weiterhin unpublished ist, P0/P1 null sind und der Mensch unmittelbar freigibt:

`npm run workflow:live -- --theme-id ID --p0 0 --p1 0 --approve-live --approval-text "PUBLISH LIVE" --execute`

Dieser Befehl ist absichtlich unbequem. Er darf erst nach Prüfung der Preview-URL benutzt werden. Shopify Live bleibt ein vom GitHub-Merge getrennter Human Gate.

## GitHub Actions

PRs gegen `main` führen ohne Shopify-Secrets sichere statische Checks aus: Unit, Automation, Workflow-Tests, QA Evidence und Secret Scan. Compare, SEO, Full QA und Sales bleiben lokale Pflichtprüfungen, weil sie Browser, öffentliche Storefront und stabile Netzwerkbedingungen benötigen.

## iPhone / Remote

Standardweg: **iPhone → ChatGPT Remote → Mac-Codex-Session**. Kurze Aufträge genügen:

- „Neue Aufgabe starten: …“
- „Weiter“
- „PR vorbereiten“
- „Preview erstellen“
- „Live freigeben“

Codex liest `AGENTS.md`, diese Datei, `CURRENT_STATE.md` und `NEXT_ACTION.md`. „Live freigeben“ ist nur die Absicht; vor dem tatsächlichen Publish müssen Theme-ID, Preview-Evidence und der explizite Live-Befehl weiterhin eindeutig bestätigt sein.
