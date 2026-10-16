# Claude-System: Bestandsaufnahme 16.10.2026

Auftrag des Inhabers: „Was ist veraltet, was laeuft gut, was kann man optimieren.“
Geprueft: `.claude/` (Settings, Hooks, Skills, Agent, README), `AGENTS.md`/`CLAUDE.md`,
`docs/lessons/`, `package.json`, globale Ebene (`~/.claude/settings.json`, globale und
synchronisierte Skills, Gedaechtnis-Index) und alle geplanten Aufgaben unter
`~/.claude/scheduled-tasks/`. Grundlage sind Befehle (ls, grep, node, jq) und
die 423 Sitzungsprotokolle des Projekts vom 09.09. bis 16.10.; Schaetzungen sind
als solche markiert. Stand des Repositorys: `origin/main` vom 16.10. vormittags.

Token-Faustregel fuer die Schaetzungen: deutscher Markdown-Text ≈ 3,3 Zeichen je Token.

---

## Laeuft gut

| Was | Beleg | Warum gut |
|---|---|---|
| Harte Grenzen als `deny`-Hooks statt `ask`-Regeln | `.claude/settings.json` (keine `ask`-Liste), `.claude/README.md` Abschnitt „Berechtigungen“ | Keine Rueckfragen in Auto/Bypass, trotzdem nicht aushebelbar. In 5 Wochen rund 250 Blockade-Meldungen in 67 Sitzungen (Quelltext-Zitate abgezogen; u. a. 112× `git checkout --`, 28× `reset --hard`, 14× `stash drop`, 10× `push --force`). Jede davon waere sonst verlorene Arbeit gewesen. |
| Deploy-Fenster gegen Merges waehrend Preview/Live | `.claude/hooks/git-gh-guard.mjs:274-305`, `workflow/deploy-fenster.mjs` | Rund 40 verweigerte Merges in 18 Sitzungen seit Einfuehrung – jeder davon haette einen laufenden Live-Gang mit `LIVE_SOURCE` abbrechen koennen. |
| Theme-Loesch-Sperre | `.claude/hooks/theme-delete-guard.mjs` | 16 Blockaden in 6 Sitzungen. |
| Hooks sind getestet | `npm run hooks:test` (in `npm test`), `qa/tests/git-gh-guard.test.mjs` | Ausnahmen bleiben eng; eine verlorene Ausnahme wurde ueber Tests gefunden. |
| SessionStart ist schlank | `.claude/hooks/session-start.sh`; lokale Ausgabe am 16.10. gemessen: 590 Byte (≈ 180 Token) | Kurzstand des Control Centers statt Rohdaten; volle Guard-Liste nur in Remote-Sessions. |
| Router, Voranalyse, Pflicht-Review entfernt | `.claude/README.md` „Was bewusst nicht mehr hier liegt“ | Begruendet mit Messzahlen; spart Wartezeit je Antwort. |
| Skills sind schmal geschnitten und werden benutzt | Aufrufe 09.09.–16.10.: deploy 38 Sitzungen, control-center 10, produktimport 9, shopify-massendaten 5, lieferant-a-recherche 4, raumbilder-recherche 2; Agent control-center in 8 Sitzungen | Beschreibung im Listing je ≈ 350–500 Zeichen, Volltext nur bei Bedarf. |
| Werkzeug-Verweise sind konsistent | Abgleich aller `npm run <x>` in `AGENTS.md`, `CLAUDE.md`, `.claude/`, `docs/`, `qa/`, `workflow/`, `scripts/` gegen `package.json` | Alle 35 in `AGENTS.md` genannten Skripte existieren, alle Skriptdateien hinter den 96 Eintraegen in `package.json` existieren. Tote Verweise nur in Archiv-/Konzeptdateien (siehe unten). |
| Lessons sind sauber vom Regelwerk getrennt | `docs/lessons/README.md` | Werden nicht bei jedem Start geladen; jede Regel in `AGENTS.md` zeigt auf ihre Lesson; keine toten Verweise. |
| Gedaechtnis-Index ist kompakt | `MEMORY.md`: 58 Zeilen, 8 157 Byte, 0 tote Links | Weit unter der Ladegrenze; Rest in 243 Einzeldateien bzw. `index_*`-Seiten. |
| Gedaechtnis-Sync | `.claude/hooks/gedaechtnis-sync.sh` | Blockiert nie, Konflikte zugunsten der eigenen Arbeit, getestet (`gedaechtnis-sync.test.mjs`). |

---

## Veraltet (mit Beleg)

Mit **[behoben]** markierte Punkte sind in diesem PR korrigiert (nur Doku, keine Regel- oder Hook-Aenderung).

1. **Doctor-Doku widerspricht der Doctor-Ausgabe.** `.ai/DEPLOYMENT-TROUBLESHOOTING.md:170` verlangte „Erst wenn dort `PREFLIGHT: BEREIT` steht, `workflow:preview` starten“. Der Doctor prueft aber auch „Preview-Evidence passt zum aktuellen origin/main“ (`workflow/cli.mjs:131-134`) – diese Evidence entsteht erst durch die Preview. Vor jeder neuen Preview steht daher zwangslaeufig `PREFLIGHT: 1 offen` (am 16.10. nachgestellt: `PREFLIGHT: 3 offen` auf einem Arbeitszweig, davon einer genau dieser Punkt). Wer der Doku folgt, darf nie deployen; wer deployt, lernt die Doku zu ignorieren. **[behoben]** Doku nennt jetzt „vor Preview genau dieser eine Punkt offen, `BEREIT` gilt fuer Live“.
2. **`docs/WORKFLOW.md:18` beschrieb Pruefungen, die der Doctor nicht macht** („Theme-Rollen, offenes Deploy-Fenster“). Der Code (`workflow/cli.mjs:93-183`) prueft weder Rollen noch Fenster, auch nicht Theme Check und `schrift:guard` (beide stehen in AGENTS „Vor jedem Commit“, Theme Check bricht sonst erst die Preview mit `--strict` ab). **[behoben]** Liste an den Code angepasst.
3. **Deploy-Skill nennt einen entfernten Befehl:** „`doctor`, `route` und `validate --static` sind absichtlich frei“ (`.claude/skills/deploy/SKILL.md:50`). `workflow/cli.mjs route` gibt es seit dem Router-Rueckbau nicht mehr (`node workflow/cli.mjs route` → `WORKFLOW: FAIL`). **[behoben]**
4. **`.claude/README.md` „SessionStart-Hook: Laeuft nur in Remote-Sessions“** – falsch: Sync-Pfad-Waechter und Control-Center-Kurzstand laufen in jeder Sitzung (`session-start.sh:11-30`). Die Tabellenzeile sagte „installiert Abhaengigkeiten“ (nur remote). **[behoben]**, ebenso die entsprechende Zeile in `CLAUDE.md`.
5. **Pre-Commit-Hook gegen alte Branches ist nicht installiert.** `AGENTS.md` (Fallstrick 6) und `.claude/README.md` zaehlen ihn als Gate („warnt ab 7, blockiert ab 30 Tagen“). Im Hauptcheckout liegen unter `.git/hooks/` nur `*.sample`, `core.hooksPath` ist leer, Husky ist nicht im Projekt. `SETUP.md` Option 3 (`core.hooksPath .claude/hooks`) koennte nie wirken, weil die Datei `pre-commit-unmerged-branch.sh` heisst und Git `pre-commit` sucht. **[behoben]** in `SETUP.md` (Status und funktionierender Installationsweg); die Installation selbst ist eine Aenderung am Rechner, siehe Optimieren Nr. 9.
6. **`git-gh-guard.mjs` traegt eine Ausnahme fuer eine Datei, die nicht mehr im Git ist.** Kommentar `:23-28` „dashboard-data.yml committet sie stuendlich“ – den Workflow gibt es nicht mehr (`.github/workflows/dashboard-data.yml` fehlt), `issues.json` ist seit 30.09. ungetrackt. Ebenso `:17` „jq ist nicht installiert“ – jq ist installiert. Harmlos, aber Ballast; nur Vorschlag (Hook).
7. **Lessons-Index zeigte auf einen Abschnitt „Dashboard“ in `AGENTS.md`, den es nicht mehr gibt** (`docs/lessons/README.md:17-18`). Beide Lessons sind laut eigenem Kopf „erledigt 2026-09-30“. **[behoben]** als Vorgeschichte gekennzeichnet.
8. **`AGENTS.md:19` „von dort [Hauptcheckout] laufen die Hooks aller Sitzungen“** stimmt fuer App-Worktrees nicht: deren Protokolle laden `CLAUDE.md`/`AGENTS.md` aus dem Worktree selbst (Stichprobe der 5 neuesten Protokolle je Projektordner, 65 Sitzungen: alle 54 Worktree-Sitzungen laden die Dateien aus ihrem Worktree, 9 Sitzungen aus dem Hauptcheckout), damit auch dessen `.claude/settings.json`. Nur Sitzungen, die im Hauptcheckout starten, nutzen dessen Stand – und der ist **95 Commits hinter `origin/main`** (HEAD vom 15.10. 11:33). Folge heute: Sitzungen im Hauptcheckout sehen `schrift:guard` nicht in „Vor jedem Commit“ und die alte Modellangabe in `CLAUDE.md`. Nur Vorschlag (Regeltext), siehe Optimieren Nr. 4.
9. **Branch `main` liegt in `~/Developer/tp-fellara-dekofell`**, nicht in einem Deploy-Worktree wie in `AGENTS.md:20` beschrieben (`~/Developer/tp-deploy` existiert nicht). Laut `npm run -s kurz -- worktrees` hat er 1 geaenderte Datei – der Doctor meldet dann „Working Tree ist sauber: FEHLT“. Funktional egal (der Skill sucht `[main]` per `git worktree list`), aber verwirrend.
10. **14 App-Worktrees mit bereits gemergtem Branch** stehen noch unter `.claude/worktrees/` (u. a. `ads-optimierung-20261016`, `angebotsassistent-betrieb`, `geschenkgutschein-d40c4d`, vier `live-theme-nach-*`, `recherche-20261016`), dazu 11 nicht registrierte Reste (`b2`, `mainlane`, `_ablage`, acht `live-*.log`/`preview-*.log`). `AGENTS.md:18`: „Nach dem Merge wird der Worktree entfernt.“
11. **`.claude/settings.local.json` (Hauptcheckout) ist reiner Altbestand.** 46 Einzelfreigaben (u. a. `Bash(rm -f *)`, `Bash(git checkout *)`, Pfade unter `/tmp/lino` und einem alten Skill-Plugin-Ordner, eine Freigabe mit fest eingetragener Theme-ID); `.claude/settings.json` erlaubt `Bash`, `Read`, `Edit` … ohnehin pauschal. Daneben `settings.json.bak` und `settings.local.json.bak` vom 07.09. (Router-Zeit, mit `codex-stop-review.mjs`). Wirkung null, nur Verwirrung beim Lesen.
12. **Konto-Skill fuer Raumbilder aus der Mediendatenbank von Lieferant A** (synchronisiert aus claude.ai unter `~/.claude/skills/synced/…/`, Stand 23.09.) beschreibt einen Teil dessen, was der Projekt-Skill `raumbilder-recherche` vollstaendig regelt – und traegt den Lieferanten-Klarnamen im Skill-Namen, der in jeder Sitzung im Skill-Listing steht. `produktimport/SKILL.md` sagt ausdruecklich, dass er den alten Konto-Import-Skill ersetzt; fuer Raumbilder fehlt dieser Schritt.
13. **Geplante Aufgaben mit veraltetem Inhalt** (Details in der Tabelle unten):
    - `auslauf-sammlungen-abgleichen` baut das Hauptmenue per handgeschriebenem `menuUpdate` um; seit 15.10. gilt `AGENTS.md`: „Den Menuebaum nur mit `scripts/menue-umbau.mjs` umbauen“. Schritt 3 nutzt `publishableUnpublish`, das der Shopify-MCP seit 13.10. grundsaetzlich ablehnt (Gedaechtnis `shopify_mcp_unpublish_gesperrt.md`).
    - `shop-zahlen-export` beschreibt als Hauptweg den MCP-Bulk-Export; tatsaechlich aktualisiert der LaunchAgent `net.teppich-paradies.sync` (`sync-dienst.mjs`) alle 10 Minuten, der Lauf zieht real nur noch `~/tp-dashboard` nach (Zusammenfassung 16.10.: „Arbeitskopie … nachgezogen“).
    - `social-redaktion`: Beschreibung „veroeffentlicht und gibt nichts frei“, Prompt: „Seit 01.10.2026 postet das System selbststaendig … gibt das System automatisch frei“.
    - `restbestand-waechter` archiviert Produkte, wenn die letzte Farbe wegfaellt, setzt aber keine 301-Weiterleitung; `AGENTS.md` „Produktdaten“ (Inhaber 13.10.) verlangt Archivieren **und** 301.
14. **Tote `npm run`-Verweise ausserhalb des Regelwerks:** `workflow:route` in `domains/lieferanten/teppiche/produktimport-standard-fellara.md:14` (Router entfernt), `control:center`/`automation:dashboard` in `docs/control-center/BESTANDSAUFNAHME.md`, `aktion:guard` in `domains/shopify/aktionssystem-konzept.md`, `workflow:router`/`workflow:batch-mutations` in `automation/`-Berichten. Nicht korrigiert (Fach-/Archivtexte), nur zur Kenntnis.

---

## Optimieren (nach Wirkung sortiert)

| # | Vorschlag | Beleg | Wirkung | Aufwand |
|---|---|---|---|---|
| 1 | **Polling-Aufgaben per Skript vorfiltern.** `fehlermeldungen-werkbank` (alle 30 min, Mo–Sa 7–19 Uhr = 156 Sitzungen/Woche) und `serviceanfragen-postfach` (stuendlich = 66/Woche) starten jedes Mal eine volle Claude-Sitzung, obwohl Schritt 1 ein reines Skript ist (`npm run -s fehler -- abgleich`). Von 98 Laeufen der Fehlermeldungen dauerten die letzten 30 je 20–60 s; jeder, der eine Zusammenfassung hinterliess, meldete „keine neuen Fehlermeldungen“. Vorschlag: LaunchAgent prueft per Skript, Claude laeuft nur bei Treffern (oder Takt auf stuendlich senken). | `list_task_runs fehlermeldungen-werkbank` (98 Laeufe, 16.10.); SKILL.md Schritt 1 | ≈ 220 von ≈ 260 geplanten Sitzungen pro Woche entfallen; je Sitzung geschaetzt 20–30 Tsd. Token Grundlast (Regelwerk, Gedaechtnis, Werkzeug- und Skill-Listen, siehe Nr. 2/3) → grob 5 Mio. Token/Woche weniger. | M |
| 2 | **Unbenutzte Konnektoren und Plugins fuer dieses Projekt abschalten.** Jede Sitzung listet ≈ 580 aufschiebbare Werkzeugnamen und 56 Marketing-Plugin-Skills. Doppelt vorhanden: Gmail, Kalender, Drive (Konto-Konnektor **und** Plugin `pmm-positioning`). Drei Werbe-Plugins (hypd, ryze, adwhispr); nur hypd wird in geplanten Aufgaben benutzt (8 Aufgaben), ryze und adwhispr nirgends – beide koennen schreiben (Kampagnen starten, Budgets aendern, `runRawMutate`). | Werkzeugliste der Sitzung vom 16.10. (gezaehlt); `grep -l hypd/ryze/adwhispr ~/.claude/scheduled-tasks/*/SKILL.md` | geschaetzt 10–15 Tsd. Token je Sitzung (Werkzeugnamen ≈ 32 KB, Server-Hinweise ≈ 8 KB, Skill-Beschreibungen); weniger Fehlgriffe auf das falsche Gmail/Drive; zwei ungenutzte Schreibzugaenge auf Werbekonten weniger. | S |
| 3 | **`AGENTS.md` um ≈ 40 % kuerzen, Fachteile bei Bedarf laden.** 26 KB ≈ 7,9 Tsd. Token in jeder Sitzung und jeder geplanten Aufgabe. Kandidaten (Zeichen): „Was hier immer wieder schiefging“ 4 745 → je Punkt eine Zeile + Lesson (Codebloecke stehen in Lessons/Skills schon, `docs/lessons/README.md` verlangt selbst „Einzeiler-Verweis“); „Werkzeuge“-Tabelle 3 125 → in `docs/WORKFLOW.md` oder `npm run hilfe`; „Preislogik“ 1 640 → Skill `shopify-massendaten`/eigener Skill „preise“ (Preisaenderungen brauchen ohnehin Freigabe); „Produktkarten“/„UX“/„Bilder“ 1 497 und „Shopify Theme“ 1 789 → Skill „theme“; „Backlog“ 654 → Werkbank. | Abschnittsgroessen `AGENTS.md` (awk, 16.10.) | ≈ 3 Tsd. Token je Sitzung; die harten Grenzen („NIEMALS“, Arbeitskopien, Deploy, Vor jedem Commit) bleiben immer geladen. Gilt auch fuer Codex. | M |
| 4 | **Hauptcheckout automatisch nachziehen.** Er stand heute 95 Commits hinter `origin/main`; Sitzungen und geplante Aufgaben, die dort starten, arbeiten mit Regeln und Hooks von gestern (Befund Veraltet Nr. 8). SessionStart-Zeile: wenn losgeloest und sauber → `git fetch -q origin && git checkout -q --detach origin/main`. Dazu `AGENTS.md:19` richtigstellen (Worktrees nutzen ihre eigene Kopie). | `.git/HEAD` = Commit vom 15.10.; `git rev-list --count` = 95 | Kein Arbeiten nach ueberholten Regeln; kein manuelles Nachziehen. | S |
| 5 | **Shopify-Grenzen auch fuer den MCP-Weg als Hook.** Theme-Loesch-Sperre und alle uebrigen Guards haengen nur am Matcher `Bash` (`theme-delete-guard.mjs:83` liest nur `tool_input.command`). Der Shopify-MCP (`mcp__87afcfe9…__graphql_mutation`) ist in `.claude/settings.json` pauschal freigegeben; Theme-Loeschung, Preis-, SKU- und Variantenmutationen laufen dort ohne Sperre. `domains/shopify/risk-map.json` (mit `protectedResources`) wird nur von `qa/live-theme-guard.mjs` gelesen. Vorschlag: PreToolUse-Hook auf `graphql_mutation`, der Theme-Loeschen immer und Preis-/Varianten-/Loesch-Mutationen ohne Freigabedatei (`~/teppich-paradies-analyse/freigaben/<datum>.json`) verweigert. Gleiches fuer `shopify store execute --query-file` (Inhalt der Datei pruefen). | `.claude/settings.json` (Matcher), `theme-delete-guard.mjs`, `grep risk-map.json` | Die Liste „NIEMALS ohne ausdrueckliche Freigabe“ waere fuer Shopify-Daten technisch durchgesetzt statt nur Prosa. | M |
| 6 | **Deploy-Hinweis-Hook schaerfen.** `deploy-command-guard.mjs` prueft `/workflow:(preview|live)|theme (push|publish)/` auf den ganzen Befehlstext. 769 Bash-Befehle loesten ihn aus; nur ≈ 215 enthielten `workflow preview/live` (wofuer der Doctor gilt), ≈ 540 waren `shopify theme push` ins Arbeits-/Dev-Theme, der Rest Texte in `gh`-PR-Beschreibungen, `jq`/`python`-Bearbeitungen von `live-theme.json` – in dieser Analyse loeste ihn ein `sed`-Befehl aus. Vorschlag: nur Segmente, die mit `npm run workflow:preview|live` bzw. `node workflow/cli.mjs preview|live` beginnen; Hinweis je Sitzung einmal. | Auswertung der Protokolle 09.09.–16.10. | weniger Rauschen im Kontext; der Hinweis wird wieder ernst genommen. | S |
| 7 | **Geplante Aufgaben aufraeumen** (Tabelle unten): 8 erledigte/pausierte loeschen, 3 heutige nach ihrem Lauf loeschen, 2 Ads-Auswertungen zusammenlegen, `shop-zahlen-export` auf „Dienst-Checkout nachziehen, 1× taeglich“ kuerzen, `dashboard-daten-sichern` (reines Skript) als LaunchAgent. Veraltete Prompts (Menue, Unpublish, 301, Social-Beschreibung) anpassen. | `list_scheduled_tasks` 16.10. | Uebersicht; ≈ 7 Sitzungen/Woche weniger; keine Aufgabe arbeitet gegen eine neuere Regel. | S |
| 8 | **Auslauf-Pruefung nicht doppelt.** Montags 04:00 prueft der LaunchAgent `net.teppich-paradies.auslauf` (`npm run auslauf:pruefen`, Ampel in `status.json`) die Lieferantenverfuegbarkeit; 06:15 fragt `restbestand-waechter` mit eigenem Skript dieselbe Frage fuer Lieferant A erneut ab, 08:00 folgt `auslauf-sammlungen-abgleichen`. Vorschlag: Waechter liest `status.json` statt selbst zu crawlen und setzt beim Archivieren die 301 (AGENTS-Regel vom 13.10.). | LaunchAgent-plist, `restbestand-waechter/SKILL.md`, `pruefung.log` (13.10.: 1 240/1 046/524 Artikel geprueft) | eine Quelle der Wahrheit fuer „ausgelaufen“; keine archivierten Adressen ohne Weiterleitung. | M |
| 9 | **Pre-Commit-Hook wirklich installieren** (einmal je Mac, Weg in `SETUP.md`) und dabei gegen `origin/main` statt lokales `main` pruefen (`pre-commit-unmerged-branch.sh:13`; lokales `main` liegt im Deploy-Worktree und war heute 4 Commits zurueck). Sonst den Hook und die Erwaehnung in `AGENTS.md` streichen – `unmerged:guard` im Doctor deckt den Deploy-Fall ab. | Veraltet Nr. 5 | Ein Gate, das nur auf dem Papier steht, wird nicht mehr mitgezaehlt. | S |
| 10 | **Altlasten entfernen:** 14 gemergte Worktrees + 11 Reste unter `.claude/worktrees/` (`npm run -s kurz -- worktrees` zeigt, welche ungesicherte Arbeit tragen), `.claude/settings.local.json` auf das Noetige leeren und die beiden `.bak`-Dateien loeschen, Konto-Skill fuer Raumbilder (Veraltet Nr. 12) in claude.ai abschalten, `issues.json`-Ausnahme und veraltete Kommentare aus `git-gh-guard.mjs` nehmen (mit Testanpassung). | Veraltet Nr. 6, 10, 11, 12 | weniger Fehlgriffe beim Suchen; Skill-Listing ohne Lieferanten-Klarnamen. | S |

Nicht in den Top 10, aber notiert: `git checkout -- <datei>` wurde 112-mal blockiert – meist der Versuch, eine eigene Aenderung zurueckzunehmen. Ein Satz in `AGENTS.md` mit dem erlaubten Weg (eigenen WIP-Commit anlegen, dann gezielt zuruecknehmen) spart je Fall einen Umweg. Globales Modell ist in `~/.claude/settings.json` gesetzt; `CLAUDE.md` nennt seit heute bewusst kein Modell mehr (die alte Angabe „Opus“ widersprach der Einstellung).

---

## Geplante Aufgaben (Stand 16.10., 08:48 Uhr)

Gezaehlt sind **30** Aufgaben: die 29 aus dem Auftrag plus `serviceanfragen-postfach` (heute 08:25 angelegt). Eine deaktivierte Einmal-Aufgabe laeuft nicht mehr; Loeschen raeumt nur die Liste auf.

| Aufgabe | Zeitplan | Zustand | Empfehlung |
|---|---|---|---|
| `11880-nachhaken` | Mo 09:00 | aktiv, noch nie gelaufen | behalten – Abbruchbedingung ergaenzen (Antwort da → Aufgabe loeschen) |
| `ads-auswertung-2026-10-29` | einmalig 29.10. 08:30 | aktiv | zusammenlegen mit `werbebudget-auswertung-2026-10-31` (beide entscheiden das Werbebudget, gleiche Datenquellen) |
| `ads-lead-conversion-check` | einmalig 30.09. 15:00 | gelaufen, aus | Datum vorbei – loeschen |
| `ads-pruefung-2026-10-15` | einmalig 15.10. 08:30 | gelaufen, aus | Datum vorbei – loeschen |
| `auslauf-sammlungen-abgleichen` | Mo 08:00 | aktiv | behalten – Prompt anpassen: Menue nur ueber `scripts/menue-umbau.mjs`, Abschalten statt `publishableUnpublish` als Aufgabe fuer den Admin melden |
| `befestigungs-tipp-vorher-nachher` | einmalig 02.11. 09:00 | aktiv | behalten |
| `branchenbuecher-pruefen-2026-10-17` | einmalig 17.10. 09:00 | aktiv | behalten |
| `dashboard-daten-sichern` | taeglich 22:30 | aktiv | behalten – besser als LaunchAgent (reines `npm run daten:sichern`, keine Entscheidung) |
| `dauerrabatt-liste-auffrischen-2026-10-24` | einmalig 24.10. 09:00 | aktiv | behalten |
| `dauerrabatt-rueckstellen-2026-11-02` | einmalig 02.11. 08:00 | aktiv | behalten |
| `fehlermeldungen-werkbank` | alle 30 min, Mo–Sa 7–19 Uhr | aktiv, 98 Laeufe | behalten – Vorfilter per Skript (Optimieren Nr. 1) |
| `florhoehe-filter-nachpruefen` | einmalig 09.10. 10:00 | gelaufen, aus | Datum vorbei – loeschen |
| `google-ads-shopping-check-2026-10-27` | einmalig 27.10. 09:00 | aktiv | behalten |
| `grosshandel-nachtlauf-pruefen` | einmalig 29.09. 07:30 | gelaufen, aus | Datum vorbei – loeschen |
| `hersteller-antworten-pruefen-2026-10-16` | einmalig 16.10. 09:00 | heute faellig | behalten bis zum Lauf, danach loeschen |
| `kaufmessung-pruefen-2026-10-16` | einmalig 16.10. 09:20 | heute faellig | behalten bis zum Lauf, danach loeschen |
| `kettelbilder-auto` | 2× stuendlich | pausiert seit 01.10. | loeschen – Kettelbilder laut Gedaechtnis weitgehend live, Rest wird von Hand gemacht; das Bild-Abo, auf das sie baute, ist laut Gedaechtnis seit 15.10. eingeschraenkt |
| `kettelbilder-auto-2` | 2× stuendlich | pausiert seit 01.10. | loeschen (zweiter Lauf derselben Aufgabe) |
| `kollektion-marke-nachtragen` | taeglich 09:00 | pausiert seit 30.09., „fertig, 0 offen“ | loeschen |
| `merchant-center-nachkontrolle-2026-10-16` | einmalig 16.10. 09:07 | heute faellig | behalten bis zum Lauf, danach loeschen |
| `meta-muster-kampagne-check-2026-10-02` | einmalig 02.10. 08:00 | gelaufen, aus | Datum vorbei – loeschen |
| `musterkunden-liste-montag` | Mo 08:00 | aktiv | behalten |
| `rabattaktion-welle1-rueckstellen` | einmalig 19.10. 00:30 | aktiv | behalten (Lauf) |
| `rabattwelle1-rueckstellen-2026-10-19` | einmalig 19.10. 08:00 | aktiv | behalten (bewusste Nachkontrolle zum Lauf um 00:30) |
| `restbestand-waechter` | Mo 06:15 | aktiv | behalten – mit `auslauf:pruefen` zusammenfuehren und 301 ergaenzen (Optimieren Nr. 8) |
| `serviceanfragen-postfach` | stuendlich, Mo–Sa 8–18 Uhr | aktiv seit heute | behalten – gleicher Vorfilter wie Fehlermeldungen |
| `shop-zahlen-export` | taeglich 07:00 und 14:00 | aktiv, 45 Laeufe | zusammenlegen mit dem LaunchAgent `sync` (exportiert alle 10 min): Aufgabe auf „`~/tp-dashboard` nachziehen“ kuerzen, 1× taeglich |
| `social-redaktion` | Mo–Fr 07:45 | aktiv | behalten – Beschreibung an Auto-Freigabe seit 01.10. anpassen |
| `werbebudget-auswertung-2026-10-31` | einmalig 31.10. 09:00 | aktiv | zusammenlegen mit `ads-auswertung-2026-10-29` |
| `werkbank-abgleich` | Mo–Fr 08:30 | aktiv | behalten |

**Summe:** 8 loeschen (Datum vorbei bzw. erledigt/pausiert), 3 nach dem heutigen Lauf loeschen, 3 zusammenlegen (2 Ads-Auswertungen zu einer, `shop-zahlen-export` mit dem Sync-Dienst), 16 behalten (davon 6 mit Prompt-Anpassung oder Vorfilter).

---

## Was jede Sitzung kostet (Grundlast, Schaetzung)

| Baustein | Groesse | ≈ Token | Laden bei Bedarf moeglich? |
|---|---|---|---|
| `AGENTS.md` | 26 123 Byte | 7 900 | teilweise, ≈ 3 000 (Optimieren Nr. 3) |
| `CLAUDE.md` | 2 584 Byte | 800 | nein, schon knapp |
| `MEMORY.md` | 8 157 Byte | 2 500 | Abschnitt „Offene Auftraege“ (14 Zeilen Zwischenstaende) widerspricht `AGENTS.md` „keine Zwischenstaende“ im Vault; gehoert in die Werkbank |
| SessionStart-Ausgabe (lokal) | 590 Byte | 180 | – |
| Skill-Listing (≈ 95 Skills, davon 56 aus Marketing-Plugins) | geschaetzt 20 KB | 6 000 | ja, Plugins abschalten (Nr. 2) |
| aufschiebbare Werkzeugnamen (≈ 580) + Server-Hinweise | geschaetzt 40 KB | 12 000 | ja, Konnektoren abschalten (Nr. 2) |
| **Summe** | | **≈ 29 000** | **≈ 15 000 vermeidbar** |

Bei ≈ 260 geplanten Sitzungen pro Woche plus den Arbeitssitzungen ist die Grundlast der groesste einzelne Posten; Nr. 1 bis 3 zusammen halbieren sie.
