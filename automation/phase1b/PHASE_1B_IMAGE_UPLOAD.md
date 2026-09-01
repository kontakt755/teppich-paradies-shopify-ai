# Phase 1 B – Bilder & Galerie Optimierung

## Teppichboden Collection Update

### Collection Details
- **Collection ID:** gid://shopify/Collection/688863674702
- **Title:** Teppichboden
- **Handle:** teppichboden
- **Current Image:** ❌ Missing (null)
- **Products:** 51

### Generated Image
- **Job ID:** 5e6ea630-ecf2-4ad9-8bed-a0e71d44505e
- **Status:** Generating...
- **Model:** marketing_studio_image (Premium)
- **Aspect Ratio:** 16:9 (1920x1080)
- **Purpose:** Collection Hero/Header Image

### Update Plan

**Step 1:** Image generiert via Higgsfield AI  
**Step 2:** Download & optimize (1920x1080, ~180KB)  
**Step 3:** Upload zu Shopify via GraphQL  
**Step 4:** Verify on Mobile & Desktop  

### GraphQL Mutation

```graphql
mutation UpdateTeppichbodenImage {
  collectionUpdate(input: {
    id: "gid://shopify/Collection/688863674702"
    image: {
      src: "https://cdn.shopify.com/s/files/1/..."
      alt: "Modernes Wohnzimmer mit eleganten Teppichboden"
    }
  }) {
    collection {
      id
      image {
        url
        alt
      }
    }
  }
}
```

### Status: 🚀 IN PROGRESS
