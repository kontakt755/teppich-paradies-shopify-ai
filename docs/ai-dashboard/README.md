# Teppich Paradies Control Center („Teppich Dashboard")

Gemeinsamer Arbeitsplatz für Geschäftsführung, Mitarbeitende und KI-Agenten. Beantwortet:
Was ist der Zustand? Was ist heute wichtig? Was ist blockiert und wer löst es? Wer arbeitet woran?
Welche Freigaben fehlen? Was wurde verändert?

Nur lokal: `npm run dashboard` → http://localhost:8001 (im Laden und von unterwegs über
Tailscale, immer mit Anmeldung – `docs/control-center/ARCHITEKTUR.md`, Abschnitte 1c bis 1e).
Eine öffentliche Fassung gibt es seit 2026-09-23 nicht mehr: die alte GitHub-Pages-Adresse zeigt
keine Aufgabendaten, und `issues.json` liegt seit 2026-09-30 nicht mehr im Repository.

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

| | ohne lokalen Server (alter Pages-Link, Datei direkt geöffnet) | lokal (`npm run dashboard`) |
|---|---|---|
| Datenquelle | keine – Hinweis „Nur lokal im Betrieb“ | `issues.json` + `bodenwissen.json`, beim Start und auf Wunsch frisch über `gh`; Betriebsdaten aus `$TP_PRIVAT_DIR` über `/api/*` |
| Aktionen | keine | Statuswechsel, Owner, Kommentar, Freigabe über `gh`; Auftragsfluss, Rückrufe, Sonderposten |
| Verlauf | – | Issue-Events und Kommentare |

Das Frontend erkennt die Betriebsart über `GET /api/capabilities`.

## Dateien

```
docs/ai-dashboard/
  index.html, app.css           Seite und Gestaltung (kein Build, keine Abhängigkeiten)
  stile/                        Styles einzelner Bereiche (einkauf-lieferanten.css, zeitleiste.css), nutzen die Tokens aus app.css – je eine <link>-Zeile in index.html
  app.js                        Einstieg: Tabelle der Ansichten, Start – lädt alles Weitere per import
  ereignisse.mjs                zentrale Ereignisverteilung (Klick, Änderung, Tastatur, Hash-Wechsel)
  kern/                         Zustand, Helfer, API-Zugriff, Sitzung, Router, Zeichnen – kennt keine Ansicht
  bausteine/                    was mehrere Ansichten teilen (Karten, Aufgaben-Panel, Dialog, Palette …)
  ansichten/                    eine Datei je Route; große Ansichten mit Teilmodulen im gleichnamigen Ordner
  lib/model.mjs                 Regeln: Status, Body-Parser, Dringlichkeit, Übergänge – Browser UND Server
  lib/todos.mjs                 To-dos und „Wer wartet auf was“ für „Heute“ – abgeleitet, nicht erfasst
  lib/sonderposten.mjs          Rückmeldung nach „Im Laden verkauft“ – sagt nur, was belegt ist (testbar ohne DOM)
  lib/muster-nachfassen.mjs     „Muster nachfassen“ für „Heute“: wer ist dran, Textvorlage füllen – Browser UND Server
  lib/bestellinhalt.mjs         Inhalt einer Bestellung in einer Zeile (Muster mit Farben und Herkunft, Ware) – Bestellliste und To-dos
  lib/kennzahlen.mjs            „Ø je bezahlter Bestellung“ (ohne kostenlose Muster) für die Kennzahlen auf „Heute“
  lib/verbrauch.mjs             Modellnamen und Tokenzahlen für die Kachel „Claude-Verbrauch“ (Insights)
  lib/serviceanfragen.mjs       Service-Anfragen: Werte, Prüfung, Formular-Mail lesen, Auswertung je Woche/Quelle – Browser UND Server
  lib/prozesse.mjs              Arbeitsanweisungen fuer E-Mail, Angebotsvorbereitung und Recherche; Quelltext bleibt zitiert
  lib/prozesslinks.mjs          gemeinsame Validierung privater App-/Projektadressen – Browser UND Server
  stile/                        Styles je Ansicht (heute.css); app.css bleibt das gemeinsame Gerüst
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
  thema.mjs       hell/dunkel (folgt dem Gerät, bis jemand selbst wählt)
  navigation.mjs  Seitenleiste, untere Leiste und „Mehr“ am Handy, Seitentitel, Zähler
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
  heute.mjs          + heute/{daten,laden,muster-nachfassen}.mjs
  arbeit.mjs  freigaben.mjs  bereiche.mjs  insights.mjs  aktivitaet.mjs
  lexikon.mjs  ratgeber.mjs  hilfe.mjs  shopwache.mjs  team.mjs  fotos.mjs  sonderposten.mjs  bildrechte.mjs
  prozesse.mjs       Arbeitsplatz: Aufgabe vorbereiten, kopieren, App oder Projekt separat oeffnen
  einkauf.mjs        + einkauf/{auftragsfluss,bestellungen,lieferanten,musterlager,produktdaten}.mjs
  kunden.mjs         + kunden/{gemeinsam,akte,rueckrufe,serviceanfragen,bestellungen,angebote,faelle,zeitleiste}.mjs
  organisation.mjs   + organisation/{gemeinsam,dialoge}.mjs
  insights.mjs       + insights/verbrauch.mjs (Kachel „Claude-Verbrauch“, #671)
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
| Neue Ansicht | `ansichten/<route>.mjs` mit `export function view…()`; dann je eine Zeile in `app.js` (`VIEWS`), `kern/router.mjs` (`parseRoute`, bei Inhaber-Ansichten `ANSICHT_ROLLEN`), `kern/render.mjs` (Seitentitel) und `index.html` (Link in der Seitenleiste, `data-nav="<route>"`; Inhaber-Ansichten zusätzlich `data-nur-inhaber` und in die Gruppe „Büro“ – `tests/navigation.test.mjs` prüft beides). Braucht sie eigene Klicks: `export function <route>Klick(e)` und eine Zeile in `ereignisse.mjs` |
| Block auf „Heute" | Funktion `heute…()` im Modul des Bereichs, Aufruf in `ansichten/heute.mjs` |
| Neuer Zwischenspeicher, der nach „Jetzt aktualisieren" veraltet | zusätzlich in `verwirfDatenspeicher()` (`bausteine/aktualisierung.mjs`) leeren |
| Etwas, das zwei Ansichten brauchen | nach `bausteine/` (mit DOM) oder `kern/helfer.mjs` (ohne), nicht quer aus einer Ansicht importieren, wenn es sich vermeiden lässt |

Die Reihenfolge der Prüfungen im Klick-Listener (`ereignisse.mjs`) ist Verhalten: der erste Treffer
gewinnt. Deshalb ruft der Listener die Funktionen der Ansichten in fester Reihenfolge auf, und manche
Ansicht hat zwei davon (z. B. `einkaufKlickStatus` und `einkaufKlickDialoge`).

**Gerüst und Handy** (`index.html`, `app.css`): Am Rechner steht die Navigation als Seitenleiste
links (oben Heute, Kunden, Einkauf, Lexikon; darunter „Seltener“, der Sammelpunkt „Büro“ für die
Inhaber-Ansichten und „Weitere Dashboards“ – Werkbank, Laden, Montage, je in neuem Tab. Deren
Adressen kommen aus `.env.local` des Dienstes über `/api/capabilities`; ohne Adresse kein Link). Die Kopfzeile trägt nur Seitentitel, Suche (Befehlspalette),
„+ Erfassen“, Sitzung und Hell/Dunkel. Bis 860 px wird daraus eine feste Leiste unten (Heute,
Kunden, Lexikon, Einkauf, Mehr); „Mehr“ öffnet die Seitenleiste als Blatt. Der Seitentitel kommt
aus dem ersten `<h1>` im `.page-head` der Ansicht – dort bleibt es für Vorleseprogramme stehen, sichtbar
ist es nur oben. Ein Zähler am Menüpunkt wird in `app.js` über `registriereNavZaehler({ route: () => zahl })`
angemeldet. Breite Tabellen (`.table-scroll > table.tasks.compact`, Zellen mit `data-l`) werden unter
1100 px zu Karten. `npm run dashboard:pruefen` misst 360, 390, 800, 1024 und 1440 px und schlägt fehl,
sobald eine Seite seitlich scrollt.

**Zwischenspeicher des Browsers:** Der Server liefert jede Datei mit `Cache-Control: no-store` aus, und
es gibt keinen Service Worker. Nach einem Update holt der Browser also beim nächsten Laden alle Module
neu; alte und neue Fassungen können sich nicht mischen. Versionsanhängsel (`?v=…`) an Modul-Importen
sind deshalb unnötig – und schädlich, weil dieselbe Datei unter zwei Adressen zweimal ausgeführt würde.

Der Browser braucht keinen Token.

**Arbeitsplatz** (`#/prozesse`): Die drei Schnellzugriffe stehen auch auf „Heute“ und in der
Befehlspalette. Eingefuegte Angaben bleiben nur im Arbeitsspeicher dieser Ansicht; beim Verlassen,
Neuladen oder Ende der Anmeldung werden sie verworfen. Nur die festen Verknuepfungen liegen in
`$TP_PRIVAT_DIR/prozesslinks.json` (`GET/POST /api/prozesse/links`), nie im Repository. Das Kopieren
uebergibt den Auftrag noch nicht an eine KI: danach App/Projekt oeffnen, einfuegen und selbst starten.
Eine allgemeine App-Adresse waehlt kein bestehendes Cloud-Projekt; lokale Ordnerziele beziehen sich
auf das Geraet, auf dem der Link geoeffnet wird. Einzelheiten: Architektur, Abschnitt „Arbeitsplatz: Aufgaben vorbereiten“.
Lokal läuft alles über das im Keychain angemeldete `gh`-Konto; jede Aktion ist damit auf GitHub
auditierbar (Kommentar `## Control Center: …`) und zusätzlich in `.router/control-center-audit.jsonl`.

## Sicherheitsgrenzen

- Kein Token im Frontend, in `issues.json` liegen keine Issue-Bodies, nur extrahierte Felder.
- Server bindet standardmäßig nur `127.0.0.1`; im Netzmodus (Laden, Tailscale) nur mit Anmeldung, Rollen
  serverseitig geprüft. Schreibende Endpunkte nur POST + JSON + bekannte Herkunft.
- Übergänge werden serverseitig geprüft (Owner für In Arbeit, Grund für Blockiert, Bestätigung für Erledigt).
- Keine Schreibzugriffe auf Shopify, Google oder andere Systeme – nur Labels, Assignee, Kommentare in GitHub.
  Einzige Ausnahme: „Im Laden verkauft“ (Sonderposten) setzt den Bestand eines Stücks von 1 auf 0 und
  schreibt `sonderposten.verkauft_*` – serverseitig geprüft, siehe `docs/control-center/ARCHITEKTUR.md` Abschnitt 13.
- Das Repository ist öffentlich: keine Kundendaten, Umsätze oder Zugangsdaten in Issues.

## Tastatur

`⌘K` / `Ctrl+K` / `/` Suche und Befehle · `j` / `k` Zeile wählen · `Enter` öffnen · `Esc` schließen.

## Häufige Fragen

**Der Datenstand ist alt.** Die Zeile unter den To-dos auf „Heute“ nennt den Stand der Bestellungen,
„Insights“ den aller Datenquellen. Aufgaben: „GitHub synchronisieren“ in „Entwicklung“; Betriebsdaten:
„Jetzt aktualisieren“.

**Eine Aufgabe fehlt.** Sie braucht mindestens ein `status:`-, `type:`-, `priority:`-, `area:`- oder
`reviewer:`-Label.

**Warum „Triage nötig"?** Priorität, Owner, nächster Schritt, Bereich oder Blocker-Grund fehlen. Das
Control Center füllt nichts still auf – die Lücke ist die Arbeit.
