# Phase 3: Bulk Metafield Population — Test Plan mit Router/Codex

**Status:** 🧪 TEST PLAN (PRE-PRODUCTION)  
**Datum:** 2026-08-31  
**Strategie:** Local Testing mit Router/Codex vor Live-Deployment  
**Ziel:** Fehlerfreie Bulk-Population aller ~340 Varianten

---

## 1. Test-Strategie: Router/Codex Validierung

### 1.1 Pre-Deployment Validation

**Phase 3a — Local Router Tests (Heute):**
```
┌─────────────────────────────────────────┐
│ 1. Metafield Mutation Syntax prüfen     │  ← GraphQL validieren
│ 2. Sample Data mit Router testen        │  ← 3-5 Varianten
│ 3. Shopify API Response validieren      │  ← Errors checken
│ 4. Metafield Values in Shopify prüfen   │  ← Daten korrekt?
└─────────────────────────────────────────┘
```

**Phase 3b — Bulk Population (Nach Validation):**
```
1. Alle Varianten-Daten generieren (Script)
2. GraphQL Mutations in 100er-Batches
3. Live-Deployment zur Shopify API
4. Spot-Checks durchführen
```

---

## 2. Router Test Setup

### 2.1 Voraussetzungen für Router Test

**Erforderlich:**
- [ ] Router hat Shopify Dev Store Access
- [ ] Codex CLI konfiguriert
- [ ] GraphQL Endpoint erreichbar (z.B. http://localhost:3000/graphql)
- [ ] Test-Daten für 3-5 Varianten vorbereitet

### 2.2 Test-Daten (Sample Set)

Verwenden wir diese 5 Varianten zum Testen:

```python
TEST_VARIANTS = [
    {
        "variant_id": "gid://shopify/ProductVariant/60330693067086",
        "sku": "TEPZIRKON4_250",
        "product": "Zafira",
        "status": "Already has metafield ✅"
    },
    {
        "variant_id": "gid://shopify/ProductVariant/60330685759822",
        "sku": "TEPMONTEG4_050",
        "product": "Alvento",
        "status": "New test"
    },
    {
        "variant_id": "gid://shopify/ProductVariant/60326505251150",
        "sku": "TEPRIVAO4_098",
        "product": "Amara",
        "status": "New test"
    },
    {
        "variant_id": "gid://shopify/ProductVariant/60531027149134",
        "sku": "TEPM733L_016",
        "product": "Fortiva",
        "status": "New test"
    },
    {
        "variant_id": "gid://shopify/ProductVariant/60326240813390",
        "sku": "TEPOMEG4_405",
        "product": "Kontura",
        "status": "New test"
    },
]
```

---

## 3. Local Test Procedure mit Router

### 3.1 Test 1: Mutation Syntax Validierung

**Was:** GraphQL Mutation korrekt für alle 5 Test-Varianten?

**Command:**
```bash
# Mit Router/Codex GraphQL Schema validieren
router supergraph compose --config router.yaml

# GraphQL Syntax prüfen
codex validate --schema ./schema.graphql \
  --query ./mutations/bulk_metafield_set.graphql
```

**Expected Output:**
```
✅ Schema validation: OK
✅ Query validation: OK
✅ Field resolution: OK
```

**Fehler-Szenarien:**
- ❌ Invalid field name → Fix: graphql_schema nochmal prüfen
- ❌ Type mismatch → Fix: JSON string escaping prüfen
- ❌ Namespace/Key nicht vorhanden → Fix: Metafield Definition nicht aktiv?

---

### 3.2 Test 2: Sample Mutation Ausführen

**Was:** 5 Test-Varianten gegen lokale Router-Instanz?

**Script:**
```bash
# populate_color_metafields.py mit TEST_VARIANTS ausführen
python3 automation/scripts/populate_color_metafields.py \
  --test-variants TEST_VARIANTS \
  --output mutations_test.json

# Output prüfen
cat mutations_test.json | jq '.[] | {ownerId, metafield_value}'
```

**Expected Output:**
```json
[
  {
    "ownerId": "gid://shopify/ProductVariant/60330693067086",
    "metafield_value": {
      "color_number": "250",
      "color_name": "Warm Beige",
      "width_cm": 400,
      "width_code": "4",
      "material_type": "polyester",
      "usage_class": "23"
    }
  },
  {
    "ownerId": "gid://shopify/ProductVariant/60330685759822",
    "metafield_value": {
      "color_number": "050",
      "color_name": "Beige Hell",
      "width_cm": 400,
      "width_code": "4",
      "material_type": "polyester",
      "usage_class": "23"
    }
  }
]
```

**Validierung:**
- ✅ Alle 5 Varianten in Output?
- ✅ Farbnummern korrekt extrahiert?
- ✅ JSON-Format valide?
- ✅ Keine null-Werte?

---

### 3.3 Test 3: Mutation gegen Router GraphQL Endpoint

**Was:** Tatsächliche GraphQL-Mutation mit Router testen

**Command:**
```bash
# Mutation an Router GraphQL Endpoint senden
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SHOPIFY_API_TOKEN" \
  -d @mutations_test.json

# Oder mit Router CLI:
router query --endpoint http://localhost:3000/graphql \
  --query mutations_test.graphql
```

**Expected Response:**
```json
{
  "data": {
    "metafieldsSet": {
      "metafields": [
        {
          "id": "gid://shopify/Metafield/...",
          "namespace": "color_data",
          "key": "color_info",
          "value": "{\"color_number\":\"250\", ...}"
        },
        // ... 4 weitere Metafields
      ],
      "userErrors": []
    }
  }
}
```

**Error Handling:**
```
Falls userErrors nicht leer:
  - field: "metafields.0.value" → JSON Parsing-Fehler
  - message: "Invalid JSON" → Escaping-Fehler prüfen
  - Lösung: Script anpassen und nochmal testen
```

---

### 3.4 Test 4: Shopify Admin Verification

**Was:** Sind die Metafields tatsächlich in Shopify gespeichert?

**GraphQL Query (via Router):**
```graphql
query VerifyMetafields {
  productVariant(id: "gid://shopify/ProductVariant/60330693067086") {
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
  "data": {
    "productVariant": {
      "id": "gid://shopify/ProductVariant/60330693067086",
      "sku": "TEPZIRKON4_250",
      "metafield": {
        "value": "{\"color_number\":\"250\",\"color_name\":\"Warm Beige\", ...}"
      }
    }
  }
}
```

**Validierung:**
- ✅ Metafield vorhanden?
- ✅ Value korrekt gespeichert?
- ✅ JSON parsebar?

---

### 3.5 Test 5: CSV Export Test

**Was:** Können wir die Metafields korrekt exportieren?

**Script:**
```python
# Metafields auslesen und CSV generieren
python3 automation/scripts/export_color_metafields.py \
  --variant-ids [5 Test-Varianten] \
  --output test_export.csv
```

**Expected CSV:**
```csv
product_handle,variant_sku,color_number,color_name,width_cm,material,usage_class
zafira-teppichboden-400cm-500cm,TEPZIRKON4_250,250,Warm Beige,400,polyester,23
alvento-teppichboden-400cm-500cm,TEPMONTEG4_050,050,Beige Hell,400,polyester,23
amara-teppichboden-400cm-500cm,TEPRIVAO4_098,098,Grau Dunkel,400,polyamid,32
fortiva-teppichboden-200cm,TEPM733L_016,016,Anthrazit,200,polyamid,33
kontura-teppichboden,TEPOMEG4_405,405,Grün Dunkel,400,polyamid,33
```

**Validierung:**
- ✅ Alle 5 Zeilen in CSV?
- ✅ Farbnummern korrekt?
- ✅ Material/Usage Class korrekt?

---

## 4. Test Checklist

### Before Running Tests ✅

- [ ] Router läuft und ist erreichbar (http://localhost:3000)
- [ ] Codex CLI installiert und konfiguriert
- [ ] Shopify API Token gesetzt ($SHOPIFY_API_TOKEN)
- [ ] populate_color_metafields.py Script lädt ohne Fehler
- [ ] TEST_VARIANTS Array mit 5 Varianten vorbereitet

### Test Execution ✅

- [ ] **Test 1:** GraphQL Syntax validiert
- [ ] **Test 2:** Sample Mutations JSON generiert
- [ ] **Test 3:** Mutation gegen Router Endpoint gesendet
- [ ] **Test 4:** Metafields in Shopify verifiziert
- [ ] **Test 5:** CSV Export funktioniert

### Quality Gates ✅

- [ ] Keine userErrors in Response
- [ ] Alle 5 Metafields erfolgreich erstellt
- [ ] Metafield Values korrekt gespeichert
- [ ] CSV Export vollständig
- [ ] Farbnummern zu 100% korrekt

---

## 5. Fehler-Szenarien & Lösungen

| Szenario | Fehler | Lösung |
|---|---|---|
| **Mutation Syntax** | `Cannot query field...` | GraphQL Schema nochmal prüfen |
| **JSON Escaping** | `Invalid JSON` | Backslashes in Strings prüfen |
| **Metafield nicht vorhanden** | `Namespace not found` | Metafield Definition aktiv? (Shopify Admin prüfen) |
| **Authorization** | `401 Unauthorized` | API Token gültig? Refresh token |
| **Rate Limiting** | `429 Too Many Requests` | Warten + Retry-Logic implementieren |
| **Falsche Farbnummern** | Color in CSV falsch | SKU Regex nochmal debuggen |

---

## 6. Green Light Kriterien (Vor Bulk Deployment)

### Alle Tests müssen grün sein:

- ✅ GraphQL Syntax valide
- ✅ 5 Test-Varianten erfolgreich befüllt
- ✅ Metafields in Shopify verifiziert
- ✅ CSV Export funktioniert
- ✅ Keine Fehler-Muster erkannt
- ✅ Farbnummern 100% korrekt

### Dann: GO FOR BULK DEPLOYMENT ✅

```
Phase 3b kann starten:
1. Alle ~340 Varianten durch Script verarbeiten
2. GraphQL Mutations in 100er-Batches senden
3. Live-Deployment zur Shopify API
4. Spot-Checks durchführen (20 Samples)
5. Fertig! ✅
```

---

## 7. Bulk Deployment Timeline

Nach erfolgreichem Router-Test:

| Schritt | Zeit | Status |
|---|---|---|
| 1. Alle Varianten-Daten generieren | 5 min | ⏳ Pending |
| 2. GraphQL Mutations in Batches erstellen | 10 min | ⏳ Pending |
| 3. Batch 1-5 (500 Metafields) senden | 30 min | ⏳ Pending |
| 4. Validierung + Pause | 10 min | ⏳ Pending |
| 5. Batch 6-10 senden | 30 min | ⏳ Pending |
| 6. Finalisierung + Spot-Checks | 15 min | ⏳ Pending |
| **TOTAL** | **~100 min (~1.5h)** | ⏳ |

---

## Status: TEST PLAN READY ✅

Sobald Router-Tests grün sind → Bulk Population kann starten!

**Nächster Schritt:** Welche 5 Test-Varianten sollen wir mit dem Router testen?

