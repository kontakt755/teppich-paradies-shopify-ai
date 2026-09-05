---
name: "teppichparadies-color-recognition"
description: "Analyze floor material color photos and auto-generate human-friendly color names (e.g. 'Beige Warm', 'Anthrazit') with color codes. Use this when importing products from jordanshop.de with generic color codes (4276, 4289, etc.) — instead of keeping 'Farbe 4276', recognize the actual color and assign a descriptive name. Store color code in custom.color_code metafield and upload photo to product variant. Automatically runs during product creation from jordanshop.de or retroactively for existing products with numbered colors."
---

# TeppichParadies Color Recognition

Analyze floor material (Linoleum, Vinyl, Carpet) product images and generate human-friendly color names paired with supplier color codes.

## When to use this skill

- **New product import from jordanshop.de** with color photos: Extract actual color name from image instead of keeping generic "Farbe XXXX" labels
- **Bulk color naming** for existing products with numbered colors: Retroactively add descriptive color names
- **Color code tracking**: Store supplier color code (4276, 4289, etc.) in Shopify metafield for reference
- **Image upload**: Attach product photo to the specific color variant

## Workflow

### Input

Provide per color:
```json
{
  "colorCode": "4276",
  "imageUrl": "https://media.jordanshop.de/original/...",
  "productId": "gid://shopify/Product/...",
  "variantSku": "PVCJOKANEO_4276"
}
```

### Step 1: Analyze image & generate color name

Call Claude's vision to analyze the photo:
- Extract dominant color(s)
- Determine warmth (Warm/Neutral/Cool)
- Generate **human-friendly name** (2-3 words max): `"{Color} {Warmth}"` or single strong names
- Examples:
  - Beige Warm (cream/sandy beige)
  - Grau Dunkel (dark gray, charcoal)
  - Anthrazit (deep charcoal)
  - Creme (light cream)
  - Grau Hell (light gray)
  - Braun Warm (warm brown/cognac)

**Rules for naming:**
- NO generic terms: avoid "Farbe 4276", "Color X"
- NO overly trendy names: avoid "Millennial Pink", "Sage Dream"
- German product terms preferred but English OK if clearer (e.g. "Grau" not "Gray")
- 2-3 syllables max per word (easy to pronounce, remember)
- Avoid duplicating existing product color names in store

### Step 2: Store color code

Create/update Shopify metafield on variant:
```graphql
mutation SetColorCode($input: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $input) {
    metafields { id namespace key value }
    userErrors { field message }
  }
}
```

> Der Typ heisst `MetafieldsSetInput`, nicht `MetafieldInput`. Mit dem falschen
> Namen bricht die Mutation mit „Type mismatch on variable $input" ab, bevor
> irgendetwas geschrieben wird. Maximal 25 Eintraege je Aufruf.

Input structure:
```json
{
  "ownerId": "gid://shopify/ProductVariant/{variantId}",
  "namespace": "custom",
  "key": "color_code",
  "value": "4276",
  "type": "single_line_text_field"
}
```

**Output**: `metafieldId: "gid://shopify/Metafield/..."`

### Step 3: Upload image to variant

Zwei Aufrufe. **Kein `stagedUploadsCreate`** — solange die Quell-URL oeffentlich
erreichbar ist, holt Shopify das Bild selbst.

```graphql
# 3a — Bild am Produkt anlegen (mehrere je Aufruf moeglich)
mutation CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
  productCreateMedia(productId: $productId, media: $media) {
    media { ... on MediaImage { id status } }
    mediaUserErrors { field message }
  }
}
# media: [{ originalSource: "https://…", alt: "…", mediaContentType: IMAGE }]

# 3b — zurueckgegebene MediaImage-ID an die Variante haengen
mutation AppendMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
  productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
    productVariants { id title }
    userErrors { field message }
  }
}
# variantMedia: [{ variantId: "gid://…", mediaIds: ["gid://shopify/MediaImage/…"] }]
```

> `productVariantAppendMedia` nimmt `productId` + `variantMedia`, **nicht**
> `variantId` + `media`. Die falsche Signatur war der Grund, warum frueher
> „Image upload blockiert" notiert wurde — es lag nie am Netz.
>
> `status: "UPLOADED"` heisst: angenommen, Verarbeitung laeuft noch. Das ist
> kein Fehler; das Anhaengen an die Variante funktioniert trotzdem sofort.

### Output format

Return for each color:
```json
{
  "colorCode": "4276",
  "colorName": "Beige Warm",
  "metafieldId": "gid://shopify/Metafield/...",
  "imageMediaId": "gid://shopify/MediaImage/...",
  "status": "success"
}
```

**If errors** (bad image, no dominant color detected):
```json
{
  "colorCode": "4276",
  "status": "error",
  "reason": "Image too blurry / no clear color detected",
  "fallback": "Color 4276"  // Keep original name if recognition fails
}
```

## Important constraints

### Farbcodes stammen aus der Quelle — niemals aus einer Zaehlung

Der Farbcode ist eine Lieferantenkennung. Er wird **abgeschrieben**, nie
fortgesetzt, geraten oder interpoliert. Vor dem Anlegen der Varianten die
vollstaendige Codeliste beim Lieferanten holen und die Anzahl abgleichen.

Woran man den Fehler erkennt: eine lueckenlos aufsteigende Folge
(4290, 4291, 4292, …). Echte Lieferantenlisten haben Luecken, weil sie
gewachsen sind — PVCJOKANEO etwa springt 4153 → 4200 → 4215 → 4217.

> Warum das hier steht: Am 2026-09-04 fuehrte das Shopify-Produkt
> „Elastium Linoleumboden 200cm" 24 Farbvarianten, von denen **21 erfunden**
> waren. Uebernommen worden waren nur die ersten beiden echten Codes (4276,
> 4289); ab 4290 wurde durchgezaehlt. Das Produkt stand mit diesen Daten
> bereits live in drei Verkaufskanaelen. Aufgefallen ist es erst, als die
> Bild-URLs geholt wurden — fuer 21 Codes existierte beim Lieferanten
> schlicht nichts. Die Anzahl stimmte, der Inhalt nicht: **24 = 24 ist keine
> Pruefung.** Verglichen werden muessen die Codes selbst.

### Bild-URLs aus der Jordan-Suche holen

Die Trefferbilder stehen nicht im ausgelieferten HTML — `curl` liefert 200 und
175 KB, darin aber nur drei `<img>`-Tags. Die Produktbilder haengt erst
clientseitiges JavaScript ein, also braucht das Einsammeln einen echten
Browser. Fertiges Snippet: `node scripts/jordan-media-scrape.mjs snippet <SKU>`.

Drei Fallen dabei:

| Falle | Wirkung | Richtig |
|---|---|---|
| `/search` statt `/de-DE/search` | wortlose Umleitung auf die Startseite | Sprachpraefix mitgeben |
| URL aus dem Farbcode bauen | durchgaengig 404 | Bilddateien tragen interne IDs (`1127838-8FXC-prod.JPG`); der Farbcode steht nur im `alt`-Text |
| CDN-URL direkt verwenden | skaliertes WebP statt Original | letztes Pfadsegment der `images.intellishop.cloud`-URL ist base64-kodiert und enthaelt die Original-URL |

- **Avoid duplicates**: Check existing Shopify product colors before generating new name (query first 50 products with art:linoleumboden tag)
- **Consistency**: For same product line at different widths, use same color name across all variants
- **Metafield MUST use custom.color_code** (not custom.colorCode or global.*)
- **No image upload if variant already has media** — skip step 3, just return metafield
- **Kein Produkt geht mit `DENY` und Bestand 0 live.** Beides zusammen heisst
  „ausverkauft", und der Import erzeugt genau diese Kombination: Shopify legt
  neue Varianten mit `inventoryPolicy: DENY` und Menge 0 an. Am 2026-09-05
  standen Elastium und Fortiva so live — sichtbar, aber unverkäuflich.

  Der richtige Hebel ist die **Policy, nicht eine erfundene Menge**:

  ```graphql
  productVariantsBulkUpdate(productId: …, variants: [{ id: …, inventoryPolicy: CONTINUE }])
  ```

  Warum nicht einfach eine Menge eintragen: Rollenware liegt nicht im Lager,
  sie wird bei Jordan bestellt. Eine ausgedachte Zahl ist eine Behauptung mit
  Verfallsdatum — nach ein paar Bestellungen steht das Produkt wieder auf
  ausverkauft. `CONTINUE` gilt dauerhaft. Echte Mengen setzt der Betreiber
  dort, wo er sie tatsächlich führt.
- **Rollenware-Produkte brauchen eine zweite Option `Breite`.** Der Universal-Rollenware-Rechner (Option Calculator) liest die Optionen, nicht die Titel. Ohne die Option bleibt er stumm.
  - Linoleum: immer nur `200cm`. Nadelvlies: je Produkt verschieden, oft `200cm`, manchmal zusätzlich `400cm`.
  - Betroffen und noch offen: Elastium Linoleumboden, Fortiva Nadelvlies (Stand 2026-09-05).

### Eine Option zu einem bestehenden Produkt hinzufuegen

`productUpdate` kann das nicht — dafuer gibt es eine eigene Mutation. Wer nur
`productUpdate` probiert, kommt faelschlich zu dem Schluss, Optionen gingen nur
ueber die Admin-Oberflaeche.

```graphql
mutation ($productId: ID!, $options: [OptionCreateInput!]!) {
  productOptionsCreate(
    productId: $productId
    options: $options
    variantStrategy: LEAVE_AS_IS
  ) {
    product { id options { name optionValues { name } } }
    userErrors { field message code }
  }
}
# options: [{ name: "Breite", values: [{ name: "200cm" }] }]
```

`variantStrategy` entscheidet ueber die Menge der Arbeit:

| Strategie | Wirkung |
|---|---|
| `LEAVE_AS_IS` | Bestehende Varianten bekommen den **ersten** Wert der neuen Option. Keine neuen Varianten. |
| `CREATE` | Zusaetzlich jede Kombination aus bestehenden und neuen Werten. |

Bei genau einer Breite ist `LEAVE_AS_IS` richtig: Ein Aufruf je Produkt, und alle
vorhandenen Farbvarianten tragen die Breite. Erst wenn ein Produkt mehrere
Breiten hat (Nadelvlies mit 200 und 400), kommt `CREATE` oder ein
anschliessendes `productVariantsBulkCreate` in Frage.

> Warum das hier steht: Am 2026-09-05 hat ein Subagent 31 Aufrufe darauf
> verwendet, die Option ueber `productUpdate` zu setzen, und daraus geschlossen,
> es gehe nur von Hand. Danach gingen weitere acht Runden fuer Browser-Auswahl
> und Login drauf. Der Befund war falsch, und der geplante Umweg — 32 neue
> Varianten mit kopierten Preisen — waere selbst dann unnoetig gewesen:
> `LEAVE_AS_IS` erledigt beide Produkte in zwei Aufrufen.

## Examples

| Input Code | Detected Color | Generated Name | Metafield | Status |
|---|---|---|---|---|
| 4276 | Light beige, warm tone | Beige Warm | custom.color_code: "4276" | ✓ |
| 4289 | Dark gray, neutral | Grau Dunkel | custom.color_code: "4289" | ✓ |
| 4290 | Cream, very light | Creme | custom.color_code: "4290" | ✓ |

## Edge cases

- **Black/very dark**: Name as "Schwarz" or "Anthrazit" depending on richness
- **Brown spectrum**: Distinguish "Braun Warm", "Braun Hell", "Braun Dunkel"
- **Gray tones**: Use "Grau Hell" (light), "Grau Mittel" (medium), "Grau Dunkel" (dark)
- **Multiple tones in image**: Name after dominant color, note secondary in comment if needed

## Vor der Fertigmeldung

Bevor ein Produkt als "alle Farben benannt" markiert wird:

1. **Alle Varianten durchgehen**: `graphql_query` mit `product(id: "...")` auf alle Varianten checken
   - Sind alle Titel im Format `{Farbe} / {Breite}`?
   - Oder noch alte generische Titel wie `Farbe 4276`?
2. **Metafelder-Vollständigkeit**: Auf jedem Variant `custom.color_name` + `custom.supplier_color_code`?
3. **Duplikat-Check**: Gibt es zwei Varianten mit identischem `color_name`?
   - Wenn ja: Farbnamen nochmal prüfen (Vision kann sich täuschen)
4. **Reihenfolge**: Die Codes in der Referenztabelle (z. B. oben) sollten alle Varianten abdecken

**Fehler vermeiden:** Nicht annehmen, dass „live gestellt" = „komplett benannt" (2026-09-05: 2 von 21 Codes übersehen)

---

## Elastium Linoleumboden — Farbcode-Referenz

**Produkt:** Linoleum-Boden Jokaleum Neocare 2,5mm Elastic/Linoleum Bahnen 200cm  
**Lieferant:** Jordan (PVCJOKANEO)  
**Quelle:** jordanshop.de, erfasst 2026-09-04/05  
**Status:** 21 von 24 Codes haben Bilder bei Jordan; 3 fehlen

| Code | Bild | Farbe | Status |
|---|---|---|---|
| 4153 | ❌ | – | Keine Bild-URL bei Jordan |
| 4200 | ✅ | Grün Gelb | ✓ Shopify Media hochgeladen |
| 4215 | ✅ | Beige Grau Hell Meliert | ✓ |
| 4217 | ✅ | Orange Warm | ✓ |
| 4218 | ✅ | Rot Burgund | ✓ |
| 4222 | ✅ | Blau Grün | ✓ |
| 4223 | ✅ | Blau Grau Hell | ✓ |
| 4226 | ✅ | Blau Dunkel | ✓ |
| 4229 | ✅ | Türkis Dunkel | ✓ |
| 4232 | ✅ | Gelb Grün | ✓ |
| 4236 | ✅ | Grün Dunkel | ✓ |
| 4240 | ✅ | Beige Hell | ✓ |
| 4245 | ✅ | Creme | ✓ |
| 4252 | ✅ | Beige Grau Hell | ✓ |
| 4253 | ✅ | Grau Hell | ✓ |
| 4254 | ✅ | Grau Mittel | ✓ |
| 4255 | ✅ | Grau Hell Mittel | ✓ |
| 4259 | ❌ | – | Keine Bild-URL bei Jordan |
| 4270 | ✅ | Beige Warm | ✓ |
| 4272 | ✅ | Gelb Warm | ✓ |
| 4273 | ✅ | Beige Gelb | ✓ |
| 4276 | ✅ | Gelb Beige | ✓ |
| 4289 | ✅ | Braun Dunkel | ✓ |
| 4296 | ❌ | – | Keine Bild-URL bei Jordan |

**Status 2026-09-05:** Elastium und Fortiva vollständig aufgebaut.

**Elastium Linoleumboden (21 Varianten):**
- Codes: 4276, 4289, 4200, 4215, 4217, 4218, 4222, 4223, 4226, 4229, 4232, 4236, 4240, 4245, 4252, 4253, 4254, 4255, 4270, 4272, 4273
- Entfernte Codes: 4153, 4259, 4296 (keine Bilder bei Jordan)
- Titel: `Grün Gelb / 200cm`, `Beige Grau Hell Meliert / 200cm`, etc.
- Metafelder: `color_name`, `supplier_color_code`
- Policy: CONTINUE (verkäuflich)

**Fortiva Nadelvlies Teppichboden (13 Varianten):**
- Codes: 016, 021, 024, 044, 054, 056, 085, 088, 089, 120, 142, 180, 181
- Titel: `Schwarz / 200cm`, `Silbergrau / 200cm`, `Hellblau / 200cm`, etc.
- Metafelder: `color_name`, `supplier_color_code`
- Policy: CONTINUE (verkäuflich)

Beide Produkte laufen live und sind mit dem Universal-Rollenware-Rechner kompatibel.
