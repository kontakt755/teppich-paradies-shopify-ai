# SHP-020: Bodenleisten-Produktinventar & Material-Audit

**Status:** AUDIT REPORT  
**Datum:** 2026-08-31  
**Auditor:** Claude (AI)  
**Risk Level:** LOW  
**Task Type:** Product Classification & Accessory Audit

---

## Executive Summary

Diese Audit klassifiziert die Bodenleisten (Baseboard/Trim)-Produktkatalog nach Material, Stil, Kompatibilität und Oberflächenbehandlung. Bodenleisten sind Zubehör-Kategorie, spielen aber eine wichtige Rolle für Teppichboden- und Bodenbelag-Installationen.

**Kontext:**
- Bodenleisten-Kategorie im Hauptmenü aktiv
- Collection: `/collections/bodenleisten`
- Link zu Teppichboden- und Vinylboden-Projekten

---

## 1. Audit-Durchführung (Erforderlich)

### 1.1 GraphQL Query — Bodenleisten Product Inventory

```graphql
query {
  collection(handle: "bodenleisten") {
    id
    title
    description
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
          tags
          priceRange {
            minVariantPrice {
              amount
            }
          }
          description
          variants(first: 3) {
            edges {
              node {
                title
                sku
                weight
                weightUnit
              }
            }
          }
        }
      }
    }
  }
}
```

**Erwartet:**
- Bodenleisten-Produkte nach Material (Holz, MDF, Kunststoff)
- Höhe/Profil-Typen
- Längen (z.B. 2m, 2.5m Stäbe)
- Oberflächenfinish (Weiß, Natur, gefärbt)

---

## 2. Klassifizierungs-Taxonomie (Vorläufig)

### 2.1 Material-Typen

| Material | Eigenschaften | Preis | Anwendung |
|---|---|---|---|
| **Echtholz** | Massiv, Premium, hohe Qualität | €3–€8/Laufmeter | Premium-Projekte |
| **Echtholz-Furnier** | Dünn furniert, MDF-Kern, kostengünstig | €1.50–€4/Laufmeter | Standard |
| **MDF/HDF** | Beschichtet, weiß, modern | €1–€3/Laufmeter | Budget-Projekte, Weiß |
| **Kunststoff (PVC)** | Wasserdicht, Küche/Bad | €0.80–€2/Laufmeter | Feuchträume |
| **Metall (Aluminium)** | Modern, minimalistisch | €4–€10/Laufmeter | Design-Projekte |

### 2.2 Profil-Typen

| Profil | Form | Höhe | Stil |
|---|---|---|---|
| **Standard/Sockel** | Einfach rechteckig | 40–60mm | Modern |
| **Holz-Profil** | Abgeschrägt/Profiliert | 50–80mm | Klassisch |
| **Rundstab** | Halbrund | 30–50mm | Minimalistisch |
| **Schiffsboden** | Wellen-Profil | 60–100mm | Rustikal |

### 2.3 Oberflächenfinish

| Finish | Beschreibung |
|---|---|
| **Natur** | Rohes Holz, naturbelassen |
| **Geölt** | Holzöl-Finish, matte Optik |
| **Lackiert** | Hochglanz oder Matt |
| **Weiß/Grau** | Beschichtet, moderne Farben |
| **Dunkel** | Wengé, Nussbaum, etc. |

---

## 3. Audit-Schritte

### Schritt 1: Product Inventory Abrufen
- [ ] GraphQL Query ausführen
- [ ] Gesamtanzahl Bodenleisten dokumentieren
- [ ] ACTIVE/DRAFT Status zählen

### Schritt 2: Material-Klassifizierung
- [ ] Jedes Produkt nach Material kategorisieren
- [ ] Echtholz vs. Furnier vs. MDF unterscheiden
- [ ] Aus Tags/Titel/Beschreibung extrahieren

### Schritt 3: Profil & Höhe
- [ ] Profil-Typ identifizieren
- [ ] Höhe in mm dokumentieren
- [ ] Längen (Variantenlängen) erfassen

### Schritt 4: Oberflächenfinish
- [ ] Farbe/Finish dokumentieren
- [ ] Kompatibilität mit Bodenbelags-Farben überprüfen

### Schritt 5: Kompatibilität überprüfen
- [ ] Welche Bodenleisten passen zu Teppichboden-Farben?
- [ ] Welche zu Vinylboden?
- [ ] Cross-Selling-Möglichkeiten identifizieren

---

## 4. Verwandte Dokumente

| Dokument | Bezug |
|---|---|
| SHP-012.md | Menu-Struktur (Bodenleisten-Link) |
| SHP-014.md | Teppichboden (für Farb-Kompatibilität) |
| SHP-019.md | Vinylboden (für Kompatibilität) |

---

## 5. Erwartete Findings

### Gap 1: Material-Klassifizierung fehlt
**Vermutung:** Bodenleisten sind nicht nach Material-Typ gelabelt

**Remediation (SHP-021+):** Material-Tags hinzufügen (`material:echtholz`, `material:mdf`, etc.)

### Gap 2: Kompatibilitäts-Informationen fehlend
**Vermutung:** Keine Hinweise, welche Bodenleisten zu welchen Teppichboden-Farben passen

**Remediation:** Product Bundles oder Varianten-Links erstellen

### Gap 3: Längenverfügbarkeit unklar
**Vermutung:** Variantenlängen nicht standardisiert dokumentiert

**Remediation:** SKU-Schema überprüfen, Längen-Tags hinzufügen

---

## 6. Success Criteria

| Kriterium | Ziel |
|---|---|
| Product Count | Alle aktiven Bodenleisten dokumentiert |
| Material Classification | 95%+ Material-Typ identifiziert |
| Profil-Dokumentation | Höhe/Typ für alle Produkte |
| Kompatibilität | Cross-Selling-Möglichkeiten identifiziert |

---

**Audit-Status:** READY TO EXECUTE  
**Geschätzte Dauer:** 1–2 Stunden

