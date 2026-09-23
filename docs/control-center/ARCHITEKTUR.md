# Control Center – Zielarchitektur und Migrationsstrategie

## 1. Leitentscheidung: Eine Wahrheit, zwei Betriebsarten

**GitHub Issues bleiben die führende Aufgabenquelle.** Das Control Center legt kein zweites Aufgabensystem an.
Alles, was den Zustand einer Aufgabe beschreibt (Status, Priorität, Owner, Blocker, Freigabe, Frist,
Akzeptanzkriterien, nächster Schritt), lebt als Label, Assignee oder strukturiertes Body-Feld im Issue.

Das Control Center (`docs/ai-dashboard/`) läuft in zwei Betriebsarten mit demselben Frontend:

| Betriebsart | Wie | Datenstand | Aktionen |
|---|---|---|---|
| **statisch** (GitHub Pages, PWA am Handy) | liest `issues.json` | vom Actions-Workflow erzeugt | read-only; jede Aktion verlinkt tief in GitHub |
| **lokal** (`npm run dashboard` auf dem Mac) | Node-Server, `/api/*` | frisch aus `gh` + lokale KI-Laufdaten | validierte Statuswechsel, Kommentare, Freigaben über `gh` (Keychain-Auth) |

Das Frontend erkennt die Betriebsart über `GET /api/capabilities` (404 → statisch). Aktionen werden nie
nur ausgeblendet: der Server prüft Übergänge serverseitig (`lib/model.mjs` ist dieselbe Datei in Browser
und Server).

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
Kachel zeigt den Hinweis samt Befehl. Der Export selbst (z. B. aus der Shopify Admin API oder einer
Analytics-Query) ist noch zu bauen – das ist bewusst nicht Teil dieser Änderung.
