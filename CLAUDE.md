# TeppichParadies — Shopify Horizon Theme

Shop: `www.teppich-paradies.net` · Store: `sjjyq1-6w.myshopify.com` · Theme: Horizon (Shopify 2.0, Blocks/Sections)

## Welches Theme ist live?

**Nicht raten und keine ID aus einer Doku uebernehmen.** Die einzige Quelle ist
`domains/shopify/live-theme.json`; `npm run theme:guard` haelt sie mit dem
Repository konsistent. Steht eine Theme-ID irgendwo sonst als Fakt in Prosa,
ist das der Fehler, nicht die Quelle.

Zum Nachpruefen ueber den Shopify-MCP — live ist der Knoten mit `role: MAIN`:

```graphql
query { themes(first: 20) { nodes { id name role updatedAt } } }
```

Danach `live-theme.json` aktualisieren (inklusive `verifiedAt`), das alte Theme
unter `retired` eintragen und `npm run theme:guard` laufen lassen.

> Warum das eine eigene Regel ist: Bis 2026-09-03 nannten CLAUDE.md, AGENTS.md
> und die Roadmap `theme-productpage-v2-night` als Live-Theme. Dieses Theme
> existierte in der Admin API da schon nicht mehr. Agenten haben die ID
> trotzdem weiter als gesicherten Stand weitergegeben. Die stillgelegte ID
> steht jetzt unter `retired` in `live-theme.json` — bewusst nicht hier, denn
> `npm run theme:guard` verbietet Theme-IDs in Anweisungsdateien.

## Was hier immer wieder schiefging

Diese Punkte haben je eine komplette Sitzung gekostet. Vor dem Loslegen lesen.

**1. Der Theme-Editor ist nur eine Oberfläche über `templates/*.json`.**
Ein Block ist dort ein Eintrag in `blocks` plus einer in `block_order`. Blöcke
hinzufügen ist ein Code-Edit, kein Klickvorgang — und über 14 Collection-Templates
von Hand geklickt ist die Ursache dafür, dass die Templates auseinanderlaufen.

```
npm run theme:block list                                  # zeigt Drift sofort
npm run theme:block add tp-card-color-thumbs --after price
npm run theme:block remove tp-card-color-thumbs
```

**2. Ein Block ohne `"presets"` im Schema wird deployed und ist trotzdem unsichtbar.**
Shopify nimmt ihn nicht in die Block-Auswahl auf. Ebenso werden unbekannte
Schema-Keys (z. B. `"target"`) stillschweigend ignoriert. Vorlage ist das Schema
von `blocks/tp-card-specs.liquid`. `npm run schema:guard` fängt beides.

**3. `{% render 'x' ... as var %}` gibt es in Liquid nicht.**
Shopify verwirft die Datei beim Push **ohne Fehlermeldung**; zur Laufzeit kommt
dann „Could not find asset". `shopify theme check` sieht das nicht,
`npm run liquid:guard` schon. Korrekt ist `{% capture var %}{% render 'x' %}{% endcapture %}`.

**4. Nie von Hand ins Preview-Theme pushen.**
Das Live-Gate verlangt `previewDiffCount === 0`, also Preview exakt gleich
`origin/main`. Ein Direktpush über die Admin API erzeugt genau die Drift, die
`PREVIEW_DRIFT` abfangen soll, und macht die Live-Evidence wertlos.

**5. Eine Theme-ID in Prosa veraltet, ohne dass es jemand merkt.**
Siehe oben. Deshalb `domains/shopify/live-theme.json` plus `npm run theme:guard`.

## Vor jedem Commit

```
npm run liquid:guard && npm run schema:guard && npm run template:guard && npm run theme:guard
node workflow/cli.mjs validate --static      # Flag heisst --static, nicht --static-only
```

Der volle Lauf (`validate` ohne `--static`) braucht die Storefront und läuft nur
lokal auf dem Mac. Unbekannte Flags brechen ab, statt still ignoriert zu werden.

## Werkzeuge

| Befehl | Zweck |
|---|---|
| `npm run workflow:doctor` | **vor jedem Deploy**: alle Voraussetzungen in einem Lauf, statt sechsmal nacheinander an je einem Gate zu scheitern |
| `npm run theme:block list\|add\|remove` | Blöcke in Templates setzen, statt im Editor zu klicken |
| `npm run liquid:guard` | ungültiges Liquid, das Shopify still verwirft |
| `npm run schema:guard` | Block-Schemata, die deployen aber im Editor unsichtbar bleiben |
| `npm run template:guard` | Kollektions-Templates, deren Produktkarte abweicht |
| `npm run theme:guard` | veraltete Theme-IDs in Anweisungsdateien, ungeschütztes Live-Theme |
| `npm run farbcode:guard` | Farbvarianten, deren Codes durchgezählt statt abgeschrieben wurden |
| `npm run theme:diff -- --manifest <datei>` | Theme gegen Repository abgleichen |
| `npm run workflow:scratch -- --theme-id <id>` | Wegwerf-Theme zum Ausprobieren, ohne Evidence |

**`theme:diff`** braucht ein Manifest aus der Admin API. Über den Shopify-MCP:

```graphql
query { theme(id: "gid://shopify/OnlineStoreTheme/<id>") {
  name files(first: 250) { pageInfo { hasNextPage endCursor }
  nodes { filename checksumMd5 } } } }
```

`checksumMd5` ist die MD5-Summe der Rohbytes und damit direkt mit lokalen
Dateien vergleichbar. Bei `hasNextPage` mit `after: "<endCursor>"` weiterblättern
(das Theme hat rund 500 Dateien, also zwei Seiten). Ergebnis als
`{themeId, themeName, files:[{filename, checksumMd5}]}` ablegen.

**`workflow:scratch`** ist die Lane zum Ausprobieren: läuft aus jedem Branch,
auch mit uncommitteten Änderungen, und schreibt bewusst **keine** Evidence.
Sie verweigert das Live-Theme und das Theme, auf dem die Preview-Evidence
beruht. Zum Deployen bleibt es bei `preview` → `live`.

## Shopify-Schreibzugriff — nicht nach einem Token suchen

**Der Shopify-MCP-Server ist bereits authentifiziert.** Produkte, Varianten,
Metafelder und Preise laufen ueber `graphql_query` / `graphql_mutation` des
MCP-Servers. Es wird **kein** `SHOPIFY_ADMIN_TOKEN` gebraucht, weder als
Umgebungsvariable noch aus einer Datei. Wer in einer Sitzung anfaengt, einen
`shpat_`-Token zu suchen, verliert Zeit an einem Problem, das nicht existiert.

Der einzige Ort, der einen echten Token braucht, ist der **GitHub-Actions-Job**
(`.github/workflows/jordanshop-sync.yml`) — dort laeuft kein MCP-Server, deshalb
liegt der Token als Repository-Secret `SHOPIFY_ADMIN_TOKEN`.

Token-Typen nicht verwechseln:

| Praefix | Wofuer | GraphQL Admin API? |
|---|---|---|
| `atkn_` | App-Automatisierungstoken, CI/CD und Webhooks | **nein** — liefert „Invalid API key or access token" |
| `shpat_` | Admin API access token einer Store-App | ja |

Variantenpreis und SKU setzt `productVariantsBulkUpdate` (SKU im verschachtelten
`inventoryItem: { sku }`). `productVariantUpdate`, `productVariantCreate` und
`productVariantsUpdate` existieren nicht — wer die probiert und aufgibt, kommt
faelschlich zu dem Schluss, Varianten gingen nur ueber den Browser.

> Warum das hier steht: Am 2026-09-04 ist eine komplette Sitzung dafuer
> draufgegangen, einen `shpat_`-Token zu suchen und Variantenpreise ueber
> Chrome-Automation zu setzen — beides unnoetig. Der MCP-Server konnte die
> Schreibzugriffe die ganze Zeit.

## In Remote-Sessions (claude.ai/code)

| | Status |
|---|---|
| GitHub, git push | geht |
| Shopify Admin API (Shopify MCP) | geht — liest Theme-Dateien und Produktdaten, schreibt in unpublished Themes |
| Storefront `teppich-paradies.net` / `*.myshopify.com` | **403 an der Egress-Policy** — keine Screenshots möglich |
| Shopify CLI (`theme push/pull/list`) | kein Token + Domains blockiert |

Praktische Folge: Struktur und Syntax sind hier prüfbar, **das Aussehen nicht**.
Browser-Schritte (COMPARE, SEO, FULL_QA, SALES) schlagen hier zwangsläufig fehl —
deshalb `--static`. Deploys laufen lokal.

## Produktdaten (bestimmt, was Blöcke rendern dürfen)

- Farben sind eine echte Produktoption `Farbe` mit Bild je Variante
  (z. B. Floresta: 8 Werte). Blöcke sollten auf die **Option** gehen, nicht auf
  `product.variants` — sonst erscheint dieselbe Farbe mehrfach, wenn zusätzlich
  Breiten-/Längenvarianten existieren.
- Fixpreis-/Rollenware-Produkte haben nur `Default Title` und kein Variantenbild.
  Blöcke müssen dort **still nichts rendern**, kein Fallback auf `product.images` —
  das zeigt sonst Detailfotos als vermeintliche Farben.
- Paketprodukte erkennt man am Metafeld `custom.qm_pro_paket`.
- €/m² ist die kundenseitige Leitgröße; der Shopify-Listenpreis bleibt der
  interne Paketpreis und gehört nicht prominent auf die Kollektionskarte.
- Produkteigenschaften nicht erfinden und nicht aus Bildern ableiten. Im Zweifel
  als offenen Fall dokumentieren.
- **Farbcodes werden abgeschrieben, nie fortgesetzt.** Am 2026-09-04 führte
  „Elastium Linoleumboden" 24 Farbvarianten, von denen 21 erfunden waren: ab
  4290 war lückenlos hochgezählt worden. Die Anzahl stimmte damit, der Inhalt
  nicht — **24 = 24 ist keine Prüfung**, verglichen werden die Codes selbst.
  Echte Lieferantenlisten haben Lücken, weil sie gewachsen sind.
  `npm run farbcode:guard` findet das Zählmuster.

## Fertige Features — nicht neu bauen

€/m²-Anzeige, Paket-/Verschnittrechner samt Warenkorb-Logik, deutsche Paket- und
Bestellmengen-Anzeige, Produktvergleich (max. 3), Musterbestellung, Breadcrumb,
Produktvorteile, technische Daten, Produktkarten-Logik mit gekürzten Titeln,
Predictive Search, Startseitenstruktur, Vinyl-Kategorie-Karussell, Mobile-Peek
und Karussell-Navigation. Alles getestet und in Benutzung.

## Deploy-Kette

```
Branch → PR → main → workflow:preview (unpublished Theme) → workflow:live
```

Preview und Live verlangen beide `branch === main && head === origin/main` und
einen sauberen Working Tree. Live zusätzlich passende Preview-Evidence und
explizite Freigabe. Die Gates sind Absicht — nicht umgehen, sondern die Kette
durchlaufen.

**Die Kette darf der Agent eigenständig durchlaufen**, sobald der Nutzer einen
Deploy verlangt („deploy", „live stellen", „push das raus"). Es ist keine
Rueckfrage noetig, ob er das wirklich will — die Freigabe-Flags sind Teil des
Befehls, nicht eine zweite Bestaetigung:

```
npm run workflow:doctor                     # zuerst - meldet alle Blocker auf einmal
node workflow/cli.mjs preview --theme-id <id> --approve-preview
node workflow/cli.mjs live --theme-id <id> --approve-live --approval-text "PUBLISH LIVE" --execute
```

Bricht ein Gate ab, ist das ein echter Befund (dreckiger Tree, fehlende
Evidence, P0/P1-Finding) — dann die Ursache beheben und die Kette erneut
durchlaufen, niemals das Gate ausbauen.

`dashboard-data.yml` committet stuendlich `docs/ai-dashboard/issues.json` nach
`main`. Ein abgelehnter Push mit „fetch first" ist deshalb meist nur dieser Bot
und kein Konflikt: `git pull --rebase origin main`, dann erneut pushen. Screenshots und visuelle Pruefung laufen
lokal auf dem Mac ueber die Browser-Tools; nur in Remote-Sessions blockt die
Egress-Policy die Storefront.

## Sicherheitsgrenzen

Ohne ausdrückliche Freigabe **nie**: Produkte/Varianten löschen, SKUs ändern,
Preise, Checkout, Zahlung, Steuern oder Versand ändern, DNS/Domains ändern,
Rechtstexte ändern, kostenpflichtige Apps installieren, Käufe oder Abos
auslösen, das Fallback-Theme (`Horizon`) löschen oder überschreiben, Horizon
migrieren, große irreversible Shopify-Datenänderungen ausführen.

Kleine, getestete Theme-Optimierungen dürfen eigenständig laufen. Große
architektonische Änderungen erst analysieren und berichten.

`RISK_MODEL_SPEC.md` definiert die Gates, `RISK_MAP.yaml` und
`domains/shopify/risk-map.json` die Kategorien. Übersteigt das tatsächliche
Risiko das erlaubte, greift `HARD_STOP`. Review-Schleifen laufen maximal
dreimal, danach `REVIEW_LIMIT_REACHED` → menschliches Gate.

## AI-Orchestrator

- `workflow/router.mjs` — einzige Quelle für die deterministische Klassifikation A/B/C/D
- `workflow/core.mjs` — Zustandsautomat, Manifest-Laden, Risk-Engine
- `router_api_migration.py` — Python-Adapter für Claude-API-Aufrufe
- `api_cost_monitor.py` — Budget und Rate-Limits

Klassen: **A** lokal/deterministisch ohne LLM · **B** Haiku · **C** Sonnet ·
**D** Opus (nur mit ausdrücklicher Eskalation). Modelle kommen aus
`CLAUDE_HAIKU_MODEL`, `CLAUDE_SONNET_MODEL`, `CLAUDE_OPUS_MODEL` — keine
Modell-IDs hart verdrahten.

Zustände: `PENDING → RUNNING → IMPLEMENT → REVIEW → PASS`, daneben
`CORRECTION_REQUIRED`, `PARKED`, `SKIPPED_DEPENDENCY`, `NEEDS_AHMET`,
`HARD_FAIL`, `SECURITY_STOP`.

```
npm run workflow:state     # Klassifikationen und Blocker
npm run workflow:next      # nächste zulässige Aufgabe
npm run workflow:continue  # nach menschlichem Eingriff weiter
```

Blocker-Typen aus `workflow:state`: `RATE_LIMIT`, `UPSTREAM`, `CODE_DEFECT`,
`UNKNOWN_BLOCKER`.

### Prompt-Caching

Nur stabilen, wiederverwendbaren Kontext cachen (Projektregeln, Tool-Schemata,
versionierte Context-Packs). Aufgabe, Diffs, Zeitstempel und dynamische
Tool-Ergebnisse gehören **hinter** den Cache-Breakpoint. Cache-Treffer über die
tatsächlichen `usage`-Felder prüfen, nicht über Marker.

API-Key ausschließlich über Umgebungsvariable oder Secret-Manager, nie als
CLI-Argument. Vor dem ersten Aufruf `./api_cost_check.sh` (read-only) und
`python3 demo_run.py` (offline).

## Dashboard

Die Metriken laufen ohne Token im Browser:

1. `.github/workflows/dashboard-data.yml` läuft bei jedem Issue-Event und stündlich
2. `scripts/build-dashboard-data.mjs` schreibt `docs/ai-dashboard/issues.json`
3. `docs/ai-dashboard/index.html` liest **nur** diese JSON-Datei

Lokal: `npm run dashboard` (baut die Daten, serviert auf `:8001`). Keinen
GitHub-API-Aufruf ins Frontend zurückbauen — ohne Token schlägt er fehl, und ein
Token in Frontend-JS wäre öffentlich.

Label-Gruppen: `status:*` (eingang, geplant, in-arbeit, review, korrektur,
blockiert, fertig), `type:*`, `priority:p0`–`p3`, `area:*`.
`./setup-dashboard.sh` legt sie an.

## Tests

```
npm test                    # qa:unit:test
npm run automation:test
npm run workflow:test
npm run control:center:test
npm run qa                  # volle Suite inkl. visuell (nur lokal)
```

## Konventionen

- Eigene Blöcke/Snippets tragen das Präfix `tp-`.
- Blöcke mit `_`-Präfix sind privat (nur verschachtelt, keine `presets` nötig).
- CSS gehört in `{% stylesheet %}`, nicht in ein inline `<style>` pro Karte —
  letzteres dupliziert die Regeln für jede Produktkarte im Raster.
- Kommentare und Commit-Messages auf Deutsch, ohne Umlaute in Liquid-Kommentaren.
- Immer im aktuellen Repository-Root arbeiten; keine absoluten Pfade wie
  `/Users/tristan/...` — das Repo liegt auf Windows, macOS und Linux.
- `AppBlockValidTags` aus `theme check` trifft ~140 Dateien inklusive
  Horizon-Kern — bekanntes False-Positive, kein Handlungsbedarf.

## Weiterführend

`AGENTS.md` (zentrale Regeln, zuerst lesen) · `AI_ORCHESTRATOR_MASTER_SPEC.md` ·
`RISK_MODEL_SPEC.md` · `SHOPIFY_MASTER_ROADMAP.md` · `QUICK_START.md` ·
`docs/MULTI_MAC_WORKFLOW.md` (Regeln fuer mehrere Rechner, Cloud-Sync-Fallen) ·
`docs/ai-dashboard/`
