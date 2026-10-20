# Control Center – Zielarchitektur und Migrationsstrategie

## Arbeitsplatz: Aufgaben vorbereiten (seit 2026-10-16, #1390)

`#/prozesse` buendelt „E-Mail vorbereiten“, „Angebot vorbereiten“ und „Recherche starten“.
Direkte Einstiege stehen auf „Heute“ und in der Befehlspalette, die vollstaendige Ansicht in der
Seitenleiste unter „Arbeitsplatz“ (am Handy hinter „Mehr“). Heute bleibt die betriebliche Startseite.

Je Aufgabe werden vorhandene Angaben in eine pruefbare Arbeitsanweisung eingebettet. Originaltexte
sind als Quellen markiert; sie ersetzen keine Projektregeln. Je nach Ziel uebernimmt der
Browserbegleiter den Text oder ein offizieller App-Link oeffnet einen Entwurf. Der manuelle Weg
bleibt als Alternative erhalten. Starten erfolgt dort durch die Person. Es gibt keinen KI-Hintergrunddienst, keine neuen
API-Schluessel und keinen automatischen Versand oder Schreibzugriff auf Fachsysteme.

Die Angebotsvorbereitung verlangt den tatsaechlich verfuegbaren, gelesenen Lexware-Skill des
Zielprojekts und stoppt bei dessen Fehlen. Das Dashboard selbst prueft oder installiert diesen Skill
nicht und fuehrt keine Kalkulation aus. Der Kunden-Reiter „Angebote“ bleibt die bestehende
Shopify-Entwurfsbestellungsansicht.

**Private Verknuepfungen:** `GET /api/prozesse/links` liefert
`{standardAnbieter, ziele:{email,angebot,recherche}, bearbeitbar}` mit je `chatgpt`, `codex`, `claude`.
`POST` speichert nur diese Konfiguration atomar und mit Rechten `0600` in
`$TP_PRIVAT_DIR/prozesslinks.json`. Jeder angemeldete Dashboard-Zugang darf sie lesen; aendern darf
nur der Inhaber bzw. der bestehende gemeinsame Passwortzugang. JSON, Herkunft und Ziele werden
serverseitig geprueft. Die Sicherung und die Datenkopie der Browserpruefung enthalten die Datei.
Nur eine fehlende Datei bedeutet Erstbetrieb; beschaedigte Konfigurationen werden nicht als leer
behandelt oder ueberschrieben.

Erlaubt sind HTTPS-Adressen von `chatgpt.com` bzw. `claude.ai` sowie die dokumentierten nativen
App-Links fuer neue/gespeicherte Codex-Chats und Claude-Projekte bzw. lokale Ordner. Abfragen mit
Prompttext, fremde Hosts, Zugangsdaten oder Textfragmente werden abgewiesen. Gespeicherte
Navigationslinks enthalten keinen Kontext. Leere Ziele bleiben sichtbar unkonfiguriert. Allgemeine App-Adressen
sagen ausdruecklich, dass das passende Projekt dort noch auszuwaehlen ist. Native Ordnerziele sind
geraetebezogen; sie uebernehmen weder Cloud-Chats noch deren Quellen oder Skills automatisch.
Referenzen: [Codex-App-Links](https://learn.chatgpt.com/docs/reference/commands),
[Claude-App-Links](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link).

**Fluechtiger Kontext im manuellen Weg:** Kunde/Vorgang und Quelltext liegen ausschliesslich im Browser-Arbeitsspeicher,
nicht in URL, Browserablagen, API-Aufrufen, Protokollen oder einer Vorgangsdatenbank. Verlassen,
Abmelden, `pagehide` (einschliesslich DOM-Standardwerten fuer den Rueckwaerts-Cache) und eine erhaltene
401 verwerfen die Eingaben. Die Zwischenablage entsteht nur nach dem bewussten Kopierknopf und
wird dabei nicht automatisch wieder geloescht. Scheitert der Browser-Kopierweg, bleibt der Text in
der aufklappbaren Vorschau manuell markierbar. Verzoegerte Kopierantworten duerfen nach einem
Kontextwechsel keinen neuen Text kopieren. Stille Datenabgleiche erhalten Wert, Fokus und Cursor
der mit `data-focus-erhalten` markierten Felder.

### Direkte Texteingabe in ein ChatGPT-Projekt (#1397)

Der optionale Browserbegleiter unter `operations/browser-uebergabe/` ersetzt auf einem eingerichteten
Chrome-Arbeitsplatz Kopieren und Einfuegen. Er verwendet dieselben privaten Projektverknuepfungen
und denselben vorbereiteten Auftrag. Ein bewusster Klick auf „Im Projekt einfuegen“ oeffnet eine
neue Projektseite und fuellt dort das noch leere Eingabefeld. Er sendet keine Nachricht und startet
keine KI. Die manuellen Knoepfe bleiben als Alternative erreichbar. Native Codex- und Claude-Ziele
verwenden die unten beschriebene App-Uebergabe.

Die Erweiterung laeuft nur auf explizit eingerichteten Dashboard-Urspruengen und auf ChatGPT-
Projektseiten. Der Generator `operations/scripts/browser-uebergabe-paket.mjs` erzeugt ihre private
Konfiguration ausserhalb des Repositorys. Sie erhaelt keine Cookie-, Zwischenablage- oder allgemeinen
Tab-Leserechte. Die Einrichtung und Standortfreigabe im Browser erfolgen einmalig durch den Inhaber.
Es gibt keinen neuen Server-Endpunkt, keinen API-Schluessel und keine Uebertragung ueber einen
Hintergrundagenten auf einem anderen Rechner.

**Datenweg:** Auf den bewussten Klick folgen eine Nachricht an das isolierte Inhaltsskript, eine
kurzlebige Ablage im Arbeitsspeicher der Erweiterung (`chrome.storage.session`) und die Einfuegung im
neuen Tab. Weder Zieladresse noch Protokolle enthalten den Auftrag. Die Erweiterung verwendet weder
`storage.local` noch Synchronisierung. Wartende Auftraege verfallen nach zwei Minuten; Abschluss,
Fehler, Abbruch und geschlossene Tabs entfernen die Ablage. Nach Einfuegung gehoert der Text zum
ChatGPT-Entwurf und unterliegt dessen Speicherverhalten.

**Erfolgspruefung:** Projektadresse, sichtbare Projektueberschrift, zugehoeriges leeres Eingabefeld,
vollstaendiger Text und aktiver Sendeknopf muessen passen. „Bereit“ bestaetigt nur die Verbindung
zum Begleiter; „eingefuegt“ erst die kontrollierte Texteingabe. Anmeldung, geaenderte Oberflaeche oder
ein bestehender Entwurf werden nicht als Erfolg behandelt. Kontextwechsel, Abmeldung und erhaltene
401 brechen noch wartende Uebergaben ab. Ein bereits eingefuegter ChatGPT-Entwurf wird dabei nicht
geloescht oder ueberschrieben.

Dieser Weg bedient die ChatGPT-Oberflaeche; eine offizielle Projekt-Prompt-API ist nicht belegt.
Die [dokumentierten App-Links](https://learn.chatgpt.com/docs/reference/commands) mit `prompt`
betreffen lokale Chats und ersetzen keine ChatGPT-Projektzuordnung. Einrichtung, Pruefung und
Grenzen stehen in [BROWSER-UEBERGABE.md](BROWSER-UEBERGABE.md).

### Direkte Entwuerfe in Codex und Claude (#1404)

`prozess-app-entwurf.mjs` ergaenzt im echten Uebergabeklick einen fluechtigen offiziellen App-Link.
Codex bekommt `prompt` und behaelt den eingerichteten `path` bzw. `originUrl`. Claude bekommt `q`;
bei Claude Code bleibt `folder` erhalten. Unterstuetzt werden ausschliesslich neue Chats/Code-
Entwuerfe. Bestehende Chats oder Cloud-Projektadressen bekommen keinen vorgetaeuschten Direktweg.
Ein allgemeines neues Chat-Ziel zeigt ausdruecklich, dass noch kein Projekt hinterlegt ist.

Das Dashboard erzeugt den Textparameter des nativen App-Links erst beim Klick. Es schreibt ihn weder in
seine HTTP-Adresse noch in einen dauerhaften `href`, die Konfiguration, Browserablagen oder einen
API-Aufruf. Anders als der ChatGPT-Begleiter verwendet dieser Weg die Textparameter des jeweiligen
App-Protokolls. Betriebssystem und Ziel-App verarbeiten diesen Link; deren Speicherverhalten kann
das Dashboard nicht steuern. Die gemeinsame Validierung gespeicherter Ziele bleibt unveraendert
streng und verbietet darin weiterhin Prompt-Parameter.

Die App-Uebergabe hat keinen Erfolgsrueckkanal. Das Dashboard meldet deshalb nur „Uebergabe
angefordert“, niemals eine bestaetigte Einfuegung. Die Person prueft den Entwurf und startet selbst.
Claude Code verlangt bei Ordnerlinks einen eigenen Bestaetigungsdialog; das Dashboard bestaetigt
ihn nicht. Das vollstaendig kodierte Ziel ist auf 12.000 Zeichen begrenzt, damit insbesondere
Claudes dokumentierte Textkuerzung vermieden wird. Zu lange oder nicht verlustfrei uebertragbare
Angaben bleiben vollstaendig im Eingabefeld und ergeben eine klare Fehlermeldung mit Alternative.
Details und Quellen: [APP-UEBERGABE.md](APP-UEBERGABE.md).

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

**Wache (seit 2026-10-12).** Ist Tailscale am Mac mini gestoppt oder abgemeldet, merkt das im Laden
niemand. Der Server fragt deshalb mit der Shop-Wache (`GET /api/shopwache/status`, Feld `tailscale`)
`tailscale status --json` ab – nur lesend, höchstens einmal je Minute, nie `up`/`login`
(`operations/lib/tailscale.mjs`). Bei `Stopped` oder `NeedsLogin` erscheint beim Inhaber ein To-do in
der Website-Sicht von „Heute“, ein Hinweis oben auf der Shop-Wache und eine Zeile im Systemzustand
(Insights) – jeweils mit dem Handgriff („Tailscale-Symbol in der Menüleiste → Connect“). Läuft Tailscale
oder ist es nicht installiert, steht nirgends etwas. `TP_TAILSCALE_PRUEFEN=0` schaltet die Abfrage ab
(Tests, andere Rechner).

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
vom Bestand ab (Abschnitt 13, „Restrollen“). **Seit 2026-10-13** bucht „An Kunden raus“ die Sendung der
betroffenen Positionen in Shopify, und Shopify schickt die Versandmail (Abschnitt 17). Beide Schreibwege
stehen auf der `write`-Liste: Rolle „lesen“ bekommt 403.

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
- Schreiben nach Shopify außer dem Ladenverkauf von Sonderposten (Abschnitt 13), der Versandbuchung bei
  „An Kunden raus“ (Abschnitt 17) und bei „Erledigt“ samt Abgleich (Abschnitt 24) – Preise, Produkte und
  Bestellungen bleiben im Shopify-Admin bzw. im Workflow mit Gates. Storniert oder zurückgenommen wird in
  Shopify nie automatisch.
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

### Einkauf „Je Auftrag“: Arbeitsliste (seit 2026-10-20, #1522)

`lib/auftrags-ablauf.mjs` ordnet jeden offenen Auftrag ein (`einordnung`): **jetzt** (bestellen,
ungeklaert, Ware da ohne „Kunde informiert“, Muster da, Verzug), **unterwegs** und **beiKunde**
(beide eingeklappt). Verzug = Status „bestellt“, mehr als `VERZUG_WERKTAGE` (10) Werktage, bei
bestaetigtem Liefertermin erst nach dem Termin; dieselbe Regel nutzt das To-do „Nachfragen“ in
`lib/todos.mjs`. „Kunde informiert“ ist ein Ereignis `kunde_informiert` im Auftragsverlauf
(`POST /api/einkauf/auftragsstatus`, aktion `schritt`, nur Warenauftraege, Rolle „lesen“ 403);
`/api/einkauf/bestellungen` liefert es als `kundeInformiert[orderId]`. „Heute“ zaehlt mit
`einkaufZahlen` dieselbe Menge und verlinkt `#/einkauf?ab=bestellen|informieren|verzug`.
Liefer-/Montagetermine der Auftrags-App sind nicht angebunden (kein lesbarer Export mit Bestellnummer).

### Einkauf je Lieferant (seit 2026-10-01)

Der Reiter „Bestellungen" zeigt eine Karte je Lieferant (`ansichten/einkauf/lieferanten.mjs`, Regeln ohne
DOM in `lib/einkauf-lieferanten.mjs`, Styles in `stile/einkauf-lieferanten.css`):

- **Zahlen und Überfällig-Hinweis** werden im Browser aus `/api/einkauf/bestellungen` und dem
  Auftragsfluss-Stand gezählt, nicht aus `/api/einkauf/lieferanten` – so passen Zahl und Liste nach
  einem Statuswechsel sofort zusammen. Vom Server kommen Stammdaten und Schwellen (7/14 Tage).
- **Karte in Arbeitsschritten (seit 2026-10-14, Inhaber):** zugeklappt zeigt jede Karte
  1. „Ware bestellen“ (je Position Artikel · Farbe, Bestellmenge, Fertigmaß/Einfassung aus
  `ausfuehrung`, Kunde · Auftrag; blockiert = Artikelnummer fehlt oder Menge ungeklärt, rot mit Grund),
  2. „Muster bestellen“ (je Kommission eine Zeile mit allen Farben), 3. „Nachfassen“ (alle Posten mit
  Wartezeit-Stufe, Ware je Position, Muster je Kommission, Knopf Anrufen/E-Mail/Kontakt). Darunter ruhig:
  „Muster haben wir da“, „Bestellt, im Plan“, „Bei uns eingetroffen“ (je ein paar Zeilen, Rest als
  Positionszahl). Jeder Posten steht in genau einem Abschnitt. Die Kachel „Aufträge nachfassen“ oben
  summiert `ueberfaellig.auftraege` der Karten (`nachfassenSumme()`). Hilfsfunktionen ohne DOM in
  `lib/einkauf-uebersicht.mjs`. „Ist eingetroffen“ an bestellter Ware setzt `geliefert` (derselbe
  Schritt wie in der Tabelle). Aufgeklappt („Positionen bearbeiten“) bleiben die Tabellen unverändert.
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

### 8b. Muster: Inhalt auf einen Blick und Musterlager (seit 2026-10-13)

Inhaber 2026-10-13: Bei einer Musterbestellung muss „ganz klipp und klar“ dastehen, welche Muster es sind –
ohne Suchen, ohne Klick. Und Muster, die wir selbst da haben (Probestück 2 × 1 m bei PVC und Linoleum,
künftig Bahnen 4 m × 20 cm der gängigsten Teppichboden-Farben), müssen vermerkt sein, damit sie niemand
noch einmal beim Lieferanten bestellt.

**Inhalt in der Bestellliste.** Kunden › Bestellungen zeigt unter jeder Zeile über die ganze Breite, was
bestellt wurde: „3 Muster · Regalia Teppichboden: Beige Mittel Dunkler, Creme Dunkel · aus dem Musterlager
(Regal B)“ bzw. bei Ware die Artikel mit Farbe und Menge (höchstens drei, dann „+N weitere“). Reine
Musterbestellungen zeigen „kostenlos“ statt „0,00 €“. Die Suche findet auch Produkt und Farbe. Logik ohne
DOM in `docs/ai-dashboard/lib/bestellinhalt.mjs` (`tests/bestellinhalt.test.mjs`); dieselben Texte nutzen die
To-dos auf „Heute“ („Muster bei Lieferant A bestellen · Kunde · Regalia Teppichboden: Sand, Greige“,
„Muster verschicken an … · aus dem Musterlager (Regal B)“).

**Musterlager** (Einkauf › Reiter „Musterlager“, `ansichten/einkauf/musterlager.mjs`, Styles
`stile/muster.css`, Server `operations/lib/musterlager.mjs`). Ablage `$TP_PRIVAT_DIR/musterlager.json`
(Teil von `npm run daten:sichern`), Shopify wird nie geschrieben.

| Art | Bedeutung | Abzählen |
|---|---|---|
| Einzelmuster | fertige Muster | ja – jedes verschickte zählt ab, bei 0 wieder beim Lieferanten |
| Probestück 2 × 1 m | PVC, Linoleum: wir schneiden zu | geschätzt: „reicht noch für ca. N A5-Muster“ (54 je Stück); „Ist leer“ von Hand |
| Bahn 4 m × 20 cm | Teppichboden: wir schneiden zu | geschätzt wie Probestück (27 je Bahn) |

- **Mustergröße A5** (Inhaber 2026-10-15): 14,8 × 21 cm. `musterJeStueck()` nimmt die bessere Lage im
  Stück (Probestück 9 × 6 = 54); bei der Bahn gilt die Bahnbreite 20 cm als lange A5-Seite (1 cm Toleranz),
  abgeschnitten wird alle 14,8 cm (27). `reichtNoch` = Anzahl × Muster je Stück − seit `basisAm` verschickte
  − reservierte. `basisAm` setzt das Anlegen, eine neue Anzahl, ein Artwechsel und „Wieder da“ – dann zählt
  das vorher Abgeschnittene nicht mehr. Ab 5 restlichen Mustern steht der Eintrag auf knapp; ein
  Probestück nennt dann den Nachkaufpreis beim Lieferanten (8–15 € je nach Qualität).
- **Gemischte Musterbestellung** (Inhaber 2026-10-15): Liegt ein Teil im Lager und ein Teil kommt vom
  Lieferanten, geht alles zusammen raus, sobald die Lieferanten-Muster da sind. Solange eines davon nicht
  bestellt oder bestellt ist, gibt es kein To-do „Muster verschicken“ (`lieferantMusterAusstehend()` in
  `lib/todos.mjs`, Server-Spiegel `wartetAufLieferant()`); das Musterlager zeigt die Bestellung als
  „zurückgelegt“. Ist die Ware da, nennt das To-do „rausgeben“ die Lagermuster mit, und der Versand-Dialog
  kreuzt sie vorab an (`vorauswahl()` in `lib/versand.mjs`).
- **Keine Vorratsmuster beim Lieferanten** (Inhaber 2026-10-15): Die Bestellmail bestellt nur, was Kunden
  bestellt haben – kein Hinweis „2–3 Muster mehr zum Einlagern“.
- **Etiketten** (Inhaber 2026-10-15): kleines Etikettengerät, darauf nur Produktname und Farbe – kein
  QR-Code, keine Artikelnummer. Größe und Druck werden erst gebaut, wenn das Gerät feststeht.

- **Schlüssel** ist die SKU ohne „M-“ (Mustervarianten tragen `M-<SKU der Quellvariante>`, bei Teppich nach
  Maß die der Teppichboden-Qualität). Beim Einlagern aus dem Lexikon kommen alle Breiten einer Farbe und das
  Musterprodukt dazu; Muster über das Sammelprodukt „Kostenloses Muster“ nehmen die SKU der Quellvariante.
- **Wirkung:** Eine offene Musterposition (kein Auftragsfluss-Stand, keine ausdrückliche Wahl, Auftrag offen),
  deren Schlüssel im Lager steht, bekommt beim Laden des Modells `musterHerkunft: eigen_versand`,
  `musterHerkunftQuelle: lager` und `musterLager {id, art, artLabel, ort, rest}` (`mitMusterlager()` in
  `scripts/dashboard-api.mjs`, nach der Wahl aus `musterherkunft.json`). Damit gilt alles aus „Muster haben
  wir da“: nicht in der Bestellmail (Grund „aus dem Musterlager (Regal B) – wird von uns verschickt“), nicht
  „Muster noch zu bestellen“, To-do „Muster verschicken an …“. Die älteste Bestellung bekommt das letzte
  Einzelmuster; die nächste geht an den Lieferanten und trägt `musterLagerLeer` („Musterlager: … leer“).
  Die Wahl „Woher? ändern…“ geht immer vor.
- **Festschreiben beim Verschicken:** Erreicht eine so zugeordnete Position „An Kunden raus“ (Einzelstatus,
  Schritt `raus` oder `kunde_hat_muster`), hängt der Server ein `musterherkunft`-Ereignis mit `lagerId` an.
  So zählt das Muster als verschickt, auch wenn der Lagereintrag später leer gesetzt oder entfernt wird.
  „Bestellt“ ist kein Abgang.
- **Vorschläge „Einlagern?“:** eingetroffene Probestücke von PVC/Linoleum (Stand „geliefert“, höchstens
  45 Tage) – „den Rest einlagern?“ – und Farben, die in 120 Tagen mindestens zweimal als Muster bestellt
  wurden. Ein Klick öffnet den Dialog vorbelegt.
- **Endpunkte:** `GET /api/einkauf/musterlager` (Einträge mit Stand verbraucht/reserviert/Rest/reichtNoch,
  offene Bestellungen je Eintrag samt `wartetAufLieferant`, Mustergröße, Vorschläge), `GET /api/einkauf/musterlager-farben?handle=` (Farben eines
  Lexikon-Produkts samt Schlüssel), `POST /api/einkauf/musterlager` mit `aktion: einlagern | aendern |
  entfernen` (Schreibpfad: Rolle „lesen“ 403). Ein beschädigtes `musterlager.json` hält keine
  Bestellansicht auf; nur der Reiter meldet den Fehler, und Schreiben verweigert.

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

### 9b. Eine Arbeitsliste (seit 2026-10-19, #1427)

Inhaber 19.10.: „zu unübersichtlich“. „Heute“ ist seither **eine** Liste statt dreier Blöcke (To-dos,
Muster-Karten, Wer wartet). Oben „N Sachen heute zu erledigen“ – N zählt genau die Zeilen der Liste; der
Inhaber wählt per Chip *Laden*, *Website* oder *Alles* (Zahl am Chip = Zeilen dieser Sicht, die
fälligen Muster-Nachfragen und Belege zählen zu Laden). Sieben Zeilen, der Rest hinter „alle anzeigen“.
Fehlt eine Quelle (Bestellungen, Auftragsfluss, Fälle …), steht „Liste unvollständig“ statt „Alles
erledigt“. Darunter ruhig **„Im Hintergrund“**: Muster-Nachfragen (was der automatische Versand
übernimmt; nur was ein Mensch tun muss, steht oben als To-do – `teileNachfassen()`), „Wartet auf andere“
(Lieferant/Kunde, aufklappbar per `?ww=1`), Lieferantenpostfach (§ 25) und der Datenstand. Laden- und
Montage-Kacheln nur, wenn die Apps eingerichtet sind. „Alles“ zeigt die Vereinigung aller Bereiche
(`fuerSicht('alles')`), nicht mehr die frühere Inhaber-Auswahl.

Ein Liefertermin in der Zukunft heißt „kommt bis …“ (Lieferant ist dran), ein überschrittener ist rot
in der Liste – vorher sagte die Warteübersicht „Nachhaken“, während die Liste schwieg.
„In Shopify noch offen“ (§ 24) steht seither als Zeilen dieser Liste (`shopifyAbgleichTodos()`), nicht
als eigener Block.

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
| Neue Service-Anfrage | `/api/kunden/serviceanfragen` | Status „neu“; gelb ab 1, rot ab 3 Tagen (seit 2026-10-19) |
| Storno vom Lieferanten | `/api/einkauf/belege` | Storno-Beleg zu einer Shop-Bestellung, nicht erledigt; immer rot (§ 25) |
| Lieferschein da – Ware angekommen? | `/api/einkauf/belege` | Lieferschein, bei uns noch „bestellt“; gelb (§ 25) |
| Lieferantenbelege zuordnen | `/api/einkauf/belege` | Vorschläge („gehört zu #1041?“), eine Sammelzeile (§ 25) |
| In Shopify noch offen | `/api/einkauf/shopify-abgleich` | im Dashboard „raus“/„erledigt“, in Shopify offen; gelb, Knopf „In Shopify nachbuchen“ in der Zeile (§ 24) |

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
ohne Textvorschlag. Seit 2026-10-16 verschickt ein täglicher Lauf die Mails selbst (Abschnitt 23);
der Klick bleibt für Ausnahmen und solange das Postfach nicht eingerichtet ist.

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
entfällt dann. Seit 2026-10-13 bucht „raus“ selbst in Shopify (Abschnitt 17): mit Vermerk „gebucht“ entfällt
der Hinweis, auch wenn der Bestellexport noch den alten Stand zeigt; ist die Buchung gescheitert, heißt er
„Versand in Shopify nicht gebucht – in der Bestellung nachholen“.

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

**Knopf „Jetzt aktualisieren“ (seit 2026-10-12):** Bricht der Lauf selbst ab (Absturz, Zeitlimit von
10 Minuten), behält der Server das Ergebnis als `letzterKnopfLauf: { seit, bis, fehler }` in
`/api/aktualisierung` und `/api/aktualisierung/status`. Die Oberfläche meldet dann „abgebrochen“ statt
„abgeschlossen“ und zeigt im Systemzustand eine Zeile, bis ein späterer Lauf die Daten erneuert hat.
Scheitern nur einzelne Quellen (Exit 1 nach vollständigem Bericht), ist das kein Abbruch – das steht je
Quelle wie bisher.

**Aufgabendaten im Dienst (seit 2026-10-12):** `issues.json` wurde im Dienst nur beim Start, nach einer
Schreibaktion und auf „Jetzt synchronisieren“ neu gebaut. Jetzt zusätzlich alle
`TP_DASHBOARD_NEUBAU_MINUTEN` (Standard 10, `0` = aus), nie überlappend: läuft schon ein Neubau, fällt der
Takt aus; kommt eine Schreibaktion während eines Neubaus, folgt genau ein weiterer. Der Datenstand-Chip
zeigt bei einem Stand von einem anderen Tag das Datum mit („10.10. 09:00“).

**Häufiger als täglich:** `operations/scripts/sync-dienst.mjs`
(`npm run daten:sync-dienst`) führt `aktualisieren()` in einer Dauerschleife
aus statt über eine geplante Aufgabe – Intervall `TP_SYNC_INTERVALL_MINUTEN`
(Standard 10 Minuten), damit eine am Nachmittag eingegangene Bestellung nicht
erst am nächsten Morgen im Control Center sichtbar wird. Lexikon und Lagerbestand laufen nur stündlich mit
(`TP_SYNC_LEXIKON_MINUTEN`, `TP_SYNC_BESTAND_MINUTEN`); der Bestand allein kostete vorher rund 90 von 100
Sekunden je Lauf. Jede Zeile im Sync-Protokoll beginnt mit der Uhrzeit. Läuft entweder von
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
  Namen sperrt den alten nicht. „Sperren“ (`POST /api/social/sperren`, nur Inhaber) sperrt wie
  `npm run social -- zugang sperren` alle Links eines Namens und löscht den gemerkten Klartext. Die Adresse davor ist `SOCIAL_UPLOAD_BASIS_URL` aus `social/zugang.env`.
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
  sie nur dem Melder und dem Inhaber; eine fremde Meldung antwortet wie eine fehlende (404).
  **In der Werkbank** (Inhaberentscheidung 2026-10-12: „ich will den Anhang sehen“): der Abgleich lädt
  jedes Bild in den Bildspeicher der Werkbank (`Artifact` mit `asset: true`, Fähigkeit `assets` der
  Seite) und trägt `bilder: [{id, url}]` am Eintrag ein; die Seite zeigt sie als Vorschau, ein Klick
  vergrößert. Bildschirmfotos können Kundendaten zeigen – die Werkbank bleibt deshalb privat (Inhaber
  und freigegebene Mitarbeiter). Scheitert ein Upload, steht im Eintrag der Hinweis auf
  `npm run -s fehler -- zeige`.
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

## 16. Robustheit des Dienstes (seit 2026-10-12)

Befunde einer Prüfung am 2026-10-12, alle mit Test (`tests/robustheit.test.mjs`,
`operations/tests/speicher-lesefehler.test.mjs`):

- **Kein Absturz durch Anfragen.** Ein Cookie `x=%` beendete ohne Anmeldung den ganzen Dienst
  (`decodeURIComponent` in `parseCookies`). Kaputte Cookie-Werte werden übersprungen; `requestHandler`
  fängt jeden Fehler (auch aus `handleApi`/`handleLogin`) und antwortet 500; `uncaughtException` und
  `unhandledRejection` werden protokolliert, der Prozess läuft weiter.
- **Fehlerprotokoll.** `scripts/dashboard-log.mjs`: eine Zeile je Fehlerantwort der API (auch 4xx),
  je abgelehnter Anmeldung und je unerwartetem Fehler – mit ISO-Zeit, Status, Methode und Pfad **ohne**
  Abfrageteil (dort stehen Suchbegriffe wie Kundennamen); nie Cookies, Anfragekörper oder Passwörter.
- **Lesefehler sind keine leeren Daten.** Auftragsstatus, Rückrufe, Fallmarken, Aufgaben/Notizen und
  Benutzer gelten nur bei fehlender (oder 0 Byte großer) Datei als leer. Eine beschädigte oder unlesbare
  Datei wirft; der nächste Klick überschreibt sie nicht mehr mit einem einzigen Eintrag. Ist
  `benutzer.json` beschädigt, antwortet die Anmeldung 503 mit Klartext, der Notzugang (Einzelpasswort)
  kommt weiter herein, und Sitzungen werden nicht gelöscht.
- **Eingabefehler sind 400**, nicht 500 (`OrganisationFehler` in `organisation-speicher.mjs`).
- **Blockieren schreibt `## Blocker`** in den Issue-Body (`mitBlockerAbschnitt` in `lib/model.mjs`), wo
  `parseBody` den Grund liest; vorher stand er nur im Kommentar und die Aufgabe zeigte „Blocker-Grund
  fehlt“. Das Aufgaben-Detail zeigt den Abschnitt nur, solange die Aufgabe blockiert ist.
- **Lexikon im Zwischenspeicher** (`readJsonGecacht`, nach Größe und Änderungszeit): die rund 27 MB
  wurden vorher bei jeder Anfrage synchron gelesen, die Befehlspalette fragt beim Tippen alle 150 ms.
- **Kopfzeilen.** Jede Antwort: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`,
  `nosniff`. Anhänge (`org/anhang-lesen`, `fehler/bild`) nur als Bild, PDF oder Text im Fenster, alles
  andere als Download. Ein zu großer Körper bekommt seine 413, statt dass die Verbindung abreißt.
- **Prüfwerkzeug.** `dashboard:pruefen` räumt Instanz und Datenkopie bei jedem Ende auf (Lauf fertig, Fehler,
  `SIGINT`/`SIGTERM`/`SIGHUP`) und zählt eine Ansicht, die nach 6 s noch „Lade …“ zeigt, als `FEHL`. Mit
  `--offen` bleibt die Instanz nach einem fehlerfreien Lauf stehen; das ausgegebene `kill <pid>` trifft den Server,
  der seine Kopie dann selbst löscht (`TP_DASHBOARD_DATENKOPIE`, `scripts/dashboard-datenkopie.mjs`, nur ein
  eigener markierter Ordner `tp-dashboard-daten-XXXXXX` direkt im Temp-Ordner, der zugleich `TP_PRIVAT_DIR` ist).
  `dashboard-pruefung-lauf.mjs` wartet Browserstart, Browserende und Serverende ab, bevor die Kopie verschwindet.
  Bei SIGINT/SIGTERM/SIGHUP endet auch ein laufender Browserstart geordnet; Puppeteers eigene Signalhandler
  bleiben aus. Verwaiste eigene Kopien werden nach einem Tag, eigene Screenshot-Ordner nach drei Tagen
  bereinigt. `dashboard-temp-besitz.mjs` bindet die Kennung an Verzeichnisidentität und Besitzer-PID;
  nur ein toter Besitzer und eine eindeutige freie `lsof`-Prüfung (inklusive cwd) geben sie frei. Unmarkierte
  Altordner, Links und unbekannte Prozesszustände bleiben erhalten. `--aus` entzieht eine frühere automatische
  Ablage dauerhaft der Bereinigung. Die npm-Tests verwenden `test-temp.mjs`: eigener Tempordner und unter
  POSIX eine eigene Prozessgruppe, Signalweitergabe an Enkel, begrenzte Eskalation, Abbruchcodes 130/143/129.
  Erst nach bestätigtem Gruppenende wird gelöscht; unklare Zustände behalten den Ordner und melden den Fehler.
  Windows nutzt `taskkill /T /F`; auf macOS getestet, Windows-Pfad nicht praktisch abgenommen. Bewusst in
  eine eigene Prozessgruppe abgekoppelte Testkinder gehören nicht zur verwalteten Gruppe.
- **Handy.** Der Fuß des „Mehr“-Blatts (Datenstand, Fehler melden, Passwort, Abmelden) bleibt unten
  stehen, zweispaltig; Rückmeldungen erscheinen bei offenem Blatt oben statt darüber.

## 17. „An Kunden raus“ bucht den Versand in Shopify (seit 2026-10-13)

Inhaber 2026-10-13 (Werkbank w-079): Wird im Control Center „An Kunden raus“ gesetzt, bucht Shopify die
Erfüllung der betroffenen Positionen, und der Kunde bekommt die Versandmail von Shopify. Teillieferungen und
Musterbestellungen genauso. Code: `operations/lib/versand.mjs` (Shopify), `versandBuchen()` in
`scripts/dashboard-api.mjs` (Ablage, Protokoll), Dialog `ansichten/einkauf/versand.mjs`, Regeln ohne DOM
`lib/versand.mjs`.

**Dialog statt Ein-Klick.** Weil der Klick jetzt eine Mail an den Kunden auslöst, öffnet „Als raus zum Kunden
markieren…“ (Einkauf), „Muster sind verschickt…“/„An Kunden raus…“ (Zeitleiste), „An Kunden raus…“ in der
Bestellliste (Kunden › Bestellungen) und „raus“ unter „Etwas anderes ist passiert …“ den Dialog „An Kunden raus“: Artikel, die noch nicht raus sind, als Häkchen (aus dem Einkauf nur
die angeklickte Position vorgewählt; Eigenleistungen wie Kettelservice gehen mit der letzten Ware mit), optional
Sendungsnummer und Versanddienst (Shopify-Namen, damit Shopify den Verfolgungslink baut; der Dienst wird je Gerät
gemerkt), Häkchen „Kunde bekommt die Versandmail von Shopify“ (vorab an; aus bei persönlich vorbeigebrachten Mustern
und bei einer Versandart mit „Abholung“). Ist die angeklickte Position im Browser-Stand nicht mehr offen, gilt
genau sie – nie eine andere und nie die ganze Bestellung. Gesendet wird `aktion: "schritt", schritt: "raus", lineItemIds, versand: {sendungsnummer, versanddienst,
benachrichtigen}` an `POST /api/einkauf/auftragsstatus`.

**Einzelweg ohne Dialog.** `POST /api/einkauf/auftragsstatus` mit `{orderId, lineItemId, status: "raus"}` (eine
Position, z. B. eine noch zwischengespeicherte alte Oberfläche in einer Schleife) bucht **nicht** sofort – sonst
gäbe es je Artikel eine Buchung und eine Mail. Er setzt den Vermerk „ausstehend“; „In Shopify buchen“ bucht dann
alle wartenden Artikel der Bestellung als ein Paket.

**Ablauf im Server.** Erst der lokale Schritt (die Ware ist raus, das gilt immer), dann die Buchung:

1. Gebucht werden nur Positionen, die **vor** dem Klick noch nicht „raus“ waren. Die Korrektur von „erledigt“
   zurück auf „raus“ bucht nichts; Positionen mit Vermerk „gebucht“/„bereits“ werden nie erneut versucht.
2. Buchungen derselben Bestellung laufen im Prozess nacheinander (`nacheinander()`); zusammen mit dem frischen
   Lesen der offenen Menge bucht ein doppelter Klick nie doppelt.
3. `bucheVersand()`: Bestellung frisch lesen (Fulfillment Orders), je Position einordnen (buchbar, schon
   erfüllt, zurückgehalten, nicht buchbar; abgeschlossene Fulfillment Orders zählen nie als offen; ein Artikel an
   zwei Standorten bleibt Handarbeit; eine nicht vollständig gelesene Bestellung bucht gar nichts). Zurückhaltung
   „Bestand fehlt“ (`INVENTORY_OUT_OF_STOCK`, bei Mustern der Normalfall – am 13.10. bei 2 von 21 offenen
   Musterbestellungen) wird nach ID aufgehoben, und zwar für die ganze Fulfillment Order: bei einer Teillieferung
   werden die übrigen Muster dort ebenfalls buchbar (bewusst; nichts versendet sich davon allein). Andere Gründe
   (Zahlung, Betrugsverdacht, Adresse, von Hand) bleiben. Ob die Aufhebung gewirkt hat, zeigt erst das erneute
   Lesen. Dann `fulfillmentCreate` je Standort mit genau diesen Zeilen und ihrer offenen Menge, `notifyCustomer`,
   `trackingInfo`. Jeder Aufruf hat ein Zeitlimit von 25 s. Kommt keine Antwort, entscheidet erneutes Lesen
   (gebucht / nicht angekommen / unklar; nach einem Zeitlimit nie „nicht angekommen“, weil Shopify noch
   verarbeiten kann). Gegenprobe durch erneutes Lesen.
4. Ergebnis je Position als `shopifyVersand` in `auftragsstatus.json` (`status`: gebucht, bereits, fehler,
   unklar, uebersprungen; `grund`, `meldung`, `am`, `fulfillmentId`, `kundeBenachrichtigt`), Sendungsnummer als
   `sendungsnummer`/`versanddienst`, die Mail-Wahl als `versandMail` (ohne Angabe: ja, außer bei persönlich
   vorbeigebrachten Mustern). „uebersprungen“ heißt endgültig (storniert, Testbestellung – auch laut Shopify –,
   Position nicht mehr in der Bestellung): kein roter Hinweis, kein Nachholen. Protokoll: „Versand in Shopify gebucht“ (mit Sendung, Mail ja/nein) bzw.
   „… nicht gebucht“/„… unklar“ samt Grund; Fehlschläge zusätzlich im Dienstprotokoll (`[versand]`).
5. Antwort mit `shopify: {status, meldung, …}`; die Oberfläche meldet z. B. „Als verschickt eingetragen · In
   Shopify als versendet gebucht – der Kunde bekommt die Versandmail.“ oder rot „… – aber Versand nicht in
   Shopify gebucht: …“.

**Nicht gebucht** werden Testbestellungen (Vermerk „uebersprungen“) und stornierte Bestellungen. „Kunde hat
Muster“ bei Mustern aus eigenem Bestand setzt „raus“ mit: gebucht wird ohne Versandmail (der Kunde hat sie
schon); die Rückmeldung nennt das Ergebnis der Buchung. **Rückwirkend nur auf Klick (seit 2026-10-19):** Positionen, die vor dem 13.10. auf
„raus“ standen, tragen keinen Vermerk. Sie werden gebucht, wenn jemand sie auf „Erledigt“ setzt, oder über „In Shopify nachbuchen“ in der
Abweichungsliste (Abschnitt 24) – nie still im Hintergrund.

**Nachholen.** Scheitert die Buchung (Recht fehlt, kein Zugang, Netz, zurückgehalten), steht der Schritt
trotzdem. Die Zeitleiste zeigt rot „Versand nicht in Shopify gebucht – …“ mit „In Shopify buchen“, die
Einkaufsposition dasselbe; `aktion: "versandNachholen"` bucht genau die Positionen mit Vermerk „fehler“ oder
„unklar“ (sonst 409), je Sendung (Nummer, Dienst, Mail-Wahl) eine eigene Buchung, mit der damals getroffenen
Mail-Wahl.

**Recht.** `write_fulfillments` und `write_merchant_managed_fulfillment_orders` (`SCHREIB_BEREICHE` in
`sync/zugang.mjs`); beide sind erteilt (Lesprobe 2026-10-13 über `currentAppInstallation.accessScopes`).
Kein Vorab-Abgleich mit der beim Start gemeldeten Rechteliste (die veraltet im laufenden Dienst) – Shopify
lehnt ohne Recht vor jeder Änderung ab. Der Dienst hält seinen Token im Speicher: nach einer Freischaltung neu
starten. Fehlen sie, bucht der Server nichts und sagt „dem Control Center fehlt das Shopify-Recht
write_merchant_managed_fulfillment_orders … Bis dahin in Shopify die Bestellung öffnen und „Artikel versenden“
wählen.“

**Tests und Prüfwerkzeug** sprechen nie echtes Shopify: `operations/tests/versand-attrappe.mjs` führt
Fulfillment Orders mit offener Menge. `dashboard:pruefen` startet seine Instanz seit 2026-10-13 ausdrücklich
ohne Shopify-Zugang (`SHOPIFY_*` entfernt, `TP_ENV_LOCAL` ins Leere) – ein Klick auf „raus“ in der Kopie bucht
nie eine echte Sendung.

## 18. Bestätigte Beschaffung und Arbeitsübernahme (#1206)

`auftragsstatus.json` bleibt die einzige lokale Positionsablage. Additiv je Position:
`beschaffung: {liefertermin, grund, wareneingang: {soll, angekommen, verwendbar, einheit,
bestaetigtAm, bestaetigtVon}}` und `uebernahme: {id, person, seit}|null`. Version 1 bleibt lesbar;
ohne Zusatzfelder gilt die bisherige Statuslogik. Ungültiges JSON/Positions-/Zusatzformat verweigert
Schreiben statt als leerer Bestand zu gelten. `POST /api/einkauf/auftragsstatus`, Aktion `beschaffung`,
validiert die Position am vorhandenen Bestellmodell und nimmt Soll/Einheit vom Server; Mengen sind
kumulative menschliche Bestätigungen. Restmenge > 0 bleibt bestellt und sperrt geliefert/raus/erledigt,
auch über den Sammelschritt. Neue Zustände ändern keine Shopify-Mengen/Preise/Varianten.

**Maßanfertigung (#1267).** Ein erkannter Maßteppich wird nur bei endlicher, positiver Breite und
Länge als ein Stück im Fertigmaß bestellt. Fehlende, unlesbare, null oder negative Maße bleiben
mit Klärgrund ungeklärt; die Lieferanten-Mail führt diese Position unter „fehlt“ und enthält sie
nicht im Bestelltext. Rollenbedarf ersetzt kein fehlendes Fertigmaß. Gültige Rechtecke, runde
Teppiche und die Entscheidung des Lieferanten über den Zuschnitt bleiben unverändert.

`bestellSoll` wird nur im lokalen API-Modell aus `currentQuantity` (sonst `quantity`) desselben
Exports über die vorhandene Mengenberechnung abgeleitet. Anders als die offene Einkaufsmenge
bleibt es nach Versand erhalten. `beschaffungsStand()` gleicht bestätigten Eingang beim Lesen
gegen dieses frische Soll ab: größere Sollmenge zeigt den Rest und öffnet die Anzeige wieder,
ohne den bestätigten Eingang zu überschreiben. Sinkt das Soll unter die angekommene Menge,
ändert sich die Einheit oder fehlt die Quelle, erscheinen Klärhinweis und blockierte Folgeschritte.
Mengen werden weder gekürzt noch umgerechnet; eine Korrektur in derselben Einheit bleibt eine
ausdrückliche menschliche Bestätigung. Bei einer neuen Bestätigung wird das aktuelle Soll gespeichert.
`klaerung`/`aktuelleBestellmenge` sind reine Lesefelder, keine zweite Ablage.

Sammelschritte bereiten sämtliche Positionsänderungen an einer frisch gelesenen Datei vor und
schreiben sie erst nach erfolgreicher Prüfung mit einem atomaren Rename. Auftragsereignisse
werden ebenfalls vorbereitet und beschädigte Verlaufsdateien verweigern das Schreiben; bei
einer abgelehnten Positionsprüfung bleiben Status und Ereignisdatei unverändert. Die lokale
Vorprüfung bis zum Write enthält kein `await`; parallel eintreffende Klicks lesen so auch die
Arbeitsübernahme direkt vor ihrer Änderung frisch. Die vorhandene asynchrone Versandsperre
bleibt bestehen. Fehlende Beschaffungs-Zusatzfelder bleiben kompatibel, ungültige Termine,
Hinweise, Einheiten und nichtpositive Sollmengen werden nicht überschrieben.

Aktion `uebernahme` nimmt Positionen und `uebernahmeAktion: nehmen|freigeben|uebernehmen`.
Person/Rolle kommen ausschließlich aus der Sitzung. Mitarbeiter dürfen keine fremde Übernahme
freigeben/übernehmen; Inhaber übernimmt bewusst mit eigenem Knopf. Kein automatischer Ablauf.
Alle Positionen einer Sammelübernahme werden vor dem einen atomaren Schreibvorgang geprüft.
Der Endpunkt liegt weiter in der bestehenden Schreib-/Rollenprüfung; Leser erhalten 403.

Heute-Links behalten rohe Auftrags-/Kunden-/Fallkennungen als URL-Parameter und führen zurück zu Heute.
`auftrag` begrenzt Einkauf inklusive Bestelltexte; der Quellspeicher wird nicht gefiltert/verändert.
Muster-Nachfasstexte verwenden maximal drei aktive, eindeutige Varianten aus dem lokalen Lexikon,
nur öffentliche Produkt-URLs und keinerlei private Kundenakten-/Trackinglinks. Die Quelle muss eine
belegte `onlineStoreUrl` und eine eindeutige verfügbare Variante besitzen; ältere Exporte ohne dieses
Feld erzeugen bis zum nächsten regulären Export keine Kauflinks. Aussendung bleibt manuell.

`aktualisierung` und dessen Status ergänzen `betrieb`. Nach erfolgreichem Archiv schreibt die bestehende
Sicherung atomar `sicherungsstand.json` mit letztem Erfolg. Werkbank-Rückmeldungen verwenden nur ihren
vorhandenen Aktualisierungszeitpunkt als `letzteLokaleRueckmeldung` und separat `lokalerStatus`.
Der Gesamtstatus/`vollabgleich` bleibt unbekannt, denn der Zeitstempel belegt keinen vollständigen
Brückenabgleich oder externe Schreibrechte. Fehlende Basis ist unbekannt; über 48 Stunden alt ist ein
lokaler Hinweis, beschädigte Metadaten sind ein Fehler. Unbekannt ist in der Oberfläche neutral.
Montage reicht v49 `letzterLaufMin`/`laufzeitHeuteSek` nur als Integer >= 0 durch; fehlend wird nie 0.
Die QA-Instanz entfernt Shopify-/Auftrags-App-Zugänge und verwendet Testattrappen, nicht den Realbestand.

## 19. Ansicht „Bildrechte“ (seit 2026-10-14, #1285)

Rein lesend, für alle Rollen (auch „lesen“): `ansichten/bildrechte.mjs`, Endpunkt
`GET /api/bildrechte/liste?liste=ungeklaert|zu-klein|ohne-alt&gruppe=<Warengruppe>&page=<n>`
(nicht in der `write`-Liste, kein Inhaber-Pfad). Quelle ist allein das lokale Verzeichnis
`$TP_PRIVAT_DIR/bildrechte/bildrechte.csv` aus `npm run bildrechte:inventur` und der Handpflege
(Konzept `docs/weiterentwicklung/bilder.md` §6); es kommt nie ins Repository oder in `issues.json`.

- Regeln in `prueflisten()` (`operations/lib/bildrechte.mjs`): entfernte Zeilen (Status beginnt mit
  `entfernt` oder Notiz „nicht mehr in Shopify“) fallen weg; ungeklärt = Status `ungeklaert` oder leer;
  zu klein = erfasste Breite < `MINDESTBREITE` (1200); ohne ALT = leerer ALT-Text. Zeilen ohne Breite
  werden als `breiteUnbekannt` gezählt und in der Ansicht erklärt.
- Antwort: Zähler aller drei Listen, Warengruppen der gewählten Liste (nach Anzahl), eine Seite
  à 25 mit Titel, Handle, Warengruppe, Position, Dateiname, Maßen, Namenshinweis und Links. Admin-
  und Shopadresse kommen aus dem Lexikon-Export; Lizenz, Quelle und Beleg verlassen den Server nicht.
- Parameter der Oberfläche: `bl` (Liste), `bg` (Warengruppe), `bs` (Seite); ein Wechsel von `bl`
  oder `bg` setzt die Seite zurück (`setParam`).
- Fehlt die CSV: `verfuegbar: false` mit Befehl. Andere Lesefehler: 500 und Störungshinweis.


## 20. Kunden › „Service-Anfragen“ (seit 2026-10-16, #1361, Werkbank w-030)

Anfragen für Verlegeservice, Treppe und Aufmaß an einer Stelle, mit Quelle und Status – damit
messbar wird, was die Serviceseiten und die Werbung bringen (Inhaber 15.10.: im Control Center
unter „Kunden“). Reiter `#/kunden?tab=service`, Modul `ansichten/kunden/serviceanfragen.mjs`,
Styles `stile/serviceanfragen.css`.

- **Ablage:** `$TP_PRIVAT_DIR/serviceanfragen.json` (`operations/lib/serviceanfragen.mjs`, Bauart wie
  `rueckrufe.json`: atomar, beschädigt → Fehler statt leer). In `SICHERUNGSPFADE` von
  `npm run daten:sichern`. Nummern `S-001` fortlaufend; Statuswechsel landen im `verlauf` (max. 30).
- **API:** `GET /api/kunden/serviceanfragen` (alle Rollen), `POST` derselbe Pfad: ohne `id` anlegen,
  mit `id` ändern (in der `write`-Liste, Rolle „lesen“ → 403). Wer angelegt/geändert hat, kommt aus der
  Sitzung. Optionales Feld `mailId`: dieselbe Mail wird nur einmal angelegt (für einen späteren
  automatischen Abgleich).
- **Werte** (`lib/serviceanfragen.mjs`, Browser und Server): Leistung `verlegeservice | treppe |
  aufmass | sonstiges`, Quelle `formular | mail | telefon | whatsapp | laden | werbung`, Status `neu |
  kontaktiert | termin | angebot | gewonnen | verloren`. Pflicht: Datum, Leistung, Quelle und eins von
  Name/Telefon/E-Mail. „Herkunft“ ist Freitext (Betreff der Serviceseite, Anzeige, Empfehlung).
- **Formular-Mail einfügen:** Shopify schickt jede Formularanfrage als „Neue Kundennachricht vom …“
  von `mailer@shopify.com`; der Mailtext enthält `Betreff:` (je Serviceseite fest gesetzt im Abschnitt
  `tp-start-kontakt`, z. B. „Anfrage Treppenverlegung“), `Name:`, `Plz:`, `E-Mail:`, `Telefon:`,
  `Anliegen:`, `Text:`. `ausFormularMail()` füllt daraus den Dialog; Leistung zuerst aus dem Betreff,
  sonst aus dem Anliegen. Musteranfragen (`Id: ContactForm-sample`) werden abgelehnt.
- **Auswertung oben:** letzte 8 Kalenderwochen inklusive der laufenden, je Woche und je Quelle
  (mit gewonnen/verloren); beide zählen dieselbe Menge.
- **Automatische Übernahme (seit 2026-10-16, Inhaber: ja):** Der Dienst liest kein Postfach. Das tut
  der geplante Claude-Lauf `serviceanfragen-postfach` (Mo–Sa stündlich 8–18 Uhr, nur lesend über
  Gmail): `npm run -s service -- bekannt` liefert die schon geprüften Mail-IDs, der Lauf holt nur neue
  Mails von `mailer@shopify.com`, legt sie als JSON in sein Scratchpad und ruft
  `npm run -s service -- uebernehmen --datei <json>` (`operations/scripts/serviceanfragen.mjs`).
  Übernommen wird nur, was `automatischUebernehmbar()` erlaubt: die festen Betreffe der Serviceseiten
  (`BETREFF_SERVICE`) und die Startseite mit Anliegen Verlegen/Aufmaß/Treppe. Eine Mail nie zweimal
  (`mailId`), eine schon von Hand erfasste Anfrage nicht noch einmal (gleiche E-Mail oder Telefonnummer
  innerhalb von 7 Tagen). Übersprungene Mails merkt sich `serviceanfragen-postfach.json` (schreibt nur
  das Skript; gesichert). Angelegt wird mit Status „neu“ und „Postfach (automatisch)“ als Urheber; die
  Zeile zeigt „aus dem Postfach übernommen“. Ein Test prüft, dass jeder Betreff aus `templates/` in
  der Liste steht oder bewusst ausgenommen ist – eine neue Serviceseite fällt so auf.
- **Kampagnenfeld:** Das Anfrageformular (`sections/tp-start-kontakt.liquid`) füllt das versteckte
  Feld `contact[Herkunft]` aus der Adresse der Seite: „Google-Anzeige“ (gclid/gbraid/wbraid),
  „Microsoft-Anzeige“ (msclkid), „Anzeige (<utm_source>)“ bei bezahltem `utm_medium`, sonst „Link
  (<utm_source>)“ bzw. „Link von Facebook/Instagram“, jeweils mit „· Kampagne <utm_campaign>“. Nichts
  wird auf dem Gerät gespeichert, Klick-IDs gehen nicht mit. Steht „Anzeige“ darin, wird die Quelle
  „Werbung“. Grenze: erfasst ist nur, wer auf der Seite mit der Anzeigenadresse anfragt; wer erst
  weiterklickt, zählt als Formular.

## 21. Insights › „Claude-Verbrauch“ (seit 2026-10-16, #671)

- **Frage:** Wohin geht das Wochenbudget des Max-Plans? Gezeigt wird nur, was die lokalen
  Sitzungsprotokolle von Claude Code belegen.
- **Quelle:** `~/.claude/projects/<Hauptcheckout>*/` (Hauptcheckout, `.claude/worktrees/*`) und
  `~/.claude/projects/<home>-Developer-tp-*` – je Sitzung `<id>.jsonl`, Subagenten unter
  `<id>/subagents/**.jsonl` (Typ aus `.meta.json`), Titel aus `custom-title.json`.
- **Sammeln:** `npm run verbrauch:sammeln` (`operations/scripts/claude-verbrauch.mjs`, Logik in
  `operations/lib/claude-verbrauch.mjs`) liest nur lesend und schreibt
  `$TP_PRIVAT_DIR/verbrauch/claude.json` (Schema 1, nicht im Git). Rund 8 s für eine Woche.
  `/api/verbrauch/claude` (nur Inhaber) liefert die Datei; ist sie älter als 30 Minuten, rechnet der
  Server sie im Hintergrund neu (`TP_VERBRAUCH_AUTO=0` schaltet das ab, die Tests tun das).
- **Regeln:** Zeitraum 7 Kalendertage (Berlin). Eine Antwort zählt einmal (`message.id`, auch wenn
  eine fortgesetzte Sitzung sie mitkopiert). Tokens = Eingabe + Cache schreiben + Cache lesen +
  Ausgabe. Klasse: „Gespräch“, „Geplante Aufgabe“ (erster Auftrag kam vom Zeitplan, Name aus
  `<scheduled-task name=…>`), „Subagent“. Aktive Zeit = Summe der Abstände zwischen Anfragen und
  Antworten bis 15 Minuten. Langsitzung = über 2 h aktiv oder über 500 Werkzeugaufrufe der
  Hauptsitzung. Aufgabe = Nummer aus `npm run task -- <aktion> <n>` in der Sitzung oder Branch
  `task/<n>-…`; Branchnamen sonst nicht (dort stehen PR-Nummern).
- **Datenschutz:** Übernommen werden Zahlen, Modellnamen, Denkstufe, Sitzungstitel, Namen geplanter
  Aufgaben und Aufgabennummern – kein Text aus Anfragen, Antworten oder Werkzeugergebnissen.
- **Nicht belegt, deshalb nicht gezeigt:** Stand des Wochenlimits in Prozent (steht in keiner lokalen
  Datei) und die Gewichtung der Tokenarten auf das Limit (nicht veröffentlicht). Die
  Dollar-Angabe `cost-state` in den Protokollen ist ein API-Listenpreis und kein Abo-Verbrauch –
  bewusst weggelassen.

## 22. „Muster nicht verfügbar“: Abschluss in der Zeitleiste und Sperre im Shop (seit 2026-10-16, #1385)

Inhaber 2026-10-16: Hat der Lieferant eine Musterfarbe nicht, wird der Kunde informiert und bestellt bei
Bedarf neue Muster. Bis dahin stand so ein Auftrag nur als Notiz da und blieb in „Muster nachhaken“ und
„beim Lieferanten bestellen“ hängen; die Farbe war im Shop weiter als Muster bestellbar.

- **Schritt** `muster_nicht_verfuegbar` („Muster nicht verfügbar – Kunde informiert“,
  `operations/lib/auftragsverlauf.mjs`): gehört zu `AUFTRAGS_SCHRITTE` und `ERGEBNIS_SCHRITTE`, schließt
  die Musterstrecke ab wie „kein Interesse“ (Positionen auf `erledigt`, Zeitleiste abgeschlossen) – damit
  fällt der Auftrag aus „Muster noch zu bestellen“, den To-dos „Muster bei … bestellen“/„nachhaken“,
  „Muster nachfassen“ und Kunden › „Zu tun“. Die Notiz ist Pflicht (`NOTIZ_PFLICHT`) und nennt die
  Farben: der Server baut sie aus den angekreuzten Mustern („Nicht verfügbar: Produkt: Farbe, …“) plus
  Freitext. Zurücknehmen geht wie bei den anderen Ergebnissen; die Shop-Sperre bleibt davon unberührt.
- **Dialog** „Etwas anderes ist passiert …“ (`ansichten/kunden/zeitleiste.mjs`): Wahl direkt nach
  „Ergebnis: kein Interesse“ mit Hinweiszeile; gewählt erscheinen alle Musterpositionen als Kästchen
  (vorausgewählt) und ein Textvorschlag für die Mail mit „Text kopieren“ und „E-Mail öffnen“ (mailto,
  nichts wird gesendet). Der Text kommt aus der Vorlage des Inhabers (Abschnitt mit „nicht verfügbar“ in
  `muster-nachfassen-texte.md`), sonst aus `NICHT_VERFUEGBAR_VORLAGE` (`lib/muster-nachfassen.mjs`) –
  Farben eingesetzt, ohne Terminversprechen. `GET /api/kunden/muster-texte` liefert ihn als
  `nichtVerfuegbar`, auch wenn die übrige Vorlage fehlt.
- **Sperre im Shop** (`operations/lib/mustersperre.mjs`): Jedes Muster ist eine Variante des Musterprodukts
  `muster-<handle>` mit SKU `M-<Quell-SKU>`; der Musterkonfigurator wertet `variant.available` aus.
  Lesprobe 16.10.: alle 249 Mustervarianten ohne Bestandsverfolgung, `DENY`, Bestand 0 – also immer
  bestellbar. Gesperrt = Bestand 0 (`inventorySetQuantities`, Compare-and-swap, `@idempotent`),
  Richtlinie `DENY`, Verfolgung an (`inventoryItemUpdate`) – in dieser Reihenfolge, erst die Verfolgung
  macht die Sperre wirksam. Vorher: Rechte prüfen (`currentAppInstallation.accessScopes`,
  `write_inventory` + `write_products`; einmal je Prozess bestätigt) und die Variante per SKU frisch lesen
  (nur exakter Treffer, bei Gleichstand die aus `muster-*`). Danach Gegenprobe: `availableForSale` muss
  `false` sein. Nie werden Varianten gelöscht, Preise/SKUs geändert oder das Quellprodukt angefasst.
  Testbestellungen sperren nichts. Muster über das Sammelprodukt „Kostenloses Muster“ haben keine eigene
  Variante je Farbe (`keine-mustervariante`) – sie stehen nur in der Liste.
- **Ablage** `$TP_PRIVAT_DIR/mustersperre.json` (nur anhängen, Teil von `daten:sichern`): je Ereignis SKU,
  Farbe, Produkt, Auftrag, wer, wann, Grund („nicht verfuegbar“ | „wieder verfuegbar“) und
  `shopify {geschrieben, aenderungMoeglich?, fehler, fehlerGrund, variantId, productId, vorher, nachher, verfuegbar}`.
  `geschrieben` bestaetigt die Sperre; `aenderungMoeglich` erfasst auch Teilmutationen und unlesbare
  Gegenproben. Alte unklare Ereignisse, insbesondere mit gespeichertem Vorstand, bleiben pruefpflichtig. Der Stand
  je SKU ergibt sich aus der Folge (`stand()`); `vorher` stammt aus dem ersten Sperr-Ereignis mit bestaetigter oder moeglicher Aenderung.
  Ein ausdruecklich sicher ungeschriebener Versuch friert keinen Vorstand ein; vor einer spaeteren
  echten Sperre zaehlt dann die frisch gelesene Ausgangslage. Dieselbe SKU
  für denselben Auftrag noch einmal = nichts zu tun. Nur eine fehlende Datei gilt als leer; eine
  beschädigte lehnt den Schritt ab (es wird gar nichts geschrieben) und meldet sich im Musterlager.
- **Ohne Recht, ohne Zugang, bei Fehlern** gilt der Schritt trotzdem; die Sperre steht als „im Shop noch
  zu sperren“ samt Grund. Einkauf › Musterlager zeigt dann oben „Im Shop sperren“ mit „In Shopify öffnen“
  (Admin-Link zur Variante, sonst Produktsuche nach der SKU), „Erneut sperren“ und „Wieder verfügbar“.
- **Wieder verfügbar** (Einkauf › Musterlager › „Im Shop gesperrte Muster“) stellt den Stand vor der
  Sperre her: war die Variante ohne Bestandsverfolgung, wird sie es wieder (sonst wäre sie nach der
  nächsten Musterbestellung mit Bestand 1 von selbst wieder gesperrt); war sie verfolgt, kommt die alte
  Menge zurück, mindestens 1. Erfolg verlangt den exakten Zielstand (Verfolgung, Richtlinie und
  Menge am vorhandenen Standort) plus bestaetigte Bestellbarkeit, auch beim Bereits-Pfad. Das gilt
  auch fuer lokal offene Sperren mit moeglicher Shop-Aenderung; fehlender Zugang darf sie nicht
  entfernen. Nur sicher ungeschriebene Versuche lassen sich lokal herausnehmen. Fehlgeschlagene
  Freigaben bleiben mit Fehler in der offenen Liste, der erste Vorstand bleibt fuer Wiederholungen
  erhalten. Eine lokal leere, verfolgte DENY-Variante gilt bei globaler Bestellbarkeit nie als gesperrt;
  weitere Standorte werden dabei nicht automatisch veraendert. Protokoll („Muster wieder verfügbar“), Audit.
- **Endpunkte:** `GET /api/einkauf/mustersperre` (`gesperrt`, `offen`, `fehler`; dieselbe Liste hängt als
  `sperren` an `GET /api/einkauf/musterlager`), `POST /api/einkauf/mustersperre` mit
  `aktion: freigeben | nachholen` und `sku` (Schreibpfad: Rolle „lesen“ 403). Der Schritt selbst läuft wie
  bisher über `POST /api/einkauf/auftragsstatus` (`aktion: "schritt"`, `schritt: "muster_nicht_verfuegbar"`,
  `muster: [lineItemId]`, `notiz`); die Antwort trägt `mustersperre {status, meldung, gesperrt, bereits,
  offen, ohneSku, fehlendeRechte?}`, die Rückmeldung lautet z. B. „Ergebnis: Muster nicht verfügbar ·
  2 Farben im Shop gesperrt“.
- **Tests und Prüfwerkzeug** sprechen nie echtes Shopify (`operations/tests/mustersperre-attrappe.mjs`);
  `dashboard:pruefen` hat keinen Zugang, dort landet jede Sperre unter „Im Shop sperren“.

## 23. „Muster nachfassen“ verschickt automatisch (seit 2026-10-16, Werkbank w-119, Option A)

Inhaber 16.10. (Werkbank w-119): Die Nachfrage nach Mustern geht automatisch vom Firmenpostfach
raus – 4 Tage nach Versand Text 1, 10 Tage später höchstens eine Erinnerung, nie nach Kauf oder
Abmeldung, mit Abmelde-Satz in jeder Mail. WhatsApp und Shopify Messaging waren geprüft und verworfen
(keine Nummern, keine Einwilligungen). Bis dahin war der Versand ein Klick („E-Mail öffnen“, Abschnitt 9a).

- **Wer dran ist**, rechnet unverändert `lib/muster-nachfassen.mjs` (`musterNachfassen()`) aus
  `/api/kunden/bestellungen` samt Zeitleiste – Kaufprüfung, 30-Tage-Grenze und „genau eine Erinnerung“
  stecken dort. Neu: `abgemeldet` (Stoppliste) als dritte Liste und `platzhalterFrei()` als letzte Sperre
  vor dem Versand. `fuelleText()` lässt einen unbekannten Platzhalter im **Betreff** stehen (statt ihn
  stillschweigend zu streichen), damit der Lauf die Mail zurückhält.
- **Der Lauf** `kundenNachfassenSenden({ probe })` in `scripts/dashboard-api.mjs`, aufgerufen von
  `scripts/muster-nachfassen-senden.mjs` (`npm run -s muster:nachfassen`, `-- --probe` = Trockenlauf:
  listen, nichts senden, nichts schreiben). Je Kunde in dieser Reihenfolge: Vermerk `sendet` im
  Versandprotokoll → Mail → `gesendet` → Zeitleisten-Schritt `nachgefasst` (von `automatisch`, Notiz
  „Erste Nachfrage/Erinnerung automatisch per E-Mail: „Betreff““) → `vermerkt`. Bricht der Lauf nach der
  Mail ab, schickt der nächste keine zweite, sondern trägt nur die Zeitleiste nach (`nachgetragen`).
  Übersprungen: Stoppliste, Rückrufwunsch (der Laden ruft an), keine Adresse. Nichts geht raus, wenn die
  Vorlage fehlt (`keine-vorlage`), das Postfach nicht eingerichtet ist (`kein-zugang`), Stoppliste oder
  Protokoll unlesbar sind (`stoerung`) oder ein Platzhalter stehen bliebe (Fehler je Kunde).
  {Name} füllt die `unterschrift` aus dem Postfach, sonst „Ihr Team von Teppich Paradies“.
- **Postfach** `$TP_PRIVAT_DIR/nachfassen/postfach.json` (legt der Inhaber an, `chmod 600`; für andere
  lesbar = es wird nichts verschickt): `host`, `port` (465 → `tls`, 587 → `starttls`), `benutzer`,
  `passwort`, `absender`, optional `absenderName`, `unterschrift`, `kopie`, `kopieImmer`. Versand ohne
  Fremdpaket über `operations/lib/smtp.mjs` (EHLO, STARTTLS, AUTH PLAIN/LOGIN, reiner Text UTF-8 base64,
  Blindkopie nur im Umschlag; `sicherheit: "keine"` nur zu 127.0.0.1 für die Test-Attrappe
  `operations/tests/smtp-attrappe.mjs`). Das Passwort steht in keiner Meldung und keinem Protokoll.
- **Mitlesen**: In den ersten 7 Tagen nach dem ersten echten Versand (`ersterVersandAm`) geht jede Mail als
  Blindkopie an `kopie` (Standard: der Absender, also das Büro); danach nur noch mit `kopieImmer: true`.
  `"kopie": false` schaltet die Blindkopie ganz ab, auch in der ersten Woche (Inhaber 2026-10-19).
  Die Karte zeigt „bis <Datum> mit Kopie an …“.
- **Stoppliste** `$TP_PRIVAT_DIR/nachfassen/stoppliste.json` (`{ eintraege: { "<adresse klein>": { am, von,
  grund, orderId } } }`): Knopf „Abgemeldet“ in der Karte (Rückfrage, dann `POST
  /api/kunden/nachfassen-abmelden` – write-Liste, Rolle „lesen“ 403; wer einträgt, kommt aus der Sitzung).
  Die Antwort trägt den frischen Kartenstand (`stand`), die Karte zeichnet ohne zweiten Abruf neu. Ein
  Kunde auf der Liste erscheint unter „Abgemeldet“ statt „offen“ und wird weder vom Lauf noch per Klick
  angeschrieben. Eine beschädigte Liste stoppt den ganzen Lauf.
- **Versandprotokoll** `$TP_PRIVAT_DIR/nachfassen/versand.json`: `ersterVersandAm`, `letzterLauf {am,
  verschickt, nachgetragen, uebersprungen, fehler, kopie}`, `sendungen[]` (Bestellung, Stufe, Adresse,
  Betreff, Kopie, Status `sendet|gesendet|vermerkt|fehler`, Message-ID; die letzten 500). Ein Fehlversuch
  sperrt nicht – der nächste Lauf versucht es wieder.
- **Karte „Muster nachfassen“** (`ansichten/heute/muster-nachfassen.mjs`): `GET /api/kunden/muster-texte`
  liefert zusätzlich `versand {eingerichtet, hinweis, letzterLauf, mitlesenBis, kopie}` und
  `abgemeldet[]`. Eingerichtet: eine Zeile „E-Mails gehen automatisch vom Firmenpostfach raus (Mo–Sa
  vormittags) · letzter Lauf … · bis … mit Kopie an …“, offene Zeilen sagen „Geht beim nächsten Lauf
  automatisch per E-Mail raus“, „Erledigt – nachgefasst“ ist nicht mehr die Hauptaktion. Nicht
  eingerichtet: Hinweis mit Dateiname, der Laden fasst weiter per Klick nach. Erledigt-Zeilen nennen
  „automatisch per E-Mail“ statt eines Kollegen.
- **„Jetzt senden“** (seit 2026-10-19): Ist das Postfach eingerichtet, hat jede offene Zeile mit
  E-Mail-Adresse den Knopf „Jetzt senden“ (in der ersten Zeile die Hauptaktion). Betreff und Text im
  Textvorschlag sind dann bearbeitbar; Änderungen bleiben je Bestellung und Stufe im Speicher des Tabs,
  bis gesendet wird („Vorschlag wiederherstellen“ verwirft sie). Nach einer Rückfrage mit Empfänger und
  Betreff `POST /api/kunden/nachfassen-senden {orderId, stufe, betreff, text}` → `kundenNachfassenEinzeln()`
  (write-Liste, nur POST, Rolle „lesen“ 403, wer sendet kommt aus der Sitzung). Der Server prüft wie der
  Lauf: Empfänger nur aus den Bestelldaten (eine Adresse aus dem Browser zählt nicht), Stoppliste und
  Protokoll frisch gelesen, Zeile muss noch offen sein und dieselbe Stufe haben (sonst 409 „neu laden“),
  dieselbe Stufe nie zweimal (`schonVerschickt`), Betreff einzeilig ≤ 200 Zeichen, kein `{Platzhalter}`.
  Gleiche Reihenfolge `sendet → gesendet → vermerkt` und dieselbe Kopie-Regel; Zeitleiste „nachgefasst“
  von dem Mitarbeiter, Notiz „… per E-Mail aus dem Control Center: „Betreff““; Protokolleintrag mit `von`.
  Fehler beim Postfach → 502, Protokoll `fehler`, Zeile bleibt offen. Danach lädt die Karte die
  Bestellzeilen neu, die Zeile wandert nach „Erledigt“.
- **Zeitplan**: `operations/launchagents/net.teppich-paradies.nachfassen.plist.vorlage`, Mo–Sa 9:30 aus
  `~/tp-dashboard`, Protokoll `~/teppich-paradies-analyse/nachfassen/versand.log`. Einrichten wie die
  Auslauf-Prüfung (`__HOME__` ersetzen, nach `~/Library/LaunchAgents` kopieren, `launchctl load`) – erst
  nach dem Merge in den Dienst-Checkout und nach einem Trockenlauf von Hand.
- **Tests**: `docs/ai-dashboard/tests/nachfassen-versand-api.test.mjs` (Trockenlauf, echter Lauf gegen die
  SMTP-Attrappe mit Kopie, Zeitleiste, Doppelschutz, Erinnerung ohne Kopie, Platzhalter, abgelehnte
  Anmeldung, kaputte Stoppliste, Rollen am Server), `operations/tests/smtp.test.mjs`,
  `operations/tests/nachfass-versand.test.mjs`, erweitert `tests/muster-nachfassen.test.mjs`.
  Nur erfundene Kunden unter `example.invalid`.
- **Offen**: Die Abmeldung erfasst heute ein Mensch per Knopf, wenn die Antwort „Abmelden“ im Postfach
  liegt; ein Posteingangs-Abgleich ist nicht gebaut. Die rechtliche Einordnung (§ 7 UWG, Mail ohne
  Newsletter-Einwilligung) klärt der Inhaber mit dem Rechtstexter (w-083).

## 24. Zwei-Wege-Abgleich der Bestellungen mit Shopify (seit 2026-10-19, #1419)

Inhaber 2026-10-19: „Gleich alles in unserem Dashboard immer mit Shopify ab, was Bestellungen angeht – dort
synchron arbeiten und abhaken.“ Regeln ohne Datei und ohne Shopify in `operations/lib/shopify-abgleich.mjs`
(`uebernimmAusShopify()`, `abweichungen()`), Anbindung in `scripts/dashboard-api.mjs`, Liste
`ansichten/einkauf/shopify-abgleich.mjs` (auf „Heute“).

**Konfliktregel: „Versendet“ gewinnt in beide Richtungen.** Wer zuerst erfüllt, gilt. Nichts wird automatisch
zurückgenommen – weder hier noch in Shopify (kein `fulfillmentCancel`).

**Shopify → Control Center (automatisch).** Nach jedem neuen Bestellexport (`orders.json`, Größe/Zeit/Inode als
Kennung) wendet der Dashboard-Dienst den Shopify-Stand an: beim ersten Lesen (Einkauf, Bestellungen, Akte,
Statuswechsel) und zusätzlich jede Minute per Zeitgeber, auch ohne offene Seite. Bewusst im Dienst und nicht im
Sync-Dienst: so hat `auftragsstatus.json` genau einen Schreiber; zwischen Lesen und Schreiben steht kein
`await`.
- Position in Shopify vollständig erfüllt (aktuelle Menge > 0, `unfulfilledQuantity` 0) und lokal vor „raus“
  (auch ohne Stand) → `status: raus`, `rausVon: Shopify`, `rausNotiz: „aus Shopify übernommen“`, `rausAm` =
  Zeitpunkt der Sendung laut Shopify, `ausShopify {am, grund, vonStatus, shopifyAm}`, Vermerk
  `shopifyVersand.status: bereits` (`grund: aus-shopify`).
- Schon „raus“/„erledigt“: der Schritt bleibt; ein Vermerk „fehler“/„unklar“/„ausstehend“ oder gar keiner wird
  auf „bereits“ richtiggestellt (der rote Hinweis „Versand nicht gebucht“ fällt dann weg).
- Teilmengen, aus der Bestellung entfernte Zeilen und Exporte ohne Mengen entscheiden nichts. Nie herabstufen,
  „erledigt“ nie überschreiben.
- Stornierte Bestellung: Positionen mit begonnenem Stand werden „erledigt“ (`erledigtNotiz: „In Shopify
  storniert – aus Shopify übernommen“`), Positionen ohne Stand bleiben ohne Eintrag (die Bestellung ist ohnehin
  keine offene Arbeit).
- Hat jemand die Position **nach** der Sendung/Stornierung von Hand zurückgesetzt („Zurück auf offen“) oder
  wieder geöffnet, gilt seine Entscheidung – sonst höbe jeder Lauf sie wieder an.
- Idempotent; Protokoll je Bestellung „Aus Shopify übernommen · #… : N Artikel → An Kunden raus“ (Person
  „Shopify“), Audit `shopify-abgleich`. Eine beschädigte Ablage wird nie überschrieben (Dienstprotokoll
  `[abgleich]`, die Liste meldet den Fehler).

**Control Center → Shopify bei „Erledigt“.** Jeder Weg auf „Erledigt“ – Einzelschritt im Einkauf, Zeitleiste
(Ware „erledigt“, Muster-Ergebnisse „Kunde hat bestellt“/„kein Interesse“/„nicht verfügbar“), „Kunde fertig“
(Bestellliste, Haken auf „Heute“) und „Ohne Einkauf abschließen…“ – bucht die Positionen, die in diesem Klick
erledigt wurden, über denselben `versandBuchen()`-/`bucheVersand()`-Weg wie „raus“ (frisch lesen, Gegenprobe,
Vermerk `shopifyVersand`), **ohne Mail an den Kunden** (`versandMail: false` an der Position, gilt auch beim
Nachholen). Ware und Muster gleich. Ist danach keine Ware der Bestellung mehr offen, geht die Eigenleistung
(Kettelservice) mit. Positionen mit Vermerk gebucht/bereits/übersprungen werden nicht erneut versucht;
Testbestellungen und stornierte Bestellungen bucht Shopify nie. „Ohne Einkauf abschließen…“ schickt seit
2026-10-19 einen Aufruf für alle Artikel (`POST /api/kunden/bestellung-fertig`) statt einen je Artikel – eine
Buchung statt N. Die Antwort trägt `shopify {status, meldung, …}`; die Rückmeldung lautet z. B.
„Status: Erledigt · In Shopify als versendet gebucht (ohne Mail an den Kunden).“

**Rücknahme.** „Wieder öffnen…“ und „Zurück auf offen…“ ändern nur das Control Center. Ist der Versand gebucht,
sagt der Dialog: „In Shopify bleibt die Bestellung als versendet gebucht – das Control Center storniert dort
nichts.“

**Abweichungsliste „In Shopify noch offen“.** Auf „Heute“ (nicht in der Website-Sicht), nur wenn es Zeilen gibt;
je Bestellung eine Zeile mit Artikeln, Stand und Datum, Knopf „In Shopify nachbuchen“ (ohne Mail). Die Zahl im
Kopf ist die Zahl der Zeilen. Gezählt wird: lokal „raus“/„erledigt“, laut Export in Shopify offen, nicht storniert,
keine Testbestellung, Vermerk nicht „übersprungen“, und keine Buchung, die jünger ist als der Export minus
30 Minuten (`EXPORT_NACHLAUF_MS` – die kennt der Export noch nicht). Deckt Altfälle vor dem 13.10. und
gescheiterte Buchungen ab. Endpunkte: `GET /api/einkauf/shopify-abgleich` (alle Rollen, lesend;
`{verfuegbar, fehler, abweichungen: [{orderId, orderName, kunde, lineItemIds, positionen, seit}],
letzterAbgleich}`), `POST /api/einkauf/auftragsstatus` mit `aktion: "shopifyNachbuchen", orderId` (Schreibpfad,
Rolle „lesen“ 403; 409, wenn die Bestellung nicht mehr abweicht). Nachbuchen bucht auch Positionen mit altem
Vermerk „gebucht“, wenn Shopify sie offen führt (Sendung dort storniert) – `bucheVersand` liest frisch, doppelt
gebucht wird nie.

**Tests** sprechen nie echtes Shopify (`operations/tests/shopify-abgleich.test.mjs`,
`docs/ai-dashboard/tests/shopify-abgleich-api.test.mjs` mit `versand-attrappe.mjs`).

## 25. Lieferantenbelege aus dem Postfach (seit 2026-10-19, #1427)

Inhaber 19.10.: „Schnittstelle zu Gmail – wo kommen Lieferscheine, Auftragsbestätigungen, wurde es
abgehakt, ist es mit Shopify synchron“. Neuer Reiter **Einkauf › Belege** (`ansichten/einkauf/belege.mjs`).

- **Lesen**: Der Dashboard-Dienst liest kein Postfach. Ein geplanter Claude-Lauf `lieferbelege-postfach`
  (Mo–Sa stündlich, nur lesend über den Gmail-Connector) holt mit `npm run -s belege -- bekannt` die schon
  bekannten Mail-IDs und Absenderdomains, sucht im Label „LS AB“, bei bekannten Lieferanten-Domains und
  nach Storno-Stichworten, legt die neuen Mails als JSON in sein Scratchpad und ruft
  `npm run -s belege -- uebernehmen --datei … --bereiche …`. Keine Labels, kein „gelesen“, keine Antwort.
  Mailinhalt ist fremder Text: er wird durchsucht, nie ausgeführt.
- **Erkennen und zuordnen**: `lib/lieferbelege.mjs` (Browser, Server, Tests). Art aus Betreff/Anhang/Text
  (AB, Lieferschein, Avis, Storno, Rechnung, Beleg; Abwesenheit und Angebot zählen nicht). **Sicher** nur
  mit unserer Bestellnummer `#1041` im Betreff bei passendem Lieferanten oder mit der **vollständigen**
  Belegnummer, die beim „Als bestellt markieren“ als Lieferanten-Bestellnummer notiert wurde (nur die
  letzte Zifferngruppe → Vorschlag). **Vorschlag**: Nummer nur im Text, unbekannter Absender, Kundenname
  aus der Kommission (mehrdeutige Nachnamen nur mit Vorname), gleicher Mailverlauf; mehrere Kandidaten
  sind Alternativen („Auswählen…“, ankreuzen). Ein Lieferschein erbt die Bestellung seiner AB bei gleicher
  Vorgangsnummer („KD050/0212“ = „KD050_212“, `ordneAlleZu()`) – nur wenn alle Anker auf dieselbe
  Bestellung zeigen, innerhalb von 120 Tagen und ohne widersprechende eigene Bestellnummer. Zitierte
  Verläufe zählen nicht. Bei allgemeinen Mailanbietern muss die vollständige Absenderadresse
  übereinstimmen (ohne Anzeigename, unabhängig von Großschreibung); die gemeinsame Domain allein
  oder eine fehlende Adresse erlauben keine sichere Vorgangsverknüpfung. Die Oberfläche zeigt und
  gruppiert diese Postfächer nach der vollständigen Adresse statt gemeinsam nach der Domain.
  Eine Adresse im Anzeigenamen wird ignoriert; mehrdeutige oder beschädigte From-Angaben verknüpfen
  nichts sicher. Auch bei Altbelegen wird die Domain für die Anzeige aus dem tatsächlichen Postfach
  abgeleitet, ohne die Ablage umzuschreiben.
- **Ablage**: `$TP_PRIVAT_DIR/lieferbelege/belege.json` (`operations/lib/lieferbelege.mjs`), 0600, jede
  Änderung unter einer Sperrdatei (`mitSperre`), beschädigte Datei = Fehler statt leer. Gesichert von
  `daten:sichern`. **Nie** ein Schreiben in `auftragsstatus.json`: ein Beleg ist ein Hinweis, den Schritt
  setzt ein Mensch im Einkauf.
- **API**: `GET /api/einkauf/belege` (alle Rollen) liefert Belege mit Lieferant und Zuordnung, den
  Abgleich je Auftrag × Lieferant (AB, Lieferschein, Stand bei uns, Shopify-Versandstatus, Hinweise
  `storno`, `lieferschein_offen`, `shopify_offen`, `shopify_weiter`) und die Abweichungen.
  `POST` (write-Liste, Rolle „lesen“ 403, Person aus der Sitzung): `zuordnen` (`lieferant` ist **Pflicht**,
  wenn der Absender unbekannt ist und die Bestellung mehrere Lieferanten hat, und muss jede gewählte
  Bestellung beliefern – sonst hängt der Beleg an keiner Zeile), `ablehnen` („Passt nicht“, bleibt gemerkt), `kein_shop`, `loesen`, `erledigt` (mit `orderId`:
  nur für diese Bestellung, `quittiert`), `wieder_offen`, `absender_kein_shop`, `absender_zuruecksetzen`.
  Jeder offene Storno ist eine eigene Abweichung, auch ohne Lieferantenzeile; der Shopify-Stand einer
  Zeile rechnet nur mit den Positionen dieses Lieferanten (offene und bestellte Menge aus dem Export:
  10 bestellt, 5 offen = teilweise versendet). Fehlende oder beschädigte Bestelldaten liefern
  `verfuegbar: false` und einen Fehlerhinweis: ohne diese Quelle gibt es keine gültige leere Arbeitsliste.
  Ein GraphQL-Export muss ein `nodes`-Array enthalten; ein fehlender oder falscher Container gilt
  als beschädigte Quelle. Ein ausdrücklich leeres Bestellarray bleibt ein gültiger Export.
- **Ablage robust** (Codex-Review #1432): nur eine fehlende Datei ist leer; leere oder unvollständige Datei
  = Fehler. Die Sperrdatei trägt Prozess und Kennung; entfernt wird sie nur, wenn sie älter als 30 s ist
  und ihr Prozess nicht mehr lebt – und nur von dem, der die Räum-Sperre `….lock.raeumen` hält –,
  freigegeben nur die eigene. Stichwort-Mails unbekannter Absender werden
  zurückgestellt und erneut geprüft (Unterdomains zählen zum Lieferanten).
- **Anzeige**: „Zu prüfen“ = Storno (rot), Lieferschein ohne Haken (gelb), Vorschläge mit „Ja, gehört
  dazu“ / „Passt nicht“. „Je Auftrag“ = Tabelle mit Chips Alle / Mit Beleg / Passt nicht zusammen.
  „Ohne Shop-Bestellung“ – meist Laden- und Telefonbestellungen (Echtdaten 19.10.: 41 von 52) – nur als
  Zahl, aufklappbar, mit „Zuordnen…“ und „Kein Shop-Lieferant“ je Absender; zählt nicht als Arbeit.
  An bestellten Posten der Lieferantenkarten steht „AB 14.10. · LS 16.10.“. Auf „Heute“ To-dos für
  Storno, Lieferschein ohne Haken und Vorschläge sowie die Zeile „Lieferantenpostfach“ (gelb, wenn
  werktags länger als vier Stunden kein Lauf kam oder der Lauf unvollständig war).
- **Tests**: `docs/ai-dashboard/tests/lieferbelege.test.mjs` (Erkennen, Bezüge, Zuordnung, Vorgang,
  Abgleich, Ablage mit Sperre und beschädigter Datei, API, Rollen am Server) – nur Pseudonyme.
- **Offen**: Anhänge (PDF) liest der Lauf nicht – Nummern nur aus Betreff, Text und Dateinamen. „AB
  fehlt seit N Tagen“ ist bewusst keine Regel, solange die Abdeckung des Postfachs nicht belegt ist.

## 26. Muster-Etiketten drucken (seit 2026-10-20, #1473)

Etikettendrucker Niimbot B1, Etikett 50 × 50 mm (400 × 400 px, 203 dpi, Druckrichtung „top“ –
NiimBlue-Vorgabe). Gedruckt wird direkt aus dem Browser, ohne Installation:

- **Wo:** Kunden › Bestellungen, Musterbestellung aufklappen → „Etiketten drucken“ (alle Muster der
  Bestellung, eins je Stück). Einkauf › Musterlager → „Etikett drucken…“ für ein Etikett von Hand
  (Produktlink, optional Farbe/Serie/Artikelnummer). Beide öffnen denselben Dialog mit Vorschau,
  Druckdichte (1–5, Standard 3) und Verbindung.
- **Direkt im Lexikon (20.10., #1489):** Produkt oder Muster oeffnen → „Musteraufkleber“ →
  Farbe/Ausfuehrung und Anzahl (1–20) waehlen → Vorschau. Der Aufkleber entsteht aus dem aktuellen
  Eintrag, ohne zuvor gespeicherte PNG-Datei. `lib/lexikon-etiketten.mjs` buendelt gleiche SKU/Farbe
  ueber mehrere Breiten; unterschiedliche Shop-SKUs bleiben getrennte Ausfuehrungen. Ein Muster
  laedt das explizit verknuepfte Originalprodukt und ordnet die Quell-SKU exakt zu. Die
  Lieferanten-Artikelnummer ersetzt niemals die Shop-SKU. Der Sammelartikel „Kostenloses Muster“
  fordert die Auswahl des konkreten Produkts. Fehlt eine Farbe, kann eine belegte
  Variantenbezeichnung als Ausfuehrung dienen; reine Masse und „Default Title“ bleiben ausgeschlossen.
- **Automatische Aufkleberpruefung (#1525):** „Aufkleber pruefen“ im Lexikon liest den ganzen
  aktuellen Katalog ueber `GET /api/lexikon/etiketten-status` (angemeldet, alle Mitarbeiterrollen,
  ausschliesslich lesend). Neue Produkte/Farben erscheinen nach jedem Lexikon-Export automatisch;
  keine PNG-Erzeugung, Vormerkung oder dauerhafte Freigabe ist notwendig. Der Export uebernimmt
  Tags, Gutscheinstatus, Farb-/Dekoroptionen und den belegten Basisprodukt-Verweis. Fehlende
  aktuelle Musterregeln werden als ungepruefter Datenstand sichtbar. Zubehoer, ohne-muster,
  Gutscheine und reine Dienstleistungen ohne belegtes Muster werden ausgeschlossen; Laminat,
  Parkett und Kork brauchen auch bei Musteranfrage Aufkleber. Produkte ohne Produktgruppe bleiben
  fachlich offen. Die Ansicht trennt Aufkleber-Ausfuehrungen, eigene Musterartikel und deren
  Quellenzuordnungen; sie behauptet keinen physischen Musterbestand. Fehlende optionale SKU
  wird weggelassen. Nicht hinterlegte technische Eigenschaften werden nicht erfunden.
  Explizite fehlende/mehrdeutige Quellen-IDs oder Quell-SKUs sperren die Zuordnung. Echte
  Einzeldekore ohne Farboption behalten ihren vollstaendigen Produkttitel; Massartikel verwenden
  nur das belegte eigene Muster oder Basisprodukt. Die Uebersicht aktualisiert beim Betreten,
  bei Fokus/Tab-Rueckkehr und alle 30 Sekunden, solange dort niemand tippt.
- **Vorschau und Korrektur:** „Als PNG speichern“ gibt das 400×400-Bild aus. „Angaben bearbeiten“
  ersetzt das ausgewaehlte Etikett (samt identischen Kopien); waehrend des Abrufs bleiben weitere
  Bearbeitung und Druck gesperrt. Fehlende Pflichtangaben oder eine noch nicht geladene QR-Bibliothek
  sperren Druck und Download. SKU bleibt optional und wird bei leerem Wert ausgeblendet. Lange
  Paketetiketten passen die Schrift an, damit keine technische Zeile oder Artikelnummer entfaellt.
- **Gemeinsame Druckliste (#1493):** Im Lexikon Farbe/Ausfuehrung und Anzahl waehlen → „Zum
  Drucken vormerken“. Der Reiter „Gemeinsame Druckliste“ ist die Arbeitsliste fuer den Kollegen
  im Laden. Beide Arbeitsplaetze muessen denselben Dashboard-Dienst verwenden. Die Liste liegt
  zentral in `$TP_PRIVAT_DIR/muster-druckliste.json`, nicht in einer Browserablage. `GET/POST
  /api/lexikon/druckliste` erlauben angemeldetes Lesen bzw. Mitarbeiter-/Inhaber-Aenderungen;
  die Rolle „lesen“ kann nichts vormerken, reservieren oder bestaetigen.
  Der Server erzeugt den unveraenderlichen Etikettstand selbst aus Handle und Auswahlschluessel;
  uebermittelte Texte, SKUs und Personenangaben sind keine Datenquelle. Jede Vormerkung ist ein
  eigener Eintrag. Wiederholte Anfragen mit derselben Vorgangskennung verdoppeln nichts.
  Auswahl zum Druck reserviert genau diese IDs und Revisionen atomar. Ein zweiter Arbeitsplatz
  erhaelt fuer eine veraltete Auswahl einen Konflikt. Spaeter vorgemerkte Mengen werden durch
  den Abschluss des alten Auftrags nicht entfernt. Bis zu 1000 Positionen/5000 Aufkleber je
  Druckauftrag (#1526). Standardmaessig umfasst „Druckvorschau oeffnen“ alle offenen Positionen
  ueber alle Seiten. Erst „Auswahl aendern“ zeigt Haekchen und Sammelentfernen; eine geleerte
  individuelle Auswahl bleibt leer. Einzelne oder
  ausgewaehlte Positionen lassen sich entfernen (je Teil hoechstens 1000 Positionen, unabhaengig
  von der Kopienzahl). Niimbot erhaelt automatisch Teile mit hoechstens 100 Seiten ueber dieselbe
  Verbindung; kein Folgeteil nach abgelehntem `printEnd()`. Die Vorschau zeigt hoechstens 12
  verschiedene Motive mit Kopienzahl, der Druck verwendet einen wiederverwendeten Canvas.
  Fokus/Tab-Rueckkehr und ein 30-Sekunden-Abgleich aktualisieren den gemeinsamen Stand.
  Sichere Vorgangskennungen funktionieren auch auf privaten HTTP-Arbeitsplaetzen.
  Im Produkt bestaetigt die Vormerkung Farbe und Kopien und bietet „Weiteres Muster suchen“
  sowie „Druckliste oeffnen“. Die Vorschau enthaelt den ausdruecklichen Druckstart und nach
  vollstaendigem Transport die Papierbestaetigung im selben Fenster; Druckereinstellungen sind
  eingeklappt. Nach Druck/Download bleiben die Eintraege „in Druck“, bis jemand den Ausdruck
  geprueft und ausdruecklich als gedruckt markiert hat. Direkt vor dem ersten Hardwarebefehl,
  nach der asynchronen Druckerwahl, werden Auftrag und Revisionen frisch gelesen und geprueft.
  Schliessen vor jedem Druckversuch gibt die Reservierung bestaetigt frei. Ab dem Druckklick
  bleibt der Versuch auch beim erneuten Oeffnen vermerkt; Abbruch, Fehler oder Neustart loeschen keinen Auftrag.
  Sitzungsende und Tab-Schliessen versuchen keine unzuverlaessige automatische Freigabe;
  Wiederfreigeben ist eine bewusste Aktion mit Hinweis auf moegliche bereits gedruckte Etiketten.
  Die gemeinsame Vorschau bietet keine Textkorrektur, damit der bestaetigte Stand eindeutig ist.
  Private Ablage mit exklusiver Schreibsperre, atomarem Austausch und Rechten `0600`; nur eine
  fehlende Datei ist leer, beschaedigte Daten werden nicht ueberschrieben. Sicherung und
  Browser-Datenkopie enthalten die Datei. Erledigte/entfernte Eintraege bleiben fuer Verlauf und
  Wiederholungsschutz erhalten. Es gibt keinen automatischen Hardwaredruck oder Shopify-Schreibzugriff.
- **Musterbestellungen intern zuordnen (#1506):** Kunden › Bestellungen zeigt bei Musterauftraegen
  den Einstieg „Musteraufkleber ansehen“. Die aufgeklappte Bestellung zeigt Produkt, Farbe,
  echte Shop-SKU, offene Aufklebermenge und Drucklistenstand je Bestellposition. „Aufkleber zur
  Druckliste vormerken“ uebernimmt sie gemeinsam. `GET/POST /api/kunden/musteretiketten` sind nur
  im privaten, angemeldeten Dashboard erreichbar; die Rolle „lesen“ darf ansehen, nicht vormerken.
  Der Browser sendet nur Bestellkennung und Vorgangskennung. Der Server liest Bestellmodell und
  Lexikon ohne Shopify-Schreibzugriff oder Statusabgleich. Eine belegte Quellvarianten-ID hat
  Vorrang vor alten Muster-SKUs; fehlende, veraltete oder mehrdeutige Zuordnungen sperren die
  Vormerkung. Unbekannte Mengen werden nicht als ein Stueck angenommen oder still gekuerzt.
  Pro Quelle `[orderId,lineItemId]` gibt es genau einen unveraenderlichen Drucklisteneintrag,
  auch bei Neuladen oder zwei Arbeitsplaetzen. Gleiche SKU auf zwei Positionen bleibt getrennt.
  Die erste Vormerkung verwendet die offene Menge; die bestellte Gesamtmenge bleibt als stabiler
  Vergleich erhalten. Bereits vorgemerkte, reservierte, gedruckte oder entfernte Positionen werden
  nicht erneut angelegt. Geaenderte Produktdaten oder Bestellmengen verlangen eine bewusste Pruefung;
  ein Konflikt schreibt keinen Teilauftrag. Stornierte, vollstaendig versendete oder lokal als
  „An Kunden raus“ markierte Muster erhalten keine neuen Vormerkungen. Vor einer Druckreservierung
  prueft der Server die verknuepfte Bestellung erneut. „Geliefert“ vom Lieferanten sperrt nicht.
  Die optionale `quelle` steht ausschliesslich neben dem Etikett in der privaten Drucklistenablage.
  Sie enthaelt Bestell-/Positionskennung, Bestellnummer und Bestellmenge, keinen Kundennamen.
  Die Druckliste verlinkt intern zur Bestellung; Canvas, PNG und QR bekommen nur Produktdaten.
  Der bewusste Direkt-/Nachdruck verwendet dieselbe kanonische Zuordnung und die bestellte
  Gesamtmenge, veraendert aber keinen Drucklistenstatus. Es gibt keine Aenderung an Shopseiten,
  Kundenkonto, Bestellmails, Bestellmetafeldern oder Kundenbelegen.
- **Inhalt:** Absender `www.teppich-paradies.net`, Serie, Farbe, bei Paketware (Lexikon-Eigenschaft
  `qmProPaket`) Art, Stärke/Nutzschicht, Nutzungsklassen, Format und daneben der QR-Code, sonst der
  QR-Code größer in der Mitte; unten „Art.-Nr.“ mit der SKU der echten Variante (nie die
  Muster-SKU `TP-MUSTER-…`/`M-…`). Daten aus der Bestellposition und dem Produktlexikon
  (`/api/lexikon/produkt`, nur lesend); fehlt etwas, bleibt es leer und die Vorschau sagt „fehlt: …“.
  `lib/muster-etiketten.mjs` (rein, getestet), `bausteine/etiketten-druck.mjs` (Canvas, Drucker).
- **Lexikon:** `nutzschicht`, `format` (`custom.format_cm`) und `arten` sind seit diesem Stand Teil
  der Lexikon-Eigenschaften; sie erscheinen nach dem nächsten Lexikon-Export.
- **Verbindung:** Web Bluetooth (Hauptweg, `NiimbotBluetoothClient`), USB-Kabel per WebSerial als
  Ausweg. Beides nur in **Chrome/Edge** und nur in einem sicheren Kontext: `https://…` oder
  `http://localhost`/`127.0.0.1`. Über `http://<IP>:8001` im Firmennetz geht es nicht – dann die
  Tailscale-Adresse `https://<name>.ts.net` nehmen (Abschnitt 1d). Der Dialog sagt das selbst.
  „Drucker verbinden“ (#1540) erlaubt die Geraeteauswahl und Verbindung vor dem Druckstart.
  Der Verbindungstest erzeugt keinen Druckauftrag, sendet keine Etiketten und setzt weder
  Druckversuch noch Papierbestaetigung. Der spaetere ausdrueckliche Druckklick verwendet die
  bestehende Verbindung; die Auftragspruefung bleibt direkt vor der Hardwareausgabe erhalten.
  Reines Verbinden behaelt die Freigabe beim Schliessen einer ungedruckten Vorschau bei.
  Abgebrochene oder verspaetete Geraeteauswahl darf nach Schliessen/Sitzungsende keine
  Verbindung im Nachfolgedialog hinterlassen. Zum Wechseln der Verbindungsart zuerst trennen.
  Ein alter Verbindungsversuch bleibt bis zum Abschluss seiner Bereinigung global gesperrt;
  ein neues Vorschaufenster darf waehrenddessen weder verbinden noch drucken.
- **Desktop-App starten (#1540):** `scripts/dashboard-app-starten.sh` oeffnet ein eigenes
  Chrome-/Edge-App-Fenster mit `http://localhost:8001` auf dem Dashboard-Mac. Der Starter
  prueft bzw. weckt dort den bestehenden Hintergrunddienst und protokolliert wie der bisherige
  Betriebsstarter. Das installierte App-Symbol delegiert an diesen gemeinsamen Starter.
  `TP_DASHBOARD_APP_URL` darf fuer andere Rechner dieselbe Zentrale per HTTPS angeben;
  eine entfernte Adresse weckt keinen lokalen Dienst. LAN-HTTP wird abgelehnt, Browser-
  Sicherheitspruefungen bleiben aktiv. Der private `start-dashboard.sh`, `einrichten.sh` und
  die betriebseigenen Commits werden nicht ersetzt. Browser/App nutzen dieselbe gemeinsame
  Datenablage; ein Verbindungsstatus ist weiterhin kein physischer Drucknachweis.
- **Fremdcode:** `@mmote/niimbluelib@0.47.1` (UMD) und `qrcode-generator@1.4.4` werden erst im Dialog
  von cdn.jsdelivr.net geladen, fest gepinnt mit SRI-Prüfsumme. Ohne Internet: Vorschau ohne QR,
  Drucken nicht möglich.
- **Offen:** Hinweis „auch als Klickvinyl“ (gleicher Dekor in anderer Art) – nur mit belegbarer
  Zuordnung, noch nicht gebaut.
