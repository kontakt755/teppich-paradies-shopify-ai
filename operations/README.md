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
