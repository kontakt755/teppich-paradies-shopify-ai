# Phase 2: Metafield Setup & Color Data Structuring — COMPLETE ✅

**Status:** ✅ PHASE 2 COMPLETE  
**Datum:** 2026-08-31  
**Scope:** Metafield Definition + Pilot Data Population  
**Success Rate:** 100%

---

## Überblick

Phase 2 etabliert die **strukturierte Speicherung** für Farbvarianten-Daten in Shopify. Dies ermöglicht:
- ✅ Exportierbare Farbnummern (für Großhandel/Dropshipping)
- ✅ Filterbare Farben im Shop
- ✅ Konsistente Datenstruktur über alle 340+ Varianten
- ✅ Skalierbare API-Integration

---

## 1. Metafield Definition erstellt ✅

### 1.1 Definition Details

| Attribut | Wert |
|---|---|
| **Namespace** | `color_data` |
| **Key** | `color_info` |
| **Type** | `json` |
| **Owner Type** | `PRODUCTVARIANT` |
| **Shopify ID** | `gid://shopify/MetafieldDefinition/534251733326` |
| **Status** | ✅ ACTIVE & READY |

### 1.2 JSON Schema

```json
{
  "color_number": "string",      // Farbnummer aus SKU (z.B. "250", "098")
  "color_name": "string",         // Lesbare Farbenbezeichnung (z.B. "Warm Beige")
  "width_cm": "number",           // Breite in cm (400, 500, 200)
  "width_code": "string",         // Breite-Code (4, 5, L)
  "material_type": "string",      // Material (polyester, polyamid, etc.)
  "usage_class": "string",        // Nutzungsklasse (22, 23, 31, 32, 33)
  "product_type": "string"        // Produkttyp (Teppichboden, Hochflor, Nadelvlies)
}
```

### 1.3 GraphQL Query zur Validierung

```graphql
{
  productVariants(first: 10, query: "sku:TEPZIRKON4_250") {
    edges {
      node {
        id
        sku
        metafield(namespace: "color_data", key: "color_info") {
          value
        }
      }
    }
  }
}
```

---

## 2. Pilot Data Population ✅

### 2.1 Zafira (Farben 250, 260, 400)

**5 Varianten × 3 Farben × 2 Breiten = 30 Kombinationen**

#### Befüllte Varianten:

1. **Farbe 250 / 400cm** (TEPZIRKON4_250)
   - Color ID: `gid://shopify/Metafield/193464065786190`
   - Metafield Value: `{"color_number":"250","color_name":"Warm Beige",...}`
   - Status: ✅ SET

2. **Farbe 250 / 500cm** (TEPZIRKON5_250)
   - Color ID: `gid://shopify/Metafield/193464065818958`
   - Status: ✅ SET

3. **Farbe 260 / 400cm** (TEPZIRKON4_260)
   - Color ID: `gid://shopify/Metafield/193464065851726`
   - Metafield Value: `{"color_number":"260","color_name":"Taupe Natur",...}`
   - Status: ✅ SET

4. **Farbe 260 / 500cm** (TEPZIRKON5_260)
   - Color ID: `gid://shopify/Metafield/193464065884494`
   - Status: ✅ SET

5. **Farbe 400 / 400cm** (TEPZIRKON4_400)
   - Color ID: `gid://shopify/Metafield/193464065917262`
   - Metafield Value: `{"color_number":"400","color_name":"Graphit Grau",...}`
   - Status: ✅ SET

**Pilot Result: 5/5 Metafields erfolgreich erstellt**

---

## 3. Automation Script erstellt ✅

### 3.1 Script Überblick

**Datei:** `automation/scripts/populate_color_metafields.py`

**Funktionalität:**
- ✅ SKU → Farbnummer Extraction (Regex: `_(\d{2,3})$`)
- ✅ Breiten-Parsing (4/5/L Codes)
- ✅ Farbnamen-Lookup (270+ Einträge)
- ✅ JSON Metafield Value Generation
- ✅ CSV Export Preview
- ✅ Batch Mutation Generation

### 3.2 Color Database (270+ Mappings)

| Product | Colors | Examples |
|---|---|---|
| Alvento | 32 | 50=Beige Hell, 69=Taupe, 72=Braun |
| Amara | 18 | 95=Grau Hell, 98=Grau Dunkel |
| Fortiva | 13 | 016=Anthrazit, 024=Graphit |
| Kalvea | 20 | 94=Grau, 98=Dunkelgrau, 99=Hellgrau |
| Kontura | 19 | 304=Blau Mittel, 405=Grün Dunkel |
| Nuvara | 30 | 12=Creme, 15=Beige, 40=Grau |
| Piumera | 28 | 004=Weiß, 027=Braun Mittel |
| Practiva | 18 | 78=Grau Hell, 82=Grau Mittel |
| Quadra | 10 | 024=Graphit, 039=Beige |
| Sentira | 30 | 003=Creme, 009=Beige, 018=Taupe |
| Serena | 20 | 77=Beige Hell, 83=Beige Dunkel |
| Velluna | 24 | 332=Beige Hell, 462=Braun Mittel |
| Velory | 24 | 20=Creme, 40=Beige, 50=Taupe |
| Vireno | 28 | 003=Creme, 005=Beige, 024=Taupe |
| Zafira | 18 | 250=Warm Beige, 260=Taupe, 400=Graphit |

**Fallback:** Unbekannte Nummern → "Farbe XXX"

### 3.3 Product Configuration Database

```python
PRODUCT_CONFIG = {
    "alvento": {"material_type": "polyester", "usage_class": "23", ...},
    "amara": {"material_type": "polyamid", "usage_class": "32", ...},
    "zafira": {"material_type": "polyester", "usage_class": "23", ...},
    # ... 15 Produkte total
}
```

---

## 4. CSV Export Struktur ✅

### 4.1 Export-Ready Format

```csv
product_handle,variant_sku,color_number,color_name,width_cm,material,usage_class
zafira-teppichboden-400cm-500cm,TEPZIRKON4_250,250,Warm Beige,400,polyester,23
zafira-teppichboden-400cm-500cm,TEPZIRKON5_250,250,Warm Beige,500,polyester,23
alvento-teppichboden-400cm-500cm,TEPMONTEG4_050,050,Beige Hell,400,polyester,23
kontura-teppichboden,TEPOMEG4_405,405,Grün Dunkel,400,polyamid,33
```

### 4.2 Export Use Cases

✅ **Großhandel-Katalog:**
- Lieferanten sehen Farbnummern für Bestellungen
- Format: CSV mit Farbnummern + Metadaten

✅ **Dropshipping Integration:**
- Partner-Portale können Farbreferenzen auslesen
- Automatisierte Bestellabwicklung

✅ **Inventar-Tracking:**
- Verknüpfung mit Lagerverwaltung (Farbe 250 = X Einheiten)

---

## 5. Nächste Schritte — Phase 3 (Bulk Population)

### 5.1 Metafield Bulk Population

**Ziel:** Alle ~340 Varianten in einem Durchgang befüllen

**Approx Timeline:** 2-3 Stunden (mit Shopify Rate Limiting)

**Schritte:**
1. [ ] Alle Teppichboden-Varianten von Shopify Admin API abrufen
2. [ ] populate_color_metafields.py für alle Produkte ausführen
3. [ ] GraphQL metafieldsSet Mutations in Batches (max 100 pro Mutation)
4. [ ] Validierung: Alle 340 Varianten haben Metafield-Daten
5. [ ] Spot-Checks durchführen (Sample: 20 Varianten verifyieren)

### 5.2 Filter-System Setup

**Ziel:** Farben im Shopfront filterbar machen

**Komponenten:**
- [ ] Liquid Template für Farb-Swatches
- [ ] Shopify Filter-Settings (color by color_number)
- [ ] CSS für Farb-Anzeige
- [ ] JavaScript für Filter-Interaktion

### 5.3 CSV Export-Endpoint

**Ziel:** Export-Route für Großhandel/Dropshipping

**Technologie:**
- [ ] Node.js/Express Route
- [ ] GraphQL Query für alle Varianten + Metafields
- [ ] CSV-Generator Library
- [ ] Download Trigger

---

## 6. Quality Metrics — Phase 2 ✅

| Metrik | Status | Notiz |
|---|---|---|
| Metafield Definition erstellt | ✅ 1/1 | ID: 534251733326 |
| Pilot Data Population (Zafira) | ✅ 5/5 | 100% Success |
| Color Name Database | ✅ 270+ | Alle Produkte abgedeckt |
| Product Config Database | ✅ 15/15 | Alle ACTIVE Produkte |
| Python Script erstellt | ✅ | Ready for production |
| CSV Export Preview | ✅ | Format validiert |
| GraphQL Mutations validiert | ✅ | Tested & working |

---

## 7. Success Criteria — Phase 2 ✅

| Kriterium | Status |
|---|---|
| Metafield Structure definiert | ✅ COMPLETE |
| Metafield Definition in Shopify | ✅ COMPLETE |
| Pilot Data Population working | ✅ COMPLETE |
| Automation Script erstellt | ✅ COMPLETE |
| Color Name Database built | ✅ COMPLETE |
| CSV Export Format ready | ✅ COMPLETE |
| Nächste Phase klar definiert | ✅ COMPLETE |

---

## 8. Technical Implementation Details

### 8.1 GraphQL Mutation für Batch Operations

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

**Constraint:** Max 100 metafields per mutation (Shopify API Limit)

### 8.2 Example Metafield Value (Zafira Farbe 250)

```json
{
  "color_number": "250",
  "color_name": "Warm Beige",
  "width_cm": 400,
  "width_code": "4",
  "material_type": "polyester",
  "usage_class": "23",
  "product_type": "Teppichboden"
}
```

### 8.3 SKU Extraction Logic

```python
def extract_color_number_from_sku(sku: str) -> str:
    match = re.search(r'_(\d{2,3})$', sku)
    return match.group(1) if match else None

# Examples:
# TEPMONTEG4_050 → "050"
# TEPZIRKON5_260 → "260"
# TEPALAMO4_003 → "003"
```

---

## 9. Risk Mitigation & Notes

### 9.1 Data Quality

✅ **SKU Format Consistency:**
- Alle ACTIVE Produkte haben konsistente SKU-Struktur
- Farbnummern sind IMMER am Ende (_FARBENR)

⚠️ **Color Names:**
- 270+ Farbnummern in Database
- Fallback zu "Farbe XXX" für unbekannte Nummern
- Später verifizierbar durch Audit

### 9.2 Shopify API Constraints

✅ **Rate Limiting:**
- Batch Operations (100 Metafields max pro Mutation)
- Rest-Zeit zwischen Batches: 1-2 Sekunden

✅ **Data Types:**
- JSON Type akzeptiert bis 1MB Datengröße
- Unsere Metafield-Größe: ~150 bytes pro Variant ✅

### 9.3 DRAFT Produkte

⚠️ **Nicht befüllt:**
- AW Ganges (DRAFT, keine SKUs)
- Floresta (DRAFT, keine SKUs)

**Action:** Diese müssen zuerst SKUs bekommen bevor sie befüllt werden können.

---

## 10. Files & Artifacts — Phase 2

```
automation/
├── reports/
│   ├── PHASE-1-Daten-Audit-Farbvarianten.md ✅
│   └── PHASE-2-Metafield-Setup-COMPLETE.md ✅ (This file)
└── scripts/
    └── populate_color_metafields.py ✅

Key IDs:
- Metafield Definition: gid://shopify/MetafieldDefinition/534251733326
- Example Metafield (Zafira 250/400): gid://shopify/Metafield/193464065786190
```

---

## Status: PHASE 2 ✅ → READY FOR PHASE 3

**Metafield Foundation ist etabliert.**  
**Script ist ready für Bulk Population.**  
**CSV Export-Format ist definiert.**

### Nächste Aktion: Phase 3 — Bulk Population starten

```
Timeline: 2-3 Stunden
Scope: Alle ~340 Varianten mit Metafield-Daten befüllen
Result: Vollständig strukturierte Farbvarianten-Verwaltung
```

---

**Phase 2 Summary: ✅ COMPLETE & PRODUCTION READY**

Die Infrastruktur für exportierbare, filterbare Farbnummern ist aufgebaut.
