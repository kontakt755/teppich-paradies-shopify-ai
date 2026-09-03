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
- `setup-dashboard.sh` creates the GitHub labels the dashboard relies on
- `npm run dashboard` builds `issues.json` and serves on `localhost:8001`
- Displays Kanban board, list view and metrics from status/type/priority labels
- Browser re-reads `issues.json` every 2 minutes; the data itself is refreshed by
  the `dashboard-data` workflow on each issue event

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
1. The `dashboard-data` workflow (`.github/workflows/dashboard-data.yml`) runs on
   every issue event and hourly, calling `scripts/build-dashboard-data.mjs`
2. That script writes `docs/ai-dashboard/issues.json` and commits it
3. `docs/ai-dashboard/index.html` reads only that JSON file — it never calls the
   GitHub API, so no token is needed in the browser
4. Issues tagged with status/type/priority labels appear in Kanban columns,
   metrics, and list views
5. Each task/issue can include "Nächster Schritt" (next step) in the body; the
   generator extracts it into the JSON

Run locally with `npm run dashboard` (builds data, serves on :8001). Do not
re-add a browser-side GitHub API call — it fails without a token and a token in
frontend JS would be public.

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

---

# Hart erarbeitete Projektregeln (nicht entfernen)

Dieser Abschnitt stammt aus der deutschen CLAUDE.md (Commit `7c534a1`). Er
wurde beim Aufloesen eines Merge-Konflikts versehentlich geloescht und ist
hier vollstaendig wieder eingefuegt. Jeder Punkt darin hat real eine
Arbeitssitzung gekostet - insbesondere Punkt 4: **nie von Hand ins Theme
pushen**, auch nicht mit `shopify theme push --live`. Dafuer existiert die
Kette `workflow:preview` -> `workflow:live`.

Shop: `www.teppich-paradies.net` · Theme: Horizon (Shopify 2.0, Blocks/Sections)

## Was hier immer wieder schiefging

Diese vier Punkte haben je eine komplette Sitzung gekostet. Vor dem Loslegen lesen.

**1. Der Theme-Editor ist nur eine Oberfläche über `templates/*.json`.**
Ein Block ist dort ein Eintrag in `blocks` plus einer in `block_order`. Blöcke
hinzufügen ist ein Code-Edit, kein Klickvorgang — und über 14 Collection-Templates
von Hand geklickt ist die Ursache dafür, dass die Templates auseinanderlaufen.

```
npm run theme:block list                                  # zeigt Drift sofort
npm run theme:block add tp-card-color-thumbs --after price
npm run theme:block remove tp-card-color-thumbs
```

**2. Ein Block ohne `"presets"` im Schema wird deployed und ist trotzdem unsichtbar.**
Shopify nimmt ihn nicht in die Block-Auswahl auf. Ebenso werden unbekannte
Schema-Keys (z. B. `"target"`) stillschweigend ignoriert. Vorlage ist das Schema
von `blocks/tp-card-specs.liquid`. `npm run schema:guard` fängt beides.

**3. `{% render 'x' ... as var %}` gibt es in Liquid nicht.**
Shopify verwirft die Datei beim Push **ohne Fehlermeldung**; zur Laufzeit kommt
dann „Could not find asset". `shopify theme check` sieht das nicht,
`npm run liquid:guard` schon. Korrekt ist `{% capture var %}{% render 'x' %}{% endcapture %}`.

**4. Nie von Hand ins Preview-Theme pushen.**
Das Live-Gate verlangt `previewDiffCount === 0`, also Preview exakt gleich
`origin/main`. Ein Direktpush über die Admin API erzeugt genau die Drift, die
`PREVIEW_DRIFT` abfangen soll, und macht die Live-Evidence wertlos.

## Vor jedem Commit

```
npm run liquid:guard && npm run schema:guard && npm run template:guard
node workflow/cli.mjs validate --static      # Flag heisst --static, nicht --static-only
```

Der volle Lauf (`validate` ohne `--static`) braucht die Storefront und läuft nur
lokal auf dem Mac. Unbekannte Flags brechen ab, statt still ignoriert zu werden.

## Werkzeuge

| Befehl | Zweck |
|---|---|
| `npm run theme:block list\|add\|remove` | Blöcke in Templates setzen, statt im Editor zu klicken |
| `npm run liquid:guard` | ungültiges Liquid, das Shopify still verwirft |
| `npm run schema:guard` | Block-Schemata, die deployen aber im Editor unsichtbar bleiben |
| `npm run template:guard` | Kollektions-Templates, deren Produktkarte abweicht |
| `npm run theme:diff -- --manifest <datei>` | Theme gegen Repository abgleichen |
| `npm run workflow:scratch -- --theme-id <id>` | Wegwerf-Theme zum Ausprobieren, ohne Evidence |

**`theme:diff`** braucht ein Manifest aus der Admin API. Über den Shopify-MCP:

```graphql
query { theme(id: "gid://shopify/OnlineStoreTheme/<id>") {
  name files(first: 250) { pageInfo { hasNextPage endCursor }
  nodes { filename checksumMd5 } } } }
```

`checksumMd5` ist die MD5-Summe der Rohbytes und damit direkt mit lokalen
Dateien vergleichbar. Bei `hasNextPage` mit `after: "<endCursor>"` weiterblättern
(das Theme hat rund 500 Dateien, also zwei Seiten). Ergebnis als
`{themeId, themeName, files:[{filename, checksumMd5}]}` ablegen.

**`workflow:scratch`** ist die Lane zum Ausprobieren: läuft aus jedem Branch,
auch mit uncommitteten Änderungen, und schreibt bewusst **keine** Evidence.
Sie verweigert das Live-Theme und das Theme, auf dem die Preview-Evidence
beruht. Zum Deployen bleibt es bei `preview` → `live`.

## In Remote-Sessions (claude.ai/code)

| | Status |
|---|---|
| GitHub, git push | geht |
| Shopify Admin API (Shopify MCP) | geht — liest Theme-Dateien und Produktdaten, schreibt in unpublished Themes |
| Storefront `teppich-paradies.net` / `*.myshopify.com` | **403 an der Egress-Policy** — keine Screenshots möglich |
| Shopify CLI (`theme push/pull/list`) | kein Token + Domains blockiert |

Praktische Folge: Struktur und Syntax sind hier prüfbar, **das Aussehen nicht**.
Browser-Schritte (COMPARE, SEO, FULL_QA, SALES) schlagen hier zwangsläufig fehl —
deshalb `--static`. Deploys laufen lokal.

## Produktdaten (bestimmt, was Blöcke rendern dürfen)

- Farben sind eine echte Produktoption `Farbe` mit Bild je Variante
  (z. B. Floresta: 8 Werte). Blöcke sollten auf die **Option** gehen, nicht auf
  `product.variants` — sonst erscheint dieselbe Farbe mehrfach, wenn zusätzlich
  Breiten-/Längenvarianten existieren.
- Fixpreis-/Rollenware-Produkte haben nur `Default Title` und kein Variantenbild.
  Blöcke müssen dort **still nichts rendern**, kein Fallback auf `product.images` —
  das zeigt sonst Detailfotos als vermeintliche Farben.
- Paketprodukte erkennt man am Metafeld `custom.qm_pro_paket`.

## Deploy-Kette

```
Branch → PR → main → workflow:preview (unpublished Theme) → workflow:live
```

Preview und Live verlangen beide `branch === main && head === origin/main` und
einen sauberen Working Tree. Live zusätzlich passende Preview-Evidence und
explizite Freigabe. Die Gates sind Absicht — nicht umgehen, sondern die Kette
durchlaufen.

## Konventionen

- Eigene Blöcke/Snippets tragen das Präfix `tp-`.
- Blöcke mit `_`-Präfix sind privat (nur verschachtelt, keine `presets` nötig).
- CSS gehört in `{% stylesheet %}`, nicht in ein inline `<style>` pro Karte —
  letzteres dupliziert die Regeln für jede Produktkarte im Raster.
- Kommentare und Commit-Messages auf Deutsch, ohne Umlaute in Liquid-Kommentaren.
- `AppBlockValidTags` aus `theme check` trifft ~140 Dateien inklusive
  Horizon-Kern — bekanntes False-Positive, kein Handlungsbedarf.

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
