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

## 2026-09-24 · Einkauf: Wieder öffnen, Wartezeit, Sammelaktion; Heute: „Seit gestern neu" (#561)

- **Geändert:** `docs/ai-dashboard/app.js`, `app.css`; `operations/lib/auftragsstatus.mjs`
  (`oeffneWieder()`, `statusVorErledigt()`); `scripts/dashboard-api.mjs` (POST
  `/api/einkauf/auftragsstatus` mit `aktion: "wiederOeffnen"`); `scripts/dashboard-pruefen.mjs`.
  - **Wieder öffnen:** Im Filter „Erledigt" hat jeder erledigte Artikel „Wieder öffnen…", darüber
    listet „Abgeschlossene Aufträge" jeden Auftrag mit erledigten Artikeln (auch Testbestellungen)
    samt wer/wann/Grund. Rückfrage-Dialog zeigt, wohin jeder Artikel zurückfällt: auf den letzten
    Schritt vor „Erledigt" (z. B. „An Kunden raus"), nach „Ohne Einkauf abschließen" auf „Noch nicht
    bestellt". Der Abschluss wird nicht gelöscht, sondern wandert mit Zeit, Person, Grund und
    optionaler Notiz in `verlauf` der Position; zusätzlich Audit-Zeile
    `auftragsstatus-wieder-geoeffnet` und ein Eintrag „Auftragsstatus wieder geöffnet" im
    Aktivitätsprotokoll (angemeldeter Benutzer). Die Zelle zeigt danach „wieder geöffnet … · @name".
  - **Wartezeit:** Bei „Bestellt" und „Geliefert an uns" steht „seit N Tagen" (aus
    `bestelltAm`/`geliefertAm`), ab 7 Tagen bernsteinfarben, ab 14 rot. Auf „Heute" erscheint die
    Kachel „seit 7 Tagen oder länger bestellt" nur, wenn die Zahl > 0 ist (Klick → Filter „Bestellt").
  - **Sammelaktion:** Lieferanten-Gruppen mit mindestens zwei sichtbaren, noch nicht bestellten
    Artikeln haben „Alle als bestellt markieren…" – Dialog mit Artikelliste, Hinweis auf fehlende
    Angaben und einer optionalen Lieferanten-Bestellnummer für alle; Rückmeldung
    „N Artikel als bestellt markiert".
  - **Heute – Seit gestern neu:** Kundenaufträge der letzten 24 Stunden (Auftragsdatum, ohne Test-
    und stornierte Bestellungen), Probleme darin rot markiert mit dem ersten Hinweis. Ohne neue
    Aufträge nur der Halbsatz „Seit gestern keine neuen Aufträge" in der Stand-Zeile.
  - Behoben: „Ohne Einkauf abschließen…" bei Testbestellungen tat nichts (Auftrag wurde nur unter
    den Kundenaufträgen gesucht). `dashboard:pruefen` blieb nach dem Bericht hängen (Server-Kind
    hielt die Ereignisschleife offen, Instanz und Datenkopie blieben liegen) – räumt jetzt selbst auf.
    `docs/ai-dashboard/tests/api.test.mjs` lädt jetzt zuerst `_testumgebung.mjs`: ohne das schrieben
    die API-Tests über `merke()` Testeinträge in das echte `protokoll.jsonl` unter `$TP_PRIVAT_DIR`.
- **Getestet:** `operations/tests/auftragsstatus.test.mjs` (+4: zurück auf „noch nicht bestellt"
  mit Verlauf, zurück auf letzten Schritt mit erhaltenem Bestelldatum, Ablehnung nicht erledigter
  Positionen, Zeitstempel nach Abschluss ignoriert), `docs/ai-dashboard/tests/api.test.mjs` (+1:
  wiederOeffnen über die API inkl. Audit, unbekannte Aktion → 400); `npm run dashboard:test` (99),
  `npm test` (alle Teilläufe grün); `npm run dashboard:pruefen` 14× `OK`. Klickstrecke gegen die
  Datenkopie (Puppeteer): Sammelaktion Muster-Gruppe „Noch zu bestellen 6 → 0, Bestellt 0 → 6",
  6 Einträge mit gemeinsamer Bestellnummer; Wartezeit nach Zurückdatieren in der Kopie „seit 15
  Tagen" rot, „seit 8 Tagen" bernstein, „seit 3 Tagen" neutral, Heute-Kachel 2; Testbestellung
  ohne Einkauf abgeschlossen (3 Artikel) → „Abgeschlossene Aufträge" 1 → wieder geöffnet → 0,
  Verlauf mit wer/wann/Grund/Notiz; ein Artikel über den Ablauf auf „Erledigt" → wieder geöffnet →
  „An Kunden raus" (Erledigt 1 → 0, Unterwegs 0 → 1); „Seit gestern neu" mit 1 Auftrag, nach
  Zurückdatieren in der Kopie die ruhige Zeile; Esc schließt den Dialog; Handy 390 px ohne
  Überstand; keine JS-Fehler.
- **Risiken/Annahmen:** Das echte `protokoll.jsonl` enthält bereits Testeinträge aus früheren
  Läufen (Benutzer „tobias", „Issue #41", „Order/1") – nicht angefasst, bitte einmal von Hand
  bereinigen. „Neu aufgetretene Probleme" = Probleme in den neuen Aufträgen; ältere
  Aufträge, die erst jetzt rot werden, erkennt die Liste nicht (kein gespeicherter Vortagesstand).
  Die Chip-Zahl „Erledigt" zählt wie bisher nur Artikel der Lieferanten-Gruppen; abgeschlossene
  Testbestellungen stehen nur in der Auftragsliste darüber. Sammelaktion schreibt Artikel
  nacheinander (je ein Request); bricht einer ab, meldet der Hinweis „nur N von M".
- **Nächste Stufe:** Vortagesstand der Ampeln sichern, damit „Seit gestern neu" auch neu rot
  gewordene ältere Aufträge zeigt; Einkauf-Suche nach Auftrag/Kunde.

## 2026-10-01 · Oberfläche in Module zerlegt (reiner Umbau)

- **Geändert:** `docs/ai-dashboard/app.js` (5100 Zeilen) ist jetzt der Einstieg in 44 ES-Module:
  `kern/` (9), `bausteine/` (7), `ansichten/` (26, davon 11 Teilmodule für Einkauf, Kunden und
  Aufgaben), `ereignisse.mjs`, `app.js`. Kein Build-Schritt, keine neue Abhängigkeit. Jede
  Top-Level-Anweisung des Monolithen steht unverändert in genau einem Modul; dazu kamen nur
  `import`/`export`. Vorab in einem eigenen Commit: `bindEvents()` ruft je Ansicht eine Funktion
  (`…Klick(e)`, `…Aenderung(e)`) in der bisherigen Reihenfolge auf, die Zwischenspeicher der
  Ansicht „Aktivität" werden an einer Stelle beschrieben, `render()` bekommt die Ansichten über
  `registriereAnsichten()`. `geldText`, `fmtPreis`, `NICHT_HINTERLEGT` liegen in `kern/helfer.mjs`.
  Server unverändert (liefert schon jede Datei unter `docs/ai-dashboard/` mit `no-store`).
  Neu: `tests/aufbau.test.mjs`; `tests/routen.test.mjs` liest alle Moduldateien;
  `tests/server.test.mjs` hält MIME-Typ und `no-store` je Modul fest. README, `ARCHITEKTUR.md`
  (Abschnitt 12) und Skill `control-center` nachgezogen.
- **Getestet:** `npm run dashboard:test` 152 grün (vorher 146, +6 neue), `npm run operations:test`
  399 grün (wie vorher), `npm run dashboard:pruefen` 38× `OK` (wie vorher), Seitenhöhe aller 38
  Ansichten identisch zum Stand davor. Zusätzlich DOM-Vergleich alter gegen neuer Stand, je mit
  eigener Datenkopie und angehaltener Browser-Uhr: 35 Adressen und 13 Klickstrecken (Palette,
  Aufgaben-Panel, Dialoge, Filter, Suche, Tastatur, Mengenhilfe, Foto-Formular, Auftragsfluss
  setzen, Aufgabe kommentieren/ändern/erledigen, Fall markieren) auf Desktop und Handy – 354
  Vergleiche, 353 gleich; die eine Abweichung ist die Minutenangabe „Stand der Bestellungen"
  (Dateizeit der zweiten Datenkopie). Namensprüfung der Module mit TypeScript (`checkJs`): kein
  ungebundener Name, kein fehlender Export.
- **Risiken/Annahmen:** Ein vergessener Import fällt nicht beim Laden auf, sondern erst, wenn die
  Stelle läuft. Im Vergleich nicht ausgelöst, weil die Datenkopie kein passendes Element hatte:
  „Wieder öffnen" im Einkauf, Rückruf-Dialog, Passwort eines Zugangs setzen, ruhendes Projekt
  aufklappen, „Filter zurücksetzen" bei Aufgaben, Kanban-Drag-and-drop, Auftragsfluss aus dem
  Reiter Kunden/Bestellungen, Foto-Upload, Schnellerfassung absenden. Statt einer Anfrage lädt der
  Browser rund 50 kleine Dateien.
- **Nächste Stufe:** `no-undef`-Prüfung als Test (braucht einen Parser als Entwicklungsabhängigkeit –
  Entscheidung offen); bei spürbarer Ladezeit am Handy `modulepreload`; die Tabelle der Seitentitel
  aus `kern/render.mjs` an die Ansichten geben, damit eine neue Ansicht eine Datei weniger anfasst.

## 2026-10-01 · Einkauf je Lieferant: Karten, Bestellmail-Dialog, Lieferant-Detail

- **Geändert:** Reiter „Bestellungen" zeigt eine Karte je Lieferant statt einer Tabelle je Position
  (`ansichten/einkauf/lieferanten.mjs`, `lib/einkauf-lieferanten.mjs`, `stile/einkauf-lieferanten.css`):
  Zahlen, Überfällig-Hinweis (gelb ab 7, rot ab 14 Tagen), ein Hauptknopf je Bestellweg, „Muster
  bestellen", Positionen aufklappbar mit den bisherigen Tabellen. Bestellmail-Dialog mit Text aus
  `/api/einkauf/bestellmail`, `mailto`, „Text kopieren", Liste „Nicht in der Mail" und der Frage „Als
  bestellt markieren?". Neue Detailseite `#/einkauf?lieferant=A`. Sammelaktion als
  `markiereAlsBestellt()` herausgezogen; Rolle „lesen" sieht keine Statusknöpfe mehr. Hilfe und
  Einkauf-Anleitung angepasst.
- **Getestet:** `npm run dashboard:test` (neu: `tests/einkauf-lieferanten.test.mjs`, 10 Tests),
  `npm run operations:test`, `npm run dashboard:pruefen`. Klickstrecke gegen eine Wegwerf-Instanz mit
  erfundenen Daten: Bestellmail öffnen → Frage erscheint → markieren: „Artikel noch zu bestellen"
  20 → 19, Karte 1 zu bestellen/1 bestellt → 2 bestellt, Bestellnummer im Verlauf. Screenshots
  1440/390/360 px hell und dunkel; Inhalt ohne seitliches Scrollen.
- **Risiken/Annahmen:** Die Kopfzeile ist mit angemeldetem Namen breiter als der Bildschirm (schon
  vorher, gehört zum Navigations-Umbau). Der Verlauf kennt nur, was der Auftragsfluss speichert
  (bestellt/geliefert/raus/erledigt) – kein „nachgehakt". Echte Stammdaten fehlen noch; ohne sie
  heißt der Knopf „Bestellliste öffnen".
- **Nächste Stufe:** Nachhak-Mail vom Server (Text + `mailto`), „Nachgehakt" als Zeitstempel mit
  drei Tagen Ruhe; Filter „Überfällig".
## 2026-10-01 · Zeitleiste je Auftrag mit genau einem nächsten Schritt

- **Geändert:** Neues Modul `operations/lib/auftragsverlauf.mjs`: Musterstrecke (angefragt → beim
  Lieferanten bestellt → bei uns angekommen → gelabelt und an Kunden verschickt → Kunde hat Muster →
  nachgefasst → Ergebnis) und Warenstrecke auf den bestehenden Positionswerten; Ereignisse je Auftrag
  in `auftragsverlauf.json` (privat, nur anhängen, in der Sicherung). Automatisch erkannt und so
  gekennzeichnet: Bestelleingang, Shopify-Versand, Zustellung, spätere Bestellung desselben Kunden.
  `naechsterSchritt` und `verlauf` additiv in `/api/kunden/detail`, `/api/kunden/bestellungen`,
  `/api/kunden/suche`; Schreiben über `POST /api/einkauf/auftragsstatus` mit `aktion: "schritt"`.
  Oberfläche: `ansichten/kunden/zeitleiste.mjs` (Karte „Nächster Schritt“, Verlauf, „Worum es geht“,
  Anrufen/E-Mail) in Kundenakte und Bestelldetail, Gestaltung in `stile/zeitleiste.css`.
- **Getestet:** `npm run dashboard:test`, `npm run operations:test`, `npm run dashboard:pruefen` grün;
  Klickstrecke gegen eine Wegwerf-Instanz mit erfundenen Daten bei 1440/390/360 px (Nachgefasst →
  „Kunde überlegt“, Ergebnis „kein Interesse“ → Kunde „Fertig“; Rolle „lesen“: keine Knöpfe, POST 403).
- **Risiken/Annahmen:** Zustelldatum = letzte Aktualisierung der Sendung (Shopify-Export führt kein
  eigenes Zustelldatum). Versandte Bestellungen ohne Auftragsstatus zeigen nach 7 Tagen „abschließen“.
  Die alten Knöpfe je Bestellung (Bestellt/Geliefert/Raus, „Kunde fertig“) bleiben vorerst daneben.
- **Nächste Stufe:** „Heute“ nutzt `naechsterSchritt`; Erinnerungen ruhen nach dem Nachfassen;
  Lieferzeit je Lieferant statt fester 7/14 Tage.
## 2026-10-01 · Navigation, Layout und Handy (Paket 1 des Konzepts)

- **Geändert:** Gerüst in `index.html`: Seitenleiste links (Heute, Kunden & Aufträge, Einkauf, Lexikon;
  „Seltener“: Aufgaben, Fotos, Shop-Wache, Sammelpunkt „Büro“ mit den Inhaber-Ansichten, Hilfe) statt
  Kopfzeilen-Navigation; Kopfzeile nur noch Seitentitel, Suche, „+ Erfassen“, Sitzung, Hell/Dunkel. Bis
  860 px feste Leiste unten (Heute, Aufträge, Lexikon, Einkauf, Mehr), „Mehr“ öffnet die übrigen Punkte
  als Blatt samt Datenstand und Abmelden. Neu `kern/navigation.mjs` (Markierung, Zähler, Seitentitel,
  „Mehr“); Routen, `ANSICHT_ROLLEN`, `darfAnsicht` und `data-nur-inhaber` unverändert. Hell/Dunkel folgt
  ohne eigene Wahl dem Gerät (`prefers-color-scheme`, auch beim Umschalten des Geräts), die Wahl am Knopf
  bleibt je Browser gespeichert. `app.css`: Safe-Area (`viewport-fit=cover`, `env(safe-area-inset-*)`),
  `100dvh`, keine Schrift unter 12 px, Tippflächen 44 px auch für Textlinks, Tabellen unter 1100 px als
  zweispaltige Karten, Reiter im Raster statt seitlich abgeschnitten, Kennzahlen am Handy zweispaltig und
  flach, Dialoge von unten; Verläufe, Einblend-Animation und dunkle Markenleiste entfernt. Lexikon:
  Treffer als Karten, Produktkarte mit Preis, Eckdaten und Farben oben, Bestellangaben am Handy als
  kompakte Liste je Farbe (die ersten sechs offen). `scripts/dashboard-pruefen.mjs` misst zusätzlich 360,
  800 und 1024 px, schlägt bei `scrollWidth > clientWidth` fehl und wartet nicht mehr auf `networkidle0`.
- **Getestet:** `npm run dashboard:test` (162), `npm run operations:test` (438), `npm run dashboard:pruefen`:
  19 Ansichten × 5 Breiten, 0 px Überlauf, keine JS-Fehler. Gegenprobe mit künstlich zu breiter Seite:
  Prüfung meldet FEHL. Klickstrecke gegen die Datenkopie bei 360 px (Mehr-Blatt, Esc, Thema merken,
  Palette, Erfassen-Dialog, Lexikon Suche → Karte → Produkt) und 1440 px dunkel.
- **Risiken/Annahmen:** Die Rollenbreite im Lexikon wird bei Werten bis 20 als Meter gelesen (stand vorher
  als „4.0 cm“ da). Lange Ansichten bleiben lang, wo der Inhalt es ist (Ratgeber, Hilfe, Entwicklung);
  Kopf-Knöpfe auf „Heute“ und die Fall-Karten gehören den Paketen 2 und 6. Nicht auf einem echten iPhone
  als Home-Bildschirm-App geprüft (Safe-Area nur nach Regelwerk).
- **Nächste Stufe:** Heute neu (Paket 2), Einkauf als Lieferanten-Karten (Paket 3), Zeitleiste (Paket 6).

## 2026-10-01 · „Heute" neu: To-dos zuerst

- **Geändert:** Startseite neu aufgebaut (`ansichten/heute.mjs`, Styles in der neuen `stile/heute.css`):
  „N offene To-dos für dich" mit je einem Knopf, Sprungfelder „offen im Laden / bei Website" (Inhaber),
  „Wer wartet auf was" in drei Spalten, vier Kennzahlen aus dem vorhandenen Shop-Export, Suchfeld
  „Produkt nachschlagen" (springt ins Lexikon). Ableitung als reine Funktionen in `lib/todos.mjs`.
  Bisherige Blöcke eingeklappt am Ende (`ansichten/heute/bisher.mjs`). Server: `orgListe` kennt
  `bereich=alle-aufgaben` und liefert `technisch` je Eintrag; der Datenstand ignoriert einen Fehlversuch,
  der älter ist als der letzte Erfolg derselben Quelle. Hinweis am Knopf „Jetzt aktualisieren" sagt jetzt,
  was zu tun ist.
- **Getestet:** `npm run dashboard:test` (187), `npm run operations:test` (438), `npm run dashboard:pruefen`
  (alle Ansichten OK); Sichtprüfung mit erfundenen Testdaten bei 1440/390/360 px, hell und dunkel, als
  Inhaber, Verkäufer und Website-Mitarbeiter; Klickstrecke gegen die Kopie (Sprungfeld, Spaltenwahl,
  Suche → Lexikon, Freigabe öffnet das Panel, „Nachhaken" → Einkauf mit aufgeklappter Karte des Lieferanten).
- **Risiken/Annahmen:** Fristen je To-do-Art (3/7, 2/7, 7/14 Tage) sind eine erste Setzung in
  `FRISTEN`. „Website"-Sicht ergibt sich aus den zugewiesenen Aufgaben – wer keine hat, sieht „Laden".
  „Bestellen" und „Nachhaken" öffnen die Karte des Lieferanten im Einkauf (`?lf=`), die Mail entsteht
  dort. Kennzahlen ohne Verlaufslinie, weil der Export keinen Wochenverlauf enthält.
- **Nächste Stufe:** Zeilen in „Wer wartet auf was" auf die Auftrags-Zeitleiste zeigen lassen, sobald
  sie gemergt ist; Zähler an „Heute" in der Navigation.


## 2026-10-01 · Zurück auf offen, Muster „haben wir da“

- **Geändert:** Positionen lassen sich von jedem Schritt zurück auf „Noch zu bestellen“ setzen
  (`setzeZurueckAufOffen`, Protokoll im `verlauf` der Position): Knopf „Zurück auf offen…“ je Artikel und
  „Alle zurück auf offen…“ je Tabelle und je Lieferantenkarte (in „Positionen bearbeiten“), im Bestelldetail
  unter „Etwas anderes ist passiert …“, und „Rückgängig“ direkt nach „Als bestellt markieren“ im Bestellmail-
  Dialog (der Dialog bleibt dafür offen). Neu `operations/lib/musterherkunft.mjs`: je Musterbestellung oder
  -position „Beim Lieferanten bestellen“ / „Aus eigenem Bestand – verschicken“ / „– persönlich vorbeibringen“
  (privat, nur anhängen). Solche Muster fehlen in der Bestellmail, in „Muster noch zu bestellen“ und im To-do
  „bestellen“; stattdessen To-do „Muster vorbeibringen bei …“ / „Muster verschicken an …“ mit Ort und Knopf
  „Erledigt – Kunde hat Muster“. Zeitleiste ohne Lieferanten-Schritte, „Persönlich übergeben“ statt
  „verschickt“. Rolle „lesen“ sieht keinen der neuen Knöpfe. `dashboard:pruefen` kopiert die neue Datei.
- **Getestet:** siehe PR (Testzahlen, Klickstrecke gegen die Kopie, Screenshots 1440/390 px).
- **Risiken/Annahmen:** „Rückgängig“ im Bestellmail-Dialog fragt nicht nochmal nach (es nimmt nur den
  gerade gesetzten Schritt zurück). Gemischte Musterbestellungen (teils Lieferant, teils eigen) laufen in der
  Zeitleiste weiter über die Lieferantenstrecke; die eigenen Muster erscheinen dann als To-do.
- **Nächste Stufe:** Kartenansicht/Entfernung für „Kunde in der Nähe“, falls die Stadt allein nicht reicht.

## 2026-10-08 · Link zur Werkbank Shop & Technik

- **Geändert:** Neuer Punkt „Werkbank“ in der Seitenleiste unter „Seltener“ (am Handy im „Mehr“-Blatt),
  direkt nach „Aufgaben“. Die Werkbank ist das gemeinsame Board von Inhaber und Shop-/Technik-Mitarbeiter
  (Ideen, Aufgaben, Fragen, Erledigtes) und liegt als privates claude.ai-Artefakt außerhalb des Control
  Centers. Deshalb öffnet der Link in einem neuen Tab (kleiner Pfeil statt Zähler) und trägt kein `data-nav`.
  Neues Attribut `data-nicht-lesen` blendet ihn für die Rolle „lesen“ aus; Inhaber und Mitarbeiter sehen ihn.
- **Getestet:** `npm run dashboard:test` 200/200, `npm test` grün. `dashboard:pruefen`: 19 Ansichten auf
  1440, 1024, 800, 390 und 360 px ohne seitliches Scrollen. Einziger Fehler ist ein 404 im Ratgeber bei
  1440 px, der schon vor der Änderung auftrat. Klickprüfung gegen die Kopie bei 390 px: Link im „Mehr“-Blatt
  sichtbar, 48 px hoch, `target=_blank`, `rel=noopener`; mit `rolle-lesen` `display: none`, mit
  `rolle-mitarbeiter` sichtbar.
- **Risiken/Annahmen:** Wer kein Claude-Konto mit Zugriff auf die Werkbank hat, landet bei Claude auf
  „kein Zugriff“. Die Freigabe erfolgt im Teilen-Menü der Werkbank, nicht hier.
- **Nächste Stufe:** Falls gewünscht, offene Fragen an den Inhaber aus der Werkbank als Zähler an den Link
  hängen (bräuchte einen lesenden Abruf über den Server).

## 2026-10-10 · „Muster nachfassen" auf „Heute"

- **Geändert:** Inhaberentscheidung vom 10.10. (Werkbank w-035): der Verkauf im Laden fasst Musterkunden
  nach. Neue Karte „Muster nachfassen" auf „Heute" (Sichten Laden und Alles) mit Kunde, Bestellnummer,
  Bestelldatum, Versand, Mustern je Produkt, Kontaktweg, Textvorschlag (aufklappbar, kopierbar, als
  `mailto:` vorbefüllt) und dem Knopf „Erledigt – nachgefasst". Der Knopf ist der vorhandene
  Zeitleisten-Schritt `nachgefasst` und hält wer und wann fest; Erledigtes bleibt eine Woche mit wer/wann
  sichtbar. Regeln (erste Nachfrage ab 4 Tagen nach Versand, eine Erinnerung nach 10 Tagen, nicht
  länger als 30 Tage) in `lib/muster-nachfassen.mjs`. Neuer lesender Endpunkt `/api/kunden/muster-texte`
  liest die Vorlage `muster-nachfassen-texte.md` aus dem Privatordner; `dashboard:pruefen` kopiert sie mit.
  Die offenen Kunden zählen bei „N offene To-dos" mit; „Alles erledigt" erscheint nicht, solange welche offen sind.
- **Getestet:** siehe PR (Testzahlen, Sichtprüfung 1440–360 px hell und dunkel, Klickstrecke gegen die Kopie).
- **Risiken/Annahmen:** Die Kundenakte rechnet „Nachfassen" weiter 5 Tage nach „Kunde hat Muster" und bietet
  dort „Kunden anrufen" an; die Karte folgt dem Konzept des Inhabers (E-Mail ab 4 Tagen nach Versand, Anruf
  nur bei Rückrufwunsch). Die Anrede (Herr/Frau) steht nicht in den Bestelldaten – der Text sagt
  „Guten Tag Vorname Nachname". Ein Link zum eigentlichen Produkt fehlt, weil Muster eigene Produkte sind.
  Die geplante Aufgabe „musterkunden-liste-montag" wird für die Karte nicht gebraucht (sie rechnet aus den
  Bestelldaten des Control Centers).
- **Nächste Stufe:** Zeitpunkt in Kundenakte und Karte angleichen, sobald der Inhaber die Regel bestätigt;
  Produktlink über die Musterzuordnung des Lexikons (`original.produktHandle`).
## 2026-10-08 · Sonderposten: „Im Laden verkauft“ (Teil von #978)

- **Geändert:** Neue Ansicht „Sonderposten“ (`#/sonderposten`, Seitenleiste unter „Seltener“ nach „Fotos“,
  am Handy im „Mehr“-Blatt). Sie zeigt Reststücke und Einzelstücke live aus Shopify (`productType`
  „Sonderposten“, ohne Archiv und ohne die Vorlage SP-0000/„VORLAGE …“) mit Foto, SKU, Titel, Maßen
  („4,00 × 2,35 m · 9,40 m²“), Zustand, Farbe, Lagerort, Preis und Status. Suchfeld für die SP-Nummer vom
  Etikett („SP-0042“, „sp 42“ und „42“ treffen dasselbe Stück). Verfügbare Stücke oben, darunter
  „Nicht mehr verfügbar“ mit „verkauft am … von … (im Laden)“. Einzige Hauptaktion: „Im Laden verkauft…“,
  nur bei Bestand 1 und nicht für die Rolle „lesen“; der Dialog zeigt Foto, Titel, SKU, Preis.
  Server: `GET /api/sonderposten/liste`, `POST /api/sonderposten/verkauft` (in der write-Liste:
  „lesen“ 403, „mitarbeiter“/„inhaber“ 200). Die Buchung liest das Produkt neu, bucht nur bei Bestand 1,
  setzt ihn per `inventorySetQuantities` mit `changeFromQuantity: 1` und `@idempotent` auf 0, schreibt erst
  danach `sonderposten.verkauft_am/_von/_kanal` (Name aus der Sitzung), protokolliert
  („sonderposten-im-laden-verkauft“) und liest zur Gegenprobe erneut. Logik in
  `operations/lib/sonderposten.mjs`. `write_inventory` steht jetzt in der Bereichszeile
  (`operations/README.md`, `app-einrichten.sh`) und als `SCHREIB_BEREICHE` in `sync/zugang.mjs`;
  `operations:verbindung` listet fehlende Schreibrechte getrennt. Servertests blenden den echten Zugang
  aus (`_testumgebung.mjs`).
- **Getestet:** `npm run dashboard:test` 207/207, `npm test` 1765/1765 (7 Suiten, nach Rebase auf main). Neu: 11 Tests in
  `operations/tests/sonderposten.test.mjs`, 7 in `tests/sonderposten-api.test.mjs` (Bestand 1 → Buchung,
  Felder, Protokoll, Gegenprobe; Bestand 0 → 409, nur ein Lesezugriff; ACCESS_DENIED → Klartext, keine
  Felder, kein Protokoll; über den Server „lesen“ 403 ohne Shopify-Aufruf, „mitarbeiter“ 200, zweiter
  Klick 409, „inhaber“ 200, GET 405), 1 in `zugang.test.mjs`. `dashboard:pruefen`: 20 Ansichten × 5
  Breiten = 100 × OK, 0 px Überlauf. Klickstrecke gegen die Kopie bei 390 und 1440 px mit vorgetäuschten
  Shopify-Antworten: Abbrechen/Esc → 0 Buchungen; „Recht fehlt“ → Meldung im Dialog; 409 → „bereits
  verkauft“; Erfolg → Rückmeldung „Als im Laden verkauft gebucht – online nicht mehr bestellbar“, Knöpfe
  1 → 0, Status „verkauft am … von … (im Laden)“; Suche „17“ → 1 Treffer. Echter Lesetest gegen Shopify:
  1 Sonderposten (Testprodukt SP-TEST-0001, Bestand 0), Vorlage ausgefiltert, 0,7 s. **Kein echter
  Schreibtest.**
- **Risiken/Annahmen:** Der Zugang des Dashboards hat heute kein `write_inventory` – bis der Inhaber es
  freischaltet, meldet der Knopf genau das und schreibt nichts (Rückfallweg: Bestand in der Shopify-App auf
  0). Shopify hat `compareQuantity` in API 2026-07 durch `changeFromQuantity` ersetzt; die Prüfung gegen
  das echte Schema (nur lesend) bestätigt das Feld. Scheitern nach gebuchtem Bestand nur die
  Verkaufsfelder, bleibt das Stück verkauft und der Dialog sagt, was fehlt.
- **Nächste Stufe:** Nach der Freischaltung einmal mit dem Testprodukt (Bestand vorher auf 1) durchbuchen;
  danach Archivieren nach 30 Tagen und optional der SumUp-Abgleich (Konzept Abschnitt 6, Weg C).

## 2026-10-10 · Sonderposten: Überverkauf und Antwortverlust (Review-Befunde vom 09.10.)

- **Geändert:** Buchen nur noch bei gesperrtem Überverkauf (`inventoryPolicy: DENY`); sonst 409 mit
  Handlungshinweis, kein Knopf in der Liste und der Status „„Verkauf bei Nichtverfügbarkeit fortsetzen“ ist
  an – in Shopify ausschalten“. Die Gegenprobe meldet `ok` nur bei Bestand 0 **und** gesperrtem Onlinekauf
  (`onlineGesperrt`). Antwortverlust bei der Bestandsmutation: erneutes Lesen entscheidet (0 = gebucht,
  1 = nicht angekommen, sonst „unklar“ mit Protokolleintrag). Scheitert nur die Gegenprobe nach der Buchung,
  antwortet der Server 200 mit `gegenprobe: "fehlgeschlagen"` statt eines Fehlers. Die Rückmeldung im
  Dialog kommt aus `lib/sonderposten.mjs`: ohne Antwort vom Dashboard „unklar, Liste neu laden“ statt
  „Es wurde nichts gebucht“.
- **Getestet:** 7 neue Tests in `operations/tests/sonderposten.test.mjs` (CONTINUE und fehlende Policy,
  Policy nach der Buchung geändert, Antwort nach/vor der Buchung verloren, Lesen danach gescheitert,
  Gegenprobe gescheitert, erstes Lesen gescheitert), neue `tests/sonderposten-meldung.test.mjs` (jede
  Rückmeldung; keine Negativbestätigung ohne Beleg) und Servertests für „unklar“ samt Protokoll und für die
  gescheiterte Gegenprobe. `npm run dashboard:test` 217/217, `npm test` 1782/1782 (7 Suiten).
  `dashboard:pruefen` 20 Ansichten × 5 Breiten = 100 × OK, 0 px Überlauf. Klickstrecke gegen die Kopie bei
  390 und 1440 px mit vorgetäuschten Antworten: Stück mit erlaubtem Überverkauf ohne Knopf und mit Hinweis;
  abgebrochene Verbindung → „unklar, Liste neu laden“; 504 „unklar“ → Servertext; 200 mit gescheiterter
  Gegenprobe → „angenommen, bitte prüfen“; Erfolg → Toast; 4 Anfragen, 0 JS-Fehler.
- **Risiken/Annahmen:** Bleibt eine Mutation in Shopify länger hängen als das erneute Lesen, meldet der
  Server „nicht angekommen“; ein zweiter Klick bucht wegen `changeFromQuantity: 1` trotzdem nie doppelt.
  Weiterhin kein echter Schreibtest (fehlendes `write_inventory`).
- **Nächste Stufe:** unverändert – nach der Freischaltung einmal mit dem Testprodukt durchbuchen.

## 2026-10-11 · Kachel „Laden“ auf „Heute“

- **Geändert:** Neue Kachel „Laden“ auf „Heute“ (Sichten Laden und Alles, nicht Website) mit den Zahlen aus dem
  Laden-Modus der Auftrags-App: offene Beratungen (davon neu), fällige Wiedervorlagen (Bernstein, wenn > 0),
  Angebote offen (davon zum Nachfassen), Fälle aus dem Shop der letzten 7 Tage, gewonnen und verloren der
  letzten 30 Tage, dazu der Link „Laden-Ansicht öffnen“ (neuer Tab). Neuer lesender Endpunkt
  `/api/laden/zahlen`: der Server ruft `<App-URL>?ansicht=zahlen&s=<Schlüssel>` ab (Weiterleitung folgen,
  15 s Zeitlimit, Erfolg 5 Minuten, Fehlschlag 1 Minute gemerkt) und reicht nur die bekannten Zahlenfelder
  durch (`scripts/laden-zahlen.mjs`). URL und Schlüssel stehen in `.env.local` des Dienstes
  (`LADEN_ZAHLEN_URL`, `LADEN_ZAHLEN_SCHLUESSEL`), nie im Repository und nie im Browser; ohne sie zeigt die
  Kachel „Nicht eingerichtet“. Platzhalter in `.env.local.example`.
- **Getestet:** `tests/laden-zahlen.test.mjs` (Konfiguration, Zahlenprüfung, Abruf mit Schlüssel, Zwischenspeicher,
  Fehlerfälle samt echtem Zeitlimit, Route über den Server, Kachel-Markup). `dashboard:pruefen` für „Heute“
  bei 1440, 1024, 800, 390 und 360 px ohne seitliches Scrollen. Sichtprüfung gegen die Kopie mit
  abgefangenem `/api/laden/zahlen` in allen drei Zuständen (Zahlen, nicht erreichbar, nicht eingerichtet),
  hell und dunkel: 5/3/2 Spalten, keine JS-Fehler, Link am Handy 44 px hoch.
- **Risiken/Annahmen:** Die Zahlen sind höchstens 5 Minuten alt (plus 10 s Zwischenspeicher in der App).
  „Angebote offen“ zählt Beratungen im Status Angebot oder Nachfassen. Die Kachel funktioniert erst, wenn die
  App mit dem Endpunkt ausgerollt und die Script-Property gesetzt ist.
- **Nächste Stufe:** Bei Bedarf fällige Wiedervorlagen als To-do „Laden: Wiedervorlage fällig“ in die Liste oben.

## 2026-10-12 · Sonderposten: Restrollen im Laden abbuchen (Inhaber)

- **Geändert:** Die Ansicht „Sonderposten“ zeigt neben Reststücken und Einzelstücken jetzt auch Restrollen
  (Rollenware mit Tag `sonderposten` und Rollenbreite, z. B. Passion Yasmin): „Restrolle · Rolle 4 m breit ·
  noch 20 m (80 m²)“, Preis je m² (online). Der Knopf „Im Laden verkauft…“ fragt dort nach der abgeschnittenen
  Länge, zeigt vor dem Klick „3,5 m × 4 m = 14 m² · danach noch 66 m² (16,5 m)“ (nicht glatte m² aufgerundet,
  mehr als der Rest gesperrt) und bucht „14 m² abbuchen“. Server `verkaufeVonRolle`
  (`operations/lib/sonderposten.mjs`) mit derselben Sicherung wie beim Stück (neu lesen, Compare-and-swap,
  `@idempotent`, Antwortverlust über erneutes Lesen, Gegenprobe), Protokoll
  `sonderposten-rolle-im-laden-verkauft`. Bestandsbuchung als gemeinsamer Helfer `bucheBestand` für beide Wege.
  Zweig vorher mit `main` zusammengeführt (217 Commits; Konflikte in `serve-dashboard.mjs` – Pfadliste
  vereinigt um `laden/zahlen` – und hier im Changelog, beide Seiten behalten).
- **Getestet:** `operations/tests/sonderposten-rolle.test.mjs` (15: Rechnung, Liste, 3,5 m → 80 → 66,
  genau der Rest, zu viel 409, ungültige Länge 400 ohne Aufruf, vertauschte Wege, ohne Tracking/mit
  Überverkauf 409, Recht fehlt 403, Item-ID, Antwortverlust nach/vor der Buchung, unklar, Gegenprobe nicht
  lesbar, gleichzeitige Buchung 409). Meldungs- und API-Tests ergänzt (u. a. Browser- und Serverrechnung für
  2000 Längen × 3 Breiten gleich). `dashboard:test` 230/230, `operations:test` grün. `dashboard:pruefen`
  (Liste live aus Shopify gelesen) ohne Überlauf bei 1440/1024/800/390/360 px. Klickstrecke bei 1440 und
  390 px mit abgefangener Buchung: 3,3 m → „13,2 m², aufgerundet 14 m²“, 25 m → gesperrt mit Hinweis, Esc
  schließt, 3,5 m → genau eine Anfrage `laengeM: 3.5` → Toast „14 m² abgebucht – noch 16,5 m (66 m²) auf
  der Rolle“, 0 JS-Fehler.
- **Risiken/Annahmen:** Kein echter Schreibtest – dem Zugang fehlt weiterhin `write_inventory` (am
  2026-10-12 per Token-Tausch geprüft). Aufrunden auf ganze m² nimmt bei krummen Längen bis zu knapp 1 m²
  je Buchung mehr vom Bestand, als physisch fehlt (lieber zu wenig anbieten als zu viel).
- **Nächste Stufe:** Nach der Freischaltung den ersten echten Ladenverkauf hier buchen und in Shopify
  (Bestandsverlauf der Variante, Referenz `tp://laden-verkauf/…`) und im Shop gegenprüfen.

## 2026-10-12 · Kachel „Laden“: Spam-Verdacht

- **Geändert:** Die Auftrags-App liefert ab Version 43 zusätzlich `spamVerdacht` – offene Fälle aus dem Shop,
  die im Laden im Filter „Spam prüfen“ warten und in keiner anderen Zahl mitzählen. Der Server reicht das Feld
  durch (`LADEN_ZAHLEN_FELDER`); fehlt es (ältere App), gilt es als 0 statt die Kachel auf „nicht erreichbar“ zu
  setzen (`LADEN_ZAHLEN_SPAETER`). Ist es da, gilt dieselbe Prüfung wie für alle Felder (ganze Zahl ≥ 0). Die
  Kachel zeigt nur bei > 0 eine Zeile unter den fünf Zahlen: „2 Fälle aus dem Shop mit Spam-Verdacht – in der
  Laden-Ansicht unter „Spam prüfen“ ansehen. In den Zahlen oben nicht enthalten.“ Die Zahl steht in Bernstein
  wie „Wiedervorlage fällig“, keine sechste Kachel. Nur Zahlen, keine Namen.
- **Getestet:** `tests/laden-zahlen.test.mjs` 9/9 (neu: Feld fehlt → 0 und erreichbar, Feld vorhanden, ungültige
  Werte −1/1,5/"3"/null/true → unbrauchbar, Zeile bei 2 und 1 – Einzahl „Fall“ –, keine Zeile bei 0 und ohne
  Feld). `npm run dashboard:test` 231/231, `npm test` 2109/2109 (nach Zusammenführen mit `main`). `dashboard:pruefen`
  für „Heute“ bei 1440, 1024, 800, 390 und 360 px nur `OK`. Sichtprüfung gegen die Kopie mit abgefangenem `/api/laden/zahlen` (2, 1, 0, Feld
  fehlt) bei 1440/390/360 px, hell und dunkel: Zeile nur bei 2 und 1, steht unter den Zahlen, Farbe gleich der
  Wiedervorlage-Zahl (hell `#9a6400`, dunkel `#e5b34f`), 0 px seitlicher Überlauf, keine JS-Fehler.
- **Risiken/Annahmen:** Die Laden-Ansicht der App hat keinen Sprunglink direkt auf den Filter; die Zeile nennt
  deshalb den Filternamen. Ein ungültiger Wert in `spamVerdacht` setzt – wie bei jedem anderen Feld – die ganze
  Kachel auf „nicht erreichbar“.
- **Nächste Stufe:** Falls die App einen Parameter für den Filter bekommt (z. B. `?ansicht=laden&filter=spam`),
  die Zeile direkt dorthin verlinken.
## 2026-10-12 · Ansicht „Social Media“: Upload-Link fürs Team und Kampagnen-Links

- **Geändert:** Neuer Punkt „Social Media“ unter „Seltener“ (`#/social`, für Rolle „lesen“ ausgeblendet). Karte
  „Foto-Upload fürs Team“: je Name der kopierbare Upload-Link für die Baustellenfotos; der Link kommt nur vom
  Server (`/api/social/zugaenge`, „lesen“ → 403). „Neuen Link anlegen“ (nur Inhaber) erzeugt einen Zugang im
  Social-Modul und merkt den Klartext im Privatordner; alte Links bleiben gültig. Karte „Kampagnen-Link“:
  Ziel (Startseite, Liefer- und Verlegeservice, Unsere Arbeit, Muster oder eigene Shop-Adresse), Kanal, Art,
  Kampagne → fertiger UTM-Link mit „Kopieren“. Darüber eine Zeile mit Social-Zentrale, Instagram, Facebook.
- **Getestet:** siehe PR (Testzahlen, `dashboard:pruefen`, Klickstrecke gegen die Kopie).
- **Risiken/Annahmen:** Der bestehende Zugang „Team“ ist nur als Hash gespeichert; sein Link lässt sich nicht
  wiederherstellen. Bis der Inhaber einmal „Neuen Link anlegen“ drückt, zeigt die Zeile nur den Hinweis.
  Die Zentrale (Port 8020) ist nur im Netz des Macs bzw. über Tailscale erreichbar.
- **Nächste Stufe:** Sperren eines Upload-Links direkt hier statt per Kommandozeile.


## 2026-10-12 · Einkauf: Bestellmenge für Teppich nach Maß, Kettelservice als Eigenleistung

- **Geändert:** `operations/lib/resolve.mjs` liest die Rollenbreite auch aus „_Zuschnitt aus Rolle“ – so schreibt
  der Konfigurator für Teppich nach Maß sie seit Beginn; die Einkaufsübersicht kannte nur „Aus Rolle“ des
  Rollenrechners, die Bestellmenge jedes Maßteppichs blieb deshalb ungeklärt. `operations/lib/bestelluebersicht.mjs`:
  Kettelservice und Wunschmaß-Pauschale (feste Liste nach Handle) sind Eigenleistung – nicht in der Bestellliste,
  nicht als „ohne Großhändler-ID“, in Auftrag und Zeitleiste als „Eigenleistung“ beschriftet. Die gekettelte
  Fußleiste bleibt bewusst offen, sie braucht Material.
- **Getestet:** neue Fälle in `operations/tests/bestelluebersicht.test.mjs` (Maße 120 × 280 cm aus 200-cm-Rolle →
  2,80 lfm; „Aus Rolle“ geht vor); alle Suiten grün; `dashboard:pruefen` nur OK. Echte Daten (Kopie, nur lesend):
  ohne ID 1 → 0, Menge ungeklärt 4 → 2, zu bestellen 3 → 2; der Maßteppich-Auftrag hat keine Warnung mehr.
- **Risiken/Annahmen:** Länge des Maßteppichs läuft entlang der Rolle (der Konfigurator begrenzt die Breite auf
  die Rollenbreite). Neue Eigenleistungen müssen in `EIGENLEISTUNG_HANDLES` nachgetragen werden.
- **Nächste Stufe:** Dieselbe Kennzeichnung in der internen Bestellmail (Shopify-Benachrichtigung), dort steht
  beim Kettelservice weiter „Großhändler-ID fehlt“.

## 2026-10-12 · Sonderposten: „Wer hat verkauft?“ im gemeinsamen Zugang, Recht erteilt

- **Geändert:** Das Control Center läuft ohne persönliche Konten (gemeinsames Passwort); jede Buchung stand
  deshalb als „Inhaber“ im Protokoll. Beide Dialoge („Im Laden verkauft?“ und „Von der Rolle verkauft“) fragen
  jetzt im gemeinsamen Zugang „Wer hat verkauft?“ – Pflicht, ohne Vorbelegung, zuletzt benutzte Namen als
  Vorschlag. Der Server verlangt den Namen dann (400 ohne Shopify-Aufruf) und schreibt ihn in `verkauft_von`
  und ins Protokoll (Vermerk „Name im gemeinsamen Zugang angegeben“). Mit persönlichem Konto (Kürzel) gilt
  weiter der Name aus der Sitzung. Doku: `write_inventory` ist seit heute erteilt.
- **Getestet:** API-Tests für Notzugang ohne/mit Namen (Stück und Rolle) und persönliches Konto schlägt
  Anfrage; `dashboard:test` grün. Klickstrecke 1440/390 px gegen die Kopie (Liste live gelesen, Buchung
  abgefangen): nur Länge → Knopf gesperrt, mit „Thomas“ → frei, Anfrage trägt `verkauftVon: "Thomas"`,
  zweiter Dialog leer mit Vorschlag „Thomas“, 0 JS-Fehler, 0 px Überlauf. Echter Schreibtest nach der
  Freischaltung nur am Testprodukt SP-TEST-0001: 0 → 1 → 0, Felder gesetzt, Gegenprobe ok; Yasmin unberührt.
- **Risiken/Annahmen:** Der Name ist im gemeinsamen Zugang eine Angabe, keine Anmeldung. Wer es genauer will,
  legt persönliche Konten unter „Team“ an.
- **Nächste Stufe:** Ersten echten Rollenverkauf in Shopify (Bestandsverlauf) gegenprüfen.

## 2026-10-12 · Kachel „Laden“: Spam-Zeile springt direkt in den Filter (#1138)

- **Geändert:** Die Zeile „n Fälle aus dem Shop mit Spam-Verdacht“ endet jetzt mit dem Link „Spam prüfen ↗“, der die
  Laden-Ansicht der Auftrags-App gleich mit dem Filter öffnet (`?ansicht=laden&filter=spam`, App ab Version 47), in
  einem neuen Tab wie „Laden-Ansicht öffnen“. Der Satz dazu ist kürzer („– in den Zahlen oben nicht enthalten.“),
  weil der Link den Weg ersetzt. `spamUrl()` in `ansichten/heute/laden.mjs` baut die Adresse per URL-API aus dem
  `ladenUrl` des Servers: weitere Parameter bleiben, `ansicht=laden` und `filter=spam` werden gesetzt, nur `https`.
  Ohne `ladenUrl` bleibt die bisherige Zeile ohne Link. Am Handy hat der Link wie der Kopf-Link 44 px Tippfläche.
- **Getestet:** `laden-zahlen.test.mjs` um einen Test erweitert (Link mit `ansicht=laden` und `filter=spam`, weitere
  Parameter bleiben, anderer Filter wird ersetzt, ohne/kaputter/relativer/`javascript:`/`http`-ladenUrl kein Link;
  Kachel mit und ohne `ladenUrl`). `npm run dashboard:test` 249/249, `npm test` 2206/2206 (nach Rebase auf `main`), `secret:scan` PASS,
  `validate --static` PASS. `dashboard:pruefen` für „Heute“ bei 1440, 1024, 800, 390 und 360 px (hell) und 1440/390 px (dunkel)
  nur `OK`, 0 px Überlauf. Klickstrecke gegen die Kopie mit abgefangenem `/api/laden/zahlen` (Host `.invalid`, keine
  Anfrage nach draußen): Zeile mit Link bei 2 und 1 (Einzahl „Fall“), keine Zeile bei 0 und ohne Feld, ohne
  `ladenUrl` alter Text ohne Link; Link bei 1440/390/360 px nicht verdeckt (Desktop 16 px, Handy 44 px hoch),
  Terrakotta wie der Kopf-Link (hell `#98502f`, dunkel `#d68b65`); Klick bei 390 px öffnet genau einen neuen Tab
  auf `…/exec?ansicht=laden&authuser=1&filter=spam`, das Dashboard bleibt auf „Heute“, keine JS-Fehler.
- **Risiken/Annahmen:** Bis die Auftrags-App Version 47 läuft, öffnet der Link die Laden-Ansicht ohne Filter – der
  Inhaber muss dann noch auf „Spam prüfen“ tippen.
- **Nächste Stufe:** keine.

## 2026-10-12 · Einkauf und Lexikon: jedes Muster mit Weg zum Lieferanten, Lieferanten C–E zugeordnet (#1145)

- **Geändert:** Muster ohne eigenes Musterprodukt – fast alle Vinylböden von der Rolle (PVC/CV) und einige
  Designböden – laufen über das Sammelprodukt „Kostenloses Muster“. Ihre Position trug dessen Handle, „Im Lexikon
  ansehen“ öffnete deshalb das Sammelprodukt: kein Lieferant, keine Artikelnummer, kein Link zum Lieferanten.
  `aufbereiten()` (`operations/lib/bestelluebersicht.mjs`) setzt bei diesen Mustern jetzt den Handle des
  Quellprodukts (aus der geladenen Quellvariante, sonst aus `_Quellprodukt`); eigene Musterprodukte `muster-*`
  bleiben, weil das Lexikon dort das Original selbst zeigt. Damit stehen auch die wartenden Kunden am richtigen
  Produkt. Zweitens kannte die GID-Zuordnung für `einkauf.lieferant` nur A und B; jede Position von C, D und E
  stand unter „Lieferant nicht zugeordnet“. Die feste Liste kennt jetzt A–E, und der
  Export (`operations/scripts/aktualisieren.mjs`) liest alle `tp_lieferant`-Metaobjekte als `lieferanten` in
  `orders.json` mit – ein neuer Lieferant braucht keine Codeänderung mehr. Scheitert nur diese Abfrage, läuft der
  Export weiter und die feste Liste greift.
- **Getestet:** Zwei neue Tests in `operations/tests/bestelluebersicht.test.mjs` (Sammelprodukt-Muster →
  Quellprodukt mit Lieferant, Link und ID; ohne geladene Quellvariante aus `_Quellprodukt`; `muster-*` unverändert;
  C/D/E aus der festen Liste, unbekannte GID über `lieferanten` aus dem Export), Exporttest um die Lieferantenabfrage
  erweitert. `npm run dashboard:test` 249/249, `npm test` grün, Guards und `validate --static` PASS,
  `secret:scan` PASS. Vergleich alt/neu auf den echten Bestelldaten (nur lesend): 63 Positionen, genau 8 geändert –
  7 Sammelprodukt-Muster zeigen aufs Quellprodukt, ein Teppichboden-Muster bekommt statt „nicht
  zugeordnet“ seinen Lieferanten. `dashboard:pruefen` nur `OK`, 0 px Überlauf. Klickstrecke gegen die Kopie: „Lieferant nicht
  zugeordnet“ verschwunden, Karten A, B, E; alle 7 Muster-Zeilen mit Lieferantenlink, „Im Lexikon ansehen“ beim
  PVC-Muster öffnet den Vinylboden mit Lieferant A, Artikelnummer und „Beim Lieferanten öffnen“ (375 px: 0 px
  Überlauf), dort „2 Kunden warten auf dieses Produkt“.
- **Risiken/Annahmen:** Die Zuordnung C–E greift für den aktuellen Export sofort über die feste Liste; die
  Metaobjekt-Liste kommt mit dem nächsten Lauf von `npm run daten:aktualisieren`. Für C–E fehlen ggf. noch
  Stammdaten (Bestellweg, Mail) – die Karte zeigt dann „nicht hinterlegt“.
- **Lexikon, Muster ohne Original:** Die Muster-SKU ist `M-` plus die SKU der Quellvariante, das Lexikon suchte das
  Original aber nur über die Lieferanten-Artikelnummer. Wo diese eine Null mehr trägt (Shop `…04_99`, Lieferant
  `…04_099`; Shop `…4_119`, Lieferant `…04_119`), fanden 88 Mustervarianten kein Original und zeigten keinen Weg
  zum Lieferanten. `operations/lib/lexikon.mjs` sucht jetzt zuerst über die Shop-SKU, dann über die Artikelnummer.
  Hat das Original keinen Direktlink, trägt es den Suchlink beim Lieferanten; die Muster-Zeile im Lexikon zeigt
  dann „Beim Lieferanten suchen ↗“. Test in `operations/tests/lexikon.test.mjs`. Live-Export in eine Testdatei:
  5850/5850 Mustervarianten mit Original (vorher 5762), alle mit Direkt- oder Suchlink; bisher gefundene Originale
  unverändert.
- **Nächste Stufe:** Lieferant B (Wohnteppiche, Dekofelle, Teppiche, Teppich nach Maß; 654 Varianten) hat keinen
  Schnellzugriff: keine Produktseiten online, kein Bestellweg in den Stammdaten. Bestellweg in „Einkauf ›
  Lieferanten“ hinterlegen und im Lexikon anzeigen.

## 2026-10-12 · „Fehler melden“ mit Weitergabe an die Werkbank (#1149)

- **Geändert:** Knopf „Fehler melden“ für alle Rollen (Seitenleiste unten, am Handy im „Mehr“-Blatt, Hilfe-Seite,
  Befehlspalette). Dialog `bausteine/fehler-melden.mjs`: „Was ist passiert?“, „Wo?“ (vorbelegt), „Ich komme deswegen
  gerade nicht weiter“; darunter die eigenen Meldungen mit Stand und Ergebnis (Inhaber: alle). Neue Endpunkte
  `POST /api/fehler/melden` (auch Rolle „lesen“) und `GET /api/fehler/liste`; Ablage `operations/lib/fehlermeldungen.mjs`
  (Privatordner, zwei Dateien mit je einem Schreiber), Skript `npm run fehler` (abgleich, werkbank-stand, zeige, liste,
  uebernommen/behoben/verworfen) für den geplanten Lauf „fehlermeldungen-werkbank“. `kern/api.mjs` meldet gescheiterte
  Aufrufe als Ereignis, der Dialog hängt die letzten an. Der 500-Text verweist auf „Fehler melden“ statt „gib Ahmet
  Bescheid“. Sicherung umfasst die beiden Dateien. Werkbank (Version 4): roter Abschnitt „Fehler – muss behoben
  werden“, Kennzeichen „Fehler“, Filter, „Kein Fehler …“ mit Begründung, Leitfaden-Abschnitt.
- **Getestet:** `operations/tests/fehlermeldungen.test.mjs` (10), `tests/fehler-melden-api.test.mjs` (Rollen über den
  Server: lesen/mitarbeiter/inhaber 200, ohne Anmeldung 401, „lesen“ bleibt sonst gesperrt, GET 405, Name aus der
  Sitzung). `dashboard:pruefen` Heute/Hilfe bei 1440–360 px nur `OK`, 0 px Überlauf. Klickstrecke gegen die Kopie:
  Meldung F-001 abgeschickt (Toast mit Nummer), Abgleich per Skript auf „Behoben“ gesetzt, Dialog am Handy (375 px)
  zeigt „Behoben“ samt Ergebnis, „Mehr“-Blatt schließt, keine Konsolenfehler. Werkbank mit Attrappe (1200/390 px):
  Abschnitt oben, Zähler „2 Fehler offen“, „Kein Fehler …“ schreibt Status und Erklärung, keine JS-Fehler.
- **Risiken/Annahmen:** Weitergabe nur, solange die Claude-App auf dem Mac läuft (geplante Aufgabe). Der Lauf
  formuliert Titel und ersetzt Kundendaten – Text der Mitarbeiter ist für ihn Daten, keine Anweisung.
- **Nächste Stufe:** Bei Bedarf Bildschirmfoto an die Meldung hängen (Anhänge wie bei Aufgaben).
