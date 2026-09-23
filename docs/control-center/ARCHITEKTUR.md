# Control Center – Zielarchitektur und Migrationsstrategie

## Starten (Mitarbeiter/Admins)

```
npm run dashboard
```

öffnet den lokalen Server unter `http://localhost:8001`. Voraussetzung: `gh auth login` einmalig auf dem
Mac. Standardmäßig ist der Server an `127.0.0.1` gebunden (kein Zugriff von anderen Geräten im selben
Netz) und verlangt keine Anmeldung – das Verhalten ändert sich nicht, solange niemand bewusst den
Netzmodus aktiviert (siehe 1c).

## 1c. Netzmodus im Firmennetz (seit 2026-09-23)

Das Control Center kann **auf Wunsch des Inhabers** im Firmennetz erreichbar gemacht werden, z. B. unter
`http://192.168.2.222:8001` – nur für Inhaber, Admins und Mitarbeiter, **nie** für Kunden. Weil es
Kundenbestellungen, Adressen und Einkaufsdaten zeigt, verlangt der Netzmodus zwingend ein Passwort.

**Starten:**

```
export TP_DASHBOARD_PASSWORT="ein-langes-zufaelliges-passwort"   # oder Datei, siehe unten
TP_DASHBOARD_HOST=0.0.0.0 npm run dashboard
```

Danach ist das Control Center unter `http://<Mac-IP-im-Netz>:8001` erreichbar (z. B.
`http://192.168.2.222:8001`), solange der Prozess läuft. Der Server gibt beim Start deutlich aus, unter
welcher Adresse er erreichbar ist:

```
Control Center (Netzmodus): http://0.0.0.0:8001 - erreichbar im Firmennetz.
Zugriff nur mit Passwort. Jede Route verlangt eine Anmeldung; Sitzung 12 Stunden gültig.
```

**Passwort setzen** – zwei gleichwertige Wege, beide **außerhalb des Repositorys**:

1. Umgebungsvariable `TP_DASHBOARD_PASSWORT` (z. B. in `.env.local`, nicht committen).
2. Datei `$TP_PRIVAT_DIR/dashboard-passwort.txt` (Standard `~/teppich-paradies-analyse`, dieselbe
   Konvention wie die übrigen privaten Dateien in Abschnitt 8) – eine Zeile, das Passwort.

Env geht vor Datei. **Startet der Prozess mit `TP_DASHBOARD_HOST` ≠ `127.0.0.1` und ist kein Passwort
gesetzt, verweigert er den Start** mit einer klaren Fehlermeldung – kein versehentlich offenes Dashboard
im Netz.

**Anmeldung:** Wer die Adresse im Browser öffnet, sieht zuerst eine deutsche Anmeldeseite (`/login`) und
gibt das Passwort ein. Bei Erfolg setzt der Server ein zufälliges Sitzungscookie (`HttpOnly`,
`SameSite=Strict`, 12 Stunden gültig) – danach ist das Control Center wie gewohnt nutzbar, im Kopfbereich
erscheint ein Knopf „🔒 Angemeldet" zum Abmelden. Falsche Passwörter werden zeitkonstant geprüft
(`crypto.timingSafeEqual` über SHA-256-Hashes, nie im Klartext verglichen) und pro IP-Adresse gebremst:
nach mehreren Fehlversuchen kurze Sperre. Weder Passwort noch Hash werden geloggt.

**Wichtig – HTTP im lokalen Netz ist unverschlüsselt.** Es gibt kein TLS-Zertifikat für die interne
IP-Adresse. Das Dashboard-Passwort ist deshalb **ausschließlich für dieses Dashboard** zu verwenden – nie
ein Passwort wiederverwenden, das auch woanders (E-Mail, GitHub, Shopify-Login) gilt.

Ist kein Passwort gesetzt und bleibt `TP_DASHBOARD_HOST` auf `127.0.0.1` (Standard), verhält sich der
Server exakt wie vorher: kein Login, kein Unterschied zum bisherigen lokalen Betrieb.

## 1. Leitentscheidung: Eine Wahrheit, nur noch lokaler Betrieb

**GitHub Issues bleiben die führende Aufgabenquelle.** Das Control Center legt kein zweites Aufgabensystem an.
Alles, was den Zustand einer Aufgabe beschreibt (Status, Priorität, Owner, Blocker, Freigabe, Frist,
Akzeptanzkriterien, nächster Schritt), lebt als Label, Assignee oder strukturiertes Body-Feld im Issue.

**Seit 2026-09-23 (Inhaberentscheidung) läuft das Control Center nur noch lokal.** Nur Inhaber, Admins
und Mitarbeiter mit Mac-Zugang und `gh auth` sehen Aufgabendaten; keine öffentliche Auslieferung mehr.
Der frühere „statische" Betrieb über GitHub Pages ist abgeschaltet (siehe Abschnitt 1b).

| Betriebsart | Wie | Datenstand | Aktionen |
|---|---|---|---|
| **lokal** (`npm run dashboard` auf dem Mac, `http://localhost:8001`) | Node-Server, `/api/*` | frisch aus `gh` + lokale KI-Laufdaten | validierte Statuswechsel, Kommentare, Freigaben über `gh` (Keychain-Auth) |
| ohne lokalen Server (z. B. `index.html` direkt geöffnet oder alter Pages-Link) | `GET /api/capabilities` liefert nichts (404) | keiner | keine Daten sichtbar; Hinweis „Nur lokal im Betrieb – `npm run dashboard`" |

Das Frontend erkennt die Betriebsart über `GET /api/capabilities` (404 → nicht lokal). Ohne lokalen Server
lädt `app.js` bewusst kein `issues.json` und zeigt keine Aufgabendaten, auch wenn die Datei technisch
erreichbar wäre. Aktionen werden im lokalen Betrieb nie nur ausgeblendet: der Server prüft Übergänge
serverseitig (`lib/model.mjs` ist dieselbe Datei in Browser und Server).

## 1b. Öffentlichkeit abgeschaltet (2026-09-23)

GitHub Pages für dieses Repository sollte per API deaktiviert werden (`DELETE
/repos/kontakt755/teppich-paradies-shopify-ai/pages`); das schlägt mit dem verfügbaren
GitHub-Token fehl (404), weil das Konto keine Admin-Rechte auf dem Repo hat
(`permissions.admin: false`) – die Pages-API verlangt Admin-Rechte. **Das Abschalten von
GitHub Pages selbst (Settings → Pages → Source: „None") braucht daher weiterhin ein
Admin-Konto oder einen Admin-Token.** Bis dahin bleibt `https://kontakt755.github.io/teppich-paradies-shopify-ai/ai-dashboard/`
technisch erreichbar; als Kompensation zeigt `app.js` dort keine Aufgabendaten mehr (siehe oben) –
das entfernt die Sichtbarkeit, nicht die URL.

`dashboard-data.yml` schreibt `issues.json` weiterhin nach `main`, weil die Datei die Datenquelle für
den lokalen Betrieb bleibt (der lokale Server kann sie auch selbst per `npm run dashboard`/`gh` frisch
erzeugen). Es findet dadurch **keine zusätzliche Veröffentlichung** mehr statt – das Committen war schon
vorher notwendig und ist von der Pages-Frage unabhängig.

## 2. Statusmodell und Mapping

Ziel-Workflow: `Eingang → Triage → Geplant → Bereit → In Arbeit → Review → Erledigt`,
daneben `Blockiert`, `Warten auf Freigabe`, `Abgebrochen`, `Beobachten`.

| Control-Center-Status | GitHub-Label | Bedeutung | Bemerkung |
|---|---|---|---|
| Eingang | `status:eingang` oder kein status-Label | neu, unbewertet | bestehend |
| Triage | `status:triage` | wird bewertet; fehlende Angaben (Owner, Priorität, nächster Schritt) | **neu** – Issues mit Pflichtlücken werden zusätzlich als Triage-Arbeit markiert, unabhängig vom Label |
| Geplant | `status:geplant` | priorisiert, aber nicht startbar | bestehend |
| Bereit | `status:bereit` | startbar, Owner + nächster Schritt vorhanden | **neu** |
| In Arbeit | `status:in-arbeit` | jemand arbeitet | bestehend |
| In Arbeit (Korrektur) | `status:korrektur` | Review-Findings werden behoben | bestehend; im Kanban Spalte „In Arbeit" mit Badge „Korrektur", Bedeutung geht nicht verloren |
| Review | `status:review` | Ergebnis liegt vor, Prüfung läuft | bestehend, `reviewer:*` sagt wer |
| Warten auf Freigabe | `status:freigabe` | Entscheidung eines Menschen nötig | **neu**; Übergang: bisher `status:blockiert` + `reviewer:mensch` |
| Blockiert | `status:blockiert` | externe Abhängigkeit, mit Pflichtgrund | bestehend; Grund aus Body `## Blocker` bzw. `## Status … Warte auf …` |
| Beobachten | `status:beobachten` | keine Aktion, wird beobachtet | **neu**, optional |
| Erledigt | `status:fertig` oder Issue geschlossen ohne `abgebrochen` | fertig | bestehend |
| Abgebrochen | `status:abgebrochen` + geschlossen | bewusst nicht gemacht, mit Begründung | **neu** |

Solange die neuen Labels nicht angelegt sind, funktioniert das Mapping mit den vorhandenen Labels;
`status:blockiert` + `reviewer:mensch` wird bis dahin als „Warten auf Freigabe" interpretiert (dokumentierte Übergangsregel,
in `lib/model.mjs` als `LEGACY_APPROVAL_RULE` markiert).

Erlaubte Übergänge und Pflichtangaben stehen in `lib/model.mjs` (`TRANSITIONS`, `requirementsFor`).
Beispiele: nach *In Arbeit* nur mit Owner; nach *Review* nur mit Ergebnis (Kommentar); nach *Erledigt*
nur mit abgehakten Akzeptanzkriterien oder ausdrücklicher Bestätigung; nach *Blockiert* nur mit Grund.

## 3. Datenmodell (Felder und führende Quelle)

| Entität / Feld | Führende Quelle | Ablage |
|---|---|---|
| Task: id, title, state, labels, created/updated/closed | GitHub Issue | Issue |
| Task.status | Label `status:*` | Issue |
| Task.priority | Label `priority:*` (P0 kritisch, P1 hoch, P2 normal, P3 niedrig) | Issue |
| Task.area / type | Label `area:*` / `type:*` | Issue |
| Task.owner (fachlich verantwortlich) | **Assignee** | Issue |
| Task.executor (Mensch oder KI) | Body `## Worker` / `## Ausführender`; Fallback: `🤖`-Präfix = KI | Issue-Body |
| Task.nextStep | Body `## Nächster Schritt` | Issue-Body |
| Task.dueDate | Body `## Frist` / `Fällig:` (ISO oder `TT.MM.JJJJ`) | Issue-Body |
| Task.acceptance | Body `## Akzeptanzkriterien` (Checkboxen → done/total) | Issue-Body |
| Task.goal | Body `## Ziel` | Issue-Body |
| Task.dependencies | Body `## Abhängigkeiten` (#Nummern, SHP-IDs) | Issue-Body |
| Blocker: reason, since, party, action | Body `## Blocker` oder `## Status` mit „Warte auf …"; `since` = letzter Label-Wechsel (Events, nur lokal) sonst `updated_at` | Issue-Body |
| Decision: question, options, recommendation, decider, deadline, outcome | Issue mit Template „Entscheidung" (`type:entscheidung`), Ergebnis als Kommentar + Label-Wechsel | Issue |
| AgentRun | Steuerzentrale (`~/Library/…/TP AI Dashboard/dashboard-state.json`) und `.router/ai-usage.jsonl` | **lokal**, read-only im Control Center; Verknüpfung über Issue-Nummer im Run |
| Activity | GitHub Issue-Events + Kommentare (lokal per `gh`), im statischen Modus nur `updated_at` | GitHub |
| IntegrationConnection | `issues.json.sync` (Quelle, Zeitpunkt, Fehler, Anzahl) + lokal `/api/capabilities` | generiert |
| Metric | **noch keine.** Später ausschließlich lokal (öffentliches Repo) | – |

Regeln:

- Stabile externe ID = Issue-Nummer. Kein eigener Task-Store, also keine Sync-Konflikte.
- Der Body-Parser ist tolerant (deutsche Überschriften mit/ohne Umlaut, `:`-Varianten) und wird getestet.
- Fehlende Pflichtfelder werden **nicht** stillschweigend gefüllt, sondern als Triage-Lücke angezeigt.
- Konflikt (z. B. zwei `status:`-Labels) wird angezeigt, nicht aufgelöst.

## 4. Priorisierung „Braucht jetzt Aufmerksamkeit"

Deterministische Punktzahl in `lib/model.mjs` (`attentionScore`), Gründe werden als Text mitgeliefert:

- P0 +50, P1 +30, P2 +10
- Warten auf Freigabe +40 · Blockiert +30 (+1 je Tag Alter, max +15)
- Überfällig +35, heute fällig +25, in 3 Tagen +10
- Eskalation (Label `eskalation` oder Body-Marker) +40
- Andere Aufgaben nennen diese in `## Abhängigkeiten` +8 je abhängiger Aufgabe
- In Arbeit ohne Update seit 7 Tagen +15
- Triage-Lücke (kein Owner bei aktiver Arbeit) +5

Höchstens fünf Einträge; jeder Eintrag zeigt die Gründe.

## 5. Rollen und Rechte (Stufenplan)

| Stufe | Wer | Wie durchgesetzt |
|---|---|---|
| jetzt: statisch | alle mit Link | read-only, technisch keine Aktion möglich |
| jetzt: lokal | die Person, die auf dem Mac angemeldet ist und `gh auth` besitzt | Server bindet nur 127.0.0.1; jede Aktion läuft unter dem GitHub-Konto des Keychains und ist damit auf GitHub auditierbar |
| später | Admin / Bereichsverantwortliche / Mitarbeiter / KI-Agent | GitHub-Berechtigungen (Collaborator-Rollen) + Server-Prüfung der Rolle je Aktion; KI-Agent nur über die Steuerzentrale mit Human Gate |

Externe Schreibaktionen zu Shopify/Google finden **nicht** im Control Center statt (weiterhin nur über
den Workflow mit Gates). Das Control Center schreibt ausschließlich Labels, Assignees und Kommentare nach GitHub.

## 6. Migrationsstrategie (keine destruktiven Schritte)

1. `issues.json` bekommt `schema: 2` und neue Felder; alte Felder bleiben, der alte Client würde weiter laufen.
2. Body-Konventionen werden über Issue-Templates (`.github/ISSUE_TEMPLATE/`) vorgegeben, bestehende Issues
   werden **nicht** automatisch umgeschrieben; Lücken erscheinen als Triage.
3. Neue Labels werden per `setup-dashboard.sh` angelegt (Freigabe nötig, siehe Bestandsaufnahme).
   Bis dahin gilt die Übergangsregel für Freigaben.
4. Das Frontend wird ersetzt; das alte `index.html` bleibt bis zum Merge in der Git-Historie erreichbar.

## 7. Nicht-Ziele dieser Ausbaustufe

Kein Shopify-/Ads-/GA4-Lesen (öffentliches Repo, erst Sichtbarkeitsentscheidung), keine KI-Automatik mit
Schreibzugriff, keine Mehrbenutzer-Auth, kein eigener Datenspeicher.

## 8. Bereich „Einkauf" (seit 2026-09-22)

Eigener Tab, getrennt vom Aufgabenmodell oben, weil die Daten aus einer anderen Quelle kommen und nie
öffentlich werden dürfen: private Dateien unter `$TP_PRIVAT_DIR` (Standard `~/teppich-paradies-analyse`),
nie `issues.json`, nie GitHub. Drei Unteransichten in `docs/ai-dashboard/app.js` (`viewEinkauf*`):

| Unteransicht | Quelle | Aufbereitung |
|---|---|---|
| Bestellübersicht | `bestelluebersicht/orders.json` | `operations/lib/bestelluebersicht.mjs` (`aufbereiten()`) – dieselbe Logik wie die eigenständige HTML-Ausgabe dort |
| Produktdaten-Status | `einkauf-dryrun/plan.json` | serverseitig zusammengefasst je Produktgruppe, offene Liste paginiert (Datei kann mehrere tausend Varianten haben) |
| Klärung | `einkauf-klaerung/klaerung.json` + `offen.json` | optional, noch nicht befüllt |

Endpunkte: `/api/einkauf/bestellungen`, `/api/einkauf/produktstatus` (Query `page`, `pageSize`, `q`, `gruppe`),
`/api/einkauf/klaerung`, `/api/einkauf/kennzahlen` – alle GET-only, nur im lokalen Server
(`scripts/serve-dashboard.mjs`), nicht auf GitHub Pages. Fehlende private Dateien liefern
`{verfuegbar: false, hinweis}` statt eines Fehlers. Im statischen Modus (`capabilities.mode !== 'local'`)
fragt das Frontend diese Endpunkte gar nicht erst ab und zeigt nur den Hinweis „Nur lokal im Betrieb
verfügbar".

## 9. Startseite „Heute" (seit 2026-09-23)

`viewHeute()` in `docs/ai-dashboard/app.js` ist die Startseite und bleibt primär aufgabenbasiert
(GitHub Issues, siehe Abschnitt 4). Ergänzend – nur im lokalen Modus, weil die Quellen privat sind –
zeigt sie zwei weitere Kacheln, die jeweils in den Bereich „Einkauf" (Abschnitt 8) durchklicken:

| Kachel | Quelle | Inhalt |
|---|---|---|
| „Einkauf – heute zu tun" | `einkaufBestellungen()` + `einkaufAuftragsstatus()` | Positionen zu bestellen, offene Musterbestellungen, Aufträge mit Problem (Ampel rot: Beratung ohne Telefon, Maßprüfung offen, fehlende Großhändler-ID), Positionen je Schritt des Auftragsflusses |
| „Shop-Zahlen" | `einkaufKennzahlen()` → `kennzahlen/shop-snapshot.json` | Bestellungen, Umsatz, Durchschnittsbon der letzten 7 und 30 Tage |

Offene Inhaberentscheidungen sind bereits über die bestehende Band-Kachel „warten auf Freigabe" und den
Abschnitt „Wartet auf dich" abgedeckt (Aufgaben mit `status:freigabe`/Review), dafür wurde nichts Neues
gebaut.

`kennzahlen/shop-snapshot.json` ist ein noch nicht existierender Export-Vertrag unter `$TP_PRIVAT_DIR`:

```json
{
  "erstellt": "2026-09-23T06:00:00.000Z",
  "zeitraeume": {
    "7": { "bestellungen": 12, "umsatz": 4321.5, "waehrung": "EUR", "durchschnitt": 360.13 },
    "30": { "bestellungen": 48, "umsatz": 15234.9, "waehrung": "EUR", "durchschnitt": 317.39 }
  },
  "topProdukte": [{ "titel": "Beispielteppich", "anzahl": 5 }]
}
```

Fehlt die Datei, liefert der Endpunkt `{verfuegbar: false, hinweis, befehl}` statt erfundener Zahlen; die
Kachel zeigt den Hinweis samt Befehl. Der Export selbst laeuft ueber `npm run daten:aktualisieren`
(Abschnitt 10).

## 10. Datenaktualisierung (seit 2026-09-23)

Lexikon, Bestellübersicht und Kennzahlen sind Momentaufnahmen unter `$TP_PRIVAT_DIR` (Abschnitt 8/9) und
veralten, sobald sich im Shop etwas ändert. `operations/scripts/aktualisieren.mjs`
(`npm run daten:aktualisieren`) erneuert alle drei in einem Lauf – Details, Aufruf und Zugang stehen in
`operations/README.md`, Abschnitt „Aktualisierung (alle Datenquellen in einem Lauf)".

Jeder Teil läuft unabhängig (ein Fehler in einem verhindert die anderen nicht) und schreibt sein Ergebnis
nach `$TP_PRIVAT_DIR/aktualisierung.json`:

```json
{
  "aktualisiertAm": "2026-09-23T06:00:12.000Z",
  "teile": {
    "lexikon": { "zeitpunkt": "2026-09-23T06:00:03.000Z", "dauerMs": 41231, "erfolg": true, "anzahl": 412, "meldung": null },
    "bestellungen": { "zeitpunkt": "2026-09-23T06:00:07.000Z", "dauerMs": 3877, "erfolg": true, "anzahl": 50, "meldung": "48/50 Quellvarianten der Muster geladen" },
    "kennzahlen": { "zeitpunkt": "2026-09-23T06:00:12.000Z", "dauerMs": 2011, "erfolg": true, "anzahl": 63, "meldung": null }
  }
}
```

Schlägt ein Teil fehl (kein Zugang, API-Fehler), bleibt die vorhandene Ausgabedatei dieses Teils
unverändert stehen – lieber ein alter, erkennbar datierter Stand als gar keine Daten. `aktualisiere()`
übernimmt beim nächsten Lauf den Stand der Teile, die diesmal nicht liefen (`--nur`), statt sie zu löschen.

Der Endpunkt `/api/aktualisierung` (`scripts/dashboard-api.mjs`, Funktion `aktualisierung()`) liest diese
Datei, rechnet je Teil das Alter aus und markiert `veraltet: true` ab 24 Stunden. Die Startseite „Heute"
und „Insights" zeigen das in der Kachel „Systemgesundheit" (`docs/ai-dashboard/app.js`,
`aktualisierungHealth()`): eine Zeile je Datenquelle mit „Stand: …" und, wenn veraltet oder fehlgeschlagen,
dem Hinweis „Daten veraltet – bitte `npm run daten:aktualisieren` ausführen." Wie beim Einkauf-Bereich nur
im lokalen Modus sichtbar (`capabilities.mode === 'local'`) – die Rohdaten bleiben privat.

Täglich automatisch: eine geplante Aufgabe in Claude Desktop (`~/.claude/scheduled-tasks/`, siehe
`operations/README.md`) ruft `npm run daten:aktualisieren` auf einem eingeschalteten Rechner mit Zugang in
`.env.local` auf. War der Rechner zum geplanten Zeitpunkt aus, läuft schlicht nichts – die Alters-Anzeige im
Dashboard macht das sichtbar (kein stiller Fehlschlag), und der nächste manuelle oder geplante Lauf holt
den Stand nach.
