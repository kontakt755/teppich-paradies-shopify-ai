# Control Center – Zielarchitektur und Migrationsstrategie

## Starten (Mitarbeiter/Admins)

```
npm run dashboard
```

öffnet den lokalen Server unter `http://localhost:8001`. Voraussetzung: `gh auth login` einmalig auf dem
Mac. Das Control Center steht **bewusst nicht im Netz** – es läuft nur, solange dieser Befehl auf einem
Mac aktiv ist, und ist an `127.0.0.1` gebunden (kein Zugriff von anderen Geräten im selben Netz).

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
`/api/einkauf/klaerung` – alle GET-only, nur im lokalen Server (`scripts/serve-dashboard.mjs`), nicht auf
GitHub Pages. Fehlende private Dateien liefern `{verfuegbar: false, hinweis}` statt eines Fehlers. Im
statischen Modus (`capabilities.mode !== 'local'`) fragt das Frontend diese Endpunkte gar nicht erst ab und
zeigt nur den Hinweis „Nur lokal im Betrieb verfügbar".
