# SHP-020: Vinylboden Material-Klassifizierungs-Remediation

**Status:** IMPLEMENTATION SPECIFICATION  
**Datum:** 2026-08-31  
**Task Type:** Data Standardization & Tagging  
**Depends On:** SHP-019 (Audit) ✅  
**Severity:** MEDIUM

---

## Executive Summary

Diese Spec definiert die Standardisierung der Vinylboden-Produktklassifizierung durch systematische Tag-Addition und Metafield-Population. Ziel: Data Quality Score von 79% → 95%.

**Umsetzungs-Objekte:**
1. **Material-Type Tags** hinzufügen (`material:lvt`, `material:spc`, `material:wpc`)
2. **Surface-Structure Tags** hinzufügen (`surface:wood-look`, `surface:stone-look`)
3. **Nutzungsklasse-Tags** hinzufügen (`residential-22`, `commercial-31`, etc.)
4. **Metafields** erstellen (product_attributes namespace)

---

## 1. Material-Type Tags (Priority: HIGH)

### 1.1 Tag-Schema

```
material:lvt      → Luxury Vinyl Tile (Fliesen-Format)
material:spc      → Stone Plastic Composite (Stein-basiert)
material:wpc      → Wood Plastic Composite (Holz-Kunststoff)
material:vinyl    → Generic Vinyl (Fallback)
```

### 1.2 Zuordnung — 12 Produkte

| Produkt | Handle | Material Tag | Status |
|---|---|---|---|
| Vinylux Premium | vinylux-premium | material:lvt | ➕ ADD |
| TerraLock Classic | terralock-classic | material:lvt | ➕ ADD |
| FlexiTile Deluxe | flexitile-deluxe | material:lvt | ➕ ADD |
| VinylaFloor Premium | vinylafloor-premium | material:lvt | ➕ ADD |
| ModernClick Plank | modernclick-plank | material:lvt | ➕ ADD |
| StoneCore Pro | stonecore-pro | material:spc | ➕ ADD |
| RockSolid Plus | rocksolid-plus | material:spc | ➕ ADD |
| UltraStone Plus | ultrastone-plus | material:spc | ➕ ADD |
| DuraCore Stone | duracore-stone | material:spc | ➕ ADD |
| WoodBlend Comfort | woodblend-comfort | material:wpc | ➕ ADD |
| NaturalWood Pro | naturalwood-pro | material:wpc | ➕ ADD |
| EcoWood Elite | ecowood-elite | material:wpc | ➕ ADD |

---

## 2. Surface-Structure Tags (Priority: HIGH)

### 2.1 Tag-Schema

```
surface:wood-look      → Holz-Optik (Eiche, Buche, etc.)
surface:stone-look     → Stein-Optik (Granit, Marmor, etc.)
surface:mixed          → Gemischte Struktur
```

### 2.2 Zuordnung

| Produkt | Surface Tag | Beschreibung |
|---|---|---|
| Vinylux Premium | surface:wood-look | Echtholz-Optik |
| TerraLock Classic | surface:stone-look | Stein-Struktur |
| FlexiTile Deluxe | surface:wood-look | Holz-Struktur |
| VinylaFloor Premium | surface:wood-look | Eiche-Look |
| ModernClick Plank | surface:wood-look | Holz-Planken |
| StoneCore Pro | surface:stone-look | Stein-Struktur |
| RockSolid Plus | surface:stone-look | Granit-Optik |
| UltraStone Plus | surface:stone-look | Marmor-Look |
| DuraCore Stone | surface:stone-look | Stein-Grau |
| WoodBlend Comfort | surface:wood-look | Holz-Struktur |
| NaturalWood Pro | surface:wood-look | Buche-Optik |
| EcoWood Elite | surface:wood-look | Wärmegedämmt-Holz |

---

## 3. Nutzungsklasse Tags (Priority: MEDIUM)

### 3.1 Tag-Schema

```
nutzungsklasse:21      → Wohnbereich (niedrig Verkehr)
nutzungsklasse:22      → Wohnbereich (normal Verkehr)
nutzungsklasse:23      → Wohnbereich (hoch Verkehr)
nutzungsklasse:31      → Gewerbe (niedrig Verkehr)
nutzungsklasse:32      → Gewerbe (normal Verkehr)
nutzungsklasse:33      → Gewerbe (hoch Verkehr)
```

### 3.2 Zuordnung (Logik basierend auf Material + Beschreibung)

| Produkt | Nutzungsklasse | Begründung |
|---|---|---|
| Vinylux Premium | nutzungsklasse:22 | LVT, Wohnbereich, normal |
| TerraLock Classic | nutzungsklasse:23 | LVT, robust, hoher Traffic möglich |
| FlexiTile Deluxe | nutzungsklasse:23 | LVT, Premium-Haltbarkeit |
| VinylaFloor Premium | nutzungsklasse:22 | LVT, Wohnzimmer/Küche |
| ModernClick Plank | nutzungsklasse:22 | LVT, Standard-Wohnbereich |
| StoneCore Pro | nutzungsklasse:31 | SPC, Gewerbe-geeignet |
| RockSolid Plus | nutzungsklasse:32 | SPC, höhere Haltbarkeit |
| UltraStone Plus | nutzungsklasse:32 | SPC, Marmor-Premium |
| DuraCore Stone | nutzungsklasse:32 | SPC, robust |
| WoodBlend Comfort | nutzungsklasse:22 | WPC, Wohnbereich mit Komfort |
| NaturalWood Pro | nutzungsklasse:23 | WPC, haltbar, höherer Traffic |
| EcoWood Elite | nutzungsklasse:23 | WPC, Premium-Qualität |

---

## 4. Metafields Creation (Priority: MEDIUM)

### 4.1 Metafield Namespace: `product_attributes`

**Definition:**

| Key | Type | Description | Example |
|---|---|---|---|
| `material_type` | Single Line Text | Material category | "lvt", "spc", "wpc" |
| `surface_structure` | Single Line Text | Surface look | "wood-look", "stone-look" |
| `nutzungsklasse` | Single Line Text | Usage class | "22", "31", "32" |
| `waterproof_rating` | Single Line Text | Water resistance | "high", "very-high" |
| `installation_type` | Single Line Text | Installation method | "click", "glue", "loose-lay" |

### 4.2 Befüllung

```
Metafield-Werte pro Produkt:

Vinylux Premium:
  material_type: "lvt"
  surface_structure: "wood-look"
  nutzungsklasse: "22"
  waterproof_rating: "high"
  installation_type: "click"

StoneCore Pro:
  material_type: "spc"
  surface_structure: "stone-look"
  nutzungsklasse: "31"
  waterproof_rating: "very-high"
  installation_type: "click"

EcoWood Elite:
  material_type: "wpc"
  surface_structure: "wood-look"
  nutzungsklasse: "23"
  waterproof_rating: "high"
  installation_type: "click"
  sustainability: "eco-material"  (Optional)
```

---

## 5. Implementation Steps

### Step 1: Create Metafield Definitions (Admin)
- [ ] Shopify Admin > Settings > Metafields
- [ ] Create namespace: `product_attributes`
- [ ] Add 5 fields (material_type, surface_structure, nutzungsklasse, waterproof_rating, installation_type)

### Step 2: Add Material-Type Tags (Bulk)
- [ ] 5× `material:lvt` tags → LVT products
- [ ] 4× `material:spc` tags → SPC products
- [ ] 3× `material:wpc` tags → WPC products

### Step 3: Add Surface-Structure Tags (Bulk)
- [ ] 6× `surface:wood-look` tags → Wood-appearance products
- [ ] 4× `surface:stone-look` tags → Stone-appearance products

### Step 4: Add Nutzungsklasse Tags (Bulk)
- [ ] Classify by usage class (residential-22, commercial-31, etc.)
- [ ] Bulk-update via Admin or API

### Step 5: Populate Metafields
- [ ] Metafield values fill in for each product
- [ ] material_type, surface_structure, nutzungsklasse required
- [ ] waterproof_rating, installation_type optional

### Step 6: QA Validation
- [ ] All 12 products have material-type tags
- [ ] Surface-structure tags 100% coverage
- [ ] Nutzungsklasse tags complete
- [ ] Metafields populated

---

## 6. GraphQL Mutations (Implementation)

### 6.1 Add Tags (Bulk Pattern)

```graphql
mutation {
  tagsAdd(input: {
    resourceId: "gid://shopify/Product/..."
    tags: ["material:lvt", "surface:wood-look", "nutzungsklasse:22"]
  }) {
    node {
      id
      tags
    }
    userErrors {
      field
      message
    }
  }
}
```

### 6.2 Update Metafields

```graphql
mutation {
  productUpdate(input: {
    id: "gid://shopify/Product/..."
    metafields: [
      {
        namespace: "product_attributes"
        key: "material_type"
        value: "lvt"
        type: "single_line_text"
      }
      {
        namespace: "product_attributes"
        key: "surface_structure"
        value: "wood-look"
        type: "single_line_text"
      }
      {
        namespace: "product_attributes"
        key: "nutzungsklasse"
        value: "22"
        type: "single_line_text"
      }
    ]
  }) {
    product {
      id
      metafields {
        id
        namespace
        key
        value
      }
    }
  }
}
```

---

## 7. Success Criteria

| Criterion | Target | Expected |
|---|---|---|
| Material-Type Tags | 100% coverage | 12/12 products |
| Surface-Structure Tags | 100% coverage | 12/12 products |
| Nutzungsklasse Tags | 100% coverage | 12/12 products |
| Metafields Created | 5 fields | All populated |
| Data Quality Score | 95% | From 79% |
| No Regressions | All existing data intact | 0 data loss |

---

## 8. Rollback Plan

**If issues occur:**

```bash
# Revert tags via Admin
Admin > Products > Edit > Tags (Remove added tags)

# Revert metafields via Admin
Admin > Settings > Metafields > Delete namespace (if no other products use it)
```

---

## 9. Timeline

- **Step 1:** Metafield creation (5 min)
- **Step 2–4:** Tag addition (30 min)
- **Step 5:** Metafield population (30 min)
- **Step 6:** QA validation (15 min)

**Total: ~1.5 hours**

---

**Specification Status:** READY FOR IMPLEMENTATION

