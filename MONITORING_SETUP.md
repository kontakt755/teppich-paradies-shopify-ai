# 📊 Monitoring & Observability Setup

Überwachen Sie die Google Rating API in Production.

## 🔍 Option 1: UptimeRobot (Kostenlos - Empfohlen)

**Kostenlos bis 50 Monitore**

### Setup
```
1. https://uptimerobot.com/signup
2. Dashboard → Add Monitoring
3. Monitor Type: HTTP(s)
4. URL: https://your-api-url.com/health
5. Monitoring Interval: 5 minutes
6. Alert Contacts: Email, SMS, Slack
7. Save
```

### Alerts konfigurieren
- Down Alert: Sofort bei Ausfallzeit
- Up Alert: Wenn Service wieder online
- Reminder Alert: Täglich bei Ausfallzeit

---

## 📈 Option 2: Sentry (Error Tracking - Kostenlos)

**50K Events/Monat kostenlos**

### Integration in Server

```javascript
// server/index.js - Oben hinzufügen
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN, // Von Sentry.io
  tracesSampleRate: 0.1, // 10% der Requests tracken
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

### Installation
```bash
npm install @sentry/node
```

### Setup
```
1. https://sentry.io/signup/
2. Create Organization
3. Create Project → Node.js
4. Copy DSN
5. Set GitHub Secret: SENTRY_DSN = https://...@...sentry.io/...
```

---

## 🔔 Option 3: LogRocket (Session Replay - Kostenlos)

**Für Frontend Debugging**

### Setup
```
1. https://logrocket.com/signup
2. Create Project
3. Get API Token
4. Add zu theme/assets/logrocket.js:
```

```javascript
// theme/assets/logrocket.js
window.LogRocket && window.LogRocket.init('your-app-id');

// Capture Google Rating errors
window.addEventListener('error', (e) => {
  if (e.message.includes('google-rating')) {
    window.LogRocket?.captureException(e);
  }
});
```

---

## 📊 Option 4: Datadog (Enterprise - Kostenlos Trial)

**Advanced Monitoring für Production**

### Setup
```bash
# 1. Install Datadog Agent
# Linux: https://app.datadoghq.com/account/settings/agent

# 2. Enable APM
dd_trace.init()

# 3. Configure Tags
DD_SERVICE=google-rating-api
DD_ENV=production
```

---

## 📋 Monitoring Checklist

### Daily (Automatisch)
- [ ] API Status: UptimeRobot Health Check
- [ ] Error Rate: Sentry Dashboard
- [ ] Response Time: <1s durchschnittlich

### Weekly (Manuell)
- [ ] API Logs prüfen (Provider Dashboard)
- [ ] Google Quota: https://console.cloud.google.com/quotas
- [ ] Error Trends in Sentry

### Monthly
- [ ] Cost Analysis:
  - Google Places API: ~$0.36 (mit Caching)
  - Deployment: $0-20 je nach Provider
  - Total: ~$0-20/mo

---

## 🚨 Alert Setup

### Critical Alerts
```
❌ API is DOWN
  → Instant Notification
  → Escalate to SMS if not ACK in 5 min

⚠️  High Error Rate (>5%)
  → Email + Slack
  → Link to Sentry for debugging

⏱️  Response Time >2s
  → Slack warning
  → Check Google API status
```

### Non-Critical
```
📊 Daily Summary
  → Email every morning
  → Uptime %, Error %, Requests count
```

---

## 🔧 Logs Interpretieren

### Health Check Response
```json
{
  "status": "ok",
  "timestamp": "2026-09-01T10:00:00Z"
}
```
✅ = API läuft

### Rating Response
```json
{
  "rating": 4.8,
  "userRatingCount": 347,
  "timestamp": "2026-09-01T10:00:00Z"
}
```
✅ = Google API antwortet

### Error Response
```json
{
  "error": "Rating unavailable"
}
```
❌ = Google API nicht erreichbar oder API-Key ungültig

---

## 📞 Troubleshooting via Logs

### "Places API returned 403"
```
Cause: API-Key ungültig oder abgelaufen
Fix:
1. Google Cloud Console prüfen
2. Quota prüfen (max 150 QPS)
3. Key regenerieren
4. Update GitHub Secret GOOGLE_PLACES_API_KEY
```

### "Request timeout"
```
Cause: Google API langsam (>5s)
Fix:
1. Versuchen Sie erneut nach 1h
2. Prüfen Sie Google Status: status.cloud.google.com
3. Erhöhen Sie Cache-Duration (ab google-rating-api.js)
```

### "CORS error in browser"
```
Cause: SHOPIFY_STORE_URL nicht korrekt
Fix:
1. Prüfe GitHub Secret: SHOPIFY_STORE_URL
2. Muss exakt match: https://teppich-paradies-live.myshopify.com
3. Kein Trailing Slash
```

---

## 💰 Cost Tracking

### Google Places API
```
Pricing: $0.05 per request (New pricing)
Current: ~24 requests/day (1h caching)
Monthly: ~730 requests = ~$36

Optimization:
- 1h cache = 24 calls/day
- If extended to 4h = 6 calls/day = $9/month
```

### Deployment Costs
```
Vercel:   $0/month (free tier) or $20+
Railway:  $5/month
Heroku:   $7+/month (Eco dyno)
AWS:      $0.20 per 1M requests
```

---

## 🚀 Monitoring Workflow

```
Day 1-7: Intensive Monitoring
- Prüfe alle 2h manuell
- Stelle sicher API stabil lädt
- Optimiere Cache-Settings

Week 2-4: Reduced Monitoring
- Daily health check via UptimeRobot
- Weekly error review
- Monthly cost analysis

Ongoing:
- Alerts via UptimeRobot
- Monthly reviews
- Quarterly optimization
```

---

## 📞 Support & Escalation

| Issue | Severity | Response Time | Escalation |
|-------|----------|----------------|-----------|
| API Down | Critical | < 5 min | Page on-call |
| High Errors | Major | < 1 hour | Review logs |
| Slow Response | Minor | < 24 hours | Check quotas |
| Cost Spike | Warning | < 1 week | Budget review |

---

## ✅ Monitoring Tools Summary

| Tool | Type | Cost | Setup Time |
|------|------|------|------------|
| UptimeRobot | Uptime | Free | 5 min |
| Sentry | Errors | Free | 15 min |
| LogRocket | Session Replay | Free | 15 min |
| Datadog | Full Stack | $0-500/mo | 30 min |

**Recommended**: UptimeRobot + Sentry (beide kostenlos, zusammen 20 min)

---

**Zuletzt aktualisiert**: 2026-09-01
