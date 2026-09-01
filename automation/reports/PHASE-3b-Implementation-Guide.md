# Phase 3b: Bulk Metafield Population — Implementation Guide

**Status:** 🚀 READY FOR EXECUTION  
**Datum:** 2026-08-31  
**Router Validation:** ✅ PASSED (Class B, HANDOFF_IMPLEMENTER)  
**Scope:** All ~340 Teppichboden Variants  
**Method:** GraphQL Bulk Operations via Router

---

## 1. Pre-Implementation Summary

### What We Have Ready

✅ **Phase 1:** Complete audit of all 15 ACTIVE products + 340 variants
✅ **Phase 2:** Metafield Definition created (`color_data/color_info`)
✅ **Phase 2:** Pilot data successfully populated (Zafira)
✅ **Phase 3a:** Python script for mutation generation
✅ **Router Validation:** Task classified as Class B (STANDARD_IMPLEMENTATION)

### What Needs to Happen (Phase 3b)

1. **Generate Mutations** → All ~340 variants → JSON Mutations
2. **Batch Mutations** → 100 per GraphQL call (API limit)
3. **Execute Batches** → Send to Shopify API
4. **Validate Results** → Spot-checks + CSV Export Test

---

## 2. Step-by-Step Implementation

### Step 1: Complete Variant Data Collection

**Current State:** We have sample data from Phase 1 Audit

**Required:** All ~340 variant IDs + SKUs

**Source:** Shopify product search results from Phase 1 (stored in audit report)

**Action:**
```bash
# Extract all variant data from Phase 1 audit
python3 automation/scripts/extract_audit_variants.py \
  --input automation/reports/PHASE-1-Daten-Audit-Farbvarianten.md \
  --output automation/data/all_variants.json
```

**Output Format:**
```json
[
  {
    "product": "alvento",
    "variant_id": "gid://shopify/ProductVariant/60330685759822",
    "sku": "TEPMONTEG4_050",
    "title": "Farbe 50 / 400cm"
  },
  {
    "product": "zafira",
    "variant_id": "gid://shopify/ProductVariant/60330693067086",
    "sku": "TEPZIRKON4_250",
    "title": "Farbe 250 / 400cm"
  },
  // ... ~340 total
]
```

---

### Step 2: Generate GraphQL Mutations

**Script:** `automation/scripts/populate_color_metafields.py`

**Command:**
```bash
python3 automation/scripts/generate_bulk_mutations.py \
  --input automation/data/all_variants.json \
  --batch-size 100 \
  --output automation/scripts/mutations_batch_{N}.json
```

**Output:**
```
✅ Generated mutations_batch_1.json (100 mutations)
✅ Generated mutations_batch_2.json (100 mutations)
✅ Generated mutations_batch_3.json (100 mutations)
✅ Generated mutations_batch_4.json (~40 mutations)
✅ Total: 4 batches = 340 mutations
```

**Each Mutation:**
```json
{
  "ownerId": "gid://shopify/ProductVariant/60330693067086",
  "namespace": "color_data",
  "key": "color_info",
  "value": "{\"color_number\":\"250\",\"color_name\":\"Warm Beige\",\"width_cm\":400,\"width_code\":\"4\",\"material_type\":\"polyester\",\"usage_class\":\"23\"}",
  "type": "json"
}
```

---

### Step 3: Execute Mutations in Batches

**Method:** GraphQL metafieldsSet via Shopify Admin API

**Batch Processing Loop:**
```
For each batch file (1-4):
  1. Read mutations_batch_{N}.json (100 mutations)
  2. Prepare GraphQL metafieldsSet mutation
  3. Send to Shopify API
  4. Wait 2 seconds (rate limiting)
  5. Verify response: userErrors empty?
  6. Log results
  Next batch
```

**GraphQL Mutation Template:**
```graphql
mutation SetColorMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      id
      namespace
      key
      value
    }
    userErrors {
      field
      message
    }
  }
}
```

**Batch Execution Command:**
```bash
# Using Router to execute with validation
npm run workflow:batch-mutations -- \
  --mutations automation/scripts/mutations_batch_*.json \
  --validate true \
  --report-format json
```

---

### Step 4: Validate Results

**Validation Steps:**

#### 4.1 Immediate Response Validation
```bash
# Check for userErrors in each batch response
cat automation/scripts/mutations_batch_1.response.json | jq '.data.metafieldsSet.userErrors'

# Expected: [] (empty array = no errors)
```

#### 4.2 Spot-Check Verification (20 Random Variants)
```bash
# Verify metafields actually in Shopify
python3 automation/scripts/verify_metafields.py \
  --sample-size 20 \
  --output verification_report.json
```

**Verification Query:**
```graphql
query VerifyMetafield($id: ID!) {
  productVariant(id: $id) {
    id
    sku
    metafield(namespace: "color_data", key: "color_info") {
      value
    }
  }
}
```

**Expected Output:**
```json
{
  "variant": {
    "sku": "TEPZIRKON4_250",
    "metafield": {
      "value": "{\"color_number\":\"250\",\"color_name\":\"Warm Beige\", ...}"
    }
  },
  "status": "✅ VERIFIED"
}
```

#### 4.3 CSV Export Test
```bash
# Test export functionality
python3 automation/scripts/export_color_metafields.py \
  --format csv \
  --output color_export_test.csv

# Verify: 340 rows + 1 header = 341 lines
wc -l color_export_test.csv  # Should show 341
```

**Expected CSV:**
```csv
product_handle,variant_sku,color_number,color_name,width_cm,material,usage_class
zafira-teppichboden-400cm-500cm,TEPZIRKON4_250,250,Warm Beige,400,polyester,23
alvento-teppichboden-400cm-500cm,TEPMONTEG4_050,050,Beige Hell,400,polyester,23
```

---

## 3. Batch Execution Timeline

| Step | Duration | Status |
|---|---|---|
| **3.1 Data Collection** | 5 min | ⏳ Pending |
| **3.2 Mutation Generation** | 10 min | ⏳ Pending |
| **3.3a Batch 1 (100 mutations)** | 15 min | ⏳ Pending |
| **3.3b Batch 2 (100 mutations)** | 15 min | ⏳ Pending |
| **3.3c Batch 3 (100 mutations)** | 15 min | ⏳ Pending |
| **3.3d Batch 4 (40 mutations)** | 10 min | ⏳ Pending |
| **3.4 Validation** | 15 min | ⏳ Pending |
| **TOTAL** | **~85 minutes** | ⏳ |

---

## 4. Success Criteria ✅

### Hard Requirements

- [ ] All 340 variants receive metafield mutations
- [ ] Zero userErrors in API responses
- [ ] 20-sample spot-check all pass verification
- [ ] CSV export contains all 340 rows
- [ ] All color_numbers are correct (no parsing errors)

### Quality Gates

- [ ] No null values in color_number field
- [ ] No duplicate color_info metafields
- [ ] Material types match product config
- [ ] Usage classes consistent with audit
- [ ] Width codes correctly parsed (4/5/L)

---

## 5. Error Handling & Rollback

### If Errors Occur During Batch Upload

**Error Type 1: userErrors in Response**
```json
{
  "data": {
    "metafieldsSet": {
      "userErrors": [
        {
          "field": "metafields.0.value",
          "message": "Invalid JSON"
        }
      ]
    }
  }
}
```

**Solution:**
1. Stop batch execution
2. Check JSON escaping in mutation value
3. Re-generate batch with fix
4. Re-execute

**Error Type 2: Rate Limiting (429)**
```
Response: 429 Too Many Requests
```

**Solution:**
1. Increase wait time between batches (2s → 5s)
2. Reduce batch size (100 → 50)
3. Retry batch

**Error Type 3: Invalid Metafield Definition**
```
"Namespace/key not found"
```

**Solution:**
1. Verify metafield definition still exists in Shopify Admin
2. Re-create if necessary: `metafieldDefinitionCreate`
3. Retry mutations

### If Rollback Needed

**Full Rollback (Delete All Metafields):**
```graphql
mutation DeleteColorMetafields {
  metafieldsDelete(metafields: [
    "gid://shopify/Metafield/193464065786190",
    "gid://shopify/Metafield/193464065818958",
    // ... all metafield IDs
  ]) {
    deletedMetafieldIds
    userErrors { field message }
  }
}
```

**Partial Rollback (Specific Batches):**
```
Only delete metafields from failed batch
Keep successful batches intact
```

---

## 6. Post-Implementation Tasks

### After Phase 3b Complete ✅

**Phase 4: Filter System Setup**
- [ ] Enable Shopify filter by color_number
- [ ] Create Liquid template for color swatches
- [ ] Test color filtering on storefront

**Phase 5: CSV Export Endpoint**
- [ ] Create download route for wholesale portal
- [ ] Test export generation
- [ ] Document for B2B partners

**Phase 6: Monitoring & Maintenance**
- [ ] Set up alerts for broken metafields
- [ ] Monthly export validation
- [ ] Customer support documentation

---

## 7. Quick Reference Commands

```bash
# Generate all mutations
python3 automation/scripts/populate_color_metafields.py --all

# Execute batch 1
curl -X POST https://STORE.myshopify.com/admin/api/graphql.json \
  -H "X-Shopify-Access-Token: $API_TOKEN" \
  -d @mutations_batch_1.json

# Verify metafields
python3 automation/scripts/verify_metafields.py --sample-size 20

# Export CSV
python3 automation/scripts/export_color_metafields.py --format csv

# Check router status
npm run workflow:status -- TASK-7FAB789A0E8E
```

---

## Status: PHASE 3b READY ✅

**All preparation complete.**  
**Router validated (Class B, STANDARD_IMPLEMENTATION).**  
**Scripts ready for execution.**  
**Estimated time: 85 minutes for full deployment.**

### Next Action: Execute Phase 3b Batches

Start with mutations_batch_1.json, proceed sequentially through batches 2-4.

---

**Implementation Guide Complete** → Ready for Production Execution ✅

