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
| `npm run -s auslauf:sortieren [-- --schreiben]` | **nach jedem neuen Tag `auslauf` und jedem Import in Teppichboden/Teppiche**: Auslaufartikel ans Ende der manuell sortierten Kategorien (Shopify haengt Neues hinten an, also hinter sie); ohne `--schreiben` nur pruefen (Exit 1 = zu tun), mit Rollback-Datei und Gegenprobe |
| `npm run -s import:pruefen` | **nach jedem Import**: neue Produkte (Standard 7 Tage) auf Veroeffentlichung, Bilder, Kategorie, SKU, Muster und uebliche Filterfelder der Produktart; nur lesend |
| `npm run -s teppich:basis-daten` | **nach jedem Teppich-Import**: prueft `custom.teppich_basis_daten` (Gruppe, Qualitaetszeile, Breiten) gegen die Live-Regeln; `-- --pakete <ordner>` legt Schreibpakete + Rollback an → `docs/lessons/renderzeit-kollektionsseite.md` |
| `npm run farbcode:guard` | Farbvarianten, deren Codes durchgezaehlt statt abgeschrieben wurden |
| `npm run bewertung:guard` | Google-Bewertung, die wieder einzeln im Template steht statt in der Theme-Einstellung |
| `npm run lighthouse:messen` | **bevor jemand "schneller/langsamer" sagt**: Lighthouse gegen Live, 3 Seiten mit und ohne Cookie-Banner, 5 Runden reihum (rund 25 min); `-- --pruefen` nur Vorpruefung |
| `npm run -s kurz -- <art>` | Theme-Rollen, Push-Ergebnis, Worktrees gefiltert statt als Rohdump |
| `npm run -s handoff` | Uebergabetext fuer die naechste Sitzung aus dem Git-Stand |
| `npm run theme:diff -- --manifest <datei>` | Theme gegen Repository abgleichen |
| `npm run workflow:scratch -- --theme-id <id>` | Wegwerf-Theme zum Ausprobieren, ohne Evidence |

Weitere Pruefungen (`qa`, `seo:check`, `compare:check`, `sales:check`,
`secret:scan`) stehen im Skill `theme-regeln` unter „Tests“.
