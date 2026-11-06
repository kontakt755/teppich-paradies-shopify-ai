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

## Tag `ohne-rabatt`

Produkte mit diesem Tag bekommen weder Marketingcode noch Aktionsrabatt (Freigabe
2026-11-05): Die Kollektion `intern-regulaerer-preis` schliesst den Tag aus, die Wellen in
`domains/shopify/aktionskalender.json` nehmen ihn aus (`ausnahmen_alle`, Ablauf in
`domains/shopify/aktionssystem-konzept.md`). Der Tag schuetzt nur dort: Eine Aktion auf
einer Kategorie mit solchen Produkten braucht eine eigene Zielkollektion.

## Restrollen: UVP mit Abstand

Restrollen (Tag `sonderposten`, Typ Teppichboden) zeigen ihre UVP wie alle anderen über `preis.vergleich_ist_uvp`, zusätzlich mit dem Abstand als roter Pille „−40 % ggü. UVP“, abgerundet: auf der Karte im Bild, auf der Produktseite in der UVP-Zeile (Inhaber 2026-11-06, vorher grau). Der Bezug „UVP“ bleibt immer dabei – „Rabatt“ oder „reduziert“ hieße, wir hätten die Rolle vorher teurer verkauft. Die Kartenplakette heißt bei Rollenware „Restrolle“. Sie bekommen kein `aktion.klasse`, weil sie nie zum Vergleichspreis verkauft wurden. Die UVP gilt nur für die Meterware: Beim Wechsel auf Raummaß blendet der Rechner die Zeile aus, Kettelteppiche und Raummaß-Produkte haben keine.

Restrollen stehen wie normaler Teppichboden im Kanal Google & YouTube, mit Grundpreis 1 m² an der Variante (Inhaber 2026-11-03). Karten zeigen die Restmenge aus dem Bestand („Noch 80 m²“, `blocks/tp-card-aktion`), die Startseite ein eigenes Band (`start_restrollen`). Normale Teppichböden mit echtem Hersteller verweisen auf dessen Restrollen (`blocks/tp-aktion-hinweis`), beim Hausnamen TeppichParadies erscheint nichts.

Neue Restrolle: `npm run -s restrolle:plan` erzeugt aus Name, Maßen, Preis, UVP mit Beleg und Foto den Plan für alle vier Produkte samt Ablaufliste; Bestand und Längen folgen der gemessenen Länge. Die Anlage läuft danach über den Shopify-MCP.

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

## Preisfilter Teppichboden (Preis je m²)

Shopifys Preisfilter rechnet ueber alle Variantenpreise; bei Teppichboden ist die
Wunschmass-Variante je m² teurer als die Meterware, die Karte zeigt aber den
Meterpreis - der Standardfilter zog Karten in falsche Bereiche (w-189, Rundgang
28.10.2026). Deshalb ist er in allen Teppichboden-Kollektionen ausgeblendet
(`snippets/tp-preisfilter-versteckt.liquid`), und Search & Discovery filtert
stattdessen „Preis je m²“ ueber das Produkt-Metafeld `custom.meterpreis_bereich`
(feste Bereiche: unter 30, 30 bis 40, 40 bis 60, 60 bis 80, 80 bis 100,
100 bis 150, ab 150 €/m²; untere Grenze inklusive). Der Wert folgt dem aktuellen
Verkaufspreis inklusive Aktion - **nach jeder Preisaenderung**
`npm run -s preisfilter:abgleich -- --schreiben` laufen lassen (stuendlich macht
das auch der Dienst `net.teppich-paradies.preisfilter`). Das Feld nie von Hand
pflegen; Bereiche aendern nur im Skript `scripts/preisfilter-abgleich.mjs`
(danach Abgleich und Sortierung des Filters in Search & Discovery pruefen).

## Preisklassen Teppichboden

Unter dem Kopf jeder Teppichboden-Kategorie stehen fuenf Kacheln (Inhaber
2026-11-04): Preiswert bis 40, Komfort 40 bis 60, Gehoben 60 bis 80, Premium
80 bis 100, Exklusiv ab 100 €/m². Sie sind keine eigenen Daten, sondern
buendeln die Bereiche von `custom.meterpreis_bereich` (Filter „Preis je m²“)
und setzen sie beim Klick als Filter. Zuordnung nur in
`snippets/tp-preisklassen-def.liquid`; aendern sich die Bereiche im Skript,
dort mitziehen (`qa/tests/tp-preisklassen.test.mjs` prueft das).
