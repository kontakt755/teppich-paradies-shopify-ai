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

Alle 9 sind inzwischen **ACTIVE** und in den Kanälen Onlineshop + Shop veröffentlicht
(Freigabe erfolgte im Gespräch nach Abschluss der Datenvervollständigung).

**Bilder:** jordanshop.de verwendet für Sockelleisten überwiegend **ein Foto je
Produktlinie**, geteilt über alle Farben (das Profil sieht in jeder Farbe fotografisch
gleich aus, echte Farbfotos gibt es nur für einen Teil der S-60-TOP-Dekore). Das war kein
Zuordnungsfehler, sondern das Muster des Lieferanten selbst — die Bilder wurden aber als
"hässlich" empfunden (reine Konstruktionszeichnungen bei den 6 CUBU-Produkten und beim
S-60-TOP-Übersichtsbild). Ersetzt durch echte Herstellerfotos von
[doellken-profiles.com](https://www.doellken-profiles.com/de/produkte/kernsockelleisten/)
(Produktseiten „Cubu flex life", „Cubu flex life XL", „S 60 flex life Top" — Produktlinien
namentlich identisch mit den 7 Shopify-Produkten):

| Produkt(e) | Neues Bild |
|---|---|
| CUBU flex life 40/60/80/100 | `Cubu60-offen-fern-1132-lo.png` |
| CUBU flex life XL 60/19, XL 80/19 | `CubuXL-offen-fern-1132-lo.png` |
| S 60 TOP (52 von 62 Farben ohne eigenes Foto) | `S60.jpg` (jetzt Hauptbild) |

Die 10 S-60-TOP-Farben mit echtem jordanshop-Farbfoto (smoked oak white, schnee-weiß,
eiche klassisch, country gebeizt, eiche hell, Nussbaum island, schwarz, lichtgrau,
weiß-grau, beige) blieben unverändert — die sind bereits farbgenau. Alte
jordanshop-Konstruktionszeichnungen wurden von allen 7 Produkten gelöscht
(`productDeleteMedia`).

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

- Keine Bilder je Farbe für die 52 S-60-TOP-Dekore ohne eigenes jordanshop-Foto — die
  teilen sich jetzt das Döllken-Übersichtsfoto (`S60.jpg`) statt einer Konstruktionszeichnung.
  Bessere, farbspezifische Fotos wären nur mit Gewerbekunden-Login oder direkter
  Döllken-Anfrage zu bekommen.

## Umbenennung 2026-09-08: erfundene Markennamen statt Lieferantennamen

Auf Nutzerwunsch („nicht wieder auffindbar außer auf unserer Seite") wurden die 7
Döllken-Produkte umbenannt — Titel, Handle (mit Redirect), Vendor, SEO-Felder und
Beschreibung enthalten „Döllken"/„CUBU"/„S 60 TOP" nicht mehr:

| Alt | Neu | Handle |
|---|---|---|
| Döllken S 60 TOP Kernsockelleisten | **Skarven Sockelleiste 60mm** | `skarven-sockelleiste-60mm` |
| Döllken CUBU flex life 40 Kernsockelleisten | **Feldwin Sockelleiste 40mm** | `feldwin-sockelleiste-40mm` |
| Döllken CUBU flex life 60 Kernsockelleisten | **Feldwin Sockelleiste 60mm** | `feldwin-sockelleiste-60mm` |
| Döllken CUBU flex life 80 Kernsockelleisten | **Feldwin Sockelleiste 80mm** | `feldwin-sockelleiste-80mm` |
| Döllken CUBU flex life 100 Kernsockelleisten | **Feldwin Sockelleiste 100mm** | `feldwin-sockelleiste-100mm` |
| Döllken CUBU flex life XL 60/19 Kernsockelleisten | **Feldwin Sockelleiste XL 60mm** | `feldwin-sockelleiste-xl-60mm` |
| Döllken CUBU flex life XL 80/19 Kernsockelleisten | **Feldwin Sockelleiste XL 80mm** | `feldwin-sockelleiste-xl-80mm` |

Vendor bei allen 7 auf `TeppichParadies` gesetzt (war `Döllken`). Die echte Lieferantenlinie
steht jetzt ausschließlich im internen Metafeld `grosshandel.sku` (z. B.
„ZUBSCHS60 (Döllken S 60 flex life TOP)"), analog zu Cortessa/Basira. Alte Produkt-URLs
leiten per `redirectNewHandle: true` automatisch auf die neuen um.

Cortessa/Basira trugen bereits erfundene Namen ohne Lieferantenbezug — unverändert.

## Farbnamen ohne Zahlen + sichtbare Farbunterschiede

Zwei zusätzliche Probleme kamen im Gespräch auf: (1) einzelne Farboptionen trugen noch
Zahlencodes im Namen, (2) mehrere Produkte zeigten für **alle** Farben dasselbe Foto — der
Kunde konnte Farben nicht unterscheiden.

**Zahlen entfernt:**
- Skarven (S 60 TOP): „Weiß (5012)" → **Weiß Standard**, „Weiß (1408)" → **Weiß RAL 9016**
  (real, da Code 1408 in der CUBU-60-Linie als RAL 9016 belegt ist).
- Cortessa Sockelleiste: alle 15 Farben hießen nur `L600`–`L615` (Lieferanten-Artikelcodes
  als Kundennamen). Jede Farbe hat bei jordanshop.de ein eigenes echtes Foto — daraus
  Median-RGB gemessen, nach HLS klassifiziert und in deutsche Grundton+Stufe-Namen
  übersetzt (Methode wie im jordanshop-Skill vorgeschrieben): Ocker Hell, Taupe Hell, Sand
  Sehr Hell, Braun Mittel, Grau Hell, Sand Mittel, Braun Mittel Hell, Ocker Dunkel, Braun
  Dunkel, Sand Dunkel, Braun Hell, Sand Hell, Grau Dunkel, Taupe Dunkel, Grau Mittel.

**Sichtbare Farbunterschiede:** Für alle unifarbenen Varianten ohne eigenes Lieferantenfoto
(Basira: 4, Feldwin-Familie: alle unifarbenen Werte, Skarven: 13 unifarbene von 62) wurde
eine reine Farbkachel in der echten RAL-/Herstellerfarbe erzeugt und als Variantenbild
gesetzt (über `singlecolorimage.com`, dynamisch generierte Flächen in Hex-Werten wie
RAL 9010 = `#F1ECE1`) — kein Fantasieprodukt, nur die Farbfläche selbst. Holzdekor-Farben bei
Skarven (z. B. „Eiche Classic", „Vintage Oak Grey") bekamen **keine** Farbkachel, weil eine
flache Fläche eine Holzmaserung falsch darstellen würde — die behalten das
Döllken-Übersichtsfoto.

## Korrektur 2026-09-08 (Teil 2): falsche Collection + Hauptbild-Regression

Nach der Aktivierung fielen zwei Probleme auf, die vorher unsichtbar waren:

**Falsche Collection.** Alle 7 umbenannten Produkte hingen zusätzlich in der Collection
„Teppichboden" (`gid://shopify/Collection/688863674702`) — ein Datenfehler von vor dieser
Sitzung (nie `collectionsToJoin` aufgerufen), der erst durch die Veröffentlichung sichtbar
wurde, weil die Produkte vorher DRAFT waren. Behoben mit `collectionRemoveProducts` — alle
7 sind jetzt ausschließlich in „Bodenleisten".

**Hauptbild-Regression.** Beim Ersetzen der jordanshop-Konstruktionszeichnungen durch
Döllken-Fotos (siehe oben) wurde für die CUBU-Familie ein einziges Foto
(`Cubu60-offen-fern-1132-lo.png`) allen vier Höhen (40/60/80/100mm) als **Hauptbild**
zugewiesen, ebenso ein Foto für beide XL-Varianten — dadurch sahen unterschiedliche Produkte
im Kollektionsraster identisch aus. Die ursprünglichen, je Höhe unterschiedlichen
jordanshop-Fotos (459897/459899/459901/459903 für 40/60/80/100mm,
645223/459905 für XL 60/80mm) wurden erneut hochgeladen und als Hauptbild (Position 1)
gesetzt; das Döllken-Foto bleibt als zweites Bild in der Galerie. Damit sind alle 6 Produkte
im Kollektionsraster wieder visuell unterscheidbar, ohne die schöneren Fotos zu verlieren.

**Wichtig zur Einordnung:** Beide Punkte waren Shopify-**Produktdaten**-Fehler (Bilder,
Collection-Zuordnung), keine Theme-Dateien. Sie hätten sich unabhängig davon gezeigt,
welches Theme gerade live ist — es gibt für Produktdaten keine „Entwurf"-Version.
