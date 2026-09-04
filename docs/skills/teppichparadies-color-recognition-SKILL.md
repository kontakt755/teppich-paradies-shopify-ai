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
mutation SetColorCode($input: MetafieldInput!) {
  metafieldsSet(metafields: [$input]) {
    metafields { id namespace key value }
  }
}
```

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

```graphql
mutation AppendMedia($variantId: ID!, $mediaId: ID!) {
  productVariantAppendMedia(variantId: $variantId, media: {mediaId: $mediaId}) {
    productVariant { id }
    userErrors { field message }
  }
}
```

Process:
1. Upload image via Shopify `stagedUpload` → get Media ID
2. Append to variant using Media ID

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

- **Avoid duplicates**: Check existing Shopify product colors before generating new name (query first 50 products with art:linoleumboden tag)
- **Consistency**: For same product line at different widths, use same color name across all variants
- **Metafield MUST use custom.color_code** (not custom.colorCode or global.*)
- **No image upload if variant already has media** — skip step 3, just return metafield

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
