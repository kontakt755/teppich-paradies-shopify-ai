---
name: control-center
description: Das Control Center (docs/ai-dashboard, npm run dashboard) gestalten, erweitern und reparieren - Startseite "Heute", Einkauf, Arbeit, Lexikon, Freigaben, Ratgeber. Verwenden bei jeder Aenderung an app.js/app.css/index.html, an scripts/serve-dashboard.mjs oder dashboard-api.mjs, bei Design-/Uebersichtswuenschen des Inhabers und bevor ein Dashboard-PR gemergt oder der Dashboard-Dienst neu gestartet wird.
---

# Control Center – gestalten und ausbauen

Das Control Center ist das Arbeitswerkzeug des Betriebs: morgens zuerst
offen, im Einkauf den ganzen Tag. Jede Aenderung muss danach **nachweislich
funktionieren** – im Browser, am Handy, mit echten Daten (als Kopie).

## Vorher lesen

- `docs/control-center/ARCHITEKTUR.md` (Betriebsarten, Netzmodus mit Passwort,
  Einkauf, Heute, Datenaktualisierung) und die letzten Eintraege in
  `docs/control-center/CHANGELOG.md`.
- `CLAUDE.md` Abschnitt "Dashboard" (issues.json gehoert dem Bot) und Punkt 8
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
  Dateien offener PRs ansehen – wer fasst gerade `app.js` an?
- Kleine, thematisch geschlossene PRs. Vor dem PR `git fetch && git rebase
  origin/main`, Konflikte in `app.js` von Hand zusammenfuehren (beide Seiten
  behalten, nicht eine verwerfen).
- Fremde Worktrees (`~/tp-wt-*`, `.claude/worktrees/*`) und den Dienst-Checkout
  `~/tp-dashboard` nicht umschalten. `~/tp-dashboard` wird nach dem Merge nur
  vorgespult (siehe unten).

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
  ausblenden (Beispiel `tableView()` in `app.js`).
- Lange Listen: Standardfilter auf die eigentliche Arbeitsliste, Rest einen
  Klick entfernt; seitenweise (25) statt endloser Seiten.
- Kachelzahl und Liste darunter muessen dieselbe Menge zaehlen.

**Sprache** (die Oberflaeche ist deutsch, fuer Mitarbeiter ohne IT-Hintergrund):
- Nie interne Marker oder API-Werte zeigen: `UNGEKLAERT` → „ungeklaert"/„fehlt",
  `PAID` → „bezahlt", `UNFULFILLED` → „nicht versendet", Label
  `status:review` → „Status Review". Uebersetzungstabellen stehen in `app.js`
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
5. Umsetzen. Im Stil von `app.js` bleiben (Template-Strings, `esc()` fuer
   jeden Wert, Kommentare auf Deutsch, das Warum statt des Was).
6. Pruefen – alles muss gruen sein, bevor gepusht wird:
   - `node --check docs/ai-dashboard/app.js`
   - `npm run dashboard:test`, danach `npm test` (Ergebnis abwarten, erst dann pushen)
   - `npm run dashboard:pruefen` → nur `OK`-Zeilen
   - Fuer geaenderte Aktionen eine Klickstrecke gegen die Kopie
     (`npm run dashboard:pruefen -- --offen`, dann Puppeteer oder Browser),
     Ergebnis mit Zahlen festhalten („Problemzahl 2 → 1").
7. `docs/control-center/CHANGELOG.md` (Format: Geaendert · Getestet ·
   Risiken · Naechste Stufe), bei neuem Verhalten auch `ARCHITEKTUR.md`.
8. PR mit `Closes #<n>`, danach `npm run task -- review <n> --note "PR #…"`.
9. Nach dem Merge den Dienst aktualisieren – nur vorspulen, nie umschalten:
   ```
   git -C ~/tp-dashboard fetch origin
   git -C ~/tp-dashboard rev-list --count origin/main..HEAD   # muss 0 sein
   git -C ~/tp-dashboard merge --ff-only origin/main
   launchctl kickstart -k gui/$(id -u)/net.teppich-paradies.dashboard
   ```
   Danach `curl http://127.0.0.1:8001/login` → 200.

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
- **Auftragsfluss-Stand** (`auftragsstatus.json`) gibt es nur lokal; er wird
  von `npm run daten:sichern` gesichert. Aktionen, die ihn schreiben, immer
  mit Grund/Notiz und ueber den Filter „Erledigt" nachvollziehbar.

## Ideen fuer den naechsten Ausbau

Vor dem Umsetzen als Aufgabe anlegen und mit dem Inhaber abstimmen:

- „Ohne Einkauf abschliessen" rueckgaengig machen koennen (heute nur ueber
  die Statusdatei).
- Einkauf: Suche/Filter nach Auftrag oder Kunde; Sammelaktion „alle Muster
  von Lieferant A als bestellt".
- Heute: „Seit gestern neu" (neue Bestellungen, neue Probleme) als eigene
  kurze Liste.
- Lieferzeiten sichtbar machen: wie lange steht ein Artikel schon auf
  „Bestellt"?
- Arbeit: Owner-Filter und Spalte automatisch einblenden, sobald mehr als eine
  Person Aufgaben hat.
