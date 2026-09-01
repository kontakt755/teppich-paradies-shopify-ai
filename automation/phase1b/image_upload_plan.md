# Phase 1 B – Bild für Nadelylies Kategorie

## Generiertes Bild
- **Job ID:** 5e6ea630-ecf2-4ad9-8bed-a0e71d44505e
- **Model:** marketing_studio_image
- **Aspect Ratio:** 16:9 (1920x1080)
- **Status:** Generating...

## Shopify Upload Plan

### 1. Download generiertes Bild
```bash
# Bild wird als JPEG gespeichert
# Format: nadelylies-category-hero.jpg
# Größe: Optimiert für Web (1920x1080, ~150-200KB)
```

### 2. Shopify Image Upload
**Collection:** Teppichboden > Nadelylies & Objekt  
**Usage:** Collection Hero Image  
**Alt Text (SEO):** "Modernes Wohnzimmer mit Nadelylies Teppichboden - Premium Comfort für alle Wohnräume"

### 3. GraphQL Mutation (Shopify)
```graphql
mutation UpdateCollectionImage {
  collectionUpdate(input: {
    id: "gid://shopify/Collection/..."
    image: {
      src: "https://cdn.shopify.com/s/files/1/..."
      alt: "Modernes Wohnzimmer mit Nadelylies Teppichboden"
    }
  }) {
    collection {
      id
      title
      image {
        url
        alt
      }
    }
  }
}
```

## Alt-Text Strategie

**Format:** `[Produkt] Teppichboden - [Benefit/Setting]`

- ✅ Nadelylies & Objekt: "Modernes Wohnzimmer mit Nadelylies Teppichboden"
- ✅ Andere Kategorien: `[Kategorie] Teppichboden - [Szenario]`

## Next Steps

1. ✓ Bild generieren (in Bearbeitung)
2. ⏳ Bild herunterladen
3. ⏳ Zu Shopify hochladen
4. ⏳ Collection aktualisieren
5. ⏳ Mobile/Desktop testen
