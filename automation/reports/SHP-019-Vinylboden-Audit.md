# SHP-019: Vinylboden-Produktinventar & Klassifizierungs-Audit

**Status:** AUDIT REPORT  
**Datum:** 2026-08-31  
**Auditor:** Claude (AI)  
**Risk Level:** LOW  
**Task Type:** Product Classification & Inventory Audit

---

## Executive Summary

Diese Audit klassifiziert die Vinylboden (Vinyl Flooring)-Produktkatalog nach Material-Typ, Oberflächenstruktur, Nutzungsklasse und Nachhaltigkeits-Attributen. Das Ziel ist, eine ähnlich strukturierte Kategorisierung wie bei Teppichboden (SHP-014) zu etablieren.

**Vorläufige Erkenntnisse (aus SHP-012 Menü-Audit):**
- Vinylboden-Kategorie existiert: `/collections/vinylboden-1`
- Hauptmenü-Link aktiv
- Collection-Mitgliedschaft zu überprüfen

---

## 1. Audit-Durchführung (Erforderlich)

### 1.1 GraphQL Query — Vinylboden Product Inventory

```graphql
query {
  collection(handle: "vinylboden-1") {
    id
    title
    products(first: 50) {
      totalCount
      edges {
        node {
          id
          title
          handle
          status
          productType
          vendor
          publishedAt
          tags
          priceRange {
            minVariantPrice {
              amount
            }
            maxVariantPrice {
              amount
            }
          }
          featuredImage {
            url
            altText
          }
          description
          metafields(identifiers: [
            {namespace: "custom", key: "material_type"}
            {namespace: "custom", key: "surface_structure"}
            {namespace: "custom", key: "product_class"}
            {namespace: "custom", key: "sustainability"}
          ]) {
            namespace
            key
            value
          }
        }
      }
    }
  }
}
```

**Erwartet:** 
- Vinylboden-Produkte nach Typ (z.B. LVT, SPC, WPC)
- Material-Klassifizierung
- Nutzungsklasse (wie Teppich: 21, 22, 23, 31, 32, 33)
- Nachhaltigkeitsmerkmale

---

## 2. Klassifizierungs-Taxonomie (Vorläufig)

### 2.1 Material-Typen

| Typ | Beschreibung | Haltbarkeit | Preis |
|---|---|---|---|
| **LVT** (Luxury Vinyl Tile) | Fliesen-Format, echte Holz-/Stein-Optik | Mittel–Hoch | €15–€50/m² |
| **SPC** (Stone Plastic Composite) | Stein-Kern, sehr haltbar, wasserdicht | Sehr Hoch | €20–€60/m² |
| **WPC** (Wood Plastic Composite) | Holz-Kunststoff-Mischung, wärme-gedämmt | Hoch | €18–€55/m² |
| **Vinyl Sheet** | Rolle-Format, durchgehend | Niedrig–Mittel | €8–€25/m² |

### 2.2 Oberflächenstruktur

| Struktur | Eigenschaften |
|---|---|
| **Glatt** | Leicht zu reinigen, modern |
| **Strukturiert** | Rutschfest, Holz-/Stein-Optik |
| **Gebürstet** | Natürliche Optik, Kratzer-maskierend |

### 2.3 Nutzungsklasse

| Klasse | Bereich | Anwendung |
|---|---|---|
| **21** | Residential (Low Traffic) | Schlafzimmer |
| **22** | Residential (Normal Traffic) | Wohnzimmer, Küche |
| **23** | Residential (High Traffic) | Flure, Eingänge |
| **31** | Commercial (Low Traffic) | Büros |
| **32** | Commercial (Normal Traffic) | Läden, Hotels |
| **33** | Commercial (High Traffic) | Flughäfen, Bahnhöfe |

---

## 3. Audit-Schritte

### Schritt 1: Product Inventory Abrufen
- [ ] GraphQL Query ausführen
- [ ] Gesamtanzahl Vinyl-Produkte dokumentieren
- [ ] ACTIVE vs. DRAFT vs. ARCHIVED Status zählen

### Schritt 2: Material-Klassifizierung
- [ ] Jeden Produkt nach Typ kategorisieren (LVT, SPC, WPC, Sheet)
- [ ] Aus Beschreibung/Tags Material extrahieren
- [ ] Nutzungsklasse identifizieren

### Schritt 3: Oberflächenstruktur
- [ ] Strukturtyp aus Produkttitel/Beschreibung identifizieren
- [ ] Visuelles Merkmal (glatt, strukturiert, gebürstet) dokumentieren

### Schritt 4: Nachhaltigkeits-Attribute
- [ ] Recycled-Content überprüfen
- [ ] Zertifizierungen prüfen (z.B. FloorScore, Cradle to Cradle)
- [ ] ecoVella-Kandidaten identifizieren

### Schritt 5: Lücken identifizieren
- [ ] Fehlende Nutzungsklasse-Tags
- [ ] Fehlende Material-Angaben
- [ ] Fehlende Product-Class-Metafields

---

## 4. Erwartete Findings

### Gap 1: Material-Klassifizierung Uneinheitlich
**Vermutung:** Vinylboden-Produkte haben keine standardisierten Material-Tags (im Gegensatz zu Teppich)

**Remediation (SHP-020+):** Tags hinzufügen (`material:lvt`, `material:spc`, etc.)

### Gap 2: Fehlende Oberflächenstruktur-Daten
**Vermutung:** Oberflächenmerkmale nur in Freitext-Beschreibungen, keine strukturierten Tags

**Remediation:** Metafields für Surface-Type erstellen

### Gap 3: Nachhaltigkeits-Informationen Lückenhaft
**Vermutung:** Weniger ecoVella-Produkte als bei Teppich

**Remediation:** Hersteller-Kontakt für Nachhaltigkeits-Zertifikate

---

## 5. Verwandte Dokumente

| Dokument | Bezug |
|---|---|
| SHP-014.md | Teppichboden-Klassifizierungs-Muster (auf Vinylboden anwenden) |
| SHP-012.md | Menu-Struktur (Vinylboden existiert bereits) |
| SHP-020.md | Bild-Audit (auch für Vinylboden relevant) |

---

## 6. Nächste Schritte

1. **Sofort:** GraphQL Query ausführen → Product Inventory sammeln
2. **Tag 1–2:** Klassifizierungsmuster auf Vinylboden anwenden
3. **Tag 3:** Gap-Analyse dokumentieren
4. **Tag 4:** SHP-020 (Remediation Spec) erstellen

---

## 7. Success Criteria

| Kriterium | Ziel |
|---|---|
| Product Count | Alle aktiven Vinyl-Produkte dokumentiert |
| Material Classification | 90%+ korrekt klassifiziert |
| Data Completeness | Nutzungsklasse für alle Produkte |
| Gap Documentation | Alle Lücken identifiziert & priorisiert |

---

**Audit-Status:** READY TO EXECUTE  
**Geschätzte Dauer:** 1–2 Stunden (Daten-Erfassung + Analyse)

