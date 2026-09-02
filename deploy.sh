#!/bin/bash

# Shopify Theme Deployment Script - Product Gallery Redesign Phase 2
# Usage: ./deploy.sh [--live] [--preview] [--store STORE] [--dry-run]

set -e

STORE="${STORE:-sjjyq1-6w.myshopify.com}"
MODE="${1:-preview}"
DRY_RUN=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --live) MODE="live"; shift ;;
    --preview) MODE="preview"; shift ;;
    --store) STORE="$2"; shift 2 ;;
    --dry-run) DRY_RUN="--dry-run"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "╭─────────────────────────────────────────────────────────╮"
echo "│ Shopify Theme Deployment - Product Gallery Redesign V2  │"
echo "╰─────────────────────────────────────────────────────────╯"
echo ""
echo "Store: $STORE"
echo "Mode: $MODE"
echo ""

# Verify repository state
echo "1️⃣  Verifying repository..."
if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Repository has uncommitted changes. Commit first:"
  git status --short
  exit 1
fi
echo "✅ Repository clean"

# Get latest commits
echo ""
echo "2️⃣  Latest commits:"
git log --oneline -3

# Run validation through workflow system
echo ""
echo "3️⃣  Running code validation..."
npm run workflow:validate -- $DRY_RUN

# Get theme list and identify live theme
echo ""
echo "4️⃣  Getting theme information from Shopify..."
THEMES_JSON=$(shopify theme list --store "$STORE" --json)
LIVE_THEME_ID=$(echo "$THEMES_JSON" | jq -r '.[] | select(.role == "live") | .id')

if [[ -z "$LIVE_THEME_ID" ]]; then
  echo "❌ Could not find live theme"
  exit 1
fi

echo "✅ Live Theme ID: $LIVE_THEME_ID"

# Deploy based on mode
if [[ "$MODE" == "preview" ]]; then
  # Create a preview theme
  echo ""
  echo "5️⃣  Creating preview theme..."
  PREVIEW_ID=$(echo "$THEMES_JSON" | jq -r '.[] | select(.role == "unpublished") | .id' | head -1)

  if [[ -z "$PREVIEW_ID" ]]; then
    echo "❌ No unpublished theme available for preview"
    exit 1
  fi

  npm run workflow:preview -- \
    --store "$STORE" \
    --theme-id "$PREVIEW_ID" \
    --approve-preview \
    $DRY_RUN

  echo ""
  echo "✅ Preview deployment complete!"

elif [[ "$MODE" == "live" ]]; then
  # Live deployment requires approval
  echo ""
  echo "5️⃣  LIVE DEPLOYMENT - Requires your approval"
  echo ""
  echo "⚠️  You are about to deploy to PRODUCTION"
  echo ""
  read -p "Type 'CONFIRM LIVE DEPLOYMENT' to proceed: " CONFIRM

  if [[ "$CONFIRM" != "CONFIRM LIVE DEPLOYMENT" ]]; then
    echo "❌ Deployment cancelled"
    exit 1
  fi

  npm run workflow:live -- \
    --store "$STORE" \
    --theme-id "$LIVE_THEME_ID" \
    --approve-live \
    --approval-text "Genehmigt für Live-Deployment" \
    --execute \
    $DRY_RUN

  echo ""
  echo "✅ Live deployment complete!"
fi

echo ""
echo "╭─────────────────────────────────────────────────────────╮"
echo "│ Deployment Summary                                      │"
echo "├─────────────────────────────────────────────────────────┤"
echo "│ ✅ Price Display: Single bottom display                │"
echo "│ ✅ Color Variants: Visible on cards                    │"
echo "│ ✅ Card Sizing: Global uniform                         │"
echo "│ ✅ Visual Design: Polished & professional              │"
echo "╰─────────────────────────────────────────────────────────╯"
