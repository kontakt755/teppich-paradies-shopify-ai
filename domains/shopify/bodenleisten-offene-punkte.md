# Bodenleisten — offene Punkte nach der Vervollständigung 2026-09-08

Collection „Bodenleisten" (`gid://shopify/Collection/688863773006`, Handle `bodenleisten`).
Textdaten, Farbvarianten, Preise, Filtermetafeld und SEO sind für alle 9 Produkte gesetzt
(Quelle für die 7 Döllken-Produkte: `data/jordan-catalog.json`, erhoben 2026-09-04 von
jordanshop.de). Was fehlt, bevor diese 7 auf ACTIVE gestellt werden sollten:

## Fehlende Bilder (kein Platzhalter gesetzt — bewusst leer)

jordanshop.de zeigt Suchergebnisse und Produktbilder nur eingeloggten Gewerbekunden
(„Verkauf nur an gewerbliche Kunden"). Ohne Zugangsdaten war anonym kein Bild erreichbar.
Betroffen, je ohne `featuredImage` und ohne `images`:

| Produkt | Shopify Product ID |
|---|---|
| Döllken S 60 TOP Kernsockelleisten | 16044427182414 |
| Döllken CUBU flex life 40 Kernsockelleisten | 16044427051342 |
| Döllken CUBU flex life 60 Kernsockelleisten | 16044426985806 |
| Döllken CUBU flex life 80 Kernsockelleisten | 16044426920270 |
| Döllken CUBU flex life 100 Kernsockelleisten | 16044391596366 |
| Döllken CUBU flex life XL 60/19 Kernsockelleisten | 16044427116878 |
| Döllken CUBU flex life XL 80/19 Kernsockelleisten | 16044427149646 |

Benötigt: je Produkt mindestens ein Übersichtsbild, idealerweise je Farbvariante ein Bild
(analog Cortessa/Basira). Quelle: Döllken-Herstellerseite oder jordanshop.de mit
Gewerbekunden-Login.

## Fehlende SKUs pro Farbvariante

`data/jordan-catalog.json` liefert nur eine Basis-Artikelnummer je Produkt
(z. B. `ZUBDÖLK100_0001`), keine pro Farbe. Farbcodes dürfen laut Projektregel nicht
fortgesetzt/erfunden werden — deshalb bleibt `sku` auf allen neuen Farbvarianten leer, bis
die echten Lieferanten-Artikelnummern je Farbe vorliegen (jordanshop.de-Login oder
Döllken-Preisliste).

## Status

Alle 7 Produkte bleiben **DRAFT**, bis Bilder vorhanden sind — Produktkarten ohne Bild wären
sonst leer/inkonsistent zu Cortessa und Basira. Sobald Bilder + SKUs ergänzt sind: Bilder
zuordnen (`productCreateMedia` + `productVariantsBulkUpdate` mit `mediaId`), SKUs setzen
(`productVariantsBulkUpdate`), dann `status: ACTIVE`.
