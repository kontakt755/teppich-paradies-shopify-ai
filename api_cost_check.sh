#!/bin/bash
# Claude API Cost & Credentials Checker
# Quick validation + cost simulation + migration guide

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# CONFIGURATION
# ============================================================================

API_KEY_FILE="${CLAUDE_API_KEY_FILE:-./.env.local}"
CONFIG_FILE="${HOME}/.claude/config.json"
DB_FILE="${HOME}/.claude/api_usage.db"

# Pricing (August 2026)
INPUT_UNCACHED=0.000003        # $3/1M tokens
INPUT_CACHED=0.0000003         # $0.30/1M tokens
OUTPUT=0.000015                # $15/1M tokens
PRO_MONTHLY=20
MAX_MONTHLY=150

# Usage assumptions
REQUESTS_WEEK=140
INPUT_TOKENS=2000
OUTPUT_TOKENS=500
CACHE_HIT_RATE=0.75

# ============================================================================
# FUNCTIONS
# ============================================================================

log() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

check_api_key() {
    log "Checking API credentials..."

    if [ -n "$ANTHROPIC_API_KEY" ]; then
        success "API Key found in ANTHROPIC_API_KEY env var"
        return 0
    fi

    if [ -f "$API_KEY_FILE" ]; then
        if grep -q "ANTHROPIC_API_KEY" "$API_KEY_FILE"; then
            success "API Key found in $API_KEY_FILE"
            return 0
        fi
    fi

    if [ -f "$CONFIG_FILE" ]; then
        success "Claude config found: $CONFIG_FILE"
    fi

    warning "API Key not found. Set via:"
    echo "  export ANTHROPIC_API_KEY='your-key-here'"
    echo "  OR add to $API_KEY_FILE"
    return 1
}

validate_api_key() {
    local api_key="$1"

    if [ -z "$api_key" ]; then
        error "No API key provided"
        return 1
    fi

    log "Validating API key format..."
    if [[ $api_key =~ ^sk-ant- ]]; then
        success "Valid API key format"
        return 0
    else
        error "Invalid API key format (should start with sk-ant-)"
        return 1
    fi
}

# ============================================================================
# COST CALCULATIONS
# ============================================================================

calculate_monthly_cost() {
    local requests_per_week="$1"
    local cache_hit_rate="${2:-0.75}"

    local requests_month=$(echo "$requests_per_week * 4.3" | bc)
    local total_input=$(echo "$requests_month * $INPUT_TOKENS" | bc)
    local total_output=$(echo "$requests_month * $OUTPUT_TOKENS" | bc)

    local cached_input=$(echo "$total_input * $cache_hit_rate" | bc)
    local uncached_input=$(echo "$total_input * (1 - $cache_hit_rate)" | bc)

    local cost_cached=$(echo "$cached_input * $INPUT_CACHED" | bc)
    local cost_uncached=$(echo "$uncached_input * $INPUT_UNCACHED" | bc)
    local cost_output=$(echo "$total_output * $OUTPUT" | bc)

    local total_cost=$(echo "$cost_cached + $cost_uncached + $cost_output" | bc)

    echo "$total_cost"
}

print_cost_table() {
    log "Computing monthly costs..."

    local api_cost=$(calculate_monthly_cost "$REQUESTS_WEEK" "$CACHE_HIT_RATE")
    local api_cost_no_cache=$(calculate_monthly_cost "$REQUESTS_WEEK" "0")

    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║        💰 CLAUDE API COST COMPARISON (Monthly)         ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""
    printf "%-25s %15s %15s\n" "Option" "Monthly" "Yearly"
    printf "%-25s %15s %15s\n" "─────────────────────────" "───────────" "───────────"
    printf "%-25s \$%14.2f \$%14.2f\n" "Pro Plan" "$PRO_MONTHLY" "$(echo "$PRO_MONTHLY * 12" | bc)"
    printf "%-25s \$%14.2f \$%14.2f\n" "Max Plan" "$MAX_MONTHLY" "$(echo "$MAX_MONTHLY * 12" | bc)"
    printf "%-25s \$%14.2f \$%14.2f\n" "API + Caching" "$api_cost" "$(echo "$api_cost * 12" | bc)"
    printf "%-25s \$%14.2f \$%14.2f\n" "API (no caching)" "$api_cost_no_cache" "$(echo "$api_cost_no_cache * 12" | bc)"
    echo ""

    local savings=$(echo "$PRO_MONTHLY - $api_cost" | bc)
    local savings_percent=$(echo "scale=1; $savings / $PRO_MONTHLY * 100" | bc)

    success "Savings with API + Caching: \$$savings/month ($savings_percent%)"
    echo ""
}

# ============================================================================
# ROUTER COMPATIBILITY CHECK
# ============================================================================

check_router_compatibility() {
    log "Checking Router API compatibility..."

    # Check for Claude Code CLI
    if command -v claude &> /dev/null; then
        success "Claude Code CLI found (API-ready)"
    else
        warning "Claude Code CLI not found (install via npm install -g @anthropic-ai/claude)"
    fi

    # Check for Python environment
    if command -v python3 &> /dev/null; then
        success "Python 3 environment found"
        python3 --version
    else
        error "Python 3 not found"
        return 1
    fi

    # Check for anthropic SDK
    if python3 -c "import anthropic" 2>/dev/null; then
        success "Anthropic SDK installed"
    else
        warning "Anthropic SDK not found. Install via: pip install anthropic"
    fi

    # Check for existing router code
    if [ -f "router.py" ] || [ -f "codex_router.py" ]; then
        success "Router file found (ready for migration)"
    fi

    echo ""
}

# ============================================================================
# MIGRATION GUIDE
# ============================================================================

print_migration_guide() {
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║          🚀 CLAUDE API MIGRATION GUIDE                 ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""

    echo "STEP 1: Get API Key"
    echo "  1. Visit: https://console.anthropic.com/account/keys"
    echo "  2. Create new API key"
    echo "  3. Save securely:"
    echo ""
    echo "     export ANTHROPIC_API_KEY='sk-ant-...'"
    echo ""

    echo "STEP 2: Install Dependencies"
    echo "  pip install anthropic prompt-caching"
    echo ""

    echo "STEP 3: Update Router Code"
    echo "  Example integration (router.py):"
    echo ""
    cat << 'EOF'
from anthropic import Anthropic

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Enable prompt caching automatically for repeated codebase analysis
response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=2048,
    system=[
        {
            "type": "text",
            "text": "You are a code analysis router for Teppich Paradies Shop.",
        },
        {
            "type": "text",
            "text": CODEBASE_CONTEXT,  # Large, repeated context
            "cache_control": {"type": "ephemeral"}  # Cache this for 5 mins
        }
    ],
    messages=[
        {"role": "user", "content": user_query}
    ]
)

# Track usage
print(f"Cache creation tokens: {response.usage.cache_creation_input_tokens}")
print(f"Cache read tokens: {response.usage.cache_read_input_tokens}")
print(f"Regular input tokens: {response.usage.input_tokens}")
EOF
    echo ""

    echo "STEP 4: Monitor Costs"
    echo "  python api_cost_monitor.py --track"
    echo "  python api_cost_monitor.py --report monthly"
    echo ""

    echo "STEP 5: Staging Test"
    echo "  Deploy to staging environment first"
    echo "  Run existing test suite against API"
    echo "  Monitor cache-hit rate (target: >75%)"
    echo ""

    echo "STEP 6: Production Rollout"
    echo "  Deploy on Friday afternoon (less traffic)"
    echo "  Keep Pro plan active as fallback (2 weeks)"
    echo "  Monitor for 48 hours"
    echo ""
}

# ============================================================================
# SETUP CHECKS
# ============================================================================

check_disk_space() {
    log "Checking disk space..."

    local available=$(df -h . | awk 'NR==2 {print $4}')
    success "Available disk space: $available"
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║     Claude API Cost Analysis & Migration Checker       ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""

    # Run checks
    check_api_key
    check_router_compatibility
    check_disk_space

    # Show costs
    print_cost_table

    # Migration guide
    if [ "$1" == "--migrate" ]; then
        print_migration_guide
    else
        log "For migration guide, run: $0 --migrate"
    fi

    echo ""
    success "Pre-flight checks complete! ✨"
    echo ""
}

# ============================================================================
# USAGE
# ============================================================================

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

OPTIONS:
  --migrate       Show detailed migration guide
  --validate KEY  Validate specific API key
  --cost REQUEST  Calculate cost for N monthly requests
  --help          Show this help

EXAMPLES:
  $0                                  # Run all checks
  $0 --migrate                        # Show migration steps
  $0 --validate sk-ant-xxxxx         # Validate API key
  $0 --cost 560                       # Cost for 560 monthly requests

EOF
}

# ============================================================================
# PARSE ARGUMENTS
# ============================================================================

if [ $# -eq 0 ]; then
    main
else
    case "$1" in
        --migrate)
            main
            print_migration_guide
            ;;
        --validate)
            validate_api_key "$2"
            ;;
        --cost)
            if [ -n "$2" ]; then
                log "Calculating cost for $2 monthly requests..."
                cost=$(calculate_monthly_cost "$(echo "$2 / 4.3" | bc)" "0.75")
                echo "API + Caching: \$$(printf "%.2f" "$cost")/month"
            else
                error "Please provide request count"
            fi
            ;;
        --help|-h)
            usage
            ;;
        *)
            error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
fi
