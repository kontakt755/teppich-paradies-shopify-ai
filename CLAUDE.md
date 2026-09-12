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

**6. Fertige Arbeit liegt auf Branches, die nie gemergt wurden — sie ist nicht weg, nur nie live.**
Zwei Fälle am 2026-09-05, beide über Wochen unbemerkt:

| Branch | Was darauf lag |
|---|---|
| `claude/teppich-produktseite-redesign-ru2sis` | Wunschmaß-Rechner, Produktdetails, 5 Blöcke + Template |
| `feature/design-analyse-quickfixes` | grüner Rollenware-Konfigurator, Schrittführung, Design-System, Musterbestellung — 49 Commits |

Der Shop zeigt nur, was in `main` ist. Ein Branch ohne Merge ist für den Kunden nicht existent.
Wer sucht, sucht deshalb im **Git-Verlauf**, nicht in der Erinnerung:

```
git log --all --oneline --diff-filter=A -- <pfad>   # wo entstand die Datei
git branch -a --contains <commit>                   # auf welchem Branch liegt sie
git branch -r --no-merged main                      # was ist sonst noch ungemergt
```

**Beim Zurückholen die ganze Gruppe nehmen, nie die eine Datei.** Am 2026-09-05 wurden
`tp-step` und `tp-rollware-anzeige` einzeln gepickt — ihre Abhängigkeiten `tp-vertrauen`
und `tp-bewertungsbeleg` blieben zurück, und Shopify lehnte daraufhin den **gesamten**
Template-Push ab. Die Meldung nannte nur den Block, nicht die Ursache; das kostete eine
Stunde. `npm run essential:guard` findet genau diesen Zustand vorher.

Beim Übernehmen eines alten Branches gilt: **Theme-Dateien vom Branch, Infrastruktur von
main.** `workflow/`, `qa/`, `package.json` und `AGENTS.md` sind auf main fast immer
neuer — ein Branchstand von vor Wochen dreht dort stillschweigend Fixes zurück.

Drei Gates halten das jetzt:
- `npm run essential:guard` — Pflichtdateien aus `domains/shopify/essential-files.json`
  und jeder Template-Verweis müssen existieren. Greift auch bei einem frisch angelegten
  Theme, weil er das Repository prüft und nicht das Theme.
- `npm run unmerged:guard` — blockiert Deploys aus einem ungemergten Branch.
- Pre-Commit-Hook — warnt ab 7 Tagen, blockiert ab 30 Tagen auf ungemergtem Branch.

**6b. Ein toter Menuelink sieht im Editor genauso aus wie ein lebender.**
Zweimal ist derselbe Fehler wochenlang live gestanden: Menuepunkte filtern per
`?filter.p.m.custom.<feld>=<Metaobjekt>` und liefern ein leeres Raster. Zwei
verschiedene Ursachen, gleiches Symptom:

| Fall | Ursache | Fix |
|---|---|---|
| Vinyl (108467d) | kein Produkt trug den gefilterten Wert | Metafelder gesetzt |
| Bodenleisten (#123) | Wert korrekt, aber Produkte liegen in einer anderen Kollektion | Links auf die richtige Kollektion umgehaengt |

Die zweite Diagnose ist die verfuehrerische: „Metafelder fehlen" liegt nahe und ist
falsch. **Erst zaehlen, welche Werte die Produkte der Kollektion tatsaechlich tragen**,
dann entscheiden. `npm run menu:guard` findet den Zustand; die Ursache klaert nur
eine Abfrage.

Beim Aendern des Menues: `menuUpdate` ersetzt den **gesamten** Item-Baum. Vorher den
kompletten Bestand auslesen und alle anderen Zweige mit ihren MenuItem-IDs unveraendert
zurueckschreiben. Gegenprobe ist, dass die Menge der MenuItem-IDs vorher und nachher
identisch ist — nicht `userErrors: []`.

**7. Ein Produktimport, der ohne geklärte Namensregeln startet, wird zweimal gebaut.**
Am 2026-09-07 entstanden sieben Linoleum-Produkte mit Lieferantennamen im Titel
(Linienname der Hausmarke von A) und englischen Farbnamen samt Nummer (`1032 green melody`) — beides
musste vollständig zurückgebaut werden, obwohl die Regel im Import-Skill stand und die
zwei fertigen Produkte im Shop (Coloria, Elastium) sie vormachten. **Das nächstliegende
fertige Produkt abfragen und daran entlangbauen** — eine Query gegen eine Sitzung.

Ebenfalls dort: warum Lieferantenseiten mit `curl` statt Browser gelesen werden,
warum `productSet` nur für **neue** Produkte taugt (auf bestehenden bricht es an doppelten
Metafeldern ab und lässt die alte Variantenstruktur stehen), und warum nach jedem
Schreibvorgang gegengeprüft wird — `userErrors: []` ist kein Beleg, dass das Ergebnis stimmt.
→ `domains/shopify/produktimport-arbeitsweise.md`

Dieselben Korrekturen stecken im Import-Skill für Lieferant A (`teppichparadies-*-import` in der
Skill-Liste). Der liegt in einem **synchronisierten** Bundle unter
`~/Library/Application Support/Claude/…/skills-plugin/` — ein Sync von claude.ai setzt ihn zurück.
Sicherung und Wiederherstellung (der gepatchte Volltext und `skill-patch.py`, das die Patches
erneut einspielt und sauber abbricht, wenn der Skill bereits gepatcht ist oder sich geändert hat)
liegen **nur lokal** unter `~/teppich-paradies-analyse/lieferantendaten/` — beide enthalten
Lieferantendaten, siehe Punkt 8.

**8. Lieferantennamen gehören nicht ins Repository.**
Repository, Issues und Dashboard sind öffentlich; Bezugsquellen sind Geschäftsgeheimnis
(Regel des Inhabers, 2026-09-11). In Dateien, Commit- und PR-Texten und `npm run task`-Notizen
stehen deshalb nur Pseudonyme: **Lieferant A** bis **Lieferant D**, **Hausmarke von A**,
Linoleum-Linien **A-1** bis **A-3**, URLs als `lieferant-a.example`. Schlüssel, Rohdaten,
Scraper und Import-Pläne liegen nur lokal unter `~/teppich-paradies-analyse/lieferantendaten/`
(Übersicht dort in `INHALT.md`, im Repo `domains/lieferanten/AUSGELAGERT.md`). SKUs bleiben
unverändert — sie sind die Kennungen im Shop und dort ohnehin öffentlich. Die Git-Historie
enthält ältere Stände mit Namen; sie wird bewusst nicht umgeschrieben.

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
| `npm run router:status` | **bevor jemand behauptet, der Router laufe nicht**: Hooks, Keys und letzter Provider-Aufruf in einem Lauf |
| `npm run router:setup` | **auf einem neuen Rechner**: legt `.env.local` aus `.env.example` an und nennt die zwei fehlenden Keys |
| `npm run theme:block list\|add\|remove` | Blöcke in Templates setzen, statt im Editor zu klicken |
| `npm run liquid:guard` | ungültiges Liquid, das Shopify still verwirft |
| `npm run schema:guard` | Block-Schemata, die deployen aber im Editor unsichtbar bleiben |
| `npm run template:guard` | Kollektions-Templates, deren Produktkarte abweicht |
| `npm run theme:guard` | veraltete Theme-IDs in Anweisungsdateien, ungeschütztes Live-Theme |
| `npm run menu:guard` | Menuelinks, die auf ein leeres Produktraster oder ins Nichts zeigen (braucht Netz) |
| `npm run unmerged:guard` | Blöcke/Templates auf ungemergten Branches erkennen, die nicht deployed werden |
| `npm run essential:guard` | Pflichtdateien und Template-Verweise — findet verlorene Bausteine vor dem Push |
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
(`.github/workflows/grosshandel-sync.yml`) — dort laeuft kein MCP-Server, deshalb
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

Eine neue Produktoption setzt `productOptionsCreate` (nicht `productUpdate`).
Mit `variantStrategy: LEAVE_AS_IS` tragen alle vorhandenen Varianten den neuen
Wert, ohne dass eine einzige neu angelegt wird.

**Bevor „die API kann das nicht" faellt, das Schema fragen.** Ein Aufruf von
`graphql_schema` mit dem vermuteten Input-Typ (`OptionCreateInput`,
`ProductVariantsBulkInput`, …) beantwortet die Frage in 1 Aufruf:

```
graphql_schema(types: ["OptionCreateInput"])  # Welche Mutations nutzen diesen Input?
graphql_schema(types: ["Query", "Mutation"]) # Alles verfügbar?
```

Das gilt auch fuer Subagenten: Ihnen den Mutationsnamen im Prompt vorzugeben ist
die Ursache, nicht die Hilfe — sie sollen ihn im Schema nachschlagen. Der
Browser ist hier nie der Ausweichweg, sondern der teuerste Irrweg.

> Warum das hier steht: Am 2026-09-04 ist eine komplette Sitzung dafuer
> draufgegangen, einen `shpat_`-Token zu suchen und Variantenpreise ueber
> Chrome-Automation zu setzen — beides unnoetig. Der MCP-Server konnte die
> Schreibzugriffe die ganze Zeit.
>
> Am 2026-09-05 dasselbe Muster eine Ebene hoeher: Ein Subagent bekam von mir
> den erfundenen Namen `productCreateVariant` vorgesetzt, suchte 31 Aufrufe
> lang, scheiterte an `productUpdate` und meldete, Optionen gingen nur von
> Hand. Danach acht Runden Browser-Auswahl und Login — alles auf einer falschen
> Praemisse. Eine Schema-Abfrage haette es in einem Aufruf geklaert.

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

**Berechtigungen:** Claude arbeitet im Bypass-Modus ohne Rückfragen
(Entscheidung Ahmet, 2026-09-11). Die Grenzen oben gelten trotzdem – sie sind
Verhaltensregeln, keine Rückfragen. **Keine `permissions.ask`-Regeln anlegen:**
sie fragen in *jedem* Modus nach, auch unter Bypass, und haben genau die
Dauer-Rückfragen erzeugt, die abgeschafft werden sollten. Harte Grenzen gehören
als `deny` in `.claude/hooks/git-gh-guard.mjs`. Details: `.claude/README.md`.

`RISK_MODEL_SPEC.md` definiert die Gates, `RISK_MAP.yaml` und
`domains/shopify/risk-map.json` die Kategorien. Übersteigt das tatsächliche
Risiko das erlaubte, greift `HARD_STOP`. Review-Schleifen laufen maximal
dreimal, danach `REVIEW_LIMIT_REACHED` → menschliches Gate.

## AI-Orchestrator

- `workflow/router.mjs` — einzige Quelle für die deterministische Klassifikation A/B/C/D
- `workflow/core.mjs` — Zustandsautomat, Manifest-Laden, Risk-Engine
- `router_api_migration.py` — Python-Adapter für Claude-API-Aufrufe
- `api_cost_monitor.py` — Budget und Rate-Limits

Klassen und Modelle kommen aus **einer** Quelle, `workflow/model-matrix.mjs`
(Routing-Strategie seit 2026-09-08, Prioritaet Qualitaet vor Kosten):
**A** trivial/deterministisch → `haiku` low, kein Modell-Review ·
**B** normale Entwicklung → `fable` medium, Review Codex `gpt-5.6-sol` ·
**C** komplex → `fable` high, Review Codex `gpt-6-astra`, Zweitblick `gpt-5.6-sol` ·
**D** kritisch → `opus` high, Review Codex `gpt-6-astra` xhigh, Security-Review `fable`.
Corrector ist immer das Implementer-Modell; die Eskalationsleiter geht nur nach
oben (Effort → Peer-Modell opus/fable → Codex astra → Human Gate). Haiku ist ein
Werkzeug fuer Klasse A und Voranalysen, nie Hauptentwickler. Rollback:
`TP_ROUTING_STRATEGY=legacy`. Der Python-Adapter liest `CLAUDE_HAIKU_MODEL`,
`CLAUDE_FABLE_MODEL`, `CLAUDE_OPUS_MODEL` — keine Modell-IDs hart verdrahten.

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

### Läuft der Router gerade?

`npm run router:status` beantwortet das mit Belegen statt mit Vermutung. Die
Voranalyse hängt am `UserPromptSubmit`-Hook
(`.claude/hooks/openrouter-user-prompt.mjs`), das Codex-Review am `Stop`-Hook;
beide sind in `.claude/settings.json` verdrahtet und laufen automatisch.

Es gibt genau zwei Laufzeit-Belege — keine weiteren, auch wenn Namen wie
`ai-routing-decisions.jsonl` plausibel klingen:

- `.router/ai-usage.jsonl` — jeder Provider-Aufruf mit Modell und Kosten
- `.router/manifest-run/` — Zustand eines ManifestRunner-Laufs

**In einem Worktree fehlt das alles.** `.router/` ist gitignored, und ein Worktree
auf altem Stand kennt die Hooks noch nicht. Eine Dispatch-Session dort meldet
wahrheitsgemäß „existiert nicht", während der Router im Hauptverzeichnis
längst läuft. Nur `router:status` unterscheidet die beiden Fälle.

> Warum das hier steht: Am 2026-09-06 nannte ich einem anderen Chat drei
> Prüfpfade, von denen ich zwei erfunden hatte. Er meldete korrekt „existiert
> nicht", und daraus wurde der falsche Schluss, der Router sei nie gestartet —
> obwohl das Ledger im selben Moment 23 Gemini-Aufrufe auswies.

### Wenn das Codex-Review fremde Arbeit anmahnt

Meldet die unabhängige Prüfung Befunde zu Dateien, die man nie angefasst hat,
ist das kein Missverständnis, das sich durch Erklären auflöst — **zuerst
nachsehen, welchen Diff sie überhaupt gelesen hat**:

```
git -C <hauptcheckout> log --oneline -1     # HEAD dort
git diff --name-only origin/main..<eigener-branch>
```

Weichen die beiden auseinander, prüft der Reviewer einen fremden Arbeitsstand.
Bis 2026-09-10 passierte das in jedem Worktree zuverlässig: Beide Hooks nahmen
`CLAUDE_PROJECT_DIR` (den Hauptcheckout), wo die eigenen Commits gar nicht
liegen — wohl aber die einer parallel laufenden Sitzung. `resolveReviewDir` in
`automation/core/review-scope.mjs` behebt das.

**Die empfohlenen Korrekturen niemals blind ausführen.** Sie lauteten dreimal
hintereinander, fremde Commits „herauszulösen" und fremde ungetrackte Dateien
aufzuräumen. Beides hätte die uncommittete Arbeit anderer Sitzungen zerstört.
Fremde Änderungen gehören dem Branch, auf dem sie entstanden sind; Evidence für
fremden Code zu erzeugen wäre eine falsche Zusicherung.

Bleiben Befunde nach drei Runden bestehen, greift `REVIEW_LIMIT_REACHED`: die
verbleibenden Befunde berichten und aufhören, statt eine vierte Runde zu
provozieren.

### Prompt-Caching

Nur stabilen, wiederverwendbaren Kontext cachen (Projektregeln, Tool-Schemata,
versionierte Context-Packs). Aufgabe, Diffs, Zeitstempel und dynamische
Tool-Ergebnisse gehören **hinter** den Cache-Breakpoint. Cache-Treffer über die
tatsächlichen `usage`-Felder prüfen, nicht über Marker.

API-Key ausschließlich über Umgebungsvariable oder Secret-Manager, nie als
CLI-Argument. Vor dem ersten Aufruf `./api_cost_check.sh` (read-only) und
`python3 demo_run.py` (offline).

## Dashboard (Control Center)

`docs/ai-dashboard/` ist das Control Center (Heute, Arbeit, Freigaben, Bereiche, Insights,
Aktivität). Konzept und Statusmodell: `docs/control-center/` (Bestandsaufnahme, Architektur,
Changelog — **vor Änderungen am Dashboard lesen**).

1. `.github/workflows/dashboard-data.yml` läuft bei jedem Issue-Event und stündlich
2. `scripts/build-dashboard-data.mjs` schreibt `docs/ai-dashboard/issues.json` (Schema 2, ohne Bodies)
3. Das Frontend liest statisch **nur** diese Datei; lokal (`npm run dashboard`, `:8001`) kommt
   `/api/*` aus `scripts/dashboard-api.mjs` dazu: Statuswechsel, Owner, Kommentare über `gh`,
   serverseitig validiert mit denselben Regeln wie im Browser (`docs/ai-dashboard/lib/model.mjs`).

Keinen GitHub-API-Aufruf mit Token ins Frontend bauen — ein Token in Frontend-JS wäre öffentlich.
GitHub Issues bleiben die einzige Aufgabenquelle; kein zweiter Aufgabenspeicher.

Label-Gruppen: `status:*` (eingang, triage, geplant, bereit, in-arbeit, korrektur, review, freigabe,
blockiert, beobachten, fertig, abgebrochen), `type:*`, `priority:p0`–`p3`, `area:*`, `reviewer:*`.
`./setup-dashboard.sh` legt sie an. Solange `status:freigabe` fehlt, gilt
`status:blockiert` + `reviewer:mensch` als „Warten auf Freigabe" (Übergangsregel im Modell).

Beim Sessionstart zeigt `.claude/hooks/session-start.sh` den Kurzbrief (`npm run dashboard:brief`): Datenstand,
Zaehler und die drei dringendsten Aufgaben aus `issues.json` - ohne gh, auch in Worktrees und Remote-Sessions.

Tests: `npm run dashboard:test` (Modell, Export, API, Server, Automation, Brief), Teil von `npm test`.

`docs/ai-dashboard/issues.json` gehört dem Bot: lokal wird sie von `npm run task` und `npm run dashboard`
neu erzeugt, aber **nicht mitcommitten**: Dateien gezielt mit `git add <datei>` stagen, nie `git add -A`.
Zurücksetzen ist erlaubt — genau für diese eine Datei nimmt `.claude/hooks/git-gh-guard.mjs`
`git checkout -- docs/ai-dashboard/issues.json` und `git restore …` vom Verwerfen-Verbot aus
(`qa/tests/git-gh-guard.test.mjs` hält die Ausnahme eng). Sonst gibt es bei jedem Push einen
Konflikt mit dem Sync-Workflow.

Dieser eine Befehl ist die einzige Ausnahme in `.claude/hooks/git-gh-guard.mjs`, der sonst jedes
Verwerfen im Working Tree blockiert. Sie gilt **nur** für exakt diesen Pfad: `git checkout -- .`,
ein zweiter Pfad dahinter oder eine andere Datei bleiben blockiert. Ein angehängtes
`2>/dev/null`, `>/dev/null` oder `2>&1` ist erlaubt — eine Umleitung in eine **echte** Datei
dagegen nicht, denn `… > wichtig.txt` würde diese Datei überschreiben.

Der Hook prüft **jede** Stelle im Befehl, an der ein `git`/`gh`-Aufruf beginnt, nicht nur den
Anfang. Sonst rutscht dieselbe Operation hinter einem Vorspann durch: `git update-ref -d` war
blockiert, `xargs -n1 git update-ref -d` lief durch. Das fällt bewusst fail-closed aus — steht
ein verbotener Befehl nur als Text in einer Zeile, wird auch das blockiert. Für Fließtext, der
solche Befehle erwähnt, ist ein Heredoc der Weg; dessen Inhalt behandelt der Hook als Daten. Bis 2026-09-09 fehlte die
Ausnahme, Doku und Hook widersprachen sich, und der Ausweg war ein Stash pro Sitzung — im
zwischen allen Worktrees geteilten Stash-Stack, wo ihn eine andere Sitzung fälschlich poppen konnte.

**Aufgaben pflegen sich über Ereignisse selbst** (`.github/workflows/task-automation.yml`,
`scripts/task-automation.mjs`): neues Issue → Eingang mit Typ/Bereich-Vorschlag, PR referenziert
`#n` → In Arbeit, PR gemergt → Review, Issue geschlossen → Erledigt. Prioritäten und Owner werden
nie automatisch gesetzt.

**KI-Sessions legen ihre Arbeit als Aufgabe an und führen den Status nach** – das ist die
Sichtbarkeit im Control Center, keine Formalie:

```
npm run task -- create "Titel" --area google --type technik --prio p2 --owner kontakt755
npm run task -- start 92 --owner kontakt755 --note "Beginne mit …"
npm run task -- review 92 --note "PR #101, Tests gruen"
npm run task -- done 92 --confirm --note "gemergt"
npm run task -- block 92 --reason "Warte auf … von Ahmet"
```

Der Owner ist Ahmet = GitHub-Login `kontakt755`. Ein PR, der `#n` im Titel oder Text nennt,
setzt die Aufgabe automatisch auf In Arbeit; `Closes #n` im PR-Text schließt sie beim Merge.

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
`docs/ai-dashboard/` · `domains/shopify/linoleum-rollenware-template.md` (feste Struktur für Linoleum/Rollenware-Import) ·
`domains/shopify/produktimport-arbeitsweise.md` (**vor jedem Lieferantenimport lesen** — Namensregeln,
Datenerhebung per curl, welche Mutation wofür, Gegenprüfung)
