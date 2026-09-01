# Phase 3b Execution - Ready to Deploy

**Status**: ✅ READY FOR EXECUTION  
**Date**: 2026-09-01  
**Variant Count**: 37 variants (from 2 products: Kontura, Amara)

## Mutation Batches Generated

### Batch 1 (25 mutations)
- **File**: `automation/data/mutations_batch_1_regenerated.json`
- **Variants**: 25 product variants
- **GraphQL**: `metafieldsSet` with `MetafieldsSetInput` type
- **Namespace**: `color_data`
- **Key**: `color_info`
- **Type**: `json`

### Batch 2 (12 mutations)
- **File**: `automation/data/mutations_batch_2_regenerated.json`
- **Variants**: 12 product variants
- **Same structure as Batch 1**

## Execution Steps

### Step 1: Execute Batch 1
```bash
# Use mcp__Shopify__graphql_mutation with the query and variables below
Query: metafieldsSet mutation (see below)
Variables: Load from mutations_batch_1_regenerated.json → metafields array
```

**GraphQL Query**:
```graphql
mutation SetColorMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      id
      namespace
      key
      value
      type
      ownerType
    }
    userErrors {
      field
      message
      code
    }
  }
}
```

**Expected Result**:
- ✅ All 25 metafields created
- ✅ No userErrors
- ✅ Response includes metafield IDs

### Step 2: Execute Batch 2
- Same as Batch 1, but with mutations_batch_2_regenerated.json

### Step 3: Verify in Shopify Admin
1. Go to Products → Kontura Teppichboden 400cm
2. Select a variant (e.g., "Grün Dunkel (405)")
3. Check Metafields section
4. Confirm `color_data` metafield is populated with JSON color data

## Next Actions After Execution

1. **Regenerate complete mutation set** for all 332 variants
   - Query all Teppichboden products
   - Create mutations for each variant
   - Split into batches of 25

2. **Export color data** to CSV for partners
   - Use `automation/api/shopify_admin_api.py` → `export_colors_csv()`

3. **Generate partner API keys** and distribute

4. **Deploy Partner REST API**
   - Validate with `/api/v1/colors` endpoint
   - Test with partner API key authentication

## Rate Limiting Notes

Shopify Admin API rate limit: 40 calls per minute  
Current mutations: 2 calls (37 metafields total)  
Each call should complete within rate limit window

## Files Reference

- **Mutations**: `automation/data/mutations_batch_*_regenerated.json`
- **Color Mapping**: `automation/data/COMPLETE_COLOR_MAPPING_133.json`
- **Admin API**: `automation/api/shopify_admin_api.py`
- **Partner API**: `automation/api/partner_rest_api.py`
- **Deployment Guide**: `automation/DEPLOYMENT_GUIDE.md`
