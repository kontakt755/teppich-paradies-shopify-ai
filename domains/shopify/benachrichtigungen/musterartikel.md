# Musterbestellungen: eigene Variante je Muster

## Das Problem, das das loest

Bis 2026-09-16 lagen **alle** Muster auf derselben Variante des Sammelprodukts
"Kostenloses Muster" (SKU `TP-MUSTER-000`). Welches Muster gemeint war, stand
nur in Line-Item-Properties. Folge: Lieferschein, Kommissionierliste, Rechnung,
Bestandsfuehrung und Retouren sahen dreimal "Kostenloses Muster" ohne Farbe.
Wer packt, konnte nicht erkennen, was in den Umschlag gehoert.

## Die Loesung (so machen es Haendler mit vielen Mustern)

Ein Muster ist ein **eigener Artikel**, keine Konfiguration. Deshalb hat jede
Qualitaet ein eigenes Musterprodukt mit einer Variante je Farbe:

| | |
|---|---|
| Handle | `muster-<Handle des Quellprodukts>` |
| Titel | `Muster <Produktname ohne Breitenangabe>` |
| Option | dieselbe wie im Quellprodukt: `Farbe` oder `Dekor` |
| Variante | eine je Farbe |
| SKU | `M-<SKU der Quellvariante>` — enthaelt die Lieferanten-Artikelnummer |
| Preis | 0,00 EUR |
| Bestand | nicht verfolgt, Versand erforderlich |
| Status | UNLISTED, im Onlineshop veroeffentlicht |

Damit steht die Farbe im `variant_title` und erscheint **ohne Sonderlogik** auf
Lieferschein, Kommissionierliste, in Bestellbestaetigung, interner Bestellmail
und im Admin.

UNLISTED heisst: ueber den direkten Link erreichbar (der Konfigurator laedt
`/products/muster-<handle>.js`), aber nicht in Suche, Kollektionen oder
Empfehlungen.

## Woher die Grosshaendler-ID kommt

Die SKU des Musters ist `M-` plus die Artikelnummer der Quellvariante. Die
interne Bestellmail schneidet das `M-` ab und zeigt die Nummer in der Spalte
Grosshaendler-ID. Ein eigenes Variantenmetafeld gibt es bewusst nicht — eine
Quelle statt zwei, die auseinanderlaufen koennen.

Nur wo die Quellvariante gar keine SKU hat, lautet die Muster-SKU
`M-<handle>-<farbe>`; dort steht in der Mail weiterhin, dass die ID am
Quellprodukt nachzusehen ist.

## Rueckfall

`assets/tp-sample-checkout.js` laedt das Musterprodukt der Qualitaet optional.
Fehlt es (neues Produkt, Musterprodukt noch nicht angelegt), oder fehlt dort
eine Farbe, landet dieses Muster wie frueher auf `kostenloses-muster` mit
Properties. Bestellbar bleibt es also immer — nur ohne eigene SKU.

Das Sammelprodukt `kostenloses-muster` bleibt deshalb bestehen und darf nicht
geloescht werden.

## Wenn eine Farbe dazukommt

Musterprodukt der Qualitaet um dieselbe Option/Variante ergaenzen, SKU nach dem
Schema oben. Ohne das faellt genau diese Farbe auf den Rueckfall zurueck.

## Was NICHT geaendert wurde

- Varianten-SKUs der Verkaufsprodukte (Vorgabe des Inhabers, PR #336)
- Preise, Versand, Checkout
- `MAX_SAMPLES` = 3; die Zaehlung erkennt Muster jetzt an `_Muster_ID` statt an
  einer festen Varianten-ID, wirkt also ueber alle Musterprodukte hinweg
