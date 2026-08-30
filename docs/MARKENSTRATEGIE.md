# Markenstrategie und Feed-Identität

Stand: 2026-08-30. Diese Seite hält Entscheidungen fest, die im Chat getroffen
wurden, und begründet sie. Sie ersetzt keine Rechtsberatung — die
Markenrecherche liegt beim Menschen.

## Entschieden

**Eine Hausmarke für alle vier Warengruppen** — Teppichboden, Vinyl von der
Rolle, Klickvinyl, Klebevinyl.

Der naheliegende Einwand, dass kein Hersteller alle vier Gruppen führt, greift
nicht: Wir bauen keine Hersteller-, sondern eine Handelsmarke. Eine Handelsmarke
über mehrere Warengruppen ist der Normalfall. Entscheidend ist die Sprache auf
der Markenseite: „unsere Hausmarke" ist korrekt, „unsere Manufaktur" oder
„von uns hergestellt" wäre eine Falschaussage.

**Zwei Ebenen, nicht drei:**

```
Marke  (Shopify-Feld vendor)  →  die Hausmarke, überall identisch
Linie  (im Produkttitel)      →  Bergen, Palermo, Terracora, Kalvea …
Produkt                       →  Dekor bzw. Farbe
```

Die rund 70 bestehenden Liniennamen bleiben unverändert.

**Shopname und Marke bleiben getrennt.** „TeppichParadies" ist der Shop, die
Hausmarke ist das Produkt. Eine Produktmarke reist auf andere Kanäle mit, ein
Shopname nicht.

## Offen

Der Markenname steht noch nicht fest. Ausgeschieden sind:

| Kandidat | Grund |
|---|---|
| TEPO | tepgo.de verkauft Teppichböden — ein Buchstabe Unterschied bei identischer Warenklasse. Dazu ist tepo.de an die TEPO Gebäudedienste GmbH vergeben. |
| TEVO | HEVO ist die Hausmarke von Teppichscheune, also derselbe Markt, ein Buchstabe Unterschied. Zusätzlich mehrere TEVO-Firmen und ein 3D-Drucker-Hersteller in Deutschland. |
| ORVA | Vom Inhaber verworfen, bereits anderweitig vergeben. |
| NORA | nora systems ist ein deutscher Hersteller von Kautschukböden. |
| TILO | Österreichischer Parkett- und Bodenhersteller. |

**Regel, die sich daraus ergibt:** Der Wortstamm „TEP" ist in der Branche
durchgängig besetzt. Kandidaten mit diesem Stamm nicht weiter verfolgen.

Prüfreihenfolge für neue Kandidaten, vom Billigsten zum Teuersten:
Websuche mit „Teppich" bzw. „Boden" → DPMAregister, Nizza-Klassen 27 und 35 →
TMview → Domain → Handelsregister.

## Feed-Identität

Ausführlich in `qa/FEED_DATA_AUDIT.md`. Kurzfassung:

| Feld | Wert |
|---|---|
| `identifier_exists` | `yes` |
| `brand` | die Hausmarke |
| `mpn` | eine **eigene** Artikelnummer |
| `gtin` | leer, solange keine eigene existiert |

Damit ist der Feed regelkonform, und Google führt unsere Artikel trotzdem nicht
mit denen anderer Händler zusammen, weil beide Kennungen ausschließlich unsere
sind.

**Der Fallstrick:** Die Import-Skill schreibt vor, das Artikelnummernschema des
Lieferanten exakt zu übernehmen („match the supplier's own article-number scheme
exactly as shown on jordanshop.de"). Unsere SKUs *sind* die Lieferantennummern.
Gehen sie unverändert als `mpn` in den Feed, matchen uns alle anderen Händler
desselben Lieferanten — die Umbenennung wäre wirkungslos. `mpn` und interne SKU
dürfen sich unterscheiden; für den Feed braucht es ein eigenes Schema, etwa
`TP-KAL-400-99` statt `TEPLORN04_99`.

Ebenso gilt: Die echte Herstellermarke gehört nicht in den Feed, solange wir
unter eigenem Namen verkaufen.

## Was nach der Namensentscheidung zu tun ist

1. `vendor` aller aktiven Produkte auf die Hausmarke setzen. Shopify-Write,
   Human Gate. Aktuell uneinheitlich: mal `TeppichParadies`, mal der Linienname
   (`Bergen`, `Palermo`).
2. Import-Skill `teppichparadies-jordanshop-import` um eine Vendor-Regel
   ergänzen — sie sagt heute nichts über das Feld, deshalb hat jeder Importlauf
   selbst entschieden. Vorgeschlagener Text:

   > Vendor field: always the house brand. The invented line name (Bergen,
   > Palermo, Terracora …) belongs in the product title, never in the vendor
   > field. Google reads vendor as `brand`, and a single consistent brand is
   > what makes the own-brand strategy work.

3. Eigenes MPN-Schema festlegen und dokumentieren.
4. Markenseite plus eine nach `vendor` gefilterte Collection aufbauen. Erst
   sinnvoll, wenn Schritt 1 durch ist.

Eine Hausmarke zahlt sich nur aus, wenn sie sichtbar ist — im Titel, auf der
Musterkarte, auf der Rechnung, auf der Markenseite. Lebt sie nur in einem
Shopify-Feld, ist sie Aufwand ohne Nutzen.
