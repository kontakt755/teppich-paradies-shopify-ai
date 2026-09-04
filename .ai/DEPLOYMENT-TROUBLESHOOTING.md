# Deployment-Fehlerdatenbank

Gesammelte, tatsächlich aufgetretene Fehler bei `workflow:preview` / `workflow:live` / `shopify theme push` – mit Ursache und funktionierendem Fix. Ziel: nicht erneut Zeit mit denselben Sackgassen verlieren. Neue Einträge unten anhängen, Format beibehalten.

Lesereihenfolge laut `.ai/README.md`: erst `AGENTS.md`, dann bei Deploy-Aufgaben diese Datei.

## Vor jedem Deploy-Versuch prüfen

1. `git status` – kein offener Merge, keine uncommitted changes.
2. `git fetch origin main && git log HEAD..origin/main --oneline` – lokal identisch mit `origin/main`? Falls nicht: `git reset --hard origin/main` (nur auf `main`, nie auf einer Feature-Branch mit eigenen Commits).
3. `.ai/../domains/shopify/live-theme.json` lesen – das ist die einzige Quelle für Theme-IDs, nicht raten oder aus Prosa/altem Chat übernehmen.
4. Erst `workflow:preview`, dann erst `workflow:live` – Live verlangt existierende Preview-Evidence für exakt den aktuellen `origin/main`-Commit.

## Bekannte Fehler

### `PREVIEW_SOURCE: Preview muss exakt aus aktuellem origin/main entstehen`
- **Ursache:** Feature-Branch ist nicht auf `origin/main` rebased/aktuell.
- **Fix:** `git fetch origin main && git rebase origin/main` auf der Feature-Branch, dann erneut versuchen.

### `shopify theme push` hängt / fragt "Push theme files to the live theme...?"
- **Ursache:** Shopify CLI verlangt eine interaktive Bestätigung. Piping (`echo "y" | ...`) und `--force` lösen das NICHT – die CLI erkennt Non-TTY-Kontext und bricht bewusst ab.
- **Fix:** Es gibt keinen non-interaktiven Workaround. Der Nutzer muss den Befehl selbst im eigenen Terminal ausführen und die Bestätigung geben. Immer mit `--only <datei>` scopen, nie ungezielt das ganze Theme pushen (siehe `[[feedback_theme_push_workflow]]` in der persönlichen Memory).

### `SEO: FAIL` / `VALIDATION_FAILED: SEO fehlgeschlagen`
- **Ursache:** Nicht zwangsläufig durch die eigene Änderung verursacht. In der Praxis war es ein vorbestehender Fehler: Google-Rating-API liefert 404 auf allen PDPs (Desktop + Mobile), unabhängig vom aktuellen Diff.
- **Fix:** `npm run seo:check` laufen lassen, `SEO_REPORT.md` lesen, ERROR-Sektion mit dem eigenen Diff abgleichen. Wenn die Fehler nichts mit der eigenen Änderung zu tun haben: Nutzer informieren, nicht blind versuchen zu umgehen. Es gibt kein `--force-seo-override`-Flag (existiert nicht, wurde ausprobiert). Es gibt aktuell keinen sauberen Weg, den Gate bei bekannten Altfehlern zu übergehen außer den Fehler selbst zu fixen – falls der Nutzer trotzdem deployen will, das explizit als bewusste Ausnahme behandeln, nicht automatisieren.

### `THEME_ID_AMBIGUOUS: Theme-ID ist nicht eindeutig vorhanden`
- **Ursache:** Keine oder mehrdeutige `--theme-id` beim `workflow:live`-Aufruf.
- **Fix:** Immer explizit `--theme-id <ID>` übergeben, Wert aus `domains/shopify/live-theme.json` (Feld `live.themeId`).

### `FINDINGS_BLOCK: P0 und P1 müssen explizit 0 sein`
- **Ursache:** `--p0` / `--p1` Flags fehlen; der Workflow akzeptiert keinen impliziten Default.
- **Fix:** Immer `--p0 0 --p1 0` explizit mitgeben (nur wenn tatsächlich keine offenen P0/P1-Findings existieren).

### `PREVIEW_EVIDENCE: Passende Preview-Evidence für origin/main fehlt`
- **Ursache:** Für den aktuellen `origin/main`-Commit wurde noch keine erfolgreiche `workflow:preview`-Runde mit Evidence hinterlegt. Live-Gate verlangt das zwingend vorher.
- **Fix:** Erst `workflow:preview` für exakt diesen Commit erfolgreich durchlaufen lassen (inkl. `--approve-preview`), erst danach `workflow:live`. Kein Shortcut bekannt – `--local-runner` umgeht das NICHT.

### `PREVIEW_ROLE: Preview-Theme muss eindeutig unpublished sein`
- **Ursache:** Die für `workflow:preview --theme-id X` übergebene Theme-ID ist laut Shopify Admin API nicht (mehr) unpublished – z. B. weil sie inzwischen live ist oder umbenannt/gelöscht wurde.
- **Fix:** Aktuelle Theme-Rollen direkt per Shopify Admin API prüfen (`themes(first: 20) { nodes { id name role } }`), nicht auf veraltete IDs aus Doku/Chat-Verlauf verlassen. `domains/shopify/live-theme.json` danach aktualisieren.

### Merge-in-Progress beim Session-Start
- **Ursache:** Vorherige Session/Branch-Wechsel hat einen Merge offen gelassen.
- **Fix:** `git status` als allerersten Schritt jeder Deploy-Session. Bei offenem Merge ohne Konflikte: mit dem Nutzer klären, ob `git merge --abort` sicher ist (nur wenn es klar der falsche/verwaiste Merge ist), dann erst weiterarbeiten.

## Funktionierender Ablauf (Stand 2026-09-04)

```bash
# 1. Sauberer Start
git status
git fetch origin main
git reset --hard origin/main   # NUR auf main, NUR wenn keine eigenen uncommitted Änderungen

# 2. Aktuelle Theme-IDs holen
cat domains/shopify/live-theme.json

# 3. Preview zuerst, mit explizitem P0/P1
npm run workflow:preview -- --theme-id <PREVIEW_ID> --p0 0 --p1 0 --approve-preview

# 4. Visuell prüfen (Browser/Screenshots) bevor Live versucht wird

# 5. Live erst danach, mit allen nötigen Flags
npm run workflow:live -- --theme-id <LIVE_ID> --p0 0 --p1 0 --approve-live --approval-text "PUBLISH LIVE" --execute
```

Jeder Fehler-Exit-Code hier ist informativ, kein Grund, Flags zu raten – der jeweilige `*_BLOCK`/`*_SOURCE`/`*_ROLE`-Text im Output benennt exakt die fehlende Voraussetzung.
