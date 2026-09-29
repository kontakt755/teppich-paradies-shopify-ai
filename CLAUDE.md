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

```
npm run -s kurz -- themes-query   # gibt die Abfrage aus: nur MAIN + preview/fallback/arbeit, vier Knoten
```

Nicht `themes(first: 20)` — das sind 20 volle Knoten im Verlauf, fuer vier Zeilen Antwort.

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
Zwischenstaende und Ausprobieren gehen ausschliesslich ins Arbeitstheme
(`arbeit` in `domains/shopify/live-theme.json`, nur mit `--only`) oder in ein
eigenes Development-Theme (`theme push --development --development-context
<branch>`). Das Arbeitstheme ist nie Preview-Ziel und wird nie publiziert.

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
| `npm run lighthouse:messen` | **bevor jemand "schneller/langsamer" sagt**: Lighthouse gegen Live, 3 Seiten mit und ohne Cookie-Banner, 5 Runden reihum (rund 25 min); `-- --pruefen` nur Vorpruefung |
| `npm run -s kurz -- <art>` | Theme-Rollen, Push-Ergebnis, Worktrees gefiltert statt als Rohdump |
| `npm run -s handoff` | Uebergabetext fuer die naechste Sitzung aus dem Git-Stand |
| `npm run theme:diff -- --manifest <datei>` | Theme gegen Repository abgleichen |
| `npm run workflow:scratch -- --theme-id <id>` | Wegwerf-Theme zum Ausprobieren, ohne Evidence |

## Shopify-Schreibzugriff und Produktdaten

Der Shopify-MCP ist bereits authentifiziert: nicht nach einem Token suchen, der
Browser ist nie der Ausweichweg. Bevor „die API kann das nicht" faellt, per
`graphql_schema` nachschlagen. Farben sind die Produktoption `Farbe`, Bloecke gehen
auf die Option; Produkteigenschaften und Farbcodes nie erfinden oder fortzaehlen.
Details: Skill `produktimport` (`shopify-daten.md`), `docs/lessons/shopify-schreibzugriff.md`.

## Fertige Features — nicht neu bauen

€/m²-Anzeige, Paket-/Verschnittrechner samt Warenkorb-Logik, deutsche Paket- und
Bestellmengen-Anzeige, Produktvergleich (max. 3), Musterbestellung, Breadcrumb,
Produktvorteile, technische Daten, Produktkarten-Logik mit gekuerzten Titeln,
Predictive Search, Startseitenstruktur, Vinyl-Kategorie-Karussell, Mobile-Peek
und Karussell-Navigation. Alles getestet und in Benutzung.

## Verbrauch: eine Sitzung pro Aufgabe, Ausgaben gefiltert (#361)

Grundlast einer Sitzung ~72k Tokens (System-Tools ~30k, MCP ~19k, Memory ~13k),
kaum beeinflussbar. In langen Sitzungen ist aber der **Verlauf** 84 % — und den
bezahlt jede Runde erneut. Er waechst durch Rohdumps, nicht durch Prosa.

- **Hook `kontext-waechter.mjs`** meldet sich, sobald im selben Chat ein zweites
  `workflow:route` lief oder der Kontext 250k ueberschreitet (danach je +150k).
  Dann: Aufgabe abschliessen, `npm run -s handoff` ausgeben, neue Sitzung.
- **Gefiltert statt roh:** `npm run -s kurz -- themes-query | themes | push | worktrees`.
  `shopify theme push --json ... | npm run -s kurz -- push` zeigt Fehler, zaehlt Offenses.
- **GraphQL nur mit den Feldern, die die Entscheidung braucht.** Zaehlen per
  `productsCount(query:)` bzw. `first:` + `pageInfo`, nicht 100 Produkte holen.
  Ein Menuelink wird ueber `menu(id:)` mit `items { title url }` geprueft, nicht
  zweimal der ganze Baum. Ergebnis einmal holen und weiterverwenden.
- **Voranalyse nur bei Klasse C/D** (#670); bei A/B kein Drittmodell im Kontext.
- **`workflow:route` nennt `SESSION_MODEL`** und die Handlung dazu: die eigene Sitzung
  laesst sich per Tool nicht umstellen, der Wechsel geht ueber das Modellmenue bzw. `/model`.
- `live-theme.json` nicht ganz lesen (Retired-Liste ~10k): `jq '{live,preview,fallback,arbeit}'`.

## Ausgelagert in Skills (#670)

| Skill | Inhalt |
|---|---|
| `deploy` | Deploy-Kette, Sperre, Remote-Sessions, `theme:diff`, `workflow:scratch` |
| `ai-orchestrator` | Router, Modellmatrix, Codex-Review, Prompt-Caching, Gedaechtnis-Sync, Context Mode |
| `control-center` | Dashboard, `issues.json`, Rebase-`--theirs`, `npm run task` |
| `produktimport` | Import, Schreibzugriff (`shopify-daten.md`), Produktdaten |

Unverzichtbar auch ohne Skill: Deploy nur `Branch → PR → main → workflow:preview →
workflow:live`, vorher `npm run workflow:doctor`; ein abgebrochenes Gate ist ein
Befund, nie ausbauen. `issues.json` nie mitcommitten, nie `git add -A`. Context Mode
nie als Plugin installieren. KI-Sessions fuehren ihre Aufgabe per `npm run task`.

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

## Tests

`npm test` startet alle Suiten (rund 18 s), `npm run qa` zusaetzlich visuell (nur lokal).
`qa/tests/npm-test-deckung.test.mjs` prueft, dass jedes Verzeichnis mit `*.test.mjs` in der Kette haengt.

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
