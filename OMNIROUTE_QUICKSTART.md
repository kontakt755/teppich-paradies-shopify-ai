# OmniRoute Quick Start Guide

**Safe to Install ✅ | No Router Access Required ✅ | Free to Use ✅**

## 30-Second Setup

OmniRoute is a **free, local AI gateway** that provides one endpoint to 357 AI providers.

### Install & Run

Choose one method:

#### 1. **NPM (Quickest)**
```bash
npm install -g omniroute
omniroute
# Server runs on http://localhost:20128
```

#### 2. **Docker (Most Isolated)**
```bash
docker run -d -p 20128:20128 diegosouzapw/omniroute
```

#### 3. **Temporary (No Install)**
```bash
npx omniroute
```

## Verify It Works

### Option A: Bash Script
```bash
./test-omniroute.sh
```

### Option B: Node.js Test
```bash
node test-omniroute-api.js
```

### Option C: Manual Curl
```bash
# Health check
curl http://localhost:20128/health

# Ask an AI (no API key needed)
curl http://localhost:20128/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Say OK"}]
  }'

# View dashboard
open http://localhost:20128
```

## Use with Claude Code

1. Start OmniRoute (see above)
2. In Claude Code settings:
   - **API Endpoint**: `http://localhost:20128/v1`
   - **Model**: `auto` (or pick a specific one)
   - **API Key**: Leave blank (free tiers work without keys)

## Use with Other Tools

- **Cursor**: Same endpoint configuration
- **Cline**: Set `api_base` to `http://localhost:20128/v1`
- **Codex CLI**: `OPENAI_API_BASE=http://localhost:20128/v1`
- **Aider**: `--openai-api-base http://localhost:20128/v1`

## Free Tier Models (No Setup Required)

- **OpenCode Zen**: DeepSeek, Nemotron (unlimited)
- **Kilo Code**: Auto-router, Tencent Hy3
- **SiliconFlow**: DeepSeek V3.2, R1 (free tier)
- **Baidu ERNIE**: 4.0 (free forever)
- **Pollinations**: GPT, Llama, Claude (no key)
- **Cloudflare**: 50+ models (10K neurons/day)

## What OmniRoute Does

| What | Details |
|------|---------|
| **Location** | Runs locally on your machine |
| **Port** | `20128` only (configurable) |
| **Network** | Routes to selected AI providers (you choose) |
| **Costs** | Free (uses free provider tiers) |
| **Data** | Stays local; you control what goes where |
| **Router** | ✅ Safe — doesn't touch your network/router config |

## Features You Get

✅ 357 AI providers through one endpoint  
✅ 90+ free tiers built-in (~1.51B tokens/month)  
✅ Automatic fallback if a provider fails  
✅ Token compression (save 15-95% tokens)  
✅ Live dashboard at `http://localhost:20128`  
✅ Works offline with local providers  
✅ MIT licensed, open source  

## Troubleshooting

### Port 20128 Already in Use
```bash
omniroute --port 20129
# Then use http://localhost:20129/v1 in tools
```

### "Cannot find omniroute" after npm install
```bash
npm install -g omniroute --force
# Or use: npx omniroute
```

### Docker won't start
```bash
# Check if port is free
lsof -i :20128
# Kill if needed: kill -9 <PID>
# Then: docker run -d -p 20128:20128 diegosouzapw/omniroute
```

## Test Files

- `OMNIROUTE_INSTALLATION_TEST.md` — Detailed installation guide
- `test-omniroute.sh` — Bash test suite
- `test-omniroute-api.js` — Node.js test suite
- `docker-compose.omniroute.yml` — Docker Compose setup

## Learn More

- **Official Docs**: https://omniroute.online
- **GitHub**: https://github.com/diegosouzapw/omniroute
- **Discord**: https://discord.gg/U47eFqAXCn
- **Docs**: `/docs` folder in the repo

## Next Step

```bash
omniroute
# Server runs in the background
# Visit http://localhost:20128
```

---

**Questions?** Check `OMNIROUTE_INSTALLATION_TEST.md` for full details.
