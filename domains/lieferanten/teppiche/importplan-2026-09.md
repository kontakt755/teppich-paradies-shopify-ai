# Wohnteppiche aus Lieferant-B-Daten: Importvorbereitung

Stand: 2026-09-29. Dieser Plan erzeugt keine Shopify-Schreibaktion.

**Nachtrag 2026-09-30:** Fellara Dekofell ist live (Template `dekofell`, Preise mit Umlage der Dropship-Gebuehr, Bildfreigabe laut Inhaber erhalten). Verbindlicher Standard fuer alle weiteren Produkte: `produktimport-standard-fellara.md`.

## Nachtrag: beide Excel-Dateien und vollständiges Bildarchiv

- Die zuvor übersehene Datei `Datenliste_Teppiche_Online_E26.xltx` enthält **148 zusätzliche, nicht überlappende Stückartikel**: 108 ASTRA und 40 SCHÖNER WOHNEN-Kollektion. Beide Teppich-Tabellen zusammen enthalten **660 eindeutige SKUs und 660 eindeutige EANs**. Die Einheitenspalte nennt 592 Stückartikel und 68 m²-Zeilen. Acht der Stückzeilen heißen jedoch „Wunschmaß“ und haben weder Breite noch Länge. Für den Import sind daher **584 eindeutige Festgrößen** und **76 getrennt zu klärende Wunschmaßzeilen** maßgeblich. Die acht widersprüchlichen Zeilen werden nicht als Festgröße importiert. Türmatten bleiben separat.
- Der geprüfte, verkaufspreisbezogene Snapshot `import-snapshot-2026-09.json` enthält je Zeile SKU, EAN, UVP, Maße, Material, Herstellungsart, Herkunft, Beschreibung und Eigenschaften. Er enthält **keine Einkaufspreise** und löst keine Shop-Schreibaktion aus. Jede Bildreferenz ist relativ zum gelieferten Archiv und mit Marke, Reihe, Design und Farbe verknüpft.
- Das gelieferte Archiv enthält 379 exakt codezuordenbare Bilddateien für 18 Design-/Farbpaare, die 58 Artikelzeilen abdecken: Elda (18 Zeilen) und sieben Reihen der SCHÖNER WOHNEN-Kollektion (40 Zeilen). Für 602 Artikelzeilen bzw. 140 weitere Design-/Farbpaare enthält es **kein** exakt passendes Original. Die vier anderen ASTRA-Bildordner betreffen nicht die Teppichzeilen dieser zwei Tabellen. Auch die ZIP-Einträge wurden auf die fehlenden Modellnamen gegengeprüft.
- Die 584 Festgrößen lassen sich nach der aktuellen Regel in **76 Produktseiten nach Reihe und Design** bündeln: 45 aus der ersten und 31 aus der Online-Tabelle. Davon sind zwei Testprodukte bereits als Entwurf vorhanden. Die 40 bildgedeckten SCHÖNER WOHNEN-Artikel bilden sieben dieser 76 Produktseiten.
- `draft-product-groups-2026-09.json` dokumentiert genau diese 76 Entwurfsgruppen mit 584 einmalig zugeordneten Varianten-SKUs, Arbeitsnamen, vorhandenen Produkt-IDs, Bildabdeckung und Quellmerkmalen. Nur acht Gruppen haben im gelieferten Archiv exakte Bilder. Die Arbeitsnamen sind vor Veröffentlichung redaktionell und anhand der Markenrichtlinien zu prüfen; die Datei ist bewusst noch kein `productSet`-Mutationspayload.
- Alle 379 zugeordneten Dateien sind lesbar. 243 überschreiten 20 MP oder 20 MB und brauchen für Shopify eine maß- und farbtreue proportionale Verkleinerung. Eine KI-Veränderung der Produktdarstellung ist durch die mitgelieferten Bildregeln nicht gedeckt.
- Die im Archiv enthaltenen Nutzungsbedingungen für beide Marken verlangen vor der öffentlichen Nutzung eine **nachweisbare Freigabe der konkreten Shop-Darstellung in Textform** und einen Copyright-Vermerk, der der jeweiligen Aufnahme zugeordnet werden kann. ASTRA-Bilder dürfen darüber hinaus nur proportional skaliert oder beschnitten werden; für SCHÖNER WOHNEN sind auch heruntergerechnete Online-Bilder erlaubt. Die aktuelle Freigabe für `teppich-paradies.net` liegt in den geprüften Dateien noch nicht vor. Daher keine zusätzliche öffentliche Bildverwendung, bevor diese Freigabe belegt und die Theme-Kennzeichnung umgesetzt ist.
- Die neue, bereits veröffentlichte manuelle Kollektion `wohnteppiche` ist von der Altbestands-Kollektion `teppiche` getrennt. Die zwei vorhandenen Testprodukte bleiben DRAFT; neue Daten werden zunächst ebenfalls als Entwurf geplant.
- Admin-Dublettenabgleich vom 29.09. über **alle 6.167 Varianten aller Produktstatus**: für die 148 zusätzlichen Zeilen **0 SKU- und 0 EAN-Treffer**. Unter den 512 ersten Zeilen gibt es genau 43 SKU-/EAN-Treffer; sie gehören zu den zwei bereits angelegten Entwürfen mit 18 und 25 Varianten. Diese Produkte werden wiederverwendet. Vor dem ersten späteren Schreiblauf den Abgleich wegen möglicher paralleler Importe erneuern.
- Alle 584 Festgrößen ergeben innerhalb von Reihe/Design eindeutige Farb- und Größenkombinationen. Die Formspalte ist jedoch nicht durchgehend brauchbar: zwölf Elda-Zeilen enthalten nur `shape`, drei Gravina-Rundvarianten stehen dort als `rechteckig`, und die Online-Vorlage hat keine Formspalte. Größenbezeichnungen daher gegen die Artikelbezeichnung und bei Widerspruch gegen offizielle Produktdaten ableiten; nicht blind die Formspalte verwenden.

## Importreihenfolge

1. Die 40 bildgedeckten SCHÖNER WOHNEN-Artikel in sieben Designlinien als vollständige, nicht veröffentlichte Produktentwürfe vorbereiten; Elda mit 18 Varianten ist bereits als Entwurf vorhanden. Lizenzgerechten Copyright-Hinweis und Markenpräsentation zuerst im Arbeitstheme prüfen.
2. Die übrigen 602 Zeilen mit eindeutigen Produktdaten als separate Entwurfs-Batches vorbereiten. Fehlende Originalbilder je exaktem Design-/Farbcode beim Händlerzugang beschaffen; keine Katalogabbildung oder ähnliche Farbe als Ersatz nehmen.
3. Für jedes neue Produkt genau einen vollständigen Anlagevorgang aus dem Snapshot erzeugen und nachher Variantenanzahl, SKU, EAN, UVP, Maße, Medien und Collection-Zuordnung gegenlesen. Bestehende Testprodukte nur feldgenau aktualisieren.
4. Festgrößen- und Wunschmaß-Checkout getrennt abnehmen; die acht `stk`-Wunschmaßzeilen benötigen eine belegte Preis- und Bestellregel. Erst mit aktueller Bestands-/Lieferregel, schriftlicher Bildfreigabe, konkreter Commit-Freigabe und bestandenem öffentlichen Theme-Test Produkte chargenweise veröffentlichen.

## Erste Datenliste: Umfang

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
- Für Festgrößen-Teppiche `product.fixpreis` nutzen: `product.teppich` hat seinen normalen Kaufbutton deaktiviert und zeigt nur mit `custom.wunschmass_mindestbreite_cm` einen Wunschmaß-Rechner. Die ersten beiden Entwürfe Elda und Gravina wurden nach dieser Erkenntnis auf `fixpreis` korrigiert. Vor Veröffentlichung die Produktvorschau auf doppelte Farbauswahl prüfen. Die Collection `teppiche` hat derzeit Inhalte für Teppiche nach Maß, daher für fertige Wohnteppiche eine passende Collection-/Textstruktur vorsehen.
- Konkreten Testimport eines einfachen Stückartikels mit 18 Varianten aus Elda, eines Designs mit mehreren Farben und Größen sowie eines Wunschmaßartikels als getrennte Abnahmefälle vorbereiten.
- Der erste konkrete Entwurf liegt in `testimport-dekofell-entwurf.json`: „Fellara Dekofell“, Shopify-Kategorie `Heim & Garten > Dekoration > Teppiche`, 18 Varianten, sechs Farben, drei Größen/Formen, zwölf gelieferte Produktbilder, Stückpreise 5,99 / 11,99 / 19,99 EUR. Alle SKUs, EANs, Preise und Bilddateien wurden nochmals gegen die Excel-Zeilen geprüft. Das Produkt ist als unveröffentlichter Entwurf mit diesen Daten angelegt (`gid://shopify/Product/16102406783310`) und nachgelesen. Zweiter Test: „Velora Wohnteppich“, 25 Gravina-Varianten als unveröffentlichter Entwurf (`gid://shopify/Product/16102420545870`); Originalbilder fehlen.
- Den Import über den Projekt-Router und den commitgebundenen Review-/Freigabeprozess führen. Große Produktanlagen und Preis-/SKU-/Varianten-Schreibaktionen erst nach der erforderlichen konkreten Freigabe ausführen.
- Nach jedem Testschritt Titel, Variantenanzahl, SKU, EAN, Preis, Medienstatus, Optionen und öffentlichen Produktzustand erneut abfragen.

## Offene Fälle

- Gravina, Excel-Zeilen 18–20: Die Bezeichnung lautet jeweils „ca. 160 cm rund“, die Spalte `Form` dagegen `rechteckig`. Der offizielle ASTRA-Katalog 2025 nennt für Gravina 160 cm rund; diese drei Varianten daher als „Ø 160 cm rund“ kennzeichnen. Das Feld `Durchmesser in cm` enthält hier `12` und auch bei rechteckigen Artikeln Werte, ist daher kein verlässlicher Teppichdurchmesser. Quelle: `https://www.golze.de/wp-content/uploads/2025/01/astra-katalog-teppiche-2025_interaktiv_Doppelseiten_01.2025_web-1.pdf`.
- Samoa Wunschmaß: acht Zeilen ohne Designcode. Nicht automatisch einem der Samoa-Designs zuordnen.
- Samoa 001/010 und 001/062: kein eindeutig codebeschriftetes Katalogbild ermittelt.
- Nur ein Teil der Hersteller-Katalogbilder ist für einen vollwertigen Shopauftritt ausreichend groß. Für weitere Designs Originalbilder beim Herstellerzugang ermitteln oder den Bildumfang vorerst begrenzen.
- Lager- und Veröffentlichungsregel für Lieferantenartikel festlegen und prüfen.
