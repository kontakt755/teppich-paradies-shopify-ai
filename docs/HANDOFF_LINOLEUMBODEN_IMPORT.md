# Linoleumboden-Import — Best Practice Handoff

**Status:** Getestet & funktioniert (2026-09-07, Session 1)  
**Quelle:** Elastium Neocare erfolgreich importiert mit 21 Farben, 19 Bilder, Metafelder

---

## ✅ Die richtige Abfolge

### 1. Produkt mit Varianten-Liste anlegen

**NICHT:** Produkt zuerst ohne Varianten, dann nachträglich hinzufügen.  
**SONDERN:** `productCreate` mit kompletter Varianten-Liste.

```graphql
mutation CreateProduct($input: ProductInput!) {
  productCreate(input: $input) {
    product { id variants { id sku title } }
  }
}
```

**Input-Struktur:**
```json
{
  "title": "Linoleumboden — Jokaleum Neocare 200cm",
  "productType": "Rollenware",
  "vendor": "JOKA",
  "handle": "linoleumboden-jokaleum-neocare",
  "options": [
    {
      "name": "Farbe",
      "values": ["4200", "4215", "4217", "4218", "4222", "4223", "4226", "4229", "4232", "4236", "4240", "4245", "4252", "4253", "4254", "4255", "4270", "4272", "4273", "4276", "4289"]
    }
  ],
  "variants": [
    {
      "title": "Grün Gelb / 200cm",
      "sku": "PVCJOKANEO_4200",
      "optionValues": [{ "optionName": "Farbe", "value": "4200" }]
    },
    {
      "title": "Beige Grau Hell Meliert / 200cm",
      "sku": "PVCJOKANEO_4215",
      "optionValues": [{ "optionName": "Farbe", "value": "4215" }]
    },
    {
      "title": "Orange Warm / 200cm",
      "sku": "PVCJOKANEO_4217",
      "optionValues": [{ "optionName": "Farbe", "value": "4217" }]
    }
    // ... weitere Varianten
  ]
}
```

### 2. Bilder hochladen & an Varianten hängen

```graphql
# 2a: Bilder am Produkt anlegen
mutation CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
  productCreateMedia(productId: $productId, media: $media) {
    media { ... on MediaImage { id status } }
  }
}

# Input: media array mit originalSource URLs
# Beispiel:
# "media": [
#   { "originalSource": "https://media.jordanshop.de/...", "alt": "Grün Gelb", "mediaContentType": "IMAGE" },
#   { "originalSource": "https://media.jordanshop.de/...", "alt": "Beige Grau", "mediaContentType": "IMAGE" }
# ]

# 2b: Bild an Variante hängen
mutation AppendMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
  productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
    productVariants { id title }
  }
}

# Input: variantMedia
# "variantMedia": [
#   { "variantId": "gid://shopify/ProductVariant/...", "mediaIds": ["gid://shopify/MediaImage/..."] },
#   { "variantId": "gid://shopify/ProductVariant/...", "mediaIds": ["gid://shopify/MediaImage/..."] }
# ]
```

### 3. Metafelder setzen (color_name + supplier_color_code)

```graphql
mutation SetMetafields($input: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $input) {
    metafields { id namespace key value }
  }
}
```

**Input: Alle Varianten durchlaufen**
```json
{
  "metafields": [
    {
      "ownerId": "gid://shopify/ProductVariant/60666926039374",
      "namespace": "custom",
      "key": "color_name",
      "value": "Grün Gelb",
      "type": "single_line_text_field"
    },
    {
      "ownerId": "gid://shopify/ProductVariant/60666926039374",
      "namespace": "custom",
      "key": "supplier_color_code",
      "value": "4200",
      "type": "single_line_text_field"
    }
    // ... weitere Varianten
  ]
}
```

---

## ⚠️ Was NICHT funktioniert

| Was | Problem | Symptom |
|---|---|---|
| `productVariantCreate` | Mutation existiert nicht in Admin API | "Unknown mutation" error |
| Varianten nachträglich per `productVariantsBulkUpdate` | Ändert nur SKU, nicht Option-Werte | Varianten-Struktur bleibt falsch |
| Produkt erst anlegen, dann Varianten | Doppelte Arbeit, Bilder-Zuordnung geht schief | Bilder hängen am falschen Ort, Metafelder fehlen |

---

## 🎯 Linoleumboden Spezifikationen

| Parameter | Wert | Anmerkung |
|---|---|---|
| **Option** | Nur "Farbe" | Alle 200cm (keine Breiten-Variante) |
| **SKU-Format** | `PVCJOKANEO_<code>` | z.B. 4200, 4215, 4289 |
| **Titel-Format** | `<Farbnname> / 200cm` | z.B. "Grün Gelb / 200cm" |
| **Metafeld: color_name** | Deutsche Farbbeschreibung | z.B. "Grün Gelb", "Beige Warm" |
| **Metafeld: supplier_color_code** | Lieferanten-Farbcode | z.B. "4200" |
| **Bild pro Farbe** | 1 MediaImage pro Variante | Via productVariantAppendMedia |
| **inventoryPolicy** | `CONTINUE` | Rollenware wird bei Jordan bestellt, nicht aus Lager |
| **Gewicht** | ~3,2 kg (speichern?) | Optional in metafields |
| **Stärke** | 2,5mm (speichern?) | Optional in metafields |

---

## 🔍 Farbcode-Validierung

**Niemals zählen!** Echte Lieferantenlisten haben Lücken.

```
❌ FALSCH: 4290, 4291, 4292, 4293, ... (lückenlos hochgezählt → erfunden)
✅ RICHTIG: 4200, 4215, 4217, 4218, 4222, ... (echte Codes mit Lücken)
```

**Prüfung vor Deploy:**
```bash
npm run farbcode:guard
```

Erkennt das Zählmuster automatisch.

---

## 📋 Elastium Neocare als Referenz

| Punkt | Status | Details |
|---|---|---|
| Produkt angelegt | ✅ | 21 Varianten (Farben 4200–4289) |
| Farbnamen gesetzt | ✅ | z.B. "Grün Gelb", "Beige Warm" |
| Bilder hochgeladen | ✅ | 19/21 (4153, 4259, 4296 fehlen bei Jordan) |
| Metafelder gesetzt | ✅ | color_name + supplier_color_code auf allen |
| Inventar CONTINUE | ✅ | Rollenware verkäuflich |

**Wenn du diesen Prozess wiederholst, kopiere diese Struktur — nicht neu erfinden!**

---

## 🚀 Nächste Produkte

Serien für Import:
1. Jokaleum Neocare (21 Farben) — ✅ Done
2. Jokalino (16 Farben) — Open
3. Jokaleum Color Neocare (10 Farben) — Open
4. Weitere Serien (je 4–6 Farben) — Open

**Gleiche Struktur für alle — nur Farbliste + Bilder unterscheiden sich.**
