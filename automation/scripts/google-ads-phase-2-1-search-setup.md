# Google Ads Phase 2.1 – Search Campaign: Teppichboden
## Setup & Implementation Guide

**Issue:** #46  
**Status:** In Development  
**Priority:** P1  
**Date:** 2026-09-03  

---

## Overview

Phase 2.1 establishes Google Ads Search Campaigns for the "Teppichboden" (carpet flooring) product category. This phase follows Phase 1 (Merchant Center validation) and precedes Phase 2.2 (Teppiche) and Phase 2.3 (Vinylboden).

### Objectives

1. Create Search Campaign structure targeting Teppichboden keywords
2. Configure ad copy with product-specific messaging
3. Set up bid strategies and budgets
4. Link to conversion tracking (Phase 1.2)
5. Enable performance monitoring and optimization

---

## Prerequisites

### Required Accounts & Access
- [ ] Google Ads Account (with Teppich Paradies linked)
- [ ] Google Merchant Center (connected to Google Ads)
- [ ] Google Analytics 4 (Phase 1.2 - for conversion tracking)
- [ ] Shopify Store Admin Access

### Shopify Prerequisites
- [ ] Merchant Center Feed validated (Phase 1.1)
- [ ] Product data complete and accurate
- [ ] Conversion pixel installed (Phase 1.2)
- [ ] UTM tracking parameters configured (Phase 2.2 prep)

---

## Teppichboden Target Keywords

### Primary Keywords

| Keyword | Search Volume | Bid Priority | Match Type |
|---------|---------------|--------------|-----------|
| teppichboden | High | High | Broad |
| teppichboden kaufen | High | High | Phrase |
| teppich bodenbelag | Medium | Medium | Phrase |
| vinylboden teppich | Medium | Medium | Exact |
| günstiger teppichboden | High | Medium | Phrase |
| teppichboden verlegen | Medium | Low | Phrase |
| langflor teppichboden | Medium | High | Phrase |
| naturbelassener bodenbelag | Low | Medium | Phrase |

### Negative Keywords

- "kaufberatung" (consultation - likely intent mismatch)
- "definition" (informational only)
- "lernen" (educational content)
- "wiki" (informational)

---

## Campaign Structure

### Campaign Configuration

```
Account: Teppich Paradies
  └─ Campaign: Teppichboden Search
      ├─ Network: Google Search (not Display)
      ├─ Type: Search
      ├─ Locations: Germany (primary), EU (optional)
      ├─ Languages: German
      ├─ Daily Budget: €20-50 (adjustable)
      └─ Ad Schedule: Continuous (optimization in Phase 5)
        │
        ├─ Ad Group 1: Teppichboden Basics
        │   ├─ Keywords: teppichboden, bodenbelag
        │   ├─ Bid: €0.50-0.80
        │   └─ Landing Page: /collections/teppichboden
        │
        ├─ Ad Group 2: Product Specific
        │   ├─ Keywords: langflor, kurzflor, hochflor
        │   ├─ Bid: €0.60-1.00
        │   └─ Landing Page: /collections/teppichboden (filtered)
        │
        └─ Ad Group 3: Purchase Intent
            ├─ Keywords: teppichboden kaufen, günstig, sale
            ├─ Bid: €0.80-1.50
            └─ Landing Page: /collections/teppichboden?sort=price

```

### Ad Copy Template

**Headline 1:** Hochwertiger Teppichboden  
**Headline 2:** Große Auswahl & Günstige Preise  
**Headline 3:** Versand innerhalb 48h  

**Description 1:** Europas größte Auswahl an Teppichboden. Langflor, Kurzflor, Hochflor – alles verfügbar.  
**Description 2:** ✓ Kostenloser Versand ✓ Geld-zurück-Garantie ✓ Sichere Zahlung  

**Display URL:** www.teppich-paradies.net/  
**Landing Page:** https://www.teppich-paradies.net/collections/teppichboden  

---

## Implementation Checklist

### Phase 2.1A: Campaign Setup (Manual via Google Ads)
- [ ] Create campaign "Teppichboden Search"
- [ ] Configure campaign settings (budget, languages, locations)
- [ ] Create 3 ad groups per structure above
- [ ] Add keywords to each ad group
- [ ] Configure negative keywords
- [ ] Create ad copy (3+ versions for A/B testing)
- [ ] Link Merchant Center Feed
- [ ] Set up bid strategy (Manual CPC initially)

### Phase 2.1B: Tracking & Attribution
- [ ] Verify Google Analytics 4 connection
- [ ] Confirm conversion tracking active
- [ ] Test UTM parameters:
  - `utm_source=google`
  - `utm_medium=cpc`
  - `utm_campaign=teppichboden_search`
  - `utm_content={ad_group_name}`
- [ ] Verify conversion pixels firing in Google Ads

### Phase 2.1C: Quality Score & Review
- [ ] Monitor Quality Scores (target: 7+)
- [ ] Review ad relevance
- [ ] Adjust bids based on initial performance
- [ ] Document baseline metrics:
  - Average CPC
  - CTR baseline
  - Conversion Rate baseline

---

## Expected Outcomes

### Baseline Metrics (First 2 Weeks)

| Metric | Target | Notes |
|--------|--------|-------|
| Impressions | 500-1000 | Depends on budget |
| Clicks | 25-50 | CTR ~3-5% |
| CTR | 3-5% | Google Search average |
| Average CPC | €0.50-1.00 | Competitive market |
| Conversions | 2-5 | Depends on conversion rate |
| ROAS | 2:1 minimum | Return on ad spend |

### Quality Score Expectations

- Target: 7-10 (Good to Excellent)
- Components: Ad Relevance, Expected CTR, Landing Page Experience
- Optimization: A/B test ad copy monthly

---

## Success Criteria

✅ **Phase 2.1 Complete when:**
1. Campaign is live and receiving impressions
2. Quality Score is 7+ for all ad groups
3. Conversion tracking confirmed active
4. Daily budget being spent appropriately (€20-50 as configured)
5. Click data flowing to Google Analytics 4
6. UTM parameters correctly appended to all clicks
7. Baseline metrics documented in performance report

---

## Known Constraints & Dependencies

- **Depends On:**
  - Phase 1.1 (Merchant Center) ✅
  - Phase 1.2 (Google Analytics 4) - IN PROGRESS
  - Phase 2 Budget allocation approval
  
- **Blocks:**
  - Phase 2.2 (Teppiche Campaign)
  - Phase 2.3 (Vinylboden Campaign)
  - Phase 3.1-3.3 (Page Optimization)
  - Phase 4 (Conversion Tracking & Dashboard)

---

## Monitoring & Optimization Timeline

### Week 1: Setup & Validation
- Monitor initial impressions and CTR
- Validate conversion tracking
- Document baseline metrics

### Week 2-3: A/B Testing
- Test 2-3 ad copy variations
- Adjust bids by performance
- Monitor Quality Scores

### Week 4: Handoff to Phase 2.2
- Create performance report
- Document lessons learned
- Prepare for Teppiche campaign (Issue #47)

---

## Files & Artifacts

- `automation/scripts/google-ads-phase-2-1-search-setup.md` - This file
- `automation/reports/GOOGLE_ADS_PHASE_2_1_REPORT.md` - Performance baseline (to be created)
- `config/google-ads-campaign-structure.json` - Campaign config template

---

## Next Steps

1. **Immediate:** Get Google Ads account access confirmed
2. **Day 1:** Create campaign per specifications above
3. **Day 2:** Configure tracking and verify conversion flow
4. **Week 1:** Monitor performance and document baseline
5. **Week 2-3:** A/B test and optimize
6. **Handoff:** Complete performance report for Phase 2.2

---

**Owner:** Teppich Paradies Marketing & Claude Code  
**Status:** Ready for Implementation  
**Version:** 1.0
