# Feed-Daten-Audit (Google Shopping / Merchant Center)

Stand: 2026-08-30. Erhoben über die Shopify Admin API (read-only), keine Produktdaten verändert.

## Ausgangslage

- 345 aktive Produkte
- 2.893 Varianten

## Befund 1: GTIN/EAN fehlt vollständig

**0 von 2.893 Varianten haben einen Barcode.** Geprüft an 150 Produkten aus drei
unabhängigen Stichproben (erste 100 nach ID, älteste 50 nach Erstelldatum) — kein
einziger Treffer, quer durch alle Produkttypen und alle Importgenerationen.

Das ist der Hauptgrund, warum `MERCHANT_READINESS_REPORT.md` kein einziges Produkt
als READY führt. GTINs lassen sich nicht ableiten oder erzeugen; sie müssen vom
Lieferanten (jordanshop.de) kommen. **Nächster Schritt ist eine Anfrage an den
Lieferanten, keine Aufgabe im Shop.**

Falls der Lieferant keine GTINs liefert: Für Produkte ohne Herstellerbarcode ist in
Google Merchant Center `identifier_exists: false` zu setzen, statt das Feld leer zu
lassen. Das ist der dokumentierte Weg für Ware ohne GTIN und verhindert Ablehnungen.

## Befund 2: SKU fehlt bei genau drei Produkten

Alle ab dem 31.07.2026 angelegten Produkte haben durchgängig SKUs nach dem
Lieferantenschema (`TEPLORN04_99`, `CVALL2_250`). Ohne SKU sind ausschließlich die
drei handgepflegten Altprodukte:

| Produkt | Handle | Varianten ohne SKU |
|---|---|---|
| Saphir Teppichboden 400cm und 500cm | `saphir-teppichboden-400cm-und-500cm` | 14 |
| Rohan Teppichboden 400cm 500cm | `rohan-teppichboden-400cm` | 10 |
| Norway Teppichboden 400cm | `norway-teppichboden-400cm-und-500cm-kopie` | 6 |

Summe: 30 Varianten. Diese drei sind zugleich die einzigen mit echtem Lagerbestand
(9.990 / 13.986 / 5.994) und damit umsatzrelevant.

SKUs setzen ist laut Router `PRICE_SKU_VARIANT_WRITE`, also Klasse D mit Human Gate.
Es fehlt zusätzlich eine inhaltliche Entscheidung: Für diese drei gibt es kein
Lieferantenschema, das Nummernformat müsste festgelegt werden.

## Befund 3: Zwei unterschiedliche Bestandsmodelle

Kein Fehler, aber eine Inkonsistenz, die bei Feed-Prüfungen leicht als solcher
gelesen wird:

| Gruppe | tracked | inventoryPolicy | Menge | verkäuflich |
|---|---|---|---|---|
| Altbestand (Saphir, Rohan, Norway) | true | CONTINUE | 999/Variante | ja |
| Alle Importe ab 07/2026 | false | DENY | 0 | ja |

Die Importe zeigen `inventoryQuantity: 0`, sind aber wegen `tracked: false`
uneingeschränkt verkäuflich. Wer nur auf die Bestandszahl schaut, hält den halben
Katalog für ausverkauft. Eine Vereinheitlichung ist optional; wichtig ist, dass
`availableForSale` überall `true` ist.

## Priorität

1. GTIN-Beschaffung beim Lieferanten anstoßen — blockiert Google Shopping insgesamt.
2. SKU-Schema für die drei Altprodukte festlegen, dann 30 Varianten nachziehen.
3. Bestandsmodell bewusst vereinheitlichen oder bewusst so dokumentiert lassen.
