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
- **Eine Aufgabe = eine Arbeitskopie.** Neue Worktrees unter `.claude/worktrees/<thema>` (Claude-App) oder `~/Developer/tp-<thema>`; keine neuen `~/tp-wt-*`. Nach dem Merge wird der Worktree entfernt: `npm run -s worktrees:aufraeumen` zeigt, was weg darf, `-- --entfernen` entfernt nur gemergte, saubere, seit 24 h ruhende Kopien ohne laufenden Prozess (Branches bleiben).
- **Den Hauptcheckout nie bearbeiten.** Er steht losgelöst auf `origin/main` (aktualisieren: `git fetch origin && git checkout --detach origin/main`); von dort laufen die Hooks aller Sitzungen. Zwischenstände gehören auf einen Branch, nicht in den Working Tree oder den Stash.
- **Der Branch `main` gehört dem Deploy-Worktree.** `workflow:preview` und `workflow:live` verlangen `branch === main`, und git erlaubt jeden Branch nur in einer Arbeitskopie. Deploys laufen deshalb in einem eigenen Worktree auf `main` (z. B. `~/Developer/tp-deploy`), nie im Hauptcheckout.
- `docs/ai-dashboard/issues.json` und `bodenwissen.json` sind erzeugte Dateien und nicht im Git (lokal: `npm run dashboard`). Nie `git add -A`. KI-Sitzungen führen ihre Aufgabe per `npm run task`.

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
- **Wiederkehrendes wird ein Skript, die KI urteilt nur.** Läuft ein Ablauf zum dritten Mal gleich (Abruf, Abgleich, Zählung, Export, feste Klickfolge), gehört er in ein Skript unter `operations/scripts/` oder `scripts/`. Reihenfolge der Wege: API, dann `fetch`/curl, dann Playwright, Klicken durch die KI zuletzt. Geplante Aufgaben prüfen ohne KI vor und starten Claude nur, wenn es etwas zu beurteilen gibt (Muster: `vorpruefung` in `operations/lib/routinen.mjs`). Kein Skript für Einmaliges, für Portale mit Klickverbot oder Login-Sperre und für Außenwirkung ohne Freigabe.
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
- **10. Ein Shopify-Flow-Entwurf ist nicht live, bis die Uebersicht ihn unter „Aktiver Workflow“ zeigt** — selbst nachsehen, nie „laut Benutzer angewendet“ notieren; Raummass/Kettel einer Restrolle brauchen `teppich-nach-mass` + `sonderposten`. → `docs/lessons/flow-entwurf-nie-angewendet.md`

## Deploy

`Branch → PR → main → workflow:preview → workflow:live`, vorher `npm run workflow:doctor` (meldet alle Blocker auf einmal). Verlangt der Benutzer einen Deploy („deploy“, „live stellen“, „push das raus“), führt der Agent die Kette selbst aus — die Freigabe-Flags sind Teil des Befehls. Ein abgebrochenes Gate ist ein Befund: Ursache beheben, nie das Gate ausbauen. Details: Skill `deploy`, `docs/WORKFLOW.md`.

**Während eines Deploys nichts nach `main` mergen.** Von `workflow preview` bis zum Ende von `workflow live` ist ein Deploy-Fenster offen; ein Merge dazwischen bricht Live mit `LIVE_SOURCE` ab. Claude blockiert der Guard-Hook automatisch, alle anderen (Codex) prüfen vor jedem Merge `npm run -s deploy:frei` (Exit 1 = warten).

## Vor jedem Commit

```
npm run -s pruefen      # alle Testsuiten, Liquid-/Schema-/Template-/Theme-/Schrift-/Changelog-/Bewertungs-Guard, Theme Check gegen die Baseline, Secret-Scan
```

Die PR-Validierung fuehrt genau denselben Befehl aus: was lokal gruen ist, ist
im PR gruen. Ohne Shopify CLI (Remote-Session) `-- --ohne themecheck`; der
ausgelassene Schritt steht im Ergebnis. Der volle Lauf `node workflow/cli.mjs
validate` (ohne `--static`) braucht zusaetzlich die Storefront und laeuft nur
lokal auf dem Mac; unbekannte Flags brechen ab.

## Werkzeuge

Alle `npm run`-Werkzeuge mit Zweck: Skill `werkzeuge`. Feste Zeitpunkte: `workflow:doctor` vor jedem Deploy, `-s deploy:frei` vor jedem Merge nach main, `-s import:pruefen` nach jedem Import, `-s teppich:basis-daten` nach jedem Teppich-Import, `-s auslauf:sortieren` nach jedem neuen Tag `auslauf` und jedem Import in Teppichboden/Teppiche, `-s preisfilter:abgleich -- --schreiben` nach jedem Preislauf bei Teppichboden (Rückstellung, Angebotswelle, Einzelpreise), `lighthouse:messen` bevor jemand „schneller/langsamer“ sagt.

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

`npm test` startet alle Suiten in einem Lauf (rund 25 s), `npm run -s pruefen` zusaetzlich alle Guards und Theme Check, alle Schritte gleichzeitig. Was je Änderung risikobasiert zu prüfen ist (Desktop, Mobile ca. 390 px, Warenkorb, Muster …) und welche weiteren Checks es gibt: Skill `theme-regeln`.

## Gedächtnis, Übergaben und Review

- **Regeln** stehen nur im Repository (diese Datei, `docs/lessons/`, Skills). Wer eine neue Regel findet, ändert sie dort per PR.
- **Der Gedächtnis-Vault** (`~/.claude/projects/<projekt>/memory`, zugleich Obsidian-Vault, privates Repo `tp-claude-gedaechtnis`) enthält nur, was nicht aus dem Repository folgt: Entscheidungen des Inhabers, Datenquellen der Lieferanten, Shopify-Fallen, Vorlieben des Benutzers. Keine Zwischenstände, keine Theme-IDs, keine Kopien von Regeln. Dateinamen in snake_case, Wikilinks mit genau diesem Dateinamen. `.claude/hooks/gedaechtnis-sync.sh` holt beim Sitzungsstart und pusht am Sitzungsende (findet den Vault auch aus Worktrees); Codex ruft `npm run gedaechtnis:sync -- pull|push` auf, das bei Fehlern mit Exit 1 abbricht statt still weiterzulaufen.
- **Übergaben zwischen Claude und Codex** nur auf ausdrücklichen Auftrag: `Zusammenarbeit/Start.md` im Vault lesen, je Übergabe eine Datei unter `Zusammenarbeit/Aufgaben/` nach der Vorlage dort. Pflichtinhalt: Ziel, Abnahmekriterien, Ausgangsstand (Branch und Commit oder PR), betroffene Dateien, gelaufene Tests mit Ergebnis, offene Punkte — und **genau ein** `zustaendig` (sonst ist niemand dran). Keine Secrets oder Kundendaten. Offene Übergaben an Claude zeigt der Sitzungsstart; Codex sieht seine mit `npm run -s uebergaben -- --an codex`, alle zeigt `npm run -s uebergaben`.
- **Direkte Rückfrage Claude ↔ Codex** (nur lesend, ohne Übergabedatei): `npm run -s ki:frag -- codex|claude "Frage"`, fortsetzen mit `npm run -s ki:frag -- weiter codex|claude "…"`, Diffs per stdin. Die Antwort ist eine zweite Meinung, keine Quelle. Schreibarbeit gibt Claude nur über `umsetzen` an Codex (Skill `codex`), sonst bleibt sie eine Übergabe. Zugangsdaten (Shopify, GitHub, Lexware, SumUp, Tokens) gibt das Skript nicht an die andere KI weiter. Details: `.claude/skills/codex/SKILL.md`.
- **Review:** Kein Pflicht-Review nach jeder Antwort. Vor dem Merge von Änderungen an Preisen, SKUs, Varianten, Massenimporten, Checkout oder der Deploy-Kette einen zweiten Blick auf den **PR-Diff** holen — nie auf den geteilten Working Tree. Ein Codex-Review zählt nur mit festem Prüfgegenstand: `npm run -s ki:frag -- review <PR>` bindet es an den Head-Commit, prüft in einer sauberen Kopie und legt es ab; vor dem Merge muss `npm run -s ki:frag -- review-stand <PR>` „aktuell“ melden (jeder neue Commit macht es veraltet, ein offener P1 blockiert; hält Claude einen P1 für falsch, entscheidet der Benutzer). Ist Codex am Limit (Exit 3), gilt ersatzweise `/code-review` auf Stufe high plus Bestätigung des Benutzers für genau diesen PR; im PR steht es als Claude-Prüfung (Inhaber 2026-11-03). `/code-review` in Claude Code ist eine Claude-Prüfung und heißt auch so, nie „Codex-Review“.

### Zusammenarbeit Claude und Codex

Claude führt und arbeitet standardmäßig allein; Codex prüft vor kritischen Merges oder setzt per `ki:frag -- umsetzen` in eigener Kopie um; höchstens drei Review-Runden je PR; bei erschöpftem Kontingent (Exit 3) Stand sichern. Vollständige Regeln (gelten auch für Codex): `.claude/skills/codex/SKILL.md`, Abschnitt „Zusammenarbeit Claude und Codex“.

- **Parallel nur getrennt:** parallele Agenten sind erlaubt, wenn jeder Teil eine eigene Arbeitskopie und keine gemeinsamen Dateien hat. Agent-Teams (Agenten, die sich während der Arbeit abstimmen) nur mit Freigabe des Benutzers.
- **Ausgangsstand zuerst:** vor der ersten Änderung `git status` festhalten. Was dort schon geändert ist, stammt von anderen Sitzungen — erhalten, nicht überschreiben, nicht als eigene Arbeit ausgeben.
- **Fertig heißt belegt** (Befehl und Ergebnis, Ungetestetes ausdrücklich nennen): `godmode:completion-gate`.
- Externe 429/503/Timeouts: höchstens ein unmittelbarer Script-Retry (`workflow/retry.mjs`). Einzige Ausnahme: Der HTTP-Check der Preview direkt nach dem Push prüft 5xx (Kaltstart) bis zu zweimal mit Wartezeit nach (`PREVIEW_HTTP_WAITS_MS`); 4xx und bleibende 5xx brechen ab, die Wartezeiten nicht verlängern. Cloud-/Proxy-403 bei Storefront-Zugriff heißt: lokal auf dem Mac ausführen.

## Chat-Wächter (stehende Freigabe des Benutzers, 2026-11-11)

Die geplante Aufgabe `chat-waechter` darf wartende Chats mit der empfohlenen Option weiterbringen, fertige Chats archivieren und unkritische PRs nach Skill `ship` mergen. Grenzen und Ablauf (gelten auch für Codex): `.claude/skills/ship/SKILL.md`, Abschnitt „Chat-Wächter“. Kritisch und damit nur mit Ja des Benutzers: Preise, SKUs, Varianten, Massenimporte, Checkout, Deploy-Kette, `.claude/hooks/`, die Chat-Wächter-Regeln; im Zweifel kritisch.

## Eigenen PR selbst mergen (stehende Freigabe des Benutzers, 2026-11-12)

Eine Sitzung fragt bei einem unkritischen PR nicht mehr „Soll ich mergen?“, sondern mergt ihn selbst nach Skill `ship`, inklusive des dort beschriebenen Theme- oder Dashboard-Deploys. Grund: Der Benutzer hat diese Frage vom 03. bis 12.11. praktisch immer mit Ja beantwortet.

- **Nur der eigene PR:** den diese Sitzung für ihren Auftrag geöffnet hat. Fremde PRs mergt nur der Chat-Wächter oder der Benutzer per `/ship`.
- **Voraussetzung:** Auftrag vollständig umgesetzt und getestet, offen gegen `main`, kein Entwurf, CI grün, `npm run -s deploy:frei` frei, kein uncommitteter Stand auf dem Branch.
- **Weiter nur mit Ja des Benutzers:** kritische PRs (Liste unter „Chat-Wächter“ oben, dazu dieser Abschnitt; im Zweifel kritisch) · alles aus „NIEMALS ohne ausdrückliche Freigabe“ · PRs, deren Titel oder Auftrag einen Termin nennt („erst ab …“) · wenn der Benutzer für diesen Auftrag „nur PR“, „nicht mergen“ oder „nur Plan“ gesagt hat.
- Ein blockierender Hook oder die Sperre des Auto-Modus ist ein Befund: melden und die eine Zeile nennen, die der Benutzer schreiben müsste, nicht umgehen.

## Arbeitsmodus godmode

Die Skills des Plugins godmode (Planung, test-first, Review, Nachweis vor „fertig“) gelten für alle Sitzungen. Bei Widerspruch gilt diese Datei.

- **Keine Rückfragen aus godmode:** Wo `intent-discovery`, `rationale` oder `merge-protocol` den Benutzer wählen lassen wollen, die empfohlene Option nehmen, als „vorläufig“ kennzeichnen und weiterarbeiten. Gefragt wird nur in den Fällen aus „Selbst entscheiden“.
- **Abschluss** immer nach Skill `ship`, nie nach den Optionen von `merge-protocol`.
- **test-first** bei Liquid- und Theme-Dateien: Der Test sind die Guards (`npm run -s pruefen`), die Preview und ein Screenshot.
- **cross-model-review** läuft über `npm run -s ki:frag -- review <PR>` (Codex), Pflicht nur bei kritischen PRs (Liste unter „Chat-Wächter“); sonst prüft Claude.
- **knowledge-capture** schreibt in den Gedächtnis-Vault nach dessen Regeln (Abschnitt „Gedächtnis, Übergaben und Review“). Neue Regeln nur per PR.
- Modellwahl je Aufgabe und Subagent: `godmode:model-routing`.

## Selbst entscheiden

Ohne Frage erledigen und danach in einer Zeile berichten:

- alles zum Ablauf: Reihenfolge, anfangen, weitermachen, Fehler beheben, neue Sitzung oder hier
- fertige, geprüfte Arbeit mergen und live stellen, auch wenn ein Gate vorher abbrach und die Ursache behoben ist (Grenzen: „Eigenen PR selbst mergen“)
- Speichern, Einreichen und Anlegen im Browser, wenn es zum Auftrag gehört
- temporäre Dateien, Kopien und alte Worktrees aufräumen
- technische Wege wählen (Skript oder Dienst, Bibliothek, Aufbau)
- Werkbank-Einträge anlegen und verknüpfen

Weiter fragen, aber gebündelt in **einer** Frage am Ende, nicht mittendrin:

- Preise, Rabatte, Werbebudget
- was Kunden sehen und Geschmackssache ist: Bildwahl, Wortlaut, Knopf-Beschriftung
- alles aus „NIEMALS ohne ausdrückliche Freigabe“

Keine Schlussfragen der Art „Soll ich …?“: Gehört der nächste Schritt zum Auftrag, wird er gemacht. Nennt der Auftrag eine Außenwirkung ausdrücklich (z. B. „Storniere Bestellung 1234 und erstatte 59,90 €“), ist das die Freigabe; nicht noch einmal fragen. Unklare Daten werden nicht erfragt, sondern als offener Fall dokumentiert (Abschnitt „Produktdaten“).

## Anmeldungen und Freigaben

Eine Anmeldung oder Freigabe hält nur den betroffenen Schritt an, nie den Auftrag (Inhaber 2026-11-28).

**Grenzen, auch mit Erlaubnis:** kein Anmelden mit Passwort (auch nicht Browser-Autofill plus Klick), keine gespeicherten Passwörter auslesen, kein CAPTCHA lösen, keine Einmalcodes beschaffen, keine Freigabedialoge bestätigen, keine eigenen Sperren lockern, kein Skript, das eines davon übernimmt. Anmeldecodes nie über den Chat.

1. Zuerst einen Weg ohne Anmeldung nehmen: Connector, API, öffentliche Seite, bestehende Sitzung.
2. Sonst das Fenster in Claude in Chrome öffnen und alles vorbereiten. Für den Benutzer bleiben nur Passwort, Code, Zustimmung und Absende-Klick. Bei Terminal-Anmeldungen den einen Befehl nennen.
3. `PushNotification`: Dienst, der eine Handgriff, wo.
4. Werkbank-Eintrag (Gedächtnis `werkbank_shop_technik`): `status: wartet-inhaber`, `verantwortlich: inhaber`, `frage` = Handgriff, `naechsterSchritt` = wie es weitergeht. Ein offener Eintrag je Zugang, keine Geheimnisse.
5. Alle unabhängigen Schritte weiter erledigen.
6. Fortsetzen: Bei Terminal-Anmeldungen wartet ein Hintergrundbefehl, bis die lesende Prüfung grün ist (höchstens 1 Stunde). Browser-Seiten nach den übrigen Schritten erneut ansehen. Endet die Sitzung vorher, steht die Fortsetzung in der Werkbank, Schlusszeile „Offen: …“.
7. Eine abgelehnte Anmeldung nie wiederholen (Kontosperre).

Dasselbe gilt für Sperren des Auto-Modus. Wiederholt sich eine, gehört der Ablauf in einen schon freigegebenen Weg (Mac-Dienst). Abgelaufene Zugänge meldet vorab der Zugangs-Wächter (`operations/README.md`).

## Kommunikation

Bei klaren, reversiblen Aufgaben: analysieren → umsetzen → testen → live prüfen → kurz berichten. Wann gefragt wird: „Selbst entscheiden“.

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

- Hochflor-/Mittelflor-Zuordnung fachlich verbessern (Mittelflor ist seit 07.10. eigene Kategorie, die Zuordnung je Produkt bleibt offen)
- ecoVella-/Wolle-Zuordnung sauber prüfen
- Horizon 4.1.3 später separat migrieren (aufgeschobene Kernpunkte: `docs/weiterentwicklung/horizon-migration.md`)
- Produktbilder langfristig verbessern
- Reste & Sonderposten später als eigenen starken Shopbereich aufbauen (Reste-Seite seit 03.11. live mit Sofortkauf, Ausbau zu einem starken Shopbereich offen)
