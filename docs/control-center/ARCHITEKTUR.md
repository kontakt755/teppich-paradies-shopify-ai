# Control Center – Zielarchitektur und Migrationsstrategie

## Starten (Mitarbeiter/Admins)

```
npm run dashboard
```

öffnet den lokalen Server unter `http://localhost:8001`. Voraussetzung: `gh auth login` einmalig auf dem
Mac. Standardmäßig ist der Server an `127.0.0.1` gebunden (kein Zugriff von anderen Geräten im selben
Netz) und verlangt keine Anmeldung – solange weder ein Passwort gesetzt (1c) noch ein Zugang angelegt ist
(1e). Sobald es Zugänge gibt, ist die Anmeldung überall Pflicht, auch am Mac selbst.

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

## 1d. Von unterwegs erreichbar über Tailscale (seit 2026-09-25)

**Inhaberentscheidung 2026-09-25:** Das Control Center soll von Arbeit, zu Hause und vom Handy aus
nutzbar sein – für jeden, der einen Zugang bekommt. Gewählter Weg: **Tailscale**, ein privates Netz
zwischen den eigenen Geräten.

**Warum nicht öffentlich.** Das Dashboard zeigt Kundennamen, Anschriften und Bestellungen. Eine
öffentliche Adresse (Cloudflare-Tunnel o. Ä.) hätte verlangt, die DNS-Verwaltung der Shop-Domain von Wix
zu Cloudflare umzuziehen – ein Eingriff an der Domain eines laufenden Shops für eine reine
Bequemlichkeit. Über Tailscale steht nichts im Internet: Wer nicht im Tailnet ist, findet die Adresse
nicht einmal.

**Zwei Schichten, die beide greifen müssen:**

1. **Tailscale** entscheidet, welches *Gerät* den Server überhaupt erreicht.
2. **Der Dashboard-Zugang** (Abschnitte 1c und 1e, Benutzer und Rollen) entscheidet, *wer* was sieht.

Ein Gerät im Tailnet ohne Zugang kommt nicht weiter als bis zur Anmeldeseite.

**Host-Prüfung.** `sameOrigin()` in `scripts/serve-dashboard.mjs` schützt gegen DNS-Rebinding und lässt
deshalb nur bekannte Adressen durch. Dazu gehören jetzt:

- `100.64.0.0/10` – der Bereich, aus dem Tailscale seinen Geräten Adressen gibt. Wer darin liegt, ist
  bereits im eigenen Tailnet; dieselbe Vertrauensstufe wie `192.168.x.x` im Laden.
- Namen aus **`TP_DASHBOARD_EXTRA_HOSTS`** (kommagetrennt) – gedacht für den MagicDNS-Namen, unter dem
  `tailscale serve` das Dashboard per HTTPS ausliefert, z. B. `macmini.tailXXXX.ts.net`.

Bewusst eine Liste ganzer Namen und **kein Muster wie `*.ts.net`**: ein Muster würde jedes fremde Tailnet
mit abdecken. Fehlt der Name, antwortet der Server mit 403 und nennt die Variable – statt des
irreführenden „Nur lokal erlaubt".

**Einrichtung auf dem Mac mini** (er ist der Rechner, auf dem die Daten liegen, und bleibt an):

```
brew install --cask tailscale-app     # einmalig, verlangt das Mac-Passwort
tailscale up                          # oeffnet eine Adresse zum Anmelden
tailscale status                      # zeigt den Namen des Rechners im Tailnet
```

Die CLI liegt bei der Standalone-App unter
`/Applications/Tailscale.app/Contents/MacOS/Tailscale` und steht nicht von selbst im PATH.

**HTTPS ist nicht automatisch dabei.** `tailscale serve --bg 8001` liefert das Dashboard unter
`https://<name>.ts.net` aus – aber nur, wenn im Tailscale-Adminbereich unter *Settings → Feature
previews* **HTTPS Certificates** eingeschaltet ist. Fehlt das, antwortet `tailscale cert` mit
`your Tailscale account does not support getting TLS certs`, und `tailscale serve` bleibt haengen,
statt einen Fehler zu zeigen. Ohne HTTPS laeuft der Zugriff ueber
`http://<name>.ts.net:8001` – die Verbindung ist durch Tailscale (WireGuard) trotzdem verschluesselt,
der Browser zeigt aber „Nicht sicher".

**Schluesselablauf abschalten.** Tailscale laesst den Geraeteschluessel nach 180 Tagen ablaufen; der Mac
mini faellt dann ohne Vorwarnung aus dem Tailnet und das Dashboard ist von unterwegs weg. Im
Adminbereich unter *Machines* beim Mac mini **Disable key expiry** setzen. Fuer einen Rechner, der die
Daten haelt, ist das keine Bequemlichkeit, sondern Betriebsvoraussetzung.

Danach den Namen in den Dienst eintragen (`~/Library/LaunchAgents/net.teppich-paradies.dashboard.plist`,
`EnvironmentVariables` → `TP_DASHBOARD_EXTRA_HOSTS`). **`launchctl kickstart -k` reicht dafuer nicht** –
es startet den Prozess neu, liest die geaenderte Datei aber nicht neu ein, sodass die Variable fehlt und
jeder Zugriff ueber den Namen mit 403 endet. Richtig ist ab- und wieder anmelden:

```
launchctl bootout   gui/$(id -u)/net.teppich-paradies.dashboard
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/net.teppich-paradies.dashboard.plist
```

Gegenprobe, ohne das Passwort zu kennen: eine Anmeldung mit absichtlich falschem Passwort ueber den
Namen muss `401 Name oder Passwort falsch` ergeben (die Herkunftspruefung ist passiert), ueber einen
fremden Namen `403 Nur lokal erlaubt`.

**Auf jedem weiteren Gerät:** Tailscale-App installieren, mit demselben Konto anmelden, fertig – das
Dashboard ist dann unter `https://<name>.ts.net` erreichbar, auch am Handy über „Zum Home-Bildschirm".

**Grenze.** Geht der Mac mini aus oder ist das Internet im Laden weg, ist das Dashboard weg – die Daten
liegen dort und nirgendwo sonst. Das ist gewollt (keine Kundendaten in fremder Hand), aber es heißt: der
Mac mini ist ab jetzt Betriebsmittel, nicht nur Arbeitsplatz.

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
lädt die Oberfläche (`kern/daten.mjs`) bewusst kein `issues.json` und zeigt keine Aufgabendaten, auch wenn die Datei technisch
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

Seit 2026-09-30 gibt es `dashboard-data.yml` nicht mehr: `issues.json` und `bodenwissen.json` sind
nicht mehr im Git und entstehen nur noch lokal (`npm run dashboard` baut beide beim Start,
„Jetzt synchronisieren" erneut; der SessionStart-Hook frischt `issues.json` im Hauptcheckout höchstens
stündlich im Hintergrund auf). Damit liegen auch unter der Pages-URL keine Aufgabendaten mehr.

## 1e. Mitarbeiterzugänge (seit 2026-09-24)

Statt eines einzigen gemeinsamen Passworts kann das Control Center Mitarbeiterzugänge führen:
Name/Kürzel + eigenes Passwort je Person, ausschließlich lokal unter
`$TP_PRIVAT_DIR/benutzer.json` (nie im Repository, `chmod 600`, Passwörter als scrypt-Hash).

**Pflege:**

```
npm run benutzer -- anlegen        # fragt Name, Kürzel, Rolle, Passwort (verdeckt)
npm run benutzer -- passwort <kuerzel>
npm run benutzer -- deaktivieren <kuerzel>
npm run benutzer -- liste
```

Rollen: `inhaber` (alles, inkl. Benutzerliste im UI unter „Aktivität"), `mitarbeiter` (Auftragsfluss,
Aufgabenstatus, Aktualisierung anstoßen), `lesen` (nur Ansicht – **serverseitig** durchgesetzt in
`scripts/serve-dashboard.mjs`, nicht nur im Frontend ausgeblendet). Die Oberfläche fragt nur ab, was die
Rolle darf: `/api/agent-runs` nur beim Inhaber, und „lesen“ sieht keine Knöpfe, die der Server ablehnen
würde (Fälle abhaken, „Jetzt aktualisieren“, Auftragsfluss). Geprüft wird das mit
`npm run dashboard:pruefen -- --rollen` (Wegwerf-Zugänge nur in der Datenkopie, jede 403-Antwort ist ein
Fehler).

### Zugänge einrichten (für den Inhaber)

Einmal am Mac mini, in einem Terminal im Repository (die Datei landet unter
`~/teppich-paradies-analyse/benutzer.json`, nie im Repository):

1. **Zuerst den eigenen Zugang:** `npm run benutzer -- anlegen` – Name, Kürzel, Rolle `inhaber`,
   Passwort (verdeckt, zweimal).
2. **Dann je Mitarbeiter einen:** derselbe Befehl, Rolle `mitarbeiter` (wer nur schauen soll: `lesen`).
3. **Zuletzt den Laden:** ein gemeinsamer Zugang für den Ladenrechner, z. B. Kürzel `laden`, Rolle
   `mitarbeiter`. Der Ladenrechner bleibt angemeldet („angemeldet bleiben“ ist dort Standard).

Ab dem ersten angelegten Zugang verlangt das Control Center **immer** Name und Passwort – auch am Mac
selbst. Deshalb zuerst den eigenen. Das bisherige Einzelpasswort bleibt als Notzugang des Inhabers
gültig. Pflege danach: `npm run benutzer -- liste | passwort <kürzel> | deaktivieren <kürzel>`; jeder kann
sein eigenes Passwort im Control Center unter „Passwort ändern“ setzen.

**Notzugang:** Solange keine `benutzer.json` existiert, bleibt das bisherige Einzelpasswort
(`TP_DASHBOARD_PASSWORT` / `dashboard-passwort.txt`) der einzige Zugang – kein Bruch im laufenden
Betrieb. Existiert eine `benutzer.json`, bleibt das Einzelpasswort zusätzlich als Notzugang für den
Inhaber gültig (Rolle `inhaber`), damit sich niemand aussperren kann.

**Wer hat was gemacht:** `operations/lib/auftragsstatus.mjs` (`aktualisiertVon`) und die
GitHub-Kommentare der Aufgabenaktionen tragen jetzt den angemeldeten Anzeigenamen statt des
Mac-Kontos. Ein schlankes lokales Protokoll (`$TP_PRIVAT_DIR/protokoll.jsonl`, nie im Repository)
zeigt die letzten 50 Aktionen unter „Aktivität" im Control Center.

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

## 5. Rollen und Rechte (Stand 2026-10-12)

| Rolle | Wer | Was | Wie durchgesetzt |
|---|---|---|---|
| `inhaber` | Inhaber, Notzugang (Einzelpasswort) | alles, auch Entwicklung, Freigaben, Umsatzzahlen, Zugänge | `NUR_INHABER` in `scripts/serve-dashboard.mjs`; GitHub-Aktionen laufen unter dem `gh`-Konto des Macs |
| `mitarbeiter` | Laden, Einkauf, Monteure | Kundengeschäft, Einkauf, Aufgaben, Sonderposten | Schreibpfade in der `write`-Liste; Inhaber-Ansichten (`ANSICHT_ROLLEN`) nicht erreichbar |
| `lesen` | wer nur schauen soll | nur Ansicht; „Fehler melden“ darf jeder | jeder Schreibpfad 403; Knöpfe ausgeblendet (`istNurLesend`, `data-nicht-lesen`) |

Zugänge und Anmeldung: Abschnitt 1e. Ohne Zugang und ohne Passwort (nur am Mac, `127.0.0.1`) gilt der
Standardbetrieb wie ein Inhaber.

Externe Schreibaktionen zu Shopify/Google finden **nicht** im Control Center statt (weiterhin nur über
den Workflow mit Gates). Das Control Center schreibt ausschließlich Labels, Assignees und Kommentare nach GitHub.
**Einzige Ausnahme seit 2026-10-08:** „Im Laden verkauft“ in der Ansicht Sonderposten setzt den Bestand
genau eines Sonderpostens von 1 auf 0 und schreibt dessen `sonderposten.verkauft_*`-Felder (Abschnitt 13).
Seit 2026-10-12 zieht derselbe Knopf bei einer Restrolle die verkaufte Länge × Rollenbreite (ganze m²)
vom Bestand ab (Abschnitt 13, „Restrollen“).

## 6. Migrationsstrategie (keine destruktiven Schritte)

1. `issues.json` bekommt `schema: 2` und neue Felder; alte Felder bleiben, der alte Client würde weiter laufen.
2. Body-Konventionen werden über Issue-Templates (`.github/ISSUE_TEMPLATE/`) vorgegeben, bestehende Issues
   werden **nicht** automatisch umgeschrieben; Lücken erscheinen als Triage.
3. Neue Labels werden per `setup-dashboard.sh` angelegt (Freigabe nötig, siehe Bestandsaufnahme).
   Bis dahin gilt die Übergangsregel für Freigaben.
4. Das Frontend wird ersetzt; das alte `index.html` bleibt bis zum Merge in der Git-Historie erreichbar.

## 7. Nicht-Ziele (Stand 2026-10-12)

Ursprünglich (2026-09-08) standen hier auch „kein Shopify-Lesen“ und „keine Mehrbenutzer-Anmeldung“. Beides
ist überholt: Shopify-Daten kommen als lokaler Export bzw. live (Abschnitte 8–10, 13), Zugänge mit Rollen
gibt es seit 2026-09-24 (1e). Weiterhin **kein** Ziel:

- Google Ads und GA4 im Control Center (erst nach einer Sichtbarkeitsentscheidung; Systemzustand nennt das).
- Schreiben nach Shopify außer dem Ladenverkauf von Sonderposten (Abschnitt 13) – Preise, Produkte, Bestellungen
  und Versand bleiben im Shopify-Admin bzw. im Workflow mit Gates.
- KI-Automatik mit Schreibzugriff.
- Ein zweiter Aufgabenspeicher neben GitHub Issues (Abschnitt 1); Betriebsdaten liegen nur lokal unter
  `$TP_PRIVAT_DIR`.

## 8. Bereich „Einkauf" (seit 2026-09-22)

Eigener Tab, getrennt vom Aufgabenmodell oben, weil die Daten aus einer anderen Quelle kommen und nie
öffentlich werden dürfen: private Dateien unter `$TP_PRIVAT_DIR` (Standard `~/teppich-paradies-analyse`),
nie `issues.json`, nie GitHub. Drei Unteransichten in `docs/ai-dashboard/ansichten/einkauf.mjs` und
`ansichten/einkauf/` (`viewEinkauf*`):

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

**Lieferanten (seit 2026-10-01):** `/api/einkauf/lieferanten`, `/api/einkauf/lieferant?id=` und
`/api/einkauf/bestellmail` (GET, alle Rollen) liefern Stammdaten, offene Positionen je Stufe und die
fertige Bestellung als Text + `mailto:`-Link (`operations/lib/lieferanten.mjs`). Stammdaten liegen privat
unter `$TP_PRIVAT_DIR/lieferanten/stammdaten.json`; versendet wird nichts. Felder und Beispielantworten:
`operations/README.md`, Abschnitt „Lieferanten".

**Wo der Einkauf endet (seit 2026-10-12):** bei „bei uns eingetroffen“. Die Filter heißen „Noch zu
bestellen · Bestellt · Bei uns eingetroffen · Erledigt“; eine Position auf „An Kunden raus“ zählt im Einkauf
als erledigt (`stufeVon()` in `lib/einkauf-lieferanten.mjs`, `afFilterGruppe()` in
`ansichten/einkauf/auftragsfluss.mjs`). Vorher stand sie unter „Unterwegs“ – 27 Muster, die längst beim
Kunden lagen, zählten als offene Einkäufe. Was danach kommt (nachfassen, abschließen), führt die Zeitleiste
beim Kunden. Alte Links `#/einkauf?af=unterwegs` landen im neuen Schritt. Der Nachhak-Hinweis einer
Lieferantenkarte zählt Aufträge und Positionen getrennt („5 Aufträge warten (15 Positionen)“). Der Server
(`/api/einkauf/lieferanten`, `filterGruppe()`) zählt weiter nach dem alten Schnitt; die Oberfläche nutzt
dafür nur die Stammdaten.

**Auftragsfluss rückgängig (seit 2026-09-24):** `POST /api/einkauf/auftragsstatus` mit
`{orderId, lineItemId, aktion: "wiederOeffnen", notiz?}` öffnet eine erledigte Position wieder
(`oeffneWieder()` in `operations/lib/auftragsstatus.mjs`). Sie fällt auf den letzten belegten Schritt
vor „Erledigt" zurück (ohne solchen: kein Status = noch nicht bestellt). Die Abschlussfelder
(`erledigtAm/Von/Notiz`) wandern mit Zeit, Person und Notiz in `verlauf` (höchstens 20 Einträge);
`wiederGeoeffnetAm/Von` stehen am Datensatz, der Audit-Log erhält `auftragsstatus-wieder-geoeffnet`.
Wartezeiten im Einkauf rechnet das Frontend aus `bestelltAm`/`geliefertAm` (7 Tage bernstein, 14 rot).

### Einkauf je Lieferant (seit 2026-10-01)

Der Reiter „Bestellungen" zeigt eine Karte je Lieferant (`ansichten/einkauf/lieferanten.mjs`, Regeln ohne
DOM in `lib/einkauf-lieferanten.mjs`, Styles in `stile/einkauf-lieferanten.css`):

- **Zahlen und Überfällig-Hinweis** werden im Browser aus `/api/einkauf/bestellungen` und dem
  Auftragsfluss-Stand gezählt, nicht aus `/api/einkauf/lieferanten` – so passen Zahl und Liste nach
  einem Statuswechsel sofort zusammen. Vom Server kommen Stammdaten und Schwellen (7/14 Tage).
- **Ein Hauptknopf je Bestellweg** (`ware.weg`): „Bestellmail öffnen", „Im Portal bestellen" (öffnet
  das Portal in neuem Tab und zugleich den Dialog), „Anrufen". Ohne Bestellweg: „Bestellliste öffnen".
  „Muster bestellen" erscheint, wenn Muster offen sind.
- **Bestellmail-Dialog**: An, Betreff und Text unverändert aus `/api/einkauf/bestellmail`; `fehlt` und
  `hinweise` sichtbar; bei `mailtoGekuerzt` Hinweis auf „Text kopieren". Nach Öffnen oder Kopieren
  erscheint „Als bestellt markieren?" – setzt die aufgenommenen Positionen über
  `markiereAlsBestellt()` (dieselbe Sammelaktion wie „Alle als bestellt markieren…"). Gesendet wird nie.
- **Positionen** sind aufklappbar (Zustand im Modul, kein `<details>`); darin die bisherigen Tabellen
  je Lieferweg mit allen Aktionen. `#/einkauf?lf=A` öffnet eine Karte aufgeklappt.
- **Lieferant-Detail** `#/einkauf?lieferant=A` (Parameter, keine eigene Route): Kontakt, Bestellweg,
  Lieferzeit (zugesagt aus Stammdaten, tatsächlich aus „bestellt"→„geliefert" in Werktagen), Hinweise,
  offene Posten je Stufe, Verlauf aus den Zeitstempeln des Auftragsflusses. Fehlende Stammdaten
  werden benannt; gepflegt werden sie nur in der privaten Datei, es gibt keinen Editor.
- Rolle „lesen": Statusknöpfe und die Markier-Frage sind ausgeblendet.
- **Lexikon nutzt dieselben Stammdaten (seit 2026-10-12):** Hat eine Variante weder Direkt- noch Suchlink,
  zeigt „Zum Bestellen“ einmal den Bestellweg des Lieferanten (Weg, Kundennummer, Telefon) und je Variante
  den Knopf des Hauptwegs – „Bestellmail“ (fertig mit Artikel- und Farbnummer, dazu „in Gmail“),
  „Portal“ oder „Anrufen“. Ohne Stammdaten steht dort, was fehlt („Was fehlt?“ führt zum Lieferant-Detail,
  wenn es einen Eintrag gibt). Daten: `link.schnellzugriff` bzw. `original.schnellzugriff` aus
  `/api/lexikon/produkt` (`operations/README.md`, „Schnellzugriff im Lexikon“).

## 9. Startseite „Heute" (seit 2026-09-23)

`viewHeute()` in `docs/ai-dashboard/ansichten/heute.mjs` ist die Startseite und bleibt primär aufgabenbasiert
(GitHub Issues, siehe Abschnitt 4). Ergänzend – nur im lokalen Modus, weil die Quellen privat sind –
zeigt sie zwei weitere Kacheln, die jeweils in den Bereich „Einkauf" (Abschnitt 8) durchklicken:

| Kachel | Quelle | Inhalt |
|---|---|---|
| „Einkauf – heute zu tun" | `einkaufBestellungen()` + `einkaufAuftragsstatus()` | Positionen zu bestellen, offene Musterbestellungen, Aufträge mit Problem (Ampel rot: Beratung ohne Telefon, Maßprüfung offen, fehlende Großhändler-ID), Positionen je Schritt des Auftragsflusses |
| „Shop-Zahlen" | `einkaufKennzahlen()` → `kennzahlen/shop-snapshot.json` | Bestellungen, Umsatz, Durchschnittsbon der letzten 7 und 30 Tage |
| „Laden" (seit 2026-10-11) | `/api/laden/zahlen` → Auftrags-App `?ansicht=zahlen` | offene Beratungen (davon neu), fällige Wiedervorlagen, Angebote offen (davon nachfassen), Fälle aus dem Shop (7 Tage), gewonnen/verloren (30 Tage); nur wenn > 0 eine Zeile „Spam-Verdacht“ (seit 2026-10-12) mit Link „Spam prüfen“ direkt in den Filter; Link „Laden-Ansicht öffnen" |
| „Montage" (seit 2026-10-12) | dieselbe Antwort, Objekt `montage` | Einsätze heute/morgen, offen von gestern, Meldungen offen, Anträge offen, neue Aufträge, neue Rückmeldungen – jede Zahl optional; Link „Montage-App öffnen" |

**Kachel „Laden"** (`ansichten/heute/laden.mjs`, Server `scripts/laden-zahlen.mjs`, Sichten „Laden" und
„Alles", nicht „Website"). Die Zahlen kommen aus dem Laden-Modus der Auftrags-App (Google Apps Script,
eigenes Repository), die unter `<App-URL>?ansicht=zahlen&s=<Schlüssel>` **nur Zahlen** liefert – nie Namen
oder Kundendaten. Der Abruf läuft im lokalen Server, nicht im Browser: Apps Script sendet keine
CORS-Kopfzeilen, und der Schlüssel bleibt auf dem Mac. Der Server folgt der Weiterleitung auf
`script.googleusercontent.com`, bricht nach 15 s ab, merkt sich einen Erfolg 5 Minuten und einen
Fehlschlag 1 Minute; gleichzeitige Anfragen teilen sich einen Abruf. Durchgereicht werden nur die
bekannten Zahlenfelder (ganze Zahlen ≥ 0), alles andere fällt weg. Fehlt eines, gilt die ganze Antwort als
unbrauchbar – mit einer Ausnahme: `spamVerdacht` (offene Fälle aus dem Shop, die die App ab Version 43 im
Filter „Spam prüfen“ zurückhält und in keiner anderen Zahl mitzählt) darf fehlen und gilt dann als 0, damit
eine ältere App die Kachel nicht auf „nicht erreichbar“ setzt (`LADEN_ZAHLEN_SPAETER`). Die Kachel zeigt
dafür keine sechste Zahl, sondern nur bei > 0 eine Zeile unter den Zahlen, die Zahl in Bernstein. Die Zeile
endet mit dem Link „Spam prüfen ↗“ (neuer Tab), der direkt in den Filter springt: `spamUrl()` in
`ansichten/heute/laden.mjs` baut ihn per URL-API aus `ladenUrl` – weitere Parameter bleiben, `ansicht=laden`
und `filter=spam` werden gesetzt (Auftrags-App ab Version 47; eine ältere App zeigt die Laden-Ansicht ohne
Filter). Ohne `ladenUrl` (oder kein `https`) bleibt die Zeile ohne Link und nennt den Filter in Worten.

Einrichtung **außerhalb des Repositorys** (es ist öffentlich): in `.env.local` im Ordner des Dienstes
(`~/tp-dashboard/.env.local`, gitignored, dieselbe Datei wie der Shopify-Zugang) oder als
Umgebungsvariable:

```
LADEN_ZAHLEN_URL=https://script.google.com/macros/s/<Deployment-ID>/exec
LADEN_ZAHLEN_SCHLUESSEL=<derselbe Wert wie die Script-Property LADEN_ZAHLEN_SCHLUESSEL der App>
AUFTRAGS_APP_URL=https://script.google.com/macros/s/<Deployment-ID>/exec   # Links Laden und Montage
WERKBANK_URL=https://claude.ai/artifact/<id>                              # Link Werkbank
```

**Weitere Dashboards (seit 2026-10-12).** Die Seitenleiste trägt eine Gruppe „Weitere Dashboards“ mit
Werkbank, Laden (`AUFTRAGS_APP_URL?ansicht=laden`) und Montage (`AUFTRAGS_APP_URL`), je in neuem Tab.
`/api/capabilities` liefert sie als `dashboards: { werkbank, laden, montage }` (`scripts/weitere-dashboards.mjs`);
angenommen wird nur https, fehlt eine Adresse, fehlt der Link. Ohne `AUFTRAGS_APP_URL` gilt die Adresse aus
`LADEN_ZAHLEN_URL` (dieselbe App). Die Werkbank ist für „lesen“ ausgeblendet. Vorher stand die Werkbank-Adresse
fest in `index.html` – im öffentlichen Repository.

**Kachel „Montage“.** Die App liefert in der Zahlenantwort ein Objekt `montage` mit den optionalen ganzen
Zahlen `einsaetzeHeute`, `einsaetzeMorgen`, `meldungenOffen`, `offenVonGestern`, `neueAuftraege`,
`antraegeOffen`, `rueckmeldungenNeu` (`MONTAGE_FELDER` in `scripts/laden-zahlen.mjs`). Jedes Feld wird
einzeln geprüft (ganze Zahl ≥ 0), Unbekanntes und Ungültiges fällt weg, die Laden-Zahlen bleiben davon
unberührt. Die Kachel zeigt nur vorhandene Zahlen (Bernstein bei offen von gestern, Meldungen, Anträgen),
ohne Objekt oder Schlüssel „noch nicht verbunden“, bei unerreichbarer App „nicht erreichbar“. Nur Zahlen, nie
Namen.

Angenommen wird nur `https://script.google.com`, damit ein Tippfehler den Schlüssel nicht an einen fremden
Rechner schickt. Die Datei wird bei jedem Abruf neu gelesen, ein Neustart ist nicht nötig. Fehlt ein Wert,
zeigt die Kachel ruhig „Nicht eingerichtet" – steht die Adresse da und nur der Schlüssel fehlt,
„Schlüssel fehlt“ (`fehlt: 'schluessel'`); ist die App nicht erreichbar oder lehnt den Schlüssel ab,
„nicht erreichbar" mit einem Satz dazu. Der Link „Laden-Ansicht öffnen" ist `<App-URL>?ansicht=laden`
(ohne Schlüssel), öffnet in einem neuen Tab und steht, sobald eine App-Adresse bekannt ist – auch ohne
Schlüssel.

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

### 9a. „Heute" mit To-dos (seit 2026-10-01)

Die Startseite zeigt zuerst, was zu tun ist: „N offene To-dos für dich" – je Zeile Titel, eine Zeile
Kontext und genau ein Knopf –, darunter „Wer wartet auf was" (wir / Lieferant / Kunde), die Kacheln
„Laden“ und „Montage“ und beim Inhaber vier Kennzahlen. Die früheren eingeklappten „Weiteren Übersichten“
(`ansichten/heute/bisher.mjs`) sind am 2026-10-12 entfallen: jede Zahl darin stand schon oben oder in
„Kunden“, „Einkauf“, „Entwicklung“ – „bezahlt, noch nicht versandt“ sogar nach dem Shopify-Status und damit
falsch. Was davon nicht doppelt war, lebt weiter: eine Shop-Wache, die sich seit mehr als drei Stunden nicht
gemeldet hat, ist jetzt ein To-do (nur Inhaber), „GitHub synchronisieren“ steht in „Entwicklung“.

**Kennzahl „Ø je bezahlter Bestellung“** (seit 2026-10-12): Umsatz geteilt durch die Bestellungen **mit
Betrag** – kostenlose Musterbestellungen zählen nicht mit (vorher lag der Schnitt dadurch bei einem
Bruchteil des echten). Gerechnet in
`lib/kennzahlen.mjs` aus `umsatz`, `bestellungen` und `kostenlos`, damit auch ein älterer Export stimmt;
`operations/lib/kennzahlen.mjs` liefert seither `mitBetrag` und den korrigierten `durchschnitt`.

To-dos werden nicht erfasst, sondern abgeleitet: `docs/ai-dashboard/lib/todos.mjs` (reine Funktionen,
`tests/todos.test.mjs`) rechnet aus den Antworten der vorhandenen Endpunkte.

| To-do | Quelle | Regel |
|---|---|---|
| Ware/Muster bestellen | `/api/kunden/bestellungen` + `/api/einkauf/auftragsstatus` | bezahlt, Position ohne Auftragsfluss-Stand; je Lieferant und Art ein To-do; gelb ab 3, rot ab 7 Tagen |
| Nachhaken | dieselben, Schwellen aus `/api/einkauf/lieferanten` | Stand „bestellt" seit ≥ 7 Tagen gelb, ≥ 14 Tagen rot; je Lieferant |
| Ware ist da – rausgeben | dieselben | Stand „geliefert"; gelb ab 7, rot ab 14 Tagen |
| Zuerst klären | Ampel „rot" der Bestellung | immer rot; die Positionen erscheinen nicht zusätzlich unter „bestellen" |
| Zurückrufen | `/api/kunden/rueckrufe` | nicht erledigt und Wiedervorlage heute oder früher; gelb ab 2, rot ab 7 Tagen |
| Angebot nachfassen | `/api/kunden/faelle` | Angebot seit ≥ 7 Tagen offen; rot ab 14 |
| Team-Aufgabe | `/api/org/liste?bereich=alle-aufgaben` | Dringlichkeit „überfällig" (rot) oder „jetzt" (gelb), nicht wartend/zurückgestellt |
| Freigabe | Entwicklungsaufgaben (`issues.json`) | Status Freigabe oder Review durch Mensch; nur Inhaber |
| Shop-Wache | `/api/shopwache/status` | Ampel gelb/rot; nur Inhaber |

Sortierung: rot vor gelb vor normal, darin das Älteste zuerst.

**Wer sieht was** – ohne neue Rolle: Inhaber (und Notzugang) sehen Freigaben, alles Rote und eigene
fällige Aufgaben; zwei Sprungfelder zeigen, was im Laden und bei der Website offen ist (`?sicht=laden`
bzw. `website`, nur für den Inhaber umschaltbar). Mitarbeiter sehen „Laden" (Kunden- und
Einkaufsschritte, eigene und freie Team-Aufgaben) – oder „Website", wenn die Mehrheit ihrer offenen,
zugewiesenen Aufgaben in `TECHNISCHE_BEREICHE` liegt (`sichtFuer()`). Der Server gibt dafür je Aufgabe
`technisch` und `darfAendern` mit (`operations/lib/organisation.mjs`).

Der Datenstand steht als kleine Zeile unter den To-dos. Ein `letzterFehler`, der älter ist als der
letzte erfolgreiche Stand derselben Quelle, zählt nicht mehr als Warnung (`leseAktualisierungsstand()`
wendet `ohneUeberholtenFehler()` schon beim Lesen an).

**Muster nachfassen** (seit 2026-10-10; Inhaberentscheidung: der Verkauf im Laden fasst nach). Eigene
Karte unter dem Datenstand, in den Sichten „Laden" und „Alles" (nicht „Website"); die offenen Kunden
zählen bei „N offene To-dos" mit. Abgeleitet in `docs/ai-dashboard/lib/muster-nachfassen.mjs`
(`tests/muster-nachfassen.test.mjs`) aus `/api/kunden/bestellungen` samt Zeitleiste – nichts wird
zusätzlich gespeichert:

| Stufe | Regel |
|---|---|
| Erste Nachfrage | Musterbestellung (nicht Test, nicht storniert, nicht abgeschlossen, kein Ergebnis), verschickt bzw. übergeben vor 4 bis 30 Tagen, noch nicht nachgefasst |
| Erinnerung | genau einmal nachgefasst, vor 10 bis 30 Tagen; nach der zweiten Nachfrage nicht mehr |
| Erledigt | nachgefasst in den letzten 7 Tagen, mit wer und wann |

Kontaktweg: E-Mail; Telefon nur bei Rückrufwunsch („Beratung gewünscht"), sonst ein Hinweis. Der Knopf
„Erledigt – nachgefasst" ist der Zeitleisten-Schritt `nachgefasst` (POST `/api/einkauf/auftragsstatus`,
`aktion: "schritt"`), der wer und wann in `auftragsverlauf.json` festhält. Der Textvorschlag kommt aus
`GET /api/kunden/muster-texte`: der Server liest `$TP_PRIVAT_DIR/muster-nachfassen-texte.md` (Vorlage des
Inhabers, Abschnitte „Text 1" und „Erinnerung" mit `**Betreff:**`). Eingesetzt werden Kundenname, der
Name der angemeldeten Person und die festen Shop-Links (Muster, Liefer- & Verlegeservice); eine Zeile mit
einem Platzhalter, der sich nicht sicher füllen lässt (z. B. `{Link Produkt}`), fällt weg. „E-Mail
öffnen" ist ein `mailto:`-Link – gesendet wird nichts. Fehlt die Vorlage, bleiben Liste und Knopf, nur
ohne Textvorschlag.

**Muster nachfassen und „Wer wartet auf was“** (seit 2026-10-12): Ein Musterauftrag mit fälliger Nachfrage
steht unter „Wir sind dran“ („Muster nachfassen“), nicht mehr zugleich unter „Kunde ist dran“
(`werWartet(…, { nachfassen })` in `lib/todos.mjs`, die orderIds kommen aus `musterNachfassen()`). Nach
„Erledigt – nachgefasst“ wandert er zurück zum Kunden.

### 9b. Kunden „Zu tun“: der nächste Schritt kommt aus der Zeitleiste (seit 2026-10-12)

`/api/kunden/faelle` hängt an jede Bestellzeile den nächsten Schritt der Zeitleiste
(`zeitleisteSchritt`, `operations/lib/auftragsverlauf.mjs`); `naechsterSchritt()` in
`operations/lib/kundenfaelle.mjs` nimmt dann dessen Text. Vorher entschied allein der Shopify-Versandstatus:
17 Fälle hießen „Versenden – bezahlt, noch nicht raus“, obwohl 9 Muster längst beim Kunden und 8 beim
Lieferanten bestellt waren.

| Zeitleiste | Dringlichkeit in „Zu tun“ |
|---|---|
| wir dran, fällig seit < 3 Tagen | bald |
| wir dran, fällig seit ≥ 3 Tagen | sofort |
| Lieferant: nachhaken (≥ 7 Tage) | bald |
| Lieferant: Problem (≥ 14 Tage) | sofort |
| Lieferant oder Kunde dran, Frist läuft | nicht in der Liste; gezählt als `wartend` („N weitere Kunden warten nur auf Lieferant oder Kunde“); in der Karte eines Kunden mit anderem To-do als „Lieferant/Kunde ist dran: …“ |

Unbezahlte Bestellungen behalten „Noch nicht bezahlt“ (die Zeitleiste kennt keine Zahlung); ist die
Zeitleiste abgeschlossen, bleibt nur, was sonst fehlt (Maßprüfung, Großhändler-ID). Steht die Ware im
Auftragsfluss auf „An Kunden raus“, Shopify kennt aber keine Sendung, heißt es nur noch als Hinweis „In
Shopify noch nicht als versendet gebucht“ – in der Fallkarte, als `versandHinweis` der Bestellzeile und in der
Spalte „Versand“ der Bestellliste („in Shopify nicht gebucht“); „Noch nicht versendet“ unter „Was fehlt“
entfällt dann. In Shopify wird nichts geschrieben.

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
    "bestellungen": { "zeitpunkt": "2026-09-23T06:00:07.000Z", "dauerMs": 3877, "erfolg": true, "anzahl": 118, "meldung": "3 Seite(n) · 22/24 Quellvarianten der Muster geladen" },
    "kennzahlen": { "zeitpunkt": "2026-09-23T06:00:12.000Z", "dauerMs": 2011, "erfolg": true, "anzahl": 63, "meldung": null }
  }
}
```

Schlägt ein Teil fehl (kein Zugang, API-Fehler), bleibt die vorhandene Ausgabedatei dieses Teils
unverändert stehen – lieber ein alter, erkennbar datierter Stand als gar keine Daten. `aktualisiere()`
übernimmt beim nächsten Lauf den Stand der Teile, die diesmal nicht liefen (`--nur`), statt sie zu löschen.

Der Endpunkt `/api/aktualisierung` (`scripts/dashboard-api.mjs`, Funktion `aktualisierung()`) liest diese
Datei, rechnet je Teil das Alter aus und markiert `veraltet: true` ab 24 Stunden. Die Startseite „Heute"
und „Insights" zeigen das in der Kachel „Systemgesundheit" (`docs/ai-dashboard/bausteine/aktualisierung.mjs`,
`aktualisierungHealth()`): eine Zeile je Datenquelle mit „Stand: …" und, wenn veraltet oder fehlgeschlagen,
dem Hinweis „Daten veraltet – bitte `npm run daten:aktualisieren` ausführen." Wie beim Einkauf-Bereich nur
im lokalen Modus sichtbar (`capabilities.mode === 'local'`) – die Rohdaten bleiben privat.

Täglich automatisch: eine geplante Aufgabe in Claude Desktop (`~/.claude/scheduled-tasks/`, siehe
`operations/README.md`) ruft `npm run daten:aktualisieren` auf einem eingeschalteten Rechner mit Zugang in
`.env.local` auf. War der Rechner zum geplanten Zeitpunkt aus, läuft schlicht nichts – die Alters-Anzeige im
Dashboard macht das sichtbar (kein stiller Fehlschlag), und der nächste manuelle oder geplante Lauf holt
den Stand nach.

**Bestellungen ohne festes Limit (seit 2026-09-23):** `fetchOrdersRelevant`
(`operations/sync/orders.mjs`) holt vollständig paginiert alle Bestellungen der
letzten 90 Tage (`created_at`) ODER alle noch nicht vollständig erfüllten
(`fulfillment_status:unfulfilled`/`:partial`), unabhängig vom Alter – ersetzt
die vorherige Regel „letzte 50 Bestellungen nach `updatedAt`". Details der
Abgrenzung und der Ratenlimit-Wartung (`wartenBeiThrottle`) stehen in
`operations/README.md`.

**Häufiger als täglich:** `operations/scripts/sync-dienst.mjs`
(`npm run daten:sync-dienst`) führt `aktualisieren()` in einer Dauerschleife
aus statt über eine geplante Aufgabe – Intervall `TP_SYNC_INTERVALL_MINUTEN`
(Standard 10 Minuten), damit eine am Nachmittag eingegangene Bestellung nicht
erst am nächsten Morgen im Control Center sichtbar wird. Läuft entweder von
Hand in einem Terminal oder dauerhaft über die launchd-Vorlage
`operations/launchagents/net.teppich-paradies.sync.plist.vorlage`. Ohne Zugang
(`SHOPIFY_ADMIN_TOKEN`/Client-Credentials) startet der Dienst nicht still –
er meldet das Fehlen und beendet sich. Details in `operations/README.md`,
Abschnitt „Sync-Dienst".

## 11. Anreicherung aus Lieferantenseiten (seit 2026-09-24)

Nachbau von zwei zuvor nur lokal liegenden Python-Skripten als getesteter
Teil des Repositorys: `operations/lib/lieferantenseiten.mjs` (Zuordnung
Attributtabelle → Metafeld, Einheiten, Metaobjekt-Zuordnung nur bei exakter
Entsprechung, „nie überschreiben"), `operations/scripts/anreicherung.mjs`
(`npm run daten:anreichern`, Plan/Rollback/offen/Batches, standardmäßig nur
planend – erst `--schreiben` schreibt) und
`operations/scripts/lieferantenseiten-holen.mjs`
(`npm run lieferantenseiten:holen`, höflicher Abruf – eine Seite je 120 s,
fortsetzbar). Details, Ein-/Ausgabedateien und Sicherheitsregeln stehen in
`operations/README.md`, Abschnitt „Anreicherung aus Lieferantenseiten". Kein
neuer Dashboard-Bereich – die geplanten Werte landen wie gehabt unter
`$TP_PRIVAT_DIR/anreicherung/`, nie im Repository.

## 12. Aufbau der Oberfläche in Modulen (seit 2026-10-01)

`docs/ai-dashboard/app.js` war bis dahin eine Datei mit rund 5100 Zeilen; an ihr trafen sich alle
parallel arbeitenden Sitzungen. Sie ist jetzt der Einstieg in native ES-Module – weiterhin ohne
Build-Schritt, ohne Framework, ohne neue Abhängigkeit. Verhalten, Texte, Routen und Rollenprüfung
(`ANSICHT_ROLLEN`, `darfAnsicht` in `kern/router.mjs`) sind unverändert.

| Ordner | Inhalt | darf importieren aus |
|---|---|---|
| `kern/` | Zustand, Helfer, API-Zugriff, Sitzung, Router, Daten, Zeichnen | `kern/`, `lib/` |
| `bausteine/` | was mehrere Ansichten teilen | `kern/`, `lib/`, `bausteine/`; `aktualisierung.mjs` und `palette.mjs` zusätzlich aus Ansichten |
| `ansichten/` | eine Datei je Route, Teilmodule im gleichnamigen Ordner | alles darunter, andere Ansichten nur wo fachlich nötig |
| `ereignisse.mjs`, `app.js` | Verdrahtung | alles |

Dateiliste und „wo dockt etwas Neues an" stehen in `docs/ai-dashboard/README.md`, Abschnitt
„Aufbau der Oberfläche"; `tests/aufbau.test.mjs` prüft die Regeln.

**Auslieferung.** `handleStatic()` in `scripts/serve-dashboard.mjs` liefert jede Datei unterhalb von
`docs/ai-dashboard/` aus (keine Pfadliste, Ausbrüche nach oben werden abgewiesen), `.mjs` und `.js`
als `text/javascript`, alles mit `Cache-Control: no-store`. Einen Service Worker gibt es bewusst
nicht (`index.html`), das PWA-Manifest nennt nur Icons. Für die Module war deshalb keine Änderung am
Server nötig; `tests/server.test.mjs` hält MIME-Typ und `no-store` für jedes Modul fest. Im
Netzmodus verlangt jede Moduldatei die Sitzung – Modul-Skripte derselben Herkunft schicken das
Cookie mit.

**Ladezeit.** Statt einer Anfrage sind es rund 50 kleine; über Tailscale am Handy kostet die
Importkette einige Umläufe mehr. Falls das spürbar wird: `<link rel="modulepreload">` in
`index.html` – bewusst noch nicht eingebaut, weil die Liste eine neue gemeinsame Datei wäre.

## 13. Sonderposten und „Im Laden verkauft“ (seit 2026-10-08)

Reststücke und Einzelstücke sind Shopify-Produkte mit `productType` „Sonderposten“, genau einer Variante
(SKU `SP-xxxx`) und geführtem Bestand 1 am einzigen Standort. Wird ein Stück im Laden verkauft, muss es
online sofort aus dem Verkauf – sonst bestellt es jemand ein zweites Mal. Konzept: Branch
`feature/weiterentwicklung-sonderposten`, `docs/weiterentwicklung/sonderposten.md`, Abschnitt 6 (Weg B).

**Live statt Export.** Anders als die übrigen Quellen (Abschnitt 10) liest `GET /api/sonderposten/liste`
bei jedem Aufruf direkt aus Shopify (`operations/lib/sonderposten.mjs`, `leseListe`) – wer „verkauft“
klickt, muss den Bestand von jetzt sehen. Zugang wie überall: `operations/sync/zugang.mjs`
(`erzeugeProxy`), einmal je Serverprozess aufgebaut. Ohne Zugang derselbe Hinweis wie bei fehlenden
Exporten. Die Vorlage (SKU `SP-0000` oder Titel „VORLAGE …“) und archivierte Stücke erscheinen nie.

**Buchen** (`POST /api/sonderposten/verkauft`, Rolle `mitarbeiter` oder `inhaber`, „lesen“ 403):

1. Produkt neu lesen; die IDs aus dem Browser werden nur abgeglichen, nie geglaubt.
2. Nur bei geführtem Bestand genau 1 **und** gesperrtem Überverkauf (`inventoryPolicy: DENY`) weiter,
   sonst 409 – nichts geschrieben. Mit `CONTINUE` bliebe das Stück bei Bestand 0 online bestellbar; die
   Liste zeigt dann keinen Knopf, sondern „„Verkauf bei Nichtverfügbarkeit fortsetzen“ ist an – in Shopify
   ausschalten“ (Review 2026-10-09).
3. `inventorySetQuantities` (`available` → 0, `reason: correction`,
   `referenceDocumentUri: tp://laden-verkauf/<SKU>/<Zeit>`) mit `changeFromQuantity: 1` – zwei
   gleichzeitige Klicks buchen nicht doppelt – und `@idempotent` (ab API 2026-04 Pflicht).
   **Antwortverlust:** Kommt auf die Mutation keine Antwort (Netz, Zeitlimit, 5xx), kann Shopify sie
   trotzdem ausgeführt haben. Der Server liest dann erneut: Bestand 0 → gebucht, weiter mit Schritt 4;
   Bestand 1 → 502 „nicht angekommen“; sonst 504 „unklar, Bestand prüfen“ samt Protokolleintrag
   `sonderposten-im-laden-verkauft-unklar`. „Nichts gebucht“ sagt der Server nur, wenn Shopify abgelehnt hat
   oder die Mutation gar nicht gesendet wurde.
4. Erst danach `metafieldsSet`: `verkauft_am` (jetzt), `verkauft_von` (Anzeigename aus der Sitzung),
   `verkauft_kanal` = „Laden“. Scheitert schon Schritt 3, bleiben die Felder unberührt.
5. Protokolleintrag `sonderposten-im-laden-verkauft` (`$TP_PRIVAT_DIR/protokoll.jsonl`).
6. Gegenprobe: Produkt erneut lesen, Bestand und Felder im Ergebnis – `userErrors: []` ist kein Beleg.
   `ok` heißt Bestand 0 **und** online gesperrt (geführt, `DENY`). Scheitert nur das Lesen, ist die Buchung
   trotzdem erfolgt: Antwort 200 mit `gegenprobe: "fehlgeschlagen"`, nie ein Fehler.

**Rückmeldung im Browser** (`lib/sonderposten.mjs`, `meldungNachBuchung`): Kommt vom Dashboard keine
Antwort, heißt es „Ob der Verkauf gebucht wurde, ist unklar – Liste neu laden und Bestand prüfen“, nie
„nichts gebucht“. Ein erneuter Klick kann nicht doppelt buchen (Schritt 1 und 3).

**Recht.** Dafür braucht der Zugang `write_inventory` (Bestand) und `write_products` (Felder),
festgehalten als `SCHREIB_BEREICHE` in `sync/zugang.mjs` und in der Bereichszeile in
`operations/README.md`. Fehlt `write_inventory`, antwortet der Server 403 mit „Bestand kann nicht geändert
werden: dem Control Center fehlt das Shopify-Recht write_inventory …“ und schreibt nichts. Freischalten macht
nur der Inhaber im Dev Dashboard **und** danach im Shop-Admin (Einstellungen → Apps → TP Operations →
„App öffnen“ → neue Berechtigungen bestätigen); erst dann trägt der Token das Recht. Der Dienst hält seinen
Token im Speicher – nach der Freischaltung neu starten. Erteilt seit 2026-10-12 (Version `tp-operations-4`).

**Wer hat verkauft?** Mit persönlichem Konto (Kürzel in `benutzer.json`) kommt der Name aus der Sitzung, nie
aus der Anfrage. Im gemeinsamen Zugang (Einzelpasswort; die Sitzung meldet `{name: 'Inhaber', kuerzel: null}`)
fragt der Dialog „Wer hat verkauft?“ – Pflicht, ohne Vorbelegung, zuletzt benutzte Namen nur als Vorschlag
(`localStorage`, je Gerät). Der Server verlangt den Namen dann (400 `name-fehlt`, kein Shopify-Aufruf),
schreibt ihn in `verkauft_von` und als Benutzer ins Protokoll, mit dem Vermerk „Name im gemeinsamen Zugang
angegeben“. Grund: Inhaber 2026-10-10 – im Laden bucht die gerade verkaufende Person.

**Restrollen (seit 2026-10-12, Inhaber).** Rollenware mit Produkt-Tag `sonderposten` und Rollenbreite
(`custom.rollenbreite`, Variante vor Produkt), deren Bestand Shopify in ganzen m² führt – z. B. Passion
Yasmin. Die Liste fragt `(product_type:Sonderposten OR tag:sonderposten)`; Produkte mit dem Tag, aber ohne
Rollenbreite (das Maßprodukt derselben Rolle) erscheinen nicht, weil sie keinen eigenen Bestand haben. Der
Knopf öffnet „Von der Rolle verkauft“: Eingabe der abgeschnittenen Länge in m, immer über die volle
Rollenbreite (ein Teppich 2 × 3 m verbraucht 2 m der 4-m-Rolle). Server (`verkaufeVonRolle`): neu lesen,
Rolle/Bestand geführt/`DENY`/Item-ID prüfen, m² = Länge × Breite in cm gerechnet und auf ganze m²
aufgerundet, mehr als der Rest → 409. Dann `inventorySetQuantities` auf Bestand − m² mit
`changeFromQuantity` = gelesener Bestand und `@idempotent`, Antwortverlust wie oben über erneutes Lesen
geklärt, `referenceDocumentUri: tp://laden-verkauf/<handle>/<Zeit>?laenge_cm=…&qm=…`. Keine
`verkauft_*`-Felder (die Rolle bleibt im Shop, solange etwas da ist); Spur ist der Protokolleintrag
`sonderposten-rolle-im-laden-verkauft` („3,5 m = 14 m² · Bestand 80 → 66 m²“). Fehlt `write_inventory`,
sagt der Dialog, wie man bis dahin in der Shopify-App abzieht. Der Dialog rechnet dieselbe Regel vorher an
(`lib/sonderposten.mjs`, `rollenRechnung`; ein Test hält Browser und Server gleich). Der Shop zeigt den Rest
unter dem Preis aus demselben Bestand (`blocks/tp-aktion-hinweis.liquid`, `snippets/tp-rollenrest.liquid`).

**Tests** sprechen nie echtes Shopify: `tests/_testumgebung.mjs` blendet `.env.local` und die
`SHOPIFY_*`-Variablen aus, die Tests reichen eine Attrappe (`operations/tests/sonderposten-attrappe.mjs`)
über `createApi({ shopifyZugang })` bzw. `ersetzeShopifyZugang()` in `serve-dashboard.mjs` hinein.

## 14. Ansicht „Social Media" (seit 2026-10-12)

`#/social` (`ansichten/social.mjs`, `lib/kampagnenlink.mjs`, `stile/social.css`) bündelt die Links,
die man für Social Media braucht. Für die Rolle „lesen“ ist sie ausgeblendet (`data-nicht-lesen`).

- **Foto-Upload fürs Team:** `GET /api/social/zugaenge` liefert je aktivem Zugang des Social-Moduls
  (`$TP_PRIVAT_DIR/social/upload-zugaenge.json`) eine Zeile; Rolle „lesen“ bekommt 403, auch lesend.
  Das Social-Modul speichert nur den Hash des Links. Den kopierbaren Klartext legt
  `POST /api/social/link-neu` (nur Inhaber) beim Anlegen in `social/upload-links.json` ab (Rechte 600) –
  ein gemerkter Link erscheint nur, solange sein Zugang aktiv ist. Ein neuer Link für einen vorhandenen
  Namen sperrt den alten nicht. Die Adresse davor ist `SOCIAL_UPLOAD_BASIS_URL` aus `social/zugang.env`.
- **Kampagnen-Link:** reines Frontend. Ziel nur auf `teppich-paradies.net`, Kanal → `utm_source`/`utm_medium`
  (social, email, print; Art „Anzeige“ → paid), Kampagnenname klein mit Bindestrichen, Art → `utm_content`.
- **Weitere Links:** Social-Zentrale auf demselben Host, Port 8020; Instagram- und Facebook-Profil.

## 15. „Fehler melden“ und Weitergabe an die Werkbank (seit 2026-10-12)

Mitarbeiter melden im Control Center, was nicht funktioniert; die Technik (Inhaber und Shop-Mitarbeiter)
arbeitet die Meldungen in der **Werkbank Shop & Technik** ab, einem privaten claude.ai-Artefakt. Der
Server kann die Werkbank nicht erreichen (kein Schlüssel, keine API) – die Brücke ist ein geplanter
Claude-Lauf.

```
Knopf „Fehler melden“ ──POST /api/fehler/melden──> $TP_PRIVAT_DIR/fehlermeldungen.json      (nur der Server schreibt)
                                                          │
geplanter Lauf „fehlermeldungen-werkbank“ (Mo–Sa, halbstündlich, ~/tp-dashboard)
   npm run -s fehler -- abgleich  ──>  ArtifactData: items/F-001 anlegen (art "fehler", prio 1, phase heute)
   npm run -s fehler -- uebernommen F-001 --werkbank F-001
   ArtifactData query (art == fehler, out_dir) ──> npm run -s fehler -- werkbank-stand --ordner …
                                                          │
                                   $TP_PRIVAT_DIR/fehlermeldungen-abgleich.json              (nur der Abgleich schreibt)
                                                          │
GET /api/fehler/liste ──> Dialog zeigt „Gemeldet“ / „Bei der Technik“ / „Behoben“ + Ergebnis aus der Werkbank
```

- **Wer darf:** melden darf jede angemeldete Rolle, auch „lesen“ (einzige Ausnahme von deren Schreibsperre
  in `serve-dashboard.mjs`) – eine Meldung ändert keine Betriebsdaten. Name und Kürzel kommen aus der
  Sitzung. Die Liste zeigt Mitarbeitern nur die eigenen Meldungen, dem Inhaber (und dem Notzugang) alle.
- **Was mitgeht:** Text, Seite („Wo?“, vorbelegt mit dem Seitentitel), „blockiert die Arbeit“, Adresse
  (Hash), Browser, Fensterbreite und die letzten drei Störungen im Browser (JS-Fehler und gescheiterte
  API-Aufrufe; `kern/api.mjs` meldet sie als Ereignis `tp-api-fehler`). Die Technik-Angaben bleiben auf
  dem Server; `npm run -s fehler -- zeige F-001` zeigt sie.
- **Zwei Dateien, je ein Schreiber:** Server und Abgleich überschreiben sich so nie gegenseitig. Eine
  kaputte Datei wird nicht als „leer“ gelesen, sondern als Fehler gemeldet – sonst ginge beim nächsten
  Schreiben alles verloren. Beide Dateien sind in `npm run daten:sichern`.
- **In der Werkbank:** Dokument-ID = Meldungsnummer (der Lauf ist dadurch wiederholbar). Offene
  Fehlermeldungen stehen nur im roten Abschnitt „Fehler – muss behoben werden“ oben im Überblick, „blockiert
  die Arbeit“ zuerst. „Erledigt …“ und „Kein Fehler …“ verlangen einen Satz für den Melder; den trägt der
  Abgleich wörtlich zurück. Wird ein Eintrag binnen drei Tagen wieder geöffnet, steht die Meldung wieder
  auf „Bei der Technik“.
- **Datenschutz:** Kundennamen, E-Mail, Telefon und Anschrift ersetzt der Lauf in der Werkbank durch
  „Kunde“; der Originaltext bleibt nur lokal.
- **Bildschirmfotos** (seit 2026-10-12, #1155): bis zu drei je Meldung, per Knopf oder Einfügen (⌘V),
  im Browser auf 2000 px verkleinert (`bausteine/bilder.mjs`, geteilt mit „Fotos“). Der Server nimmt nur
  echte PNG/JPEG/WebP (an den ersten Bytes erkannt, höchstens 4 MB) und legt sie unter
  `$TP_PRIVAT_DIR/fehlermeldungen/F-001-1.jpg` ab (Rechte 600). `GET /api/fehler/bild?id=&nr=` liefert
  sie nur dem Melder und dem Inhaber; eine fremde Meldung antwortet wie eine fehlende (404). Bilder
  gehen nie in die Werkbank – dort steht nur die Zahl, `npm run -s fehler -- zeige` nennt die Pfade.
- **Letzte Schritte und Version:** die letzten sechs Klicks („heute: „Einkauf““) und der Commit des
  laufenden Dienstes gehen mit. Der Dialog zeigt unter „Was automatisch mitgeht“, was das ist.
- **Melden aus der Störung heraus:** `kern/api.mjs` merkt sich Serverfehler (5xx) und fehlende
  Verbindung (`merkeStoerung`); eine rote Rückmeldung in den 3 Sekunden danach trägt den Knopf „Melden“.
  Störungskästen (`stoerungState`) haben ihn immer. Ein JS-Fehler aus dem eigenen Code zeigt einmal je
  Seitenaufruf eine rote Zeile mit „Melden“.
- **Rückmeldung an den Melder:** beim Start und wenn der Tab wieder sichtbar wird (höchstens alle
  5 Minuten) prüft der Browser, ob eine eigene Meldung behoben oder geprüft ist: eine Zeile unten und
  eine Zahl am Knopf, bis der Dialog geöffnet wurde (`localStorage` `tp-fehler-gesehen`). Der Stand
  folgt der Werkbank genauer: „Bei der Technik“, „Wird bearbeitet“ (gestartet), „Wartet auf Entscheidung“.
- **Rückmeldungen verdecken nichts mehr:** die Leiste der Rückmeldungen ist bildschirmbreit und lässt
  Klicks jetzt durch (`pointer-events`); vorher war „Fehler melden“ unten links dahinter nicht klickbar.
- **Grenze:** Der Lauf ist eine geplante Aufgabe der Claude-App auf dem Mac. Ist die App zu, wartet die
  Meldung im Dialog sichtbar auf „Gemeldet“ und wird beim nächsten Lauf übertragen.
