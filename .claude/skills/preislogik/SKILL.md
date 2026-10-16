---
name: preislogik
description: Preisregeln des Inhabers - Produktaktionen und Rabatt bei Teppichboden (Meterware und Raummass), Streich- und Vergleichspreise, gekettelte Fussleiste (Preisstufen), Paketprodukte mit €/m²-Darstellung und Paketpreis, ausgeblendeter Preisfilter bei Vinylboden. Verwenden vor jeder Aenderung an Variantenpreisen, Vergleichspreisen, Rabatten oder Aktionen, bei Preisanzeigen im Theme (Karten, Produktseite, Warenkorb), bei Produkttexten mit Rabattangaben und beim Import von Paketware.
---

# Preislogik

Ausgelagert aus `AGENTS.md` (2026-10-16, ohne inhaltliche Aenderung). Preise
verändern steht weiter auf der Liste „NIEMALS ohne ausdrückliche Freigabe“ in
`AGENTS.md`.

## Teppichboden: Aktionen und Streichpreise

Bei Teppichboden mit Meterware (Rollenbreiten) und Raummaß (Wunschmaß-Variante)
gilt für jede Farbe und Breite dieselbe Produktaktion mit demselben
Rabattprozentsatz. Der normale Raummaß-Aufschlag bleibt im regulären Preis;
der Rabatt wird anschließend auf beide Zuschnittarten gleichermaßen angewandt.
Raummaß allein ist keine Aktion. Streichpreise und Rabattkennzeichen dürfen
nur bei einer tatsächlich aktiven Produktaktion erscheinen, wenn beide
Zuschnittarten reduziert sind und die Vergleichspreise belegte Vorpreise sind.
Rundung auf Cent darf zu kleinen rechnerischen Prozentabweichungen führen.
Vor einer Änderung der Shopify-Variantenpreise oder Vergleichspreise ist eine
konkrete Produkttabelle zu prüfen und die ausdrückliche Freigabe des Inhabers
einzuholen. Produkttexte dürfen keinen abweichenden Rabatt versprechen.

## Gekettelte Fußleiste

Gekettelte Fußleiste: Meterpreis inklusive Material = Fertigung + Höhe ×
m²-Preis des Teppichbodens, als sieben Preisstufen je Höhe (bis 250 €/m²);
die Länge geht auf ganze Streifen quer zur Rolle, über 250 €/m² gibt es keine Leiste
→ `domains/shopify/fussleiste-preisstufen.md`.

## Paketprodukte

Bei Paketprodukten:

- €/m² ist die primäre Kundendarstellung.
- Der interne Shopify-Preis bleibt der Paketpreis.
- Den Paketpreis auf Collection-Karten normalerweise nicht prominent anzeigen.
- Die Produktdetailseite darf den Paketpreis sekundär zeigen.
- Warenkorb und Checkout müssen mit echten ganzen Paketen arbeiten.

## Preisfilter Vinylboden

Der Preisfilter bei Vinylboden ist bewusst ausgeblendet, solange Shopify nach Paketpreis statt sichtbarem €/m² filtert. Diese Logik nicht versehentlich zurückbauen.
