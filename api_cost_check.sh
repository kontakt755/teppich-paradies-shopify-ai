#!/usr/bin/env bash
# Read-only local preflight. Never accepts or prints an API key as an argument.
set -u

status=0
note() { printf 'INFO: %s\n' "$1"; }
ok() { printf 'OK: %s\n' "$1"; }
warn() { printf 'WARN: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1"; status=1; }

check_key() {
  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    ok "ANTHROPIC_API_KEY is present (value not displayed)"
  else
    fail "ANTHROPIC_API_KEY is not set; API calls are disabled"
  fi
}

check_python() {
  if ! command -v python3 >/dev/null 2>&1; then
    fail "python3 is required"
    return
  fi
  python3 -m py_compile router_api_migration.py api_cost_monitor.py || fail "Python compile check failed"
  if python3 -c 'import anthropic' >/dev/null 2>&1; then
    ok "Anthropic SDK is installed"
  else
    warn "Anthropic SDK is not installed; install it before a real API call"
  fi
}

check_router_contract() {
  if [ -f workflow/router.mjs ]; then
    ok "Existing deterministic workflow/router.mjs found"
  else
    fail "workflow/router.mjs missing; do not enable the API adapter"
  fi
}

usage() {
  cat <<'EOF'
Usage: ./api_cost_check.sh [--cost REQUESTS]

The script reads ANTHROPIC_API_KEY only from the environment and never prints it.
--cost runs a transparent illustrative estimate without making an API request.
EOF
}

case "${1:-}" in
  "") note "Claude API router preflight"; check_key; check_python; check_router_contract ;;
  --cost)
    if [ -z "${2:-}" ] || ! [[ "$2" =~ ^[0-9]+$ ]]; then
      fail "--cost requires a non-negative request count"
    else
      python3 api_cost_monitor.py --simulate "$2" || fail "Cost simulation failed"
    fi
    ;;
  --help|-h) usage ;;
  *) fail "Unknown option: $1"; usage ;;
esac

exit "$status"
