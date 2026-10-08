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
| `lib/auftragsverlauf.mjs` | Zeitleiste je Auftrag (Muster-/Warenstrecke), `naechsterSchritt`, Ereignisse je Auftrag (privat, nur anhängen) |
| `lib/musterherkunft.mjs` | Woher kommt ein Muster: Lieferant oder eigener Bestand (verschicken/vorbeibringen); privat, nur anhängen |
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
  (eigenes Musterlager/Zuschnitt – keine Lieferantenbestellung) und Muster mit
  der Wahl „haben wir da“ (siehe unten).
- Nach dem Absenden setzt die Oberfläche den Status wie bisher über
  `POST /api/einkauf/auftragsstatus` (`status: "bestellt"`).
- `400` bei unbekannter `art`/`ziel`/`gruppe`; ohne `orders.json`
  `{verfuegbar:false, hinweis, mails:[]}`.

## Zurück auf offen und Muster „haben wir da“

**Zurück auf offen.** `setzeZurueckAufOffen()` in `lib/auftragsstatus.mjs` setzt
eine Position von jedem Schritt (`bestellt`/`geliefert`/`raus`/`erledigt`) zurück
auf „noch zu bestellen“ (`status: null`). Der bisherige Stand (Schrittfelder,
Lieferanten-Bestellnummer) wandert mit `{aktion: "zurück auf offen", am, von,
vonStatus, vorher, notiz?}` in `verlauf` der Position; dazu `zurueckGesetztAm/Von/VonStatus`.
Schon offene Positionen werden übersprungen (Rückgabe `null`).
`POST /api/einkauf/auftragsstatus` mit `aktion: "zurueckAufOffen"` und
`positionen: [{orderId, lineItemId}]` (Sammelaktion, auch über Bestellungen) oder
`orderId` + `lineItemId`/`lineItemIds` – nur `orderId` = alle Positionen der
Bestellung. Antwort `{ok, anzahl, eintraege}`. Rolle `lesen`: 403 (Schreibpfad).

**Muster „haben wir da“.** Je Musterbestellung (`lineItemId` leer) oder
Musterposition eine Herkunft: `lieferant` (Standard), `eigen_versand` (aus eigenem
Bestand/Katalog – verschicken), `eigen_vorbei` (persönlich vorbeibringen, Kunde in
der Nähe). Ablage `$TP_PRIVAT_DIR/musterherkunft.json`
(`{version, ereignisse: [{orderId, lineItemId, herkunft, am, von, notiz?}]}`), nur
anhängen, das spätere Ereignis gewinnt (eine Wahl für die ganze Bestellung
überstimmt frühere Einzelwahlen). Teil von `npm run daten:sichern`; Shopify wird nie
geschrieben. Schreiben: `POST /api/einkauf/auftragsstatus` mit
`aktion: "musterHerkunft"`, `orderId`, `herkunft`, optional `lineItemId`, `notiz`.

Wirkung (`musterOhneLieferant()`; gilt wie bisher auch für Route
`SAMPLE_STOCK`/`SAMPLE_CUT`): Die Positionen tragen additiv `musterHerkunft`,
`musterHerkunftAm/Von` und `musterRoute`. Sie stehen nicht in der Bestellmail (sondern
mit Grund unter `ohneBestellung`), zählen nicht als „Muster noch zu bestellen“
(`/api/einkauf/lieferanten`: additiv `musterEigenerBestand`), erzeugen kein To-do
„Muster bei … bestellen“, sondern „Muster vorbeibringen bei <Kunde>“ bzw. „Muster
verschicken an <Kunde>“ mit Ort aus der Lieferadresse. In der Zeitleiste entfallen
„beim Lieferanten bestellt“ und „bei uns angekommen“; beim Vorbeibringen heißt
`raus` „Persönlich übergeben“. Der nächste Schritt ist „Erledigt – Kunde hat Muster“
(`kunde_hat_muster`); der Server setzt dabei die Positionen mit auf `raus`.

## Zeitleiste je Auftrag und nächster Schritt

Logik in `lib/auftragsverlauf.mjs`, Tests in `tests/auftragsverlauf.test.mjs` und
`docs/ai-dashboard/tests/zeitleiste-api.test.mjs`. Jeder offene Auftrag hat genau
einen nächsten Schritt; die Ableitung ist rein (keine Dateizugriffe).

**Strecken.** Reine Musterbestellung (jede Position ein Muster) = Musterstrecke,
alles andere = Warenstrecke. Muster gehen nicht vom Lieferanten zum Kunden: sie
kommen in den Laden, werden neu gelabelt und von uns verschickt.

| Strecke | Schritt (`schritt`) | Anzeige | gesetzt durch | Quelle |
|---|---|---|---|---|
| Muster | `angefragt` | Muster angefragt | automatisch | Bestelldatum (Shopify) |
| Muster | `bestellt` | Muster beim Lieferanten bestellt | Klick | `auftragsstatus.json`, je Position |
| Muster | `geliefert` | Muster bei uns angekommen | Klick | `auftragsstatus.json`, je Position |
| Muster | `raus` | Gelabelt und an Kunden verschickt | Klick, sonst automatisch | `auftragsstatus.json`; automatisch bei vollständig versandter Shopify-Bestellung (`fulfillments`) |
| Muster | `kunde_hat_muster` | Kunde hat Muster | Klick, sonst automatisch | `auftragsverlauf.json`; automatisch nur bei Sendungsstatus „zugestellt“. Ab 3 Tagen seit Versand als Annahme vorgeschlagen (`annahme: true`), nie still gesetzt |
| Muster | `nachgefasst` | Nachgefasst | Klick | `auftragsverlauf.json` |
| Muster | `ergebnis` | Kunde hat bestellt / Kein Interesse | Klick, sonst automatisch | `auftragsverlauf.json`; „Kunde hat bestellt“ automatisch bei späterer Warenbestellung desselben Kunden (Abschluss bleibt ein Klick) |
| Ware | `kunde_hat_bestellt` | Kunde hat bestellt | automatisch | Bestelldatum (Shopify) |
| Ware | `bestellt` | Ware beim Lieferanten bestellt | Klick | `auftragsstatus.json` |
| Ware | `geliefert` | Geliefert an uns (entfällt bei Direktversand) | Klick | `auftragsstatus.json` |
| Ware | `raus` | An Kunden raus | Klick, sonst automatisch | `auftragsstatus.json`; Shopify-Versand |
| Ware | `erledigt` | Erledigt | Klick | `auftragsstatus.json` |

Die Positionsschritte sind die bestehenden Werte aus `lib/auftragsstatus.mjs` –
Datei und Format unverändert. Ein Schritt gilt als getan, wenn alle Positionen
ihn erreicht haben. Schritte je Auftrag liegen als Ereignisliste in
`$TP_PRIVAT_DIR/auftragsverlauf.json` (`{version, auftraege: {<orderId>: {ereignisse: [{schritt, am, von, notiz?, bezug?}]}}}`),
es wird nur angehängt; eine Korrektur ist das Ereignis `zurueck` mit `bezug`.
Die Datei ist Teil von `npm run daten:sichern`.

**Fristen** (Konstanten in `lib/auftragsverlauf.mjs`): `NACHFASSEN_NACH_TAGEN = 5`
(nach „Kunde hat Muster“), `MUSTER_ANGEKOMMEN_ANNAHME_TAGE = 3`,
`ERGEBNIS_KLAEREN_NACH_TAGEN = 14`, `WARE_ABSCHLIESSEN_NACH_TAGEN = 7`. Lieferant
überfällig: `WARTE_NACHHAKEN_TAGE` (7) / `WARTE_PROBLEM_TAGE` (14) aus `lib/lieferanten.mjs`.

**Lesen (additive Felder).** `GET /api/kunden/detail` trägt an jedem Eintrag von
`kunde.auftraege[]`, `GET /api/kunden/bestellungen` an jeder Zeile von `zeilen[]`:

```json
{
  "auftragsart": "muster",
  "zeitleisteAbgeschlossen": false,
  "naechsterSchritt": {
    "wer": "wir", "text": "Nachfassen: Muster liegen seit 6 Tagen beim Kunden",
    "detail": "Kunden anrufen und fragen, ob etwas gefällt.",
    "aktion": "nachgefasst", "knopf": "Nachgefasst",
    "stufe": "faellig", "faelligSeitTagen": 1, "wartetSeitTagen": 6, "annahme": false
  },
  "verlauf": [
    { "schritt": "angefragt", "label": "Muster angefragt", "zustand": "erledigt", "am": "2026-01-01T10:00:00.000Z", "von": null, "automatisch": true, "quelle": "Shopify-Bestellung", "notiz": null, "teil": null },
    { "schritt": "bestellt", "label": "Muster beim Lieferanten bestellt", "zustand": "erledigt", "am": "2026-01-02T10:00:00.000Z", "von": "Mitarbeiter 1", "automatisch": false, "quelle": "manuell", "notiz": null, "teil": null },
    { "schritt": "nachgefasst", "label": "Nachgefasst", "zustand": "aktuell", "am": null, "von": null, "automatisch": false, "quelle": null, "notiz": null, "teil": null },
    { "schritt": "ergebnis", "ergebnis": null, "label": "Ergebnis", "zustand": "offen", "am": null, "von": null, "automatisch": false, "quelle": null, "notiz": null, "teil": null }
  ],
  "verlaufNotizen": [{ "am": "2026-01-09T10:00:00.000Z", "von": "Mitarbeiter 1", "text": "Kunde ist bis Freitag im Urlaub" }]
}
```

- `naechsterSchritt` ist `null`, wenn nichts zu tun ist (abgeschlossen, storniert).
  `wer`: `wir` \| `lieferant` \| `kunde`. `stufe`: `faellig` (wir sind dran),
  `warten` (jemand anderes, in der Frist), `nachhaken` (Lieferant ab 7 Tagen),
  `problem` (ab 14 Tagen). `faelligSeitTagen`: seit wie vielen Tagen fällig
  (0 = heute), `null` solange gewartet wird. `aktion` ist der Wert für `schritt`
  beim Schreiben; `ergebnis` heißt: Auswahl anbieten (`kunde_hat_bestellt`,
  `kein_interesse`, `nachgefasst`). `annahme: true` = Vorschlag, den ein Mensch bestätigt.
- `verlauf[].zustand`: `erledigt` \| `aktuell` \| `offen` \| `uebersprungen`
  (später Schritt getan, dieser nie eingetragen). `teil` = `{erledigt, gesamt}`,
  wenn erst ein Teil der Positionen so weit ist. `automatisch: true` = aus den
  Bestelldaten erkannt, nicht geklickt (`quelle` nennt woher).
- Je Kunde der dringendste Schritt, mit `orderId`/`orderName`: `kunde.naechsterSchritt`
  in `GET /api/kunden/detail` und `treffer[].naechsterSchritt` in `GET /api/kunden/suche`.
- Für eine eigene Auswertung (z. B. Startseite): `zeitleistenFuerModell(modell, {statusAlle, verlaufAlle, jetzt})`
  liefert `Map<orderId, zeitleiste>`; `dringendsterSchritt(liste)` wählt aus.

**Schreiben.** `POST /api/einkauf/auftragsstatus` mit `aktion: "schritt"` (Rollen
wie bisher: `lesen` bekommt 403). Ohne `aktion` verhält sich der Endpunkt unverändert.

```json
{ "aktion": "schritt", "orderId": "gid://shopify/Order/90001", "schritt": "nachgefasst", "notiz": "überlegt noch" }
```

`schritt`: `bestellt` \| `geliefert` \| `raus` \| `erledigt` (setzt alle Positionen des
Auftrags, die noch nicht so weit sind – wie Einzelklicks im Einkauf), `kunde_hat_muster`
\| `nachgefasst` \| `kunde_hat_bestellt` \| `kein_interesse` (Ereignis je Auftrag; ein
Ergebnis setzt zusätzlich die Positionen auf `erledigt`), `notiz` (braucht `notiz`),
`zurueck` (braucht `bezug`). Antwort: `{ok, orderId, schritt, positionen, auftragsart, verlauf, verlaufNotizen, naechsterSchritt, zeitleisteAbgeschlossen}`.
`400` bei unbekanntem oder nicht zur Strecke passendem Schritt, `404` bei unbekannter Bestellung.

## Zugang einrichten (einmalig)

Rechte vergeben, App installieren und Schluessel eintragen macht **nur der
Inhaber** - kein Agent, weder per CLI noch per Browser.

1. `dev.shopify.com` → App "TP Operations" → **Versionen** → neue Version.
   Ins Feld **Bereiche (Scopes)** genau diese Zeile, dann freigeben:

   ```
   read_orders,read_all_orders,write_orders,read_customers,read_draft_orders,read_inventory,write_inventory,read_locations,read_products,write_products,read_fulfillments,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,read_metaobjects,write_metaobjects,read_metaobject_definitions
   ```

   Fuer die Datenquellen des Control Centers genuegen die Lese-Bereiche
   (`LESE_BEREICHE` in `sync/zugang.mjs`): `read_orders,read_all_orders,read_customers,read_draft_orders,read_products,read_metaobjects,read_inventory,read_locations`.
   Die Schreib-Bereiche braucht nur das Auftragsband (`ops.*`-Metafelder),
   `daten:anreichern -- --schreiben` und im Control Center die Ansicht
   „Sonderposten“: `write_inventory` setzt beim Knopf „Im Laden verkauft“ den
   Bestand auf 0, `write_products` schreibt `sonderposten.verkauft_*`
   (`SCHREIB_BEREICHE` in `sync/zugang.mjs`). Fehlt `write_inventory`, bucht
   der Knopf nichts und sagt das; `npm run operations:verbindung` listet
   fehlende Schreibrechte getrennt auf. Ohne `read_all_orders` laesst Shopify
   Bestellungen, die aelter als 60 Tage sind, stillschweigend weg.
2. App im Shop installieren bzw. die geaenderten Bereiche im Shop bestaetigen.
3. Im Ordner, aus dem der Dienst laeuft (Betrieb: `~/tp-dashboard`), die Datei
   `.env.local` anlegen (`chmod 600`, gitignored) mit zwei Zeilen:

   ```
   SHOPIFY_CLIENT_ID=...
   SHOPIFY_CLIENT_SECRET=...
   ```

   **Keine** Zeile `SHOPIFY_ADMIN_TOKEN` dazu: der Token aus
   `npm run shopify:token -- --grant client-credentials` gilt nur 24 Stunden.
   Mit Client-ID und Schluessel holt `sync/zugang.mjs` ihn selbst und erneuert
   ihn vor Ablauf. (Steht doch ein abgelaufener Token daneben, wechselt der
   Proxy beim ersten HTTP 401 auf die Client-Credentials.)
4. Pruefen: `npm run operations:verbindung` - fragt jede Datenquelle einmal an
   und nennt je Quelle `OK` oder was fehlt (Exit 0 = alles lesbar, 2 = kein
   Zugang hinterlegt, 3 = Zugang steht, aber eine Quelle oder ein Bereich fehlt).
5. Dauerdienst einschalten: `bash operations/scripts/dienste-einrichten.sh`.

`npm run operations:einrichten` (`scripts/app-einrichten.sh`) fuehrt die
Schritte 1-4 gefuehrt ueber die Shopify-CLI aus; der Schluessel wird dabei
verdeckt eingegeben und nie ausgegeben. Hintergrund zu den Token-Wegen:
`domains/shopify/admin-token-oauth.md`.

Jede Arbeitskopie hat ihre eigene `.env.local` - ein Zugang im Hauptcheckout
gilt nicht fuer `~/tp-dashboard`. Fehlermeldungen der Aktualisierung nennen
den naechsten Schritt (`wasTun` in `sync/zugang.mjs`): fehlender Zugang,
fehlender Bereich, abgelaufener Token, nicht installierte App.

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

**Massenabfragen fuer den MCP-Weg** liegen neben den Seitenabfragen und
werden nicht mehr von Hand gebaut: `npm run lexikon:export -- --bulk-query`
(Ergebnis per `--jsonl`) und `npm run daten:bulk -- --query
kunden|angebote|warenkoerbe|bestand` (Ergebnis per `daten:bulk -- --teil ...`,
dann `daten:aktualisieren -- --input ...`). Die Lexikon-Abfrage traegt bewusst
kein `templateSuffix`: Produktgruppe ist der `productType`.

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

Das Lexikon (Massenabfrage ueber alle Produkte) laeuft nur alle
`TP_SYNC_LEXIKON_MINUTEN` (Standard 60) mit, nach einem Fehlschlag gleich im
naechsten Intervall wieder; alle anderen Teile laufen in jedem Intervall.

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
