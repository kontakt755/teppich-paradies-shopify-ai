# 🚀 Claude API Migration - Quick Start Guide

## Overview
Migrate from claude.ai Pro ($20/mo, 99% blocked) to Claude API with Prompt Caching ($5.29/mo, unlimited).

**Savings: $14.71/month (73.6% reduction) | Time to ROI: 7 days**

---

## 📋 Pre-Flight Checklist

- [ ] API Key generated: https://console.anthropic.com/account/keys
- [ ] Python 3.9+ installed: `python3 --version`
- [ ] Anthropic SDK: `pip install anthropic`
- [ ] Disk space available: `df -h`
- [ ] Read access to codebase: `git status`

---

## ⚡ Quick Setup (5 minutes)

### 1. Get API Key
```bash
# Generate at: https://console.anthropic.com/account/keys
# Export it:
export ANTHROPIC_API_KEY='sk-ant-...'

# Or add to ~/.bashrc or ~/.zshrc:
echo "export ANTHROPIC_API_KEY='sk-ant-...'" >> ~/.bashrc
source ~/.bashrc
```

### 2. Run Pre-Flight Check
```bash
# Make scripts executable
chmod +x api_cost_check.sh router_api_migration.py api_cost_monitor.py

# Run checks
./api_cost_check.sh
# Output: Shows current costs + migration guide
```

### 3. Install Dependencies
```bash
pip install anthropic
# Optional: for advanced usage
pip install anthropic[cache] python-dotenv
```

### 4. Test Router with Caching
```bash
# Test 1: Demo with sample queries
python router_api_migration.py --demo

# Test 2: Cache performance test
python router_api_migration.py --test-cache

# Test 3: Custom query
python router_api_migration.py --query "How are products handled in the codebase?"
```

### 5. Initialize Cost Tracking
```bash
python api_cost_monitor.py --track
# Creates: ~/.claude/api_usage.db

# Show comparison
python api_cost_monitor.py
```

---

## 📊 Tools Provided

### 1. **api_cost_check.sh** (Bash)
Quick validation script for:
- ✅ API key verification
- ✅ Router compatibility check
- ✅ Cost simulation
- ✅ Migration guide

**Usage:**
```bash
./api_cost_check.sh                   # Full check
./api_cost_check.sh --migrate         # Migration steps
./api_cost_check.sh --cost 560        # Custom volume
./api_cost_check.sh --validate KEY    # Validate API key
```

### 2. **api_cost_monitor.py** (Python)
Cost tracking & reporting with SQLite database:
- 💾 Log all API calls automatically
- 📊 Monthly summaries & cache hit tracking
- 💰 Cost forecasting
- 📈 Usage trends

**Usage:**
```bash
python api_cost_monitor.py                # Cost comparison
python api_cost_monitor.py --track        # Initialize DB
python api_cost_monitor.py --simulate 560 # Simulate volume
python api_cost_monitor.py --report monthly  # Monthly summary
```

### 3. **router_api_migration.py** (Python)
Drop-in replacement for Claude Code Router with caching:
- 🔄 Replaces Codex + Claude Code Router
- 💾 Automatic prompt caching for repeated code analysis
- 📈 Cache hit tracking
- 💵 Cost per request monitoring

**Usage:**
```bash
python router_api_migration.py --demo         # Demo
python router_api_migration.py --test-cache   # Test cache
python router_api_migration.py --query "..."  # Custom query
```

### 4. **api_cost_analysis_report.md**
Complete cost analysis with:
- 📋 Current situation analysis
- 💰 Detailed cost comparisons
- ✅ Router compatibility assessment
- 🎯 Final recommendations
- 📈 12-month financial projections

---

## 💡 Integration Guide (Router Migration)

### Before: Separate Systems
```
User Query
    ↓
├─ Codex (Code generation)
│
├─ Claude Code (Analysis)
│
└─ Rate limiting
    ↓
❌ Blockage at 99% usage
```

### After: Unified API with Caching
```python
from router_api_migration import CachedRouter, RouterConfig

# Initialize
config = RouterConfig()
router = CachedRouter(config)

# Route request (with automatic caching)
result = router.route_request(
    user_query="Analyze my codebase",
    repo_path="teppich-paradies-shopify-ai",
    use_cache=True  # Automatic prompt caching
)

# Access response + metrics
print(f"Answer: {result['answer']}")
print(f"Cost: ${result['cost']['total']:.4f}")
print(f"Cached: {result['cached']}")  # True = cache hit!
```

### Key Differences
| Aspect | Before | After |
|--------|--------|-------|
| **Cost/Request** | $0.036 | $0.009 (75% cached) |
| **Rate Limits** | 99% blocked | None |
| **Setup Time** | Ongoing Pro payment | 2-4 hours setup |
| **Cache Support** | ❌ No | ✅ Yes (5-min ephemeral) |
| **Cost Control** | Fixed plan | Pay-as-you-go |

---

## 📈 Migration Timeline

### Phase 1: Preparation (Today - Tomorrow)
```
Day 1: Morning
├─ Generate API key
├─ Export ANTHROPIC_API_KEY
├─ Run pre-flight checks ✓ (./api_cost_check.sh)
└─ Install dependencies

Day 1: Afternoon  
├─ Run demos (python router_api_migration.py --demo)
├─ Test cache performance
├─ Initialize cost tracking
└─ Review cost analysis report

Day 2: Morning
├─ Set up staging environment
├─ Prepare test queries
└─ Document current behavior
```

### Phase 2: Testing (Day 3-4)
```
Day 3:
├─ Deploy router to staging
├─ Run existing test suite against API
├─ Monitor cache hit rate (target: >75%)
└─ Verify cost calculations

Day 4:
├─ Performance testing
├─ Load testing (simulate 140 requests/week)
├─ Error handling validation
└─ Documentation update
```

### Phase 3: Production (Day 5+)
```
Friday Afternoon (Low Traffic):
├─ Deploy to production
├─ Keep Pro plan active (2-week fallback)
├─ Monitor metrics (cache hits, costs)
└─ Alert setup

Week 2:
├─ Verify cache hit rate >75%
├─ Monitor costs (should be <$10/mo)
├─ Deactivate Pro plan if stable
└─ Enable batch API for bulk operations

Week 3+:
├─ Optimize based on real usage patterns
├─ Enable batch API (~50% additional savings)
├─ Consider self-hosted caching for 3-5 min TTL
└─ Celebrate $177/year savings! 🎉
```

---

## 🔍 Monitoring & Alerts

### Cost Monitoring (Weekly)
```bash
# Check monthly cost summary
python api_cost_monitor.py --report monthly

# Expected output:
# ✅ Total requests: 140/week
# ✅ Cache hit rate: 78%
# ✅ Total cost: $5.29/month
# ✅ Savings: $14.71 vs Pro-Plan
```

### Cache Performance (Daily)
```bash
# During staging:
python router_api_migration.py --test-cache

# Look for:
# ✅ Request 1: $0.0010 (first call, cache creation)
# ✅ Request 2-5: $0.0001 each (cache hits!)
# Expected: 80% reduction in follow-up requests
```

### Error Tracking
```bash
# Log errors to monitoring:
tail -f ~/.claude/api_usage.db

# Alert triggers:
# ⚠️ Cache hit rate < 50% (review caching strategy)
# ⚠️ Cost > $10/month (review request volume)
# ⚠️ API errors > 1% (check authentication)
```

---

## 🎯 Success Metrics

### Week 1
- ✅ Staging environment running
- ✅ 100% of existing tests passing
- ✅ Cache hit rate >70%
- ✅ Cost tracking initialized

### Week 2
- ✅ Production deployment complete
- ✅ Zero rate-limit blocking
- ✅ Cache hit rate >75% (stable)
- ✅ Monthly cost <$8

### Week 3+
- ✅ Pro plan can be cancelled
- ✅ Batch API for 50% additional savings
- ✅ $177/year savings achieved
- ✅ Team documented on new system

---

## 🆘 Troubleshooting

### Problem: API Key Invalid
```bash
# Check format
echo $ANTHROPIC_API_KEY | grep "sk-ant-"

# Get new key
# https://console.anthropic.com/account/keys

# Validate
./api_cost_check.sh --validate $ANTHROPIC_API_KEY
```

### Problem: Cache Not Working
```bash
# Check if using ephemeral cache
python router_api_migration.py --test-cache

# Expected: Request 2-5 should show cache_read_tokens > 0

# If not:
# - Verify system prompt includes cache_control
# - Check that context is >1024 tokens
# - Wait 5 minutes (ephemeral cache TTL)
```

### Problem: Costs Higher Than Expected
```bash
# Analyze by request
python api_cost_monitor.py --report monthly

# Look for:
# - Cache hit rate < 50% (optimize context)
# - Non-cached requests > 60% (verify caching is active)
# - Large output tokens (reduce response size)
```

### Problem: Rate Limit Errors
```bash
# Should NOT happen on API, but check:
# - API key has correct permissions
# - Check account status: https://console.anthropic.com
# - No concurrent requests > rate limit

# Monitor:
grep -i "rate_limit" ~/.claude/api_usage.db
```

---

## 📚 Additional Resources

### Documentation
- **Claude API Docs**: https://docs.anthropic.com
- **Prompt Caching Guide**: https://docs.anthropic.com/prompt-caching
- **Batch API**: https://docs.anthropic.com/batch-api
- **Cost Calculator**: https://console.anthropic.com/usage

### Example Code
- **router_api_migration.py**: Drop-in router replacement
- **api_cost_monitor.py**: Cost tracking & reporting
- **api_cost_check.sh**: Quick validation & setup

### Community
- **GitHub Issues**: Report bugs/feature requests
- **Anthropic Discord**: https://discord.gg/anthropic
- **Claude Docs Community**: https://docs.anthropic.com

---

## 📞 Support

### For API Issues
1. Check API key: `echo $ANTHROPIC_API_KEY`
2. Verify account status: https://console.anthropic.com
3. Check documentation: https://docs.anthropic.com
4. Contact support: https://support.anthropic.com

### For Migration Issues
1. Run pre-flight checks: `./api_cost_check.sh`
2. Review router compatibility: `python router_api_migration.py --demo`
3. Check cost simulation: `python api_cost_monitor.py --simulate 560`
4. Read full report: `api_cost_analysis_report.md`

---

## ✅ Checklist Summary

**Today**
- [ ] API key generated & exported
- [ ] Pre-flight checks passed
- [ ] Dependencies installed
- [ ] Demo ran successfully

**This Week**
- [ ] Staging environment ready
- [ ] Tests running on API
- [ ] Cache performance validated
- [ ] Production deployment scheduled

**Next Steps**
- [ ] Deploy to production Friday
- [ ] Monitor for 48 hours
- [ ] Cancel Pro plan (save $20/mo)
- [ ] Enable batch API (save 50% more)
- [ ] Document for team

---

**Status**: Ready to migrate 🚀  
**Estimated Savings**: $177/year 💰  
**Setup Time**: 2-4 hours ⏱️  
**ROI**: 7 days ⚡

---

*Last updated: August 28, 2026*  
*For Teppich Paradies Shopify AI Project*
