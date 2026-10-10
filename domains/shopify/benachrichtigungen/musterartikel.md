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

### Teppich nach Maß: Musterprodukt des Teppichbodens (ab 2026-10-10)

Ein Teppich nach Maß wird aus einem Teppichboden zugeschnitten
(`service.einfass_basis`); das physische Muster ist dasselbe. Deshalb gibt es
zwischen dem eigenen Musterprodukt und dem Sammelprodukt eine Zwischenstufe.
Reihenfolge je Musterbestellung auf `/pages/muster?produkt=<handle>`:

| Stufe | Wann | Warenkorbzeile |
|---|---|---|
| 1. `muster-<handle>` | Musterprodukt des Teppichs nach Maß existiert | wie bisher je Farbe: eigene Variante, fehlende Farbe → Stufe 3 |
| 2. `muster-<handle von service.einfass_basis>` | nur wenn es Stufe 1 **gar nicht** gibt, das Produkt `service.einfass_basis` traegt und dessen Musterprodukt existiert | Variante mit demselben Wert der Option `Farbe` (Gross-/Kleinschreibung egal, nur lieferbare Varianten); Titel und SKU des Teppichboden-Musters |
| 3. `kostenloses-muster` | alles Uebrige | Sammelprodukt mit Properties `Produkt` und `Farbe` |

Wie es technisch laeuft: `/products/<handle>.js` kennt keine Metafelder. Die
Section `sections/tp-muster-basis.liquid` (in keinem Template, nur ueber die
Section Rendering API) liefert unter `/products/<handle>?section_id=tp-muster-basis`
den Handle des Teppichbodens als JSON-Text. Abgerufen wird sie nur, wenn
Stufe 1 fehlt. Keine Antwort, kein Feld, ein ungueltiger Handle oder ein
fehlendes Teppichboden-Muster: Stufe 3, wie bisher. Die Muster-Kennung
(`_Muster_ID`, `_Quellprodukt`) bleibt immer die des Teppichs nach Maß – die
Zaehlung (hoechstens 3 Muster) aendert sich dadurch nicht.

Folge fuer die Pflege: Ein Teppich nach Maß braucht kein eigenes
Musterprodukt, wenn der Teppichboden eins hat und die Farben gleich heissen
(Regel des Inhabers: Teppichboden und Maßteppich fuehren dieselben
Farbnamen). Legt man doch ein `muster-<handle>` an, gilt allein dieses
(Stufe 1), auch fuer Farben, die dort fehlen.

Code: `assets/tp-sample-checkout-core.js` (`basisSectionUrl`,
`parseBasisHandle`, `assignSampleVariantsWithBasis`), Aufruf in
`assets/tp-sample-checkout.js` (`ladeBasisMuster`). Tests:
`qa/tests/muster-basis-rueckfall.test.mjs`.

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
