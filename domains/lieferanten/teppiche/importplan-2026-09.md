# Wohnteppiche aus Lieferant-B-Daten: Importvorbereitung

Stand: 2026-09-28. Dieser Plan erzeugt keine Shopify-Schreibaktion.

## Quellen und Umfang

- Excel-Blatt `Teppiche`: 512 Artikelzeilen in 14 Modellreihen. Das separate Blatt `Türmatten` (812 Zeilen) gehört nicht zu diesem Import.
- 444 Zeilen werden je Stück verkauft; 68 Wunschmaßzeilen haben die Verkaufseinheit m².
- Die Stückartikel bilden 45 eindeutig codierte Modell-/Designlinien. Eine Produktseite pro Design erlaubt die vorhandene Farbauswahl und eine Größenvariante, ohne verschiedene Muster in einer Galerie zu mischen.
- Für Elda liegen sechs eindeutig zuordenbare Farbbilder in der gelieferten Bildsammlung. Die übrigen 494 Artikelzeilen haben dort kein passendes Originalbild.
- Offizielle Herstellerkataloge 2023–2026 belegen 98 der 100 codierten Design-/Farbkombinationen. 39 davon haben ein eingebettetes Bild mit mindestens 800 px Breite. Katalogbilder bleiben bis zur Rechte- und Qualitätsprüfung interne Prüfreferenzen.

## Datenregeln

1. SKU: neue Artikelnummer aus der Excel-Datei als Text, einschließlich führender Nullen. EAN: gelieferten 13-stelligen Code übernehmen; Prüfziffer und Eindeutigkeit vor dem Schreiben validieren.
2. Verkaufspreis: UVP unverändert in Euro übernehmen. Der Nutzer hat diese Regel am 2026-09-28 bestätigt. Einkaufspreis ausschließlich intern halten; keinen Vergleichspreis aus UVP ableiten.
3. Den gelieferten Design- und Farbcode ausschließlich als internen Zuordnungsschlüssel und in dafür vorgesehenen Metafeldern nutzen. Shopseitige Namen und Optionswerte aus den bestehenden Produktregeln ableiten; keine Lieferanten- oder Einkaufsinformationen in sichtbare Texte schreiben.
4. Farben, Größen und Formen nur dort zu Varianten zusammenfassen, wo die Kombination eindeutig ist. Bei Stückartikeln ist ein Artikel genau eine Shopify-Variante. Wunschmaßartikel werden separat geplant, weil Preis pro m² und Maßkonfigurator eine andere Warenkorb-Logik brauchen.
5. Produktmerkmale nur aus Excel oder offiziellen Herstellerangaben übernehmen. Widersprüche zwischen Zeilen und Katalog je Design auflösen, bevor ein Metafeld gesetzt wird.
6. Bestand nicht aus `Lieferbar ab` vom 24.08.2026 als aktuellen Lagerbestand ableiten. Eine öffentliche Bestandsuche zeigt teils nicht erläuterte Symbole; sie ist kein verlässlicher Mengennachweis. Bis zur verifizierten Lagerregel Produkte als Entwurf halten.
7. Bildzuordnung benötigt exakten Modell-, Design- und Farbcode. Katalogbilder vor Nutzung einzeln auf Rechte und Auflösung prüfen. Kein Bild eines ähnlichen Musters ersatzweise zuordnen.

## Vor Shopify-Schreibaktionen

- Admin-seitig alle SKUs und EANs gegen veröffentlichte und unveröffentlichte Varianten prüfen. Der bisherige öffentliche Snapshot deckt nur veröffentlichte Produkte ab.
- Eine erste Admin-Abfrage über alle Status zeigt keine numerischen SKUs, aber 17 archivierte leere ASTRA-Platzhalter für ältere Teppichmodelle (je eine Default-Variante, ohne SKU/EAN, Preis 0) sowie ein archiviertes Einzelfarbprodukt mit ASTRA-SKU. Diese Datensätze erhalten keine automatische Änderung. Die vollständige EAN-Prüfung bleibt vor dem Import Pflicht.
- Bestehende Shopify-Produktvorlage `product.teppich` und Metafelder an einem einzelnen Testprodukt verifizieren; die Collection `teppiche` hat derzeit Inhalte für Teppiche nach Maß, daher für fertige Wohnteppiche eine passende Collection-/Textstruktur vorsehen.
- Konkreten Testimport eines einfachen Stückartikels mit 18 Varianten aus Elda, eines Designs mit mehreren Farben und Größen sowie eines Wunschmaßartikels als getrennte Abnahmefälle vorbereiten.
- Den Import über den Projekt-Router und den commitgebundenen Review-/Freigabeprozess führen. Große Produktanlagen und Preis-/SKU-/Varianten-Schreibaktionen erst nach der erforderlichen konkreten Freigabe ausführen.
- Nach jedem Testschritt Titel, Variantenanzahl, SKU, EAN, Preis, Medienstatus, Optionen und öffentlichen Produktzustand erneut abfragen.

## Offene Fälle

- Samoa Wunschmaß: acht Zeilen ohne Designcode. Nicht automatisch einem der Samoa-Designs zuordnen.
- Samoa 001/010 und 001/062: kein eindeutig codebeschriftetes Katalogbild ermittelt.
- Nur ein Teil der Hersteller-Katalogbilder ist für einen vollwertigen Shopauftritt ausreichend groß. Für weitere Designs Originalbilder beim Herstellerzugang ermitteln oder den Bildumfang vorerst begrenzen.
- Lager- und Veröffentlichungsregel für Lieferantenartikel festlegen und prüfen.
