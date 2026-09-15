# Google Rating API - Deployment Guide

Wählen Sie eine Deployment-Option basierend auf Ihren Anforderungen.

## 🚀 Option 1: Vercel (Recommended - Serverless)

**Vorteile**: Kostenlos, Auto-Scaling, GitHub Integration  
**Kosten**: $0/mo (bis 100K API Calls)

### Setup
```bash
# 1. Vercel CLI installieren
npm install -g vercel

# 2. Mit Vercel anmelden
vercel login
# → Öffnet Browser für GitHub-Auth

# 3. Deployen
cd server
vercel --prod

# 4. Environment Variables setzen
# → Vercel Dashboard > Settings > Environment Variables
# → Hinzufügen:
#    GOOGLE_PLACES_API_KEY = AIzaSyD...
#    GOOGLE_BUSINESS_PLACE_ID = ChIJ...
#    SHOPIFY_STORE_URL = https://teppich-paradies-live.myshopify.com
```

**URL nach Deployment**: `https://your-project.vercel.app/api/store/google-rating`

---

## 🚂 Option 2: Railway (Easy & Affordable)

**Vorteile**: Einfach, Günstiger als Heroku, GitHub Integration  
**Kosten**: $5/mo (oder pay-as-you-go)

### Setup
```bash
# 1. Account erstellen
# https://railway.app/new

# 2. GitHub repo verbinden
# → Railway Dashboard > New Project > Deploy from GitHub
# → Wählen Sie: teppich-paradies-shopify-ai
# → Railway erkennt automatisch die Node.js App

# 3. Environment Variables setzen
# → Project > Variables
# → Hinzufügen:
#    GOOGLE_PLACES_API_KEY
#    GOOGLE_BUSINESS_PLACE_ID
#    SHOPIFY_STORE_URL
#    NODE_ENV=production

# 4. Deploy Button klicken
```

**URL nach Deployment**: `https://your-project.up.railway.app/api/store/google-rating`

---

## 🦸 Option 3: Heroku (Classic)

**Vorteile**: Bewährt, einfache CLI  
**Kosten**: $7/mo (Eco dyno) - ⚠️ Vercel/Railway sind günstiger!

### Setup
```bash
# 1. Heroku CLI installieren
# https://devcenter.heroku.com/articles/heroku-cli

# 2. Mit Heroku anmelden
heroku login
# → Öffnet Browser für Web-Auth

# 3. App erstellen
heroku create teppich-paradies-google-rating

# 4. Environment Variables setzen
heroku config:set GOOGLE_PLACES_API_KEY=AIzaSyD...
heroku config:set GOOGLE_BUSINESS_PLACE_ID=ChIJ...
heroku config:set SHOPIFY_STORE_URL=https://teppich-paradies-live.myshopify.com
heroku config:set NODE_ENV=production

# 5. Deployen
git push heroku main

# 6. Logs prüfen
heroku logs --tail
```

**URL nach Deployment**: `https://teppich-paradies-google-rating.herokuapp.com/api/store/google-rating`

---

## 🔐 Option 4: Self-Hosted (Linux VPS)

**Vorteile**: Volle Kontrolle  
**Kosten**: $5-20/mo (VPS)

### Setup (Ubuntu/Debian)
```bash
# 1. SSH in Server
ssh root@your-vps.com

# 2. Node.js installieren
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 3. App clonen & setuppen
cd /opt
sudo git clone https://github.com/kontakt755/teppich-paradies-shopify-ai.git
cd teppich-paradies-shopify-ai/server
sudo npm install

# 4. .env file erstellen
sudo cp .env.example .env
sudo nano .env
# → Bearbeiten Sie die Secrets

# 5. PM2 für Auto-Restart installieren
sudo npm install -g pm2
pm2 start index.js --name "google-rating-api"
pm2 startup
pm2 save

# 6. Nginx Reverse Proxy (optional)
sudo apt install -y nginx
# → Konfigurieren Sie Nginx um auf Port 3001 weiterzuleiten
```

---

## 🧪 Testing nach Deployment

```bash
# Test der API
curl https://your-deployed-url.com/api/store/google-rating

# Sollte antworten:
# {"rating":4.8,"userRatingCount":347,"timestamp":"2026-09-01T..."}

# Test mit Demo-Daten (falls API-Key ungültig)
curl https://your-deployed-url.com/health
# {"status":"ok","timestamp":"2026-09-01T..."}
```

---

## 📊 Monitoring & Alerts

### Uptime Monitoring (kostenlos)
```bash
# Verwenden Sie:
# - UptimeRobot.com (überwacht alle 5 Min)
# - Statuspage.io (öffentliches Status-Dashboard)
# - Pingdom.com (erweiterte Überwachung)

# Konfigurieren Sie:
# URL: https://your-api.com/health
# Interval: 5 minutes
# Alert Email: your@email.com
```

### Error Logging
```bash
# Die API loggt automatisch zu stdout
# Vercel/Railway/Heroku zeigen Logs im Dashboard

# Für erweiterte Überwachung:
# - Sentry.io (Error Tracking - kostenlos bis 5K Events/mo)
# - LogRocket.com (Session Replay)
# - Datadog (Enterprise Monitoring)
```

---

## 🔧 Environment Variables (Alle Optionen)

| Variable | Beispiel | Wo erhältlich |
|----------|----------|---------------|
| `GOOGLE_PLACES_API_KEY` | `AIzaSyD...` | Google Cloud Console |
| `GOOGLE_BUSINESS_PLACE_ID` | `ChIJ...` | Google Maps Search |
| `SHOPIFY_STORE_URL` | `https://teppich-paradies-live.myshopify.com` | Shopify Admin |
| `NODE_ENV` | `production` | Fest setzen |
| `PORT` | `3001` (Optional, nur für Self-Hosted) | Standard |

---

## 💰 Cost Comparison

| Provider | Kosten/Mo | Preis/API Call | Uptime | Auto-Scale |
|----------|-----------|----------------|--------|-----------|
| **Vercel** | $0-20 | $0.000005 | 99.99% | ✅ |
| **Railway** | $5+ | $0.000008 | 99.9% | ✅ |
| **Heroku** | $7+ | $0.00001 | 99.99% | ✅ |
| **AWS Lambda** | $0.20 | $0.00001667 | 99.95% | ✅ |
| **VPS** | $5-20 | $0 | 99.9% | ❌ |

**Empfehlung**: Vercel (kostenlos starten, beste Developer Experience)

---

## 🔄 Automatic Deployments mit GitHub

```yaml
# .github/workflows/deploy-google-rating-server.yml
# Automatisch testet & deployed bei jedem Push zu main
```

Status überprüfen: GitHub > Actions Tab

---

## ❌ Troubleshooting

### "ModuleNotFoundError: No module named 'express'"
```bash
# Sicherstellen, dass npm install lief
npm install
```

### "API Key invalid"
```bash
# Überprüfen Sie die Environment Variables
heroku config  # oder Vercel/Railway Dashboard
# API-Key muss mit "AIzaSy" beginnen
```

### "CORS Error in Browser"
```bash
# Update SHOPIFY_STORE_URL in Environment Variables
# Muss exakt match: https://teppich-paradies-live.myshopify.com
```

### "API Timeout"
```bash
# Places API braucht ca 1-2s
# Vercel Timeout: 30s (Standard)
# Railway Timeout: 60s
# Heroku Timeout: 30s
# Alle sollten OK sein
```

---

## 📞 Support

Probleme? Prüfen Sie:
1. Environment Variables korrekt gesetzt
2. API-Key gültig (Google Cloud Console)
3. Place ID gültig (Google Maps)
4. Logs in Provider-Dashboard
5. `/health` Endpoint antwortet

---

**Zuletzt aktualisiert**: 2026-09-01
