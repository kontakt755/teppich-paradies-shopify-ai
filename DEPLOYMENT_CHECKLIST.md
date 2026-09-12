# ✅ Google Rating API - Deployment Checklist

Folgen Sie dieser Checkliste für eine erfolgreiche Inbetriebnahme.

## 📋 Phase 1: Lokale Vorbereitung (30 min)

- [ ] **Clone & Setup**
  ```bash
  git clone https://github.com/kontakt755/teppich-paradies-shopify-ai.git
  cd server
  npm install
  ```

- [ ] **Lokale Tests**
  ```bash
  npm run test:integration
  # Sollte: ✅ 5/5 tests passed
  ```

- [ ] **API lokal starten**
  ```bash
  npm run dev
  # Sollte: "Server running on port 3001"
  ```

- [ ] **Health Check**
  ```bash
  curl http://localhost:3001/health
  # {"status":"ok",...}
  ```

---

## 🔑 Phase 2: Google Cloud Setup (45 min)

### Credentials vorbereiten

- [ ] **Google Cloud Project erstellen**
  ```
  1. https://console.cloud.google.com/
  2. Select Project → New Project
  3. Project Name: "Teppich Paradies API"
  4. Create
  ```

- [ ] **Places API aktivieren**
  ```
  1. APIs & Services → Enable APIs
  2. Suchen: "Places API (New)"
  3. Enable
  4. Warten: ~5-10 Minuten
  ```

- [ ] **API Key erstellen**
  ```
  1. Credentials → + Create Credentials → API Key
  2. Key erstellt: AIzaSyD...
  3. Kopieren → Sichern Sie es! (wird später gebraucht)
  ```

- [ ] **API Key restringieren**
  ```
  1. Klicken Sie auf den Key
  2. API restrictions → Places API (New)
  3. Application restrictions → HTTP referrer
  4. Referrer: Add all your deployment domains:
     - *.vercel.app
     - *.railway.app  
     - teppich-paradies-google-rating.herokuapp.com
  5. Save
  ```

- [ ] **Place ID finden**
  ```
  1. https://www.google.com/maps
  2. Suchen: "Teppich Paradies Oranienburg GmbH"
  3. Öffnen Sie die Business-Seite
  4. URL: maps.google.com/.../@...z/data=!4m6!3m5!1s0x47a...ChIJ...
  5. Place ID = ChIJ... Kopieren
  ```

**Sicherheits-Checklist:**
- [ ] API Key ist beschränkt auf Places API
- [ ] API Key hat HTTP referrer Restrictions
- [ ] Place ID ist korrekt (beginnt mit ChIJ)

---

## 🔐 Phase 3: GitHub Secrets Setup (15 min)

- [ ] **GitHub Secrets öffnen**
  ```
  https://github.com/kontakt755/teppich-paradies-shopify-ai/settings/secrets/actions
  ```

- [ ] **Secret 1: GOOGLE_PLACES_API_KEY**
  ```
  Name: GOOGLE_PLACES_API_KEY
  Value: AIzaSyD...YourKeyHere...
  ```

- [ ] **Secret 2: GOOGLE_BUSINESS_PLACE_ID**
  ```
  Name: GOOGLE_BUSINESS_PLACE_ID
  Value: ChIJ...YourPlaceIdHere...
  ```

- [ ] **Secret 3: SHOPIFY_STORE_URL**
  ```
  Name: SHOPIFY_STORE_URL
  Value: https://teppich-paradies-live.myshopify.com
  ```

- [ ] **Verify Secrets**
  ```
  GitHub > Actions > Deploy Workflow > Review (sollte Secrets sehen)
  ```

---

## 🚀 Phase 4: Deployment Wählen (Varies)

### Option A: Vercel (Empfohlen - 5 min)

- [ ] **Vercel CLI installieren**
  ```bash
  npm install -g vercel
  vercel login
  # → Öffnet Browser für Auth
  ```

- [ ] **Deployen**
  ```bash
  cd server
  vercel --prod
  # → URL wird angezeigt: https://...vercel.app
  ```

- [ ] **Vercel Secrets setzen**
  ```
  Vercel Dashboard > Project > Settings > Environment Variables
  Hinzufügen:
  - GOOGLE_PLACES_API_KEY = AIzaSyD...
  - GOOGLE_BUSINESS_PLACE_ID = ChIJ...
  - SHOPIFY_STORE_URL = https://...
  ```

- [ ] **Redeploy nach Secrets**
  ```bash
  vercel --prod
  ```

**Vercel URL:** `https://your-project.vercel.app/api/store/google-rating`

---

### Option B: Railway (Einfach - 10 min)

- [ ] **Railway verbinden**
  ```
  1. https://railway.app/new
  2. "Deploy from GitHub"
  3. Authorisiere Railway
  4. Wähle: teppich-paradies-shopify-ai
  ```

- [ ] **Environment Variables setzen**
  ```
  Railway Project > Variables
  Hinzufügen:
  - GOOGLE_PLACES_API_KEY
  - GOOGLE_BUSINESS_PLACE_ID
  - SHOPIFY_STORE_URL
  ```

- [ ] **Deploy**
  ```
  Railway sollte automatisch deployen
  oder klicken Sie "Deploy" Button
  ```

**Railway URL:** `https://your-project.up.railway.app/api/store/google-rating`

---

### Option C: Heroku (Classic - 10 min)

- [ ] **Heroku CLI installieren**
  ```bash
  brew install heroku  # oder: npm install -g heroku
  heroku login
  # → Öffnet Browser für Auth
  ```

- [ ] **App erstellen**
  ```bash
  heroku create teppich-paradies-google-rating
  ```

- [ ] **Secrets setzen**
  ```bash
  heroku config:set GOOGLE_PLACES_API_KEY=AIzaSyD...
  heroku config:set GOOGLE_BUSINESS_PLACE_ID=ChIJ...
  heroku config:set SHOPIFY_STORE_URL=https://...
  ```

- [ ] **Deployen**
  ```bash
  git push heroku main
  ```

- [ ] **Logs prüfen**
  ```bash
  heroku logs --tail
  # Sollte: "Server running on port 3001"
  ```

**Heroku URL:** `https://teppich-paradies-google-rating.herokuapp.com/api/store/google-rating`

---

## ✅ Phase 5: Testing nach Deployment (10 min)

- [ ] **Health Check**
  ```bash
  curl https://your-deployed-url.com/health
  # {"status":"ok","timestamp":"..."}
  ```

- [ ] **API Test**
  ```bash
  curl https://your-deployed-url.com/api/store/google-rating
  # {"rating":4.8,"userRatingCount":347,"timestamp":"..."}
  ```

- [ ] **Browser Test**
  ```
  1. Öffnen Sie eine Produktseite im Shopify Store
  2. Suchen Sie "Google-Bewertung" (sollte mit Spinner laden)
  3. Sollte anzeigen: ★★★★★ 4,8/5 (347 Bewertungen) · Auf Google lesen
  4. Klicken Sie auf "Auf Google lesen" → Öffnet Google Business Profil
  ```

- [ ] **Browser Console prüfen (F12)**
  ```
  Sollte KEINE Errors sehen
  Ggf. Warning über deprecated module ist OK
  ```

---

## 📝 Phase 6: Frontend Integration (5 min)

- [ ] **Block ist auf allen Produktseiten**
  ```
  Prüfen: templates/product*.json
  Alle sollten haben: "tp_google_rating_UdRxKh"
  ```

- [ ] **Falls API auf anderer Domain:**
  ```liquid
  <!-- In blocks/tp-google-rating.liquid Zeile ~24 -->
  <!-- Update fetch URL: -->
  const response = await fetch('https://your-api-url.com/api/store/google-rating', {
  ```

- [ ] **Commit & Push**
  ```bash
  git add .
  git commit -m "Update API endpoint to deployed server"
  git push origin main
  ```

---

## 📊 Phase 7: Monitoring Setup (15 min)

- [ ] **UptimeRobot einrichten**
  ```
  1. https://uptimerobot.com/signup
  2. Add Monitor: HTTP(s)
  3. URL: https://your-api-url.com/health
  4. Alert Email: your@email.com
  5. Interval: 5 minutes
  6. Save
  ```

- [ ] **Sentry einrichten (Optional)**
  ```bash
  npm install @sentry/node
  # Siehe MONITORING_SETUP.md für Integration
  ```

---

## 🎉 Phase 8: Go-Live Validation (5 min)

- [ ] **Final Checklist**
  - [ ] API deployed und erreichbar
  - [ ] Health Check antwortet
  - [ ] Rating lädt auf Produktseite
  - [ ] Browser Console zeigt keine Errors
  - [ ] Google Link funktioniert
  - [ ] Monitoring aktiv (UptimeRobot)

- [ ] **Notify Team**
  ```
  📢 Google Rating API is LIVE
  - Rating lädt dynamisch von Google Business Profil
  - API URL: https://your-api-url.com/api/store/google-rating
  - Health Check: https://your-api-url.com/health
  - Monitoring: UptimeRobot (Alerts via Email)
  ```

---

## 📞 Häufige Fehler

| Problem | Lösung | Zeit |
|---------|--------|------|
| "Rating unavailable" auf Produktseite | API-Key ungültig - Prüfe Google Cloud | 5 min |
| CORS Error in Browser | SHOPIFY_STORE_URL Secret falsch | 5 min |
| Deployment timeout | npm install fehlgeschlagen - Logs prüfen | 10 min |
| API antwortet 503 | API-Key oder Place ID fehlt - Prüfe Secrets | 5 min |

---

## 🎯 Nächste Schritte nach Go-Live

1. **Wöchentlich** (auto):
   - UptimeRobot Alerts prüfen
   - Keine Meldungen = alles OK ✅

2. **Monatlich**:
   - API Logs prüfen
   - Kosten überprüfen (~$0.36 für Google API)
   - Google Rating auf Produktseite prüfen

3. **Quartalsweise**:
   - Cache-Duration optimieren
   - Performance-Metriken überprüfen
   - Cost-Optimization

---

## 📞 Emergency Support

Falls die API ausfällt:

```bash
# 1. Health Check
curl https://your-api-url.com/health

# 2. Check Logs
Provider Dashboard (Vercel/Railway/Heroku) > Logs

# 3. Verify Secrets
GitHub Settings > Secrets (sollten alle existieren)

# 4. Verify Google API
https://console.cloud.google.com/ > Quotas & Monitoring

# 5. Fallback: Verdeckte API offline Nachricht
# → Seite zeigt nichts statt Fallback-Wert (ist beabsichtigt)
```

---

**Geschätzter Gesamtaufwand:** ~2-3 Stunden (inklusive Wartezeiten)

**Zuletzt aktualisiert:** 2026-09-01
