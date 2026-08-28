#!/bin/bash
# Setup script for new colleagues
# Usage: ./setup-colleague.sh [api-key]

set -e

echo "🚀 Teppich Paradies - Claude API Setup"
echo "======================================"
echo ""

# Check if API key provided
if [ -z "$1" ]; then
    echo "❌ Usage: ./setup-colleague.sh sk-ant-YOUR_KEY"
    echo ""
    echo "To get your API key:"
    echo "  1. Go to https://console.anthropic.com/account/keys"
    echo "  2. Click 'Create Key'"
    echo "  3. Copy the key (sk-ant-xxxxx...)"
    echo "  4. Run: ./setup-colleague.sh sk-ant-xxxxx"
    exit 1
fi

API_KEY="$1"

# Validate key format
if [[ ! $API_KEY =~ ^sk-ant- ]]; then
    echo "❌ Invalid API key format. Must start with 'sk-ant-'"
    exit 1
fi

# Never silently replace an existing key
if [ -e .env.local ]; then
    echo "❌ .env.local already exists - not overwriting it."
    echo "   Delete or rename it first if you really want a fresh setup."
    exit 1
fi

# Create .env.local
echo "📝 Creating .env.local..."
cat > .env.local << DOTENV
# Claude API Configuration - Teppich Paradies
ANTHROPIC_API_KEY=$API_KEY
CLAUDE_MONTHLY_HARD_LIMIT_USD=50
CLAUDE_MONTHLY_WARNING_USD=30
CLAUDE_MAX_TOKENS=2048
CLAUDE_USAGE_DB=.claude/api_usage.db
DOTENV

echo "✅ .env.local created"
echo ""

# Load environment
echo "🔧 Loading configuration..."
export ANTHROPIC_API_KEY=$API_KEY
export CLAUDE_MONTHLY_HARD_LIMIT_USD=50

# Run validation
echo ""
echo "🧪 Running validation checks..."
if ! ./api_cost_check.sh; then
    echo ""
    echo "⚠️  Setup partially complete. Check errors above."
    exit 1
fi

echo ""
echo "✅ SETUP COMPLETE!"
echo ""
echo "You can now use:"
echo "  python3 router_api_migration.py --task-class B --query 'Your question' --context-file some-file.md"
echo "  python3 api_cost_monitor.py --report monthly"
echo ""
echo "Next time you open terminal, just run: source .env.local"
