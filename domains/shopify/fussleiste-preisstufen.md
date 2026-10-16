# Gekettelte Fußleiste: Preisstufen

Freigabe Inhaber 2026-10-16. Produkt `teppich-fussleiste-gekettelt`
(Service, nicht gelistet), gebucht nur über den Rollenrechner
(`blocks/tp-rollware-rechner.liquid`, Block-Einstellung `kettelleisten_produkt`).

## Regel

- **Meterpreis = Fertigung + Höhe × m²-Preis des Teppichbodens**, Fertigung
  5,50 €/lfm (Annahme, freigegeben). Das Material steckt im Meterpreis; einen
  eigenen Materialposten gibt es nicht.
- **Fünf Preisstufen**, gerechnet mit der Obergrenze der Stufe und
  aufgerundet auf ,45 oder ,95 – so ist das Material nie zu billig.
- **Ganze Streifen:** Die Leiste wird quer über die Rolle geschnitten. Der
  Rechner rundet die Länge auf volle Rollenbreiten auf (17 m aus der
  4-m-Rolle = 5 Streifen = 20 m) und schreibt den Zuschnitt als
  Zeileneigenschaft `Zuschnitt` (z. B. „5 Streifen à 4 m“) in den Warenkorb.
  Damit ist der zusätzliche Streifen immer gebucht, auch bei Raummaß.
- **Welche Stufe:** der Meterwarepreis je m² der gewählten Farbe aus der
  Rolle, von der geschnitten wird (Meterware: gewählte Breite; Raummaß:
  kleinste Rolle der Farbe, die das Stück trägt). Der Raummaß-Aufschlag ist
  Zuschnitt, kein Material, und zählt nicht. Genau auf der Grenze (30,00 €/m²)
  bleibt die niedrigere Stufe.
- **Über 100 €/m²:** keine Fußleiste (fail closed, wie der Kettelservice). Ob
  die Leiste überhaupt erscheint, entscheidet weiterhin allein
  `service.einfassen = Verfügbar` der gewählten Variante.

## Varianten und Preise

Option 1 `Höhe`, Option 2 `Teppichpreis` mit den Werten „für Teppich bis
20 €/m²“ … „für Teppich bis 100 €/m²“. Der Rechner liest die Obergrenze aus
dem Text („bis 30“), die Preise stehen nur in Shopify.

| Höhe | bis 20 €/m² | bis 30 | bis 45 | bis 65 | bis 100 |
|---|---:|---:|---:|---:|---:|
| 5 cm | 6,95 | 7,45 | 7,95 | 8,95 | 10,95 |
| 6 cm | 6,95 | 7,45 | 8,45 | 9,45 | 11,95 |
| 7 cm | 6,95 | 7,95 | 8,95 | 10,45 | 12,95 |
| 8 cm | 7,45 | 7,95 | 9,45 | 10,95 | 13,95 |
| 9 cm | 7,45 | 8,45 | 9,95 | 11,45 | 14,95 |
| 10 cm | 7,95 | 8,95 | 10,45 | 12,45 | 15,95 |

Bis 2026-10-16 galt pauschal 10,95 €/lfm für jede Höhe.

## Ändern

Neue Fertigungskosten oder Stufen: Tabelle mit der Formel neu rechnen, die
Variantenpreise per `productVariantsBulkUpdate` setzen und gegenprüfen
(`userErrors: []` ist kein Beleg). Preisänderungen brauchen die Freigabe des
Inhabers. Eine neue Stufe ist nur ein neuer Wert der Option `Teppichpreis` mit
„bis <Zahl>“ im Text – der Rechner braucht dafür keine Änderung.

Vergleich vom 2026-10-15: ein großer Wettbewerber rechnet etwa 2 € + 19 % des
m²-Preises je lfm, nur in 4-m-Schritten.
