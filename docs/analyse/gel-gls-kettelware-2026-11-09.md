# Kettelware ab Kettler: Paket (GLS) oder Spedition (GEL)?

Stand 2026-11-09, Aufgabe #1684 Teil 2. Nur gerechnet: **in Shopify ist nichts geändert**, nichts gebucht,
keine Mail. Gerechnet mit dem Versandkosten-Rechner des Control Centers
(`docs/ai-dashboard/lib/versandkosten.mjs`) und dem privaten Tarifstand. Alle Beträge **netto**, auf ganze Euro
gerundet. Vertragssätze, Zuschläge und die Aufschlüsselung stehen bewusst nicht im Repository.

## Ergebnis

1. **Wo GLS zulässig ist, ist es immer günstiger.** Über rund 3.000 gerechnete Maße mit beiden Diensten
   (kurze Seite 100–198 cm, lange Seite bis 600 cm, drei Teppichlinien) kostet GEL mindestens **28 €** mehr als
   GLS. Auch ohne
   Metropolenzuschlag **und** ohne Transportversicherung bleiben es mindestens 12 €. Es gibt also keinen
   Preis-Umschlagpunkt „ab Maß X oder Gewicht Y ist GEL billiger“. GEL wird nur genommen, wenn GLS nicht darf.
2. **GEL ist nötig, sobald die Rolle nicht in ein GLS-Paket passt:**
   - **Kurze Seite über 198 cm.** Die Rolle ist kurze Seite + 2 cm Verpackungszugabe lang, GLS nimmt höchstens
     200 cm. Bei exakt 200 cm Rolle ohne Zugabe ginge GLS bei dünnen Teppichen noch.
   - **Gurtmaß über 300 cm** (Länge + 2 × Breite + 2 × Höhe der Rolle). Das trifft dicke Teppiche mit langer
     Seite (Tabelle unten), nicht das Gewicht.
3. **Das Gewicht ist nicht der Treiber.** Die 40-kg-Grenze von GLS entscheidet in keinem gerechneten Fall allein. Für Rollen
   zählt das Volumengewicht (GLS Länge × Breite × Höhe ÷ 6000, GEL m³ × 167): ein dicker Teppich 160 × 230 wiegt
   13 kg, abgerechnet werden 21 kg. Das Gewicht legt nur die Preisstufe fest, die Rollenmaße entscheiden über den
   Dienst.
4. **Frühere Schätzung zu niedrig:** GLS ist für Rollen über 150 cm kein 9–10-€-Paket (Überlänge sowie Energie-
   und Dieselzuschlag), sondern kostet für 160 × 230 rund **20–24 €**. GEL kostet für die Beispiele **49–87 €**.

## Datenlage: welche Gewichte gibt es?

Abgefragt wurde nur lesend in Shopify (421 aktive Produkte „Teppich nach Maß“) und auf den öffentlichen
Produktseiten von Lieferant A.

| Feld / Quelle | Befund |
|---|---|
| Produktfeld „Gesamtgewicht“ | gibt es nicht (alle Produkt-Metafelddefinitionen geprüft), 0 von 421 |
| Versandgewicht der Variante | bei allen geprüften Kettel-Varianten 0 kg; über 0 nur bei 28 Fertigteppichen von Lieferant B (dort kg je m² ÷ 100) |
| `service.kg_pro_qm` | 30 von 421, alle Fertigteppiche von Lieferant B (1,55–4,40 kg/m²), laufen nicht über den Kettler |
| Polgewicht `custom.poleneinsatzgewicht` | 0 von 421; am Teppichboden vorhanden, aber nur der Pol, kein Gesamtgewicht, daher nicht verwendet |
| Gesamtstärke `custom.gesamtstarke` | 93 von 103 Kettelprodukten von Lieferant A (4,5–24 mm, Mitte 8,6 mm), keine bei C, D, E |
| Kettelprodukte C (33), D (53), E (35) | **Gewicht und Stärke fehlen** |
| Öffentliche Produktseite Lieferant A, Feld „Gewicht pro qm“ | für 3 von 4 gelesenen Linien belegt, eine Linie widersprüchlich (2,58 kg gegen 580 g/m²) und nicht verwendet |

Produkte mit Einfassung „Ketteln“ nach Lieferant: A 103, C 33, D 53, E 35. Bei D und E steht „Kante inklusive“,
der Kettelweg wird dort Fall für Fall geklärt.

**Für die Rechnung belegt** (Gewicht von der Seite des Lieferanten, Stärke aus Shopify, bei Piumera auf beiden
Seiten gleich):

| Teppichlinie im Shop | Gesamtgewicht | Gesamtstärke |
|---|---:|---:|
| Ombra | 1,44 kg/m² | 4,5 mm |
| Boucella | 2,65 kg/m² | 8,6 mm |
| Piumera | 3,5 kg/m² | 21,5 mm |

Sie stehen für dünn und leicht, Mitte, dick und schwer und decken die Stärken der Lieferant-A-Kettelware ab.
Für C, D und E gibt es keine Zahl, dort wurde nichts geschätzt. Die Gewichte wurden **nicht** nach Shopify
geschrieben.

## Rechnung für drei typische Maße

Eine Rolle je Teppich, Länge = kurze Seite + 2 cm, Durchmesser aus Gesamtstärke × lange Seite (Packhilfe des
Control Centers, Kern 0 cm, Zugabe 2 cm). Abholung beim Kettler in Berlin-Charlottenburg, Zustellung an eine
Privatadresse im Festland.

| Linie | Maß (cm) | m² | Ware | Rolle (cm) | GLS | GEL |
|---|---|---:|---:|---|---:|---:|
| Ombra | 160 × 230 | 3,7 | 5,3 kg | 162 × 14 × 14 | **20 €** | 49 € |
| Ombra | 200 × 300 | 6,0 | 8,6 kg | 202 × 16 × 16 | nicht möglich (Länge) | **49 €** |
| Ombra | 250 × 350 | 8,8 | 12,6 kg | 252 × 17 × 17 | nicht möglich (Länge) | **59 €** |
| Boucella | 160 × 230 | 3,7 | 9,8 kg | 162 × 18 × 18 | **21 €** | 49 € |
| Boucella | 200 × 300 | 6,0 | 15,9 kg | 202 × 21 × 21 | nicht möglich (Länge) | **59 €** |
| Boucella | 250 × 350 | 8,8 | 23,2 kg | 252 × 22 × 22 | nicht möglich (Länge) | **70 €** |
| Piumera | 160 × 230 | 3,7 | 12,9 kg | 162 × 28 × 28 | **24 €** | 70 € |
| Piumera | 200 × 300 | 6,0 | 21,0 kg | 202 × 31 × 31 | nicht möglich (Länge, Gurtmaß) | **75 €** |
| Piumera | 250 × 350 | 8,8 | 30,6 kg | 252 × 33 × 33 | nicht möglich (Länge) | **87 €** |

Fett ist der Dienst, der in Frage kommt. Der Preis steigt bei GEL mit Gewicht und Rollenvolumen in Stufen.

### Bis zu welcher langen Seite geht GLS?

Größte lange Seite in cm, bei der ein Teppich mit dieser kurzen Seite noch per GLS geht (Zugabe 2 cm):

| kurze Seite | 120 cm | 160 cm | 180 cm | 198 cm |
|---|---:|---:|---:|---:|
| Ombra (4,5 mm) | 600 | 600 | 600 | ca. 600 |
| Boucella (8,6 mm) | 600 | 600 | 600 | ca. 480 |
| Piumera (21,5 mm) | 600 | ca. 370 | ca. 265 | nicht möglich |

600 cm ist die größte Länge, die der Shop anbietet. Ab einer kurzen Seite von 199 cm geht GLS für keine Linie.

## Wie stabil ist das?

Kleinster Abstand GEL − GLS über alle gerechneten Maße, netto:

| Annahme | Abstand |
|---|---:|
| Basis (Abholung Berlin mit Metropolenzuschlag, Transportversicherung) | 28 € |
| ohne Metropolenzuschlag (Abholung außerhalb) | 18 € |
| ohne Transportversicherung (schriftlicher Verzicht) | 21 € |
| ohne beides | 12 € |
| Zustellung in PLZ 17–19 (Gebietszuschlag GEL) | 39 € |
| Rolle ohne Zugabe (200 cm): GLS geht bei dünnen Teppichen mit kurzer Seite 200 cm | 28 € |

Die Aussage „GLS zuerst, GEL nur wenn GLS nicht geht“ hält in jedem dieser Fälle.

## Annahmen und Grenzen

- **Tarifstand:** Konditionen September 2026. Die Dieselzuschläge sind nur bis Oktober (GLS) bzw. KW 43 (GEL)
  gepflegt, deshalb mit Versanddatum 21.10.2026 gerechnet. Für November nicht aktualisiert; beide Dienste
  verschieben sich dadurch um wenige Prozentpunkte, am Ergebnis ändert das nichts.
- **Metropolenzuschlag GEL** für Berlin einmal angesetzt. Ob er bei Abholung beim Kettler anfällt, ist offen.
- **Verpackung:** Verpackungsgewicht (Folie, Hülse) nicht gewogen und mit 0 kg angesetzt, Rollenkern 0 cm.
  Beides macht die echte Rolle etwas schwerer und dicker; eine fertige Packrolle zu messen und zu wiegen steht
  in der Werkbank (w-228).
- **GLS-Überlänge** ab 150 cm nach der öffentlichen GLS-FAQ; der Vertrag nennt die Schwelle nur über ein Glossar.
- Warenwert bis 1.500 € (Transportversicherung eine Stufe), Zahlung per SEPA, keine Terminzustellung, keine
  Insel, keine Retoure.
- **Nicht geprüft:** der volle Wegvergleich (Rohware + Kettler + Versand gegen Direktfertigung beim Lieferanten
  samt Fracht) für einen konkreten großen Teppich. Dafür fehlen der Einkaufspreis und der Kettelpreis eines
  gewählten Teppichs; die Versandseite steht mit dieser Analyse.

## Folgerung für die Kettler-Weiche

- Ist die kurze Seite höchstens 198 cm, kostet der Weg über den Kettler rund 20–24 € Paket. Darüber kommt eine
  Spedition mit 49–87 € dazu (Beispiele oben). Wer „Kettler“ gegen „fertig gekettelt vom Lieferanten“ abwägt,
  muss ab 199 cm kurzer Seite diese GEL-Kosten gegenrechnen, früher reicht die Paketrechnung.
- Die Entscheidung hängt an den Rollenmaßen, nicht an einem Gewicht. Gewichte je m² sollten trotzdem an den
  Produkten stehen: Die Packhilfe liest „Gesamtgewicht“ und „Gesamtstärke“ aus den Lexikondaten der Produkte,
  für das Gewicht gibt es in Shopify aber kein Feld. Es anzulegen und zu füllen ist eine Produktdatenänderung
  und braucht eine Freigabe.
- Die offenen Inhaber-Fragen zur Kettler-Weiche und zum Puffer bei Bändern stehen in der Werkbank (w-226).
