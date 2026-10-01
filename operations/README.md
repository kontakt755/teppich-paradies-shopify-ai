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
| `lib/lieferanten.mjs` | Lieferanten-Stammdaten (privat), Übersicht je Lieferant, `bestellmail` (Text + `mailto:`) |
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

## Lieferanten: Stammdaten, Übersicht, Bestellmail

Ziel: Bestellen mit einem Klick. Logik in `lib/lieferanten.mjs`, Tests in
`tests/lieferanten.test.mjs` und `docs/ai-dashboard/tests/lieferanten-api.test.mjs`.
**Es wird nichts versendet** (D8) – die Endpunkte liefern Text und einen
`mailto:`-Link, abschicken tut ein Mensch.

### Stammdaten (privat)

`$TP_PRIVAT_DIR/lieferanten/stammdaten.json` – nie im Repository. Vorlage mit
Pseudonymen: `lib/lieferanten.beispiel.json`. Schlüssel unter `lieferanten` ist
die Kennung aus der Bestellübersicht (`A`, `B`, … – dieselbe wie
`gruppen[].lieferant`). Leere Felder (`""`/`null`) gelten als nicht hinterlegt.

| Feld | Inhalt |
|---|---|
| `anzeigename` | Name für die Oberfläche (sonst „Lieferant A“) |
| `kundennummer` | unsere Kundennummer beim Lieferanten |
| `ware.weg` | `portal` \| `mail` \| `telefon`, dazu `ware.portalUrl`, `ware.mail`, `ware.telefon` |
| `muster.weg` | wie oben, dazu `muster.ansprechperson`, `muster.mail`, `muster.telefon`, `muster.portalUrl` |
| `muster.lieferung` | `kunde` (Lieferant schickt direkt an den Kunden) \| `laden` |
| `lieferzeitWerktage` | übliche Lieferzeit, ganze Zahl |
| `mindestmenge`, `hinweise` | Freitext |
| `mail.anrede`, `mail.gruss` | überschreiben Anrede/Grußformel der Mails |
| `absender` (oberste Ebene) | `firma`, `kontaktName`, `telefon`, `mail`, `lieferanschrift {name, strasse, plz, ort, land}` – Grußformel und Lieferanschrift „Laden“ |

Fehlt die Datei, ist sie kaputt oder ein Wert ungültig (Weg unbekannt, keine
Mailadresse, URL nicht http/https), wirft nichts: der Wert wird `null`, der
Grund steht in `stammdatenDatei.fehler`. Zurück kommen nur die Felder aus der
Tabelle – zusätzliche Einträge (z. B. Konditionen) verlassen den Rechner nicht.

### Endpunkte

Alle `GET`, nur im lokalen Server, gleiche Herkunftsprüfung wie die übrigen
Einkaufs-Endpunkte, lesbar für jede angemeldete Rolle (`lesen`, `mitarbeiter`,
`inhaber`, Notzugang). Keine Preise in den Antworten.

**`GET /api/einkauf/lieferanten`** – alle Lieferanten aus Stammdaten und offenen
Positionen; nicht zugeordnete Positionen als `id: "UNGEKLAERT"` am Ende.

```json
{
  "verfuegbar": true,
  "hinweis": null,
  "stammdatenDatei": { "vorhanden": true, "quelle": "…/lieferanten/stammdaten.json", "fehler": [], "hinweis": null, "absenderHinterlegt": true },
  "schwellen": { "nachhakenTage": 7, "problemTage": 14 },
  "lieferanten": [{
    "id": "A",
    "name": "Lieferant A",
    "zugeordnet": true,
    "stammdaten": {
      "id": "A", "name": "Lieferant A", "anzeigename": "Lieferant A", "kundennummer": "K-000001",
      "ware": { "weg": "portal", "portalUrl": "https://lieferant-a.example/haendler", "mail": "bestellung@lieferant-a.example", "telefon": "+49 30 1111111" },
      "muster": { "weg": "mail", "ansprechperson": "Frau Muster", "mail": "muster@lieferant-a.example", "telefon": null, "portalUrl": null, "lieferung": "kunde" },
      "lieferzeitWerktage": 5, "mindestmenge": "…", "hinweise": "…",
      "mail": { "anrede": "Guten Tag Frau Muster,", "gruss": "…" },
      "fehlend": [], "hinterlegt": true
    },
    "positionen": { "zuBestellen": 1, "bestellt": 1, "unterwegs": 1 },
    "muster": { "zuBestellen": 1, "bestellt": 1, "unterwegs": 0 },
    "aeltesteOffeneBestellungTage": 16,
    "aeltesteUnbestellteTage": 19,
    "ueberfaellig": { "nachhaken": 1, "problem": 1 },
    "gruppen": [{ "schluessel": "A|SUPPLIER_TO_TP|TP", "route": "SUPPLIER_TO_TP", "lieferziel": "TP", "zuBestellen": 1 }]
  }]
}
```

- `stammdaten.fehlend` nennt, was noch einzutragen ist (z. B. `["kundennummer", "ware.weg"]`);
  `hinterlegt: false` heißt: gar nichts eingetragen.
- Stufen wie im Auftragsfluss (`filterGruppe` in `lib/auftragsstatus.mjs`):
  `zuBestellen` = noch kein Status, `bestellt`, `unterwegs` = „Geliefert an uns“/„An Kunden raus“.
  Erledigte Positionen zählen nicht.
- `aeltesteOffeneBestellungTage`: älteste Bestellung beim Lieferanten, die noch
  nicht bei uns ist (Tage seit `bestelltAm`). `aeltesteUnbestellteTage`: älteste
  Kundenbestellung, für die noch nichts bestellt wurde.
- `ueberfaellig`: Wartezeit wie im Frontend (`AF_WARTE_WARN`/`AF_WARTE_CRIT`):
  ab 7 Tagen `nachhaken`, ab 14 Tagen `problem`.
- `gruppen[].schluessel` ist der Wert für `gruppe=` der Bestellmail.

**`GET /api/einkauf/lieferant?id=A`** – ein Lieferant wie oben (unter
`lieferant`), zusätzlich `ware` und `musterPositionen` (je
`{zuBestellen, bestellt, unterwegs}` als Listen) und `ueberfaelligePositionen`.
`400` ohne `id`, `404` bei unbekannter Kennung. Position:

```json
{ "orderId": "gid://shopify/Order/90001", "orderName": "#T1", "orderDatum": "2026-01-01T10:00:00Z", "lineItemId": "gid://shopify/LineItem/1",
  "titel": "Testdiele Eiche", "farbe": "Natur", "sku": "TEST-A-1", "artikelnummer": "A-4711", "farbnummer": "012",
  "menge": 3, "einheit": "paket", "mengeText": "3 Paket(e) = 6,60 m²", "mengeHinweis": null, "kundenmenge": "3 Stk.",
  "route": "SUPPLIER_TO_TP", "istMuster": false, "lieferantUrl": null,
  "status": "bestellt", "gruppe": "bestellt", "lieferantBestellnummer": "AB-1", "bestelltAm": "2026-01-04T10:00:00Z",
  "wartetage": 16, "warnstufe": "problem", "kundenbestellungTage": 19 }
```

Ungeklärtes ist `null` (nie der Text `UNGEKLAERT`).

**`GET /api/einkauf/bestellmail?lieferant=A&art=ware[&gruppe=<schluessel>]`**
bzw. **`…&art=muster[&ziel=kunde|laden]`** – fertige Bestellung(en). Ware: eine
Mail je Gruppe (Lieferant + Route + Lieferziel; Direktversand verschiedener
Kunden wird nie gemischt), ohne `gruppe` alle Gruppen des Lieferanten. Muster:
eine Mail mit allen offenen Mustern; `ziel` überstimmt `muster.lieferung`.

```json
{
  "verfuegbar": true,
  "lieferant": "A", "name": "Lieferant A", "art": "ware", "automatischGesendet": false,
  "mails": [{
    "art": "ware", "weg": "portal", "gruppe": "A|SUPPLIER_TO_TP|TP", "route": "SUPPLIER_TO_TP", "lieferziel": "laden",
    "an": "bestellung@lieferant-a.example", "ansprechperson": null,
    "portalUrl": "https://lieferant-a.example/haendler", "telefon": "+49 30 1111111",
    "betreff": "Bestellung – Kd.-Nr. K-000001 – #T1",
    "text": "Guten Tag Frau Muster,\n\nwir bestellen folgende Ware:\n\nUnsere Kundennummer: K-000001\n\n1. Art.-Nr. A-4711 · Farb-Nr. 012\n   Testdiele Eiche, Natur\n   Menge: 3 Paket(e) = 6,60 m²\n   Kommission: #T1\n\nLieferanschrift:\n…",
    "mailto": "mailto:bestellung@lieferant-a.example?subject=Bestellung%20…&body=…",
    "mailtoGekuerzt": false,
    "positionen": [ { "…": "wie oben" } ],
    "fehlt": [{ "orderId": "…", "orderName": "#T1", "lineItemId": "…", "titel": "Testleiste", "farbe": "Weiß", "istMuster": false, "gruende": ["Artikelnummer beim Lieferanten fehlt"] }],
    "stammdatenFehlt": [],
    "hinweise": [],
    "bereitsBestellt": 0
  }]
}
```

Für die Oberfläche:

- **`fehlt`** sind Positionen, die NICHT in der Mail stehen: Artikelnummer beim
  Lieferanten fehlt, Bestellmenge ungeklärt, Lieferanschrift fehlt, Lieferziel
  der Muster nicht festgelegt. Sie müssen sichtbar bleiben – stillschweigend
  weggelassen wird nichts. Eine fehlende Farbnummer blockiert nicht (die Farbe
  steht als Name in der Mail), erscheint aber in `hinweise`.
- **`mailto`** ist fertig kodiert (RFC 6068, Zeilenumbruch `%0D%0A`). Ist der
  Link länger als 1800 Zeichen, trägt er nur Empfänger und Betreff und
  `mailtoGekuerzt` ist `true` – dann `text` kopieren lassen. Ohne hinterlegte
  Mailadresse sind `an` und `mailto` `null`; `text` bleibt zum Kopieren
  (Portal/Telefon), `stammdatenFehlt` nennt die Lücke.
- Schon bestellte Positionen (Auftragsfluss-Status gesetzt) kommen nicht mehr
  in die Mail (`bereitsBestellt` zählt sie). Ist nichts mehr offen, sind
  `betreff`/`text`/`mailto` `null`.
- Muster: `lieferziel` ist `kunde` (Anschrift je Kundenbestellung im Text) oder
  `laden`; `ohneBestellung` listet Muster mit Route `SAMPLE_STOCK`/`SAMPLE_CUT`
  (eigenes Musterlager/Zuschnitt – keine Lieferantenbestellung).
- Nach dem Absenden setzt die Oberfläche den Status wie bisher über
  `POST /api/einkauf/auftragsstatus` (`status: "bestellt"`).
- `400` bei unbekannter `art`/`ziel`/`gruppe`; ohne `orders.json`
  `{verfuegbar:false, hinweis, mails:[]}`.

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

Lexikon, Bestellübersicht, Kennzahlen, Kunden, Angebote, Warenkörbe und
Bestand sind private Momentaufnahmen unter `$TP_PRIVAT_DIR` (Standard
`~/teppich-paradies-analyse`) und veralten, sobald sich im Shop etwas ändert -
neues Produkt, neue Bestellung, geänderter Preis. `operations/scripts/aktualisieren.mjs`
erneuert alle Teile nacheinander in einem Aufruf:

```
npm run daten:aktualisieren
npm run daten:aktualisieren -- --nur lexikon
npm run daten:aktualisieren -- --nur bestellungen,kennzahlen
npm run daten:aktualisieren -- --nur kunden,angebote,warenkoerbe,bestand
```

Erneuert: Lexikon (Produkte/Varianten/Metafelder, wie `lexikon:export --live`),
Bestellübersicht und Kennzahlen (35-Tage-Fenster, deckt die 7/30-Tage-Auswertung),
sowie vier weitere Datenarten (Phase seit 2026-09-24):

- **Kunden** (`operations/sync/customers.mjs`, `lib/kunden.mjs`) - eigene
  Datenart, nicht nur aus Bestellungen abgeleitet: Name, E-Mail, Telefon,
  Lebenszeit-Bestellzahl und -Umsatz (`numberOfOrders`/`amountSpent`, nicht
  aus dem 90-Tage-Fenster gerechnet), Tags, Adressen, Notiz,
  Marketing-Einwilligung. Zeigt auch Kunden ohne aktuelle Bestellung.
  → `$TP_PRIVAT_DIR/kunden/kunden.json`
- **Angebote/Entwürfe** (`sync/draftOrders.mjs`, `lib/angebote.mjs`) - Mass-
  und Verlegeangebote (Shopify `DraftOrder`), die noch keine Bestellung sind:
  Nummer, Kunde, Betrag, Status, Positionen.
  → `$TP_PRIVAT_DIR/angebote/angebote.json`
- **Abgebrochene Warenkörbe** (`sync/abandonedCheckouts.mjs`, `lib/warenkoerbe.mjs`) -
  letzte 30 Tage, noch nicht abgeschlossen: Zeitpunkt, Kunde/E-Mail sofern
  vorhanden, Warenkorbwert, Positionen - verlorener Umsatz, den das Dashboard
  vorher nicht zeigte. → `$TP_PRIVAT_DIR/warenkoerbe/warenkoerbe.json`
- **Lagerbestand** (`sync/inventory.mjs`, `lib/bestand.mjs`) - je Standort und
  Variante (`available`/`on_hand`/`committed`/`incoming`). Führt der Shop
  keinen Lagerbestand (keine getrackte Variante), steht das ausdrücklich als
  `gefuehrt:false` mit Hinweis in der Datei - keine erfundenen Nullen.
  → `$TP_PRIVAT_DIR/bestand/bestand.json`
- **Erfüllungen/Rückerstattungen** (`lib/erfuellung.mjs`) - läuft ohne
  eigenen Abruf mit, weil `sync/orders.mjs` (`ORDERS_QUERY`) `fulfillments`
  (Status, Sendungsnummer, Träger) und `refunds` (Betrag, Grund) je Bestellung
  bereits mitliefert; wird beim Teil "bestellungen" mitgeschrieben.
  → `$TP_PRIVAT_DIR/erfuellung/erfuellung.json`

Lesende API-Endpunkte fürs Dashboard: `GET /api/kunden/liste`,
`/api/angebote/liste`, `/api/warenkoerbe/liste`, `/api/bestand/liste`,
`/api/erfuellung/liste` (`scripts/dashboard-api.mjs`/`serve-dashboard.mjs`) -
nur Datenschicht, die Oberfläche folgt separat.

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
