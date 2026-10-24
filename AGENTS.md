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
- **Den Hauptcheckout nie bearbeiten.** Er steht losgelöst auf `origin/main` (aktualisieren: `git fetch origin && git checkout --detach origin/main`); von dort laufen die Hooks aller Sitzungen. Zwischenstände gehören auf einen Branch, nicht in den Working Tree oder den Stash.
- **Der Branch `main` gehört dem Deploy-Worktree.** `workflow:preview` und `workflow:live` verlangen `branch === main`, und git erlaubt jeden Branch nur in einer Arbeitskopie. Deploys laufen deshalb in einem eigenen Worktree auf `main` (z. B. `~/Developer/tp-deploy`), nie im Hauptcheckout.
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
- Vor dem Livegang die konkret betroffenen Funktionen risikobasiert testen.
- Nach dem Livegang den echten öffentlichen Shop ohne Preview-Parameter kontrollieren.
- Bei kleinen, sicheren und getesteten Theme-Optimierungen darf direkt live veröffentlicht werden, sofern der Auftrag nichts anderes sagt. Den Deploy führt der Agent selbst aus (siehe „Deploy“), nicht der Benutzer per Copy & Paste.
- Bei größeren riskanten Architekturänderungen zuerst analysieren und berichten.
- Wenn eine irreversible oder geschäftskritische Änderung notwendig wäre, vorher fragen.

## Was hier immer wieder schiefging

Jeder Punkt hat eine komplette Sitzung gekostet. Vor dem Loslegen lesen. Die Vorfälle dahinter stehen in `docs/lessons/`, Befehle und Einzelheiten am verlinkten Ort.

- **1. Der Theme-Editor ist nur eine Oberflaeche ueber `templates/*.json`** — Bloecke per `npm run theme:block` setzen, nicht klicken. → Skill `theme-regeln`
- **2. Ein Block ohne `"presets"` im Schema wird deployed und ist trotzdem unsichtbar** (`npm run schema:guard`). → Skill `theme-regeln`
- **3. `{% render 'x' ... as var %}` gibt es in Liquid nicht** — `{% capture %}` nehmen (`npm run liquid:guard`). → Skill `theme-regeln`
- **4. Nie von Hand ins Preview-Theme pushen** — Ausprobieren nur im Arbeitstheme (`--only`) oder in einem eigenen Development-Theme. → Skill `deploy`
- **5. Eine Theme-ID in Prosa veraltet, ohne dass es jemand merkt.** Siehe „Welches Theme ist live?“ — das gilt auch für Notizen im Gedächtnis-Vault. → `docs/lessons/theme-id-drift.md`
- **6. Fertige Arbeit liegt auf Branches, die nie gemergt wurden** — der Shop zeigt nur `main`; beim Zurueckholen die ganze Gruppe nehmen, nie die eine Datei. → `docs/lessons/ungemergte-branches.md`
- **6b. Ein toter Menuelink sieht im Editor genauso aus wie ein lebender** — erst zaehlen, welche Werte die Produkte der Kollektion tragen; `menuUpdate` ersetzt den gesamten Item-Baum. → `docs/lessons/tote-menuelinks.md`
- **7. Ein Produktimport ohne geklaerte Namensregeln wird zweimal gebaut** — am naechstliegenden fertigen Produkt entlangbauen. → `docs/lessons/produktimport.md`, `domains/shopify/produktimport-arbeitsweise.md`
- **8. Lieferantennamen gehoeren nicht ins Repository.** In Dateien, Commit-/PR-Texten und `npm run task`-Notizen nur Pseudonyme: **Lieferant A, B, C …** (fortlaufend, Schluessel nur privat), **Hausmarke von A**, Linien **A-1** bis **A-3**, URLs als `lieferant-a.example`; SKUs bleiben unveraendert. → `docs/lessons/produktimport.md`, `domains/lieferanten/AUSGELAGERT.md`
- **9. Ein PR, der gegen `main` sauber ist, kann trotzdem nie geprueft werden** — nach jedem Merge `npm run pr:doctor [-- --fix]`. → `docs/lessons/pr-basis-und-historie.md`

## Deploy

`Branch → PR → main → workflow:preview → workflow:live`, vorher `npm run workflow:doctor` (meldet alle Blocker auf einmal). Verlangt der Benutzer einen Deploy („deploy“, „live stellen“, „push das raus“), führt der Agent die Kette selbst aus — die Freigabe-Flags sind Teil des Befehls. Ein abgebrochenes Gate ist ein Befund: Ursache beheben, nie das Gate ausbauen. Details: Skill `deploy`, `docs/WORKFLOW.md`.

**Während eines Deploys nichts nach `main` mergen.** Von `workflow preview` bis zum Ende von `workflow live` ist ein Deploy-Fenster offen; ein Merge dazwischen bricht Live mit `LIVE_SOURCE` ab. Claude blockiert der Guard-Hook automatisch, alle anderen (Codex) prüfen vor jedem Merge `npm run -s deploy:frei` (Exit 1 = warten).

## Vor jedem Commit

```
npm run -s pruefen      # alle Testsuiten, Liquid-/Schema-/Template-/Theme-/Schrift-Guard, Theme Check gegen die Baseline, Secret-Scan
```

Die PR-Validierung fuehrt genau denselben Befehl aus: was lokal gruen ist, ist
im PR gruen. Ohne Shopify CLI (Remote-Session) `-- --ohne themecheck`; der
ausgelassene Schritt steht im Ergebnis. Der volle Lauf `node workflow/cli.mjs
validate` (ohne `--static`) braucht zusaetzlich die Storefront und laeuft nur
lokal auf dem Mac; unbekannte Flags brechen ab.

## Werkzeuge

Alle `npm run`-Werkzeuge mit Zweck: Skill `werkzeuge`. Feste Zeitpunkte: `workflow:doctor` vor jedem Deploy, `-s deploy:frei` vor jedem Merge nach main, `-s import:pruefen` nach jedem Import, `-s teppich:basis-daten` nach jedem Teppich-Import, `-s auslauf:sortieren` nach jedem neuen Tag `auslauf` und jedem Import in Teppichboden/Teppiche, `lighthouse:messen` bevor jemand „schneller/langsamer“ sagt.

## Produktdaten

Metafelder oder Collection-Zuordnungen nur verändern, wenn der jeweilige Auftrag dies ausdrücklich erlaubt oder wenn die Änderung eindeutig durch verlässliche vorhandene Produkt- oder Herstellerdaten belegt ist.

Nie technische Eigenschaften erfinden oder anhand eines Produktbildes allein ableiten.

**Ausgelaufenes wird nie angezeigt (Inhaber 2026-10-13).** Fuehrt der Lieferant einen Artikel nachweislich nicht mehr (exakte Suche ohne Treffer, Seite 404, Auslaufmeldung), wird das Produkt samt Musterprodukt sofort archiviert und die alte Adresse per 301 auf den Nachfolger oder die passende Kollektion umgeleitet; vorher offene Bestellungen pruefen, danach Lexikon exportieren. Faellt nur eine Variante weg, ist das eine Variantenaenderung und braucht Freigabe. Anschliessend die ganze Linie beim Lieferanten auf neue Artikel abgleichen. Die woechentliche Auslauf-Pruefung (`npm run auslauf:pruefen`, montags 4:00 per LaunchAgent) meldet Kandidaten als To-do im Control Center; sie archiviert nie selbst. Bei Lieferant A meldet sie ausserdem Artikel unserer Linien, die seit dem letzten Lauf neu beim Lieferanten stehen (To-do "neue Artikel", anlegen nach Skill `produktimport`). Auslaufkollektionen mit Restbestand (Tag `auslauf`, noch aktiv) stehen in den Kategorien hinten und tragen im Kartenbild die Plakette "Auslaufkollektion": nach jedem neuen Tag `npm run -s auslauf:sortieren` (Exit 1 = zu tun, dann `-- --schreiben`).

Bei unklaren Produktdaten:

- nicht raten
- als offenen Fall dokumentieren
- mit der nächsten eindeutigen Aufgabe fortfahren

Die Shopify Admin API ist über MCP bzw. CLI bereits authentifiziert: nicht nach einem Token suchen, der Browser ist nie der Ausweichweg. Bevor „die API kann das nicht“ fällt, im GraphQL-Schema nachschlagen. Farben sind die Produktoption `Farbe`; Produkteigenschaften und Farbcodes nie erfinden oder fortzählen. Nach jedem Schreibvorgang gegenprüfen — `userErrors: []` ist kein Beleg. GraphQL nur mit den Feldern, die die Entscheidung braucht; zählen per `productsCount(query:)`. Details: Skill `produktimport`, `docs/lessons/shopify-schreibzugriff.md`.

## Theme, Produktkarten, Design, Bilder

Vor jeder Theme-Änderung den Skill `theme-regeln` laden: Blöcke und Schemata, fertige Funktionen, die nicht neu gebaut werden (u. a. Paket-/Verschnittrechner samt Warenkorblogik; der Produktvergleich bleibt entfernt), Hauptmenü nur mit `scripts/menue-umbau.mjs`, Horizon 4.1.3 nicht migrieren, Produktkarten, UX/Design, Bilder und Testumfang. Gemusterte Ware wird nie per KI neu erzeugt, KI-Bilder tragen die IPTC-Kennzeichnung (→ `docs/lessons/ki-bilder.md`).

## Preislogik

Aktionen und Streichpreise bei Teppichboden, Preisstufen der gekettelten Fußleiste, Paketprodukte (€/m² für Kunden, intern Paketpreis) und der bewusst ausgeblendete Preisfilter bei Vinylboden: Skill `preislogik`.

## Tests

`npm test` startet alle Suiten (rund 35 s), `npm run -s pruefen` zusaetzlich alle Guards. Was je Änderung risikobasiert zu prüfen ist (Desktop, Mobile ca. 390 px, Warenkorb, Muster …) und welche weiteren Checks es gibt: Skill `theme-regeln`.

## Gedächtnis, Übergaben und Review

- **Regeln** stehen nur im Repository (diese Datei, `docs/lessons/`, Skills). Wer eine neue Regel findet, ändert sie dort per PR.
- **Der Gedächtnis-Vault** (`~/.claude/projects/<projekt>/memory`, zugleich Obsidian-Vault, privates Repo `tp-claude-gedaechtnis`) enthält nur, was nicht aus dem Repository folgt: Entscheidungen des Inhabers, Datenquellen der Lieferanten, Shopify-Fallen, Vorlieben des Benutzers. Keine Zwischenstände, keine Theme-IDs, keine Kopien von Regeln. Dateinamen in snake_case, Wikilinks mit genau diesem Dateinamen. `.claude/hooks/gedaechtnis-sync.sh` holt beim Sitzungsstart und pusht am Sitzungsende; Codex ruft `npm run gedaechtnis:sync -- pull|push` auf.
- **Übergaben zwischen Claude und Codex** nur auf ausdrücklichen Auftrag: `Zusammenarbeit/Start.md` im Vault lesen, je Übergabe eine Datei unter `Zusammenarbeit/Aufgaben/`. Keine Secrets oder Kundendaten.
- **Direkte Rückfrage Claude ↔ Codex** (nur lesend, ohne Übergabedatei): `npm run -s ki:frag -- codex|claude "Frage"`, fortsetzen mit `npm run -s ki:frag -- weiter codex|claude "…"`, Diffs per stdin. Die Antwort ist eine zweite Meinung, keine Quelle; Arbeit mit Schreibwirkung bleibt eine Übergabe. Details: `.claude/skills/codex/SKILL.md`.
- **Review:** Es gibt keinen Router und kein Pflicht-Review nach jeder Antwort (entfernt 2026-09-30). Vor dem Merge von Änderungen an Preisen, SKUs, Varianten, Massenimporten, Checkout oder der Deploy-Kette einen zweiten Blick auf den **PR-Diff** holen (`/code-review` in Claude Code oder Codex) — nie auf den geteilten Working Tree.
- Externe 429/503/Timeouts: höchstens ein unmittelbarer Script-Retry (`workflow/retry.mjs`). Einzige Ausnahme: Der HTTP-Check der Preview direkt nach dem Push prüft 5xx (Kaltstart) bis zu zweimal mit Wartezeit nach (`PREVIEW_HTTP_WAITS_MS`); 4xx und bleibende 5xx brechen ab, die Wartezeiten nicht verlängern. Cloud-/Proxy-403 bei Storefront-Zugriff heißt: lokal auf dem Mac ausführen.

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

**Schlusszeile „Chat abgeschlossen – kann archiviert werden.“** (Inhaber) nur, wenn im Chat wirklich alles erledigt ist. Sie entfällt, sobald eins zutrifft: die Antwort endet mit einer Frage oder Bitte an den Benutzer; es war nur Erklärung/Beratung ohne erledigten Auftrag; etwas wartet noch auf den Benutzer oder Inhaber (Zugang, Entscheidung, Werkbank) und gehört zu diesem Chat; ein nächster Schritt ist angekündigt. Dann stattdessen „Offen: …“. Im Zweifel weglassen.

## Konventionen

- Eigene Bloecke/Snippets tragen das Praefix `tp-`; `_`-Praefix ist privat (keine `presets` noetig).
- CSS gehoert in `{% stylesheet %}`, nicht in ein inline `<style>` pro Karte.
- Schriftgroessen nur aus der Skala `var(--tp-fs-*)` (`npm run schrift:guard`); Rot sparsam (Preis, Rabatt, wenige Hauptaktionen; vollstaendige Liste und Werte: Skill `theme-regeln`).
- Kommentare und Commit-Messages auf Deutsch, ohne Umlaute in Liquid-Kommentaren.
- Immer im aktuellen Repository-Root arbeiten; keine absoluten Pfade — das Repo
  liegt auf Windows, macOS und Linux.
- `AppBlockValidTags` aus `theme check` trifft ~140 Dateien inklusive
  Horizon-Kern — bekanntes False-Positive.

## Aktueller wichtiger Backlog

Nicht automatisch bearbeiten, aber bei zukünftigen Aufgaben berücksichtigen:

- Teppichboden Mobile-Menü optimieren
- Hochflor-/Mittelflor-Zuordnung fachlich verbessern (Mittelflor ist seit 07.10. eigene Kategorie, die Zuordnung je Produkt bleibt offen)
- ecoVella-/Wolle-Zuordnung sauber prüfen
- Eigenen Raumvisualisierer für Hartböden ausbauen – keine fremden Visualisierer wie Roomvo (Inhaber 09.10.)
- Horizon 4.1.3 später separat migrieren
- Produktbilder langfristig verbessern
- Reste & Sonderposten später als eigenen starken Shopbereich aufbauen (seit 14.10. nur Platzhalter „demnächst“ im Menü)
