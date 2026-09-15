# GitHub Secrets Setup für Deployment

Um die Google Rating API automatisch zu deployen, müssen Sie GitHub Secrets konfigurieren.

## 📋 Schritt-für-Schritt Setup

### 1. GitHub Repository Secrets öffnen
```
https://github.com/kontakt755/teppich-paradies-shopify-ai/settings/secrets/actions
```

### 2. Secrets hinzufügen

Klicken Sie auf "New repository secret" und fügen Sie folgende hinzu:

#### 🔑 Secret 1: GOOGLE_PLACES_API_KEY
- **Name**: `GOOGLE_PLACES_API_KEY`
- **Value**: `AIzaSyD...YourKeyHere...` (aus Google Cloud Console)
- **Beschreibung**: Kostenlos bis $200/Monat, dann ~$0.05 pro Anfrage

#### 🔑 Secret 2: GOOGLE_BUSINESS_PLACE_ID
- **Name**: `GOOGLE_BUSINESS_PLACE_ID`
- **Value**: `ChIJ...YourPlaceIdHere...` (von Google Maps)
- **Wie gefunden**:
  1. Öffnen: https://www.google.com/maps
  2. Suchen: "Teppich Paradies Oranienburg GmbH"
  3. Business-Seite öffnen
  4. URL hat format: `https://www.google.com/maps/place/ChIJ...`
  5. Copy: `ChIJ...` Teil

#### 🔑 Secret 3: SHOPIFY_STORE_URL
- **Name**: `SHOPIFY_STORE_URL`
- **Value**: `https://teppich-paradies-live.myshopify.com`
- **Quelle**: Ihr Shopify Store Admin

#### 🔑 Secret 4: HEROKU_API_KEY (Optional - nur wenn Heroku nutzen)
- **Name**: `HEROKU_API_KEY`
- **Value**: Aus `heroku auth:token` oder Heroku Account Settings
- **Nur nötig für**: Heroku Deployment

#### 🔑 Secret 5: VERCEL_TOKEN (Optional - nur wenn Vercel nutzen)
- **Name**: `VERCEL_TOKEN`
- **Value**: Aus https://vercel.com/account/tokens
- **Nur nötig für**: Vercel Deployment

---

## 🔒 Wo Sie die Werte finden

### Google Places API Key

#### A. Google Cloud Console
```
1. https://console.cloud.google.com/
2. Select Project → Erstellen Sie neues Projekt
3. APIs & Services → Enable APIs
4. Suchen: "Places API (New)"
5. Enable
6. Credentials → + Create Credentials → API Key
7. Kopieren Sie den Key
8. Restrict the key:
   - API restrictions: Places API
   - Application restrictions: HTTP referrer
   - Referrer: *.vercel.app OR *.railway.app OR *.herokuapp.com
```

### Google Business Place ID

#### B. Von Google Maps

```bash
# Methode 1: Direkt von der URL
# 1. https://www.google.com/maps
# 2. Suchen: "Teppich Paradies Oranienburg GmbH"
# 3. URL kopieren: https://www.google.com/maps/place/.../@48.65,7.51,15z/data=!4m6...ChIJ...
# 4. Place ID = ChIJ...

# Methode 2: Places API mit dem Key
curl "https://places.googleapis.com/v1/places:searchText" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: YOUR_API_KEY" \
  -d '{
    "textQuery": "Teppich Paradies Oranienburg GmbH"
  }'

# Response enthält: "name": "places/ChIJ..."
```

---

## ✅ Validieren Sie die Secrets

```bash
# Nach dem Hinzufügen der Secrets können Sie sie prüfen:

# 1. GitHub Actions testen
# → Push zu Branch oder klicken Sie "Run workflow" im Actions Tab

# 2. Logs prüfen
# → GitHub > Actions > Deploy Workflow > Logs
# → Sollte sehen: "✅ Secrets validated"

# 3. API testen
# curl https://your-deployed-url.com/api/store/google-rating
# Sollte JSON mit rating zurückgeben
```

---

## 🚀 Automatisches Deployment mit Secrets

Sobald Secrets konfiguriert sind, triggern diese GitHub Actions automatisch:

### Auf Push zu `main`:
```yaml
.github/workflows/deploy-google-rating-server.yml
├─ test: Prüft Node.js Syntax
├─ deploy-vercel: (wenn .vercel konfiguriert)
├─ deploy-railway: (wenn Railway verbunden)
└─ notify: Status-Update
```

### Manuell triggern:
```
GitHub > Actions > Deploy Google Rating API Server > Run workflow
```

---

## 🔐 Best Practices

✅ **DO:**
- Secrets regelmäßig rotieren
- API-Key mit starken Einschränkungen
- Separate Keys pro Environment (dev/prod)
- Monitoring für API-Fehler

❌ **DON'T:**
- Secrets in Code committen
- Secrets in Logs prüfen
- API-Key in Email/Chat teilen
- Fallback-Werte hardcoden

---

## 🔧 Troubleshooting

### "Secret not found in Actions"
```bash
# Secrets sind case-sensitive
# Prüfen Sie den Namen: GOOGLE_PLACES_API_KEY (nicht google_places_api_key)
```

### "API Key invalid"
```bash
# 1. Prüfen Sie den Key in Google Cloud Console
# 2. Aktivieren Sie Places API (New)
# 3. Warten Sie 5-10 Minuten nach Aktivierung
# 4. Prüfen Sie Quotas: https://console.cloud.google.com/quotas
```

### "CORS Error"
```bash
# Stellen Sie sicher, dass in Secret SHOPIFY_STORE_URL:
SHOPIFY_STORE_URL=https://teppich-paradies-live.myshopify.com
# (exakt match, einschließlich https:// und Domain)
```

### "Place not found"
```bash
# Versuchen Sie den vollständigen Namen:
# "Teppich Paradies Oranienburg GmbH"
# Und überprüfen Sie die Adresse auf Google Maps
```

---

## 📞 Support

Probleme? Prüfen Sie:
1. Alle 3 Secrets sind korrekt (GOOGLE_PLACES_API_KEY, GOOGLE_BUSINESS_PLACE_ID, SHOPIFY_STORE_URL)
2. GitHub Actions Tab auf Fehler prüfen
3. Secrets sind nicht abgelaufen
4. API-Quoten nicht überschritten: https://console.cloud.google.com/quotas

---

**Zuletzt aktualisiert**: 2026-09-01
