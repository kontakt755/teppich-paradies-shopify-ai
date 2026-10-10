# Standard-Workflow

`AGENTS.md` bleibt die verbindliche Regelquelle. Diese Seite ist nur die kurze Bedienungsanleitung.

## Normaler Ablauf

1. Ahmet gibt Codex eine Aufgabe.
2. Codex erstellt `feature/<name>`, `fix/<name>` oder `chore/<name>` – nie Arbeit direkt auf `main`.
3. Codex ändert und testet: normalerweise `npm run workflow:validate -- --static`, bei Storefront-/Browser-Änderungen `npm run workflow:validate`.
4. Ein empfohlenes Review darf parallel oder später erfolgen und blockiert die lokale Umsetzung nicht. Nach P0=0/P1=0, Commit und Branch-Push führt `npm run workflow:pr -- --p0 0 --p1 0 --title "Titel"` die sicheren statischen Checks erneut für den gepushten HEAD aus und erstellt höchstens einen Draft-PR gegen `main`.
5. Ahmet prüft und gibt den Merge ausdrücklich frei. Es gibt keinen Auto-Merge.
6. Nach dem Merge wird lokales `main` auf `origin/main` aktualisiert. Ein vorhandenes, eindeutig unpublished Preview-Theme kann nach separater Freigabe mit `npm run workflow:preview -- --theme-id ID --p0 0 --p1 0 --approve-preview` aktualisiert werden.
7. Ahmet prüft die Preview-URL und gibt Live separat frei. Test-PASS, PR-Merge oder Preview-PASS veröffentlichen niemals automatisch.

## Befehle

- `npm run workflow:status` / `npm run workflow:next`: leiten Zustand und nächste erlaubte Aktion aus Git und commitgebundener Evidence ab.
- `npm run workflow:validate`: Unit, Automation, Workflow-Tests, QA Evidence, Secret Scan, Compare, SEO, Full QA und Sales nacheinander. Sales muss 6/6 PASS und `orderCompleted: false` liefern.
- `npm run workflow:validate -- --dry-run`: zeigt den Ablauf, führt nichts aus und meldet niemals PASS.
- `npm run workflow:pr -- --p0 0 --p1 0 --title "..."`: nur auf erlaubtem Branch, sauberem und vollständig gepushtem HEAD; wiederholt statische Checks und erstellt höchstens einen Draft-PR. Ein Draft-PR ist noch keine Preview- oder Live-Freigabe.
- `npm run workflow:preview -- --theme-id ID --p0 0 --p1 0 --approve-preview`: nur aus sauberem, aktuellem `main`; Ziel muss vor und nach dem Push `unpublished` sein. `settings_data.json` wird nicht überschrieben und sein Hash muss unverändert bleiben. Vor und nach dem Push wird das Preview-Theme gelesen; alle übrigen Theme-Dateien müssen danach exakt `main` entsprechen. Remote-Dateien werden nicht automatisch gelöscht – vorhandene Extras führen stattdessen fail-closed zum Stopp.
- `npm run workflow:live`: ist standardmäßig gesperrt. Selbst eine freigegebene Preview reicht nicht.
- `npm run workflow:state`: leitet den aktuellen Zustand aus Git und commitgebundener lokaler Evidence ab. Veraltete oder unklare Evidence führt zu `STOP_REVIEW`; Freigaben werden nie gespeichert.

Human Gates stoppen keine lokale Implementierung. Die harten Schutzregeln greifen in den konkreten PR-, Preview-, Live- oder Shopify-Write-Befehlen und in den Hooks (`.claude/hooks/git-gh-guard.mjs`, `theme-delete-guard.mjs`).

## Live-Gate

Live ist nur möglich, wenn alle Nachweise zum aktuellen `origin/main` passen, das Preview-Theme weiterhin unpublished ist, P0/P1 null sind und der Mensch unmittelbar freigibt:

`npm run workflow:live -- --theme-id ID --p0 0 --p1 0 --approve-live --approval-text "PUBLISH LIVE" --execute`

Dieser Befehl ist absichtlich unbequem. Er darf erst nach Prüfung der Preview-URL benutzt werden. Shopify Live bleibt ein vom GitHub-Merge getrennter Human Gate.
Unmittelbar vor Publish werden Preview-Rolle, vollständiger Theme-Dateistand und der geschützte `settings_data.json`-Hash erneut verifiziert. Preview-Browserchecks laufen nach dem Push über die Theme-ID-gebundene Preview-URL.

## Guards

Das System führt vier spezialisierte Prüfungen durch, die Fehler abfangen, die anderen Tools übersehen:

- **Liquid-Guard** (`npm run liquid:guard`): Findet ungültiges Liquid-Syntax, das `shopify theme check` nicht meldet und das Shopify beim Push still verwirft. Betroffen sind z.B. kaputte Filterverkettungen, ungültige Variablennamen.
  
- **Schema-Guard** (`npm run schema:guard`): Findet fehlerhafte `{% schema %}`-Blöcke in Blocks. Diese deployen zwar, erscheinen aber nicht in der Block-Auswahl des Theme-Editors (wegen unbekannter Keys oder fehlender `presets`).

- **Template-Guard** (`npm run template:guard`): Meldet Kollektions-Templates, deren Produktkarten nicht dieselben Blöcke tragen wie die übrigen (häufig aus blockweisem Einklicken im Editor entstanden, führt zu Drift). Außerdem prüft er alle Templates und Section-Gruppen gegen Shopifys Grenzen (50 hinzufügbare Blöcke je Section, 1.250 je Datei, 25 Sections je Datei, `max_blocks` aus dem Schema); eine Datei darüber würde Shopify beim Push ablehnen.

- **Live-Theme-Guard** (`npm run theme:guard`): Findet veraltete Theme-IDs in Anweisungsdateien (CLAUDE.md, AGENTS.md, Roadmaps). Verhindert, dass eine alte Theme-ID wieder als aktuell angenommen wird. Historische Reports behalten ihre alten IDs mit Absicht.

Alle Guards laufen in der PR-Validierung und im SessionStart-Hook für Remote-Sessions. Ein fehlgeschlagener Guard setzt die Validierung auf FAIL und verhindert den Merge.

## GitHub Actions

PRs gegen `main` führen ohne Shopify-Secrets sichere statische Checks aus: Unit, Automation, Workflow-Tests, QA Evidence, Secret Scan und alle vier Guards. Compare, SEO, Full QA und Sales laufen bei Storefront-Aufgaben und spätestens bei Preview-/Live-Vorbereitung lokal, weil sie Browser, öffentliche Storefront und stabile Netzwerkbedingungen benötigen.

## iPhone / Remote

Standardweg: **iPhone → ChatGPT Remote → Mac-Codex-Session**. Kurze Aufträge genügen:

- „Neue Aufgabe starten: …“
- „Weiter“
- „PR vorbereiten“
- „Preview erstellen“
- „Live freigeben“

Codex liest `AGENTS.md` und diese Datei. „Live freigeben“ ist nur die Absicht; vor dem tatsächlichen Publish müssen Theme-ID, Preview-Evidence und der explizite Live-Befehl weiterhin eindeutig bestätigt sein.

Der normale Kurzdialog ist damit: „Neue Aufgabe: …“ → „Weiter“ → bei einem echten Gate „Freigeben“. Claude-Sitzungen arbeiten nach denselben Regeln; es gibt keinen automatischen Router und kein Pflicht-Review zwischen den beiden (entfernt 2026-09-30).
