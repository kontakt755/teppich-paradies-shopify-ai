# Control Center – Fortschritt

Format je Inkrement: Änderung · Test · offene Risiken/Annahmen · nächste Stufe.

## 2026-09-08 · Phase A: Bestandsaufnahme

- **Geändert:** `BESTANDSAUFNAHME.md`, `ARCHITEKTUR.md`, Screenshots des Ist-Zustands
  (`screenshots/ist-*.png`), Launch-Konfiguration `dashboard-static` (Port 8001 war lokal belegt).
- **Getestet:** Screenshots über Puppeteer gegen `npm run dashboard:serve`; GitHub-Zugang (`gh auth status`)
  und Issue-Struktur (#34, #41, #42, #55, #92) geprüft; `gh api …/pages` meldet `errored`.
- **Risiken/Annahmen:** Repo ist öffentlich; Owner-Feld = Assignee (Annahme, rückgängig machbar);
  neue Status-Labels erst nach Freigabe.
- **Nächste Stufe:** Inkrement 1 – testbares Datenmodell (`lib/model.mjs`).

## 2026-09-08 · Inkrement 1: Datenmodell

- **Geändert:** `docs/ai-dashboard/lib/model.mjs` (Statusmodell mit Mapping und Übergangsregel,
  Body-Parser, Task-Normalisierung, Triage-Lücken, Dringlichkeits-Score mit Gründen, Übergänge mit
  Pflichtangaben, Label-Änderungen, gespeicherte Ansichten, Kennzahlen, Bereichszustand, Datenfrische);
  `docs/ai-dashboard/tests/model.test.mjs`; `npm run dashboard:test`, in `npm test` eingehängt.
- **Getestet:** 11 Tests grün (`npm run dashboard:test`), u. a. mit den echten Body-Formaten aus #34, #42, #41.
- **Risiken/Annahmen:** Score-Gewichte sind eine erste Setzung und in `ARCHITEKTUR.md` dokumentiert;
  „Owner" = GitHub-Assignee.
- **Nächste Stufe:** Inkrement 2 – `issues.json` Schema 2 mit den neuen Feldern und Sync-Status.

## 2026-09-08 · Inkrement 2: issues.json Schema 2

- **Geändert:** `scripts/build-dashboard-data.mjs` exportiert testbare Funktionen, schreibt `schema: 2`
  mit `fields` (extrahierte Body-Felder, kein Volltext), `assignees`, `comments`, `sync.labelsAvailable`;
  atomarer Schreibvorgang (tmp + rename), bei Abruffehler bleibt die alte Datei stehen und Exit 1.
  Parser: Checklisten ohne Überschrift und „Soll-Zustand"/„Aufgabe"/„Auftrag" erkannt.
- **Getestet:** 15 Tests grün; echter Lauf gegen das Repo: 30 Issues, 23 mit Checkliste,
  Blocker bei #34 erkannt, Ausführende (Codex, ChatGPT Work, Ahmet) aus `## Worker`.
- **Risiken/Annahmen:** Alte Felder unverändert, das bestehende Frontend liest die Datei weiter.
  Kein Issue hat bisher eine `Frist` – Fälligkeitslogik greift erst mit dem neuen Template.
- **Nächste Stufe:** Inkrement 3 – neues Frontend.

## 2026-09-08 · Inkrement 3: Neues Frontend

- **Geändert:** `docs/ai-dashboard/index.html`, `app.css`, `app.js` ersetzen die monolithische Seite.
  Navigation Heute / Arbeit (Liste + Kanban) / Freigaben / Bereiche / Insights / Aktivität, Command
  Palette (⌘K, `/`), Aufgaben-Detail als Sheet mit Deep Link (`#/arbeit?task=42`), Statusband mit
  Links auf vorgefilterte Ansichten, „Braucht jetzt Aufmerksamkeit" mit Gründen, Blocker mit Grund und
  Alter, Systemgesundheit (Datenstand, Sync-Workflow über die öffentliche Actions-API, Modus, fehlende
  Labels, KI-Läufe), gespeicherte Ansichten, Filter, Sortierung, Triage-Lücken, Tastatur (j/k/Enter/Esc),
  Dark Mode, responsive. Statischer Modus ist read-only und führt zu GitHub; Aktionsdialoge erscheinen
  nur, wenn `/api/capabilities` Aktionen meldet. `serve-dashboard.mjs` liefert `.mjs` als JavaScript.
- **Getestet:** Puppeteer-Screenshots aller Ansichten ohne JS-Fehler (`screenshots/neu-*.png`),
  Browser-Konsole geprüft; Modelltests grün.
- **Risiken/Annahmen:** Die Actions-API wird ohne Token abgefragt (öffentliches Repo, 60 Anfragen/Std.);
  bei Nichtverfügbarkeit wird das ehrlich als „nicht abrufbar" gezeigt. Keine KPIs, bewusst.
- **Nächste Stufe:** Inkrement 4 – lokaler Server mit validierten Statuswechseln.

## 2026-09-08 · Inkrement 4: Lokaler Aktions-Server

- **Geändert:** `scripts/dashboard-api.mjs` (neu) und `scripts/serve-dashboard.mjs`: `/api/capabilities`,
  `/api/sync`, `/api/activity`, `/api/agent-runs`, `/api/tasks/:n/activity|transition|assign|comment`.
  Übergänge werden **serverseitig** mit denselben Regeln wie im Browser geprüft (`requirementsFor`),
  Labels/Assignee/Kommentar/Schließen laufen über `gh` unter dem angemeldeten Konto, jeder Schreibvorgang
  erzeugt einen strukturierten Kommentar (`## Control Center: …`, Marker `tp-control-center`), ein lokales
  Audit-Log (`.router/control-center-audit.jsonl`, gitignored) und eine Neuerzeugung von `issues.json`.
  Schreibende Endpunkte: nur POST, nur JSON, nur lokaler Host/Origin, 64 KB. Server bindet 127.0.0.1.
  KI-Läufe der Steuerzentrale und das Provider-Ledger werden read-only gelesen.
- **Getestet:** 27 Tests grün (API mit Fake-gh: Ablehnung ohne Owner, Label-Übergangsregel, Freigabe
  entfernt Legacy-Marker, Erledigt nur mit Bestätigung, Origin-/Methoden-/Content-Type-Schutz).
  Manuell gegen das echte Repo: `capabilities` (angemeldet), `tasks/92/activity` (Events + Kommentare),
  `transition` ohne Owner → 400 mit Klartext. **Kein echter Schreibzugriff ausgeführt** (öffentliches Repo,
  Freigabe nötig); Dialog im Browser bis zur Validierung geprüft.
- **Risiken/Annahmen:** Ein Nutzer = das gh-Konto des Macs; Rollen darüber hinaus sind Stufe 2
  (`ARCHITEKTUR.md` Abschnitt 5). Die Steuerzentrale hat auf diesem Rechner keinen State-Ordner,
  deshalb „0 Läufe" – ehrlich angezeigt.
- **Nächste Stufe:** Inkrement 5 – Freigabe-Vorlage.

## 2026-09-08 · Inkrement 5: Freigabe-Workflow

- **Geändert:** Issue-Template `.github/ISSUE_TEMPLATE/entscheidung.yml` (Frage, Kontext, Optionen,
  Empfehlung, Auswirkungen, Entscheider, Frist), `setup-dashboard.sh` legt die neuen Labels an
  (`status:triage|bereit|freigabe|beobachten|abgebrochen`, `type:entscheidung`) – **nicht ausgeführt**.
  Freigaben-Ansicht mit Aktionen freigeben / ablehnen / Rückfrage / delegieren / später, die als
  Statuswechsel bzw. Kommentar protokolliert werden; Verlauf abgeschlossener Entscheidungen.
- **Getestet:** Parser-Tests für Entscheidungsvorlagen; Ansicht mit den drei echten Freigaben (#42, #41, #38).
- **Risiken/Annahmen:** Bis zur Label-Anlage werden Freigaben über die Übergangsregel erkannt.
- **Nächste Stufe:** Labels anlegen (Freigabe), GitHub Pages prüfen, dann Rollenmodell und erste
  read-only-Integration (Shopify) nach Sichtbarkeitsentscheidung.

## 2026-09-08 · Inbetriebnahme

- **Geändert:** PR #100 nach `main` gemergt. Labels `status:triage|bereit|freigabe|beobachten|abgebrochen`
  und `type:entscheidung` im Repository angelegt; #42, #41, #38 von der Übergangsregel auf `status:freigabe`
  umgestellt. `docs/.nojekyll` beendet den hängenden Jekyll-Build von GitHub Pages; Manifest auf das
  Control Center angepasst.
- **Getestet:** Workflow `dashboard-data` nach dem Merge: success, `issues.json` mit Schema 2 und allen
  Labels; Pages-Build: built; Live-URL liefert `index.html`, `app.js`, `lib/model.mjs` (JavaScript-MIME)
  und `issues.json`; Live-Screenshots ohne JS-Fehler (`screenshots/live-*.png`).
- **Offen:** Owner (Assignee) für die aktiven Aufgaben setzen – das ist eine fachliche Zuordnung, keine
  technische; Freigabe-Issues mit Optionen und Empfehlung nachtragen (Template „Entscheidung");
  Sichtbarkeitsentscheidung vor Kennzahlen-Integrationen.

## 2026-09-08 · Inkrement 6: Owner, Selbstaktualisierung, Task-Automation

- **Geändert:** Alle 24 offenen Aufgaben haben Ahmet (`kontakt755`) als Owner. Sync-Cron auf 30 Minuten
  (Events bleiben sofort). Neu: `.github/workflows/task-automation.yml` + `scripts/task-automation.mjs`
  (Eingang bei neuen Issues mit Typ/Bereich-Vorschlag, In Arbeit bei referenzierendem PR, Review bei Merge,
  Erledigt beim Schließen; jede Änderung als Kommentar mit Marker `tp-automation`, Bot-Ereignisse lösen
  keinen zweiten Lauf aus). Neu: `npm run task` (create/start/review/done/block/approve-request/comment/list)
  über dieselbe validierte Aktions-API; CLAUDE.md verpflichtet KI-Sessions dazu.
- **Getestet:** 33 Tests grün (Planung je Ereignis, Idempotenz, kein Zurücksetzen aus Review, Draft-PRs
  ignoriert, CLI-Argumente). Live: `npm run task -- list` zeigt 24 Aufgaben, `done 92` wird mit Klartext
  abgelehnt (Owner vorhanden, aber keine Bestätigung der Akzeptanzkriterien).
- **Risiken/Annahmen:** Automatik setzt nie Priorität, Owner oder schließt Issues; Typ/Bereich sind
  Vorschläge. Bei 30-Minuten-Cron ca. 600 Actions-Minuten/Monat (Free-Kontingent 2000).
- **Live-Nachweis:** PR #101 gemergt; `npm run task -- create` legte #102 an (Owner kontakt755, Eingang);
  Workflow `task-automation` lief für das Issue-Event und das PR-Event erfolgreich.

## 2026-09-08 · Freigaben entschieden und umgesetzt

- **Geändert:** `npm run task -- approve|reject` (Entscheidung protokolliert, Status → Bereit bzw. Abgebrochen).
  Freigaben #42 (Option 2), #41 (Option 1), #38 (Option 1+2) per CLI erteilt, umgesetzt und geschlossen;
  Folgeaufgabe #103. Shopify: 7 Sockelleisten aus der manuellen Kollektion Teppichboden entfernt, zwei
  ungenutzte Menüs gelöscht (Sicherung als Kommentar in #38). Merchant Center über Chrome geprüft.
- **Getestet:** 34 Tests grün; Read-back Kollektion 58 → 51, Menüliste ohne Alt-Menüs, Merchant Center
  225 = Shopify-Kanal 225, Suchen ohne Rollenware-Treffer.
- **Befund zur Vorlage:** Unterkategorien laufen über `custom.arten`, nicht `shopify.pile-type` – in #41
  korrigiert protokolliert.

## 2026-09-08 · #103 Teppichboden-Art mit Herstellerbeleg

- **Geändert (Shopify):** `custom.arten` = [Schlinge, Wolle] für Rubira, Nordica, Callista, Wovena; Beleg sind
  die Datenblätter der Hausmarke von A (TTD_WOOL-030-*.PDF, 01|2026) von Lieferant A. Datenblatt-Polhöhen decken sich mit den
  vorhandenen Florhöhen-Klassen. Vorgehen in der Memory-Notiz „Datenblätter von Lieferant A lesen" festgehalten.
- **Getestet:** Read-back der Metafelder; Rubira sofort in Schlinge + Wolle, restliche folgen mit der
  asynchronen Neuberechnung der automatischen Kollektionen.

## 2026-09-22 · Einkauf-Bereich (Bestellübersicht + Produktdaten-Status)

- **Geändert:** Neuer Tab „Einkauf" im Frontend (`docs/ai-dashboard/app.js`, `index.html`) mit drei
  Unteransichten: Bestellübersicht (offene Kundenbestellungen je Lieferant, Ampel, Kopier-Button für
  Bestelllisten, Muster getrennt), Produktdaten-Status (je Produktgruppe vollständig/offen, durchsuchbare
  und paginierte Liste offener Varianten mit Grund und nächstem Schritt) und eine kurze Hilfe-Seite.
  Neue lokale Endpunkte in `scripts/dashboard-api.mjs` (`einkaufBestellungen`, `einkaufProduktstatus`,
  `einkaufKlaerung`) und Routing in `scripts/serve-dashboard.mjs` (`/api/einkauf/*`, GET-only). Die
  Endpunkte lesen ausschließlich private Dateien unter `$TP_PRIVAT_DIR` (Standard
  `~/teppich-paradies-analyse`): `bestelluebersicht/orders.json` (über `operations/lib/bestelluebersicht.mjs`
  `aufbereiten()`), `einkauf-dryrun/plan.json` (serverseitig zusammengefasst und paginiert, ~11 MB/3.300
  Varianten), `einkauf-klaerung/klaerung.json`/`offen.json` (optional). Fehlende Dateien sind kein Fehler,
  nur ein leerer Zustand mit Hinweistext.
- **Getestet:** `npm run dashboard:test` (neue Fälle mit synthetischen Fixtures für alle drei Endpunkte,
  inkl. fehlender Dateien), `npm run control:center:test`, `npm test`. Manuell mit echten privaten Dateien
  gegen `npm run dashboard` bei 1366 px und 390 px geprüft (Screenshots unter
  `~/teppich-paradies-analyse/dashboard-einkauf/`, nicht im Repository); statischer Modus (GitHub Pages,
  kein `/api`) zeigt „Nur lokal im Betrieb verfügbar" ohne jeden Datenzugriff.
- **Offene Risiken/Annahmen:** „Vollständig" ist über drei Kernfelder definiert (Lieferant, Artikelnummer,
  Bestelleinheit); Farbnummer fließt nicht in die Kennzahl ein, erscheint aber als offenes Feld, wenn sie
  fehlt. `einkauf-klaerung/` ist beim Team noch nicht befüllt – Endpunkt liefert bewusst `verfuegbar:false`.
- **Nächste Stufe:** Sobald `einkauf-klaerung/klaerung.json`/`offen.json` regelmäßig exportiert werden, in
  der Produktdaten-Status-Ansicht ergänzen statt eines eigenen dritten Tabs.

## 2026-09-23 · Startbereich „Heute" mit Einkauf und Shop-Zahlen

- **Geändert:** `viewHeute()` in `docs/ai-dashboard/app.js` bekommt zwei neue, nur lokal befüllte Kacheln
  unter dem bestehenden Aufgaben-Teil: „Einkauf – heute zu tun" (Positionen zu bestellen, offene
  Musterbestellungen, Aufträge mit Problem aus der Ampel, ohne Großhändler-ID, sowie die Positionen je
  Schritt des Auftragsflusses Bestellt → Geliefert an uns → An Kunden raus → Erledigt sowie die konkreten
  Problem-Aufträge) und „Shop-Zahlen" (Bestellungen, Umsatz, Durchschnittsbon der letzten 7 und 30 Tage).
  Jede Kachel klickt in den zugehörigen Bereich (`#/einkauf`) durch. Neuer Endpunkt
  `einkaufKennzahlen()` in `scripts/dashboard-api.mjs`, geroutet über `/api/einkauf/kennzahlen`
  (GET-only) in `scripts/serve-dashboard.mjs`. Erwartetes Snapshot-Format:
  `kennzahlen/shop-snapshot.json` unter `$TP_PRIVAT_DIR` mit
  `{erstellt, zeitraeume: {"7": {bestellungen, umsatz, waehrung, durchschnitt}, "30": {...}}, topProdukte: [...]}`.
  Fehlt die Datei (noch kein Export eingerichtet), zeigt die Kachel den Hinweis samt Befehl statt
  erfundener Zahlen. Offene Inhaberentscheidungen (Freigaben/Review) waren bereits Teil von „Heute"
  (Band-Kachel „warten auf Freigabe", Abschnitt „Wartet auf dich") und wurden nicht verändert.
- **Getestet:** `npm run dashboard:test` (zwei neue Fälle für `einkaufKennzahlen`: fehlender Export mit
  Befehl, vorhandener Export mit Zahlen; ein neuer Server-Test für `/api/einkauf/kennzahlen` GET-only),
  `npm run control:center:test`, `npm test`. Manuell mit echten privaten Dateien gegen `npm run dashboard`
  bei 1366 px und 390 px per Puppeteer geprüft (Screenshots unter
  `~/teppich-paradies-analyse/dashboard-heute/`, nicht im Repository), Konsole ohne Fehler, Klick von der
  Einkauf-Kachel zu `#/einkauf` geprüft.
- **Offene Risiken/Annahmen:** `kennzahlen/shop-snapshot.json` wird noch von niemandem erzeugt – der
  Export selbst (`npm run kennzahlen:export`) ist nicht Teil dieser Änderung und muss noch gebaut werden.
  `einkauf-klaerung/offen.json` enthält in der Praxis ~17.000 Zeilen aus dem Produktdaten-Abgleich, nicht
  auftragsbezogene Klärungsfälle – deshalb bewusst nicht in „Heute" gezeigt, um keine irreführende Zahl
  anzuzeigen; das Format müsste erst geklärt werden, bevor es auf der Startseite erscheint.
- **Nächste Stufe:** Export-Skript für `kennzahlen/shop-snapshot.json` bauen (z. B. aus der Shopify Admin
  API, Analytics-Query), dann läuft die Shop-Zahlen-Kachel produktiv.

## 2026-09-23 · Automatische Datenaktualisierung

- **Geändert:** `operations/scripts/aktualisieren.mjs` (neu, `npm run daten:aktualisieren`, Teile
  lexikon/bestellungen/kennzahlen einzeln ausführbar über `--nur`, Fehler in einem Teil verhindert die
  anderen nicht, schreibt `$TP_PRIVAT_DIR/aktualisierung.json`); `operations/scripts/lexikon-export.mjs`
  und `kennzahlen-export.mjs` (`ladeLive` nutzt jetzt `operations/sync/zugang.mjs`, liest also `.env.local`
  statt nur `process.env` - Kennzahlen-`ladeLive` rief zuvor `fetchOrdersSince` ohne Proxy auf, das ist mit
  behoben); `scripts/dashboard-api.mjs` (`aktualisierung()`, liest die Statusdatei, rechnet Alter und
  24h-Schwelle); `scripts/serve-dashboard.mjs` (`/api/aktualisierung`); `docs/ai-dashboard/app.js`
  (`ensureAktualisierung()`, `aktualisierungHealth()` in der Kachel "Systemgesundheit" auf "Heute" und
  "Insights", nur im lokalen Modus).
- **Getestet:** `operations/tests/aktualisieren.test.mjs` (Teilausführung, Fehler in einem Teil ohne
  Auswirkung auf die anderen, alter Stand bleibt bei `--nur` erhalten, erster Lauf ohne vorhandene Datei);
  `docs/ai-dashboard/tests/api.test.mjs` (fehlende Datei, Alters-/Veraltet-Berechnung, fehlender Zeitpunkt
  wirft nicht); `npm run dashboard:test`, `npm run control:center:test`, `npm test`,
  `node --test operations/tests/*.test.mjs` - alle grün.
- **Risiken/Annahmen:** `--live` braucht `SHOPIFY_ADMIN_TOKEN` oder `SHOPIFY_CLIENT_ID`/`SECRET` in
  `.env.local`; ohne Zugang bricht jeder Teil mit klarer Meldung ab, es werden keine Zahlen erfunden.
  "Letzte 50 Bestellungen" wird über ein 120-Tage-Fenster geholt und dann auf die 50 zuletzt
  aktualisierten gekürzt (kein direkter "letzte N"-Filter in der Admin API). Tägliche Automatisierung läuft
  über eine geplante Aufgabe in Claude Desktop auf einem eingeschalteten Rechner - kein Cloud-Cron; war der
  Rechner aus, bleibt der Stand einfach älter, sichtbar über die 24h-Warnung.
- **Nächste Stufe:** geplante Aufgabe tatsächlich anlegen (`~/.claude/scheduled-tasks/`) und einmal live
  gegen die Admin API laufen lassen, sobald ein Token vorliegt.

## 2026-09-23 · Design und Übersicht (#536)

- **Geändert:** `docs/ai-dashboard/index.html`, `app.js`, `app.css`; `operations/lib/kennzahlen.mjs`
  (neues Feld `kostenlos` je Zeitraum) samt Test.
  - Navigation nach Wichtigkeit: Heute · Einkauf · Arbeit · Lexikon, der Rest unter „Mehr" (trägt die
    Freigaben-Zahl mit). Datenstand-Chip nur noch „Stand HH:MM", Details im Tooltip.
  - Heute: Doppelungen entfernt (die Kundengeschäft-Zahlen standen zweimal), vier Zahlen zum Einkauf,
    darunter nur „Zuerst klären". Shop-Zahlen als kleine Tabelle; „Umsatz 0 €" wird erklärt (alle
    bezahlten Bestellungen waren kostenlose Muster – kein Datenfehler). Interne Kacheln mit 0 fallen
    weg. Systemgesundheit erscheint nur bei echten Warnungen; dauerhafte Hinweise (Ads/GA4 nicht
    angebunden) haben das Level `info` und zählen nicht mehr als Warnung.
  - Einkauf: Klartext statt Shopify-Rohwerten (`PAID`, `UNFULFILLED`, `UNGEKLAERT`), Aufträge zeigen nur
    Abweichungen. Muster-/Warengruppen ohne zugeordneten Lieferanten sind nur noch gelb markiert, wenn
    einem Artikel wirklich etwas fehlt. Tabellen von 9 auf 6 Spalten. Erledigte Artikel verschwinden aus
    der Standardansicht (Filter „Erledigt"). Neu: „Ohne Einkauf abschließen…" (Pflichtgrund) setzt die
    offenen Artikel eines Auftrags auf „Erledigt" – für Testbestellungen; Shopify bleibt unverändert.
    Aufträge, deren Artikel alle erledigt sind, zählen nicht mehr als offen oder als Problem.
  - Produktdaten: Standardliste „Braucht Handarbeit" (dieselbe Zahl wie die Kachel), 25 je Seite,
    Begründung im Tooltip; Seite wird von 23.000 auf rund 3.000 px kürzer.
  - Arbeit: Spalten ohne Unterschied (z. B. Owner bei nur einer Person) fallen weg; der Standardtext
    „Triage: Priorität, Owner …" wird ausgeblendet; Projekte mit ≥3 Aufgaben ohne Update seit 14 Tagen
    stehen eingeklappt als eine Zeile.
  - Freigaben: ohne hinterlegte Optionen ist „Rückfrage stellen" die Hauptaktion; Delegieren/Später
    unter „Mehr". Aktivität: Ereignisse je Person und Aufgabe innerhalb von drei Minuten gebündelt,
    Labels in Klartext. Lexikon: startet mit der Suche.
  - Behoben: Kopfzeile war am Handy breiter als der Bildschirm (seitliches Scrollen); „Heute" zeichnete
    nach dem Laden der Bestelldaten nicht neu; App-Manifest wurde im Netzmodus ohne Sitzungscookie
    angefragt (Konsolenfehler).
- **Getestet:** `npm run dashboard:test`, `node --test operations/tests/kennzahlen.test.mjs`, `npm test`;
  Puppeteer gegen eine lokale Instanz mit **Kopie** der privaten Daten (Desktop 1440 px, Handy 390 px,
  keine JS-Fehler, kein seitliches Scrollen); Klickstrecke: Auftrag ohne Einkauf abschließen
  (Problemzahl 2 → 1), Artikel als bestellt markieren mit Bestellnummer, Filter, Mehr-Menü,
  Freigabe-Aktionen, Projektgruppe aufklappen, Aufgaben-Detail, Lexikon-Suche, Produktdaten blättern
  und Filterwechsel.
- **Risiken/Annahmen:** „Ohne Einkauf abschließen" nutzt den bestehenden Auftragsfluss-Endpunkt
  (Status `erledigt` + Notiz); rückgängig über die Statusdatei, nicht über die Oberfläche. Das Feld
  `kostenlos` erscheint erst nach dem nächsten Kennzahlen-Export; bis dahin fällt die Erklärung auf den
  allgemeinen Satz zurück.
- **Nächste Stufe:** Rückmeldung aus dem Tagesbetrieb einholen (Einkauf zuerst).

## 2026-09-24 · Dashboard-Mitarbeiter: Skill, Agent und Sichtpruefung

- **Geändert:** `.claude/skills/control-center/SKILL.md` (Regeln, Gestaltung, Ablauf, Fallstricke aus
  #536–#555), `.claude/agents/control-center.md` (Subagent, arbeitet nach dem Skill),
  `scripts/dashboard-pruefen.mjs` + `npm run dashboard:pruefen` (eigene Instanz mit Kopie der privaten
  Daten und Wegwerf-Passwort, Screenshots aller Ansichten bei 1440/390 px, JS-Fehler, seitliches
  Scrollen mit Elementpfad, `--offen` für Klicktests). Behoben: aufklappbare Auftragsdetails im Einkauf
  liefen am Handy über den Rand (Tabelle ohne Scroll-Container, lange E-Mail-Adressen).
- **Getestet:** `npm run dashboard:pruefen` – vor dem Fix `FEHL handy einkauf` (Überstand bis 1015 px in
  `details.order-details`), danach alle 14 Prüfungen `OK`; `--offen` hält die Instanz (HTTP 200) und
  räumt ohne `--offen` Instanz und Datenkopie auf; `npm run dashboard:test`, `npm test`.
- **Risiken/Annahmen:** Grundsätze aus den öffentlichen Anthropic-Skills `frontend-design` und
  `webapp-testing` sinngemäß übernommen und auf den Betrieb zugeschnitten, kein Text kopiert.
- **Nächste Stufe:** Ideenliste im Skill mit dem Inhaber priorisieren und über den Agenten umsetzen.
