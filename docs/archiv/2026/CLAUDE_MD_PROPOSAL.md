# Vorschlag: überarbeitete CLAUDE.md

Entwurf, keine echte Konfigurationsdatei. Ersetzt **nicht** automatisch
`CLAUDE.md` im Repo-Root — siehe Bericht am Ende dieser Datei für Diff und
offene Punkte. Ziel: unter 200 Zeilen, nur Dinge, die in jeder Session gelten;
Sicherheits- und Routing-Details werden referenziert statt dupliziert.

---

```markdown
# TeppichParadies — Shopify Horizon Theme

Shop: `www.teppich-paradies.net` · Store: `sjjyq1-6w.myshopify.com` · Theme: Horizon (Shopify 2.0)

Zentrale, verbindliche Regelquelle ist **AGENTS.md** (zuerst lesen). Diese
Datei ist die Kurzfassung für den Session-Alltag: Befehle, Kurzarchitektur,
die immer wiederkehrenden Fallstricke.

## Befehle (jede Session)

\`\`\`
npm test                     # = npm run qa:unit:test
npm run workflow:test        # Workflow-Router-Unittests
npm run secret:scan          # vor jedem Commit mit neuen/sensiblen Dateien
npm run seo:check            # read-only, lokal
\`\`\`

Es gibt **keine** `ai:route`/`ai:continue`/`ai:batch`-Scripts — das ist eine
Verwechslung mit dem in `CLAUDE_ROUTER.md` beschriebenen, aber nicht (mehr)
verdrahteten Router-Konzept (siehe „Auffälligkeiten" unten). Die tatsächliche
Routing-Kette:

\`\`\`
npm run workflow:route -- "Neue Aufgabe: <Beschreibung>"   # Klasse A-D
npm run workflow:doctor                                     # vor jedem Deploy: alle Blocker auf einmal
npm run workflow:next / workflow:continue                   # naechster sicherer Schritt
\`\`\`

Details zu Klassen, Testtiefe, Review und Protected Actions: `docs/AI_ROUTER.md`.

Vor jedem Commit zusätzlich:

\`\`\`
npm run liquid:guard && npm run schema:guard && npm run template:guard && npm run theme:guard
node workflow/cli.mjs validate --static
\`\`\`

Volles `npm run qa` (inkl. Browser/SEO/Sales gegen die Storefront) läuft nur
lokal auf dem Mac, nicht in Remote-Sessions (siehe unten).

## Welches Theme ist live?

Nicht raten, keine ID aus Prosa übernehmen. Einzige Quelle:
`domains/shopify/live-theme.json`, gehalten von `npm run theme:guard`.
Nachprüfen über Shopify-MCP:

\`\`\`graphql
query { themes(first: 20) { nodes { id name role updatedAt } } }
\`\`\`

Live ist der Knoten mit `role: MAIN`.

## Die immer wiederkehrenden Fallstricke (je eine Sitzung gekostet)

1. **Ein Block ist Code, kein Klickvorgang.** Eintrag in `blocks` +
   `block_order` in `templates/*.json`. `npm run theme:block list|add|remove`.
2. **Fehlendes `"presets"` im Block-Schema → deployed, aber im Editor
   unsichtbar**; unbekannte Schema-Keys werden still ignoriert.
   `npm run schema:guard` fängt beides.
3. **`{% render 'x' as var %}` gibt es in Liquid nicht.** Shopify verwirft die
   Datei beim Push ohne Fehlermeldung; `shopify theme check` sieht das nicht,
   `npm run liquid:guard` schon. Korrekt: `{% capture var %}{% render 'x' %}{% endcapture %}`.
4. **Nie von Hand ins Preview-Theme pushen** — das Live-Gate verlangt
   `previewDiffCount === 0` gegen `origin/main`.
5. **Fertige Arbeit kann auf einem ungemergten Branch liegen**, nicht im
   Gedächtnis: `git log --all --diff-filter=A -- <pfad>`,
   `git branch -r --no-merged main`. Beim Zurückholen immer die **ganze
   Gruppe** zusammengehöriger Blöcke nehmen, nie eine einzelne Datei — sonst
   lehnt Shopify den gesamten Push ab. Theme-Dateien vom alten Branch,
   Infrastruktur (`workflow/`, `qa/`, `package.json`, `AGENTS.md`) von `main`.

Guards dagegen: `npm run essential:guard` (Pflichtdateien/Template-Verweise),
`npm run unmerged:guard` (Deploy aus ungemergtem Branch erkennen), Pre-Commit-
Hook (warnt ab 7, blockiert ab 30 Tagen auf ungemergtem Branch).

## Shopify-Schreibzugriff — nicht nach einem Token suchen

Der Shopify-MCP-Server ist bereits authentifiziert. Schreibzugriffe (Produkte,
Varianten, Metafelder, Preise) laufen über `graphql_query`/`graphql_mutation`
— **kein** `shpat_`-Token nötig. Unsicher, ob eine Mutation existiert? Erst
`graphql_schema(types: [...])` fragen, nicht raten und nicht in den Browser
ausweichen (kostete zweimal je eine ganze Sitzung).

Variantenpreis/SKU: `productVariantsBulkUpdate` (SKU verschachtelt in
`inventoryItem: { sku }`). Neue Option: `productOptionsCreate` mit
`variantStrategy: LEAVE_AS_IS`. `productVariantUpdate`/`-Create` existieren
nicht.

Einzige Ausnahme mit echtem Token: `.github/workflows/grosshandel-sync.yml`
(Repository-Secret `SHOPIFY_ADMIN_TOKEN`, Präfix `shpat_`). `atkn_…`-Tokens
sind Automatisierungs-Tokens ohne Admin-GraphQL-Zugriff.

## Produktdaten

- Farben sind eine echte Option `Farbe` mit Bild je Variante — Blöcke gehen
  auf die **Option**, nicht auf `product.variants`.
- Rollenware-/Fixpreis-Produkte haben nur `Default Title`, kein Variantenbild.
  Blöcke rendern dort still nichts, kein Fallback auf `product.images`.
- Paketprodukte: Metafeld `custom.qm_pro_paket`. €/m² ist die Kundengröße,
  der Listenpreis bleibt der interne Paketpreis.
- Farbcodes werden **abgeschrieben, nie fortgesetzt** — echte Lieferantenlisten
  haben Lücken. `npm run farbcode:guard` findet durchgezählte Serien.
- Nichts erfinden oder aus Bildern ableiten; Unklares als offenen Fall
  dokumentieren.

## Fertige Features — nicht neu bauen

€/m²-Anzeige, Paket-/Verschnittrechner samt Warenkorblogik, deutsche Paket-/
Bestellmengen-Anzeige, Produktvergleich (max. 3), Musterbestellung,
Breadcrumb, Produktvorteile, technische Daten, Produktkarten-Logik mit
gekürzten Titeln, Predictive Search, Startseitenstruktur,
Vinyl-Kategorie-Karussell, Mobile-Peek/Karussell-Navigation.

## Deploy-Kette

\`\`\`
Branch → PR → main → workflow:preview (unpublished Theme) → workflow:live
\`\`\`

Beide Stufen verlangen sauberen `main`-Checkout; Live zusätzlich passende
Preview-Evidence und explizite Freigabe. Bei einem klaren Deploy-Auftrag
("deploy", "live stellen") keine zusätzliche Rückfrage — die Freigabe-Flags
sind Teil des Befehls:

\`\`\`
npm run workflow:doctor
node workflow/cli.mjs preview --theme-id <id> --approve-preview
node workflow/cli.mjs live --theme-id <id> --approve-live --approval-text "PUBLISH LIVE" --execute
\`\`\`

Bricht ein Gate ab, ist das ein echter Befund — Ursache beheben, nie das Gate
ausbauen.

## Sicherheitsgrenzen

Vollständige, verbindliche Liste in **AGENTS.md → „NIEMALS ohne ausdrückliche
Freigabe"** (Preise, SKUs, Checkout/Zahlung/Steuern/Versand, DNS, Rechtstexte,
kostenpflichtige Apps, Fallback-Theme `Horizon`, Horizon-Migration,
irreversible Datenänderungen). Kleine, getestete Theme-Optimierungen dürfen
eigenständig direkt live gehen.

## Konventionen

- Präfix `tp-` für eigene Blöcke/Snippets; `_`-Präfix = privat (keine
  `presets` nötig).
- CSS in `{% stylesheet %}`, nicht inline pro Produktkarte.
- Kommentare und Commits auf Deutsch, keine Umlaute in Liquid-Kommentaren.
- Immer im aktuellen Repo-Root arbeiten, keine absoluten Pfade — das
  Repository liegt auf Windows, macOS und Linux.
- `AppBlockValidTags` aus `theme check` trifft ~140 Dateien inklusive
  Horizon-Kern — bekanntes False-Positive, kein Handlungsbedarf.

## Remote-Sessions (claude.ai/code)

GitHub, Git-Push und Shopify-MCP (Admin API) funktionieren. Die Storefront
(`teppich-paradies.net`, `*.myshopify.com`) blockt mit 403 an der
Egress-Policy — kein Screenshot, kein `sales:check`/Browser-QA möglich,
deshalb dort `--static` verwenden. Deploys laufen lokal auf dem Mac.

## Weiterführend

`AGENTS.md` (zuerst lesen, verbindliche Regeln) · `docs/AI_ROUTER.md`
(Routing, Klassen, Protected Actions) · `RISK_MODEL_SPEC.md` ·
`SHOPIFY_MASTER_ROADMAP.md` · `docs/MULTI_MAC_WORKFLOW.md`
```

---

## Bericht

### (a) Was aktuell existiert

- `CLAUDE.md` im Repo-Root existiert bereits, 360 Zeilen. Inhaltlich solide
  und mit hart erarbeitetem Incident-Wissen (Theme-ID-Drift, Block-Presets,
  `render ... as var`, Preview-Drift, verwaiste Branches), aber:
  - dupliziert die komplette „NIEMALS ohne Freigabe"-Liste aus `AGENTS.md`
    fast wortgleich unter „Sicherheitsgrenzen",
  - dupliziert Klassen/States/Testtiefe aus `docs/AI_ROUTER.md` unter
    „AI-Orchestrator" mit teils abweichenden Begriffen (`workflow:route` vs.
    Zustände `PENDING → RUNNING → …`, die in `docs/AI_ROUTER.md` gar nicht
    vorkommen),
  - enthält einen Abschnitt „Dashboard" (GitHub-Actions-Datenfluss für
    `docs/ai-dashboard/`), der eher Infrastruktur-Doku als Session-Grundlage
    ist,
  - ist mit 360 Zeilen fast doppelt so lang wie das im Auftrag genannte Ziel.
- `RTK.md` existiert **nicht im Repo** — nur global unter
  `~/.claude/RTK.md`, eingebunden über `~/.claude/CLAUDE.md` (`@RTK.md`).
  Projektebene hat keinerlei rtk-Bezug: weder in `CLAUDE.md` noch `AGENTS.md`
  noch `.claude/settings.json` (Projekt) taucht `rtk` auf.
- Die rtk-Hook-Verzahnung sitzt ausschließlich **global** in
  `~/.claude/settings.json`:
  \`\`\`json
  "hooks": { "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "rtk hook claude" }] }] }
  \`\`\`
  Das Projekt-`.claude/settings.json` hat eigene `PreToolUse`-Hooks (Shopify-
  Deploy-Erkennung) und `Bash`-Permissions, aber keinen rtk-Bezug — beide
  Hook-Sets laufen unabhängig nebeneinander (Claude Code verkettet mehrere
  `PreToolUse`-Hooks für denselben Matcher).
- `rtk` ist installiert und funktioniert: `rtk 0.46.0` unter
  `/opt/homebrew/bin/rtk`, `rtk gain` zeigt reale Einsparungen (855 Befehle,
  46,2 % Tokenersparnis).

### (b) Der Vorschlag

Siehe Codeblock oben, gespeichert unter `docs/CLAUDE_MD_PROPOSAL.md` (diese
Datei) — **nicht** als `CLAUDE.md`. Kernänderungen gegenüber der aktuellen
Datei:

| Bereich | Aktuell (CLAUDE.md) | Vorschlag |
|---|---|---|
| Länge | 360 Zeilen | ~150 Zeilen |
| Sicherheitsregeln | Vollständige Liste dupliziert | Ein Satz + Verweis auf `AGENTS.md` |
| Routing/Klassen | Volle Zustandsmaschine dupliziert (teils inkonsistent zu `docs/AI_ROUTER.md`) | Ein Satz + Verweis auf `docs/AI_ROUTER.md`, dafür korrekte Befehle direkt nutzbar oben |
| Build/Test-Befehle | Verteilt über mehrere Abschnitte | Gebündelt ganz oben, inkl. Korrektur der nicht existierenden `ai:*`-Befehle |
| Dashboard-Abschnitt | Vorhanden (Infrastruktur-Detail) | Entfernt (gehört nicht zu „jede Session") |
| Prompt-Caching-Abschnitt | Vorhanden | Entfernt (API-Integrationsdetail, nicht Session-Basiswissen; steht bereits in `PROVIDER_ROUTING_SPEC.md`/`docs/AI_ROUTER.md`-Umfeld) |
| Incident-Lektionen | Sehr ausführlich mit Zitaten/Tabellen | Kompakt auf Kernaussage + Guard-Befehl verdichtet, Inhalt erhalten |
| rtk | Nicht erwähnt | Bewusst weiterhin nicht erwähnt (siehe Auffälligkeiten — gehört nicht ins Projekt) |

### (c) Auffälligkeiten in der rtk-/CLAUDE.md-Verzahnung

1. **rtk ist korrekt rein global verankert, nicht projektspezifisch** — das
   ist an sich unauffällig/richtig so (`RTK.md` selbst verweist auf die
   globale `CLAUDE.md`, nicht auf Projekt-Dateien). Kein Handlungsbedarf.
2. **Größerer Fund, unabhängig von rtk — korrigiert nach Gegenprüfung anhand
   von `git log`:** Erste Einschätzung war zu grob falsch. `CLAUDE_ROUTER.md`
   ist **keine tote Doku**, sondern beschreibt eine reale, getestete, am
   2026-09-04 nach `main` gemergte Funktion ("KI-Steuerzentrale": Router →
   Umsetzung → Test → unabhängige Codex-Prüfung → Korrektur/Human-Gate).
   Commit `b9a4bf1` brachte 42 Dateien selektiv aus einem Feature-Branch
   (`automation/dashboard/`, `automation/core/{cli-agent-cycle,claude-bridge,
   openrouter-*,gemini-*}.mjs`, `automation/scripts/{agent-loop,claude-router,
   codex-review}.mjs`, `.claude/hooks/{codex-stop-review,
   openrouter-user-prompt}.mjs`); Commit `8cff9568` **am selben Tag** führte
   die Arbeit mit echten Fixes und neuen Tests fort ("311 Tests grün, 27
   neu"). `automation:test` läuft aktuell weiterhin grün (182 Tests, 181
   pass, 1 skipped) — der Code ist nicht verrottet.

   Das eigentliche Problem ist **fehlende Verdrahtung, nicht fehlender
   Code**: Keines der in `CLAUDE_ROUTER.md` genannten Scripts
   (`claude:route`, `agents:loop`, `agents:review`, `ai:usage`) wurde je in
   `package.json` eingetragen; kein `Stop`-Hook existiert in
   `.claude/settings.json` (nur `UserPromptSubmit`, `SessionStart`,
   `PreToolUse`, `PostToolUseFailure`), obwohl `.claude/hooks/
   codex-stop-review.mjs` genau dafür angelegt wurde. Sogar die eigene
   Anleitung in `AI_DASHBOARD.md` ("Start: `npm run dashboard`") zeigt auf
   das **falsche, bereits bestehende** Script (das GitHub-Issues-Dashboard
   aus `scripts/build-dashboard-data.mjs`) statt auf
   `automation/dashboard/server.mjs` — reiner Namenskollisions-Zufall, für
   den echten Pfad existiert im ganzen Repo kein einziger Aufruf.

   Separat und unabhängig davon sind `ai:route`/`ai:continue`/`ai:usage`/
   `ai:batch` über `workflow/ai-control.mjs` tatsächlich ein anderer, älterer
   Prototyp, der **nie committet** wurde (nur als lokale, laut `.gitignore`
   Zeile 73 ignorierte Snapshots unter `.workflow/ai/baseline/TASK-*/` mit
   Stand 2026-08-20 bis 08-26 nachweisbar) — dieser Teil ist tatsächlich
   verworfen.

   **Empfehlung:** `CLAUDE_ROUTER.md`/`AI_DASHBOARD.md` nicht löschen.
   Stattdessen die fehlende Verdrahtung nachtragen — `package.json`-Scripts
   für `agents:loop`/`agents:review`/`claude:route`/`ai:usage` ergänzen (oder
   unter anderem Namen, um die Kollision mit dem bestehenden `dashboard`-
   Script zu vermeiden) und `AI_DASHBOARD.md`s Startbefehl korrigieren. Bis
   dahin `CLAUDE_ROUTER.md` mit einem Hinweis versehen: "gemergt, aber noch
   nicht verdrahtet — Start nur manuell über `node automation/dashboard/
   server.mjs`".
3. `package.json` hat kein `name`/`description`-Feld — nicht sicherheits-
   relevant, aber ungewöhnlich für ein Projekt dieser Größe.
4. Root-Verzeichnis enthält >45 einzelne `*.md`-Dateien (u. a.
   `MORNING_REPORT.md`, `NIGHT_SHIFT_REPORT.md`,
   `EVENING_INFRASTRUCTURE_REPORT.md`, `WINDOWS_SYNC_REPORT.md` …), die wie
   historische Einmal-Snapshots wirken statt lebende Dokumentation. Das
   erschwert das Auffinden der tatsächlich gültigen Quellen (`AGENTS.md`,
   `docs/AI_ROUTER.md`, `RISK_MODEL_SPEC.md`) und begünstigt genau das
   Stale-Doc-Muster aus Punkt 2. Kein Vorschlag zum Aufräumen in diesem
   Review enthalten, da außerhalb des Auftrags — nur als Beobachtung notiert.

### Nicht ausgeführt (wie beauftragt)

Kein Commit, kein Push, `CLAUDE.md` im Root wurde nicht verändert. Diese
Datei ist ausschließlich ein Vorschlag zur Prüfung.
