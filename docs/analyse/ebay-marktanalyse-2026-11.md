# eBay-Marktanalyse Bodenbeläge, Stand 2026-11-03

**Status: unvollständig.** Die eBay-Verkaufsdaten fehlen, weil eBay den Abruf gesperrt hat.
Es stehen deshalb hier keine Verkaufshäufigkeiten, keine eBay-Preisspannen und keine
Konkurrenten-Kennzahlen. Fertig sind die offiziellen Gebühren und unsere Preise nach Provision.
Geändert wurde nichts, weder in Shopify noch bei eBay.

## Was abgerufen wurde

| Quelle | Ergebnis |
|---|---|
| eBay-Suche „Verkaufte Artikel“, Begriff `teppichboden meterware`, per curl | HTTP 403, Fehlerseite |
| dieselbe Adresse, einmal per Playwright (installiertes Chrome, frisches Profil, keine Tarnung) | HTTP 403, Fehlerseite |
| die übrigen 11 Suchbegriffe | nicht versucht, Abbruch laut Auftrag |
| Shop-Seiten der Konkurrenten | nicht versucht, Abbruch laut Auftrag |
| eBay-Hilfeseite „Gebühren für gewerbliche Verkäufer“ | abrufbar, ausgewertet |
| Lexikon-Export unseres Sortiments vom 2026-11-03 | ausgewertet; 3.011 aktive Produkte, Gegenprobe Admin API: ebenfalls 3.011 |

Treffer je Suchbegriff: **0 von 12 Begriffen ausgewertet.**

Der curl-Abruf lief mit einer browserüblichen Kennung, also nicht als erkennbares Skript. Zudem
schließt die `robots.txt` von ebay.de den Pfad `/sch/` für allgemeine Abrufprogramme aus. Ein
automatischer Abruf dieser Seiten ist also auch ohne Sperre nicht der passende Weg.

## Der richtige Weg zu den Daten

eBay bietet selbst die **Produktrecherche (früher Terapeak)** im Verkäufer-Cockpit an, Reiter
Marktanalyse. Laut eBay ist sie kostenlos, auch ohne eBay-Shop nutzbar und deckt Verkäufe und
Artikelpreise der letzten 3 Jahre ab. Sie braucht ein eBay-Verkäuferkonto mit Zugriff auf das
Verkäufer-Cockpit Pro. Damit lassen sich die 12 Suchbegriffe regelkonform auswerten. Ob sich die
Ergebnisse als Datei ausgeben lassen, ist nicht geprüft.

Suchbegriffe: teppichboden meterware, teppichboden velours, nadelfilz meterware, pvc boden
meterware, vinylboden klick, klebevinyl, teppich wohnzimmer, teppichfliesen, kunstrasen meterware,
sockelleiste, teppich nach maß ketteln, teppichboden rest.

## Gebühren (offizielle eBay-Hilfeseite, abgerufen 2026-11-03)

- **Heimwerker (Kategorie 3187):** 13 % bei Neuware.
- **Möbel & Wohnen (Kategorie 11700):** 14 % bei Neuware.
- **Fester Anteil je Bestellung:** 0,35 €, bei Bestellungen über 10 € 0,45 €.
- **Berechnungsgrundlage:** der Gesamtbetrag samt Versand und Umsatzsteuer.
- **Angebotsgebühr ohne Shop:** 0,35 € je Festpreisangebot; kostenloses Kontingent auf der Seite nicht ausgewertet.
- **Shop-Abos im Monat:** Basis 39,95 € (400 freie Festpreisangebote), Top 79,95 € (2.500), Premium 299,95 € (unbegrenzt).
- Alle Gebühren verstehen sich ohne Mehrwertsteuer.

**Zwei Folgen für die Rechnung:**

1. Die Provision läuft auf den Bruttobetrag. 13 % vom Brutto sind bei 19 % Umsatzsteuer rund
   15,5 % vom Netto. Auch die Versandkosten werden mitverprovisioniert.
2. **Die Kategorie ist offen.** Die Hilfeseite nennt keine Bodenbeläge. Ob Teppichboden und
   Teppiche unter Heimwerker (13 %) oder Möbel & Wohnen (14 %) fallen, ist nicht belegt. Deshalb
   stehen unten beide Sätze.

## Unsere Preise nach Provision

Quelle: Lexikon-Export, nur aktive und verfügbare Varianten. Angaben in €/m² inkl. USt, bei
Wohnteppich und Sockelleisten in € je Variante. P10 und P90 sind die Grenzen, unter denen 10 % bzw.
90 % der Varianten liegen. „Rest“ ist der Medianpreis nach Provision, ohne festen Anteil je
Bestellung. „Nötig“ ist der eBay-Preis, bei dem nach Provision so viel bleibt wie der Shop-Median.

| Warengruppe | Produkte | P10 | Median | P90 | Rest 13 % | Rest 14 % | Nötig 13 % | Nötig 14 % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Teppichboden gesamt | 355 | 36.90 | 69.90 | 129.90 | 60.81 | 60.11 | 80.34 | 81.28 |
| davon Nadelfilz | 18 | 21.90 | 38.90 | 58.90 | 33.84 | 33.45 | 44.71 | 45.23 |
| davon Restrollen | 10 | 29.95 | 34.95 | 39.99 | 30.41 | 30.06 | 40.17 | 40.64 |
| davon Teppichfliesen | 68 | 44.90 | 69.00 | 105.00 | 60.03 | 59.34 | 79.31 | 80.23 |
| Vinyl von der Rolle | 186 | 19.99 | 23.99 | 45.49 | 20.87 | 20.63 | 27.57 | 27.90 |
| Klickvinyl | 541 | 39.99 | 52.99 | 73.99 | 46.10 | 45.57 | 60.91 | 61.62 |
| Klebevinyl | 508 | 30.99 | 39.99 | 46.99 | 34.79 | 34.39 | 45.97 | 46.50 |
| Laminat | 68 | 17.90 | 24.50 | 32.50 | 21.32 | 21.07 | 28.16 | 28.49 |
| Kunstrasen | 8 | 24.90 | 40.90 | 58.90 | 35.58 | 35.17 | 47.01 | 47.56 |
| Teppich nach Maß | 421 | 59.00 | 117.00 | 260.00 | 101.79 | 100.62 | 134.48 | 136.05 |
| Wohnteppich | 373 | 48.99 | 103.99 | 288.99 | 90.47 | 89.43 | 119.53 | 120.92 |
| Sockelleisten | 72 | 11.90 | 18.00 | 29.90 | 15.66 | 15.48 | 20.69 | 20.93 |

Grenzen der Tabelle:

- **Der Vergleich mit eBay-Verkaufspreisen fehlt**, das ist der Kern von Schritt 3 und noch offen.
- Velours lässt sich nicht auswerten: Der Export führt dazu kein eigenes Feld.
- Restrollen: Der Export führt die Einheit als „Stück“. Gerechnet wurde mit dem Variantenpreis, nicht geprüft als €/m².
- Unsere eigenen Kosten im Shop (Zahlungsgebühren, Werbung) sind nicht abgezogen. Der Rest ist also kein Vergleich von Gewinn zu Gewinn. Einkaufspreise stehen bewusst nicht in diesem öffentlichen Bericht.

Rechenbeispiel Provision samt festem Anteil, ohne Versand:

| Bestellung | Betrag | Gebühr 13 % | Gebühr 14 % |
|---|---:|---:|---:|
| 20 m² Teppichboden zum Median | 1.398,00 € | 182,19 € | 196,17 € |
| 20 m² Klebevinyl zum Median | 799,80 € | 104,42 € | 112,42 € |
| 10 Sockelleisten zum Median | 180,00 € | 23,85 € | 25,65 € |

**Erkenntnis:** Gleich viel wie im Shop bleibt erst bei rund 15 bis 16 % höherem eBay-Preis. Ob der
Markt das hergibt, lässt sich ohne die Verkaufsdaten nicht sagen.

## Konkurrenten

Nur Namen aus der vorherigen Websuche. Keine Zahl davon ist auf eBay geprüft.

| Verkäufer | Verkaufte Artikel | Bewertungen | Sortiment | Zuschnitt/Muster/Versand | €/m² |
|---|---|---|---|---|---|
| BRICOFLOR Deutschland | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar |
| vidaXL | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar |
| Fortero (teppicheforterode) | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar |
| der-holz-wurm | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar |
| Teppichboden und PVC Beläge Online | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar |
| teppichwelt_2002 | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar |
| EXPOTOP | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar | nicht abrufbar |

Keiner dieser Namen steht in unserem privaten Lieferantenschlüssel. Weitere häufige Verkäufer
konnten mangels Treffern nicht ergänzt werden.

## Startsortiment: vorläufige Annahme, keine Empfehlung

Eine Empfehlung nach Nachfrage ist ohne Verkaufsdaten nicht möglich. Die folgende Reihenfolge
beruht nur darauf, wie gut sich die Warengruppe technisch als eBay-Angebot abbilden lässt. Sie ist
vor einer Entscheidung mit den Verkaufsdaten zu prüfen.

| Reihenfolge | Warengruppen | Grund |
|---|---|---|
| 1 | Klebevinyl, Klickvinyl, Laminat | feste Pakete mit festem Preis |
| 2 | Sockelleisten, Wohnteppich | feste Stückware, keine Berechnung nach Maß |
| 3 | Vinyl von der Rolle, Teppichboden, Kunstrasen | Meterware: Abbildung von Breite und Länge ist zu klären |
| zuletzt | Teppich nach Maß | Maßanfertigung, Abbildung und Rückgabe sind zu klären |

## Offene Entscheidungen für den Inhaber

1. **Verkäuferkonto:** Gewerbliches eBay-Konto anlegen? Es ist auch die Voraussetzung für die Produktrecherche.
2. **Daten:** Wer führt die Produktrecherche für die 12 Begriffe durch? Danach lässt sich dieser Bericht vervollständigen.
3. **Anbindungs-App:** Welche App verbindet Shopify und eBay? Nicht recherchiert, die Suche dazu blieb ohne Ergebnis.
4. **Preisaufschlag:** Eigener eBay-Preis mit rund 15 bis 16 % Aufschlag oder Shop-Preis mit weniger Rest? Erst mit den Marktpreisen entscheidbar.
5. **Kategorie:** Satz von 13 oder 14 % beim Einstellen bzw. im Verkäufer-Cockpit klären.
6. **Rechtstexte:** Impressum, Widerruf, AGB und Datenschutz für das eBay-Konto; Widerruf bei Zuschnitt und Maßanfertigung gesondert prüfen lassen.

## Quellen

- eBay-Hilfe, Gebühren für gewerbliche Verkäufer: https://www.ebay.de/help/selling/fees-credits-invoices/gebhren-fr-gewerbliche-verkufer?id=4122
- eBay-Hilfe, Produktrecherche: https://www.ebay.de/help/selling/selling-tools/terapeak-research?id=4853
- eBay-Mitteilung, kostenfreie Produktrecherche: https://community.ebay.de/t5/eBay-Mitteilungen/Terapeak-Produktrecherche-ist-ab-sofort-kostenfrei-f%C3%BCr/ba-p/4364574
- Fachartikel zur Gebührenänderung: https://onlinemarktplatz.de/267961/neue-ebay-gebuehren-fuer-gewebliche-verkaeufer-ab-1-juli-2026/
