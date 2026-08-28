# Claude API Migration - Konkreter Aktionsplan

**Status**: Bereit zum Start  
**Start**: 28.08.2026 (Heute)  
**Ziel-Go-Live**: 01.09.2026 (Freitag Nachmittag)  
**Geschätzter Aufwand**: 2-4 Stunden Setup + Testing

---

## 📋 Heute: Setup & Vorbereitung

### 1️⃣ API Key Besorgen (5 Min)
- [ ] Gehe zu https://console.anthropic.com/account/keys
- [ ] Erstelle neuen API Key (Button "Create Key")
- [ ] Kopiere den Key (Format: `sk-ant-...`)
- [ ] Speichere ihn sicher (1Password, .env.local, etc.)

**Ergebnis**: `sk-ant-xxxxxxxxxxxxxxxxxxxxx`

### 2️⃣ Environment Setup (5 Min)

**Option A - Bash (empfohlen für schnelle Tests)**:
```bash
export ANTHROPIC_API_KEY='sk-ant-YOUR_KEY'
echo $ANTHROPIC_API_KEY  # Verify
```

**Option B - .env.local (empfohlen für persistent)**:
```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY
```

**Option C - System-wide (.bashrc/.zshrc)**:
```bash
echo "export ANTHROPIC_API_KEY='sk-ant-...'" >> ~/.bashrc
source ~/.bashrc
```

### 3️⃣ Dependencies Installieren (2 Min)

```bash
pip install anthropic
python -c "import anthropic; print('✅ Ready')"
```

### 4️⃣ Pre-Flight Checks (2 Min)

```bash
# Full validation
chmod +x api_cost_check.sh
./api_cost_check.sh

# Expected output:
# ✅ API Key found
# ✅ Python 3 environment found
# ✅ Anthropic SDK installed
# ✅ Cost comparison calculated
```

**Go/No-Go**: Alle Checks müssen ✅ sein

### 5️⃣ Demo durchführen (3 Min)

```bash
python router_api_migration.py --demo

# Expected:
# - 3 Beispiel-Queries
# - Usage-Statistiken
# - Kosten pro Request (~$0.001-0.0005)
```

**Checkpoints**:
- [ ] API Key funktioniert
- [ ] Demo läuft ohne Fehler
- [ ] Kosten zwischen $0.0005-0.001 pro Request

---

## 🧪 Morgen: Testing & Validierung

### 1️⃣ Cache-Performance Test (5 Min)

```bash
python router_api_migration.py --test-cache

# Expected output:
# Request 1: Cost $0.0010 (Cache Creation)
# Request 2-5: Cost $0.0001 each (Cache Hits!)
# Cache Hit Rate: 80%+
```

**Erfolgs-Kriterium**: Hit Rate > 70%

### 2️⃣ Cost Tracking Initialize (1 Min)

```bash
python api_cost_monitor.py --track

# Creates: ~/.claude/api_usage.db
```

### 3️⃣ Kosten-Vergleich Anzeigen (1 Min)

```bash
python api_cost_monitor.py

# Shows current vs Pro/Max plan comparison
```

**Checkpoints**:
- [ ] Cache Hit Rate > 70%
- [ ] API Cost < $0.001 pro Request
- [ ] Cost Tracking DB erstellt

### 4️⃣ Custom Query Test (5 Min)

```bash
# Test with actual Shopify theme code analysis
python router_api_migration.py --query \
  "Analyze the product card component structure and suggest improvements"

# Should return:
# - Detailed analysis
# - Usage metrics
# - Cost breakdown
```

---

## 📅 Diese Woche (Mi-Do): Staging-Integration

### Staging Environment Setup

```bash
# 1. Create staging branch
git checkout -b staging/claude-api-integration

# 2. Import router in your code
from router_api_migration import CachedRouter, RouterConfig

# 3. Replace old API calls
# Before:
# - Used separate Codex + Claude Code backends

# After:
# - Unified CachedRouter with prompt caching
config = RouterConfig()
router = CachedRouter(config)
result = router.route_request(user_query, repo_path="teppich-paradies-shopify-ai")
```

### Existing Tests Against API

```bash
# Run your test suite against new API
npm test  # or pytest, etc.

# Monitor:
# - All tests passing ✅
# - No timeout errors
# - Cache hit rate > 75%
# - Costs trending as expected
```

### Staging Validation Checklist

- [ ] All tests passing
- [ ] Cache hit rate > 75%
- [ ] Cost per request < $0.001
- [ ] No API errors or timeouts
- [ ] Response quality matches or exceeds old system
- [ ] Cost tracking working

---

## 🚀 Freitag 01.09.2026: Production Deployment

### Pre-Deployment (Freitag Morning)

```bash
# 1. Final validation
./api_cost_check.sh

# 2. Last test run
python router_api_migration.py --test-cache

# 3. Confirm costs
python api_cost_monitor.py --report monthly
```

### Deployment Checklist

- [ ] API Key configured in production env
- [ ] .env.local with ANTHROPIC_API_KEY exists
- [ ] Anthropic SDK installed (`pip install anthropic`)
- [ ] Pre-flight checks pass
- [ ] Cost tracking initialized
- [ ] Monitoring dashboard ready

### Deployment Steps (Freitag Afternoon ~14:00)

**Why Freitag Afternoon?** → Lower traffic, easy to monitor, can roll back over weekend if needed

```bash
# 1. Deploy router_api_migration.py to production
cp router_api_migration.py /production/app/

# 2. Update app to use CachedRouter
# Replace old API calls with:
from router_api_migration import CachedRouter
router = CachedRouter(config)

# 3. Keep Pro Plan Active (2-week fallback)
# Don't cancel Pro yet - keep as safety net

# 4. Monitor immediately
# Watch for:
# - API errors
# - Response times
# - Cache hit rate
```

### Deployment Success Criteria

✅ **Must Pass**:
- Zero fatal API errors (< 1%)
- Response time < 5 seconds (vs < 3 before OK)
- All features working
- No user-facing errors

✅ **Target Metrics**:
- Cache hit rate > 75%
- Cost per request < $0.001
- Monthly cost < $8

---

## 📊 Week 2-3: Monitoring & Optimization

### Daily Monitoring (5 Min)

```bash
# Every morning:
python api_cost_monitor.py --report monthly

# Check:
# - Cache hit rate trending > 75%?
# - Costs under budget?
# - Any unusual API errors?
```

### Weekly Reports

```bash
# Every Monday:
python api_cost_monitor.py --report monthly

# Document:
# - Actual vs projected costs
# - Cache effectiveness
# - Any issues or optimization opportunities
```

### Optimization Opportunities

**Week 2 - Batch API Setup**:
```bash
# For bulk weekly codebase scans
# Enable batch_api processing
# Expected: 50% additional cost reduction
```

**Week 3 - Alert Setup**:
```bash
# If costs exceed $10/month → investigate
# If cache hit rate < 50% → review strategy
# If API errors > 1% → check authentication
```

### Go/No-Go Decision (Day 14)

**Go to Cancel Pro Plan if**:
- ✅ Cache hit rate stable > 75%
- ✅ Costs stable < $8/month
- ✅ Zero operational issues
- ✅ Team confident in system

**If No-Go**:
- Keep Pro Plan active
- Investigate issues
- Optimize caching strategy
- Retry in 1 week

---

## 💰 Cost Tracking & Alerts

### Expected Costs

**Week 1**: $1.50-2.00 (ramp-up + cache building)  
**Week 2**: $1.00-1.50 (cache hits stabilizing)  
**Week 3+**: $1.00-1.50/week = $4-6/month

**Annual Projection**:
- Status Quo (Pro): $240/year
- With Claude API: ~$60-70/year
- **Savings**: $170-180/year ✅

### Alert Triggers

| Metric | Alert | Action |
|--------|-------|--------|
| Weekly cost > $3 | Warning | Review usage patterns |
| Cache hit rate < 50% | Alert | Verify caching enabled |
| API errors > 1% | Critical | Check API key & auth |
| Monthly forecast > $15 | Red Flag | Investigate anomalies |

---

## 📞 Support Contacts & Resources

### Quick Help

```bash
# API key not working?
./api_cost_check.sh --validate $ANTHROPIC_API_KEY

# Cache not working?
python router_api_migration.py --test-cache

# Costs higher than expected?
python api_cost_monitor.py --report monthly

# General help?
cat QUICK_START.md
cat CLAUDE_API_INTEGRATION.md
```

### Resources

- **Setup Guide**: `QUICK_START.md`
- **Integration Guide**: `CLAUDE_API_INTEGRATION.md`
- **Cost Analysis**: `api_cost_analysis_report.md`
- **Router Code**: `router_api_migration.py`
- **Monitoring Tool**: `api_cost_monitor.py`
- **Validation**: `api_cost_check.sh`

### Documentation

- Claude API Docs: https://docs.anthropic.com
- Prompt Caching: https://docs.anthropic.com/prompt-caching
- Batch API: https://docs.anthropic.com/batch-api

---

## ✅ Milestone Checklist

### ✅ Today (28.08.2026)
- [ ] API key obtained
- [ ] Environment setup complete
- [ ] Dependencies installed
- [ ] Pre-flight checks passed
- [ ] Demo runs successfully
- [ ] PR #15 reviewed (optional today)

### ✅ Tomorrow (29.08.2026)
- [ ] Cache test passed (>70% hit rate)
- [ ] Cost tracking initialized
- [ ] Cost comparison reviewed
- [ ] Custom query test successful
- [ ] Team briefed on next steps

### ✅ Wed-Thu (30-31.08.2026)
- [ ] Staging environment ready
- [ ] Tests passing on API backend
- [ ] Cache hit rate validated (>75%)
- [ ] Team confident in cutover

### ✅ Friday (01.09.2026)
- [ ] Final validation passed
- [ ] Deployment to production
- [ ] Pro plan kept as fallback
- [ ] Monitoring active & green

### ✅ Week 2-3 (02-15.09.2026)
- [ ] Monitoring established
- [ ] Cache hit rate stable (>75%)
- [ ] Costs stable (<$8/month)
- [ ] Go/No-Go decision made
- [ ] Pro plan cancelled (if Go)
- [ ] Batch API evaluated for further savings

---

## 🎯 Success Definition

**We Win When**:
1. ✅ Claude API fully operational in production
2. ✅ Zero user-facing impact (seamless transition)
3. ✅ Cache hit rate > 75% (consistent)
4. ✅ Monthly costs < $8 (vs $20 now)
5. ✅ Team confident maintaining system
6. ✅ Pro plan cancelled, savings realized
7. ✅ $177 annual savings locked in ✨

---

**Erstellt**: 28.08.2026  
**Für**: Teppich Paradies Shopify AI Team  
**ROI**: 7 Tage | **Einsparung**: $176,52/Jahr
