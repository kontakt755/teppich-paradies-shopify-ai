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

## Versandprofil - der Schritt, den man vergisst

Musterbestellungen sind versandkostenfrei, und das haengt **nicht** am Preis 0,00
EUR, sondern am Versandprofil **"Kostenlose Muster"** (Zone Deutschland, Methode
"Kostenloser Musterversand", 0,00 EUR). Bis 2026-09-16 lag darin nur das
Sammelprodukt `kostenloses-muster`.

**Jedes neue Musterprodukt muss in dieses Profil**, sonst faellt es ins
allgemeine Profil und der Kunde zahlt bei einer reinen Musterbestellung
ploetzlich Versand. Das ist beim Anlegen der 87 Musterprodukte beinahe
passiert und wurde nachgezogen: das Profil enthaelt jetzt 88 Produkte.

**Nur Deutschland, und das ist Absicht.** Das Profil hat genau eine Zone
(Deutschland, 0,00 EUR). Der Inhaber hat am 2026-09-16 bestaetigt: Muster und
Produkte gehen ausschliesslich nach Deutschland. Wer aus dem Ausland
ausschliesslich Muster bestellt, bekommt deshalb keine Versandart angeboten -
gewollt, keine Fehlkonfiguration. Wer die Zone spaeter erweitert, verschickt
Muster gratis ins Ausland; das ist eine Preisentscheidung, keine technische.

Nachtragen ueber die Admin API:

```graphql
mutation { deliveryProfileUpdate(
  id: "gid://shopify/DeliveryProfile/<Profil-ID>",
  profile: { variantsToAssociate: ["gid://shopify/ProductVariant/<id>", ...] }
) { profile { id } userErrors { field message } } }
```

Die Profil-ID nie aus dieser Datei abschreiben, sondern frisch abfragen:
`query { deliveryProfiles(first: 10) { nodes { id name } } }`.

Gegenprobe ist `deliveryProfile.profileItems`, **nicht**
`productVariantsCount` - das Feld deckelt bei 500 und sieht dadurch auch dann
richtig aus, wenn Varianten fehlen.

## Wenn eine Farbe dazukommt

Musterprodukt der Qualitaet um dieselbe Option/Variante ergaenzen, SKU nach dem
Schema oben, **und die neue Variante dem Versandprofil zuordnen**. Ohne das
Erste faellt die Farbe auf den Rueckfall zurueck, ohne das Zweite kostet sie
Versand.

## Was NICHT geaendert wurde

- Varianten-SKUs der Verkaufsprodukte (Vorgabe des Inhabers, PR #336)
- Preise, Versand, Checkout
- `MAX_SAMPLES` = 3; die Zaehlung erkennt Muster jetzt an `_Muster_ID` statt an
  einer festen Varianten-ID, wirkt also ueber alle Musterprodukte hinweg
