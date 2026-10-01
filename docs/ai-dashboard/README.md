# Teppich Paradies Control Center („Teppich Dashboard")

Gemeinsamer Arbeitsplatz für Geschäftsführung, Mitarbeitende und KI-Agenten. Beantwortet:
Was ist der Zustand? Was ist heute wichtig? Was ist blockiert und wer löst es? Wer arbeitet woran?
Welche Freigaben fehlen? Was wurde verändert?

Öffentlich (read-only): https://kontakt755.github.io/teppich-paradies-shopify-ai/ai-dashboard/
Lokal mit Aktionen: `npm run dashboard` → http://localhost:8001

8001 ist die Vorgabe, keine Bedingung: `scripts/serve-dashboard.mjs` liest `process.env.PORT`,
das Frontend ruft `/api/*` relativ auf, und im Startbefehl steht kein Port-Flag — es haengt also
kein OAuth-Rueckruf, kein Webhook und keine CORS-Regel an dieser Nummer. Ist 8001 belegt, weicht
der Start deshalb auf einen freien Port aus (`autoPort` in `.claude/launch.json`) und nennt ihn.
Wer 8001 zwingend braucht, setzt dort `autoPort` auf `false` und gibt den Port vorher frei.

Konzept, Statusmodell, Datenhoheit: [`docs/control-center/`](../control-center/) (Bestandsaufnahme,
Architektur, Changelog).

## Eine Wahrheit: GitHub Issues

Es gibt keinen zweiten Aufgabenspeicher. Status, Priorität, Bereich sind Labels, der Owner ist der
Assignee, alles Weitere sind Abschnitte im Issue-Body:

| Abschnitt im Body | Wird zu |
|---|---|
| `## Ziel` (auch Problem/Aufgabe/Auftrag) | Ziel / Warum |
| `## Akzeptanzkriterien` mit `- [ ]` (auch Soll-Zustand, Checkliste; Checkboxen ohne Überschrift zählen) | Definition of Done |
| `## Nächster Schritt` oder `Nächster Schritt: …` | nächster Schritt |
| `## Worker` / `## Ausführender` | Ausführende:r (Mensch oder KI) |
| `## Frist` / `Fällig: 30.09.2026` | Fälligkeit (ISO, deutsch, KW) |
| `## Blocker` oder `## Status` mit „Warte auf …" | Blocker-Grund |
| `## Abhängigkeiten` (#12, SHP-014) | Abhängigkeiten |
| `## Frage`, `## Optionen`, `## Empfehlung`, `## Entscheider` | Entscheidungsvorlage (Template „Entscheidung") |

Status-Labels und Mapping: siehe `docs/control-center/ARCHITEKTUR.md`. Bis die neuen Labels angelegt
sind (`setup-dashboard.sh`), gilt: `status:blockiert` + `reviewer:mensch` = Warten auf Freigabe.

## Betriebsarten

| | statisch (Pages, PWA) | lokal (`npm run dashboard`) |
|---|---|---|
| Datenquelle | keine mehr (seit 2026-09-30 nur lokal) | `issues.json` + `bodenwissen.json`, beim Start und auf Wunsch frisch über `gh` |
| Aktionen | keine – Links nach GitHub | Statuswechsel, Owner, Kommentar, Freigabe über `gh` |
| Verlauf | Zeitpunkte aus `issues.json` | Issue-Events und Kommentare |
| KI-Läufe | nicht sichtbar | Steuerzentrale + Provider-Ledger, read-only |

Das Frontend erkennt die Betriebsart über `GET /api/capabilities`.

## Dateien

```
docs/ai-dashboard/
  index.html, app.css           Seite und Gestaltung (kein Build, keine Abhängigkeiten)
  stile/                        Styles einzelner Bereiche (einkauf-lieferanten.css), nutzen die Tokens aus app.css
  app.js                        Einstieg: Tabelle der Ansichten, Start – lädt alles Weitere per import
  ereignisse.mjs                zentrale Ereignisverteilung (Klick, Änderung, Tastatur, Hash-Wechsel)
  kern/                         Zustand, Helfer, API-Zugriff, Sitzung, Router, Zeichnen – kennt keine Ansicht
  bausteine/                    was mehrere Ansichten teilen (Karten, Aufgaben-Panel, Dialog, Palette …)
  ansichten/                    eine Datei je Route; große Ansichten mit Teilmodulen im gleichnamigen Ordner
  lib/model.mjs                 Regeln: Status, Body-Parser, Dringlichkeit, Übergänge – Browser UND Server
  issues.json, bodenwissen.json generierte Daten, nicht im Git (.gitignore)
  tests/                        node --test (npm run dashboard:test)
scripts/build-dashboard-data.mjs  erzeugt issues.json (lokal, gh)
scripts/serve-dashboard.mjs       lokaler Server + /api
scripts/dashboard-api.mjs         Aktions-API (gh), serverseitige Validierung
```

## Datenfluss

```
GitHub Issues ──(gh: Start, „Jetzt synchronisieren", nach jeder Aktion)──> scripts/build-dashboard-data.mjs
content/      ──────────────────────────────────────────────────────────> scripts/build-bodenwissen-data.mjs
                                                                                   │
                                          docs/ai-dashboard/issues.json + bodenwissen.json (lokal, nicht im Git)
                                                                                   ▼
                                                                         index.html / app.js
```

## Aufbau der Oberfläche

Seit 2026-10-01 ist `app.js` kein Monolith mehr, sondern der Einstieg in native ES-Module
(`<script type="module">`, weiterhin ohne Build-Schritt und ohne Framework). Ziel: mehrere Sitzungen
arbeiten gleichzeitig an verschiedenen Ansichten, ohne sich in einer Datei zu treffen.

```
app.js            VIEWS (Route → Ansicht), init()
ereignisse.mjs    bindEvents(): je Ereignisart ein Listener am document
kern/
  konfig.mjs      Repository, Datenquelle, Aktualisierungstakt
  zustand.mjs     state: Aufgaben, Sitzung, Route
  helfer.mjs      $, esc, fmtDate, fmtDateTime, ago, since, plural, geldText, fmtPreis, toast …
  api.mjs         fetchEinkauf (lesen, wirft nie), orgSchreiben (POST, wirft mit Servermeldung)
  sitzung.mjs     Betriebsart, Anmeldung, Rolle „lesen", Abmelden
  router.mjs      ANSICHT_ROLLEN, darfAnsicht, parseRoute, navigate, openTask, closeTask, setParam
  daten.mjs       issues.json und KI-Läufe laden, refresh, Datenstand-Chip
  thema.mjs       hell/dunkel
  render.mjs      render(): Ansicht zeichnen, Sonderzustände, Titel, Fokus
bausteine/
  karten.mjs            emptyState, stoerungState, collapsibleCard, bandItem
  aufgaben.mjs          Badges, taskRow, echterSchritt, primaryAction (Entwicklungsaufgaben)
  aufgaben-panel.mjs    Aufgaben-Detail (#/…?task=92)
  aktions-dialog.mjs    Statuswechsel, Kommentar, Freigabe
  aktualisierung.mjs    Datenstand der Betriebsdaten, „Jetzt aktualisieren", Synchronisieren
  systemzustand.mjs     Systemgesundheit (Heute, Insights)
  palette.mjs           Befehlspalette (⌘K)
ansichten/
  heute.mjs  arbeit.mjs  freigaben.mjs  bereiche.mjs  insights.mjs  aktivitaet.mjs
  lexikon.mjs  ratgeber.mjs  hilfe.mjs  shopwache.mjs  team.mjs  fotos.mjs
  einkauf.mjs        + einkauf/{auftragsfluss,bestellungen,lieferanten,produktdaten}.mjs
  kunden.mjs         + kunden/{gemeinsam,akte,rueckrufe,bestellungen,angebote,faelle}.mjs
  organisation.mjs   + organisation/{gemeinsam,dialoge}.mjs
```

**Regeln** (geprüft von `tests/aufbau.test.mjs`):

- Importe sind relativ und nennen die Endung (`'../kern/helfer.mjs'`) – es gibt keinen Bundler, der
  etwas auflöst. Kein Modul importiert `app.js`.
- `kern/` importiert nur aus `kern/` und `lib/` (einzige Ausnahme: `render.mjs` führt nach dem
  Zeichnen das Aufgaben-Panel nach). `lib/` importiert nur aus `lib/` – es läuft auch im Server.
- Keine Importkreise.
- Jede Route in `VIEWS` hat ihre Datei `ansichten/<route>.mjs`.

**Wo etwas Neues andockt:**

| Vorhaben | Dateien |
|---|---|
| Knopf, Filter, Dialog in einer bestehenden Ansicht | nur das Modul der Ansicht: Markup mit `data-…`-Attribut, Behandlung in deren `…Klick(e)` / `…Aenderung(e)` |
| Neue Ansicht | `ansichten/<route>.mjs` mit `export function view…()`; dann je eine Zeile in `app.js` (`VIEWS`), `kern/router.mjs` (`parseRoute`, bei Inhaber-Ansichten `ANSICHT_ROLLEN`), `kern/render.mjs` (Seitentitel) und `index.html` (Link). Braucht sie eigene Klicks: `export function <route>Klick(e)` und eine Zeile in `ereignisse.mjs` |
| Block auf „Heute" | Funktion `heute…()` im Modul des Bereichs, Aufruf in `ansichten/heute.mjs` |
| Neuer Zwischenspeicher, der nach „Jetzt aktualisieren" veraltet | zusätzlich in `verwirfDatenspeicher()` (`bausteine/aktualisierung.mjs`) leeren |
| Etwas, das zwei Ansichten brauchen | nach `bausteine/` (mit DOM) oder `kern/helfer.mjs` (ohne), nicht quer aus einer Ansicht importieren, wenn es sich vermeiden lässt |

Die Reihenfolge der Prüfungen im Klick-Listener (`ereignisse.mjs`) ist Verhalten: der erste Treffer
gewinnt. Deshalb ruft der Listener die Funktionen der Ansichten in fester Reihenfolge auf, und manche
Ansicht hat zwei davon (z. B. `einkaufKlickStatus` und `einkaufKlickDialoge`).

**Zwischenspeicher des Browsers:** Der Server liefert jede Datei mit `Cache-Control: no-store` aus, und
es gibt keinen Service Worker. Nach einem Update holt der Browser also beim nächsten Laden alle Module
neu; alte und neue Fassungen können sich nicht mischen. Versionsanhängsel (`?v=…`) an Modul-Importen
sind deshalb unnötig – und schädlich, weil dieselbe Datei unter zwei Adressen zweimal ausgeführt würde.

Der Browser braucht keinen Token.
Lokal läuft alles über das im Keychain angemeldete `gh`-Konto; jede Aktion ist damit auf GitHub
auditierbar (Kommentar `## Control Center: …`) und zusätzlich in `.router/control-center-audit.jsonl`.

## Sicherheitsgrenzen

- Kein Token im Frontend, in `issues.json` liegen keine Issue-Bodies, nur extrahierte Felder.
- Server bindet nur `127.0.0.1`; schreibende Endpunkte nur POST + JSON + lokaler Origin.
- Übergänge werden serverseitig geprüft (Owner für In Arbeit, Grund für Blockiert, Bestätigung für Erledigt).
- Keine Schreibzugriffe auf Shopify, Google oder andere Systeme – nur Labels, Assignee, Kommentare in GitHub.
- Das Repository ist öffentlich: keine Kundendaten, Umsätze oder Zugangsdaten in Issues.

## Tastatur

`⌘K` / `Ctrl+K` / `/` Suche und Befehle · `j` / `k` Zeile wählen · `Enter` öffnen · `Esc` schließen.

## Häufige Fragen

**Der Datenstand ist alt.** „Systemgesundheit" zeigt den letzten Lauf des Sync-Workflows. War er
erfolgreich, hat sich seitdem einfach nichts geändert. Lokal: „Jetzt synchronisieren".

**Eine Aufgabe fehlt.** Sie braucht mindestens ein `status:`-, `type:`-, `priority:`-, `area:`- oder
`reviewer:`-Label.

**Warum „Triage nötig"?** Priorität, Owner, nächster Schritt, Bereich oder Blocker-Grund fehlen. Das
Control Center füllt nichts still auf – die Lücke ist die Arbeit.
