#!/usr/bin/env bash

# Repository Portability Setup Script
# Configures Git for consistent cross-platform (Windows/Mac/Linux) behavior
#
# Usage: ./setup-repository.sh
# or:    bash setup-repository.sh

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Repository Portability Setup ===${NC}\n"

# Check if we're in a git repository
if [ ! -d .git ]; then
  echo -e "${RED}Error: Not in a git repository${NC}"
  echo "Run this script from the repository root directory"
  exit 1
fi

# Helper function to run git config with confirmation
configure_git() {
  local setting="$1"
  local value="$2"
  local description="$3"

  echo -n "Configuring $description... "
  git config "$setting" "$value"
  echo -e "${GREEN}✓${NC}"
}

# Step 1: Configure core git settings
echo -e "${BLUE}Step 1: Configure Git Core Settings${NC}"
echo "Purpose: Ensure consistent line endings across all platforms"
echo ""

configure_git "core.autocrlf" "false" "core.autocrlf (auto line ending conversion off)"
configure_git "core.eol" "lf" "core.eol (use LF as standard)"
configure_git "core.safecrlf" "warn" "core.safecrlf (warn on mixed line endings)"

# Platform-specific configuration
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  echo -e "\n${BLUE}Windows-specific configuration:${NC}"
  configure_git "core.filemode" "false" "core.filemode (ignore file permission changes on Windows)"
  configure_git "core.longpaths" "true" "core.longpaths (support long file paths on Windows)"
fi

# Step 2: Verify configuration
echo -e "\n${BLUE}Step 2: Verify Configuration${NC}"
echo "Checking git configuration:"
echo ""

# Check each setting
check_config() {
  local setting="$1"
  local expected="$2"
  local actual=$(git config "$setting" 2>/dev/null || echo "")

  if [ "$actual" = "$expected" ]; then
    echo -e "${GREEN}✓${NC} $setting = $expected"
  else
    echo -e "${RED}✗${NC} $setting = $actual (expected: $expected)"
    return 1
  fi
}

errors=0

check_config "core.autocrlf" "false" || errors=$((errors + 1))
check_config "core.eol" "lf" || errors=$((errors + 1))
check_config "core.safecrlf" "warn" || errors=$((errors + 1))

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  check_config "core.filemode" "false" || errors=$((errors + 1))
  check_config "core.longpaths" "true" || errors=$((errors + 1))
fi

# Step 3: Check repository state
echo -e "\n${BLUE}Step 3: Verify Repository State${NC}"
echo "Checking for uncommitted changes:"
echo ""

if git status --porcelain | grep -q .; then
  echo -e "${YELLOW}⚠${NC}  Working directory has uncommitted changes:"
  git status --short | head -10
  echo -e "\n${YELLOW}Warning: Stash or commit these changes before proceeding${NC}"
else
  echo -e "${GREEN}✓${NC} Clean working directory (no uncommitted changes)"
fi

# Step 4: Check .gitattributes
echo -e "\n${BLUE}Step 4: Verify .gitattributes${NC}"
if [ -f ".gitattributes" ]; then
  echo -e "${GREEN}✓${NC} .gitattributes exists"
  if grep -q "* text=auto eol=lf" .gitattributes; then
    echo -e "${GREEN}✓${NC} Text files configured for LF line endings"
  else
    echo -e "${RED}✗${NC} .gitattributes missing LF configuration"
    errors=$((errors + 1))
  fi
else
  echo -e "${RED}✗${NC} .gitattributes not found"
  errors=$((errors + 1))
fi

# Step 5: Check .gitignore
echo -e "\n${BLUE}Step 5: Verify .gitignore${NC}"
if [ -f ".gitignore" ]; then
  echo -e "${GREEN}✓${NC} .gitignore exists"

  # Check for critical entries
  critical_entries=(".env" "node_modules/" ".shopify/" "qa/artifacts/")
  for entry in "${critical_entries[@]}"; do
    if grep -q "^$entry\|^$entry\*" .gitignore 2>/dev/null; then
      echo -e "${GREEN}✓${NC} Ignores: $entry"
    else
      echo -e "${YELLOW}⚠${NC}  Missing in .gitignore: $entry"
    fi
  done
else
  echo -e "${RED}✗${NC} .gitignore not found"
  errors=$((errors + 1))
fi

# Step 6: Check for secrets in staged files
echo -e "\n${BLUE}Step 6: Scan for Secrets${NC}"
echo "Checking staged files for credentials..."
echo ""

secret_found=0
if git diff --cached --name-status 2>/dev/null | grep -q "^A\|^M"; then
  for file in $(git diff --cached --name-only 2>/dev/null); do
    if git show ":$file" 2>/dev/null | grep -qE "sk-ant-|sk_live_|ANTHROPIC_API_KEY|Bearer "; then
      echo -e "${RED}✗${NC} Secret found in staged file: $file"
      secret_found=1
      errors=$((errors + 1))
    fi
  done
fi

if [ $secret_found -eq 0 ]; then
  echo -e "${GREEN}✓${NC} No secrets detected in staged files"
fi

# Step 7: Summary
echo -e "\n${BLUE}=== Setup Summary ===${NC}\n"

if [ $errors -eq 0 ]; then
  echo -e "${GREEN}✓${NC} Repository portability setup completed successfully!"
  echo ""
  echo "Your repository is now configured for:"
  echo "  • Cross-platform Git behavior (Windows/Mac/Linux)"
  echo "  • Consistent LF line endings"
  echo "  • Protected secrets (.env files ignored)"
  echo "  • Clean working tree"
  echo ""
  echo -e "${BLUE}Next steps:${NC}"
  echo "  1. Install dependencies: npm install"
  echo "  2. Create .env.local with API key (see SECURE_MULTIDEVICE_SETUP.md)"
  echo "  3. Test setup: ./api_cost_check.sh"
  echo "  4. Read: REPOSITORY_PORTABILITY.md"
else
  echo -e "${YELLOW}⚠${NC}  Setup completed with $errors warning(s)"
  echo ""
  echo "Please address the issues above and re-run this script"
  exit 1
fi

echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"
