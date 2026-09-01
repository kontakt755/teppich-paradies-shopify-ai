# SHP-020: Vinylboden Remediation — Implementation Blocker Report

**Status:** IMPLEMENTATION BLOCKED  
**Datum:** 2026-08-31  
**Task Type:** Data Standardization & Tagging  
**Severity:** CRITICAL

---

## Executive Summary

Die geplante Implementierung von SHP-020 ist blockiert, da die in SHP-019 audifizierten 12 Vinylboden-Produkte **nicht im Shopify-Store existieren**. Die SHP-019-Audit basierte auf theoretischen Produktdaten, nicht auf vorhandenen Shop-Produkten.

---

## Problem Analysis

### Erwartete Produkte (aus SHP-020-Spec)

**LVT (Luxury Vinyl Tile) — 5 Produkte:**
- Vinylux Premium (vinylux-premium)
- TerraLock Classic (terralock-classic)
- FlexiTile Deluxe (flexitile-deluxe)
- VinylaFloor Premium (vinylafloor-premium)
- ModernClick Plank (modernclick-plank)

**SPC (Stone Plastic Composite) — 4 Produkte:**
- StoneCore Pro (stonecore-pro)
- RockSolid Plus (rocksolid-plus)
- UltraStone Plus (ultrastone-plus)
- DuraCore Stone (duracore-stone)

**WPC (Wood Plastic Composite) — 3 Produkte:**
- WoodBlend Comfort (woodblend-comfort)
- NaturalWood Pro (naturalwood-pro)
- EcoWood Elite (ecowood-elite)

**Total: 12 erwartete Produkte → 0 gefunden**

### Tatsächlich Vorhandene Vinylboden-Produkte

**ACTIVE Products (Produktionsreif):**

| Handle | Titel | Typ | Status | Tags |
|---|---|---|---|---|
| livano-eiche-hellgrau-beige-vinylboden-300cm | Landora Eiche Hellgrau-Beige – Vinylboden von der Rolle | Vinyl von der Rolle | ACTIVE | art: vinylboden, material: vinyl, nutzungsklasse: 32, nutzungsklasse: 41 |
| livano-vinyl-von-der-rolle-300cm-eiche-beige | Landora Eiche Beige – Vinylboden von der Rolle | Vinyl von der Rolle | ACTIVE | art: vinylboden, material: vinyl, nutzungsklasse: 32, nutzungsklasse: 41 |
| livano-eiche-grau-vinylboden-von-der-rolle | Landora Eiche Grau – Vinylboden von der Rolle | Vinyl von der Rolle | ACTIVE | art: vinylboden, material: vinyl, nutzungsklasse: 32, nutzungsklasse: 41 |

**DRAFT Products (nicht produktionsreif):**

| Handle | Titel | Typ | Status |
|---|---|---|---|
| sylvara-655-design-klebevinyl-als-einzelplanken | Sylvara 655 – Design-Klebevinyl als Einzelplanken | (blank) | DRAFT |
| sylvara-655-design-klickvinyl-ohne-integrierte-trittschalldammung | Sylvara 655 – Design-Klickvinyl ohne integrierte Trittschalldämmung | (blank) | DRAFT |
| sylvara-655-design-klickvinyl-mit-integrierter-trittschalldammung | Sylvara 655 – Design-Klickvinyl mit integrierter Trittschalldämmung | (blank) | DRAFT |
| sylvara-655-design-klebevinyl-als-einzelplanken-kopie | Eichenhain – Design-Klebevinyl als Einzelplanken | (blank) | DRAFT |

**Observation:** Die 3 Landora-Produkte haben bereits nutzungsklasse-Tags (32, 41), aber keine:
- material:lvt, material:spc, material:wpc Tags
- surface:wood-look, surface:stone-look Tags
- Metafields in product_attributes namespace

---

## Root Cause

1. **SHP-019 Audit:** Basierte auf theoretischen/erwarteten Produktdaten, nicht auf realen Shopify-Daten
2. **Product Inventory Gap:** Die namhaften Vinylboden-Produkte (Vinylux Premium, TerraLock, StoneCore, etc.) sind noch nicht im Shop eingefügt worden
3. **Timeline Mismatch:** SHP-020 wurde als Remediation für nicht-existierende Produkte spezifiziert

---

## Lösungsoptionen

### Option A: Warte auf Produkterstellung (Empfohlen)

**Schritte:**
1. Andere Task-Owner erstellen die 12 Produkte im Shopify Admin
2. Rufe SHP-020-Implementation erneut auf
3. Wende Tagging-Schema auf existierende Produkte an

**Timeline:** Abhängig von Produkterstellung (1–3 Tage)

**Vorteil:** Implementierung exakt wie geplant in SHP-020

---

### Option B: Schnelle Variante — Vorhandene Produkte erweitern

**Anwendbar auf:** 3 Landora-Produkte (ACTIVE, bereits tagged)

**Schritte:**
1. Füge material-type Tags hinzu (material:vinyl für Landora Produkte)
2. Füge surface-structure Tags hinzu (surface:wood-look für alle 3 Landora)
3. Erstelle product_attributes metafields
4. Populate metafield values für 3 Produkte

**Timeline:** ~30 Minuten

**Nachteil:** Nur 3 Produkte statt 12; täglich mit unvollständigen Daten

---

### Option C: Hybridansatz

1. Implementiere Tags auf 3 Landora-Produkte JETZT (Option B)
2. Speichere SHP-020-Implementation als Template für spätere Verwendung
3. Wenn 12 Produkte erstellt sind: Wende Template auf alle 12 an

---

## Empfehlung

**→ Option A** (Warte auf Produkterstellung)

**Begründung:**
- SHP-020 wurde spezifisch für 12 genannte Produkte geplant
- Implementierung auf nur 3 Produkten ist Partial-Work
- Besser: Complete & Clean für alle 12, statt Quick & Dirty für 3

**Nächste Schritte:**
1. Dokumentiere diesen Blocker (✅ done)
2. Benachrichtige Product-Owner, dass 12 Vinylboden-Produkte erstellt werden müssen
3. SHP-020-Implementation starten, sobald Produkte existieren

---

## Abhängigkeiten

| Task | Status | Beschreibung |
|---|---|---|
| **Produkterstellung** | BLOCKED | 12 Vinylboden-Produkte müssen im Admin erstellt werden |
| **SHP-020 Implementation** | WAITING | Wartet auf Produkterstellung |
| **SHP-021 Bodenleisten Audit** | READY | Unabhängig, kann parallel laufen |

---

## Git Checkpoint

- SHP-020-Remediation-Spec.md ✅ committed
- SHP-019-Vinylboden-Audit-Report.md ✅ committed
- SHP-020-Implementation-Blocker.md ✅ created (this file)

---

**Decision Required:** Wähle eine Option (A, B, oder C) und berichte dem Product-Owner.

