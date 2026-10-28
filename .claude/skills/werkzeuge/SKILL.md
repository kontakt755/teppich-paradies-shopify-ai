---
name: werkzeuge
description: Uebersicht aller Projekt-Werkzeuge (npm run ...) mit Zweck und Zeitpunkt - Guards fuer Liquid, Schema, Templates, Theme-IDs, Schrift, Menue, Farbcodes, Bewertung; Doctors fuer Deploy und PRs; Pruefungen nach einem Import, Auslauf-Pruefung und -Sortierung, Teppich-Basisdaten, Lighthouse, Kurzausgaben, Handoff, Theme-Diff, Wegwerf-Themes. Verwenden, wenn ein passender Check oder Befehl gesucht wird, nach einem Import, nach einem neuen Tag auslauf, bevor jemand "schneller/langsamer" sagt und bevor ein eigenes Pruefskript geschrieben wird.
---

# Werkzeuge

Ausgelagert aus `AGENTS.md` (2026-10-16, ohne inhaltliche Aenderung). Die
Pflicht-Zeitpunkte (vor jedem Deploy, vor jedem Merge, vor jedem Commit, nach
jedem Import) nennt `AGENTS.md` weiter selbst.

| Befehl | Zweck |
|---|---|
| `npm run -s pruefen` | **vor jedem Commit** und in der PR-Validierung derselbe Lauf: alle Testsuiten, die Guards darunter (ohne menu/unmerged/essential), Theme Check gegen die Baseline, Secret-Scan, Python-Bildtest; meldet alle Fehler auf einmal. `-- --nur a,b` / `-- --ohne themecheck` (ohne Shopify CLI) |
| `npm run workflow:doctor` | **vor jedem Deploy**: alle Voraussetzungen in einem Lauf |
| `npm run -s deploy:frei` | **vor jedem Merge nach main**: läuft gerade ein Deploy (Preview bis Live)? Exit 1 = nicht mergen |
| `npm run theme:block list\|add\|remove` | Bloecke in Templates setzen, statt im Editor zu klicken |
| `npm run liquid:guard` | ungueltiges Liquid, das Shopify still verwirft |
| `npm run schema:guard` | Block-Schemata, die deployen aber im Editor unsichtbar bleiben |
| `npm run template:guard` | Kollektions-Templates, deren Produktkarte abweicht; Shopify-Blockgrenzen (50 je Section, z. B. Header-Kacheln) |
| `npm run theme:guard` | veraltete Theme-IDs in Anweisungsdateien, ungeschuetztes Live-Theme |
| `npm run schrift:guard` | feste Schriftgroessen (px/rem/clamp) statt der Skala `var(--tp-fs-*)` |
| `npm run menu:guard` | Menuelinks auf leeres Raster oder ins Nichts (braucht Netz) |
| `npm run unmerged:guard` | Bloecke/Templates auf ungemergten Branches |
| `npm run essential:guard` | Pflichtdateien und Template-Verweise vor dem Push |
| `npm run pr:doctor [-- --fix]` | offene PRs: falsche Basis, ueberkreuzte Historie, Konflikte |
| `npm run pr:doctor:melden` | dasselbe als idempotenter PR-Kommentar (CI: Push auf `main`, alle 6 h) |
| `npm run auslauf:pruefen` | **woechentlich automatisch**: gibt es jeden Artikel noch beim Lieferanten (A Schnellsuche, C/D/E Produktseite; B nur offline)? Schreibt `$TP_PRIVAT_DIR/auslauf/status.json`, Befunde als To-do; nur lesend |
| `npm run -s muster:nachfassen [-- --probe]` | **taeglich automatisch (Mo-Sa 9:30)**: faellige Muster-Nachfragen (Text 1 nach 4 Tagen, Erinnerung nach 10) vom Firmenpostfach verschicken, Zeitleiste „nachgefasst (automatisch)“; `--probe` listet nur. Braucht `$TP_PRIVAT_DIR/nachfassen/postfach.json` (600), sonst verschickt er nichts → `docs/control-center/ARCHITEKTUR.md` Abschnitt 23 |
| `npm run -s auslauf:sortieren [-- --schreiben]` | **nach jedem neuen Tag `auslauf` und jedem Import in Teppichboden/Teppiche**: Auslaufartikel ans Ende der manuell sortierten Kategorien (Shopify haengt Neues hinten an, also hinter sie); ohne `--schreiben` nur pruefen (Exit 1 = zu tun), mit Rollback-Datei und Gegenprobe |
| `npm run -s import:pruefen` | **nach jedem Import**: neue Produkte (Standard 7 Tage) auf Veroeffentlichung, Bilder, Kategorie, SKU, Muster und uebliche Filterfelder der Produktart; nur lesend |
| `npm run -s muster:kauf [-- --tage 90 --nach 30]` | **monatlich**: wie viele Musterkunden binnen 30 Tagen Ware kaufen, je Warengruppe des Musters; Quote nur ueber Muster mit abgelaufenem Fenster, gibt keine Kundendaten aus; nur lesend |
| `npm run -s teppich:basis-daten` | **nach jedem Teppich-Import**: prueft `custom.teppich_basis_daten` (Gruppe, Qualitaetszeile, Breiten) gegen die Live-Regeln; `-- --pakete <ordner>` legt Schreibpakete + Rollback an → `docs/lessons/renderzeit-kollektionsseite.md` |
| `npm run farbcode:guard` | Farbvarianten, deren Codes durchgezaehlt statt abgeschrieben wurden |
| `npm run bewertung:guard` | Google-Bewertung, die wieder einzeln im Template steht statt in der Theme-Einstellung |
| `npm run lighthouse:messen` | **bevor jemand "schneller/langsamer" sagt**: Lighthouse gegen Live, 3 Seiten mit und ohne Cookie-Banner, 5 Runden reihum (rund 25 min); `-- --pruefen` nur Vorpruefung |
| `npm run -s kurz -- <art>` | Theme-Rollen, Push-Ergebnis, Worktrees gefiltert statt als Rohdump |
| `npm run -s handoff` | Uebergabetext fuer die naechste Sitzung aus dem Git-Stand |
| `npm run -s ki:frag -- codex\|claude "Frage"` | direkte, nur lesende Rueckfrage an die andere KI; `weiter <ki>` setzt fort, Diff per stdin → Skill `codex` |
| `npm run -s ki:frag -- review <PR>` / `review-stand <PR>` | Codex-Review an den Head-Commit gebunden, in sauberer Kopie; `review-stand` endet nur bei passendem Review mit Exit 0 (vor kritischen Merges) |
| `npm run -s ki:frag -- umsetzen <thema> "Auftrag"` | Codex setzt in einer eigenen Kopie um (ohne Netz und Zugangsdaten, ohne Commit); Claude prueft, testet, committet → Skill `codex` |
| `npm run -s uebergaben [-- --an claude\|codex\|mensch]` | offene und wartende Uebergaben im Vault nach Empfaenger, mit Hinweisen auf unklare Zustaendigkeit und liegengebliebene Aufgaben |
| `npm run -s worktrees:aufraeumen [-- --entfernen]` | nach Merges: zeigt bzw. entfernt gemergte, saubere, ruhende Arbeitskopien (Branches bleiben) |
| `npm run -s gedaechtnis:sync -- pull\|push` | Vault-Sync von Hand (Codex); bricht bei Fehlern mit Exit 1 ab |
| `npm run theme:diff -- --manifest <datei>` | Theme gegen Repository abgleichen |
| `npm run workflow:scratch -- --theme-id <id>` | Wegwerf-Theme zum Ausprobieren, ohne Evidence |

Weitere Pruefungen (`qa`, `seo:check`, `compare:check`, `sales:check`,
`secret:scan`) stehen im Skill `theme-regeln` unter „Tests“.

## Abhaengigkeiten aktualisieren

npm (ab 11.19) fuehrt Installationsskripte von Abhaengigkeiten nur aus, wenn
`allowScripts` in `package.json` sie erlaubt. Puppeteer laedt darueber sein
Chrome; die Freigabe gilt genau fuer die gepruefte Version (`puppeteer@25.16.0`).
Nach einem Puppeteer-Update deshalb `npm install-scripts approve puppeteer`
und `npm ci` - sonst fehlt der passende Browser, und Social-Rendering,
`dashboard:pruefen` und `auslauf:pruefen` scheitern erst im Betrieb.
`npm install-scripts ls` zeigt, was noch ungeprueft ist. Danach
`npm run -s pruefen` (startet auch den Browsertest der Betriebssuite).

Fehlen Bibliotheken (leeres `node_modules`, frischer Worktree), brechen
`qa:unit:test` und `operations:test` sofort mit „FEHLER: Bibliotheken fehlen …“
und dem Befehl `npm ci` ab (`scripts/abhaengigkeiten.mjs`), statt dutzende
rote Tests zu zeigen. `dashboard:pruefen` nimmt puppeteer dann ersatzweise aus
dem Dienst-Checkout `~/tp-dashboard` (`scripts/puppeteer-laden.mjs`) und sagt das.
