# JordanShop → Shopify API Integration

**Universelles Import-System für Produkte aus JordanShop in Shopify**

## 🎯 Überblick

Statt manueller Chrome-Automation:
- ✅ **Serverseitige GraphQL Admin API**
- ✅ **Automatische tägliche Dry-Runs** (GitHub Actions)
- ✅ **Idempotente Synchronisation** (keine Duplikate, keine Datenverluste)
- ✅ **Safety Guards** (keine Löschungen, keine SKU-Änderungen)
- ✅ **Explizite Freigabe** (Live-Sync nur auf Genehmigung)

## 🔧 Setup

### 1. Shopify Token konfigurieren

```bash
# Im GitHub Repo: Settings → Secrets and variables → Actions
# Geheimnis hinzufügen: SHOPIFY_ADMIN_TOKEN
# Wert: Dein Shopify Admin API Token (aus Shopify Admin)
```

### 2. JordanShop-Daten bereitstellen

Zwei Optionen:

**Option A: CSV-Export von JordanShop**
```bash
# Datei: data/jordan-catalog.json
# Format: JSON Array mit Artikeln (siehe Template unten)
```

**Option B: JordanShop REST API** (falls verfügbar)
```bash
# Skript erweitern in workflow/sync-jordanshop.mjs
# - loadJordanshopData() ändern
# - API-Endpunkt abfragen statt lokale Datei
```

## 📋 Datenformat

`data/jordan-catalog.json`:

```json
[
  {
    "externe_id": "ZUBDÖLK100_0004",
    "sku": "ZUBDÖLK100_0004",
    "titel": "Döllken CUBU flex life 100 Kernsockelleisten - weiß",
    "hersteller": "Döllken",
    "produkttyp": "Kernsockelleisten",
    "preis_eur": 8.50,
    "hoehe_mm": 100,
    "material": "Kunststoff",
    "farbe": "weiß RAL 9010",
    "quelle": "jordanshop.de"
  }
]
```

**Wichtig:** `externe_id` = Unveränderlicher Schlüssel (Jordan-Artikelnummer)

## 🚀 Verwendung

### Tägliche Dry-Runs (automatisch)

GitHub Actions läuft täglich um 2:00 Uhr:
- ✅ Lädt JordanShop-Daten
- ✅ Vergleicht mit Shopify
- ✅ Erstellt Report (`.sync-reports/`)
- ❌ Macht KEINE Änderungen (Dry-Run)

### Manueller Dry-Run (lokal)

```bash
SHOPIFY_ADMIN_TOKEN=your_token npm run sync:jordanshop
```

Output:
```
📊 SYNC REPORT (DRY-RUN)
━━━━━━━━━━━━━━━━━━━━━━
✨ Neue Artikel:      7
🔄 Zu aktualisieren:  3
🛑 Zu löschen:        0 (NIEMALS)
━━━━━━━━━━━━━━━━━━━━━━
📄 Report: .sync-reports/sync-1725421200000.json

ℹ️  To apply: SYNC_APPROVED=true npm run sync:jordanshop
```

### Live-Sync (explizite Freigabe)

```bash
# Lokal
SYNC_APPROVED=true SHOPIFY_ADMIN_TOKEN=your_token npm run sync:jordanshop

# GitHub Actions: Workflow manuell triggern + "approve_sync" ankreuzen
```

**Was passiert:**
- ✅ Neue Artikel als **DRAFT** anlegen
- ✅ Externe ID speichern (Metafeld `grosshandel.externe_id`)
- ✅ Bestehende Produkte idempotent aktualisieren
- ❌ NIEMALS löschen, SKUs ändern oder Varianten killen

## 🛑 Safety Rules

### Automatisches Stoppen bei:

1. **>10 neue Artikel** → Manuelle Freigabe nötig
2. **Preisrückgang >20%** → Überprüfung nötig
3. **Neue, mehrdeutige Felder** → Manueller Review
4. **Guards-Fehler** (syncpath, workflow, theme) → Abbruch

### Niemals:

- ❌ Produkte/Varianten löschen
- ❌ SKUs ändern
- ❌ Externe IDs überschreiben
- ❌ Blindes `productSet` mit unvollständigen Listen

## 📊 Reports

Nach jedem Sync: `.sync-reports/sync-{timestamp}.json`

```json
{
  "timestamp": "2026-09-04T10:00:00Z",
  "mode": "DRY-RUN",
  "summary": {
    "newArticles": 7,
    "toUpdate": 3,
    "toDelete": 0
  },
  "new": [
    {
      "titel": "Döllken CUBU flex life 100...",
      "sku": "ZUBDÖLK100_0004",
      "externe_id": "ZUBDÖLK100_0004",
      "preis_eur": 8.50
    }
  ],
  "updates": [...]
}
```

## 🔄 Workflow-Schritte

```
1. Guards (syncpath, workflow, theme)
         ↓
2. JordanShop-Daten laden
         ↓
3. Shopify-Produkte abfragen (GraphQL)
         ↓
4. Diff (Neu vs. Bestehend)
         ↓
5. Safety-Checks (>10? Preise? Felder?)
         ↓
6. Report generieren (.sync-reports/)
         ↓
7. SYNC_APPROVED=true? → Live-Sync : Dry-Run
```

## 🐛 Troubleshooting

### "Missing SHOPIFY_ADMIN_TOKEN"

```bash
# Lokal: Token setzen
export SHOPIFY_ADMIN_TOKEN=shpat_xxxxx

# GitHub: Secret in Repo-Settings konfigurieren
```

### "syncpath:guard failed"

```bash
npm run syncpath:guard
# Fehlende Dateien/Konfiguration beheben
```

### Report zeigt neue Artikel, aber keine Aktion?

```bash
# Explizit freigeben:
SYNC_APPROVED=true npm run sync:jordanshop
```

## 📝 npm-Skripte

Füge zu `package.json` hinzu:

```json
{
  "scripts": {
    "sync:jordanshop": "node workflow/sync-jordanshop.mjs",
    "sync:jordanshop:live": "SYNC_APPROVED=true node workflow/sync-jordanshop.mjs"
  }
}
```

## 🎯 Nächste Schritte

1. **Token konfigurieren** → GitHub Secrets
2. **JordanShop-Daten laden** → `data/jordan-catalog.json`
3. **Testen lokal** → `SHOPIFY_ADMIN_TOKEN=xxx npm run sync:jordanshop`
4. **GitHub Actions aktiviert** → Tägl. Dry-Runs laufen
5. **Bei Bedarf freigeben** → `SYNC_APPROVED=true` + Workflow triggern

---

**Fragen?** Siehe die Inline-Kommentare in `workflow/sync-jordanshop.mjs`.
