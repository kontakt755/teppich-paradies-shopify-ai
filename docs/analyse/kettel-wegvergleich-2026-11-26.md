# Großer Kettelteppich: eigener Kettler oder fertig gekettelt vom Lieferanten?

Stand 2026-11-26, Aufgabe #2225 (Rest aus #1684). Nur gerechnet: **in Shopify ist nichts geändert**, keine
Mail, keine Bestellung. Rechnung: `node operations/scripts/kettel-wegvergleich.mjs [--eigens]`, Eingaben mit
Quelle je Wert: [`kettel-wegvergleich-eingaben.json`](kettel-wegvergleich-eingaben.json). Alle Beträge netto.

- **Weg A:** Rohware von Lieferant A im Fertigmaß + 3 cm Zugabe, Abholung, eigener Kettler, Versand per
  Spedition (GEL) ab Kettler.
- **Weg B:** bei Lieferant A fertig gekettelt bestellen, Direktversand an den Kunden.

## Ergebnis

**Für 2 × 3, 3 × 4 und 4 × 5 m ist Weg B (fertig gekettelt, Direktversand) günstiger: um 14 €, 45 € und
114 €.** Mit einer eigens gefahrenen Tour zum Kettler wächst der Abstand auf 78 €, 109 € und 178 €.
Der Abstand wächst mit der Größe. Es gibt in diesem Bereich keinen Umschlagpunkt zugunsten des Kettlers.

| Größe | Weg A: Material / Ketteln / Arbeit / Fahrt / GEL | **A** | Weg B: Material / Ketteln / Fracht / Mindermenge | **B** | B bleibt günstiger bis Fracht B |
|---|---|---:|---|---:|---:|
| 2 × 3 m | 82 / 35 / 8 / 0 / 63 | **187 €** | 80 / 50 / 25 / 18 | **173 €** | 39 € |
| 3 × 4 m | 164 / 69 / 8 / 0 / 78 | **319 €** | 161 / 70 / 25 / 18 | **274 €** | 70 € |
| 4 × 5 m | 271 / 89 / 8 / 0 / 146 | **514 €** | 268 / 90 / 25 / 18 | **401 €** | 138 € |

Fahrt hier gebündelt (0 €). Mit eigener Fahrt (63,60 €) kostet Weg A 251 / 382 / 578 €.

**Warum:** Über 6 m² ist der Kettler mit 4,95 €/lfm kaum billiger als Lieferant A mit 5 €/lfm. Die
Spedition ab Kettler (63–146 €, bei 4 m Rolle mit XXL-Zuschlag) kostet aber deutlich mehr als Fracht und
Mindermenge von A (43 €). Zugabe und Arbeitszeit kommen auf Weg A noch dazu.

**Faustregel:** Ab 2 m kurzer Seite fertig gekettelt beim Lieferanten bestellen, wenn er direkt liefern
kann. Der Kettler lohnt sich bei großen Teppichen nur, wenn der Kunde im Verlegegebiet wohnt und der
Bodenleger abholt (keine GEL) oder wenn Lieferant A deutlich teurer kettelt als 5 €/lfm (siehe unten). Unter
2 m kurzer Seite gilt weiter die Paketrechnung aus
[`gel-gls-kettelware-2026-11-09.md`](gel-gls-kettelware-2026-11-09.md) und
[`kettelweg-paket-2026-10-19.md`](kettelweg-paket-2026-10-19.md).

## Wie stabil ist das?

| Annahme geändert | 2 × 3 | 3 × 4 | 4 × 5 |
|---|---|---|---|
| Lieferant A kettelt zu 7,50 €/lfm (Rechnung Oktober) | **A** günstiger (187 gegen 198 €) | B (309 €) | B (446 €) |
| Kettler berechnet den angekündigten Sonderpreis 2,49 €/lfm | B, knapp (177 gegen 173 €) | B | B |
| Kettelpreis von A, ab dem Weg A gewinnt | über 6,38 €/lfm | über 8,23 €/lfm | über 11,31 €/lfm |
| Fracht von A für den Direktversand, ab der Weg A gewinnt | über 39 € | über 70 € | über 138 € |
| dünne Linie (GEL 52 / 63 / 119 €) | B | B | B |
| dicke Linie (GEL 79 / 111 € / nicht berechenbar) | B | B | offen |

Bei 2 × 3 m kippt das Ergebnis schon bei kleinen Änderungen. Ab 3 × 4 m hält „fertig gekettelt“ in jedem
gerechneten Fall.

## Was für eine sichere Entscheidung fehlt (Fragen an den Inhaber)

1. **Was kostet der Direktversand einer 3–4 m langen gekettelten Rolle bei Lieferant A an eine
   Privatadresse?** Belegt sind nur 24,90 € (Logistik + Diesel) für die LKW-Lieferung **in den Laden**.
   Das ist die wichtigste Lücke. Weg B bleibt günstiger, solange diese Fracht unter 39 € (2 × 3) bzw.
   70 € (3 × 4) bzw. 138 € (4 × 5) liegt.
2. **Welcher Kettelpreis gilt bei Lieferant A wirklich?** Gerechnet mit den mündlich zugesagten ca. 5 €/lfm.
   Die Rechnungen nennen 3,90, 5,50 und 7,50 €/m. Bei 7,50 € ist für 2 × 3 m der Kettler günstiger.
3. **Kommt der Sonderpreis 2,49 €/lfm des Kettlers?** Er ändert das Ergebnis nicht. Bei 2 × 3 m fehlen dann
   aber nur noch 4 €.
4. **Packrolle messen und wiegen (Werkbank w-228).** Verpackung ist mit 0 kg und ohne Kern gerechnet. Das
   macht die GEL-Preise eher zu niedrig. Weg A würde dadurch noch teurer.
5. **Einkaufspreis anderer Linien.** Belegt ist nur ein Artikel von Lieferant A (13,39 €/m²). Der Preis
   betrifft beide Wege fast gleich, nur die Zugabe (ca. 1–3 €) hängt daran.
6. **Arbeitszeit und Stundensatz** (15 min, 30 €/h) sind Annahmen. Sie machen nur 8 € aus.
7. **Lieferanten D und E** sind nicht gerechnet. Bei ihnen fehlt ein belegter Kettelpreis.
   Die Regel „Fall für Fall“ (Inhaber 03.11.) bleibt.

## Grenzen

- GEL mit dem Rechner des Control Centers und dem privaten Tarif gerechnet (Diesel bis 29.11.2026). Abholung
  beim Kettler in Berlin mit Metropolenzuschlag, Ziel eine Privatadresse außerhalb der Metropolen,
  Depot-Avis, Transportversicherung. Ziel in PLZ 17–19 macht GEL teurer.
- Rolle je Teppich entlang der kurzen Seite, Länge kurze Seite + 2 cm, mittlere Linie (8,6 mm, 2,65 kg/m²).
- Weg A ohne Fracht und Mindermenge von A, weil wir die Ware abholen. Das gilt nur bei gebündelter Tour.
- Die Gegenrechnung je Bestellung im Bestelldialog (`kettelwegVergleich` in `operations/lib/bestellwarnung.mjs`)
  rechnet ähnlich mit den echten Bestelldaten. Dieses Skript ist nur der allgemeine Vergleich nach Größe.
