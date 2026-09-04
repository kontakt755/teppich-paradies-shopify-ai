# Deployment-Fehlerdatenbank

Erfahrungen aus echten Deploy-Sitzungen, die das CLI selbst nicht ausgeben kann.

**Die Lösung je Fehlercode steht nicht mehr hier, sondern im Code:** `GATE_REMEDIATION` in `workflow/core.mjs`. Jeder Gate-Fehlschlag druckt seither seine eigene Remediation direkt im Terminal, und ein Test erzwingt, dass jeder geworfene Code dort einen Eintrag hat. Diese Datei darf das bewusst **nicht** duplizieren – eine zweite Liste würde vom Code wegdriften und dann falsche Fixes vorschlagen.

Hier steht nur, was aus einem einzelnen Fehlercode nicht hervorgeht: Reihenfolge, Umgebungsgrenzen, Vorfälle.

Lesereihenfolge laut `.ai/README.md`: erst `AGENTS.md`, dann bei Deploy-Aufgaben diese Datei.

## Vor jedem Deploy-Versuch prüfen

1. `git status` – kein offener Merge, keine uncommitted changes.
2. `git fetch origin main && git log HEAD..origin/main --oneline` – lokal identisch mit `origin/main`? Falls nicht: `git reset --hard origin/main` (nur auf `main`, nie auf einer Feature-Branch mit eigenen Commits).
3. `.ai/../domains/shopify/live-theme.json` lesen – das ist die einzige Quelle für Theme-IDs, nicht raten oder aus Prosa/altem Chat übernehmen.
4. Erst `workflow:preview`, dann erst `workflow:live` – Live verlangt existierende Preview-Evidence für exakt den aktuellen `origin/main`-Commit.

## Was das CLI nicht selbst sagen kann

### `shopify theme push` hängt / fragt "Push theme files to the live theme...?"
Shopify CLI verlangt eine interaktive Bestätigung. Piping (`echo "y" | ...`) und `--force` lösen das **nicht** – die CLI erkennt den Non-TTY-Kontext und bricht bewusst ab. Es gibt keinen non-interaktiven Workaround: Der Mensch muss den Befehl im eigenen Terminal ausführen. Immer mit `--only <datei>` scopen, nie ungezielt das ganze Theme pushen.

### SEO-Fehlschlag ist oft nicht der eigene Diff
Am 2026-09-03 blockierte der SEO-Gate einen Live-Deploy mit 16 Fehlern, die alle vorbestanden: Die Google-Rating-API lieferte 404 auf allen PDPs (Desktop + Mobile), völlig unabhängig von der Änderung. `npm run seo:check` laufen lassen, `SEO_REPORT.md` öffnen und die ERROR-Sektion gegen den eigenen Diff halten, bevor Zeit in die falsche Ursache fließt. Ein Override existiert bewusst nicht (`--force-seo-override` wurde ausprobiert, gibt es nicht) – Altfehler müssen behoben werden, und ob trotzdem deployt wird, entscheidet der Mensch, nicht der Agent.

### Merge-in-Progress beim Session-Start
Eine vorherige Sitzung kann einen offenen Merge hinterlassen. `git status` gehört als allererster Schritt in jede Deploy-Sitzung. Bei offenem Merge ohne Konflikte erst mit dem Menschen klären, ob `git merge --abort` sicher ist.

### Shopify-Schreibzugriff: kein Token suchen, kein Chrome bemuehen
Zwei Sitzungen am 2026-09-04 gingen dafuer drauf, einen `shpat_`-Token zu
beschaffen und Variantenpreise ueber Chrome-Automation zu setzen. Beides war
unnoetig — der Shopify-MCP-Server ist bereits authentifiziert und konnte die
Schreibzugriffe die ganze Zeit. Die geltende Regel steht in `CLAUDE.md` unter
„Shopify-Schreibzugriff"; sie wird hier bewusst **nicht** wiederholt.

Merkmal, an dem man die Sackgasse frueh erkennt: ein Token mit Praefix `atkn_`
(App-Automatisierung) an der GraphQL Admin API liefert „Invalid API key or
access token". Wer daraufhin nach dem „richtigen" Token sucht, loest das
falsche Problem — der MCP-Server braucht gar keinen.

### Theme-IDs altern schneller als Notizen
Eine Theme-ID aus einem älteren Chat, Report oder Commit kann inzwischen eine andere Rolle haben. `domains/shopify/live-theme.json` ist die einzige Quelle; bei Zweifel die Rollen direkt per Admin-API prüfen (`themes(first: 20) { nodes { id name role } }`) und die Datei angleichen.

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

Schlägt ein Gate fehl, druckt das CLI seit 2026-09-04 unter der Fehlermeldung direkt `Fix:` und, wo sinnvoll, `Befehl:`. Diesen Hinweis lesen und befolgen, statt Flags zu raten oder Overrides zu suchen.

## Vorfall 2026-09-03: warum es diese Datei gibt

Ein Deploy einer zweizeiligen Änderung an `config/settings_data.json` brauchte rund zwei Stunden. Nicht wegen der Änderung, sondern weil sechs Gates **nacheinander** fehlschlugen und jeder Fehler erst sichtbar wurde, nachdem der vorige behoben war: `PREVIEW_SOURCE` → SEO → `THEME_ID_AMBIGUOUS` → `FINDINGS_BLOCK` → `PREVIEW_EVIDENCE` → `PREVIEW_ROLE`. Keine dieser Meldungen nannte damals eine Lösung.

Die Konsequenz daraus war nicht mehr Dokumentation, sondern die Remediation direkt im Code (`GATE_REMEDIATION`). Der Sammel-Preflight `npm run workflow:doctor` existiert seit 2026-09-04 und schliesst die Luecke: Er prüft alle Voraussetzungen in **einem** Durchlauf und meldet jeden offenen Punkt samt Fix, statt sechsmal nacheinander an je einem Gate zu scheitern.

**Vor jedem Deploy zuerst `npm run workflow:doctor` laufen lassen.** Erst wenn dort `PREFLIGHT: BEREIT` steht, `workflow:preview` starten.
