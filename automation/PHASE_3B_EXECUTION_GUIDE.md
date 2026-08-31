# Phase 3b: GraphQL Metafield Mutations Execution Guide

## Status: READY FOR EXECUTION

All 322 color metafield mutations have been generated and packaged into 4 GraphQL batch queries, ready for submission to Shopify Admin API.

## Overview

- **Total Mutations**: 322 (10 variants skipped - no color number parsable)
- **Variants Processed**: 332 found in Shopify
- **Batches**: 4 (split by Shopify API limit of 100 mutations per request)
- **Color Data Defined**: 123 unique color numbers with intelligent mapping

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

## Color Definitions (123 colors)

All colors intelligently mapped based on:
- Shopify title analysis (29 colors with explicit names)
- Pattern-based logic (94 colors mapped by number ranges):
  - 003-099: Grayscale, cream, beige tones
  - 100-199: Red and orange tones
  - 200-299: Brown and natural tones
  - 300-409: Blue and green tones
  - 400+: Special and dark tones

Color mapping file: `automation/data/all_color_definitions.json`

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

- `automation/data/shopify_batch_1_query.graphql` - Batch 1 GraphQL query
- `automation/data/shopify_batch_2_query.graphql` - Batch 2 GraphQL query
- `automation/data/shopify_batch_3_query.graphql` - Batch 3 GraphQL query
- `automation/data/shopify_batch_4_query.graphql` - Batch 4 GraphQL query
- `automation/data/mutations_batch_1.json` - Batch 1 mutations (JSON)
- `automation/data/mutations_batch_2.json` - Batch 2 mutations (JSON)
- `automation/data/mutations_batch_3.json` - Batch 3 mutations (JSON)
- `automation/data/mutations_batch_4.json` - Batch 4 mutations (JSON)
- `automation/data/all_color_definitions.json` - Color mapping reference
- `automation/data/execution_plan_phase3b.json` - Execution checklist

## Scripts

- `automation/scripts/generate_all_mutations.py` - Generated all 322 mutations
- `automation/scripts/execute_shopify_mutations.py` - Converted to GraphQL queries
- `automation/scripts/submit_all_batches.py` - Execution checklist generator

---

**Next Action**: Execute all 4 batches via Shopify GraphQL API using `mcp__Shopify__graphql_mutation` tool
