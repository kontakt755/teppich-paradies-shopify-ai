# SHP-018: Ambiguous Cases Research — Nordica & Wovena

**Status:** RESEARCH & MANUFACTURER OUTREACH  
**Datum:** 2026-08-31  
**Task Type:** Product Classification Verification  
**Depends On:** SHP-016 (Taxonomie Spec) ✅  
**Severity:** MEDIUM (Affects Category Completeness)

---

## Executive Summary

Zwei Produkte wurden in SHP-016 als "Tier 2: Ambiguous" klassifiziert, da ihre Faserzusammensetzung unklar ist. Beide haben Collection-Namen, die "Wool & Sisal" suggerieren, aber keine numerischen Prozentsätze in den verfügbaren Metadaten.

**Zu klären:**
- **Nordica** — Ist es Wolle-dominant oder Sisal-dominant?
- **Wovena** — Welche Prozentsätze (z.B. 50/50, 70/30)?

---

## 1. Produktinventar (SHP-014 Baseline)

### Nordica

| Feld | Wert |
|---|---|
| **Handle** | nordica |
| **Produkt-Name** | Nordica |
| **Status** | ACTIVE |
| **Collection(s)** | "Wool & Sisal" (Beschreibung unklar) |
| **Tags** | (keine `material:` Tags sichtbar) |
| **Beschreibung** | (nicht in SHP-014 dokumentiert) |
| **Preis** | (nicht dokumentiert) |

### Wovena

| Feld | Wert |
|---|---|
| **Handle** | wovena |
| **Produkt-Name** | Wovena |
| **Status** | ACTIVE |
| **Collection(s)** | "Wool & Sisal" (Beschreibung unklar) |
| **Tags** | (keine `material:` Tags sichtbar) |
| **Beschreibung** | (nicht in SHP-014 dokumentiert) |
| **Preis** | (nicht dokumentiert) |

---

## 2. Klassifizierungs-Herausforderung

### Problem: Ambiguität in der Faserzusammensetzung

**Szenario A: Wolle-dominant (z.B. 70% Wolle, 30% Sisal)**
- → Sollte zu **"Wolle"** Sammlung hinzugefügt werden
- → Sekundäre Kategorie: "Wool & Sisal Blend"
- → Pflege: Wool-Anleitung (mit Sisal-Hinweise)

**Szenario B: Sisal-dominant (z.B. 70% Sisal, 30% Wolle)**
- → Sollte zu **"Sisal & Natur"** Sammlung hinzugefügt werden
- → Sekundäre Kategorie: "Wool & Sisal Blend"
- → Pflege: Sisal-Anleitung (mit Wolle-Hinweise)

**Szenario C: Gleichgewicht (50/50)**
- → Beide Kategorien möglich
- → Empfehlung: Hersteller-Richtlinie folgen
- → Separat in "Wool & Sisal Blends" Collection

**Aktueller Status:** ❓ UNBEKANNT

---

## 3. Hersteller-Kontakt-Plan

### Phase 1: Information Gathering (Aktuelle)

**Aktion:** Shopify-Produktseiten + Admin durchsuchen

```bash
# Zu überprüfen:
1. Produktbeschreibung auf PDP
2. Admin Notes (privat)
3. Metafields (Custom)
4. Variants/SKU (enthalten Material-Hinweise?)
5. Supplier/Vendor-Feld
```

### Phase 2: Hersteller-Kontakt

**Zu versenden:**
```
Betreff: Material-Zusammensetzung Nordica & Wovena Teppiche

Liebe [Hersteller-Name],

wir katalogisieren unsere Produktsammlung nach Faserzusammensetzung.
Für die folgenden Produkte benötigen wir präzise Material-Prozentsätze:

Produkt: Nordica
- Collection-Beschreibung: "Wool & Sisal"
- Frage: Welche genauen Prozentsätze (z.B. 60% Wolle, 40% Sisal)?
- Benötigt für: SEO und Kategorie-Navigation

Produkt: Wovena
- Collection-Beschreibung: "Wool & Sisal"
- Frage: Welche genauen Prozentsätze (z.B. 70% Sisal, 30% Wolle)?
- Benötigt für: Produktkategorisierung

Bitte antwortet mit:
1. Prozentuale Faserzusammensetzung
2. Wolltyp (Schurwolle, Recycling, etc.)
3. Sisal-Herkunft und Verarbeitung
4. Pflege- und Reinigungshinweise

Danke für eure Unterstützung!

Viele Grüße,
Teppich Paradies Team
```

**Kontakt-Informationen:**
- (Aus Shopify Admin abrufen)
- Supplier-Kontakt für Nordica/Wovena
- Alternativ: Allgemeines Kundenservice-Kontakt

### Phase 3: Response-Verarbeitung

**Erwartete Antwort:**
- Faserzusammensetzung (%)
- Wolltyp (Schurwolle/Recycling)
- Sisal-Qualität
- Pflege-Details

**Timeline:**
- Versand: 2026-08-31
- Response-Fenster: 5–10 Geschäftstage
- Expected: ~2026-09-10

---

## 4. Vorläufige Klassifizierungs-Annahmen

### Annahme A: Auf Basis von Collection-Namen

**"Wool & Sisal" suggeriert:**
- Beide Fasern sind signifikant vertreten
- Keine klare Dominanz aus dem Namen

**Fallback-Logik (wenn keine Antwort):**
- Wolle-First-Ansatz: Zu **"Wolle"** Sammlung
- Begründung: In Teppichgeschäft ist Wolle-Blends häufiger als Sisal-Blends
- Sekundäre Kategorie: "Sisal-Mix" Tag hinzufügen

### Annahme B: Auf Basis von Preis

**Zu überprüfen:**
- Sisal-Produkte: Normalerweise €40–€100+
- Wolle-Produkte: Normalerweise €50–€150+
- Blends: Typischerweise €60–€120

(Preis aus SHP-014 abrufen)

---

## 5. Empfehlungen für Classification

### Nach Empfang von Hersteller-Info

**Szenario: 60%+ Wolle**
```
→ Sammlung: "Wolle" (Haupt)
→ Tag: material:wool-sisal-blend
→ Secondary: Sisal-Mix (Text-Hinweis)
→ Pflege: Wool-Standard + Sisal-Hinweise
```

**Szenario: 60%+ Sisal**
```
→ Sammlung: "Sisal & Natur" (Haupt)
→ Tag: material:sisal-wool-blend
→ Secondary: Wool (Text-Hinweis)
→ Pflege: Sisal-Standard + Wool-Hinweise
```

**Szenario: 50/50 Balance**
```
→ Sammlung: "Wolle" (Haupt, Wolle-First-Prinzip)
→ Tag: material:wool-sisal-equal-blend
→ Secondary: Sisal & Natur
→ Pflege: Kombinierte Anleitung (Wolle-Priorität)
```

---

## 6. Daten-Sammlung Checklist

- [ ] Nordica PDP durchsuchen (Beschreibung, Tags, Metafields)
- [ ] Wovena PDP durchsuchen (Beschreibung, Tags, Metafields)
- [ ] Hersteller-Kontaktdaten aus Shopify Admin abrufen
- [ ] Supplier-Email für beide Produkte identifizieren
- [ ] Preis aus SHP-014 validieren
- [ ] Admin Notes prüfen (private Klassiererungen)

---

## 7. Abhängige Aufgaben

### Nach Classification
- **SHP-019:** Collection Assignment für Nordica & Wovena
- **SHP-020:** Product-Page-Updates (Badges, Pflege-Anleitung)
- **SHP-021:** QA-Validierung der neuen Klassifizierungen

---

## 8. Nächste Schritte

1. **Sofort:** Produktseiten durchsuchen → Material-Info sammeln
2. **Tag 1:** Hersteller-Kontakt vorbereiten + versenden
3. **Tag 5–10:** Response abwarten
4. **Tag 11:** Classification auf Basis Antwort durchführen
5. **Tag 12:** SHP-019 starten (Collection Assignment)

---

**Task Owner:** Claude (AI)  
**Status:** READY FOR RESEARCH  
**Timeline:** 10–15 Geschäftstage bis Abschluss

