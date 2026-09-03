# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Teppich Paradies – AI-Orchestrated Shopify Store**

- **Public Shop:** https://www.teppich-paradies.net
- **Shopify Store:** sjjyq1-6w.myshopify.com
- **Live Theme:** `theme-productpage-v2-night` (ID: 201829679438)
- **Fallback Theme:** `Horizon` (ID: 196301750606) — **never delete or overwrite**

This is a specialized Shopify theme with AI-driven automation for a carpet/flooring shop (Teppichboden, Teppiche, Vinylboden, Klick-und-Klebe, Rollenware, Teppich auf Maß). Product features like €/m², package calculators, truncated cards, and category carousels are already built and extensively tested.

---

## Core Architecture

### 1. AI Orchestrator + Provider Router

**Core Components:**
- `workflow/router.mjs` — **single source of truth** for deterministic task classification (A/B/C/D)
- `workflow/core.mjs` — orchestrator state machine, manifest loading, risk engine
- `router_api_migration.py` — Python adapter for Claude API calls (Haiku/Sonnet/Opus)
- `api_cost_monitor.py` — budget tracking and rate-limit management

**Task Classification:**
- **Class A:** Local/deterministic, no LLM
- **Class B:** Haiku (fast, cheap)
- **Class C:** Sonnet (balanced)
- **Class D:** Opus (complex reasoning; requires explicit escalation)

Models are configurable via env vars: `CLAUDE_HAIKU_MODEL`, `CLAUDE_SONNET_MODEL`, `CLAUDE_OPUS_MODEL`. Do not hardcode model IDs.

**Risk Management:**
- Deterministic risk checks block unsafe operations (product deletion, price changes, checkout modifications, DNS changes, etc.)
- `RISK_MODEL_SPEC.md` defines gates; `RISK_MAP.yaml` has priority/category rules
- Every diff is audit-logged; actual risk exceeding allowed risk triggers `HARD_STOP`
- Review loops: up to 3 rounds for correction; failure = `REVIEW_LIMIT_REACHED` → human gate

### 2. Shopify Theme Structure

**Key Directories:**
- `theme/` — Liquid template root
- `blocks/` — Shopify block definitions (product cards, carousels, filters, etc.)
- `sections/` — Shopify section definitions (full page components)
- `snippets/` — reusable Liquid partials
- `templates/` — page-level templates (product, collection, etc.)
- `locales/` — multilingual strings (German primary)

**Important Pre-Built Features** (do not reinvent):
- €/m² pricing display for package products
- Package/waste calculator + cart logic (fully tested)
- Comparison dialog (max 3 products)
- Sample orders
- Product benefits/technical data
- Predictive search
- Globo Mega Menu
- Mobile peek and carousel navigation
- Truncated card titles
- Breadcrumbs

### 3. Automation & QA Pipeline

**Automation Layers:**
- `automation/core/` — modular components (API handlers, data processors, validators)
- `automation/scripts/` — standalone runners (secret scan, OpenRouter usage reports)
- `qa/` — visual, SEO, sales readiness, and comparison checks
- `qa/tests/` — unit tests for evidence filtering, URL sanitization, browser infra

**Dashboard (Localhost):**
- `docs/ai-dashboard/` or `setup-dashboard.sh` sets up GitHub Labels
- Dashboard runs on `localhost:8001` (Python SimpleHTTP)
- Reads GitHub Issues with status/type/priority labels and displays Kanban board, list view, metrics
- Auto-refreshes every 2 minutes

---

## Development Commands

### Setup & Validation

```bash
# Install dependencies
npm install
python3 -m pip install anthropic

# Read-only preflight (budget check)
./api_cost_check.sh

# Offline demo (no API call)
python3 demo_run.py

# Run all unit tests
npm test

# Specific test suites
npm run qa:unit:test
npm run automation:test
npm run workflow:test
npm run control:center:test
```

### Workflow & State Management

```bash
# Validate manifest syntax
npm run workflow:validate

# Check current state (task classifications, blockers)
npm run workflow:state

# View next eligible task
npm run workflow:next

# Continue after human intervention
npm run workflow:continue

# Preview a change (dry-run without commit)
npm run workflow:preview

# Publish to live theme
npm run workflow:live
```

### Quality Assurance

```bash
# Full QA suite (unit + integration + visual)
npm run qa

# Generate visual evidence screenshots
npm run qa:visual

# SEO-specific checks
npm run seo:check

# Sales readiness (checkout, cart, pricing)
npm run sales:check

# Product comparison dialog checks
npm run compare:check

# Budget monitoring
node api_cost_monitor.py
npm run openrouter:usage
```

### GitHub Labels Setup

```bash
# Create all dashboard labels (status, type, priority, area, reviewer)
./setup-dashboard.sh
```

### Control Center (Live Monitoring)

```bash
# Start monitoring server
npm run control:center

# Test control center endpoints
npm run control:center:test
```

---

## Project Structure

```
.
├── .ai/                          # AI config & secrets (git-ignored)
├── .claude/                       # Claude Code local config
├── .github/                       # GitHub workflows
├── automation/                    # Automation scripts & tests
│   ├── core/                      # API handlers, data processors
│   ├── scripts/                   # Standalone runners
│   ├── data/                      # Test fixtures, CSV exports
│   └── tests/
├── blocks/                        # Shopify block definitions (~120 blocks)
├── config/                        # App config (Shopify Admin API settings)
├── control-center/                # Live monitoring dashboard
├── docs/                          # Documentation
│   └── ai-dashboard/              # Dashboard setup guide
├── qa/                            # QA runners & tests
│   ├── tests/
│   └── run-*.mjs                  # Visual, SEO, sales, compare checks
├── sections/                      # Shopify section definitions
├── server/                        # Backend services
├── snippets/                      # Reusable Liquid partials
├── templates/                     # Page-level templates
├── theme/                         # Theme root (Liquid)
├── workflow/                      # Orchestrator core
│   ├── router.mjs                 # Task classification (deterministic)
│   ├── core.mjs                   # State machine & risk engine
│   └── cli.mjs                    # Workflow CLI
├── AI_ORCHESTRATOR_MASTER_SPEC.md # Architecture & state definitions
├── AGENTS.md                      # Central rule source for all agents
├── QUICK_START.md                 # Claude API Router setup
└── RISK_MODEL_SPEC.md             # Risk classification rules
```

---

## Key Concepts

### Task State Lifecycle

```
PENDING → RUNNING → IMPLEMENT → REVIEW → PASS
                         ↓
                    REVIEW_FINDINGS
                         ↓
                   CORRECTION_REQUIRED → CORRECT → REVIEW
                   (max 3 cycles)
                         ↓
                   REVIEW_LIMIT_REACHED / HUMAN_GATE
```

Alternative terminal states: `PARKED`, `SKIPPED_DEPENDENCY`, `NEEDS_AHMET`, `HARD_FAIL`, `SECURITY_STOP`

### Shopify Product Data

**Rules:**
- Do not invent product metadata or properties
- Only modify metafields/collections if explicitly authorized or backed by reliable existing data
- When unsure: document as open case, do not guess
- €/m² is the primary customer-facing metric; Shopify list price remains the internal package price
- Never show package price prominently on collection cards; product detail page may show it secondarily

### Theme Safety

**Never (without explicit approval):**
- Delete products/variants or modify SKUs
- Change prices, checkout, payment, tax, or shipping settings
- Change DNS or domains
- Delete the Fallback Theme (Horizon, ID 196301750606)
- Migrate Horizon version
- Perform large irreversible Shopify data changes

**Safe to do independently:**
- Small, tested theme optimizations → may publish live directly
- Large architectural changes → analyze and report first
- Irreversible or business-critical changes → ask before proceeding

**Testing & Rollout:**
- Use Shopify Theme Check when relevant
- Test on mobile and desktop
- Check for regressions in existing features
- Verify real public shop (without ?preview parameters) before sign-off

---

## Integration with Dashboard

**Goal:** All project metrics, tasks, and progress visible on the Dashboard.

**How it works:**
1. Dashboard reads GitHub Issues from `tobiaski737-coder/teppich-paradies-shopify-ai`
2. Issues tagged with status/type/priority labels appear in Kanban columns, metrics, and list views
3. Each task/issue can include "Nächster Schritt" (next step) in the body

**To add an issue to the dashboard:**
```bash
gh issue create \
  --title "Your Task Title" \
  --body "Description here" \
  --label "status:eingang,type:feature,priority:p1,area:produktseite"
```

**Label Categories:**
- Status: `status:eingang`, `status:geplant`, `status:in-arbeit`, `status:review`, `status:korrektur`, `status:blockiert`, `status:fertig`
- Type: `type:bug`, `type:verbesserung`, `type:idee`, `type:ux`, `type:seo`, `type:content`, `type:technik`
- Priority: `priority:p0`, `priority:p1`, `priority:p2`, `priority:p3`
- Area: `area:produktseite`, `area:kategorie`, `area:navigation`, `area:filter`, `area:warenkorb`, `area:checkout`, `area:seo`, `area:google`, `area:versand`, `area:design`, `area:backend`, `area:sonstiges`

---

## Claude API Integration

**Before First API Call:**

1. Install SDK: `python3 -m pip install anthropic`
2. Set API key **only** via env var or secret manager, never as CLI argument
3. (Optional) Configure budget warnings:
   - `CLAUDE_DAILY_WARNING_USD`
   - `CLAUDE_MONTHLY_WARNING_USD`
   - `CLAUDE_MONTHLY_HARD_LIMIT_USD`
4. Run read-only preflight: `./api_cost_check.sh`
5. Run offline demo: `python3 demo_run.py`
6. Run tests: `python3 -m unittest tests/test_api_router.py`

**Prompt Caching:**
- Cache only stable, reusable context (project rules, tool schemas, versioned context packs)
- Keep user task, git diffs, timestamps, and dynamic tool results **after** the cache breakpoint
- Uses 5-minute TTL (safe, pricing tracked)
- Validate cache hits via actual API usage fields, not markers alone

**Production Rollout (Staging First):**
1. Simulate errors, budget stops, and cache write→read scenarios
2. Test limited staging sample with console spend limit
3. Keep existing router as rollback path until documented Go/No-Go decision

---

## Agent Rules (from AGENTS.md)

### General Approach

- Understand existing code first; don't reinvent working solutions
- Complete small, clearly scoped tasks independently
- Don't ask for every terminal, browser, Playwright, or Shopify CLI step
- Find a safe alternative if blocked
- Don't deviate unnecessarily due to GitHub, auth, or side infrastructure
- Avoid large unnecessary refactorings; small robust changes are better
- Test on mobile and desktop; regression-check existing features
- Use Shopify Theme Check when applicable
- Test risky functionality before going live
- After going live, verify the real public shop (no ?preview params)

### Critical Safety Gates

**NEVER without explicit approval:**
- Delete products/variants or change SKUs
- Change prices, checkout, payment, tax, shipping
- Change DNS/domains
- Modify legal texts
- Install paid apps
- Trigger purchases/subscriptions
- Delete/overwrite Fallback Theme (ID 196301750606)
- Migrate Horizon
- Large irreversible Shopify data changes

**Product Data:**
- Only modify metafields/collections if explicitly authorized or backed by reliable existing product/manufacturer data
- Do not invent properties or infer from images alone
- When unsure, document as open case and move on

### Theme Features (Don't Rebuild)

These are already built, tested, and functional:
- €/m² display for package products
- Package/waste calculator
- German package/order quantity display
- Product comparison (max 3)
- Sample orders
- Breadcrumb
- Product benefits
- Technical data
- New product card logic
- Truncated card titles
- Predictive search
- Home page structure
- Vinyl flooring category carousel
- Mobile peek / carousel navigation

---

## Common Development Patterns

### Creating a Workflow Task

1. Create a GitHub Issue with a descriptive title and label it with status/type/priority
2. The issue appears in the Dashboard within 2 minutes
3. Use `npm run workflow:next` to fetch the next eligible task
4. Make changes, test on mobile/desktop, verify live shop
5. Close the issue or update its status label when complete

### Auditing Risk

1. Check `RISK_MAP.yaml` for category/priority rules
2. Review `RISK_MODEL_SPEC.md` for gate logic
3. Run workflow state check: `npm run workflow:state`
4. The router will flag actual risk exceeding allowed risk with `HARD_STOP`

### Monitoring Costs

```bash
# Check spending against budget limits
./api_cost_check.sh

# Detailed cost report
node api_cost_monitor.py

# OpenRouter usage (if applicable)
npm run openrouter:usage
```

### Preview vs. Live

- `npm run workflow:preview` — dry-run, no commit
- `npm run workflow:live` — publish to live theme (after testing)
- Always test the real public shop after live publish

---

## Docs & References

**Essential Files:**
- `AGENTS.md` — Central rule source for all agents (**read first**)
- `AI_ORCHESTRATOR_MASTER_SPEC.md` — Architecture, state definitions, risk engine
- `QUICK_START.md` — Claude API Router setup and safety checklist
- `RISK_MODEL_SPEC.md` — Risk classification gates and rules
- `RISK_MAP.yaml` — Operational priorities and category weights
- `SHOPIFY_MASTER_ROADMAP.md` — Feature roadmap and priorities
- `GOOGLE_SHOPPING_SAFETY_REPORT.md` — Google Shopping feed rules (if integrating Ads)

**Shopify-Specific:**
- `GOOGLE_SHOPPING_PRICE_STRATEGY.md` — Pricing rules for product feeds
- `GOOGLE_ROLLENWARE_EXCLUSION_LIST.csv` — Rollenware SKU list (do not include in some feeds)
- `SEO_REPORT.md` / `SEO_META_MANUAL.md` — SEO rules and metadata

**Dashboard & Monitoring:**
- `docs/ai-dashboard/` — Dashboard setup and usage guide
- `setup-dashboard.sh` — Auto-creates GitHub Labels for dashboard

---

## Troubleshooting

### Repository Path Handling

The repo is cloned on multiple machines (Windows, macOS, Linux). **Always work in the current repo root.** Do not hardcode absolute paths like `/Users/tristan/...` — use relative paths or env vars.

### Theme ID Verification

Before modifying the live theme, **always verify which theme is actually live**:
```bash
# Current live-theme when this file was last updated:
# - theme-productpage-v2-night (ID: 201829679438)
# - Fallback: Horizon (ID: 196301750606)
```
Do not trust stored theme IDs; check Shopify Admin if you're unsure.

### API Call Failures

1. Check env var: `echo $ANTHROPIC_API_KEY` (should not be empty)
2. Run `./api_cost_check.sh` to verify credentials and budget
3. Check for rate limits: `npm run openrouter:usage` (if using OpenRouter)
4. Review API cost reports in `automation/reports/`

### Workflow Blockers

If a task is blocked, `npm run workflow:state` will show the blocker type:
- `RATE_LIMIT` — throttled by external service
- `UPSTREAM` — dependency not ready
- `CODE_DEFECT` — local code issue
- `UNKNOWN_BLOCKER` — investigate router logs

---

## Next Steps for New Contributors

1. Read `AGENTS.md` (central rules)
2. Run `npm run workflow:test` and `npm run qa:unit:test` to verify setup
3. Run `./api_cost_check.sh` to confirm API access
4. Visit the Dashboard: `localhost:8001` (after `npm install`)
5. Pick a small task from the Dashboard and follow the workflow pattern above
6. Use `npm run workflow:preview` to dry-run changes, `npm run workflow:live` to publish
>>>>>>> 59b7f00 (🚀 Add Online-Shop Dashboard: Live issue tracking system)
