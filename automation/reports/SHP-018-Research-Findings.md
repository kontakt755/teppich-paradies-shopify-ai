# SHP-018: Ambiguous Cases Research — Findings & Manufacturer Outreach

**Status:** PHASE 1 COMPLETE — Ready for Phase 3 (Manufacturer Outreach)  
**Datum:** 2026-08-31  
**Task Type:** Manufacturer Verification & Material Classification  
**Timeline Started:** 2026-08-31

---

## Executive Summary

Zwei Teppichboden-Produkte (Nordica & Wovena) sind als "Wool & Sisal" klassifiziert, aber ohne präzise Faserzusammensetzung. Diese Research dokumentiert alle verfügbaren Daten und bereitet Hersteller-Kontakt vor.

---

## Phase 1: Lokal Datensammlung ✅ COMPLETE

### 1.1 Nordica — Produktinformation

**Aus SHP-016 Audit:**

| Feld | Wert |
|---|---|
| **Handle** | `nordica-teppichboden-400cm-500cm` |
| **Titel** | Nordica Teppichboden 400cm/500cm |
| **Status** | (nicht überprüft im aktuellen Shop) |
| **Collection** | "Wool & Sisal" (aus SHP-016) |
| **Material-Hinweis** | Wool & Sisal blend (exact % unknown) |
| **Preis** | (in SHP-016 nicht dokumentiert) |
| **Nutzungsklasse** | (in SHP-016 nicht dokumentiert) |
| **Product Type** | Teppichboden |
| **Vendor** | (zu recherchieren) |

**Status in Shop:** ⚠️ Produkt existiert nicht im Live-Shop (Search 2026-08-31 = 0 Treffer)

**Anmerkung:** Wurde in SHP-016 Audit als existierend dokumentiert, aber aktuell nicht auffindbar. Könnte sein:
1. In DRAFT Status
2. Unter anderem Handle benannt
3. Noch nicht hochgeladen

---

### 1.2 Wovena — Produktinformation

**Aus SHP-016 Audit:**

| Feld | Wert |
|---|---|
| **Handle** | `wovena-teppichboden-400cm-500cm` |
| **Titel** | Wovena Teppichboden 400cm/500cm |
| **Status** | (nicht überprüft im aktuellen Shop) |
| **Collection** | "Wool & Sisal" (aus SHP-016) |
| **Material-Hinweis** | Wool & Sisal blend (exact % unknown) |
| **Preis** | (in SHP-016 nicht dokumentiert) |
| **Nutzungsklasse** | (in SHP-016 nicht dokumentiert) |
| **Product Type** | Teppichboden |
| **Vendor** | (zu recherchieren) |

**Status in Shop:** ⚠️ Produkt existiert nicht im Live-Shop (Search 2026-08-31 = 0 Treffer)

**Anmerkung:** Analog zu Nordica — existiert in Audit-Dokumentation, aber nicht live auffindbar.

---

## Phase 2: Hersteller-Recherche ⏳ PENDING

### 2.1 Vendor-Information (zu recherchieren)

**Nordica:**
- [ ] Vendor/Supplier aus Shopify Admin Notes
- [ ] Hersteller Katalog-Nummer (falls vorhanden)
- [ ] Kontakt-Email
- [ ] Telefon (Optional)

**Wovena:**
- [ ] Vendor/Supplier aus Shopify Admin Notes
- [ ] Hersteller Katalog-Nummer (falls vorhanden)
- [ ] Kontakt-Email
- [ ] Telefon (Optional)

**Status:** ⏳ Warte auf Admin-Access für Vendor-Felder

---

## Phase 3: Manufacturer Outreach — READY

### 3.1 Email Template: Nordica Material Inquiry

```
Von: kontakt@teppich-paradies.net
An: [SUPPLIER_EMAIL]
Betreff: Material-Zusammensetzung Nordica Teppichboden — Produktklassifizierung

---

Liebe [Hersteller Name/Kundenservice],

wir katalogisieren unsere Teppichboden-Sammlung nach Faserzusammensetzung für bessere 
Kundenkommunikation und Produktsuche.

Für das Produkt **Nordica Teppichboden** (400cm/500cm, Handle: nordica-teppichboden-400cm-500cm) 
benötigen wir folgende Informationen:

**1. Faserzusammensetzung (in %):**
   - Wolle: ___ %
   - Sisal: ___ %
   - Andere Fasern: ___ % (falls vorhanden)

**2. Wolltyp:**
   - ☐ Schurwolle (virgin wool)
   - ☐ Recycling-Wolle (recycled)
   - ☐ Wollmischung
   Bitte angeben: _______________

**3. Sisal-Details:**
   - Sisal-Herkunft (Land): _______________
   - Verarbeitungstyp (gekämmt, gewebt, etc.): _______________

**4. Pflege & Haltbarkeit:**
   - Empfehlung für Reinigung: _______________
   - Nutzungsklasse nach EN 1307 (z.B. 22, 23, 31, 32): _______________
   - Verschleißklasse (Light, Normal, Heavy): _______________

**5. Sonstige Zertifizierungen:**
   - ecoVella: ☐ Ja ☐ Nein
   - Andere (Blue Angel, etc.): _______________

Diese Informationen helfen uns, das Produkt korrekt zu positionieren und Kunden 
optimal bei der Auswahl zu unterstützen.

Bitte antwortet bis zum **[2026-09-14]** (10 Geschäftstage).

Vielen Dank für eure Unterstützung!

Beste Grüße,
Teppich Paradies Team
kontakt@teppich-paradies.net
```

### 3.2 Email Template: Wovena Material Inquiry

(Identisch zu Nordica, nur Produktname ersetzen)

```
Für das Produkt **Wovena Teppichboden** (400cm/500cm, Handle: wovena-teppichboden-400cm-500cm)
...
```

---

## Klassifizierungs-Szenarien nach Response

### 4.1 Szenario A: >60% Wolle (Best Case)

**Beispiel Response:**
```
Nordica: 65% Wolle (Schurwolle), 35% Sisal
Wovena: 70% Wolle (Recycling), 30% Sisal
```

**Klassifizierung:**
```
Nordica:
  → Hauptsammlung: "Wolle"
  → Tag: material:wool-sisal-blend
  → Secondary Tag: material:sisal (25% Anteil)
  → Nutzungsklasse-Tag: (aus Response, z.B. nutzungsklasse:22)
  
Wovena:
  → Hauptsammlung: "Wolle"
  → Tag: material:wool-sisal-blend  
  → Secondary Tag: material:sisal
  → Besonderheit: eco-Hinweis (Recycling-Wolle)
```

### 4.2 Szenario B: >60% Sisal (Alternative)

**Beispiel Response:**
```
Nordica: 40% Wolle, 60% Sisal
Wovena: 35% Wolle, 65% Sisal
```

**Klassifizierung:**
```
Nordica:
  → Hauptsammlung: "Sisal & Natur"
  → Tag: material:sisal-wool-blend
  → Secondary: material:wool (40% Anteil)
  
Wovena:
  → Hauptsammlung: "Sisal & Natur"
  → Tag: material:sisal-wool-blend
  → Secondary: material:wool
```

### 4.3 Szenario C: 50/50 Balance

**Beispiel Response:**
```
Nordica: 50% Wolle, 50% Sisal
Wovena: 50% Wolle, 50% Sisal
```

**Klassifizierung (Wolle-First-Prinzip):**
```
Nordica:
  → Hauptsammlung: "Wolle" (Default für Balance)
  → Tag: material:wool-sisal-equal-blend
  → Secondary: Sisal zuweisen

Wovena:
  → Hauptsammlung: "Wolle" (Default für Balance)
  → Tag: material:wool-sisal-equal-blend  
  → Secondary: Sisal zuweisen
```

### 4.4 Szenario D: No Response / Vague Answer (Fallback)

**Situation:**
- Hersteller antwortet nicht nach 10 Tagen + Follow-up
- Oder: Vage Antwort ("hochwertige Mischung") ohne %

**Klassifizierung (Hypothese):**
```
Nordica:
  → Annahme: 60% Wolle, 40% Sisal (Marktüblich)
  → Hauptsammlung: "Wolle"
  → Tag: material:wool-sisal-blend  
  → Hinweis: "Zusammensetzung vom Hersteller nicht präzisiert"

Wovena:
  → Analog
```

---

## Vendor-Kontakt Status

### Zu Recherchieren (Phase 2)

| Produkt | Vendor-Field | Kontakt-Email | Status |
|---|---|---|---|
| **Nordica** | (aus Admin) | ⏳ Pending | ⏳ |
| **Wovena** | (aus Admin) | ⏳ Pending | ⏳ |

---

## Timeline & Meilensteine

| Phase | Schritt | Geplant | Aktuell |
|---|---|---|---|
| **1** | Lokal Datensammlung | ✅ 2026-08-31 | ✅ COMPLETE |
| **2** | Hersteller-Recherche | ⏳ 2026-09-01 | ⏳ Pending |
| **3** | Email versenden | ⏳ 2026-09-01 | ⏳ Ready to send |
| **4a** | Response-Fenster | ⏳ 2026-09-02 bis 2026-09-12 | ⏳ Waiting |
| **4b** | Follow-up (if needed) | ⏳ 2026-09-13 | ⏳ Conditional |
| **5** | Classification & Collection | ⏳ 2026-09-13 bis 2026-09-15 | ⏳ Pending |

**Total Timeline: ~10–15 Geschäftstage**

---

## Next Action Items

### Sofort (Phase 2):
1. [ ] Shopify Admin öffnen
2. [ ] Nordica → Vendor-Feld überprüfen
3. [ ] Wovena → Vendor-Feld überprüfen
4. [ ] Kontakt-Email für beide sammeln
5. [ ] Falls nicht im Admin: Legacy-Kontakte überprüfen

### Dann (Phase 3):
1. [ ] Email-Template mit Vendor-Info füllen
2. [ ] Email an beide Hersteller versenden
3. [ ] Versanddatum dokumentieren (für 10-Tage-Countdown)
4. [ ] Follow-up Reminder setzen (Tag 5 + Tag 10)

---

## Success Criteria

| Kriterium | Status |
|---|---|
| Phase 1: Lokal Datensammlung | ✅ COMPLETE |
| Phase 2: Vendor-Info gesammelt | ⏳ Pending |
| Phase 3: Email versendet | ⏳ Pending |
| Response innerhalb 10 Tage | ⏳ Waiting (10-15d window) |
| Nordica klassifiziert | ⏳ Pending |
| Wovena klassifiziert | ⏳ Pending |
| Beide Produkte in korrekte Collection | ⏳ Pending |

---

**Research Status: PHASE 1 ✅ → Ready for Phase 2 & 3**

Nächster Schritt: Vendor-Kontaktdaten sammeln aus Shopify Admin.

