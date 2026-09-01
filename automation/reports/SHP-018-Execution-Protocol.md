# SHP-018: Ambiguous Cases Research — Execution Protocol

**Status:** IN PROGRESS  
**Datum:** 2026-08-31  
**Task Type:** Manufacturer Verification & Material Classification  
**Timeline:** 10–15 Geschäftstage (Manufacturer Response Window)

---

## Executive Summary

Nordica und Wovena sind zwei Teppichboden-Produkte aus der Teppichboden-Audit (SHP-014) mit **ambiguem Material**. Sie sind als "Wool & Sisal" klassifiziert, aber ohne präzise Prozentsätze. Ziel: Hersteller kontaktieren, Material-Zusammensetzung klären, dann zu korrekter Collection zuordnen.

---

## Phase 1: Datensammlung (Lokal)

### 1.1 Nordica Produktinfos (aus SHP-014)

```
Handle: nordica
Titel: Nordica
Collection-Hinweis: "Wool & Sisal"
Status: ACTIVE (aus früherer Audit)
```

### 1.2 Wovena Produktinfos (aus SHP-014)

```
Handle: wovena
Titel: Wovena
Collection-Hinweis: "Wool & Sisal"
Status: ACTIVE (aus früherer Audit)
```

### 1.3 Zu sammelnde Zusatzinfos aus Shopify Admin

**Aktion:** Überprüfe folgende Felder für beide Produkte:
- [ ] Produktbeschreibung (PDP)
- [ ] Admin Notes (Private Notizen)
- [ ] Metafields (Custom Namespace)
- [ ] Vendor/Supplier-Name
- [ ] SKU-Konvention (Material-Hinweise?)
- [ ] Preispunkt (Sisal vs. Wolle typischerweise unterschiedlich)

**Status:** ⏳ Warte auf Shopify Admin Zugriff (oder CloudFlare Worker für direkte Query)

---

## Phase 2: Hersteller-Recherche

### 2.1 Nordica — Hersteller Identifizierung

**zu klären:**
- Hersteller/Supplier Name
- Kontakt-Email
- Katalog-Referenz (falls vorhanden)

**Suchmöglichkeiten:**
1. Shopify Admin > Products > Nordica > Vendor Field
2. Admin Notes durchsuchen
3. E-Mail-Archiv nach früheren Lieferanten-Kontakten
4. Rechnungen/Bestellhistorie

**Status:** ⏳ Zu recherchieren

### 2.2 Wovena — Hersteller Identifizierung

**zu klären:**
- Hersteller/Supplier Name
- Kontakt-Email
- Katalog-Referenz (falls vorhanden)

**Status:** ⏳ Zu recherchieren

---

## Phase 3: Manufacturer Outreach

### 3.1 Email-Template: Nordica Material Inquiry

```
Betreff: Material-Zusammensetzung Nordica Teppichboden — Produktklassifizierung

Liebe [Hersteller Name/Kundenservice],

wir katalogisieren unsere Teppichboden-Sammlung nach Faserzusammensetzung für bessere
Kundenkommunikation und Produktsuche.

Für das Produkt Nordica (Handle/SKU: nordica) benötigen wir folgende Informationen:

1. **Faserzusammensetzung (in %):**
   - Wolle: ___ %
   - Sisal: ___ %
   - Andere Fasern: ___ % (falls vorhanden)

2. **Wolltyp:**
   - ☐ Schurwolle (virgin wool)
   - ☐ Recycling-Wolle (recycled)
   - ☐ Wollmischung

3. **Sisal-Details:**
   - Sisal-Herkunft (Land)
   - Verarbeitungstyp (gekämmt, gewebt, etc.)

4. **Pflege & Haltbarkeit:**
   - Pflegeanleitung (Reinigung, Fleckenbehandlung)
   - Nutzungsklasse nach EN 1307 (z.B. 22, 23, 31, 32)
   - Verschleißklasse (Light, Normal, Heavy)

Diese Informationen helfen uns, das Produkt korrekt zu positionieren und Kunden
bei der Auswahl zu unterstützen.

Bitte antwortet bis zum [DATE + 10 Tage].

Viele Grüße,
Teppich Paradies Team
kontakt@teppich-paradies.net
```

### 3.2 Email-Template: Wovena Material Inquiry

(Analog zu Nordica, nur Produktname ersetzen)

---

## Phase 4: Response-Verarbeitung

### 4.1 Erwartete Antworten

**Best Case:** Hersteller antwortet mit präzisen %-Angaben
```
Nordica Zusammensetzung: 60% Wolle, 40% Sisal
Wolltyp: Schurwolle
Sisal: Indonesien, hochwertig
Nutzungsklasse: 22
```

**Incomplete Case:** Hersteller antwortet vage
```
"Unser Nordica ist eine hochwertige Wolle-Sisal-Mischung"
(Keine exakten %)
```

**No Response Case:** Hersteller antwortet nicht
```
Timeline: 10 Tage Wartezeit
Follow-up: 1× Reminder nach 5 Tagen
Fallback: Klassifizierungshypothese basierend auf Collection-Name + Preis
```

### 4.2 Klassifizierungs-Logik nach Response

**Szenario 1: >60% Wolle**
```
→ Hauptsammlung: "Wolle"
→ Tag: material:wool-sisal-blend
→ Sekundär: Material:sisal
→ Nutzungsklasse-Tag hinzufügen
```

**Szenario 2: >60% Sisal**
```
→ Hauptsammlung: "Sisal & Natur"
→ Tag: material:sisal-wool-blend
→ Sekundär: material:wool
→ Nutzungsklasse-Tag hinzufügen
```

**Szenario 3: 50/50 Balance**
```
→ Hauptsammlung: "Wolle" (Wolle-First-Prinzip)
→ Tag: material:wool-sisal-equal-blend
→ Sekundär: Sisal & Natur zuweisen
→ Nutzungsklasse-Tag hinzufügen
```

**Szenario 4: No Response / Vague Answer**
```
→ Fallback-Hypothese: Wolle-First (Marktüblich)
→ Tag: material:wool-sisal-blend
→ Hinweis: "Zusammensetzung vom Hersteller nicht präzisiert"
→ Nutzungsklasse aus Beschreibung schätzen
```

---

## Phase 5: Collection Assignment

### 5.1 Nach Klassifizierung

**Nordica nach Classification:**
```
Aktuell: Nicht explizit in Collection
Neu: Zu korrekter Collection hinzufügen
  - Falls >60% Wolle → "wolle" Collection
  - Falls >60% Sisal → "sisal-natur" Collection
  - Falls 50/50 → "wolle" Collection (Default)
```

**Wovena nach Classification:**
(Analog)

### 5.2 QA-Check nach Collection Assignment

- [ ] Beide Produkte in exakt 1 Hauptsammlung
- [ ] Sekundäre Material-Tags korrekt
- [ ] Nutzungsklasse-Tags vorhanden
- [ ] Product Page Updates (Care Instructions, Badge)

---

## Timeline & Milestones

| Schritt | Geschätzt | Status |
|---|---|---|
| **Phase 1:** Lokal Daten sammeln | 1 Tag | ⏳ Pending |
| **Phase 2:** Hersteller recherchieren | 1 Tag | ⏳ Pending |
| **Phase 3:** Email versenden | 1 Tag | ⏳ Pending |
| **Phase 4a:** Manufacturer Response Window | 5–10 Tage | ⏳ Waiting |
| **Phase 4b:** Follow-up (if needed) | 2 Tage | ⏳ Conditional |
| **Phase 5:** Classification & Collection Assignment | 1 Tag | ⏳ Pending |
| **QA & Validation** | 1 Tag | ⏳ Pending |

**Total: ~10–15 Geschäftstage**

---

## Blockers & Risks

### Risk 1: Manufacturer No Response
**Probability:** Medium (30%)  
**Mitigation:** Fallback-Klassifizierung nach Preis + Collection-Name  
**Action:** 1× Follow-up Email nach 5 Tagen

### Risk 2: Vague Response (kein %-Angaben)
**Probability:** High (50%)  
**Mitigation:** Weitere Fragen basierend auf Response  
**Action:** Klassifizierung nach best guess + Dokumentation

### Risk 3: Produkte bereits in Sammlungen
**Probability:** Medium (40%)  
**Impact:** Müssen ggf. umzuordnen (Low Risk)  
**Action:** Überprüfe vorher in Shopify Admin

---

## Dokumentation & Outputs

### Output 1: SHP-018-Research-Findings.md
Alle gesammelten Daten + Manufacturer Responses

### Output 2: SHP-018-Classification-Decision.md
Endgültige Klassifizierung + Collection Assignment

### Output 3: Shopify Updates (Implementation)
- Tags hinzufügen
- Collections zuordnen
- PDP Update (Care Instructions)

---

## Next Steps

### Sofort (Phase 1):
1. Nordica & Wovena Info aus Shopify Admin sammeln
2. Vendor/Supplier aus Admin Notes recherchieren
3. Kontakt-Email zusammenstellen

### Tag 1–2:
1. Email an Hersteller versenden
2. Dokumentiere Versanddatum
3. Setze Follow-up Reminder (Tag 5 & 10)

### Tag 3–10:
1. Warten auf Response
2. Bei Response: Sofort verarbeiten + Klassifizierung aktualisieren

### Tag 11–15:
1. Classification finalisieren (auch wenn No Response)
2. Collections assignment durchführen
3. QA validieren
4. Fertig für SHP-015 Collection Assignment Phase 2

---

## Success Criteria

| Kriterium | Ziel |
|---|---|
| Material-Prozentsätze geklärt | 80% Probability (Best Effort) |
| Nordica korrekt klassifiziert | ✓ In exakt 1 Collection |
| Wovena korrekt klassifiziert | ✓ In exakt 1 Collection |
| Material-Tags vorhanden | ✓ material:wool-sisal-blend oder ähnlich |
| Timeline | ✓ Komplett in 15 Tagen |

---

**Status: READY TO BEGIN**  
**Next Action:** Sammle Produktinfos aus Shopify Admin

