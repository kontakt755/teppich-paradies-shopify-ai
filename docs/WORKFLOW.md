# Standard-Workflow

`AGENTS.md` bleibt die verbindliche Regelquelle. Diese Seite ist nur die kurze Bedienungsanleitung.

## Normaler Ablauf

1. Ahmet gibt Codex eine Aufgabe.
2. Codex erstellt `feature/<name>`, `fix/<name>` oder `chore/<name>` – nie Arbeit direkt auf `main`.
3. Codex ändert und führt die vom Router verlangte Testtiefe aus: normalerweise `npm run workflow:validate -- --static`, bei ausdrücklicher Storefront-/Browser-Prüfung `npm run workflow:validate`.
4. Ein empfohlenes Review darf parallel oder später erfolgen und blockiert die lokale Umsetzung nicht. Nach P0=0/P1=0, Commit und Branch-Push führt `npm run workflow:pr -- --p0 0 --p1 0 --title "Titel"` die vollständige PR-Validierung erneut für den gepushten HEAD aus und erstellt höchstens einen Draft-PR gegen `main`.
5. Ahmet prüft und gibt den Merge ausdrücklich frei. Es gibt keinen Auto-Merge.
6. Nach dem Merge wird lokales `main` auf `origin/main` aktualisiert. Ein vorhandenes, eindeutig unpublished Preview-Theme kann nach separater Freigabe mit `npm run workflow:preview -- --theme-id ID --p0 0 --p1 0 --approve-preview` aktualisiert werden.
7. Ahmet prüft die Preview-URL und gibt Live separat frei. Test-PASS, PR-Merge oder Preview-PASS veröffentlichen niemals automatisch.

## Befehle

- `npm run workflow:route -- "Neue Aufgabe: ..."`: klassifiziert Aufwand A–D und ermittelt davon getrennt Testtiefe, Review-Empfehlung und echte Protected Actions. Startet keine externe KI.
- `npm run workflow:status`: erzeugt den maschinenlesbaren Handoff-State neu aus Task, Git-Diff und commitgebundener Evidence.
- `npm run workflow:next`: nennt genau die nächste erlaubte Aktion.
- `npm run workflow:continue`: führt den nächsten Testschritt aus oder nennt die nächste Arbeitsaktion. Auf macOS startet erforderliche Full-QA automatisch; ein späterer externer Retry ist explizit mit `-- --retry-now` möglich.
- `npm run workflow:validate`: Unit, Automation, Workflow-Tests, QA Evidence, Secret Scan, Compare, SEO, Full QA und Sales nacheinander. Sales muss 6/6 PASS und `orderCompleted: false` liefern.
- `npm run workflow:validate -- --dry-run`: zeigt den Ablauf, führt nichts aus und meldet niemals PASS.
- `npm run workflow:pr -- --p0 0 --p1 0 --title "..."`: nur auf erlaubtem Branch, sauberem und vollständig gepushtem HEAD; validiert und erstellt höchstens einen Draft-PR.
- `npm run workflow:preview -- --theme-id ID --p0 0 --p1 0 --approve-preview`: nur aus sauberem, aktuellem `main`; Ziel muss vor und nach dem Push `unpublished` sein. `settings_data.json` wird nicht überschrieben und sein Hash muss unverändert bleiben. Vor und nach dem Push wird das Preview-Theme gelesen; alle übrigen Theme-Dateien müssen danach exakt `main` entsprechen. Remote-Dateien werden nicht automatisch gelöscht – vorhandene Extras führen stattdessen fail-closed zum Stopp.
- `npm run workflow:live`: ist standardmäßig gesperrt. Selbst eine freigegebene Preview reicht nicht.
- `npm run workflow:state`: leitet den aktuellen Zustand aus Git und commitgebundener lokaler Evidence ab. Veraltete oder unklare Evidence führt zu `STOP_REVIEW`; Freigaben werden nie gespeichert.

Review-Empfehlungen und Human Gates stoppen keine lokale Implementierung. Die harten Schutzregeln greifen in den konkreten PR-, Preview-, Live- oder Shopify-Write-Befehlen. Details stehen in `docs/AI_ROUTER.md`.

## Live-Gate

Live ist nur möglich, wenn alle Nachweise zum aktuellen `origin/main` passen, das Preview-Theme weiterhin unpublished ist, P0/P1 null sind und der Mensch unmittelbar freigibt:

`npm run workflow:live -- --theme-id ID --p0 0 --p1 0 --approve-live --approval-text "PUBLISH LIVE" --execute`

Dieser Befehl ist absichtlich unbequem. Er darf erst nach Prüfung der Preview-URL benutzt werden. Shopify Live bleibt ein vom GitHub-Merge getrennter Human Gate.
Unmittelbar vor Publish werden Preview-Rolle, vollständiger Theme-Dateistand und der geschützte `settings_data.json`-Hash erneut verifiziert. Preview-Browserchecks laufen nach dem Push über die Theme-ID-gebundene Preview-URL.

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

Der normale Kurzdialog ist damit: „Neue Aufgabe: …“ → „Weiter“ → bei einem echten Gate „Freigeben“. Der Nutzer muss nicht zwischen Claude und Codex vermitteln; der Router nennt die benötigte Rolle, ohne sie per API zu starten.
