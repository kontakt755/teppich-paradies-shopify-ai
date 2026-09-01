# 🚀 Quick Start: Google Rating API

Schnelle Anleitung um die API zum Laufen zu bringen - ohne Details.

## ⏱️ 5 Minuten Lokal testen

```bash
# 1. Dependencies installieren
cd server
npm install

# 2. Server starten
npm run dev
# → Läuft auf http://localhost:3001

# 3. In neuer Terminal: API testen
curl http://localhost:3001/api/store/google-rating
# Response: {"rating":4.8,"userRatingCount":347,"timestamp":"..."}
```

## 🔑 API-Keys besorgen

### Google Places API Key

```
1. Gehen Sie zu: https://console.cloud.google.com/
2. Neues Projekt: "Teppich Paradies API"
3. Aktivieren: Places API (New)
4. Credentials → API Key erstellen
5. Restrict to: Places API
6. Copy den Key → GOOGLE_PLACES_API_KEY
```

### Google Business Place ID

```
1. Öffnen: https://www.google.com/maps
2. Suchen: "Teppich Paradies Oranienburg GmbH"
3. Business-Seite öffnen
4. URL: https://maps.google.com/maps/place/.../@...z/data=!4m6...ChIJ...
5. Copy: ChIJ... Teil → GOOGLE_BUSINESS_PLACE_ID
```

## 📝 Setup Secrets in GitHub

```
GitHub Repo Settings → Secrets and variables → Actions
↓
New secret → GOOGLE_PLACES_API_KEY = AIzaSyD...
New secret → GOOGLE_BUSINESS_PLACE_ID = ChIJ...
New secret → SHOPIFY_STORE_URL = https://teppich-paradies-live.myshopify.com
```

Siehe: `GITHUB_SECRETS_SETUP.md` für Details.

## 🚀 Deploy Option wählen

### Option A: Vercel (Empfohlen - kostenlos)
```bash
npm install -g vercel
cd server
vercel --prod
# → Secrets im Vercel Dashboard setzen
# → URL: https://your-project.vercel.app/api/store/google-rating
```

### Option B: Railway (Einfach)
```
1. https://railway.app/new
2. "Deploy from GitHub"
3. Wählen: teppich-paradies-shopify-ai
4. Environment Variables setzen
5. Deploy
# → URL: https://your-project.up.railway.app/api/store/google-rating
```

### Option C: Heroku
```bash
heroku create teppich-paradies-google-rating
heroku config:set GOOGLE_PLACES_API_KEY=AIzaSyD...
heroku config:set GOOGLE_BUSINESS_PLACE_ID=ChIJ...
git push heroku main
# → URL: https://teppich-paradies-google-rating.herokuapp.com/api/store/google-rating
```

## ✅ Deployment testen

```bash
# Test der API nach Deploy
curl https://your-deployed-url.com/api/store/google-rating
# Sollte JSON zurückgeben mit rating & userRatingCount

# Health Check
curl https://your-deployed-url.com/health
# {"status":"ok","timestamp":"..."}
```

## 🔗 Update Frontend

Falls die API auf anderer Domain läuft, update in `blocks/tp-google-rating.liquid`:

```javascript
// Alte Zeile (wenn API auf gleicher Domain):
const response = await fetch('/api/store/google-rating', {

// Neue Zeile (wenn API separate):
const response = await fetch('https://your-api-url.com/api/store/google-rating', {
```

## 📊 Live testen

1. Browser öffnen: Produktseite auf Shopify Store
2. Developer Console (F12)
3. Sollte sehen: Google-Bewertung lädt
4. Unter dem Rating: Anzahl der Bewertungen

Wenn nichts sichtbar:
- Prüfe Browser Console auf Errors (F12 > Console)
- Prüfe API antwortet: curl https://your-api-url.com/api/store/google-rating
- Prüfe Block ist auf Produktseite (product.json)

## 🆘 Schnelle Fixes

| Problem | Lösung |
|---------|--------|
| "Rating unavailable" | API-Key ungültig. Prüfe Google Cloud Console |
| CORS Error | SHOPIFY_STORE_URL muss exakt match (mit https://) |
| Timeout | API dauert >5s. Places API momentan langsam? |
| "Cannot find module" | npm install nicht gelaufen. `npm install` in server/ |

## 🔗 Wichtige Links

- **Setup Details**: `GOOGLE_RATING_IMPLEMENTATION.md`
- **Secrets Setup**: `GITHUB_SECRETS_SETUP.md`
- **Deployment Details**: `server/DEPLOYMENT_GUIDE.md`
- **GitHub PR**: https://github.com/kontakt755/teppich-paradies-shopify-ai/pull/22

## 📞 Was ist der nächste Schritt?

1. ✅ Lokal testen: `npm run dev` in server/
2. ✅ Google APIs aktivieren & Keys besorgen
3. ✅ GitHub Secrets setzen (siehe oben)
4. ✅ Deployment wählen (Vercel/Railway/Heroku)
5. ✅ Testen auf live Store
6. ✅ Monitoring aufsetzen (optional)

Alle Schritte sind automatisiert außer API-Keys & Deployment-Auswahl.

---

**Brauchen Sie Hilfe?** Siehe `GOOGLE_RATING_IMPLEMENTATION.md` für Troubleshooting.
