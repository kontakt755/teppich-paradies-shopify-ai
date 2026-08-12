# Rollenware / Options Price Calculator – Datenreport

Stand: 11. August 2026  
Shop: `sjjyq1-6w.myshopify.com`  
Basis: alle 348 aktiven Produkte und 1.409 Varianten wurden über die offizielle Shopify Admin GraphQL API gelesen.

## Ergebnis

| Klassifikation | Produkte |
|---|---:|
| A – nur 4,00 m | 8 |
| B – nur 5,00 m | 1 |
| C – 4,00 m + 5,00 m | 47 |
| D – andere eindeutige Breite(n) | 63 |
| E – nicht zuverlässig feststellbar | 0 |
| **Rollenware gesamt** | **119** |

Gruppe D besteht aus 2 Produkten mit 3,00 m, 58 Produkten mit 2,00 m + 4,00 m und 3 Produkten mit 2,00 m + 3,00 m + 4,00 m.

Erkannt wurden 20 Produkte mit Produkttyp `Teppichboden`, 63 mit Produkttyp `Vinyl von der Rolle` und 36 weitere eindeutig als Teppichboden-Rollenware belegte Produkte mit leerem Produkttyp. Paketware mit `custom.qm_pro_paket`, Klick-/Klebevinyl, Stückware und Fixpreisprodukte wurden ausgeschlossen.

## Verwendetes Metafield

- Produkt: `custom.rollenbreite`, Typ `number_decimal`, Einheit in Metern
- Produktvariante: `custom.rollenbreite`, Typ `number_decimal`, Einheit in Metern

Bei den 11 Produkten mit genau einer Breite wurde der Produktwert gesetzt. Zusätzlich tragen deren 92 echten Farbvarianten denselben Wert. Dadurch kann ein universeller Rechner immer das Metafield der aktuell ausgewählten echten Variante verwenden.

Bei 108 Produkten mit mehreren Breiten wurde kein irreführender Einzelwert auf Produktebene gesetzt. Stattdessen wurden alle 1.024 echten Breiten-/Farbvarianten variantenspezifisch mit 2, 3, 4 oder 5 befüllt.

Insgesamt wurden automatisch befüllt:

- 11 Produkt-Metafields
- 1.116 Varianten-Metafields
- 1.127 Metafields insgesamt

Die Rückleseprüfung ergab 1.127 von 1.127 erwarteten Werten, 0 Abweichungen und 0 unerwartete Werte.

## OPC-Varianten

Varianten, deren Titel mit `opc-` beginnt, wurden vor der Breitenanalyse ausgeschlossen. Im Rollenware-Bestand wurden 10 solche Varianten auf 4 Produkten gefunden. Keine davon erhielt ein Rollenbreiten-Metafield; gelöscht oder verändert wurde keine.

## Beleglage

Die Breite wurde in der vorgegebenen Priorität aus echten Varianten, breitenbezogenen vorhandenen Metafeldern, Produkttitel und Breiten-Tags ermittelt. Eine Zahl galt nur mit expliziter Einheit (`m`, `Meter` oder `cm`) als Breite. Unabhängige Quellen stimmten bei den automatisch geschriebenen Fällen überein. Bilder wurden nicht zur Klassifizierung verwendet.

Ein-Breiten-Produkte:

- 4 m: `aluvia-teppichboden`, `seleno-teppichboden`, `tavora-teppichboden`, `norway-teppichboden-400cm-und-500cm-kopie`, `corvano-teppichboden`, `rivena-teppichboden-400cm`, `regalia-teppichboden-400cm`, `boucella-teppichboden-400cm`
- 5 m: `softiq-teppichboden`
- 3 m: `livano-eiche-hellgrau-beige-vinylboden-300cm`, `livano-vinyl-von-der-rolle-300cm-eiche-beige`

Bei allen 108 Mehrbreiten-Produkten sind die Breiten bereits echte Shopify-Varianten. Für 47 Teppichboden-Produkte sind dies 4 m und 5 m; bei Rollen-Vinyl sind es 2/4 m beziehungsweise 2/3/4 m. Deshalb ist die technisch saubere Lösung **A: bestehende echte Shopify-Breitenvarianten**, nicht ein zweites, davon unabhängiges Breitenfeld im Calculator.

## Bestehende OPC-Integration

Das Theme enthält den App-Block `Options Price Calculator / product_calculator` bereits in den Produkt-Templates. Eine dokumentierte Admin-Schnittstelle zum Lesen oder Verändern der Calculator-Zuordnungen wurde nicht gefunden; interne App-Endpunkte wurden nicht verwendet. Die öffentlich dokumentierte App-Beschreibung nennt Formeln, Variantenanzeige und Metafield-Datenintegration. Ob die vorhandenen Calculator-Zuordnungen in der App aktuell mehrfach oder einzeln gepflegt sind, ist aus Shopify-/Theme-Daten nicht belastbar auslesbar.

## Zielkonfiguration: ein universeller Rechner

Das vorbereitete Datenmodell benötigt fachlich **einen Calculator „Rollenware“**:

1. Eingabe `Länge` in Metern als positive Dezimalzahl anlegen; sinnvolle Mindest-/Maximalwerte im OPC-Editor festlegen.
2. Die Rollenbreite aus `current variant → custom.rollenbreite` lesen. Bei Ein-Breiten-Produkten ist derselbe Wert zusätzlich am Produkt gespeichert.
3. Shopify-Variantenanzeige aktiv lassen. Bei Mehrbreiten-Produkten wählt der Kunde die vorhandene Variante 2/3/4/5 m; kein separates OPC-Breitenfeld duplizieren.
4. Formel: `Fläche = Länge × Rollenbreite`.
5. Formel: `Gesamtpreis = Fläche × Shopify-Preis pro m²`.
6. Länge, ausgewählte Breite, berechnete Fläche und Gesamtpreis in Warenkorb-/Bestelldaten übernehmen.
7. Mit je einem 4-m-, 5-m-, 4+5-m-, 2+4-m- und 2+3+4-m-Produkt testen, einschließlich Variantenwechsel und Warenkorb.
8. Den Calculator anschließend einmalig per App-Bulk-Linking den Rollenware-Produktgruppen/Collections `Teppichboden` und `Vinyl von der Rolle` zuweisen. Paket-/Fixpreisprodukte ausdrücklich ausschließen.

Die App bewirbt Metafield-Datenintegration, diese gehört laut Shopify-App-Listing mindestens zum Starter-Tarif. Die exakte Variablenbezeichnung für das Metafield muss einmal im OPC-Formeleditor ausgewählt werden; sie wurde nicht über eine undokumentierte API geraten oder gesetzt. Sollte der Editor wider Erwarten nur Produkt- und keine aktuell gewählten Varianten-Metafields anbieten, ist vor dem Linking eine Bestätigung des App-Supports nötig. Das Datenmodell selbst erfordert dadurch nicht automatisch mehrere Calculatoren.

## Noch manuell zu klären

- **Produktbreiten:** keine; Gruppe E enthält 0 Produkte.
- **Einmalig in OPC:** Metafield im Formeleditor auswählen, Formel/Validierungen setzen, fünf Repräsentanten testen und den einen Calculator per Bulk Linking den beiden Rollenware-Gruppen zuweisen.
- **App-Zuordnungsbestand:** im OPC-Admin prüfen, weil dafür keine dokumentierte lesende Schnittstelle verfügbar war.

Es wurden keine Preise, Compare-at-Preise, SKUs, Titel, Beschreibungen, Produktoptionen, Collections oder Theme-Dateien verändert.
