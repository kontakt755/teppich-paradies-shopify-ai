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

## Warenkorb und Bestellung

Die Zeile trägt `Länge je Stück` („95 cm“), `Anzahl` („10 Stück“), `Gesamtlänge`
(„9,50 m“), `Bohrung` und eine eigene `_Gruppe` (Menge im Warenkorb gesperrt,
Anzeige „10 × 95 cm“, Einzelpreis „/m“). Eine Zeile dieses Produkts ohne
`Länge je Stück` sperrt den Checkout (`snippets/tp-cart-laengenware.liquid`).

Im Einkauf (Control Center, `operations/lib/bestelluebersicht.mjs`) wird daraus
„10 Stück à 95 cm, gebohrt“ und in der Ausführung „Zuschnitt: 10 × 95 cm“ und
„Bohrung: gebohrt“; die Maßprüfung vergleicht die Menge mit Länge × Stückzahl.

## Offen beim Anlegen

- Preisregel (EK → VK) braucht die Freigabe des Inhabers.
- Versand: Paketdienst nimmt nur begrenzte Längen; Stücke darüber gehen als
  Sperrgut. `service.max_laenge_cm` erst festlegen, wenn die Versandgrenze des
  Lieferanten belegt ist.
