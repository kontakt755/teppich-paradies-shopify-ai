# OmniRoute Installation Test

**Status**: Safe to Install ✅

## What is OmniRoute?

OmniRoute is a **free, open-source AI gateway** that:
- Routes requests to 357 AI providers (Claude, GPT, Gemini, etc.)
- Requires **zero configuration** — works out of the box
- Runs locally on `http://localhost:20128`
- Provides 90+ free tiers built-in (~1.51B tokens/month)
- Compatible with Claude Code, Cursor, Cline, and OpenAI-compatible tools
- **Does NOT touch your router or network** — it's just a local HTTP server

## Installation Methods

### 1. **NPM (Recommended for Quick Test)**
```bash
npm install -g omniroute
omniroute  # Starts server on http://localhost:20128
```

### 2. **Docker (Isolated)**
```bash
docker run -d -p 20128:20128 diegosouzapw/omniroute
```

### 3. **From Source**
```bash
git clone https://github.com/diegosouzapw/omniroute
cd omniroute
npm install
npm run dev
```

## Quick Test (Zero Config)

Once running, test without any API keys:

```bash
# Simple health check
curl http://localhost:20128/health

# Ask the AI (uses free tier by default)
curl http://localhost:20128/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Hello, respond with OK"}]
  }'
```

## Safe Testing Plan

1. **Run in Docker** (most isolated):
   ```bash
   docker run --rm -p 20128:20128 diegosouzapw/omniroute
   # Only uses port 20128, doesn't touch network config
   ```

2. **Monitor with:** 
   ```bash
   curl http://localhost:20128/dashboard/free-tiers  # See free token budget
   curl http://localhost:20128/health               # Server status
   ```

3. **Integration Test:**
   ```bash
   # Verify it responds correctly
   curl -s http://localhost:20128/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"auto","messages":[{"role":"user","content":"test"}]}' | jq .
   ```

## What's Safe & What's Not

✅ **Safe:**
- Installing OmniRoute
- Running the server locally
- Routing AI requests through it
- Adding API keys for paid providers (optional)

❌ **Not relevant:**
- Your home router/network configuration
- ISP settings
- WiFi hardware

## Next Steps

1. Choose installation method (Docker for isolation)
2. Run `omniroute` or `docker run ...`
3. Test with a curl request
4. Integrate with Claude Code (set custom API endpoint)

**Questions?** See the full docs: https://omniroute.online

## Version Info

Latest: v3.8.50+ (350+ providers, vision/audio/video support)
License: MIT (open source, self-hostable)
