# 📅 Daily Usage Guide

## Before You Start

**First time setup** (one-time):
```bash
source .env.local
```

**To verify it's loaded:**
```bash
echo $ANTHROPIC_API_KEY
# Should print: sk-ant-xxxxx...
```

---

## Typical Workflows

### 1️⃣ Analyze Your Shopify Theme

```bash
python3 router_api_migration.py \
  --task-class B \
  --query "Review the product card component for performance" \
  --context-file workflow/router.mjs
```

**What happens:**
- Automatically classifies as Class B (standard analysis)
- Uses Haiku model (fast & cheap)
- Analyzes your code
- Returns analysis + costs

---

### 2️⃣ Check Weekly Costs

**Every Monday morning:**
```bash
python3 api_cost_monitor.py --report monthly

# Output shows:
# Total requests: 47
# Cache hit rate: 78%
# Total cost: $4.23
# Budget remaining: $45.77 ✅
```

**What to look for:**
- Is cost under budget? ✅
- Is it trending down? (cache hits improving) ✅
- Any errors? (should be 0) ✅

---

### 3️⃣ Complex Analysis (Escalate to Sonnet)

```bash
python3 router_api_migration.py \
  --task-class C \
  --query "Refactor the theme architecture for performance" \
  --context-file workflow/router.mjs \
  --opus  # Use Opus for extra power
```

**When to use:**
- Complex refactoring decisions
- Architecture redesigns
- Security reviews
- When Haiku's response wasn't enough

---

### 4️⃣ Test Cache Performance

Make the same request twice within 5 minutes:

```bash
# Request 1
python3 router_api_migration.py \
  --task-class B \
  --query "Analyze error handling" \
  --context-file router_api_migration.py

# Wait 10 seconds

# Request 2 (exact same query + context)
python3 router_api_migration.py \
  --task-class B \
  --query "Analyze error handling" \
  --context-file router_api_migration.py
```

**Expected:**
- Request 1: $0.011
- Request 2: $0.001 (90% cheaper! 🎉)

---

## Task Classification (Automatic)

The router picks the right model for you:

| Task | Class | Model | Speed | Cost |
|------|-------|-------|-------|------|
| Local scripts | A | None | ⚡⚡⚡ | $0 |
| Quick questions | B | Haiku | ⚡⚡ | $0.001 |
| Code analysis | C | Sonnet | ⚡ | $0.01 |
| Complex design | D | Sonnet | ⚡ | $0.01 |

Just use your gut → router classifies automatically.

---

## Budget Management

### View Current Spending
```bash
python3 api_cost_monitor.py --report monthly
```

### Increase Budget (if needed)
Edit `.env.local`:
```bash
CLAUDE_MONTHLY_HARD_LIMIT_USD=100  # Increase from 50 to 100
```

Reload:
```bash
source .env.local
```

### View Detailed Usage
```bash
python3 api_cost_monitor.py --simulate 560
# Shows cost projection for 560 monthly requests
```

---

## Troubleshooting

### API Not Responding
```bash
# Check if key is loaded
echo $ANTHROPIC_API_KEY

# If empty:
source .env.local

# Then try again
```

### Over Budget
```bash
# Current spending?
python3 api_cost_monitor.py --report monthly

# OK to increase? Edit .env.local:
CLAUDE_MONTHLY_HARD_LIMIT_USD=100
source .env.local
```

### Cache Not Working
```bash
# Cache requires:
# 1. Same query (exact match)
# 2. Same context file
# 3. Within 5 minutes
# 4. Context > 1024 tokens

# Try with larger file:
python3 router_api_migration.py \
  --task-class B \
  --query "Your question" \
  --context-file router_api_migration.py  # Larger = better
```

---

## Pro Tips

1. **Batch similar questions** → More cache hits
2. **Use larger context files** → Cache kicks in
3. **Check costs weekly** → Stay under budget
4. **Ask for Opus only when needed** → Saves money
5. **Monitor cache hit rate** → Should trend up

---

## Quick Reference

| Task | Command |
|------|---------|
| Analyze code | `python3 router_api_migration.py --task-class B --query "..." --context-file file.py` |
| Check costs | `python3 api_cost_monitor.py --report monthly` |
| Verify setup | `./api_cost_check.sh` |
| View usage | `python3 api_cost_monitor.py` |
| Help | `python3 router_api_migration.py --help` |

---

**Questions?** Ask your boss or check ONBOARDING_NEW_COLLEAGUE.md
