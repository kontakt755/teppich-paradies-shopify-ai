# 🚀 Grosshandel-Sync-System erweitern

## Status: BEREIT ZUM AKTIVIEREN

Das System unterstützt jetzt **beliebig viele Kategorien** des Großhändlers!

---

## 📋 Verfügbare Kategorien

### ✅ Kernsockelleisten (AKTIV)
- **Produkte:** 7
- **Varianten:** 27 (Farben)
- **Status:** Live synchronisiert

### ⏸️ Vinylboden (INAKTIV)
- **Beschreibung:** Vinyl-Bodenbeläge von der Rolle
- **Aktivierung:** `data/grosshandel-categories.json` → `"active": true`

### ⏸️ Teppichboden (INAKTIV)
- **Beschreibung:** Teppichboden verschiedener Hersteller
- **Aktivierung:** `data/grosshandel-categories.json` → `"active": true`

### ⏸️ Zubehör & Befestigung (INAKTIV)
- **Beschreibung:** Kleber, Unterlage, Profile, etc.
- **Aktivierung:** `data/grosshandel-categories.json` → `"active": true`

---

## ⚡ SCHNELLSTART

### Neue Kategorie aktivieren:

1. **Datei öffnen:**
   ```
   data/grosshandel-categories.json
   ```

2. **Bei Kategorie `"active": false` zu `"active": true` ändern**
   ```json
   {
     "id": "vinylboden",
     "name": "Vinylboden",
     "active": true  ← CHANGE THIS
   }
   ```

3. **Status prüfen:**
   ```bash
   npm run sync:categories
   ```

4. **Sync testet automatisch beim nächsten Lauf**
   - Dry-Run zeigt alle neuen Produkte
   - Live-Sync braucht Genehmigung wenn >10 Produkte

---

## 🎯 Wie das System funktioniert

```
Kategorien-Konfiguration (grosshandel-categories.json)
  ↓ (nur aktive Kategorien)
Kategorien-Loader (load-grosshandel-categories.mjs)
  ↓ (erstellt Katalog)
Grosshandel-Katalog (grosshandel-catalog.json)
  ↓ (wird synchronisiert)
GitHub Actions Workflow
  ↓ (tägl. 2 AM UTC)
Shopify Store
```

---

## 📊 Automatische Skalierung

**Jede Kategorie wird automatisch geladen mit:**
- ✅ Alle Produkte
- ✅ Alle Farben/Varianten
- ✅ Alle Preise
- ✅ Automatische SKU-Generierung
- ✅ Externe ID-Mapping

**Keine weitere Konfiguration nötig!**

---

## 🔒 Safety Rules (automatisch)

- ✅ Dry-Run Standard (keine Änderungen ohne Genehmigung)
- ✅ Genehmigung nötig wenn >10 neue Produkte
- ✅ Keine Löschungen (nur neue/updates)
- ✅ SKUs geschützt (keine Änderungen)
- ✅ Externe IDs bleiben erhalten

---

## 📝 Neue npm Scripts

```bash
# Status aller Kategorien prüfen
npm run sync:categories

# Kategorien aktivieren (edit & sync)
npm run sync:categories:activate

# Wie immer sync durchführen
npm run sync:grosshandel          # Dry-Run
npm run sync:grosshandel:live     # Mit SYNC_APPROVED=true
```

---

## 🎬 Beispiel: Vinylboden hinzufügen

1. Öffne `data/grosshandel-categories.json`
2. Ändere bei "vinylboden": `"active": false` → `"active": true`
3. Speichern
4. `npm run sync:categories` → zeigt neue Kategorien
5. Nächster automatischer Sync lädt alle Vinyl-Produkte
6. Du siehst einen Report mit allen neuen Produkten
7. Bei Genehmigung: Live-Sync erstellt sie

---

## ✅ System ist bereit!

Kategorien können jederzeit aktiviert/deaktiviert werden.
**Keine neue Infrastruktur nötig — alles funktioniert automatisch!**

