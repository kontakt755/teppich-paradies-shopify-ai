# TEPPICH PARADIES – AGENT PROJECT RULES

Diese Datei ist die zentrale, verbindliche Regelquelle für alle Agenten, die an diesem Repository arbeiten (Claude Code, Codex, ggf. weitere). `CLAUDE.md` bindet sie ein und ergänzt nur Claude-spezifische Bedienung; andere Dateien führen keine eigenen, abweichenden Regeln.

## Projekt

Shopify-Onlineshop der Teppich Paradies Oranienburg GmbH.

- Öffentlicher Shop: https://www.teppich-paradies.net
- Shopify Store: `sjjyq1-6w.myshopify.com`
- Theme: Horizon (Shopify 2.0, Blocks/Sections)

Arbeite immer im aktuellen Repository Root und verlasse dich nicht auf fest codierte absolute Pfade. Das Repository wird auf mehreren Rechnern (Windows und macOS) ausgecheckt.

## Arbeitskopien und lokale Speicherung

- Repositorys, Worktrees, Dashboard-Code, Laufzustände und Protokolle nur lokal speichern — nie in iCloud Drive, Schreibtisch/Documents oder anderen synchronisierten Ordnern. Vor dem Anlegen einer Arbeitskopie den aufgelösten Pfad prüfen.
- **Eine Aufgabe = eine Arbeitskopie.** Neue Worktrees unter `.claude/worktrees/<thema>` (Claude-App) oder `~/Developer/tp-<thema>`; keine neuen `~/tp-wt-*`. Nach dem Merge wird der Worktree entfernt.
- **Den Hauptcheckout nie bearbeiten.** Er steht auf `main` und wird nur per `git pull --ff-only` aktualisiert; von dort laufen die Hooks aller Sitzungen. Zwischenstände gehören auf einen Branch, nicht in den Working Tree oder den Stash.
- `docs/ai-dashboard/issues.json` und `bodenwissen.json` sind erzeugte Dateien und seit 2026-09-30 nicht mehr im Git (lokal: `npm run dashboard`). Nie `git add -A`. KI-Sitzungen führen ihre Aufgabe per `npm run task`.

## Welches Theme ist live?

**Nicht raten und keine ID aus einer Doku uebernehmen.** Die einzige Quelle ist
`domains/shopify/live-theme.json`; `npm run theme:guard` haelt sie mit dem
Repository konsistent und verbietet Theme-IDs in Anweisungsdateien. Nachpruefen
ueber die Shopify Admin API (MCP bzw. CLI) — live ist der Knoten mit `role: MAIN`:

```
npm run -s kurz -- themes-query   # gibt die Abfrage aus: nur MAIN + preview/fallback/arbeit, vier Knoten
```

Nicht `themes(first: 20)` — das sind 20 volle Knoten im Verlauf, fuer vier Zeilen Antwort.

Danach `live-theme.json` aktualisieren (inklusive `verifiedAt`), das alte Theme
unter `retired` eintragen und `npm run theme:guard` laufen lassen.
→ `docs/lessons/theme-id-drift.md`

## NIEMALS ohne ausdrückliche Freigabe

Produkte oder Varianten löschen · SKUs oder Varianten verändern · Preise verändern · Checkout-, Zahlungs-, Steuer- oder Versandeinstellungen verändern · DNS oder Domains verändern · Rechtstexte verändern · kostenpflichtige Apps installieren · Käufe oder Abonnements auslösen · das Fallback-Theme (`Horizon`, ID in `live-theme.json` unter `fallback`) löschen oder überschreiben · Horizon-Version migrieren · große irreversible Shopify-Datenänderungen durchführen.

Harte technische Grenzen (force-push, `reset --hard`, Branch löschen, Theme löschen …) setzen die Hooks in `.claude/hooks/` per `deny`; geschützte Ressourcen stehen in `domains/shopify/risk-map.json`.

## Grundsätzliche Arbeitsweise

- Bestehenden Code zuerst verstehen und funktionierende Lösungen nicht unnötig neu schreiben.
- Kleine, klar abgegrenzte Aufgaben möglichst selbstständig vollständig durchführen.
- Nicht nach jedem normalen Terminal-, Browser-, Playwright-, Datei-, Netzwerk- oder Shopify-CLI-Schritt fragen.
- Bei einem Hindernis selbstständig eine sichere Alternative prüfen.
- Nicht wegen GitHub, Authentifizierung oder Nebeninfrastruktur unnötig vom eigentlichen Shopify-Auftrag abweichen.
- Keine unnötigen großen Refactorings durchführen, wenn eine kleine robuste Änderung reicht.
- Mobile und Desktop berücksichtigen und bestehende Funktionen regressionsprüfen.
- Nach Theme-Änderungen Shopify Theme Check verwenden, wenn sinnvoll.
- Vor dem Livegang die konkret betroffenen Funktionen risikobasiert testen.
- Nach dem Livegang den echten öffentlichen Shop ohne Preview-Parameter kontrollieren.
- Bei kleinen, sicheren und getesteten Theme-Optimierungen darf direkt live veröffentlicht werden, sofern der Auftrag nichts anderes sagt. Den Deploy führt der Agent selbst aus (siehe „Deploy“), nicht der Benutzer per Copy & Paste.
- Bei größeren riskanten Architekturänderungen zuerst analysieren und berichten.
- Wenn eine irreversible oder geschäftskritische Änderung notwendig wäre, vorher fragen.

## Was hier immer wieder schiefging

Jeder Punkt hat eine komplette Sitzung gekostet. Vor dem Loslegen lesen. Die Vorfälle dahinter stehen in `docs/lessons/`.

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

**5. Eine Theme-ID in Prosa veraltet, ohne dass es jemand merkt.** Siehe „Welches Theme ist live?“ — das gilt auch für Notizen im Gedächtnis-Vault.

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

## Deploy

`Branch → PR → main → workflow:preview → workflow:live`, vorher `npm run workflow:doctor` (meldet alle Blocker auf einmal). Verlangt der Benutzer einen Deploy („deploy“, „live stellen“, „push das raus“), führt der Agent die Kette selbst aus — die Freigabe-Flags sind Teil des Befehls. Ein abgebrochenes Gate ist ein Befund: Ursache beheben, nie das Gate ausbauen. Details: Skill `deploy`, `docs/WORKFLOW.md`.

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
| `npm run workflow:doctor` | **vor jedem Deploy**: alle Voraussetzungen in einem Lauf |
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

## Produktdaten

Metafelder oder Collection-Zuordnungen nur verändern, wenn der jeweilige Auftrag dies ausdrücklich erlaubt oder wenn die Änderung eindeutig durch verlässliche vorhandene Produkt- oder Herstellerdaten belegt ist.

Nie technische Eigenschaften erfinden oder anhand eines Produktbildes allein ableiten.

Bei unklaren Produktdaten:

- nicht raten
- als offenen Fall dokumentieren
- mit der nächsten eindeutigen Aufgabe fortfahren

Die Shopify Admin API ist über MCP bzw. CLI bereits authentifiziert: nicht nach einem Token suchen, der Browser ist nie der Ausweichweg. Bevor „die API kann das nicht“ fällt, im GraphQL-Schema nachschlagen. Farben sind die Produktoption `Farbe`; Produkteigenschaften und Farbcodes nie erfinden oder fortzählen. Nach jedem Schreibvorgang gegenprüfen — `userErrors: []` ist kein Beleg. GraphQL nur mit den Feldern, die die Entscheidung braucht; zählen per `productsCount(query:)`. Details: Skill `produktimport`, `docs/lessons/shopify-schreibzugriff.md`.

## Shopify Theme

Fertige, getestete Funktionen nicht neu bauen: €/m²-Darstellung bei Paketprodukten, Paket-/Verschnittrechner samt Warenkorblogik, deutsche Paket-/Bestellmengenanzeige, Produktvergleich (max. 3), Musterbestellung, Breadcrumb, Produktvorteile, Verkaufsbereich, technische Daten, Produktkarten-Logik mit gekürzten Titeln, Predictive Search, Startseiten-Struktur, Vinylboden-Kategoriekarussell, Mobile Peek / Karussell-Navigation.

Der Paket-/Verschnittrechner und dessen Warenkorblogik sind bereits intensiv getestet. Nicht neu schreiben, außer der Benutzer beauftragt dies ausdrücklich.

Globo Mega Menu funktioniert aktuell. Nicht grundsätzlich umbauen, außer der Auftrag betrifft ausdrücklich das Menü.

Horizon 4.1.3 existiert als separates Update. Keine Migration durchführen, solange dies nicht ausdrücklich beauftragt wird.

## Preislogik

Bei Teppichboden mit Meterware (Rollenbreiten) und Raummaß (Wunschmaß-Variante)
gilt für jede Farbe und Breite dieselbe Produktaktion mit demselben
Rabattprozentsatz. Der normale Raummaß-Aufschlag bleibt im regulären Preis;
der Rabatt wird anschließend auf beide Zuschnittarten gleichermaßen angewandt.
Raummaß allein ist keine Aktion. Streichpreise und Rabattkennzeichen dürfen
nur bei einer tatsächlich aktiven Produktaktion erscheinen, wenn beide
Zuschnittarten reduziert sind und die Vergleichspreise belegte Vorpreise sind.
Rundung auf Cent darf zu kleinen rechnerischen Prozentabweichungen führen.
Vor einer Änderung der Shopify-Variantenpreise oder Vergleichspreise ist eine
konkrete Produkttabelle zu prüfen und die ausdrückliche Freigabe des Inhabers
einzuholen. Produkttexte dürfen keinen abweichenden Rabatt versprechen.

Bei Paketprodukten:

- €/m² ist die primäre Kundendarstellung.
- Der interne Shopify-Preis bleibt der Paketpreis.
- Den Paketpreis auf Collection-Karten normalerweise nicht prominent anzeigen.
- Die Produktdetailseite darf den Paketpreis sekundär zeigen.
- Warenkorb und Checkout müssen mit echten ganzen Paketen arbeiten.

Der Preisfilter bei Vinylboden ist bewusst ausgeblendet, solange Shopify nach Paketpreis statt sichtbarem €/m² filtert. Diese Logik nicht versehentlich zurückbauen.

## Produktkarten

Ziele:

- kurze sichtbare Titel
- echten vollständigen Produkttitel für Link und Barrierefreiheit erhalten
- klare €/m²-Darstellung
- nicht überladen
- Muster und Vergleichen nur dort, wo sinnvoll
- auf Mobile nichts abschneiden

Teppichboden-Titel mit angehängten Breiten wie „Piumera Teppichboden 400cm 500cm“ dürfen in der sichtbaren Karte beispielsweise als „Piumera“ dargestellt werden, ohne den echten Shopify-Produkttitel zu verändern.

## UX / Design

Stil:

- moderner Fachhandel
- hochwertig
- ruhig
- verständlich
- nicht überladen
- keine unnötige Marketing-Sprache
- vorhandene Teppich-Paradies-Farbwelt nutzen

Prioritäten:

1. Verständlichkeit
2. Kaufentscheidung erleichtern
3. Mobile Bedienbarkeit
4. Fachhandels-Vertrauen
5. saubere technische Umsetzung

Gute Konkurrenzseiten dürfen als UX-Benchmark untersucht werden. Keine Texte, Bilder oder Designs 1:1 kopieren.

## Bilder

- Vorhandene echte Produkt- und Herstellerbilder bevorzugen.
- Wenn die Bildlizenz eine Herstellerangabe am Bild verlangt, diese unmittelbar am Bild sichtbar machen. Die genaue JOKA-Quellenangabe ist dafür im Theme-Guard eng begrenzt freigegeben; andere Lieferantennamen bleiben gesperrt.
- Keine Produkteigenschaften durch erfundene Bilder falsch darstellen.
- Erklärende Kategorievisuals dürfen verwendet werden, wenn sie technisch korrekt sind.
- Above-the-fold-Bilder beim ersten Laden sinnvoll priorisieren.
- Lazy Loading nicht pauschal abschalten.

## Tests

`npm test` startet alle Suiten (rund 20 s); `qa/tests/npm-test-deckung.test.mjs` prüft, dass jedes Verzeichnis mit `*.test.mjs` in der Kette hängt.

Vor bzw. nach relevanten Theme-Änderungen bevorzugt `npm run qa` verwenden, statt dieselben mechanischen Browser- und Theme-Checks manuell mit Modellarbeit zu wiederholen.

Weitere verfügbare, rein lesende lokale Checks: `npm run seo:check`, `npm run compare:check`, `npm run qa:evidence:test`, `npm run secret:scan`. `npm run sales:check` ist ein Live-Storefront-Test ohne Kaufabschluss: Er verändert einen anonymen Test-Warenkorb und kann bis zum Checkout navigieren. Vor einem Commit sollte `npm run secret:scan` laufen, wenn neue Dateien mit potenziell sensiblem Inhalt hinzugekommen sind.

Je nach Änderung sinnvoll und risikobasiert prüfen:

- Desktop
- Mobile bei ca. 390 px
- Browser-Konsole
- Theme Check
- Links und Bilder
- Produktkarten und Varianten
- Warenkorb
- Vergleich und Muster
- Rollenware und Fixpreis
- Teppichboden
- Klickvinyl und Klebevinyl

Nicht für jede Miniänderung den gesamten Shop unnötig testen.

## Gedächtnis, Übergaben und Review

- **Regeln** stehen nur im Repository (diese Datei, `docs/lessons/`, Skills). Wer eine neue Regel findet, ändert sie dort per PR.
- **Der Gedächtnis-Vault** (`~/.claude/projects/<projekt>/memory`, zugleich Obsidian-Vault, privates Repo `tp-claude-gedaechtnis`) enthält nur, was nicht aus dem Repository folgt: Entscheidungen des Inhabers, Datenquellen der Lieferanten, Shopify-Fallen, Vorlieben des Benutzers. Keine Zwischenstände, keine Theme-IDs, keine Kopien von Regeln. Dateinamen in snake_case, Wikilinks mit genau diesem Dateinamen. `.claude/hooks/gedaechtnis-sync.sh` holt beim Sitzungsstart und pusht am Sitzungsende; Codex ruft `npm run gedaechtnis:sync -- pull|push` auf.
- **Übergaben zwischen Claude und Codex** nur auf ausdrücklichen Auftrag: `Zusammenarbeit/Start.md` im Vault lesen, je Übergabe eine Datei unter `Zusammenarbeit/Aufgaben/`. Keine Secrets oder Kundendaten.
- **Review:** Es gibt keinen Router und kein Pflicht-Review nach jeder Antwort (entfernt 2026-09-30). Vor dem Merge von Änderungen an Preisen, SKUs, Varianten, Massenimporten, Checkout oder der Deploy-Kette einen zweiten Blick auf den **PR-Diff** holen (`/code-review` in Claude Code oder Codex) — nie auf den geteilten Working Tree.
- Externe 429/503/Timeouts: höchstens ein unmittelbarer Script-Retry (`workflow/retry.mjs`). Cloud-/Proxy-403 bei Storefront-Zugriff heißt: lokal auf dem Mac ausführen.

## Kommunikation

Der Benutzer möchte möglichst wenig Rückfragen.

Bei klaren, reversiblen Aufgaben: analysieren → umsetzen → testen → live prüfen → kurz berichten.

Nur nachfragen, wenn:

- eine wichtige geschäftliche Entscheidung fehlt
- Daten nicht eindeutig belegbar sind
- eine irreversible oder riskante Änderung nötig wäre
- Kosten ausgelöst würden
- mehrere fachlich unterschiedliche Lösungen erhebliche Auswirkungen hätten

Abschlussberichte kompakt halten:

- was geändert wurde
- was getestet wurde
- ob live
- offene echte Probleme

## Konventionen

- Eigene Bloecke/Snippets tragen das Praefix `tp-`; `_`-Praefix ist privat (keine `presets` noetig).
- CSS gehoert in `{% stylesheet %}`, nicht in ein inline `<style>` pro Karte.
- Kommentare und Commit-Messages auf Deutsch, ohne Umlaute in Liquid-Kommentaren.
- Immer im aktuellen Repository-Root arbeiten; keine absoluten Pfade — das Repo
  liegt auf Windows, macOS und Linux.
- `AppBlockValidTags` aus `theme check` trifft ~140 Dateien inklusive
  Horizon-Kern — bekanntes False-Positive.

## Aktueller wichtiger Backlog

Nicht automatisch bearbeiten, aber bei zukünftigen Aufgaben berücksichtigen:

- Teppichboden Mobile-Menü optimieren
- fehlendes oder graues Kategoriebild bei Teppichboden-Unterseiten endgültig beheben
- Hochflor-/Mittelflor-Zuordnung fachlich verbessern
- ecoVella-/Wolle-Zuordnung sauber prüfen
- Raumplaner / Roomvo evaluieren beziehungsweise später integrieren
- Horizon 4.1.3 später separat migrieren
- Produktbilder langfristig verbessern
- Reste & Sonderposten später als eigenen starken Shopbereich aufbauen
