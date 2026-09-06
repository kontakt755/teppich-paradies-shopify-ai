# Theme-Integration: Rollenware-Konfigurator

**Status:** 📋 Vorbereitung (Read-Only)  
**Live-Gate:** ⛔ NICHT PASSIERT – Morgen früh prüfen

---

## 1. Live-Theme identifizieren

**Live-Theme:** gid://shopify/OnlineStoreTheme/203690246478  
**Name:** preview-main-2026-09-04  
**Verifiziert:** 2026-09-05T20:11:19Z  
**Quelle:** domains/shopify/live-theme.json ✅

---

## 2. Product-Section-Template analysieren

### Zu prüfen (offline):
- [ ] Welche Product-Section wird bei Rollenware genutzt?
- [ ] Wo sitzt das Konfigurator-Element aktuell?
- [ ] Wie ist die Liquid-Struktur aufgebaut?
- [ ] Welche Shopify-Variablen sind verfügbar (product, variant, ...)?

### Vorbereitung (offline Dateien):
```
Benötigte Dateien:
- sections/product-template.liquid (oder ähnlich)
- assets/product.js (oder ähnlich)
- snippets/*.liquid (für Konfigurator-Komponenten)
```

---

## 3. Konfigurator-Komponente bauen

### HTML-Struktur (Liquid)
```liquid
<div class="rollenware-konfigurator" data-product-id="{{ product.id }}">
  <!-- Step 1: Breite wählen -->
  <div class="step step-1 active">
    <h2>Welche Breite passt zu dir?</h2>
    {% for variant in product.variants %}
      {% if variant.metafields.custom.rollenbreite %}
        <button class="width-btn" data-variant-id="{{ variant.id }}" data-width="{{ variant.metafields.custom.rollenbreite }}">
          {{ variant.metafields.custom.rollenbreite }} cm
        </button>
      {% endif %}
    {% endfor %}
  </div>

  <!-- Step 2: Länge eingeben -->
  <div class="step step-2">
    <h2>Wie viele Meter brauchst du?</h2>
    <input type="number" id="lengthInput" min="2" max="50" step="0.5" />
  </div>

  <!-- Step 3: Kaufen -->
  <div class="step step-3">
    <h2>Deine Bestellung</h2>
    <div id="priceDisplay">{{ product.price }}</div>
    <button id="addToCart">In den Warenkorb</button>
  </div>
</div>
```

### JavaScript-Logik
```javascript
// Aus rollenware-konfigurator-prototype.html portieren:
// - Step Navigation
// - Preis-Berechnung
// - Validierung
// - Cart-API Aufruf
```

### CSS-Styling
```scss
// Aus Prototyp portieren
// Mobile-First
// Responsive (375px–1440px)
```

---

## 4. Shopify-Daten-Binding

### Metafelder prüfen:
- [ ] `custom.rollenbreite` existiert auf Varianten?
- [ ] `custom.qm_pro_paket` existiert (für Paketware)?
- [ ] Preis-Struktur: €/m oder €/Paket?

### Varianten-Logik:
- Rollenware hat mehrere Breiten
- Jede Breite = 1 Variante
- SKU-Pattern: `CVEXPGR02_130` (Breite im Code?)

---

## 5. Cart-API Integration

### Shopify Forms (einfachste Lösung):
```liquid
<form action="/cart/add" method="post" id="cartForm">
  <input type="hidden" name="id" value="{{ variant.id }}" id="variantId" />
  <input type="number" name="quantity" value="1" id="quantity" />
  <button type="submit">In den Warenkorb</button>
</form>
```

### Oder: Fetch-API (für AJAX):
```javascript
fetch('/cart/add.js', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    items: [{
      id: variantId,
      quantity: 1,
      properties: {
        'Länge (m)': lengthInput.value
      }
    }]
  })
})
```

**Note:** Properties dienen nur zur Dokumentation im Order. Preis muss VOR Cart-Add korrekt sein.

---

## 6. QA-Plan (Lokal, Read-Only)

### Desktop (1024px, Chrome):
- [ ] Step 1: 3 Breiten-Buttons sichtbar
- [ ] Step 2: Längen-Input funktioniert
- [ ] Step 3: Preis korrekt berechnet
- [ ] Navigation (Zurück/Weiter) funktioniert
- [ ] Kein JavaScript-Fehler (Console)

### Mobile (390px, Chrome DevTools):
- [ ] Kein Horizontal-Scrollen
- [ ] Buttons ≥48×48px
- [ ] Preis groß/lesbar
- [ ] Input-Feld Touch-freundlich

### Validierung:
- [ ] Min 2m: Input blockiert (oder Warnung)
- [ ] Max 50m: Warnung zeigt sich
- [ ] Preis-Berechnung: 5m × 23,90€ = 119,50€ ✓

### Checkout (Lokal, kein echter Kauf):
- [ ] Produkt im Cart addiert
- [ ] Menge/Variante korrekt
- [ ] Preis im Checkout stimmt (nicht 23,90€ sondern 119,50€)

---

## 7. Abhängigkeiten & Blocker

### Vor Theme-Integration brauchen wir:
- [ ] Live-Theme-Struktur verstehen (PULL via Shopify-MCP)
- [ ] Metafeld-Struktur prüfen (QUERY via Shopify-MCP)
- [ ] Prototyp in Liquid umschreiben
- [ ] Shopify-Asset-Dateien (assets/product.js, assets/product.css)

### Keine Blocker für Read-Only Vorbereitung!

---

## 8. Handoff-Checkliste

**Bevor morgen früh geprüft wird:**

### Code-Artefakte:
- [ ] `product-konfigurator.liquid` (Komponente)
- [ ] `assets/konfigurator.js` (JavaScript)
- [ ] `assets/konfigurator.css` (Styling)
- [ ] `integration-plan.md` (Dieses Dokument)

### Dokumentation:
- [ ] Wo sitzt der Konfigurator im bestehenden Theme?
- [ ] Welche Liquid-Variablen werden benötigt?
- [ ] Welche Assets müssen geladen werden?
- [ ] Bekannte Probleme (falls vorhanden)

### Test-Ergebnisse:
- [ ] Desktop ✅
- [ ] Mobile ✅
- [ ] Validierung ✅
- [ ] Preis-Berechnung ✅

### Human Gate:
- [ ] Vor `workflow:preview` STOPP ⛔
- [ ] Vor `workflow:live` STOPP ⛔
- [ ] Deine Freigabe erforderlich

---

## 9. Zeitplan

| Phase | Aufwand | Status |
|-------|---------|--------|
| Theme-Struktur analysieren | 1h | ⏳ |
| Liquid + JS schreiben | 2h | ⏳ |
| Lokal testen | 1h | ⏳ |
| Dokumentation | 1h | ⏳ |
| **Summe** | **5h** | ⏳ |

**Note:** Diese Phase läuft nachts (Read-Only), morgen früh prüfst du.

---

**Status:** 🟡 In Vorbereitung (Read-Only)  
**Nächster Stop:** Human Gate (vor Preview)
