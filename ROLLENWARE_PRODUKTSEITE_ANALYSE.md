# Rollenware-Produktseite: Analyse & Redesign-Plan

**Datum:** 2026-09-06  
**Aufgabe:** Maximale Vereinfachung für Kunden ohne technische Komplexität  
**Status:** Analyse abgeschlossen, Implementierung folgt

---

## 1. Aktuelle Situation

### Produkt-Beispiel: Eichwald Eiche Hellgrau
- **Produkttyp:** Vinyl von der Rolle
- **Breiten:** 200 cm, 300 cm, 400 cm (Tags)
- **Preis:** 23,90 €/m (einheitlich pro Breite)
- **Konfigurator-Anforderung:** Länge × Breite = Gesamtpreis

### Bekannte Probleme (Router-Voranalyse)

| Problem | Folge | Lösung |
|---------|-------|--------|
| Zu viele visuelle Ablenkungen | Kaufabbruch, Verwirrung | Minimalismus: nur essenzielle Info |
| Komplexe Fachbegriffe ("Rollenbreite", "Meterware") | Kunden verstehen nicht, was zu tun ist | Deutsche Laiensprache: "Breite wählen", "Länge eingeben" |
| Mobile Usability nicht optimiert | Horizontales Scrollen, kleine Buttons | Vertikale Schrittführung, große Touch-Targets |
| Keine Echtzeit-Preis-Berechnung | Kaufunsicherheit, Überraschungen im Checkout | Live-Kalkulator: "Bei 5m Länge = 119,50 €" |
| Maßeingabe ohne Validierung | Falsche Bestellungen, Retouren | Min/Max-Grenzen, Warnung bei unrealistischen Werten |
| Zu viele gleichzeitige Infos | Cognitive Overload | Stufenweiser Konfigurator: Step 1 → Step 2 → Kaufen |

---

## 2. Zielgruppe & Entscheidungsprozess

### Typischer Kunde
- **Fachkenntnisgrad:** Gering bis Mittel
- **Eile:** Mittel (will schnell kaufen, keine Beratung)
- **Mobile Anteil:** Dominant (Tablets, Smartphones)
- **Kaufmotivation:** "Ich brauche Bodenbelag für mein Wohnzimmer"

### Entscheidungsschritte (sollte ≤ 2 Minuten dauern)
1. **Breite prüfen** – Welche Breite passt in meinen Raum?
2. **Länge planen** – Wie viele Meter brauche ich?
3. **Preis sehen** – Kaufe ich das?
4. **Kaufen** – In den Warenkorb

---

## 3. Redesign-Prinzipien

### Architektur: Der "3-Schritte-Konfigurator"

```
┌─────────────────────────────────────────────────┐
│ SCHRITT 1: BREITE WÄHLEN                        │
├─────────────────────────────────────────────────┤
│                                                 │
│  Wähle deine Rollenbreite:                      │
│                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ 200 cm  │  │ 300 cm  │  │ 400 cm  │        │
│  │ (beste  │  │ (besser │  │ (wenig  │        │
│  │  für    │  │  für    │  │  Fugen) │        │
│  │ Flure)  │  │ Normal) │  │         │        │
│  └─────────┘  └─────────┘  └─────────┘        │
│                  ↓ ausgewählt                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ SCHRITT 2: LÄNGE EINGEBEN                       │
├─────────────────────────────────────────────────┤
│                                                 │
│  Wie viele Meter benötigst du?                  │
│                                                 │
│  Länge: [5] m                                   │
│         └─ Wir berechnen die Breite (300 cm)   │
│            automatisch mit.                     │
│                                                 │
│  (Hinweis: üblicherweise 3–10 m für            │
│   Wohnzimmer/Flur)                             │
│                                                 │
│  ✓ Realistische Werte? Ja → Nächster Schritt   │
│  ✗ Zu klein/groß? → Warnung, aber erlaubt      │
│                                                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ SCHRITT 3: PREIS & KAUFEN                       │
├─────────────────────────────────────────────────┤
│                                                 │
│  Deine Bestellung:                              │
│  ┌───────────────────────────────────────────┐ │
│  │ Breite: 300 cm                            │ │
│  │ Länge:  5 m                               │ │
│  │ € pro m:  23,90 €                         │ │
│  │                                           │ │
│  │ GESAMTPREIS: 119,50 €                     │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌─────────────────────┐  ┌──────────────────┐ │
│  │ Im Warenkorb        │  │ Weiter shopping  │ │
│  └─────────────────────┘  └──────────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 4. Visuelle & Interaktive Richtlinien

### Mobile (Primär, <768px)
- **Buttons:** Mindestens 48×48px Touch-Target
- **Input:** Nummernfeld mit ↑/↓-Stepper, nicht nur Typing
- **Layout:** 100% Breite, kein Scrollen horizontal
- **Schriftgröße:** Mindestens 16px, besser 18px
- **Farben:** Hoher Kontrast, keine Grautöne für wichtige CTAs

### Desktop (1024px+)
- **Layout:** 2-spaltig möglich (Bild links, Konfigurator rechts)
- **Konfigurator:** Max 400px Breite, rechtsbündig
- **Preis-Box:** Sticky oben auf der rechten Seite sichtbar

### Farben & Typografie
- **CTA-Farbe:** Teppich-Paradies-Grün (bestehende Marke)
- **Überschriften:** Deutsch, aktiv ("Wähle", "Gib ein", nicht "Rollenbreite auswählen")
- **Hinweistexte:** Kurz, praktisch, keine Fachbegriffe

---

## 5. Keine Überladdungen: Was NICHT auf der Seite gehört

❌ Mehrsprachige Tabs (außer English/Deutsch minimal)  
❌ Bewertungen/Reviews (außer 1-2 oberste Highlights)  
❌ "Ähnliche Produkte" – hier nicht (ablenkt)  
❌ Zoom/360er-Ansicht – Rollenbild ist ohnehin identisch  
❌ Farbvarianten als separate Produkte im Konfigurator  
❌ "Muster bestellen" auf dieser Seite (Link reicht)  
❌ Lieferzeitangaben im Konfigurator (Checkout zeigt es)  

---

## 6. Validierungsregeln

### Längen-Input
- **Minimum:** 2 m (Sicherheit: Verschnitt)
- **Maximum:** 50 m (unrealistisch, warnen)
- **Validierung:** Echtzeit, ohne Page-Reload
- **Warnung:** "Das ist sehr lang – stimmt das?" bei >20m

### Breiten-Auswahl
- **Logik:** Ein Sku pro Breite, nicht Farbvarianten als Breiten mischen
- **Fallback:** Wenn keine Breite gewählt → Grau-Button, nicht klickbar

---

## 7. Preis-Berechnung (Realtime)

**Formel:** `Länge (m) × 100 cm/m ÷ 100 × Breite (cm) ÷ 100 × €_pro_qm`

Vereinfacht: `Länge × €_pro_m = Gesamtpreis`

**Anzeige:**
```
23,90 € pro Meter × 5 Meter = 119,50 €
```

Nicht: "€ pro m² × Fläche in Rollen" (zu technisch)

---

## 8. Checkpoint: Was ändert sich NICHT

✓ Shopify Theme Horizon bleibt unverändert  
✓ Produktdaten (SKU, Varianten) bleiben unverändert  
✓ Checkout-Logik bleibt unverändert  
✓ Bestandsverwaltung bleibt unverändert  

**Was ändert sich:**
- Layout/Styling der Product-Section (Konfigurator)
- JavaScript für Live-Preis-Berechnung
- Formularstruktur (Breite-Buttons + Länge-Input)

---

## 9. Implementierungs-Roadmap

| Schritt | Aufwand | Risiko | Abhängigkeiten |
|---------|---------|--------|-----------------|
| 1. Minimales HTML/CSS | 2h | LOW | Keine |
| 2. JavaScript (Preis-Kalkulation) | 1h | LOW | HTML |
| 3. Validierung (Min/Max/Warnung) | 1h | LOW | JS |
| 4. Responsive (Mobile 390px Test) | 1h | MEDIUM | CSS |
| 5. Theme-Integration | 1h | MEDIUM | 1-4 |
| 6. QA (Checkout-Smoke, keine Fehler) | 1h | MEDIUM | 5 |
| **Gesamt** | **7h** | **MEDIUM** | – |

---

## 10. Success Metrics

Nach Live-Schaltung prüfen:
- **Bounce-Rate auf Rollenware-PDPs:** Sollte um 10-15% sinken
- **Checkout-Abbruch:** Sollte um 5-10% sinken
- **Support-Anfragen:** "Wie konfiguriere ich die Länge?" sollten fallen
- **Scroll-Tiefe:** Sollte auf Mobile >70% der Seite sein (aktuell <40%)

---

## 11. Nächste Schritte

**Diese Analyse ist verbindlich.** Der Agent implementiert basierend auf diesem Plan:

1. ✓ Analyse abgeschlossen (diese Datei)
2. → HTML-Struktur für 3-Schritte-Konfigurator
3. → CSS (Mobile-First, Responsive)
4. → JavaScript (Preis-Kalkulation, Validierung)
5. → Tests (Mobile 390px, Desktop 1440px, Checkout-Flow)
6. → Live (npm run workflow:preview → npm run workflow:live)

---

**Nächste Aktion:** Implementierungsstart
