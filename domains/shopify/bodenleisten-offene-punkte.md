# Bodenleisten — Datenstand nach der Vervollständigung 2026-09-08

Collection „Bodenleisten" (`gid://shopify/Collection/688863773006`, Handle `bodenleisten`).

## Korrektur: jordanshop.de-Suche funktioniert anonym

Der erste Versuch in dieser Sitzung nutzte den Parameter `q=` und lieferte „Kein
Suchergebnis" — das erschien wie ein Login-Zwang, war aber ein falscher Parametername.
Richtig ist `query=` (`https://www.jordanshop.de/de-DE/search?query=...&hitsPerPage=30`),
das liefert ohne Login vollständige Ergebnisse inklusive Artikelnummer, EAN und Bild-URL
(base64-kodiert im `<img src>`, siehe Skill `teppichparadies-jordanshop-import`). Die
`data/jordan-catalog.json` (Stand 2026-09-04) war dadurch an mehreren Stellen unvollständig
oder falsch — siehe unten.

## Alle 9 Produkte: vollständig mit echten jordanshop.de-Daten

| Produkt | Farben | Preis | Bild | SKUs |
|---|---:|---|---|---|
| Cortessa Sockelleiste | 15 | 7,95 € | ✓ (bestand bereits) | ✓ |
| Basira Sockelleiste | 4 | 7,40 € | ✓ (bestand bereits) | ✓ |
| Döllken CUBU flex life 40 | 5 | 8,50 € | ✓ neu | ✓ neu |
| Döllken CUBU flex life 60 | 10 | 8,50 € | ✓ neu | ✓ neu |
| Döllken CUBU flex life 80 | 8 | 8,50 € | ✓ neu | ✓ neu |
| Döllken CUBU flex life 100 | 6 | 8,50 € | ✓ neu | ✓ neu |
| Döllken CUBU flex life XL 60/19 | 4 | 9,50 € | ✓ neu | ✓ neu |
| Döllken CUBU flex life XL 80/19 | 4 | 9,50 € | ✓ neu | ✓ neu |
| Döllken S 60 TOP | 62 | 24,46 € | ✓ neu | ✓ neu |

Alle 9 bleiben **DRAFT** — Aktivierung (`status: ACTIVE`) war nicht Teil des Auftrags und
wurde nicht ausgeführt.

**Bilder:** jordanshop.de verwendet für Sockelleisten überwiegend **ein Foto je
Produktlinie**, geteilt über alle Farben (das Profil sieht in jeder Farbe fotografisch
gleich aus, echte Farbfotos gibt es nur für einen Teil der S-60-TOP-Dekore). Das ist kein
Zuordnungsfehler, sondern das Muster des Lieferanten selbst.

## Korrekturen gegenüber dem vorherigen (catalog.json-basierten) Stand

`data/jordan-catalog.json` nannte für alle 6 CUBU-Produkte deutlich weniger Farben als real
verfügbar (z. B. CUBU 60: 2 statt 10) und für CUBU 40 eine Farbe **„schwarz", die bei
jordanshop.de für dieses Produkt gar nicht existiert** — auf Nutzerfreigabe hin gelöscht.

**Döllken S 60 TOP** war am stärksten betroffen: Die Katalogdatei nannte 10 pauschale
Farben (u. a. „eiche", „buche", „mahagoni") und einen Flatpreis von 8,50 €. Real hat diese
Linie **62 Farben/Dekore** bei **4,75 €/m** (Stangenlänge 5,15 m). Auf Nutzerfreigabe hin
wurde der komplette Farbsatz ersetzt (alte 10 Werte gelöscht, 62 echte mit Artikelnummer
`ZUBSCHS60_<Code>` angelegt) und der Preis auf **24,46 €** (4,75 € × 5,15 m, gerundet)
korrigiert — konsistent mit der Preislogik der übrigen Sockelleisten-Produkte (Cortessa,
Basira: Flatpreis pro Stange, nicht pro Meter).

Nicht übernommen: eine zweite, im Sortiment existierende Variante **„Döllken S 60 TOP
'kurze Lippe' Kernsockelleisten"** (SKU-Präfix `ZUBSCHS60N`) — ein eigenständiges Produkt
mit anderem Profil, in Shopify bisher nicht angelegt und außerhalb des Auftrags.

## Verbleibend offen

- Keine Bilder je Farbe für die meisten S-60-TOP-Dekore (nur 10 von 62 haben ein eigenes
  Foto bei jordanshop.de, der Rest teilt sich das Linienfoto — s. o., das ist jedoch der
  reale Lieferantenstand, kein Datenloch).
- Aktivierung auf `status: ACTIVE` steht noch aus.
