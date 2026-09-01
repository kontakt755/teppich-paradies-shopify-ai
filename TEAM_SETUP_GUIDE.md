# 👔 Team Setup Guide - For the Boss (Ahmet)

**Status: Ready for Production (Friday 01.09.2026)**

---

## 📋 Your Checklist - Friday Morning

```
⏰ 08:00 - 10:00
  ☐ Go to https://console.anthropic.com/account/keys
  ☐ Click "Create Key"
  ☐ Copy the key (format: sk-ant-xxxxx...)
  ☐ Save somewhere safe

⏰ 10:00 - 11:00
  ☐ Create .env.local in your repo:
    
    cat > .env.local << 'DOTENV'
    ANTHROPIC_API_KEY=sk-ant-xxxxx
    CLAUDE_MONTHLY_HARD_LIMIT_USD=50
    DOTENV
  
  ☐ Load it: source .env.local
  ☐ Test: ./api_cost_check.sh ✅

⏰ 14:00 - Go Live
  ☐ python3 api_cost_monitor.py --track
  ☐ Monitoring dashboard is active
  ☐ All systems running

⏰ Monday (New Colleague)
  ☐ Send him ONBOARDING_NEW_COLLEAGUE.md
  ☐ OR send .env.local file directly
  ☐ He sets up his machine (5 min)
```

---

## 🎯 What Happens Now

### For You (Ahmet)
1. **All 5 Computers**: Same `.env.local` file
2. **Same API Key**: One key, unlimited devices
3. **One Bill**: ~$5-7/month for the whole team
4. **One Budget**: $50/month hard limit (set in .env.local)

### For New Colleague
1. **Get .env.local** from you (Slack/Email)
2. **Copy to his repo folder**
3. **Run**: `source .env.local`
4. **Test**: `./api_cost_check.sh`
5. **Done!** He can work immediately

---

## 💰 Cost Management

### Monitor Spending
```bash
# Daily (takes 30 seconds)
python3 api_cost_monitor.py --report monthly

# Expected output:
# Total cost this month: $4.23
# Budget remaining: $45.77 ✅
```

### Budget Limits

**Hard Limit** (in .env.local):
```bash
CLAUDE_MONTHLY_HARD_LIMIT_USD=50
```
- If hit: All API calls STOP immediately
- If you want more: Increase this number

**Soft Limit** (optional warning):
```bash
CLAUDE_MONTHLY_WARNING_USD=30
```
- If hit: Warning printed, but calls continue
- Good for early alerts

---

## 🔐 Security

### What's in .env.local
```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx  # YOUR KEY
CLAUDE_MONTHLY_HARD_LIMIT_USD=50  # BUDGET
```

### What NOT to do
❌ Never commit .env.local to git
❌ Never share key in Slack/Email directly
❌ Never put key in code files
✅ Always use .env.local (it's in .gitignore)

### If Key Gets Leaked
1. Go to https://console.anthropic.com/account/keys
2. Delete the old key
3. Create a new key
4. Update .env.local
5. Tell your colleague the new key

---

## 📊 What Your Team Gets

| Metric | Before (Pro Plan) | After (Claude API) |
|--------|------------------|-------------------|
| **Monthly Cost** | $20 | $5-7 |
| **Usage** | Rate-limited | Unlimited |
| **Setup Time** | N/A | 5 min |
| **Team Support** | Limited | Full |
| **Caching** | No | Yes (90% cheaper repeats) |
| **Annual Savings** | — | **$177** |

---

## ✅ Success Metrics

**Week 1**
- [ ] API is running on all machines
- [ ] Monitoring shows daily costs
- [ ] New colleague is productive

**Week 2-3**
- [ ] Costs stable below $10/month
- [ ] Zero API errors
- [ ] Team comfortable with system

**Decision Point**
- [ ] If stable: Cancel old Claude Pro plan
- [ ] Lock in $177/year savings
- [ ] Enable batch API (50% more savings possible)

---

## 🆘 Troubleshooting

### "API key not found"
```bash
# Check if .env.local exists
ls -la .env.local

# If missing, recreate it:
cat > .env.local << 'DOTENV'
ANTHROPIC_API_KEY=sk-ant-xxxxx
CLAUDE_MONTHLY_HARD_LIMIT_USD=50
DOTENV

# Then load it
source .env.local
```

### "Budget limit exceeded"
```bash
# Check current spending
python3 api_cost_monitor.py --report monthly

# Increase limit if needed
# Edit .env.local:
CLAUDE_MONTHLY_HARD_LIMIT_USD=100

# Reload
source .env.local
```

### "New colleague can't connect"
```bash
# Make sure he has:
1. .env.local in his repo folder
2. Correct API key (same as yours)
3. Ran: source .env.local
4. Ran: ./api_cost_check.sh ✅
```

---

## 📞 Support

- **Setup Issues**: `./api_cost_check.sh` (self-diagnosing)
- **Cost Questions**: `python3 api_cost_monitor.py --report monthly`
- **Feature Requests**: See CLAUDE_API_INTEGRATION.md
- **Emergency**: Keep Claude Pro as fallback for 2 weeks

---

**You're in control. Budget is yours. Team is productive. Mission accomplished.** 🚀
