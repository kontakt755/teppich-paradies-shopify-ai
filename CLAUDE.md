# TeppichParadies — Shopify Horizon Theme

Shop: `www.teppich-paradies.net` · Store: `sjjyq1-6w.myshopify.com` · Theme: Horizon (Shopify 2.0, Blocks/Sections)

Verbindliche Regeln: `AGENTS.md` (zuerst lesen). Diese Datei ist die Kurzfassung
fuer den Session-Alltag. Die Vorfaelle hinter jeder Regel stehen in
`docs/lessons/` — dort nachlesen, wenn eine Regel unverstaendlich wirkt.

## Welches Theme ist live?

**Nicht raten und keine ID aus einer Doku uebernehmen.** Die einzige Quelle ist
`domains/shopify/live-theme.json`; `npm run theme:guard` haelt sie mit dem
Repository konsistent und verbietet Theme-IDs in Anweisungsdateien. Nachpruefen
ueber den Shopify-MCP — live ist der Knoten mit `role: MAIN`:

```graphql
query { themes(first: 20) { nodes { id name role updatedAt } } }
```

Danach `live-theme.json` aktualisieren (inklusive `verifiedAt`), das alte Theme
unter `retired` eintragen und `npm run theme:guard` laufen lassen.
→ `docs/lessons/theme-id-drift.md`

## Was hier immer wieder schiefging

Jeder Punkt hat eine komplette Sitzung gekostet. Vor dem Loslegen lesen.

**1. Der Theme-Editor ist nur eine Oberflaeche ueber `templates/*.json`.**
Ein Block ist ein Eintrag in `blocks` plus einer in `block_order`. Bloecke
hinzufuegen ist ein Code-Edit, kein Klickvorgang.

```
npm run theme:block list                                  # zeigt Drift sofort
npm run theme:block add tp-card-color-thumbs --after price
npm run theme:block remove tp-card-color-thumbs
```

**2. Ein Block ohne `"presets"` im Schema wird deployed und ist trotzdem unsichtbar.**
Unbekannte Schema-Keys (z. B. `"target"`) werden stillschweigend ignoriert.
Vorlage ist das Schema von `blocks/tp-card-specs.liquid`. `npm run schema:guard` faengt beides.

**3. `{% render 'x' ... as var %}` gibt es in Liquid nicht.**
Shopify verwirft die Datei beim Push ohne Fehlermeldung; `shopify theme check`
sieht das nicht, `npm run liquid:guard` schon. Korrekt ist
`{% capture var %}{% render 'x' %}{% endcapture %}`.

**4. Nie von Hand ins Preview-Theme pushen.**
Das Live-Gate verlangt `previewDiffCount === 0`, also Preview exakt gleich
`origin/main`. Ein Direktpush erzeugt die Drift, die `PREVIEW_DRIFT` abfangen soll.

**5. Eine Theme-ID in Prosa veraltet, ohne dass es jemand merkt.** Siehe oben.

**6. Fertige Arbeit liegt auf Branches, die nie gemergt wurden.**
Der Shop zeigt nur, was in `main` ist. Suchen im Git-Verlauf, nicht in der Erinnerung:

```
git log --all --oneline --diff-filter=A -- <pfad>   # wo entstand die Datei
git branch -a --contains <commit>                   # auf welchem Branch liegt sie
git branch -r --no-merged main                      # was ist sonst noch ungemergt
```

Beim Zurueckholen **die ganze Gruppe nehmen, nie die eine Datei** — sonst lehnt
Shopify den gesamten Template-Push ab. Theme-Dateien vom Branch, Infrastruktur
(`workflow/`, `qa/`, `package.json`, `AGENTS.md`) von `main`. Gates:
`npm run essential:guard`, `npm run unmerged:guard`, Pre-Commit-Hook (warnt ab
7, blockiert ab 30 Tagen). → `docs/lessons/ungemergte-branches.md`

**6b. Ein toter Menuelink sieht im Editor genauso aus wie ein lebender.**
Filter-Links (`?filter.p.m.custom.<feld>=<Metaobjekt>`) mit leerem Raster haben
zwei moegliche Ursachen: kein Produkt traegt den Wert, oder die Produkte liegen
in einer anderen Kollektion. **Erst zaehlen, welche Werte die Produkte der
Kollektion tatsaechlich tragen**, dann entscheiden. `npm run menu:guard` findet
den Zustand. `menuUpdate` ersetzt den **gesamten** Item-Baum: vorher alles
auslesen, alle Zweige mit MenuItem-IDs zurueckschreiben, Gegenprobe ist die
identische ID-Menge — nicht `userErrors: []`. → `docs/lessons/tote-menuelinks.md`

**7. Ein Produktimport ohne geklaerte Namensregeln wird zweimal gebaut.**
Das naechstliegende fertige Produkt abfragen und daran entlangbauen.
Lieferantenseiten mit `curl` lesen; `productSet` nur fuer **neue** Produkte;
nach jedem Schreibvorgang gegenpruefen — `userErrors: []` ist kein Beleg.
→ `domains/shopify/produktimport-arbeitsweise.md`, `docs/lessons/produktimport.md`

**8. Lieferantennamen gehoeren nicht ins Repository.**
Repository, Issues und Dashboard sind oeffentlich. In Dateien, Commit-/PR-Texten
und `npm run task`-Notizen nur Pseudonyme: **Lieferant A** bis **D**, **Hausmarke
von A**, Linien **A-1** bis **A-3**, URLs als `lieferant-a.example`. SKUs bleiben
unveraendert. Rohdaten nur lokal unter `~/teppich-paradies-analyse/lieferantendaten/`
(`domains/lieferanten/AUSGELAGERT.md`). Die Git-Historie wird nicht umgeschrieben.

**9. Ein PR, der gegen `main` sauber ist, kann trotzdem nie geprueft werden.**
Falsche Basis, geloeschte Basis, ueberkreuzte Historie — alle mechanisch, und
jeder Merge nach `main` erzeugt neue Konflikte in anderen PRs.

```
npm run pr:doctor              # alle offenen PRs: Basis, Merge-Basen, Konflikte, Checks
npm run pr:doctor -- --fix     # umzielen auf main, ueberkreuzte Historie begradigen
```

Nach jedem Merge neu rechnen. `--fix` erledigt nur, was ohne Urteil geht;
Inhaltskonflikte in einem Wegwerf-Worktree loesen, nie im geteilten Checkout.
Gestapelte PRs **vor** dem Merge ihrer Basis umzielen. Die CI meldet nur
(`pr-doctor.yml`, `npm run pr:doctor:melden`), repariert bewusst nicht.
→ `docs/lessons/pr-basis-und-historie.md`

## Vor jedem Commit

```
npm run liquid:guard && npm run schema:guard && npm run template:guard && npm run theme:guard
node workflow/cli.mjs validate --static      # Flag heisst --static, nicht --static-only
```

Der volle Lauf (`validate` ohne `--static`) braucht die Storefront und laeuft nur
lokal auf dem Mac. Unbekannte Flags brechen ab.

## Werkzeuge

| Befehl | Zweck |
|---|---|
| `bin/tp "Aufgabentext"` | Aufgabe an den Orchestrator geben, der die Klasse bestimmt und das Modell waehlt |
| `npm run workflow:doctor` | **vor jedem Deploy**: alle Voraussetzungen in einem Lauf |
| `npm run router:status` | **bevor jemand behauptet, der Router laufe nicht**: Hooks, Keys, letzter Aufruf |
| `npm run router:setup` | **auf einem neuen Rechner**: `.env.local` aus `.env.example`, nennt die fehlenden Keys |
| `npm run theme:block list\|add\|remove` | Bloecke in Templates setzen, statt im Editor zu klicken |
| `npm run liquid:guard` | ungueltiges Liquid, das Shopify still verwirft |
| `npm run schema:guard` | Block-Schemata, die deployen aber im Editor unsichtbar bleiben |
| `npm run template:guard` | Kollektions-Templates, deren Produktkarte abweicht |
| `npm run theme:guard` | veraltete Theme-IDs in Anweisungsdateien, ungeschuetztes Live-Theme |
| `npm run menu:guard` | Menuelinks auf leeres Raster oder ins Nichts (braucht Netz) |
| `npm run unmerged:guard` | Bloecke/Templates auf ungemergten Branches |
| `npm run essential:guard` | Pflichtdateien und Template-Verweise vor dem Push |
| `npm run pr:doctor [-- --fix]` | offene PRs: falsche Basis, ueberkreuzte Historie, Konflikte |
| `npm run pr:doctor:melden` | dasselbe als idempotenter PR-Kommentar (CI: Push auf `main`, alle 6 h) |
| `npm run farbcode:guard` | Farbvarianten, deren Codes durchgezaehlt statt abgeschrieben wurden |
| `npm run bewertung:guard` | Google-Bewertung, die wieder einzeln im Template steht statt in der Theme-Einstellung |
| `npm run theme:diff -- --manifest <datei>` | Theme gegen Repository abgleichen |
| `npm run workflow:scratch -- --theme-id <id>` | Wegwerf-Theme zum Ausprobieren, ohne Evidence |

**`theme:diff`** braucht ein Manifest aus der Admin API (`checksumMd5` = MD5 der
Rohbytes, rund 500 Dateien = zwei Seiten, bei `hasNextPage` mit `after` blaettern).
Ergebnis als `{themeId, themeName, files:[{filename, checksumMd5}]}` ablegen:

```graphql
query { theme(id: "gid://shopify/OnlineStoreTheme/<id>") {
  name files(first: 250) { pageInfo { hasNextPage endCursor }
  nodes { filename checksumMd5 } } } }
```

**`workflow:scratch`** laeuft aus jedem Branch, auch mit uncommitteten
Aenderungen, schreibt keine Evidence und verweigert das Live-Theme und das
Preview-Evidence-Theme. Zum Deployen bleibt es bei `preview` → `live`.

## Shopify-Schreibzugriff — nicht nach einem Token suchen

**Der Shopify-MCP-Server ist bereits authentifiziert.** Produkte, Varianten,
Metafelder und Preise laufen ueber `graphql_query` / `graphql_mutation`. Kein
`SHOPIFY_ADMIN_TOKEN` noetig — den braucht nur der GitHub-Actions-Job
`.github/workflows/grosshandel-sync.yml` (Repository-Secret). `atkn_`-Tokens
sind Automatisierungstoken ohne Admin-GraphQL-Zugriff; `shpat_` hat ihn.

- Variantenpreis und SKU: `productVariantsBulkUpdate` (SKU in `inventoryItem: { sku }`).
- Neue Option: `productOptionsCreate` mit `variantStrategy: LEAVE_AS_IS`.
- `productVariantUpdate`, `productVariantCreate`, `productVariantsUpdate` existieren nicht.

**Bevor „die API kann das nicht" faellt, das Schema fragen** — auch Subagenten
schlagen den Mutationsnamen selbst nach, statt ihn im Prompt vorgesetzt zu bekommen.
Der Browser ist nie der Ausweichweg. → `docs/lessons/shopify-schreibzugriff.md`

```
graphql_schema(types: ["OptionCreateInput"])  # Welche Mutations nutzen diesen Input?
graphql_schema(types: ["Query", "Mutation"]) # Alles verfuegbar?
```

## In Remote-Sessions (claude.ai/code)

| | Status |
|---|---|
| GitHub, git push | geht |
| Shopify Admin API (Shopify MCP) | geht — liest Theme-Dateien und Produktdaten, schreibt in unpublished Themes |
| Storefront `teppich-paradies.net` / `*.myshopify.com` | **403 an der Egress-Policy** — keine Screenshots |
| Shopify CLI (`theme push/pull/list`) | kein Token + Domains blockiert |

Struktur und Syntax sind hier pruefbar, **das Aussehen nicht**. Browser-Schritte
(COMPARE, SEO, FULL_QA, SALES) schlagen fehl — deshalb `--static`. Deploys laufen lokal.

## Produktdaten (bestimmt, was Bloecke rendern duerfen)

- Farben sind eine echte Produktoption `Farbe` mit Bild je Variante. Bloecke
  gehen auf die **Option**, nicht auf `product.variants` — sonst erscheint
  dieselbe Farbe mehrfach bei zusaetzlichen Breiten-/Laengenvarianten.
- Fixpreis-/Rollenware-Produkte haben nur `Default Title` und kein Variantenbild.
  Bloecke rendern dort **still nichts**, kein Fallback auf `product.images`.
- Paketprodukte erkennt man am Metafeld `custom.qm_pro_paket`.
- €/m² ist die kundenseitige Leitgroesse; der Shopify-Listenpreis bleibt der
  interne Paketpreis und gehoert nicht prominent auf die Kollektionskarte.
- Produkteigenschaften nicht erfinden und nicht aus Bildern ableiten. Im Zweifel
  als offenen Fall dokumentieren.
- **Farbcodes werden abgeschrieben, nie fortgesetzt.** Echte Lieferantenlisten
  haben Luecken. **24 = 24 ist keine Pruefung** — verglichen werden die Codes
  selbst. `npm run farbcode:guard` findet das Zaehlmuster. → `docs/lessons/produktimport.md`

## Fertige Features — nicht neu bauen

€/m²-Anzeige, Paket-/Verschnittrechner samt Warenkorb-Logik, deutsche Paket- und
Bestellmengen-Anzeige, Produktvergleich (max. 3), Musterbestellung, Breadcrumb,
Produktvorteile, technische Daten, Produktkarten-Logik mit gekuerzten Titeln,
Predictive Search, Startseitenstruktur, Vinyl-Kategorie-Karussell, Mobile-Peek
und Karussell-Navigation. Alles getestet und in Benutzung.

## Deploy-Kette

```
Branch → PR → main → workflow:preview (unpublished Theme) → workflow:live
```

Preview und Live verlangen `branch === main && head === origin/main` und einen
sauberen Working Tree. Live zusaetzlich passende Preview-Evidence und explizite
Freigabe. **Die Kette darf der Agent eigenstaendig durchlaufen**, sobald der
Nutzer einen Deploy verlangt („deploy", „live stellen", „push das raus") — die
Freigabe-Flags sind Teil des Befehls, keine zweite Bestaetigung:

```
npm run workflow:doctor                     # zuerst - meldet alle Blocker auf einmal
node workflow/cli.mjs preview --theme-id <id> --approve-preview
node workflow/cli.mjs live --theme-id <id> --approve-live --approval-text "PUBLISH LIVE" --execute
```

Bricht ein Gate ab, ist das ein echter Befund — Ursache beheben, niemals das
Gate ausbauen. Ein abgelehnter Push mit „fetch first" ist meist nur der
Dashboard-Bot (`dashboard-data.yml` committet stuendlich nach `main`):
`git pull --rebase origin main`, dann erneut pushen.

## Sicherheitsgrenzen

Ohne ausdrueckliche Freigabe **nie**: Produkte/Varianten loeschen, SKUs aendern,
Preise, Checkout, Zahlung, Steuern oder Versand aendern, DNS/Domains aendern,
Rechtstexte aendern, kostenpflichtige Apps installieren, Kaeufe oder Abos
ausloesen, das Fallback-Theme (`Horizon`) loeschen oder ueberschreiben, Horizon
migrieren, grosse irreversible Shopify-Datenaenderungen ausfuehren.

Kleine, getestete Theme-Optimierungen duerfen eigenstaendig laufen. Grosse
architektonische Aenderungen erst analysieren und berichten.

**Berechtigungen:** Claude arbeitet im Bypass-Modus ohne Rueckfragen
(Entscheidung Ahmet, 2026-09-11). Die Grenzen oben gelten trotzdem.
**Keine `permissions.ask`-Regeln anlegen** — sie fragen in jedem Modus nach.
Harte Grenzen gehoeren als `deny` in `.claude/hooks/git-gh-guard.mjs`. Details: `.claude/README.md`.

`RISK_MODEL_SPEC.md` definiert die Gates, `RISK_MAP.yaml` und
`domains/shopify/risk-map.json` die Kategorien. Uebersteigt das Risiko das
erlaubte, greift `HARD_STOP`. Review-Schleifen laufen maximal dreimal, danach
`REVIEW_LIMIT_REACHED` → menschliches Gate.

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

## Dashboard (Control Center)

`docs/ai-dashboard/` ist das Control Center; Konzept in `docs/control-center/`
(**vor Aenderungen am Dashboard lesen**). `dashboard-data.yml` schreibt
`docs/ai-dashboard/issues.json` (Schema 2); das Frontend liest **nur** diese
Datei; lokal (`npm run dashboard`, `:8001`) kommt `/api/*` aus
`scripts/dashboard-api.mjs` dazu. Keinen GitHub-API-Aufruf mit Token ins
Frontend bauen. GitHub Issues sind die einzige Aufgabenquelle.

Label-Gruppen: `status:*`, `type:*`, `priority:p0`–`p3`, `area:*`, `reviewer:*`
(`./setup-dashboard.sh` legt sie an). Tests: `npm run dashboard:test`.

`issues.json` gehoert dem Bot: **nicht mitcommitten**, Dateien gezielt mit
`git add <datei>` stagen, nie `git add -A`. Zuruecksetzen ist fuer genau diesen
Pfad erlaubt — die einzige Ausnahme im Verwerfen-Verbot von
`.claude/hooks/git-gh-guard.mjs`, der sonst jede Stelle im Befehl prueft und
fail-closed blockiert (Fliesstext mit Git-Befehlen per Heredoc).
→ `docs/lessons/dashboard-issues-json.md`

**Aufgaben pflegen sich ueber Ereignisse selbst** (`task-automation.yml`):
neues Issue → Eingang, PR referenziert `#n` → In Arbeit, PR gemergt → Review,
Issue geschlossen → Erledigt. Prioritaeten und Owner nie automatisch.

**KI-Sessions legen ihre Arbeit als Aufgabe an und fuehren den Status nach.**
Zwischenstand und Entscheidungen gehoeren als Notiz ans Issue — das ist der
Mac-uebergreifende Handoff, kein zweiter Aufgabenspeicher:

```
npm run task -- create "Titel" --area google --type technik --prio p2 --owner kontakt755
npm run task -- start 92 --owner kontakt755 --note "Beginne mit …"
npm run task -- review 92 --note "PR #101, Tests gruen"
npm run task -- done 92 --confirm --note "gemergt"
npm run task -- block 92 --reason "Warte auf … von Ahmet"
```

Owner ist Ahmet = GitHub-Login `kontakt755`. `Closes #n` im PR-Text schliesst beim Merge.

## Tests

```
npm test                    # qa:unit:test
npm run automation:test
npm run workflow:test
npm run control:center:test
npm run qa                  # volle Suite inkl. visuell (nur lokal)
```

## Konventionen

- Eigene Bloecke/Snippets tragen das Praefix `tp-`; `_`-Praefix ist privat (keine `presets` noetig).
- CSS gehoert in `{% stylesheet %}`, nicht in ein inline `<style>` pro Karte.
- Kommentare und Commit-Messages auf Deutsch, ohne Umlaute in Liquid-Kommentaren.
- Immer im aktuellen Repository-Root arbeiten; keine absoluten Pfade — das Repo
  liegt auf Windows, macOS und Linux.
- `AppBlockValidTags` aus `theme check` trifft ~140 Dateien inklusive
  Horizon-Kern — bekanntes False-Positive.

## Weiterfuehrend

`AGENTS.md` (zentrale Regeln, zuerst lesen) · `docs/lessons/` (die Vorfaelle
hinter den Regeln) · `AI_ORCHESTRATOR_MASTER_SPEC.md` · `RISK_MODEL_SPEC.md` ·
`SHOPIFY_MASTER_ROADMAP.md` · `QUICK_START.md` · `docs/MULTI_MAC_WORKFLOW.md`
(mehrere Rechner, Cloud-Sync-Fallen) · `docs/control-center/` ·
`domains/shopify/linoleum-rollenware-template.md` ·
`domains/shopify/produktimport-arbeitsweise.md` (**vor jedem Lieferantenimport lesen**)
