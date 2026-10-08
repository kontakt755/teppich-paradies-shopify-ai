---
name: control-center
description: Das Control Center (docs/ai-dashboard, npm run dashboard) gestalten, erweitern und reparieren - Startseite "Heute", Einkauf, Arbeit, Lexikon, Freigaben, Ratgeber. Verwenden bei jeder Aenderung an der Oberflaeche (app.js, ereignisse.mjs, kern/, bausteine/, ansichten/, app.css, index.html), an scripts/serve-dashboard.mjs oder dashboard-api.mjs, bei Design-/Uebersichtswuenschen des Inhabers und bevor ein Dashboard-PR gemergt oder der Dashboard-Dienst neu gestartet wird.
---

# Control Center – gestalten und ausbauen

Das Control Center ist das Arbeitswerkzeug des Betriebs: morgens zuerst
offen, im Einkauf den ganzen Tag. Jede Aenderung muss danach **nachweislich
funktionieren** – im Browser, am Handy, mit echten Daten (als Kopie).

## Vorher lesen

- `docs/control-center/ARCHITEKTUR.md` (Betriebsarten, Netzmodus mit Passwort,
  Einkauf, Heute, Datenaktualisierung) und die letzten Eintraege in
  `docs/control-center/CHANGELOG.md`.
- `AGENTS.md` Abschnitt "Arbeitskopien" (issues.json/bodenwissen.json sind erzeugt, nicht im Git) und Punkt 8
  (Lieferanten nur als Pseudonym A-D).

## Harte Regeln

1. **Repository, Issues und PRs sind oeffentlich.** Kundendaten, Umsaetze,
   Lieferantennamen und Einkaufsdaten nur aus `$TP_PRIVAT_DIR` ueber
   `/api/*` des lokalen Servers – nie in `docs/`, nie in `issues.json`, nie in
   Screenshots im Repository.
2. **Keine GitHub-API mit Token im Frontend.** Schreibaktionen laufen ueber
   `/api/*` und werden serverseitig geprueft (`lib/model.mjs` gilt in Browser
   und Server).
3. **`docs/ai-dashboard/issues.json` nie committen**, Dateien einzeln stagen.
4. **Klicktests nie gegen die echten Daten.** `npm run dashboard:pruefen`
   arbeitet mit einer Kopie; fuer Klickstrecken `--offen` nutzen.
5. **Nichts erfinden.** Fehlt ein Export, zeigt die Ansicht den Hinweis samt
   Befehl, keine Demo-Zahlen.

## Parallel arbeitende Sessions

An diesem Dashboard arbeiten oft mehrere Sessions gleichzeitig (am 2026-09-23
sechs PRs in einer Stunde). Deshalb:

- Eigener Worktree auf frischem `origin/main`, nie im geteilten Checkout.
- Vor dem Start: `gh pr list --search "dashboard OR Control Center"` und die
  Dateien offener PRs ansehen – wer fasst gerade dieselbe Ansicht an? Die
  Oberflaeche ist seit 2026-10-01 in Module zerlegt (`ansichten/<route>.mjs`,
  `bausteine/`, `kern/`; Aufbau und Andockstellen: `docs/ai-dashboard/README.md`).
  Eine Aenderung an einer Ansicht bleibt in deren Modul.
- Kleine, thematisch geschlossene PRs. Vor dem PR `git fetch && git rebase
  origin/main`, Konflikte in den gemeinsamen Dateien (`app.js`, `ereignisse.mjs`,
  `kern/`) von Hand zusammenfuehren (beide Seiten
  behalten, nicht eine verwerfen).
- Fremde Worktrees (`~/tp-wt-*`, `.claude/worktrees/*`) und den Dienst-Checkout
  `~/tp-dashboard` nicht umschalten. In `~/tp-dashboard` wird main nach dem
  Merge hineingemergt (siehe unten, Schritt 9).

## Gestaltung

Ziel: ruhig, klar, in einer Bildschirmhoehe erfassbar. Farbe traegt Bedeutung.

**Hierarchie.** Kundengeschaeft vor interner Arbeit. Oben das, was heute Geld
oder Aerger bedeutet (offene Auftraege, zu bestellen, Probleme), darunter die
Aufgabenverwaltung, ganz unten Systemzustand – und der nur, wenn etwas nicht
stimmt.

**Farbe** (Tokens in `app.css` unter `:root`, Dunkelmodus darunter):
- Rot (`--crit`) = Problem, das jemand loesen muss. Bernstein (`--warn`) = zu
  tun. Alles andere neutral. Keine blauen/gruenen Zahlen fuer blosse Mengen.
- Akzent `--accent` (Terrakotta der Marke) nur fuer Auswahl/Aktiv-Zustand und
  die eine Hauptaktion je Bereich.
- 0 wird grau oder faellt weg – echte Zahlen sollen hervorstechen.

**Inhalt vor Dekoration.**
- Eine Zahl steht genau einmal auf einer Seite.
- Nur zeigen, was vom Normalfall abweicht („Telefonnummer fehlt"), nicht jeden
  Zustand („Bezahlt: PAID").
- Spalten, die in der aktuellen Ansicht ueberall gleich oder leer sind,
  ausblenden (Beispiel `tableView()` in `ansichten/arbeit.mjs`).
- Lange Listen: Standardfilter auf die eigentliche Arbeitsliste, Rest einen
  Klick entfernt; seitenweise (25) statt endloser Seiten.
- Kachelzahl und Liste darunter muessen dieselbe Menge zaehlen.

**Sprache** (die Oberflaeche ist deutsch, fuer Mitarbeiter ohne IT-Hintergrund):
- Nie interne Marker oder API-Werte zeigen: `UNGEKLAERT` → „ungeklaert"/„fehlt",
  `PAID` → „bezahlt", `UNFULFILLED` → „nicht versendet", Label
  `status:review` → „Status Review". Uebersetzungstabellen stehen bei ihrer Ansicht
  (`FINANZ_LABEL`, `VERSAND_LABEL`, `labelKlartext`, `hinweisText`).
- Knoepfe sagen, was passiert („→ Bestellt", „Ohne Einkauf abschliessen…"),
  und die Rueckmeldung nimmt dasselbe Wort auf.
- Leerzustaende sagen, was zu tun ist; Fehler sagen, wie man sie behebt.
- Keine Dateipfade, keine Befehle in der normalen Ansicht (Ausnahme:
  Hinweis bei fehlendem Export).
- Zahlen, die falsch wirken, erklaeren (Beispiel: „Umsatz 0 €: die
  Bestellungen waren kostenlose Musterbestellungen").

**Zurueckhaltung.** Eine Sache pro Seite darf auffallen, der Rest bleibt ruhig.
Keine Einblend-Animationen, keine Emojis, keine Schatten- oder
Verlaufsspielereien. Neue Farben nur als Token. Bevor etwas dazukommt: was
kann dafuer weg?

**Qualitaetsboden** (ohne Ausnahme):
- 390 px ohne seitliches Scrollen. Breite Tabellen in `<div class="table-scroll">`.
  Lange Texte (E-Mail, SKU) duerfen umbrechen (`overflow-wrap:anywhere`).
- Tastatur: sichtbarer Fokus, Esc schliesst Dialoge und Detailblatt.
- Dunkelmodus: nur Tokens verwenden, keine festen Farben.

## Ablauf je Aenderung

1. Aufgabe anlegen/starten: `npm run task -- create "…" --area technik --type
   technik --prio p2 --owner kontakt755`, dann `npm run task -- start <n>`.
2. Worktree auf `origin/main`, `node_modules` verlinken
   (`ln -s <hauptcheckout>/node_modules node_modules`).
3. **Ist-Zustand ansehen:** `npm run dashboard:pruefen` und die Screenshots
   lesen (Desktop und Handy). Nie aus dem Code allein gestalten.
4. Kurz planen: was faellt weg, was wird zusammengefasst, welche Zahl steht wo.
5. Umsetzen. Im Stil der vorhandenen Module bleiben (Template-Strings, `esc()` fuer
   jeden Wert, Kommentare auf Deutsch, das Warum statt des Was).
6. Pruefen – alles muss gruen sein, bevor gepusht wird:
   - `node --check` auf jede geaenderte Moduldatei. Achtung: das findet nur
     Syntaxfehler. Ein fehlender Import faellt erst im Browser auf - und nur
     in der Ansicht, die ihn braucht. `npm run dashboard:test`
     (`tests/aufbau.test.mjs`) prueft, dass jeder importierte Name exportiert
     wird; ein benutzter, aber gar nicht importierter Name zeigt sich erst in
     `dashboard:pruefen` als JS-Fehler.
   - `npm run dashboard:test`, danach `npm test` (Ergebnis abwarten, erst dann pushen)
   - `npm run dashboard:pruefen` → nur `OK`-Zeilen
   - Fuer geaenderte Aktionen eine Klickstrecke gegen die Kopie
     (`npm run dashboard:pruefen -- --offen`, dann Puppeteer oder Browser),
     Ergebnis mit Zahlen festhalten („Problemzahl 2 → 1").
7. `docs/control-center/CHANGELOG.md` (Format: Geaendert · Getestet ·
   Risiken · Naechste Stufe), bei neuem Verhalten auch `ARCHITEKTUR.md`.
8. PR mit `Closes #<n>`, danach `npm run task -- review <n> --note "PR #…"`.
9. Nach dem Merge den Dienst nachziehen – main hineinmergen, nie umschalten.
   `~/tp-dashboard` steht auf dem Zweig `dashboard-betrieb`, der eigene Commits
   traegt („betrieb: Zwischenstand“, 24./25.09.). Darin liegen
   `start-dashboard.sh` (startet die App „Teppich Dashboard“) und `einrichten.sh`
   (Starter „Dashboard einrichten“ auf dem Schreibtisch); beide werden benutzt,
   nicht entfernen. `--ff-only` schlaegt deshalb immer fehl:
   ```
   cd ~/tp-dashboard && git fetch -q origin
   git merge-tree --write-tree HEAD origin/main   # Exit 0 = konfliktfrei
   git merge origin/main -m "merge: <PR-Titel> (#<n>)"
   npm run dashboard:test
   launchctl kickstart -k gui/$(id -u)/net.teppich-paradies.dashboard
   ```
   Der Dienst baut nach dem Start erst `issues.json`, ein paar Sekunden warten.
   Dann `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8001/login` → 200
   und `git rev-list --count HEAD..origin/main` → 0. Im Browser einmal hart neu
   laden, sonst zeigt der Cache die alte `app.js`.
   - Exit 1 bei `merge-tree` heisst Konflikt: nicht mergen, melden. Der Dienst
     laeuft unveraendert weiter.
   - Aendert der Merge `social/`, zusaetzlich
     `launchctl kickstart -k gui/$(id -u)/net.teppich-paradies.social`
     (Kontrolle: `curl -I http://127.0.0.1:8020/api/status` → 401).
   - `package-lock.json` ist dort dauerhaft veraendert (nur `name`: npm traegt den
     Ordnernamen ein, weil `package.json` keinen hat). Aendert main den Lockfile,
     bricht `git merge` ohne Folgen ab. Dann melden und nicht auf Umwegen verwerfen.

## Fallstricke (alle schon passiert)

- **Nach dem Laden nicht neu gezeichnet:** Jede `ensure…()`-Ladefunktion muss
  in allen Ansichten neu zeichnen, die ihre Daten zeigen (`['heute',
  'einkauf'].includes(state.route.view)`), sonst bleibt „Lade …" stehen.
- **Hash-Routen haben keine Anker:** `#/einkauf#muster` landet auf „Heute".
  Sprungziele als Parameter (`#/einkauf?af=bestellt`).
- **Angaben fuer Dialoge nicht aus Tabellenspalten lesen** (`nth-child`) –
  beim naechsten Layout stimmt die Spalte nicht mehr. `data-*`-Attribute am
  Knopf verwenden.
- **Geschlossene `<details>`** werden von Chrome trotzdem gelayoutet; eine
  breite Tabelle darin laesst die Seite am Handy trotzdem ueberstehen.
- **Netzmodus mit Passwort:** Alles, was der Browser ohne Cookie holt
  (Manifest, Icons), braucht `crossorigin="use-credentials"`, sonst landet es
  auf der Anmeldeseite.
- **Nach einem Merge ist die Mergebarkeit anderer PRs ein paar Sekunden
  `UNKNOWN`.** Warten, nicht ueberspringen.
- **Git fuehrt zwei PRs ohne Konflikt zusammen, das Ergebnis kann trotzdem
  brechen** (Beispiel: #537 + #545, Test fand ein neues Teil-Snippet nicht).
  Nach jedem Zusammenfuehren die volle Suite.
- **`HOST` ist in zsh der Rechnername.** Eigene Umgebungsvariablen immer mit
  Praefix (`TP_DASHBOARD_HOST`).
- **Servertests lesen sonst den echten Privatordner.** `scripts/serve-dashboard.mjs`
  entscheidet beim Laden des Moduls, ob ein Passwort hinterlegt ist. Eine
  Zuweisung von `TP_PRIVAT_DIR` im Testkoerper kommt zu spaet, weil ESM alle
  Importe vorher ausfuehrt – der Test lief dann gegen
  `~/teppich-paradies-analyse` und schlug auf jedem Rechner anders fehl. Deshalb
  steht `import './_testumgebung.mjs';` als **erster** Import in jedem Servertest.
- **Doppelter Funktionskopf nach dem Zusammenfuehren.** Wenn zwei Zweige
  `handleApi` anfassen (neuer Parameter hier, neue Route dort), erzeugt
  „beide Seiten behalten" zwei `export async function handleApi(...)` –
  die Datei laedt dann gar nicht mehr (`SyntaxError: Unexpected token 'export'`).
  Bei Signatur-Konflikten einen Kopf bauen und die Pfadlisten **vereinigen**;
  danach `node --check scripts/serve-dashboard.mjs`.
- **Neue Schreib-Endpunkte fallen sonst durch die Rollenpruefung.** Jeder
  schreibende Pfad muss in die `write`-Liste in `serve-dashboard.mjs`, sonst
  darf ihn auch die Rolle „lesen" ausloesen. Nach jedem neuen Endpunkt pruefen:
  Rolle „lesen" bekommt 403, Rolle „mitarbeiter" 200.
- **Der Geheimnis-Scanner blockiert Deploys wegen Testwerten.**
  `validate --static` bricht ab, wenn in einer Zeile `password: "<wert>"` steht –
  auch im Test. Sprechende Platzhalter verwenden („test-passwort"), und den
  Konfigurationswert per Aufruf statt per Variable uebergeben
  (`createAuth({ password: loadConfiguredPassword() })`).
- **Einen PR nicht mergen, solange ein Agent noch auf dem Zweig arbeitet.**
  Sonst liegt die fertige Arbeit danach ungemergt da und der naechste Merge
  kostet eine Konfliktrunde. Vor dem Merge pruefen:
  `git log --oneline origin/main..origin/<zweig>`.
- **Testbestellungen stehen nicht in `auftraege`**, sondern in
  `testauftraege`. Aktionen, die einen Auftrag per ID suchen, `alleAuftraege()`
  nehmen – sonst tut der Knopf bei Testbestellungen still nichts.
- **Auftragsfluss-Stand** (`auftragsstatus.json`) gibt es nur lokal; er wird
  von `npm run daten:sichern` gesichert. Aktionen, die ihn schreiben, immer
  mit Grund/Notiz und ueber den Filter „Erledigt" nachvollziehbar.

## Ideen fuer den naechsten Ausbau

Vor dem Umsetzen als Aufgabe anlegen und mit dem Inhaber abstimmen:

- Einkauf: Suche/Filter nach Auftrag oder Kunde.
- Heute „Seit gestern neu": Vortagesstand der Ampeln sichern, damit auch
  aeltere Auftraege erscheinen, die erst jetzt rot geworden sind.
- Arbeit: Owner-Filter und Spalte automatisch einblenden, sobald mehr als eine
  Person Aufgaben hat.


## Regeln aus CLAUDE.md (ausgelagert, #670)

`docs/ai-dashboard/` ist das Control Center; Konzept in `docs/control-center/`
(**vor Aenderungen am Dashboard lesen**). `scripts/build-dashboard-data.mjs`
erzeugt `docs/ai-dashboard/issues.json` (Schema 2) lokal per `gh`,
`scripts/build-bodenwissen-data.mjs` die `bodenwissen.json` aus `content/`;
`npm run dashboard` baut beide beim Start, „Jetzt synchronisieren" erneut.
Das Frontend liest **nur** diese Dateien; lokal (`:8001`) kommt `/api/*` aus
`scripts/dashboard-api.mjs` dazu. Keinen GitHub-API-Aufruf mit Token ins
Frontend bauen. GitHub Issues sind die einzige Aufgabenquelle.

Label-Gruppen: `status:*`, `type:*`, `priority:p0`–`p3`, `area:*`, `reviewer:*`
(`./setup-dashboard.sh` legt sie an). Tests: `npm run dashboard:test`.

**Vor jeder Aenderung am Dashboard** den Skill `.claude/skills/control-center/SKILL.md`
lesen (oder den Subagenten `control-center` beauftragen). Sichtpruefung im Browser
mit Datenkopie: `npm run dashboard:pruefen` (Desktop + Handy, JS-Fehler, seitliches
Scrollen; `--offen` fuer Klicktests).

`issues.json` und `bodenwissen.json` sind seit 2026-09-30 **nicht mehr im Git**
(`.gitignore`); bis dahin committete `dashboard-data.yml` sie alle 30 Minuten
auf `main` — 29 % aller Commits und die Ursache der „fetch first"-Pushfehler.
Dateien trotzdem gezielt mit `git add <datei>` stagen, nie `git add -A`.
→ `docs/lessons/dashboard-issues-json.md` (Vorgeschichte)

**Beim Rebase ist `--ours` der Upstream, nicht die eigene Arbeit.** Genau
umgekehrt zum Merge. Wer den eigenen, gerade wiedergespielten Stand behalten
will, nimmt `--theirs`. Der fruehere Dashboard-Bot nahm seit dem 2026-09-03
`--ours` und verwarf damit die Datei, die er im selben Lauf erzeugt hatte.
→ `docs/lessons/rebase-ours-ist-der-upstream.md`

**Aufgaben pflegen sich ueber Ereignisse selbst** (`task-automation.yml`):
neues Issue → Eingang, PR referenziert `#n` → In Arbeit, PR gemergt → Review,
Issue geschlossen → Erledigt. Prioritaeten und Owner nie automatisch.

**KI-Sessions legen ihre Arbeit als Aufgabe an und fuehren den Status nach.**
Zwischenstand und Entscheidungen gehoeren als Notiz ans Issue — das ist der
Mac-uebergreifende Handoff, kein zweiter Aufgabenspeicher:

```
npm run task -- create "Titel" --area google --type technik --prio p2 --owner kontakt755
npm run task -- start 92 --owner kontakt755 --note "Beginne mit …"
npm run task -- review 92 --note "PR #101, Tests gruen"
npm run task -- done 92 --confirm --note "gemergt"
npm run task -- block 92 --reason "Warte auf … von Ahmet"
```

Owner ist Ahmet = GitHub-Login `kontakt755`. `Closes #n` im PR-Text schliesst beim Merge.
