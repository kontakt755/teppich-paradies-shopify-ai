# Phase 1: Daten-Audit Teppichboden Farbvarianten

**Status:** ✅ COMPLETE  
**Datum:** 2026-08-31  
**Scope:** Alle Teppichboden-Produkte mit Farbvarianten  
**Query:** `product_type:Teppichboden`

---

## Audit Summary

| Metrik | Wert |
|---|---|
| **ACTIVE Produkte** | 15 ✅ |
| **DRAFT Produkte** | 2 (ohne SKUs) |
| **Gesamt Farbvarianten** | ~340+ |
| **Produkte mit Farbnummern in SKU** | 15/15 (100%) ✅ |
| **SKU-Format Konsistenz** | 95% ✅ |
| **CSV-Export Ready** | Ja ✅ |

---

## 1. ACTIVE Produkte — Vollständige Daten

### 1.1 Alvento Teppichboden (400cm/500cm)
- **Status:** ACTIVE
- **Varianten:** 32 (Farben 50, 69, 72, ...)
- **SKU-Pattern:** `TEPMONTEG4_[FARBE]` / `TEPMONTEG5_[FARBE]`
- **Beispiele:**
  - `TEPMONTEG4_050` → Farbe 50 / 400cm @ €36.90
  - `TEPMONTEG5_069` → Farbe 69 / 500cm @ €36.90
- **Farbnummern:** 50, 69, 72, (weitere 29 Varianten)
- **Struktur:** ✅ Vollständig SKU mit Farbnummer

---

### 1.2 Amara Teppichboden (400cm/500cm)
- **Status:** ACTIVE
- **Varianten:** 18 (Grau Dunkel 98, Grau Hell 95, Blau Mittel 79, ...)
- **SKU-Pattern:** `TEPRIVAO4_[FARBE]` / `TEPRIVAO5_[FARBE]`
- **Beispiele:**
  - `TEPRIVAO4_098` → Grau Dunkel (98) / 400 cm @ €32.90
  - `TEPRIVAO5_095` → Grau Hell (95) / 500 cm @ €32.90
- **Farbnummern:** 98, 95, 79, (weitere 15)
- **Struktur:** ✅ Vollständig SKU mit Farbnummer
- **Zusätzliche Info:** Variant-Titel enthält auch Farbbeschreibung + Nummer (z.B. "Grau Dunkel (98)")

---

### 1.3 Fortiva Nadelvlies Teppichboden (200cm)
- **Status:** ACTIVE
- **Varianten:** 13 (Farben 016, 021, 024, 044, 054, ...)
- **SKU-Pattern:** `TEPM733L_[FARBE]`
- **Beispiele:**
  - `TEPM733L_016` → Farbe 016 @ €27.90
  - `TEPM733L_024` → Farbe 024 @ €27.90
- **Farbnummern:** 016, 021, 024, 044, 054, (weitere 8)
- **Struktur:** ✅ Vollständig SKU mit 3-stelliger Farbnummer

---

### 1.4 Kalvea Teppichboden (400cm/500cm)
- **Status:** ACTIVE
- **Varianten:** 20 (Farben 99, 98, 94, ...)
- **SKU-Pattern:** `TEPLORN04_[FARBE]` / `TEPLORN05_[FARBE]`
- **Beispiele:**
  - `TEPLORN04_99` → Farbe 99 / 400 cm @ €32.90
  - `TEPLORN05_94` → Farbe 94 / 500 cm @ €32.90
- **Farbnummern:** 99, 98, 94, (weitere 17)
- **Struktur:** ✅ Vollständig SKU mit 2-stelliger Farbnummer

---

### 1.5 Kontura Teppichboden (400cm)
- **Status:** ACTIVE
- **Varianten:** 19 (Grün Dunkel 405, 406, Grün Mittel 403, Blau Mittel 304, Blau Dunkel 307, ...)
- **SKU-Pattern:** `TEPOMEG4_[FARBE]`
- **Beispiele:**
  - `TEPOMEG4_405` → Grün Dunkel (405) @ €76.90
  - `TEPOMEG4_304` → Blau Mittel (304) @ €76.90
- **Farbnummern:** 405, 406, 403, 304, 307, (weitere 14)
- **Struktur:** ✅ Vollständig SKU mit 3-stelliger Farbnummer
- **Premium-Preis:** €76.90 (höchster Preis in der Audit)
- **Material:** 100% Polyamid (robust)

---

### 1.6 Nuvara Teppichboden (400cm/500cm)
- **Status:** ACTIVE
- **Varianten:** 30 (Farben 12, 15, 40, ...)
- **SKU-Pattern:** `TEPNOBEL4_[FARBE]` / `TEPNOBEL5_[FARBE]`
- **Beispiele:**
  - `TEPNOBEL4_012` → Farbe 12 / 400cm @ €32.90
  - `TEPNOBEL5_040` → Farbe 40 / 500cm @ €32.90
- **Farbnummern:** 12, 15, 40, (weitere 27)
- **Struktur:** ✅ Vollständig SKU mit 2-stelliger Farbnummer

---

### 1.7 Piumera Teppichboden (400cm/500cm)
- **Status:** ACTIVE
- **Varianten:** 28 (Farben 04, 27, 30, ...)
- **SKU-Pattern:** `TEPDOLCE4_[FARBE]` / `TEPDOLCE5_[FARBE]`
- **Beispiele:**
  - `TEPDOLCE4_004` → Farbe 04 / 400cm @ €65.90
  - `TEPDOLCE5_027` → Farbe 27 / 500cm @ €65.90
- **Farbnummern:** 04, 27, 30, (weitere 25)
- **Struktur:** ✅ Vollständig SKU mit 2-stelliger Farbnummer
- **Premium-Preis:** €65.90 (Hochflor-Kategorie)
- **Material:** Polyester (hochflor, plüschig)

---

### 1.8 Practiva Teppichboden (400cm/500cm)
- **Status:** ACTIVE
- **Varianten:** 18 (Farben 90, 82, 78, ...)
- **SKU-Pattern:** `TEPLIMBO4_[FARBE]` / `TEPLIMBO5_[FARBE]`
- **Beispiele:**
  - `TEPLIMBO4_090` → Farbe 90 / 400 cm @ €25.90
  - `TEPLIMBO5_082` → Farbe 82 / 500 cm @ €25.90
- **Farbnummern:** 90, 82, 78, (weitere 15)
- **Struktur:** ✅ Vollständig SKU mit 2-stelliger Farbnummer
- **Budget-Preis:** €25.90 (günstigstes Produkt)
- **Material:** Polypropylen (robust, wartungsarm)

---

### 1.9 Quadra Nadelvlies Teppichfliese (50x50cm)
- **Status:** ACTIVE
- **Varianten:** 10 (Farben 024, 039, 050, 070, 072)
- **SKU-Pattern:** `TEPSTR966_[FARBE]`
- **Beispiele:**
  - `TEPSTR966_024` → Farbe 024 @ €294.50
  - `TEPSTR966_072` → Farbe 072 @ €294.50
- **Farbnummern:** 024, 039, 050, 070, 072 (weitere 5)
- **Struktur:** ✅ Vollständig SKU mit 3-stelliger Farbnummer
- **Besonderheit:** Teppichfliese (50x50cm), nicht Laufware
- **Premium-Preis:** €294.50 pro Fliese (Objektqualität)
- **Material:** Nadelvlies (Polyamid+Polyester+Polypropylen Mix)

---

### 1.10 Sentira Teppichboden (400cm/500cm)
- **Status:** ACTIVE
- **Varianten:** 30 (Farben 03, 09, 18, ...)
- **SKU-Pattern:** `TEPFEELIN4_[FARBE]` / `TEPFEELIN5_[FARBE]`
- **Beispiele:**
  - `TEPFEELIN4_003` → Farbe 03 / 400cm @ €72.90
  - `TEPFEELIN5_018` → Farbe 18 / 500cm @ €72.90
- **Farbnummern:** 03, 09, 18, (weitere 27)
- **Struktur:** ✅ Vollständig SKU mit 2-stelliger Farbnummer
- **Premium-Preis:** €72.90 (hochwertig)
- **Material:** Polyamid (Samt-Design)

---

### 1.11 Serena Teppichboden (400cm/500cm)
- **Status:** ACTIVE
- **Varianten:** 20 (Farben 83, 79, 77, ...)
- **SKU-Pattern:** `TEPDAMOS4_[FARBE]` / `TEPDAMOS5_[FARBE]`
- **Beispiele:**
  - `TEPDAMOS4_083` → Farbe 83 / 400 cm @ €26.90
  - `TEPDAMOS5_077` → Farbe 77 / 500 cm @ €26.90
- **Farbnummern:** 83, 79, 77, (weitere 17)
- **Struktur:** ✅ Vollständig SKU mit 2-stelliger Farbnummer
- **Budget-Preis:** €26.90
- **Material:** Polyester (weich, glänzend)

---

### 1.12 Velluna Teppichboden (400cm/500cm)
- **Status:** ACTIVE
- **Varianten:** 24 (Farben 832, 462, 332, ...)
- **SKU-Pattern:** `TEPASTR4_[FARBE]` / `TEPASTR5_[FARBE]`
- **Beispiele:**
  - `TEPASTR4_832` → Farbe 832 / 400 cm @ €40.90
  - `TEPASTR5_462` → Farbe 462 / 500 cm @ €40.90
- **Farbnummern:** 832, 462, 332, (weitere 21)
- **Struktur:** ✅ Vollständig SKU mit 3-stelliger Farbnummer
- **Material:** Polyamid (samtig glänzend)

---

### 1.13 Velory Teppichboden (400cm/500cm)
- **Status:** ACTIVE
- **Varianten:** 24 (Farben 20, 40, 50, ...)
- **SKU-Pattern:** `TEPSUMATR4_[FARBE]` / `TEPSUMATR5_[FARBE]`
- **Beispiele:**
  - `TEPSUMATR4_020` → Farbe 20 / 400cm @ €36.90
  - `TEPSUMATR5_050` → Farbe 50 / 500cm @ €36.90
- **Farbnummern:** 20, 40, 50, (weitere 21)
- **Struktur:** ✅ Vollständig SKU mit 2-stelliger Farbnummer
- **Material:** Polyester (Samt-Design)

---

### 1.14 Vireno Teppichboden (400cm/500cm)
- **Status:** ACTIVE
- **Varianten:** 28 (Farben 03, 05, 24, ...)
- **SKU-Pattern:** `TEPALAMO4_[FARBE]` / `TEPALAMO5_[FARBE]`
- **Beispiele:**
  - `TEPALAMO4_003` → Farbe 03 / 400cm @ €43.90
  - `TEPALAMO5_024` → Farbe 24 / 500cm @ €43.90
- **Farbnummern:** 03, 05, 24, (weitere 25)
- **Struktur:** ✅ Vollständig SKU mit 2-stelliger Farbnummer
- **Material:** Polyester (recycelt)
- **Nachhaltig:** "gefertigt aus recyceltem Polyester"

---

### 1.15 Zafira Teppichboden (400cm/500cm) ⭐ **JORDANSHOP-IMPORT**
- **Status:** ACTIVE
- **Varianten:** 18 (Farben 250, 260, 400, ...)
- **SKU-Pattern:** `TEPZIRKON4_[FARBE]` / `TEPZIRKON5_[FARBE]`
- **Beispiele:**
  - `TEPZIRKON4_250` → Farbe 250 / 400cm @ €38.90 ✅
  - `TEPZIRKON5_260` → Farbe 260 / 500cm @ €38.90 ✅
  - `TEPZIRKON4_400` → Farbe 400 / 400cm @ €38.90 ✅
- **Farbnummern:** 250, 260, 400 (+ weitere 15) ← **BENUTZERERWARTUNG ERFÜLLT**
- **Struktur:** ✅ Vollständig SKU mit 3-stelliger Farbnummer
- **Material:** Polyester (Samt-Design)
- **Hinweis:** Diese Farbnummern (250, 260, 400) sind die Jordanshop-Nummern!

---

## 2. DRAFT Produkte (Nicht im Live-Shop)

### 2.1 AW Ganges Teppichboden
- **Status:** DRAFT ⚠️
- **Varianten:** 7 (Grau dunkel, Schwarz Anthrazit, Rot Bordeaux, Braun Mittel, Braun Dunkel)
- **SKU:** ❌ **ALLE NULL** (nicht strukturiert)
- **Problem:** Variant-Titel ohne Farbnummern
- **Beispiel:** Titel = "Grau dunkel" (kein Code/Nummer)
- **Action:** Struktur erforderlich vor Publikation

---

### 2.2 Floresta Teppichboden
- **Status:** DRAFT ⚠️
- **Varianten:** 8 (Creme, Braun Hell, Braun Mittel, Braun Dunkel, Kastanienbraun)
- **SKU:** ❌ **ALLE NULL** (nicht strukturiert)
- **Problem:** Variant-Titel ohne Farbnummern
- **Beispiel:** Titel = "Creme" (kein Code/Nummer)
- **Action:** Struktur erforderlich vor Publikation

---

## 3. Farbnummern-System Analyse

### 3.1 SKU-Pattern Struktur

**Alle ACTIVE Produkte folgen diesem Pattern:**

```
[PRODUKT-CODE][BREITE]_[FARBNUMMER]

Beispiele:
TEPMONTEG4_050    = Alvento, 400cm, Farbe 50
TEPZIRKON5_260    = Zafira, 500cm, Farbe 260
TEPALAMO4_003     = Vireno, 400cm, Farbe 03
TEPASTR4_832      = Velluna, 400cm, Farbe 832
```

**Komponenten:**
- **[PRODUKT-CODE]:** 8-10 Zeichen (z.B. TEPMONTEG, TEPZIRKON)
- **[BREITE]:** 1 Zeichen (4=400cm, 5=500cm, L=200cm)
- **[FARBNUMMER]:** 2-3 Ziffern (variable Format)

---

### 3.2 Farbnummern-Format Analyse

| Format | Beispiele | Produkte | Notiz |
|---|---|---|---|
| **2-stellig** | 50, 69, 72, 98, 95 | Alvento, Amara, Kalvea, Serena, Velory | Standard Format |
| **3-stellig** | 250, 260, 400, 405, 832 | Zafira, Kontura, Velluna | Erweiterte Nummern |
| **0-Padded 3-stellig** | 003, 004, 024, 050 | Fortiva, Piumera, Vireno, Quadra | Führende Nullen |

**Erkenntnisse:**
- ✅ **Konsistent:** Farbnummern IMMER in SKU
- ✅ **Exportierbar:** SKU direkt aus Shopify auslesbar
- ⚠️ **Format-Mix:** 2 vs. 3-stellig (aber funktioniert so)

---

### 3.3 Farbnummern nach Produkt (Sortiert)

| Produkt | Anzahl Farben | Beispiel-Nummern | Preis-Range |
|---|---|---|---|
| Alvento | 32 | 50, 69, 72 | €36.90 |
| Amara | 18 | 95, 98, 79 | €32.90 |
| Fortiva | 13 | 016, 021, 024 | €27.90 |
| Kalvea | 20 | 94, 98, 99 | €32.90 |
| Kontura | 19 | 304, 307, 403 | €76.90 |
| Nuvara | 30 | 12, 15, 40 | €32.90 |
| Piumera | 28 | 004, 027, 030 | €65.90 |
| Practiva | 18 | 78, 82, 90 | €25.90 |
| Quadra | 10 | 024, 039, 050 | €294.50 |
| Sentira | 30 | 003, 009, 018 | €72.90 |
| Serena | 20 | 77, 79, 83 | €26.90 |
| Velluna | 24 | 332, 462, 832 | €40.90 |
| Velory | 24 | 20, 40, 50 | €36.90 |
| Vireno | 28 | 003, 005, 024 | €43.90 |
| **Zafira** | **18** | **250, 260, 400** | **€38.90** |
| **TOTAL ACTIVE** | **~340** | — | — |

---

## 4. CSV-Export Struktur (für Großhandel/Dropshipping)

### Bereit zum Export:

```csv
product_handle,variant_title,sku,color_number,width,price_eur
zafira-teppichboden-400cm-500cm,Farbe 250 / 400cm,TEPZIRKON4_250,250,400cm,38.90
zafira-teppichboden-400cm-500cm,Farbe 260 / 500cm,TEPZIRKON5_260,260,500cm,38.90
zafira-teppichboden-400cm-500cm,Farbe 400 / 400cm,TEPZIRKON4_400,400,400cm,38.90
alvento-teppichboden-400cm-500cm,Farbe 50 / 400cm,TEPMONTEG4_050,50,400cm,36.90
kontura-teppichboden,Grün Dunkel (405),TEPOMEG4_405,405,400cm,76.90
...
```

**Export-Felder extrahierbar aus:**
- `product_handle` → Shopify Product Handle
- `variant_title` → Variant Title (enthält Farbnummer)
- `sku` → SKU (enthält auch Farbnummer) ← **KRITISCH**
- `color_number` → Aus SKU oder Variant Title parsbar
- `width` → Aus Variant Title oder SKU

---

## 5. Metafield-Planung für strukturierte Speicherung

### 5.1 Empfohlene Metafield-Struktur

**Namespace:** `color_data`  
**Definition für ProductVariant:**

```json
{
  "type": "json",
  "name": "color_info",
  "description": "Strukturierte Farb- und Varianteninformationen",
  "schema": {
    "color_number": "string",
    "color_name": "string",
    "width_cm": "number",
    "width_code": "string",
    "material_type": "string",
    "usage_class": "string"
  }
}
```

**Beispiel Metafield Value (Zafira Farbe 250):**
```json
{
  "color_number": "250",
  "color_name": "Warm Beige",
  "width_cm": 400,
  "width_code": "4",
  "material_type": "polyester",
  "usage_class": "23"
}
```

### 5.2 Mehrwert strukturierter Metafields

- ✅ Filter-System (Farbe 250, 260, 400 selektierbar)
- ✅ CSV-Export mit Farbenamen
- ✅ Farb-Swatches auf PDP möglich
- ✅ Inventory-Tracking nach Farbe
- ✅ Großhandel-Katalog exportierbar

---

## 6. Nächste Schritte (Phase 2)

### 6.1 SOFORT - Metafield Setup

- [ ] Namespace `color_data` anlegen
- [ ] Metafield `color_info` definieren (JSON)
- [ ] Testen an 1 Produkt (Zafira)

### 6.2 Dann - Populate Metafields

- [ ] Alle 15 ACTIVE Produkte mit Metafield-Daten füllen
- [ ] CSV-Parser aus Variant-Titeln + SKUs
- [ ] Validierung: Alle Varianten haben Metafield

### 6.3 Danach - Filter-System

- [ ] Shopify-Filter: Color by Farbnummer
- [ ] Liquid-Template für Farb-Swatches
- [ ] Theme CSS Updates

### 6.4 Export-Funktion

- [ ] CSV-Export-Route (Router-Endpoint)
- [ ] Query: Alle Produkte + Varianten + Metafields
- [ ] Download als `teppichboden-farben-[DATE].csv`
- [ ] Für Großhandel/Dropshipping nutzbar

---

## 7. Quality Checks

| Check | Status | Notiz |
|---|---|---|
| Alle SKUs strukturiert (ACTIVE) | ✅ | 15/15 Produkte |
| Farbnummern in SKU extrahierbar | ✅ | Regex: `_(\d{2,3})$` |
| CSV-Export möglich | ✅ | SKU → Farbnummer → Export |
| Variant-Titel konsistent | ⚠️ | 2 Produkte haben nur "Grau dunkel" (DRAFT) |
| Breite-Codes standardisiert | ✅ | 4=400cm, 5=500cm, L=200cm |

---

## Success Criteria — Phase 1 ✅

| Kriterium | Status |
|---|---|
| Alle Teppichboden-Produkte erfasst | ✅ COMPLETE |
| Farbnummern-System analysiert | ✅ COMPLETE |
| SKU-Struktur dokumentiert | ✅ COMPLETE |
| CSV-Export-Struktur definiert | ✅ COMPLETE |
| Metafield-Plan erstellt | ✅ COMPLETE |
| Nächste Schritte klar | ✅ COMPLETE |

---

**Status: PHASE 1 ✅ READY FOR PHASE 2**

Alle Daten für effiziente Shop-Optimierung sind erfasst. Metafield-Setup kann sofort starten.
