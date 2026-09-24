# operations/ — Auftrags- und Einkaufsmodul (V3, Phase 3a)

Zweck: Bestellungen aus Shopify lesen, je Position das Beschaffungsobjekt
(`procurement_item`) aufloesen, Mengen in Einkaufsmengen umrechnen, Routen
und Auftragsstatus bestimmen und Einkaufsbestellungen je Lieferant gruppieren.
Grundlage: `audit/tp-operations-v3/` (02 Datenmodell, 05 Entscheidungen,
09 Einkauf, 10 Fulfillment).

## Grenzen

- **Keine Kundendaten in `docs/`, Issues oder `issues.json`** (D1). Das Repo
  ist oeffentlich. Kundendaten bleiben in Shopify; lokale Caches/Logs gehoeren
  unter `ops/` (gitignored, spaeter) und nie ins Repository.
- **Kein zweiter Admin-Client** (D6). Einziger Zugang ist
  `workflow/graphql-proxy.mjs`, hier importiert, nicht kopiert.
- **Keine Lieferanten-Klarnamen.** Lieferanten heissen A–D; Einkaufs-IDs
  tragen das Pseudonym-Kuerzel.
- **Nichts wird geraten.** Fehlende Stammdaten, unbekannte Lieferantenschritte
  und unlesbare Masse heissen `UNGEKLAERT` (D7). Keine Rundungsregeln, die nicht
  in den Rechnern (`blocks/paket-auswahl.liquid`, `blocks/tp-rollware-rechner.liquid`,
  `blocks/tp-zubehoer-menge.liquid`, `assets/tp-masstepich-rechnung.js`) stehen.
- **Einkauf wird nie automatisch gesendet** (D8). `bestellungAusGruppe` liefert
  nur den Entwurf.
- Shopify-Schreibzugriff nur auf Order-Metafelder `ops.*` und Tags; nie auf
  Produkte, Preise oder Varianten aus diesem Modul.

## Module

| Datei | Inhalt |
|---|---|
| `lib/umrechnung.mjs` | `rollenware`, `paketware`, `leisten`, `stueck`, Enum `EINHEIT` |
| `lib/resolve.mjs` | `resolveLineItem` (einkauf.*, custom.*, Grosshaendler-ID-Kaskade, Properties, Masspruefung) |
| `lib/ampel.mjs` | `procurementReady` je Produktgruppe |
| `lib/route.mjs` | Enum `ROUTE`, `routeFor` mit Prioritaet und Override-Protokoll |
| `lib/einkauf.mjs` | `gruppieren`, `einkaufsId`, `bestellungAusGruppe`, Enum `EINKAUF_STATUS` |
| `lib/status.mjs` | Enum `AUFTRAG_STATUS`, Uebergaenge, `ableiten(order)` |
| `sync/orders.mjs` | `fetchOrdersSince`, `writeOrderState` (mit Gegenlesen) |

## Start

Noch kein Einstiegsskript; die Oberflaeche folgt in Phase 3b (lokal/privat,
nie unter `docs/`). Tests:

```
node --test operations/tests/*.test.mjs
```

## Umgebung

`SHOPIFY_ADMIN_TOKEN` (`shpat_`, Scopes laut D3) ausschliesslich in
`.env.local` des Betriebs-Rechners. Ohne Token laeuft der Proxy im Sammelmodus:
Queries landen nur im Log, es werden keine Bestellungen geladen und nichts
geschrieben. `atkn_`-Token werden vom Proxy abgelehnt.

## Bestelluebersicht

Interne Seite fuer das Team: was fuer offene Kundenbestellungen bei welchem
Lieferanten nachzubestellen ist, plus Auftragsampel. Logik kommt ausschliesslich
aus `lib/resolve.mjs` (Grosshaendler-ID-Kaskade), `lib/umrechnung.mjs`
(Einkaufsmenge, sonst `UNGEKLAERT`), `lib/einkauf.mjs` (`gruppieren`),
`lib/status.mjs` und `lib/ampel.mjs`; Aufbereitung in `lib/bestelluebersicht.mjs`.

Inhalt:

- **Zu bestellen je Lieferant** – offene, nicht stornierte Positionen, gruppiert
  nach Lieferant (Pseudonym A–D aus `einkauf.lieferant`, sonst Quelle der
  Grosshaendler-ID, sonst `lieferant.bevorzugt`, sonst `UNGEKLAERT`). Je Gruppe
  ein Knopf „Liste kopieren“ (Klartext: ID | Artikel | Farbe | Menge | Bestellnr.).
- **Muster** getrennt; die ID kommt aus der Quellvariante (`_Quellvariante_ID`).
- **Auftraege** – Ampel, Beratung/Telefon/Massprüfung/Verlegung aus den
  Cart-Attributen, Zahlung/Versand, Link in den Shopify-Admin.

Aufruf, Variante 1 – Export ueber den Shopify-MCP (kein Token noetig):

1. `graphql_query` mit Orders (`id name createdAt cancelledAt
   displayFinancialStatus displayFulfillmentStatus customAttributes` und
   `lineItems { … variant { einkauf/lieferant-Metafelder, product { custom,
   grosshandel } } }`, Form wie `ORDERS_QUERY` in `sync/orders.mjs`).
   Optional die Quellvarianten der Muster ueber `nodes(ids:)` als
   `quellvarianten` dazulegen.
2. Ablegen als `~/teppich-paradies-analyse/bestelluebersicht/orders.json`
   (`{orders:[…], quellvarianten:[…]}` oder die rohe Antwort `{data:{orders}}`).
3. `npm run ops:bestelluebersicht -- --input ~/teppich-paradies-analyse/bestelluebersicht/orders.json`

Variante 2 – automatisch mit Token:

```
npm run ops:bestelluebersicht -- --live --tage 60
```

liest ueber `sync/orders.mjs` `fetchOrdersSince`. Zugang in `.env.local`
(`SHOPIFY_ADMIN_TOKEN` oder `SHOPIFY_CLIENT_ID`/`SECRET`), Einrichtung siehe
`domains/shopify/admin-token-oauth.md`; noetig ist mindestens der Scope
`read_orders` (plus `read_products` fuer die Metafelder). Ohne Zugang bricht
`--live` mit Hinweis ab.

Ausgabe: `~/teppich-paradies-analyse/bestelluebersicht/bestelluebersicht.html`
(`--output` aendert das). Die Seite enthaelt Bestelldaten; das Skript verweigert
jeden Pfad innerhalb des Repositorys. Nichts wird nach Shopify geschrieben.

## Auftragsband

`npm run operations:band -- --input <bestellungen.json>` oder `-- --live` startet
den lokalen Server auf 127.0.0.1:8123. Er zeigt EINEN Auftrag, nicht eine
Tabelle: Kunde mit Schnellaktionen, Statusband, Positionen mit Grosshaendler-ID,
Kunden- und Einkaufsmenge, Route, Ampel und Masspruefung, darunter FREIGEBEN,
SPAETER, PROBLEM. Tastatur: Enter, S, P, Pfeile, Esc; die beiden folgenreichen
Knoepfe fragen nach.

Rollen ueber `OPS_ROLLE` (leitung, verkauf, einkauf, lager, kundenservice)
blenden Bereiche aus und sperren Endpunkte serverseitig. Eine echte Anmeldung
ist Entscheidung D11 und bewusst noch nicht gebaut.

Zustaende landen bis zum Shopify-Schreibzugriff in `.router/ops-state/auftraege.jsonl`
(gitignored, append-only, mit Zeit und Mitarbeiter). Sobald ein Token vorliegt,
spiegelt `sync/orders.mjs writeOrderState` dieselben Felder nach `ops.*`.

Bestelldaten gehoeren nie ins Repository: Momentaufnahmen liegen unter
`~/teppich-paradies-analyse/ops/`.

## Produktlexikon

Mitarbeiter-Nachschlagewerk: der Kunde nennt den Shop-Produktnamen, das
Lexikon liefert das Original beim Lieferanten (Artikelnummer, Farbnummer,
Kollektion, Direktlink). Logik in `lib/lexikon.mjs` (`aufbereiten`, `suche`),
Datenformat dort dokumentiert (Kommentarkopf).

Aufruf, Variante 1 - Export ueber den Shopify-MCP (kein Token noetig):
Produkte samt Varianten und Metafeldern (`einkauf.*`, `custom.*`) als
`{produkte:[...]}` oder `{data:{products:{nodes:[...]}}}` ablegen, dann

```
npm run lexikon:export -- --input <datei.json>
```

Variante 2 - automatisch mit Token (`SHOPIFY_ADMIN_TOKEN`, `shpat_`, siehe
`domains/shopify/admin-token-oauth.md`):

```
npm run lexikon:export -- --live
```

laeuft ueber `bulkOperationRunQuery` (Lesevorgang, kein Schreibzugriff).

Ausgabe: `~/teppich-paradies-analyse/lexikon/produkte.json` (`--ziel` aendert
das). **Die Datei enthaelt echte Lieferantendaten** (Artikelnummern, Farb-
nummern, Kollektionen, URLs, Preise) und bleibt lokal - das Skript verweigert
jeden Zielpfad innerhalb des Repositorys (gleiche Pruefung wie
`kennzahlen-export.mjs`). Nichts wird nach Shopify geschrieben.

## Anreicherung aus Lieferantenseiten

Ersetzt zwei zuvor nur lokal liegende, nicht versionierte Python-Skripte
(`~/teppich-paradies-analyse/einkauf-kollektion/plan_aus_cache.py` und
`build_technik_plan.py`) durch einen getesteten Teil des Repositorys - gleiches
Verhalten, jetzt mit Tests und ohne Python-Abhängigkeit. Logik in
`lib/lieferantenseiten.mjs` (Zuordnung Attributtabelle → Metafeld, Einheiten
`mm`/`dB` mit deutschem Komma, Metaobjekt-Zuordnung nur bei exakter
Entsprechung, vorhandene Werte werden nie überschrieben), Tests in
`operations/tests/lieferantenseiten*.test.mjs`.

**Abruf** (`scripts/lieferantenseiten-holen.mjs`, `npm run lieferantenseiten:holen`):
höflicher, fortsetzbarer Abruf der Lieferant-A-Produktseiten - eine Seite je
120 s (`robots.txt`-Crawl-delay), fertige Seiten werden nie erneut geholt,
jede Seite landet sofort im Cache. Die echte Basis-URL steht ausschließlich in
`$TP_PRIVAT_DIR/lieferantendaten/lieferant-a.env` (`LIEFERANT_A_BASIS=...`,
CLAUDE.md Punkt 8) - im Repository nur `lieferant-a.example`.
`npm run lieferantenseiten:holen -- --stand` zählt nur, `--einmal` holt genau
eine Seite (Debug). `SIGTERM`/`SIGINT` beenden sauber nach der aktuell
laufenden Seite.

**Plan** (`scripts/anreicherung.mjs`, `npm run daten:anreichern`): baut aus
dem Seiten-Cache, dem Katalog-Abgleich (`lieferant-a-recherche`-Skill) und
dem Lexikon (`lexikon/produkte.json`) Schreibpakete für zwei Feldgruppen:

- `einkauf.lieferant_kollektion` / `einkauf.marke` (Varianten-Metafelder,
  direkt aus der Seite)
- technische `custom.*`-Produktfelder (Brandverhalten, Nutzungsklasse,
  Fußbodenheizung, Stärke, Rücken, Material, Florhöhe, Trittschall,
  Komfortklasse, Fasermaterial) - nur Felder, die im Lexikon heute leer sind

Standardmäßig wird **nur geplant**. Ausgabe unter
`$TP_PRIVAT_DIR/anreicherung/`: `plan.json`, `rollback.json`, `offen.json`
(fehlende Seite, kein SKU-Treffer, widersprüchliche Varianten, fehlender
Metaobjekt-Eintrag), `konflikte.json`, `neue-metaobjekte.json` (Rohwerte ohne
Entsprechung - Inhaberentscheidung, nie automatisch angelegt) und
`batches/x*.gql` (8 aliasierte `metafieldsSet` je Datei, höchstens 25
Metafelder je Aufruf, Format aus `.claude/skills/shopify-massendaten/SKILL.md`).

Erst `npm run daten:anreichern -- --schreiben` schreibt, über den Token aus
`.env.local` (`operations/sync/zugang.mjs`, gleicher Zugang wie oben) und mit
Gegenprobe je geplantem Wert danach (`write-log.json`: gleich/abweichend/
fehlend) - `userErrors: []` beim Schreiben gilt nicht als Beleg.

## Zugang einrichten (einmalig)

```
npm run operations:einrichten
```

Setzt die Zugriffsbereiche der App "TP Operations", veroeffentlicht die Version,
oeffnet die Installationsadresse und legt Client-ID und geheimen Schluessel in
`.env.local` ab (chmod 600, gitignored). Danach holt es den Token und prueft die
Verbindung. Der Schluessel wird verdeckt eingegeben und nie ausgegeben.

Jeder Schritt ist wiederholbar; bricht einer ab, nennt die Meldung den Weg von
Hand. Hintergrund zu den Token-Wegen: `domains/shopify/admin-token-oauth.md`.

## Aktualisierung (alle Datenquellen in einem Lauf)

Lexikon, Bestellübersicht und Kennzahlen sind private Momentaufnahmen unter
`$TP_PRIVAT_DIR` (Standard `~/teppich-paradies-analyse`) und veralten, sobald
sich im Shop etwas ändert - neues Produkt, neue Bestellung, geänderter Preis.
`operations/scripts/aktualisieren.mjs` erneuert alle drei nacheinander in
einem Aufruf:

```
npm run daten:aktualisieren
npm run daten:aktualisieren -- --nur lexikon
npm run daten:aktualisieren -- --nur bestellungen,kennzahlen
```

Erneuert: Lexikon (Produkte/Varianten/Metafelder, wie `lexikon:export --live`),
Bestellübersicht und Kennzahlen (35-Tage-Fenster, deckt die 7/30-Tage-Auswertung).
Jeder Teil läuft unabhängig: ein Fehler in einem Teil (z. B. Rate-Limit)
verhindert die anderen nicht, und die vorhandene Ausgabedatei bleibt
unverändert stehen, wenn ein Abruf scheitert - lieber alte Daten mit
erkennbarem Datum als gar keine.

**Bestellungen - Abgrenzung (seit 2026-09-23):** kein festes Limit mehr. Geholt
wird, vollständig paginiert (`pageInfo.hasNextPage`/`endCursor`, `first: 50`
je Seite), was `fetchOrdersRelevant` in `operations/sync/orders.mjs` liefert:
**alle Bestellungen der letzten 90 Tage** (`created_at`, nicht `updated_at` -
eine seit Wochen unveränderte, aber inhaltlich noch offene Bestellung soll
nicht aus alleiniger Trägheit aus dem Fenster fallen) **ODER alle noch nicht
vollständig erfüllten** (`fulfillment_status:unfulfilled` bzw. `:partial`),
unabhängig vom Alter - eine vor Monaten aufgegebene, nie ausgelieferte
Bestellung darf im Control Center nicht verschwinden. Das ersetzt die
vorherige Regel "letzte 50 Bestellungen nach `updatedAt`", bei der eine um
15 Uhr eingegangene Bestellung an einem geschäftigen Tag erst am nächsten
Lauf sichtbar wurde. Zwischen den Seiten wird bei knappem Guthaben laut dem
von Shopify gemeldeten `extensions.cost.throttleStatus` gewartet
(`wartenBeiThrottle`), statt mit `THROTTLED` abzubrechen. Die Quellvarianten
der Muster werden ebenfalls ohne festes Limit geladen: `nodes(ids:)` nimmt
bis zu 250 IDs je Aufruf, bei mehr wird in Gruppen nachgeladen.

Ergebnis steht in `$TP_PRIVAT_DIR/aktualisierung.json`: je Teil Zeitpunkt,
Dauer, Anzahl Datensätze und Erfolg/Fehler samt Meldung. Das Control Center
liest diese Datei über `/api/aktualisierung` und zeigt "Stand: …" je
Datenquelle in der Kachel "Systemgesundheit" (Startseite "Heute" und
"Insights"); ab 24 Stunden Alter erscheint dort der Hinweis "Daten veraltet -
bitte `npm run daten:aktualisieren` ausführen" (siehe
`docs/control-center/ARCHITEKTUR.md`, Abschnitt 10).

**Zugang:** braucht `SHOPIFY_ADMIN_TOKEN` oder `SHOPIFY_CLIENT_ID`/`SECRET` in
`.env.local` (`operations/sync/zugang.mjs`, Einrichtung siehe
`domains/shopify/admin-token-oauth.md` bzw. `npm run operations:einrichten`
oben). Fehlt der Zugang, bricht jeder Teil mit genau dieser Meldung ab - kein
stiller Fehlschlag, keine erfundenen Zahlen. Der Shopify-MCP zählt hier nicht:
er läuft nur innerhalb einer Claude-Sitzung, dieses Skript aber auch ohne eine
laufende Sitzung (z. B. per geplanter Aufgabe). Für den MCP-Weg ohne Token
bleiben die einzelnen `--input`-Varianten von `lexikon:export`,
`kennzahlen:export` und `ops:bestelluebersicht`.

**Von Hand starten:** einfach `npm run daten:aktualisieren` in einem Terminal
mit Repository als Arbeitsverzeichnis, Token in `.env.local`.

**Täglich automatisch:** über eine geplante Aufgabe in Claude Desktop
(`~/.claude/scheduled-tasks/`) - z. B. taeglich frueh `npm run
daten:aktualisieren` im Repository-Pfad dieses Rechners. Die Aufgabe braucht
einen eingeschalteten Rechner mit diesem Repository und `.env.local`; sie
läuft nicht in der Cloud. Anlegen z. B. mit der `schedule`-Fähigkeit einer
Claude-Code-Sitzung auf diesem Mac, oder von Hand als Cron-/launchd-Job, der
`npm run daten:aktualisieren` mit `cwd` auf dieses Repository ausführt.

**War der Rechner aus:** die geplante Aufgabe läuft schlicht nicht - kein
Fehler, keine Benachrichtigung. Sichtbar wird das ausschließlich über das
Alter im Dashboard (Kachel "Systemgesundheit"): steht dort "Daten veraltet",
reicht ein manueller Lauf von `npm run daten:aktualisieren`, sobald der
Rechner wieder läuft und online ist. Es gibt keinen Nachhol-Mechanismus, der
verpasste Läufe automatisch aufholt.

## Sync-Dienst (häufigere Aktualisierung)

`operations/scripts/sync-dienst.mjs` führt `aktualisieren()` in einer
Dauerschleife aus, statt nur über eine geplante Aufgabe ein- bis zweimal
täglich:

```
npm run daten:sync-dienst
TP_SYNC_INTERVALL_MINUTEN=5 npm run daten:sync-dienst   # Standard 10
```

Ablauf: sofortiger erster Lauf, danach ein Lauf je Intervall (die Wartezeit
beginnt erst, wenn der vorherige Lauf fertig ist - kein Überlappen). Ein
Fehler in einem Lauf (Ratenlimit, Netzwerk, ein einzelner kaputter Teil) wird
protokolliert; der Dienst läuft weiter und versucht es im nächsten Intervall
erneut - dieselbe Regel wie in `aktualisieren.mjs`: alte Daten mit
erkennbarem Datum sind besser als keine. `SIGTERM`/`SIGINT` brechen nur die
Wartezeit ab, nie einen laufenden Aktualisierungslauf, und beenden den
Prozess danach regulär.

**Ohne Zugang** (`SHOPIFY_ADMIN_TOKEN` oder `SHOPIFY_CLIENT_ID`/`SECRET` in
`.env.local`) startet der Dienst nicht still folgenlos: er meldet das Fehlen
klar auf stderr und beendet sich mit Exit-Code 1.

**Dauerhaft im Hintergrund (macOS, launchd):** Vorlage
`operations/launchagents/net.teppich-paradies.sync.plist.vorlage` (Platzhalter
`__HOME__`, `__REPO_PFAD__`, `__NODE_PFAD__` - Anleitung steht als Kommentar
in der Datei):

```
mkdir -p ~/Library/LaunchAgents
sed -e "s#__HOME__#$HOME#g" \
    -e "s#__REPO_PFAD__#$(pwd)#g" \
    -e "s#__NODE_PFAD__#$(which node)#g" \
    operations/launchagents/net.teppich-paradies.sync.plist.vorlage \
    > ~/Library/LaunchAgents/net.teppich-paradies.sync.plist
launchctl load ~/Library/LaunchAgents/net.teppich-paradies.sync.plist
```

Beenden/Deinstallieren: `launchctl unload
~/Library/LaunchAgents/net.teppich-paradies.sync.plist` (danach optional
`rm`). Log liegt unter `~/Library/Logs/teppich-paradies-sync.log`. `launchd`
startet den Dienst bei jedem nicht-erfolgreichen Beenden neu (`KeepAlive`,
`ThrottleInterval` 60s) - auch ohne Zugang, dann wiederholt sich die
Fehlermeldung im Log, bis `.env.local` eingerichtet ist.

Ersetzt keine geplante Aufgabe, die den Rechner nicht ständig am Laufen hat -
der Dienst braucht wie die geplante Aufgabe einen eingeschalteten,
angemeldeten Mac mit diesem Repository.
