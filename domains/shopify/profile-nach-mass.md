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

Grenze: Die interne Bestellmail (Admin-Vorlage,
`domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid`) kennt
Längenware noch nicht; ihre Auffangregel greift nur bei `preis_pro_001_qm`. Eine
per `/cart/change.js` verkleinerte Menge fällt dort nicht auf, im Control Center
(Maßprüfung) schon.

## Offen beim Anlegen

- Preisregel (EK → VK) braucht die Freigabe des Inhabers.
- Versand: Paketdienst nimmt nur begrenzte Längen; Stücke darüber gehen als
  Sperrgut. `service.max_laenge_cm` erst festlegen, wenn die Versandgrenze des
  Lieferanten belegt ist.
