# SHP-021: Bodenleisten-Audit — Inventory Blocker

**Status:** AUDIT BLOCKED  
**Datum:** 2026-08-31  
**Task Type:** Product Classification & Accessory Audit  
**Severity:** CRITICAL

---

## Executive Summary

Die geplante SHP-021 Bodenleisten-Audit ist blockiert, da **keine Bodenleisten-Produkte im Shopify-Store existieren**. Die Bodenleisten-Kategorie ist im Menü definiert, hat aber kein Produktinventar.

---

## Problem Analysis

### Durchgeführte Suchen

| Suchkriterium | Ergebnis |
|---|---|
| `collection:bodenleisten` | 0 Produkte gefunden |
| `bodenleiste` | 0 Produkte gefunden |
| `baseboard` | 0 Produkte gefunden |
| `sockelleiste` | 0 Produkte gefunden |
| ProductType: "Bodenleisten" | 0 Produkte gefunden |

**Fazit:** Keine Bodenleisten-Produkte mit beliebigen Suchkriterien identifizierbar.

---

## Root Cause

1. **Category ohne Products:** Bodenleisten-Kategorie existiert in SHP-012 Menu-Struktur (`/collections/bodenleisten`)
2. **Keine Produkterstellung:** Die erwarteten Bodenleisten-Produkte wurden noch nicht erstellt
3. **Timing Mismatch:** SHP-021 Audit wurde geplant, aber Product Inventory nicht bereitgestellt

---

## Auswirkungen

### Geplante SHP-021 Schritte (BLOCKIERT)

- [ ] ❌ Product Inventory abrufen
- [ ] ❌ Material-Klassifizierung durchführen
- [ ] ❌ Profil & Höhe dokumentieren
- [ ] ❌ Oberflächenfinish erfassen
- [ ] ❌ Kompatibilität überprüfen

---

## Abhängigkeit: SHP-020 & SHP-021 = Product Inventory Problem

Beide Audit-Tasks sind blockiert:

| Task | Status | Grund |
|---|---|---|
| **SHP-020** (Vinylboden Audit Remediation) | 🔴 BLOCKED | 12 Produkte nicht vorhanden |
| **SHP-021** (Bodenleisten Audit) | 🔴 BLOCKED | 0 Produkte vorhanden |

**Pattern:** Menü-Navigation ist definiert, aber Produktinventar nicht erstellt.

---

## Lösungsoptionen

### Option A: Erstelle Bodenleisten-Produkte ZUERST

**Schritte:**
1. Produktmanager erstellt Bodenleisten-Inventar im Shopify Admin
2. Mindestens 5–10 Produkte (verschiedene Materialien, Profile, Farben)
3. Ordne sie der Bodenleisten-Collection zu
4. Rufe SHP-021 Audit aus

**Timeline:** 1–2 Tage

**Vorteil:** Audit kann dann vollständig durchgeführt werden

---

### Option B: Pausiere Audits, arbeite an anderen Tasks

**Priorität-Umordnung:**
1. **SHP-018:** Nordica & Wovena Ambiguous Cases Research (10–15 Tage, unabhängig)
2. **Andere:** Menü-Optimierung, SEO-Verbesserungen
3. **SHP-021 later:** Wenn Bodenleisten-Produkte vorhanden sind

**Vorteil:** Zeit für Produkterstellung während andere Tasks laufen

---

### Option C: Erstelle Audit-Template (kein Execution)

**Schritte:**
1. SHP-021-Audit-Spec.md als Template speichern
2. Dokumentiere erwartete Bodenleisten-Typen
3. Starte Audit später, wenn Produkte existieren

**Vorteil:** Vorarbeit ist erledigt, aber nicht verschenkt

---

## Empfehlung

**→ Option B** (Pausiere, arbeite an SHP-018)

**Begründung:**
- SHP-020 & SHP-021 sind beide produktinventar-abhängig
- SHP-018 (Nordica/Wovena Research) ist unabhängig und zeitkritisch (10–15 Tage)
- Besser: Gleichzeitig auf Produkterstellung warten + SHP-018 vorantreiben
- Dann: SHP-020 & SHP-021 sequenziell durchführen, wenn Produkte ready

---

## Nächste Schritte (Action Items)

### Für Product Owner:
1. ⚠️ Erstelle Bodenleisten-Produktinventar (5–10 SKUs)
   - Material: Echtholz, MDF, Kunststoff
   - Profile: Standard, Holz-Profil, Rundstab
   - Farben: Natur, Weiß, Dunkel
2. ⚠️ Ordne sie Collection "bodenleisten" zu
3. ⚠️ Benachrichtige, wenn ready für Audit

### Für Claude (AI):
1. ✅ SHP-020-Implementation-Blocker.md erstellt
2. ✅ SHP-021-Bodenleisten-Audit-Blocker.md erstellt (this file)
3. ⏭️ Starte **SHP-018: Ambiguous Cases Research** (Nordica & Wovena)
   - Unabhängig von Produkterstellung
   - 10–15 Tage Timeline
   - Manufacturer Outreach erforderlich

---

## Git Status

```
SHP-020: Remediation Spec + Implementation Blocker ✅
SHP-021: Audit Spec + Audit Blocker ✅
SHP-018: Ready to start (next)
```

---

**Decision:** Warte auf Produkterstellung oder starte SHP-018 parallel?

