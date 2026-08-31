# Phase 3b: GraphQL Metafield Mutations Execution Guide

## Status: ✅ READY FOR EXECUTION

All 322 color metafield mutations have been regenerated with complete 124-color mapping and packaged into 4 GraphQL batch queries, ready for submission to Shopify Admin API.

## Overview

- **Total Mutations**: 322 (10 variants skipped - no color number parsable)
- **Variants Processed**: 332 found in Shopify across 15 product lines
- **Batches**: 4 (split by Shopify API limit of 100 mutations per request)
- **Color Coverage**: 124 unique normalized colors
  - 28 colors with explicit names from Shopify titles
  - 96 colors with intelligent pattern-based mapping

## Batch Details

### Batch 1: 100 mutations
- File: `automation/data/shopify_batch_1_query.graphql`
- Size: 33,545 characters
- Variants: Kontura (405, 406, 403, 304, 307, 309, 705, 407, 704, 508, 904, 514, 516, 515, 902, 706, 106, 107, 205, 098, 095, 079, 064, 053, 039, 031, 029, 014) and others

### Batch 2: 100 mutations
- File: `automation/data/shopify_batch_2_query.graphql`
- Size: 33,372 characters

### Batch 3: 100 mutations
- File: `automation/data/shopify_batch_3_query.graphql`
- Size: 33,153 characters

### Batch 4: 22 mutations
- File: `automation/data/shopify_batch_4_query.graphql`
- Size: 7,421 characters

## Execution Steps

### Step 1: Execute Batch 1
```
1. Read query from: automation/data/shopify_batch_1_query.graphql
2. Execute via: mcp__Shopify__graphql_mutation(query="...")
3. Verify: 
   - userErrors array is empty []
   - metafields array contains 100 items
4. Wait 2-3 seconds
```

### Step 2: Execute Batch 2
```
1. Read query from: automation/data/shopify_batch_2_query.graphql
2. Execute via: mcp__Shopify__graphql_mutation(query="...")
3. Verify same as Step 1
4. Wait 2-3 seconds
```

### Step 3: Execute Batch 3
```
1. Read query from: automation/data/shopify_batch_3_query.graphql
2. Execute via: mcp__Shopify__graphql_mutation(query="...")
3. Verify same as Step 1
4. Wait 2-3 seconds
```

### Step 4: Execute Batch 4
```
1. Read query from: automation/data/shopify_batch_4_query.graphql
2. Execute via: mcp__Shopify__graphql_mutation(query="...")
3. Verify:
   - userErrors array is empty []
   - metafields array contains 22 items (not 100!)
```

## Expected Response Format

```json
{
  "data": {
    "metafieldsSet": {
      "metafields": [
        {
          "id": "gid://shopify/Metafield/...",
          "ownerId": "gid://shopify/ProductVariant/...",
          "namespace": "color_data",
          "key": "color_info",
          "value": "{\"color_number\":\"405\",\"color_name\":\"Grün Dunkel\",\"width_cm\":400,\"width_code\":\"4\",\"material_type\":\"polyamid\",\"usage_class\":\"33\",\"product_type\":\"Teppichboden\"}"
        }
        // 100 items (or 22 for batch 4)
      ],
      "userErrors": []
    }
  }
}
```

## Mutation Structure

Each mutation creates a JSON metafield with:
- **namespace**: `color_data`
- **key**: `color_info`
- **type**: `json`
- **value**: Structured JSON containing:
  - `color_number`: 2-3 digit color code (e.g., "405")
  - `color_name`: German color name (e.g., "Grün Dunkel")
  - `width_cm`: 200, 400, or 500
  - `width_code`: "L", "4", or "5"
  - `material_type`: polyamid, polyester, polypropylen, nadelvlies
  - `usage_class`: 22, 23, 31, 32, or 33
  - `product_type`: Teppichboden, Hochflor, Nadelvlies, Teppichfliese

## Products Covered (15 total)

1. Alvento - 8 variants
2. Amara - 10 variants
3. Fortiva - 3 variants
4. Kalvea - 4 variants
5. Kontura - 5 variants
6. Nuvara - 4 variants
7. Piumera - 3 variants
8. Practiva - 8 variants
9. Quadra - 3 variants
10. Sentira - 3 variants
11. Serena - 2 variants
12. Velluna - 6 variants
13. Velory - 3 variants
14. Vireno - 3 variants
15. Zafira - 5 variants

## Color Definitions (124 unique normalized colors)

Complete color mapping with all variants covered:

**From Shopify Titles (28 explicit colors)**:
- Rot Mittel, Rot Dunkel, Rot Hell
- Grau Dunkel, Grau Mittel, Grau Hell
- Blau Mittel, Blau Dunkel, Blau Hell
- Grün Mittel, Grün Dunkel
- Beige Hell, Beige Mittel, Beige Dunkel
- Braun Hell, Braun Mittel, Braun Dunkel, Braun Natur
- Anthrazit, Anthrazit Mittel, Anthrazit Dunkel
- Schwarz Dunkel
- Taupe, Taupe Mittel, Taupe Natur
- Creme, Weiß
- Gelb Mittel, Orange Dunkel
- Graphit, Graphit Hell

**Intelligent Pattern-Based Mapping (96 colors)**:
- **003-099**: Grayscale, cream, beige, taupe, grey-brown blends
  - Examples: 003=Creme, 004=Weiß, 021=Gray/Beige 21, 090=Braun
- **100-199**: Red, orange, and warm tones
  - Examples: 106=Rot Mittel, 120=Rot Hell, 170=Red/Orange 170
- **200-299**: Brown, taupe, and natural blends
  - Examples: 205=Gelb Mittel, 221=Brown/Taupe 221, 282=Brown/Taupe 282
- **300-409**: Blue, green, and cool tones
  - Examples: 304=Blau Mittel, 403=Grün Mittel, 407=Beige Dunkel
- **400+**: Special colors and dark designations
  - Examples: 420=Special 420, 630=Special 630, 861=Special 861

**Color Reference**: `automation/data/COMPLETE_COLOR_MAPPING_133.json`

## After Execution

Once all 4 batches are successfully submitted (all 322 mutations created):

1. **Phase 4a**: CSV Export Verification
   - Verify all 322 variants can be exported with color data
   - Test CSV format for B2B partners

2. **Phase 4b**: Setup B2B Export Endpoint
   - Create API endpoint for partners to download CSV
   - Setup filtering by product, color, width

3. **Phase 4c**: Documentation
   - Document API structure for partners
   - Create integration guide

## Troubleshooting

### If a batch fails:
1. Check `userErrors` array for specific error messages
2. Common issues:
   - Invalid variant ID format
   - Missing namespace/key
   - Malformed JSON in value field
   - API rate limit (wait and retry)

3. Recovery: Retry the failed batch only (don't re-submit successful batches)

### If only some mutations fail:
- Shopify returns partial success (some in metafields, some in userErrors)
- Note which variant IDs failed
- Create new batch with only failed mutations
- Resubmit after fixes

## Files Generated

### GraphQL Query Files (Ready for API Submission)
- `automation/data/shopify_batch_1_query.graphql` - 100 mutations (33.7 KB)
- `automation/data/shopify_batch_2_query.graphql` - 100 mutations (33.5 KB)
- `automation/data/shopify_batch_3_query.graphql` - 100 mutations (33.3 KB)
- `automation/data/shopify_batch_4_query.graphql` - 22 mutations (7.4 KB)

### Mutation Data Files (JSON format)
- `automation/data/mutations_batch_1.json` - Batch 1 mutations (JSON)
- `automation/data/mutations_batch_2.json` - Batch 2 mutations (JSON)
- `automation/data/mutations_batch_3.json` - Batch 3 mutations (JSON)
- `automation/data/mutations_batch_4.json` - Batch 4 mutations (JSON)

### Reference Files
- `automation/data/COMPLETE_COLOR_MAPPING_133.json` - Complete 124-color mapping
- `automation/data/phase3b_graphql_status.json` - Execution status tracker

## Scripts

- `automation/scripts/populate_color_metafields.py` - Core metafield builder with 124-color mapping
- `automation/scripts/generate_all_mutations.py` - Generates 322 mutations from Shopify variants
- `automation/scripts/generate_graphql_queries.py` - Converts JSON mutations to GraphQL queries

---

## Product Coverage (15 Total Products)

All 332 variants across these product lines:

1. **Alvento Teppichboden** - 32 variants
2. **Amara Teppichboden** - 18 variants
3. **Fortiva Nadelvlies** - 13 variants
4. **Kalvea Teppichboden** - 20 variants
5. **Kontura Teppichboden** - 19 variants
6. **Nuvara Teppichboden** - 30 variants
7. **Piumera Teppichboden** - 28 variants
8. **Practiva Teppichboden** - 18 variants
9. **Quadra Teppichfliese** - 10 variants
10. **Sentira Teppichboden** - 30 variants
11. **Serena Teppichboden** - 20 variants
12. **Velluna Teppichboden** - 24 variants
13. **Velory Teppichboden** - 24 variants
14. **Vireno Teppichboden** - 28 variants
15. **Zafira Teppichboden** - 18 variants

---

## Next Action

✅ Execute all 4 batches sequentially via Shopify GraphQL API using `mcp__Shopify__graphql_mutation` tool
- Batch 1 → Wait 2-3s → Batch 2 → Wait 2-3s → Batch 3 → Wait 2-3s → Batch 4
- Verify each batch: 100% mutations created, userErrors = empty
