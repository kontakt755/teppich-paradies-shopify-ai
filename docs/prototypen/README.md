# Prototypen

Entwuerfe, die **nicht ausgeliefert** werden. Sie liegen hier und nicht unter
`theme/`, damit sie ausserhalb jedes Ordners stehen, den Shopify als Theme
liest — und damit der Theme-Check sie nicht mitprueft.

## Warum nicht mehr unter `theme/`

`theme/` sah aus wie ein Theme, war aber keins: Shopify erwartet `templates/`,
`snippets/` und `assets/` direkt im Repository-Root. Der Ordner wurde deshalb
nie hochgeladen — `.shopifyignore` schloss ihn aus.

Der Theme-Check hat ihn trotzdem gescannt, und zwar auch dann, wenn
`.theme-check.yml` ihn ausdruecklich ignorierte. Ein Entwurf ohne jede Wirkung
auf den Shop konnte damit jeden Deploy im ganzen Projekt blockieren. Am
2026-09-26 ist das dreimal hintereinander passiert:

1. `LiquidHTMLSyntaxError` in `tp-product-schema.liquid` — der Push brach ab.
2. Nach dem Fix zwei `UnknownFilter`-Fehler, die der Parser vorher nie erreicht
   hatte.
3. Nach deren Fix zwei neue `OrphanedSnippet`-Warnungen, an denen Full QA
   scheiterte.

Deshalb der Umzug. Der Blocker verschwindet damit nicht, weil eine Pruefung
abgeschaltet wurde, sondern weil die Dateien dort liegen, wo sie hingehoeren.

## Inhalt

| Ordner | Herkunft | Stand |
|---|---|---|
| `sisal/` | Sisal-Kategorie (SHP-017) | Entwurf, nie ausgeliefert |
| `linoleum/` | Linoleum-Kategorieseite | Entwurf, nie ausgeliefert |
| `ki-sichtbarkeit/` | JSON-LD fuer Produkt und FAQ | **ueberholt** — das Theme liefert das laengst, siehe unten |

Frueherer Ort der Dateien:

```
theme/assets/sisal-category.css            -> sisal/sisal-category.css
theme/snippets/product-sisal-badge.liquid  -> sisal/product-sisal-badge.liquid
theme/snippets/product-sisal-care.liquid   -> sisal/product-sisal-care.liquid
theme/templates/collection-sisal.liquid    -> sisal/collection-sisal.liquid
theme/templates/collection-linoleumboden.liquid -> linoleum/collection-linoleumboden.liquid
theme/snippets/tp-faq-schema.liquid        -> ki-sichtbarkeit/tp-faq-schema.liquid
theme/snippets/tp-product-schema.liquid    -> ki-sichtbarkeit/tp-product-schema.liquid
```

## Wenn ein Entwurf live soll

Nicht den Ordner verschieben. Die Datei an ihren richtigen Platz im
Repository-Root kopieren (`snippets/`, `templates/`, `assets/`), dort
einbinden, und die ueblichen Guards laufen lassen:

```
npm run liquid:guard && npm run schema:guard && npm run template:guard
```

Ein Snippet, das niemand rendert, meldet der Theme-Check als
`OrphanedSnippet` — im Theme-Root ist das ein echter Befund, kein Fehlalarm.

## `ki-sichtbarkeit/` ist ueberholt — nicht einbinden

Diese beiden Entwuerfe nicht fertigstellen und nicht ins Theme holen. Das
ausgelieferte Theme macht dasselbe bereits, und zwar besser. Am 2026-09-26 am
Live-Shop nachgemessen (Aufgabe #613):

| Seite | Ausgeliefertes JSON-LD |
|---|---|
| Produktseite | `Product`, `ProductGroup`, `Offer`, `Brand`, `UnitPriceSpecification`, `PropertyValue`, `QuantitativeValue`, dazu Local-Business- und `BreadcrumbList`-Block |
| Startseite | `FAQPage`, `Question`, `Answer`, `WebSite`, `Service` |

Zustaendig dafuer sind, jeweils eingebunden und gerendert:

```
snippets/tp-product-structured-data.liquid  -> sections/product-information.liquid,
                                               featured-product.liquid, featured-product-information.liquid
snippets/tp-faq-structured-data.liquid      -> sections/tp-start-faq.liquid, tp-teppiche-faq.liquid
snippets/tp-ratgeber-structured-data.liquid -> sections/tp-ratgeber-beitrag.liquid
```

Die Entwuerfe hier koennen weniger — ihnen fehlen `UnitPriceSpecification` und
die Variantendetails — und sie tragen zwei Defekte, die erst beim Einbinden
wirken wuerden:

- Die Bildschleife laeuft ueber `product.featured_image` (ein einzelnes Bild)
  statt ueber `product.images`.
- Ohne verfuegbare Variante bleibt ein Komma vor der schliessenden Klammer
  stehen; das JSON-LD ist dann ungueltig.

Sie bleiben vorerst liegen, weil sie einer anderen Sitzung gehoeren. Wer sie
loeschen will, kann das ohne Verlust tun.
