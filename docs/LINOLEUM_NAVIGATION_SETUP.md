# Linoleumboden Navigation Setup

## Übersicht

Diese Dokumentation beschreibt die Einrichtung der Linoleumboden-Navigation für die Startseite und die entsprechende Admin-Navigations-Konfiguration.

## Was wurde implementiert

### 1. Startseite Section (section/Startseite.liquid)
- **Neuer 4. Kategoriekasten** hinzugefügt
- Title: "Linoleumboden"
- Badge: "Naturboden"
- Description: "Elastische Linoleumböden aus Naturmaterialien – strapazierfähig, pflegeleicht und nachhaltig für jeden Raum."
- CTA: "Linoleumboden entdecken"
- Link: `{{ collections['linoleumboden'].url }}`
- Foto-Placeholder: `placeholder-linoleumboden.jpg` (bis reales Foto kommt)

**Grid-Anpassung:**
- Desktop (1200px+): 4 Spalten
- Tablet (641–1199px): 3 Spalten
- Mobile (≤640px): 1 Spalte

### 2. Startseite Template (templates/index.json)
- **Neue Produktlisten-Section** hinzugefügt: `product_list_linoleum_DxYpK2`
- Collection: `linoleumboden`
- Position: Nach Vinyl + Teppich, vor Verlegeservice
- Title: "Unsere Linoleumböden"
- Max. Produkte: 4
- Layout: 4-spaltig (Desktop), 2-spaltig (Mobile)

### 3. Collection Landing Page (theme/templates/collection-linoleumboden.liquid)
Erstellt als spezialisiertes Template mit:

**Hero Section:**
- Großes Titelbild + Tagline
- "Naturboden mit Elastizität — robust, umweltfreundlich und pflegeleicht"
- 2 CTA-Buttons: "Eigenschaften entdecken" + "Muster bestellen"

**USP-Blöcke (4):**
1. 🌿 Aus Naturmaterialien
2. ✨ Elastisch & Rutschfest
3. 🛡️ Langlebig & Pflegeleicht
4. ♻️ Umweltfreundlich & Nachhaltig

**Produktgitter:**
- Alle Linoleum-Produkte mit Badge "🌿 Naturmaterial — Elastisches Linoleum"
- Preis pro m²
- Buttons: "Verfügbare Farben" + "Muster bestellen"

**Pflege & FAQ:**
- Accordion mit Pflege-Anleitung
  - Tägliche Reinigung
  - Wasserschutz & Feuchte
  - Professionelle Verlegung
  - Langzeitpflege & Wartung
  - FAQ (4 häufige Fragen)

**Musterbestellung:**
- Produktauswahl
- Name + E-Mail
- Submit zu `/pages/muster-bestellen`

---

## Admin-Navigation: Menü-Punkt hinzufügen

### Shopify Admin Setup

1. **Admin öffnen:** [sjjyq1-6w.myshopify.com/admin](https://sjjyq1-6w.myshopify.com/admin)

2. **Navigation bearbeiten:**
   - `Themes → Customize → Navigation` (oder direkter Link)
   - Oder: `Themes → Theme → Menu settings`

3. **Menü-Punkt hinzufügen:**
   - Menu: **Header Menu** oder **Main Navigation** (je nach aktuellem Setup)
   - **+ Add menu item**
     - Label: **"Naturboden"** oder **"Linoleumboden"** (wähle eines)
     - Link: `/collections/linoleumboden`
     - Position: Nach "Vinylboden", vor "Bodenleisten" (oder nach "Teppichboden")

4. **Speichern:** Save/Publish

---

## Collection Voraussetzung

Die **`linoleumboden` Collection** muss im Shopify Admin bereits existieren:
- Admin → Products → Collections
- Collection Handle: `linoleumboden` (exakt diese Schreibweise)
- Falls nicht vorhanden: Neue Collection erstellen
  - Title: "Linoleumboden"
  - Handle: "linoleumboden"
  - Description: "Natürliche, elastische Linoleumböden aus nachhaltigen Materialien"

---

## Foto-Placeholder ersetzen

**Currentstand:**
- Startseite: `placeholder-linoleumboden.jpg`
- Collection Landing Page: Hero-Section braucht echtes Hintergrundbild

**Nächste Schritte:**
1. Foto hochladen zu Shopify Files
2. `sections/Startseite.liquid` updaten (Zeile ~428)
3. Collection-Template Hero-Hintergrund anpassen (optional, derzeit Gradient)

---

## Textvorschläge (Verkaufsfördernd, Naturprodukt-Angle)

### Startseite Kategorie-Box
- **Title:** Linoleumboden
- **Badge:** Naturboden
- **Description:** Elastische Linoleumböden aus Naturmaterialien – strapazierfähig, pflegeleicht und nachhaltig für jeden Raum.

### Hero Tagline
"Naturboden mit Elastizität — robust, umweltfreundlich und pflegeleicht für jeden Raum"

### USPs
- ✅ Aus Naturmaterialien (statt Kunststoff)
- ✅ Elastisch & rutschfest
- ✅ Langlebig & pflegeleicht
- ✅ Umweltfreundlich & nachhaltig

---

## Validation vor Deploy

Vor dem Live-Gehen prüfen:

```bash
npm run liquid:guard          # Liquid-Syntax validieren
npm run schema:guard          # Block-Schemata prüfen
npm run template:guard        # Template-Konsistenz
npm run theme:guard           # Theme-IDs & Live-Gate
npm run workflow:doctor       # Alle Blocker auf einmal
```

---

## Git Status

Folgende Dateien wurden geändert:

1. **sections/Startseite.liquid** — 4. Kasten + Grid-Anpassung
2. **templates/index.json** — Neue Linoleum-Produktlisten-Section
3. **theme/templates/collection-linoleumboden.liquid** — Neues Collection-Template
4. **docs/LINOLEUM_NAVIGATION_SETUP.md** — Diese Dokumentation

---

## Deployment Checklist

- [ ] Collection `linoleumboden` existiert in Shopify Admin
- [ ] Admin-Navigationsmenü mit Link `/collections/linoleumboden` hinzugefügt
- [ ] Foto für Startseite hochgeladen (ersetzt placeholder-linoleumboden.jpg)
- [ ] `npm run workflow:doctor` lädt ohne Fehler
- [ ] Preview-Theme aktuell (`preview → live` Kette durchlaufen)
- [ ] Startseite & Collection-Landing-Page visuell geprüft
- [ ] Muster-Formular getestet
- [ ] Text-Anpassungen ggfs. im Admin vorgenommen

---

## Hinweise

- **Keine Deploys noch** — Das Feature ist bereit zum Code-Review und zur visuellen Prüfung.
- Foto wird später vom Nutzer nachgereicht.
- Admin-Navigation muss manuell im Shopify Admin gesetzt werden (nicht im Code).
- Collection muss existieren, sonst zeigt Startseite leere Box.
