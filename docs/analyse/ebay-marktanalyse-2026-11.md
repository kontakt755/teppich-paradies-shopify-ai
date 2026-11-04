# eBay-Marktanalyse Bodenbeläge, Stand 2026-11-04

Nur lesende Auswertung. Geändert wurde nichts, weder in Shopify noch bei eBay.

## Ergebnis

**Mit den heutigen Shop-Preisen ist ein breiter Start auf eBay nicht sinnvoll.** Die in Titeln
genannten eBay-Preise liegen bei Standardware deutlich unter unseren: Teppichboden etwa 10 bis
24 €/m² gegen 69,90 €/m² im Median, Klickvinyl etwa 11 bis 17 €/m² gegen 52,99 €/m². Dazu kommen
13 bis 14 % Provision. Unsere Ware ist nicht automatisch vergleichbar, Qualität und Marke sind hier
nicht bewertet. Ob ein kleiner Test trägt, entscheiden die Einkaufspreise; sie sind nicht Teil
dieses öffentlichen Berichts.

## Datengrundlage

- **Quelle:** eBay-Produktrecherche im Verkäufer-Cockpit, Reiter „Verkauft“, ebay.de, letztes Jahr, Abruf 2026-11-04.
- **Umfang:** bis zu 50 Angebote je Begriff (erste Ergebnisseite). 12 von 12 Begriffen ausgewertet.
- **Angebotsseiten:** 14 meistverkaufte Angebote für Verkäufer und Kategorie. Dazu 5 Shop-Seiten.
- **Vorgeschichte:** Der automatische Abruf der öffentlichen Suche per curl und Playwright war gesperrt (HTTP 403) und wurde nicht fortgesetzt. Die Auswertung lief danach im angemeldeten Konto.

Einschränkungen:

- „Stück“ ist die Verkaufseinheit des Angebots, je nach Angebot m², Fliese, Leiste oder Abschnitt. **Der Durchschnittspreis ist kein €/m²-Preis.**
- Stück und Umsatz zählen nur die bis zu 50 gezeigten Angebote, nicht den ganzen Markt. Angebote können unter mehreren Begriffen auftauchen, die Zeilen lassen sich also nicht addieren.
- Die Treffer enthalten Fremdes: unter „nadelfilz meterware“ viel Bastelfilz, unter „klebevinyl“ Zubehör und Plotterfolie, unter „teppichfliesen“ und „teppichboden velours“ viel Billigware.
- Der Filter „Neu“ war nicht bei jedem Abruf sichtbar. Es ist deshalb nicht sicher, dass überall nur Neuware gezählt wurde.
- Die Einordnung nach Produktart folgt Stichwörtern im Titel und ist grob.

## Verkäufe je Suchbegriff

| Suchbegriff | Treffer | Verkäufer gesamt | Stück in Treffern | Umsatz in Treffern | Ø Preis | Preisspanne | Ø Versand | Gratisversand |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| sockelleiste | 50 | 1.025 | 201.310 | 1.220.178 € | 8,42 € | 0,39–2.641,27 € | 7,81 € | 78 % |
| teppich wohnzimmer | 50 | 1.586 | 20.499 | 829.089 € | 55,61 € | 0,99–4.710,99 € | 10,72 € | 79 % |
| kunstrasen meterware | 50 | 45 | 2.858 | 237.570 € | 82,54 € | 1,22–1.136,80 € | 7,06 € | 69 % |
| nadelfilz meterware | 50 | 29 | 3.629 | 152.970 € | 42,19 € | 1,00–528,74 € | 4,97 € | 20 % |
| vinylboden klick | 50 | 30 | 770 | 151.983 € | 202,43 € | 1,00–4.091,20 € | 24,60 € | 98 % |
| teppichboden meterware | 50 | 15 | 1.525 | 113.400 € | 74,47 € | 1,02–915,03 € | 7,42 € | 77 % |
| teppichfliesen | 50 | 131 | 13.652 | 68.245 € | 6,19 € | 1,00–727,82 € | 5,82 € | 79 % |
| teppichboden velours | 50 | 45 | 851 | 25.228 € | 30,87 € | 1,65–798,68 € | 7,67 € | 64 % |
| klebevinyl | 50 | 19 | 157 | 11.802 € | 85,16 € | 1,50–1.386,83 € | 9,57 € | 74 % |
| pvc boden meterware | 18 | 5 | 248 | 8.234 € | 33,20 € | 3,07–789,48 € | 7,00 € | 46 % |
| teppichboden rest | 10 | 3 | 60 | 1.345 € | 22,41 € | 1,88–136,30 € | 8,91 € | 4 % |
| teppich nach maß ketteln | 1 | 1 | 7 | 32 € | 4,58 € | 4,58 € | 9,12 € | 0 % |

Was daraus folgt:

- **Größte Umsätze:** Sockelleisten und Wohnteppiche, beide mit über 1.000 Verkäufern und sehr niedrigen Preisen.
- **Klar gefragt bei wenigen Anbietern:** Kunstrasen und Klickvinyl.
- **Klein:** Teppichboden als Meterware mit 15 Verkäufern. Bei Klebevinyl, PVC und Resten ist in dieser Stichprobe wenig Umsatz sichtbar.
- **Kaum Markt:** Ketteln und Maßanfertigung, nur ein einziges Angebot.
- **Produktart:** Bei Teppichboden, PVC und Kunstrasen dominiert Meterware, bei Teppichfliesen und Sockelleisten feste Größen oder Stückzahlen. Pakete nennt fast kein Titel; Klickvinyl wirbt stattdessen mit „ab … €/m²“.

## Gebühren und Kategorien

Quelle: offizielle eBay-Hilfeseite. Zusätzlich 0,35 € je Bestellung, über 10 € 0,45 €. Provision auf den
Gesamtbetrag samt Versand und Umsatzsteuer; 13 % vom Brutto sind rund 15,5 % vom Netto. Alle Gebühren
ohne Mehrwertsteuer.

| Ware | Kategorie laut Angebotsseiten | Provision Neuware |
|---|---|---:|
| Teppichboden, Teppichfliesen, Teppiche | Möbel & Wohnen | 14 % |
| PVC, Klickvinyl, Klebevinyl, Sockelleisten | Heimwerker | 13 % |
| Kunstrasen | Garten & Terrasse | 13 % |

Die Kategorie wählt der Verkäufer: Einzelne Teppichböden und PVC-Beläge stehen woanders. Laut derselben
Seite gibt es Shop-Abos ab 39,95 € im Monat (400 freie Festpreisangebote), ohne Shop 0,35 € je Angebot
über das freie Kontingent hinaus.

## Preisvergleich

Unsere Werte: aktive, verfügbare Varianten aus dem Lexikon-Export vom 2026-11-03, inkl. USt.
„Nötig“ ist der eBay-Preis, bei dem nach Provision so viel bleibt wie der Shop-Median, ohne festen
Anteil je Bestellung und ohne unsere Shop-Kosten.

| Warengruppe | Unser P10 | Unser Median | Nötig auf eBay | eBay-Beleg |
|---|---:|---:|---:|---|
| Teppichboden, €/m² | 36,90 | 69,90 | 81,28 | Titel: Schlinge 11,99–23,99; Velours 13,99–24,99 |
| Nadelfilz, €/m² | 21,90 | 38,90 | 45,23 | Titel: 9,99–15,99 |
| Teppichfliesen, €/m² | 44,90 | 69,00 | 80,23 | Schätzung aus Stückpreis 1,65–3,16 € je 50 × 50 cm: etwa 7–13 |
| Restrollen, Variantenpreis | 29,95 | 34,95 | 40,64 | Titel: 7–8 €/m² |
| PVC von der Rolle, €/m² | 19,99 | 23,99 | 27,57 | Titel: 12; ein weiteres Angebot ab 18,99 |
| Klickvinyl, €/m² | 39,99 | 52,99 | 60,91 | Titel: ab 10,99, ab 12,90, 16,99 |
| Klebevinyl, €/m² | 30,99 | 39,99 | 45,97 | Titel: 23,90 |
| Kunstrasen, €/m² | 24,90 | 40,90 | 47,01 | ab 7,99 und ab 12,99, Einheit nicht geprüft |
| Sockelleisten, € je Variante | 11,90 | 18,00 | 20,69 | ab 1,79, Länge nicht vergleichbar |

Der Beleg ist schmal: **eine Handvoll Titel und Angebote, keine vollständige €/m²-Auswertung.** Die
Produktrecherche liefert keinen Grundpreis. „Ab“-Preise sind oft die günstigste Variante; bei einem
Klickvinyl-Angebot steht auch 24,99 €/m². Der Abstand ist aber in allen Warengruppen groß.

## Konkurrenten

Bewertungen stammen aus der Verkäuferkarte, „verkauft“ von der Shop-Seite. „–“ heißt nicht erhoben.

| Verkäufer | Bewertungen | Positiv | Verkaufte Artikel | Gesehen bei |
|---|---:|---:|---:|---|
| Floordirekt | 334.008 | 99,3 % | – | Nadelfilz, Kunstrasen, Teppichfliesen |
| der-holz-wurm | – | 99,7 % | 205.298 | Shop-Seite, Sortiment nicht ausgewertet |
| BRICOFLOR Deutschland | – | 99,8 % | 147.524 | Shop-Seite, Sortiment nicht ausgewertet |
| whiteboard-flipchart | 135.165 | 99,4 % | – | PVC-Zuschnitt EXPOTOP (Marke, nicht Verkäufer) |
| global-carpet | 93.290 | 99,3 % | – | Velours-Teppichboden, meist Gratisversand |
| Internethandel Pfordt | 86.032 | 99,9 % | – | PVC 12 €/m², Teppichboden-Reste |
| teppicheforterode (Fortero) | 17.817 | 99,3 % | 62.557 | Kunstrasen |
| ccclo59 | 10.568 | 99,9 % | – | Shaggy-Teppiche |
| leisten-direkt | 9.106 | 100 % | – | Sockelleisten |
| bodenservice24 | 6.726 | 100 % | – | Klebevinyl |
| Mondesi Shop | 3.344 | 98,7 % | – | Klickvinyl |
| oase-terrassen | 2.435 | 100 % | – | SPC-Klickvinyl |
| floor4all | 2.239 | 94,1 % | – | Klickvinyl |
| Shop „vidaxl“ | – | 94,1 % | – | Zuordnung zum Händler nicht geprüft |

Nicht ermittelt: „Teppichboden und PVC Beläge Online“ (Kontoname unbekannt, nicht gesucht), teppichwelt_2002 (Seite
ohne Kennzahlen lesbar). Versandkosten stehen oben je Suchbegriff; Muster und Zuschnitt wurden je
Verkäufer nicht sicher ausgewertet. Keiner der Verkäufer steht in unserem privaten Lieferantenschlüssel.

## Empfehlung für den Start

1. **Kein breiter Start zu Shop-Preisen.**
2. **Zuerst Einkaufspreise gegen die Marktpreise legen**, intern und je Warengruppe.
3. **Falls das trägt, kleiner Test** mit einer Warengruppe, die wir nah am Marktpreis liefern können. Nach Nachfrage und wenigen Anbietern kämen zuerst **Kunstrasen und Klickvinyl** infrage.
4. **Vorerst nicht:** Sockelleisten und Wohnteppiche wegen Preiskampf und vieler Anbieter, Maßware und Ketteln mangels sichtbarer Nachfrage.
5. **Nadelfilz nur nach Prüfung:** Die Nachfrage dort ist stark durch Bastelfilz verzerrt.

Unsere Stärke im Shop (Beratung, Maß, Muster, Montage) lässt sich aus diesen Daten nicht bewerten.

## Offene Entscheidungen für den Inhaber

1. **Einkaufspreis-Abgleich:** Vor jeder weiteren Entscheidung intern durchführen.
2. **Preisstrategie:** eigener eBay-Preis mit Aufschlag oder nur Ware, die am Markt mithalten kann.
3. **Konto:** Ein Firmenkonto mit Verkäufer-Cockpit besteht. Ob es für den Neustart taugt (Status, Rechtstexte, Zahlungsdaten), ist nicht geprüft.
4. **Anbindungs-App:** Nicht recherchiert; erst nötig, wenn der Test beschlossen ist.
5. **Rechtstexte:** Impressum, Widerruf, AGB, Datenschutz; Widerruf bei Zuschnitt gesondert prüfen lassen.

## Quellen

- eBay-Produktrecherche im Verkäufer-Cockpit (nur angemeldet): https://www.ebay.de/sh/research
- eBay-Hilfe, Gebühren für gewerbliche Verkäufer: https://www.ebay.de/help/selling/fees-credits-invoices/gebhren-fr-gewerbliche-verkufer?id=4122
- Fachartikel zur Gebührenänderung: https://onlinemarktplatz.de/267961/neue-ebay-gebuehren-fuer-gewebliche-verkaeufer-ab-1-juli-2026/
