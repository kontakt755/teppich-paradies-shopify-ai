# Profile nach Maß (Treppenkanten, Längen-Zuschnitt)

Seit 2026-10-16. Profile, die der Lieferant zentimetergenau zuschneidet und bohrt
(Lieferant G, Direktversand an den Kunden). Der Kunde gibt Länge je Stück in cm,
Stückzahl und Bohrung an.

## Abrechnung

Wie der Kettelservice: **Variantenpreis je 0,01 laufendem Meter (1 cm)**, Menge =
Länge je Stück × Stückzahl in cm. Ein Meterpreis muss deshalb ein **ganzer
Eurobetrag** sein (26,00 €/m = 0,26 € je cm); krumme Meterpreise lassen sich nicht
in Cent je Zentimeter abbilden.

## Datenvertrag (Produkt)

| Feld | Wert |
|---|---|
| Vorlage | `treppenkante-nach-mass` (Kaufknöpfe aus, Block `tp-laengen-zuschnitt`) |
| `custom.preis_pro_001_lfm` | `true` – Variantenpreis gilt je 0,01 lfm |
| `service.max_laenge_cm` | größte Länge je Stück (Versandgrenze beachten, siehe unten) |
| `service.min_seite_cm` | optional, kleinste Länge je Stück (sonst 10 cm) |
| `service.bohrung` | Liste der lieferbaren Ausführungen, z. B. `["gebohrt", "ungebohrt"]`; der erste Wert ist vorgewählt |
| Option `Farbe` | Oberfläche, z. B. „Messing poliert“, „Silber eloxiert“ |

Fehlt eines der Pflichtfelder, rendert der Block nichts (fail closed). Ohne
`custom.preis_pro_001_lfm` zeigten Karte und Suche den Preis je Zentimeter.

- **Produkttyp nie „Service“:** sonst gilt die Zeile im Warenkorb als verwaister
  Service (Checkout gesperrt) und das JSON-LD entfällt.
- `service.max_laenge_cm` und `service.min_seite_cm` als **Ganzzahl**
  (`number_integer`) anlegen, sonst zeigt der Block „150.0 cm“.
- Das Produkt höchstens 20 Metafelder im Namensraum `custom` tragen lassen: der
  Bestellabruf (`operations/sync/orders.mjs`) liest nur die ersten 20, sonst
  fehlt `preis_pro_001_lfm` im Einkauf und dort stünde wieder „950 Stück“.
- **Nur Onlineshop, nicht Google:** Der Feed meldet den Variantenpreis
  (0,26 €), Seite und JSON-LD den Meterpreis – Merchant Center wertet das als
  Preisabweichung (wie bei Teppich nach Maß: nur mit Zusatzquelle).

## Warenkorb und Bestellung

Die Zeile trägt `Länge je Stück` („95 cm“), `Anzahl` („10 Stück“), `Gesamtlänge`
(„9,50 m“), `Bohrung` und eine eigene `_Gruppe` (Menge im Warenkorb gesperrt,
Anzeige „10 × 95 cm“, Einzelpreis „/m“). Eine Zeile dieses Produkts ohne
`Länge je Stück` sperrt den Checkout (`snippets/tp-cart-laengenware.liquid`).

Im Einkauf (Control Center, `operations/lib/bestelluebersicht.mjs`) wird daraus
„10 Stück à 95 cm, gebohrt“ und in der Ausführung „Zuschnitt: 10 × 95 cm“ und
„Bohrung: gebohrt“; die Maßprüfung vergleicht die Menge mit Länge × Stückzahl.

Die interne Bestellmail (Admin-Vorlage,
`domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid`) zeigt seit
2026-10-16 ebenfalls „Zuschnitt: 10 × 95 cm“ und „Bohrung: gebohrt“ und prüft die
Menge: Sie muss **genau** Länge je Stück × Anzahl in cm sein. Zu wenig (per
`/cart/change.js` verkleinert) und zu viel lösen den Alarm „NICHT ZUSCHNEIDEN“
aus, eine Zeile ohne `Länge je Stück` zeigt „Maßangabe fehlt“. Den Zweig wählt
das Metafeld `custom.preis_pro_001_lfm`, nicht die Properties.

## Angelegt (2026-10-19)

Sieben Produkte (Handles `treppenkante-…-nach-mass`, Tag `treppenkante-nach-mass`,
Produkttyp `Abschlussprofile`, nur Onlineshop), 15 Farben, SKU `TKMASS_<Art.-Nr.>`.

- **Preisregel (Inhaber 2026-10-19, „marktnah“):** Meterpreis je Profil und
  Oberfläche knapp unter dem Endkundenmarkt für Festlängen ohne Zuschnitt,
  ganze Euro. Messing 47–69 €/m, Alu 18–22 €/m.
- **Länge je Stück höchstens 175 cm** (`service.max_laenge_cm`): Paketgrenze
  des Versanddienstleisters des Lieferanten; längere Stücke nur auf Anfrage.
- **Zuschnitt aus einer Stange:** Jedes Stück kommt in einem Stück aus einer
  Profilstange (wegen des Bohrbilds nie gestückelt); den Rest der Stange tragen
  wir. Die Stangenlänge steht je Variante in `einkauf.stangenlaenge_cm`
  (250/360/503); der Einkauf zeigt daraus „· aus 2 Stangen à 5,03 m (10,06 lfm)“
  (`stangenText` in `operations/lib/bestelluebersicht.mjs`, 0,5 cm Sägeschnitt
  angenommen).

## Schrauben

Auf Wunsch (Kästchen nicht vorbelegt) legt der Block eine Schraubenzeile
derselben `_Gruppe` dazu:

| Feld | Wert |
|---|---|
| Block-Einstellung `schrauben_produkt` | `schrauben-treppenkante-3x30`, Produkttyp `Service`, UNLISTED, Preis je Schraube, Option 1 `Ausführung` (vernickelt/vermessingt) |
| Varianten-Metafeld `service.schraube` | passende Ausführung je Profilfarbe; fehlt es, gibt es keine Schrauben |
| `schrauben_rand_mm` / `schrauben_lochabstand_mm` | Bohrbild des Lieferanten: 30 mm Randabstand, Lochabstand unter 160 mm |

Schrauben je Stück = `TPLaengenZuschnitt.lochzahl` (100 cm → 7). Nur bei
„gebohrt“. Die Zeile trägt `Zu Treppenkante` und `Bohrungen` („10 Stück × 7 je
95 cm“); ohne Profilzeile ist sie eine Waise und sperrt den Checkout. Dübel für
Beton- und Steinstufen führt der Lieferant nicht; der Block weist darauf hin.
