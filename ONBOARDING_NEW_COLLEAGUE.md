# 🎉 Welcome to Teppich Paradies AI Team!

**Your Setup: 5 Minutes**

## Step 1: Get the API Key (2 min)

Ask your boss (Ahmet) for the `.env.local` file or the API key.

**Option A: He gives you `.env.local`**
```bash
# Just copy it to your repo folder
cp .env.local ~/your-repo/.env.local
```

**Option B: He gives you the key verbally/Slack**
```bash
# Create .env.local yourself
cat > .env.local << 'DOTENV'
ANTHROPIC_API_KEY=sk-ant-xxxxx
CLAUDE_BUDGET_HARD_LIMIT_USD=50
DOTENV
```

## Step 2: Load the Configuration (1 min)

**On Mac/Linux:**
```bash
source .env.local
```

**On Windows PowerShell:**
```powershell
Get-Content .env.local | foreach { $name, $value = $_ -split '='; [Environment]::SetEnvironmentVariable($name, $value) }
```

Or just paste this in PowerShell:
```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-xxxxx"
$env:CLAUDE_BUDGET_HARD_LIMIT_USD = "50"
```

## Step 3: Verify Setup (2 min)

```bash
./api_cost_check.sh
```

**Expected output:**
```
OK: ANTHROPIC_API_KEY is present (value not displayed)
OK: Anthropic SDK is installed
OK: Existing deterministic workflow/router.mjs found
```

**That's it!** ✅ You're ready to use the API.

---

## 💡 How to Use It

### Analyze Code
```bash
python3 router_api_migration.py \
  --task-class B \
  --query "Explain the error handling" \
  --context-file router_api_migration.py
```

### Check Costs
```bash
python3 api_cost_monitor.py --report monthly
```

### Understand Your Tasks
- **Class A**: Local processing (no API call, free)
- **Class B**: Simple analysis (Haiku model, cheapest)
- **Class C/D**: Complex tasks (Sonnet model, stronger)

The router automatically picks the right model.

---

## ❓ FAQ

**Q: What if my API key doesn't work?**
A: Run `./api_cost_check.sh` → it will tell you exactly what's wrong

**Q: How much does this cost?**
A: ~$5-7/month for the whole team (vs $20/month for Claude Pro)

**Q: What if I hit the budget limit?**
A: All API calls stop automatically. Ask Ahmet to increase the limit.

**Q: Can I use this on my personal laptop too?**
A: Yes! Just copy `.env.local` there too.

**Q: Is my API key secure?**
A: Yes! Never leave `.env.local` in git (it's in .gitignore)

---

## 🆘 Help

- **Setup problem?** → `./api_cost_check.sh` (shows the exact issue)
- **Need stronger model?** → Tell Ahmet (he can enable Opus)
- **Budget questions?** → Ask Ahmet about the monthly limit
- **Code analysis help?** → Use `--query "Your question here"`

---

**Welcome aboard! 🚀 You're now part of the team's AI infrastructure.**
