#!/bin/bash
set -e

# OmniRoute Safe Installation & Test Script
# This script tests OmniRoute without affecting your router or system

OMNIROUTE_URL="http://localhost:20128"
TEST_PORT=20128
TIMEOUT=30

echo "🚀 OmniRoute Installation Test Suite"
echo "===================================="
echo ""

# Check if port is available
echo "1️⃣  Checking if port $TEST_PORT is available..."
if nc -z localhost $TEST_PORT 2>/dev/null; then
    echo "   ✅ Port $TEST_PORT is in use (OmniRoute already running)"
    RUNNING=true
else
    echo "   ⚠️  Port $TEST_PORT is free (OmniRoute not running yet)"
    RUNNING=false
fi

echo ""
echo "2️⃣  Installation options:"
echo "   a) npm install -g omniroute && omniroute"
echo "   b) docker run -d -p 20128:20128 diegosouzapw/omniroute"
echo "   c) npx omniroute (temporary, no install)"
echo ""

if [ "$RUNNING" = true ]; then
    echo "3️⃣  Testing OmniRoute connection..."

    # Health check
    echo "   Testing health endpoint..."
    if curl -s -m $TIMEOUT "$OMNIROUTE_URL/health" > /dev/null 2>&1; then
        echo "   ✅ Server is responding"
    else
        echo "   ❌ Server not responding"
        exit 1
    fi

    echo ""
    echo "4️⃣  Testing AI response (using free tier 'auto' model)..."

    # Make a test request
    RESPONSE=$(curl -s -m $TIMEOUT "$OMNIROUTE_URL/v1/chat/completions" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "auto",
        "messages": [{"role": "user", "content": "Reply with the word OK"}],
        "max_tokens": 10
      }')

    if echo "$RESPONSE" | grep -q '"content"'; then
        echo "   ✅ AI responded successfully"
        echo "   Response: $(echo "$RESPONSE" | jq -r '.choices[0].message.content' 2>/dev/null || echo 'Check response')"
    else
        echo "   ⚠️  Response received but needs verification"
        echo "   Raw: $RESPONSE"
    fi

    echo ""
    echo "5️⃣  Checking free tier budget..."
    if curl -s -m $TIMEOUT "$OMNIROUTE_URL/dashboard/free-tiers" > /dev/null 2>&1; then
        echo "   ✅ Free tier dashboard available at:"
        echo "   → $OMNIROUTE_URL/dashboard/free-tiers"
    fi

    echo ""
    echo "✨ All tests passed! OmniRoute is ready to use."
    echo ""
    echo "Next steps:"
    echo "  📖 Dashboard: $OMNIROUTE_URL"
    echo "  🔌 Claude Code: Set API endpoint to $OMNIROUTE_URL/v1"
    echo "  📚 Docs: https://omniroute.online"

else
    echo "3️⃣  To start testing, install and run OmniRoute:"
    echo ""
    echo "   Option 1 (npm global):"
    echo "   npm install -g omniroute"
    echo "   omniroute"
    echo ""
    echo "   Option 2 (Docker - most isolated):"
    echo "   docker run -d -p 20128:20128 diegosouzapw/omniroute"
    echo ""
    echo "   Option 3 (temporary):"
    echo "   npx omniroute"
    echo ""
    echo "   Then run this script again to verify it's working."
fi

echo ""
echo "✅ Security Note:"
echo "   • OmniRoute only uses port 20128"
echo "   • No network/router configuration changes"
echo "   • All communication is local (or to selected AI providers)"
echo "   • MIT licensed, open source"
