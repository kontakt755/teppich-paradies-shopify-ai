# Google Ads Phase 2.3 – Search Campaign: Vinylboden
## Setup & Implementation Guide

**Issue:** #48  
**Status:** In Development  
**Priority:** P1  
**Date:** 2026-09-03  
**Previous Phase:** #47 (Phase 2.2 - Teppiche)  

---

## Overview

Phase 2.3 establishes Google Ads Search Campaigns for the "Vinylboden" (vinyl flooring) product category. This phase follows Phase 2.2 (Teppiche) and completes the Search Campaign expansion across all three product categories.

### Objectives

1. Create Search Campaign structure targeting Vinylboden keywords
2. Configure ad copy with vinyl flooring-specific benefits and use cases
3. Set up bid strategies and budgets (distinct from Teppichboden and Teppiche)
4. Link to conversion tracking and Phase 1.2 GA4 integration
5. Enable performance monitoring and category-specific optimization

### Key Positioning vs Other Phases

- **vs Phase 2.1 (Teppichboden):** Technical/practical messaging, high search volume, price-conscious
- **vs Phase 2.2 (Teppiche):** Practical vs lifestyle, durable vs aesthetic, different audience segments
- **Vinylboden Focus:** Durability, water-resistance, easy maintenance, modern styling

---

## Prerequisites

### Required Accounts & Access
- [ ] Google Ads Account (with Teppich Paradies linked)
- [ ] Phase 2.1 (Teppichboden campaign) active or completed
- [ ] Phase 2.2 (Teppiche campaign) active or completed
- [ ] Google Merchant Center (connected to Google Ads)
- [ ] Google Analytics 4 (Phase 1.2 - for conversion tracking)
- [ ] Shopify Store Admin Access

### Shopify Prerequisites
- [ ] Merchant Center Feed validated (Phase 1.1)
- [ ] Vinylboden product collection configured
- [ ] Product data complete (descriptions, technical specs, images, pricing)
- [ ] Conversion pixel installed (Phase 1.2)
- [ ] UTM tracking parameters configured
- [ ] /collections/vinylboden page optimized with technical content
- [ ] Product comparison tool available for vinyl types

---

## Vinylboden Target Keywords

### Primary Keywords - Product Type

| Keyword | Search Volume | Bid Priority | Match Type |
|---------|---------------|--------------|-----------|
| vinylboden | High | High | Broad |
| vinylboden kaufen | High | High | Phrase |
| klick vinylboden | High | High | Phrase |
| vinyl laminat | Medium | High | Phrase |
| luxury vinyl plank | Low | Medium | Phrase |
| vinyl planken | Medium | Medium | Phrase |
| vinyl dielen | Medium | Medium | Phrase |
| klicksystem vinyl | Medium | High | Phrase |

### Primary Keywords - Installation & Usage

| Keyword | Search Volume | Bid Priority | Match Type |
|---------|---------------|--------------|-----------|
| vinylboden verlegen | Medium | Medium | Phrase |
| wasserfestes vinylboden | Medium | High | Phrase |
| vinylboden badezimmer | Medium | High | Phrase |
| vinylboden küche | High | High | Phrase |
| vinylboden fußbodenheizung | Low | Medium | Phrase |
| vinylboden allergikerfreundlich | Low | Low | Phrase |
| rutschfester vinylboden | Low | Medium | Phrase |
| geräuscharm vinylboden | Low | Medium | Phrase |

### Commercial Intent Keywords

| Keyword | Search Volume | Bid Priority | Match Type |
|---------|---------------|--------------|-----------|
| vinylboden günstig | High | High | Phrase |
| vinylboden sale | Medium | Medium | Phrase |
| vinylboden outlet | Low | Medium | Phrase |
| vinylboden versand | Medium | High | Phrase |
| vinylboden online bestellen | Medium | High | Phrase |
| vinylboden paket kaufen | Low | High | Phrase |

### Negative Keywords

- "vinylboden entfernen" (removal - not sales)
- "vinylboden reinigung" (cleaning - not sales)
- "vinylboden reparatur" (repair - not sales)
- "allergy" (allergen-specific, likely low conversion)
- "muster" (samples - informational)
- "kostenloser versand" (already in messaging)
- "wiki" (informational)
- "gebrauchte" (used - not in inventory)

---

## Campaign Structure

### Campaign Configuration

```
Account: Teppich Paradies
  └─ Campaign: Vinylboden Search
      ├─ Network: Google Search (not Display)
      ├─ Type: Search
      ├─ Locations: Germany (primary), Austria & Switzerland (secondary)
      ├─ Languages: German
      ├─ Daily Budget: €30-70 (adjustable; higher than both Phase 2.1 & 2.2)
      ├─ Bid Strategy: Manual CPC (optimize to ROAS after week 1)
      └─ Ad Schedule: Continuous (optimization in Phase 5)
        │
        ├─ Ad Group 1: Vinylboden Basics
        │   ├─ Keywords: vinylboden, vinylboden kaufen, klick vinylboden
        │   ├─ Bid: €0.70-1.10
        │   └─ Landing Page: /collections/vinylboden
        │
        ├─ Ad Group 2: Installation & Technical
        │   ├─ Keywords: vinylboden verlegen, fußbodenheizung, rutschfest
        │   ├─ Bid: €0.80-1.30
        │   └─ Landing Page: /collections/vinylboden/installation
        │
        ├─ Ad Group 3: Room-Specific
        │   ├─ Keywords: badezimmer, küche, wasserfestes vinylboden
        │   ├─ Bid: €0.90-1.40
        │   └─ Landing Page: /collections/vinylboden?filter=usage
        │
        └─ Ad Group 4: Commercial Intent
            ├─ Keywords: günstig, sale, outlet, versand, online bestellen
            ├─ Bid: €1.10-1.70 (highest; strong purchase intent)
            └─ Landing Page: /collections/vinylboden?sort=price&filter=promotion
```

### Ad Copy Template

**Headline 1:** Premium Vinylboden für jeden Raum  
**Headline 2:** Wasserfest, robust & strapazierfähig  
**Headline 3:** Schnelle Lieferung – Kostenlos versand  

**Description 1:** Modernes Klick-Vinyl für Küche, Badezimmer & Wohnbereich. Leicht zu verlegen, langlebig, wartungsfrei.  
**Description 2:** ✓ Wasserfest & allergikerfreundlich ✓ UV-stabil ✓ 25+ Jahre Lebensdauer ✓ Sichere Zahlung  

**Display URL:** www.teppich-paradies.net/  
**Landing Page:** https://www.teppich-paradies.net/collections/vinylboden  

### Ad Copy Variations (A/B Testing)

#### Variation A: Durability Focus
- "Vinylboden – Das hält ein Leben lang"
- "Wasserfest, sturzfest, wartungsfrei"

#### Variation B: Modern Design Focus
- "Moderne Vinylboden Designs"
- "Optik von echtem Holz – Robustheit von Kunststoff"

#### Variation C: Budget/Value Focus
- "Premium-Qualität zu Outlet-Preisen"
- "Bis zu 60% Rabatt auf Vinyl-Kollektionen"

---

## Implementation Checklist

### Phase 2.3A: Campaign Setup (Manual via Google Ads)
- [ ] Create campaign "Vinylboden Search"
- [ ] Configure campaign settings (budget €30-70, languages, locations)
- [ ] Create 4 ad groups per structure above
- [ ] Add keywords (35-40 keywords across groups)
- [ ] Configure negative keywords (12-15 terms)
- [ ] Create ad copy (3+ variations for A/B testing)
- [ ] Set up Smart Bidding (Manual CPC initially, optimize to ROAS)
- [ ] Link Merchant Center Feed (ensure Klick Vinyl products highlighted)
- [ ] Enable location targeting (Germany primary, AT/CH secondary)
- [ ] Set up audience exclusions (prior converters, brand searches)

### Phase 2.3B: Category-Specific Configuration
- [ ] Highlight Klick-Vinyl (main product) vs Klebe-Vinyl in messaging
- [ ] Ensure Rollenware is properly excluded (per Phase 1.1 rules)
- [ ] Configure custom parameters for technical specs (flooring type)
- [ ] Set up dynamic ads if merchant feed includes technical attributes
- [ ] Enable product extensions (if applicable for Shopify)

### Phase 2.3C: Tracking & Attribution
- [ ] Verify GA4 connection active (from Phase 1.2)
- [ ] Confirm conversion tracking active and firing
- [ ] Test UTM parameters:
  - `utm_source=google`
  - `utm_medium=cpc`
  - `utm_campaign=vinylboden_search`
  - `utm_content={ad_group_name}`
- [ ] Verify conversion pixels firing in Google Ads
- [ ] Test cart/checkout flow (especially for bulk orders)

### Phase 2.3D: Quality Score & Performance
- [ ] Monitor Quality Scores (target: 7+)
- [ ] Review ad relevance and click-through rates
- [ ] Compare performance metrics across all three phases (2.1, 2.2, 2.3)
- [ ] Adjust bids based on room-specific performance
- [ ] A/B test ad copy variations (prioritize durability vs design)
- [ ] Document baseline metrics:
  - Average CPC (likely highest of Phase 2)
  - CTR baseline (should be solid; practical intent)
  - Conversion Rate baseline
  - Cost per conversion

---

## Expected Outcomes

### Baseline Metrics (First 2 Weeks)

| Metric | Target | Notes |
|--------|--------|-------|
| Impressions | 1000-1800 | Highest budget (€30-70) |
| Clicks | 50-90 | Estimated 4-5% CTR |
| CTR | 4-5% | Practical product with clear need |
| Average CPC | €0.80-1.30 | Likely highest of three phases |
| Conversions | 8-15 | 15-18% conversion rate (practical intent) |
| ROAS | 2.5:1 minimum | Vinyl typically strong ROI |

### Quality Score Expectations

- Target: 7-10 (Good to Excellent)
- Components: Ad Relevance, Expected CTR, Landing Page Experience
- Expected: Strong CTR due to practical need + product availability
- Note: Technical keywords may have lower initial CTR (build over time)

---

## Performance Analysis: Phase 2 Comparison

### Expected Category Performance

| Metric | 2.1 Teppichboden | 2.2 Teppiche | 2.3 Vinylboden |
|--------|-------------------|---------------|-----------------|
| Budget/Day | €20-50 | €25-60 | €30-70 |
| Expected CTR | 3-5% | 4-6% | 4-5% |
| Avg CPC | €0.50-1.00 | €0.60-1.10 | €0.80-1.30 |
| Conv Rate | ~10% est. | ~7% est. | ~15% est. |
| ROAS Target | 2:1 | 2.5:1 | 2.5:1 |
| Messaging | Practical | Lifestyle | Durability |
| Audience | Flooring buyers | Design-conscious | Practical/technical |

---

## Success Criteria

✅ **Phase 2.3 Complete when:**
1. Campaign is live and receiving impressions (1000+ in first week)
2. Quality Score is 7+ for 3+ of 4 ad groups
3. Conversion tracking confirmed active and firing
4. Daily budget appropriately spent (€30-70 as configured)
5. Click data flowing to Google Analytics 4 with correct UTM params
6. At least 8+ conversions recorded in first 2 weeks
7. Baseline metrics documented in comprehensive report
8. A/B testing of ad copy variations showing clear winner
9. Budget allocation balanced across all three Phase 2 campaigns
10. Landing page performance strong (15%+ conversion rate)
11. Technical keywords (verlegen, fußbodenheizung) building quality scores
12. Klick-Vinyl products getting majority of impressions (vs Klebe-Vinyl)

---

## Known Constraints & Dependencies

- **Depends On:**
  - Phase 1.1 (Merchant Center) ✅
  - Phase 1.2 (Google Analytics 4) - IN PROGRESS
  - Phase 2.1 (Teppichboden Campaign) - IN PROGRESS
  - Phase 2.2 (Teppiche Campaign) - IN PROGRESS
  - Phase 2 Budget allocation approval
  
- **Blocks:**
  - Phase 3.3 (Vinylboden Page Optimization)
  - Phase 4 (Conversion Tracking & Dashboard)
  - Phase 5.1+ (Campaign Launch & Optimization)

---

## Cross-Phase Optimization Strategy

### Phase 2 Complete: Budget Allocation Review

Once all three Phase 2 campaigns are live (approximately Week 3-4), review:

1. **Budget Efficiency**: Which category has best ROAS?
   - Reallocate budget from lower to higher performers
   - Minimum viable budgets: €15/day per category
   - Growth potential: up to €50/day top performer

2. **Keyword Performance**: Which keywords drive conversions?
   - Consolidate high-performers into dedicated ad groups
   - Pause underperformers (QS <5, CTR <2%)
   - Expand successful keyword themes

3. **Audience Insights**: Are there overlaps?
   - Review search queries across all three campaigns
   - Identify if users search multiple categories
   - Create remarketing audiences for cross-selling

---

## Monitoring & Optimization Timeline

### Week 1: Setup & Validation
- Monitor initial impressions and engagement
- Validate conversion tracking is working
- Document baseline metrics
- Compare vs Phase 2.1 & 2.2 early data

### Week 2-3: A/B Testing & Optimization
- Test 3 ad copy variations (Durability, Design, Value)
- Adjust bids by room-specific performance
- Monitor Quality Scores across ad groups
- Identify top-performing keywords

### Week 3-4: Cross-Phase Analysis
- Prepare comprehensive Phase 2 report
- Calculate ROAS for each category
- Recommend budget reallocation
- Handoff to Phase 3 (Page Optimization)

---

## Files & Artifacts

- `automation/scripts/google-ads-phase-2-3-search-setup.md` - This file
- `automation/reports/GOOGLE_ADS_PHASE_2_3_REPORT.md` - Performance baseline (to be created)
- `automation/reports/GOOGLE_ADS_PHASE_2_COMPLETE.md` - Cross-phase analysis (to be created)

---

## Next Steps

1. **Immediate:** Complete Phase 2.2 campaign validation
2. **Day 1-2:** Create Phase 2.3 campaign per specifications
3. **Day 3:** Configure tracking and verify conversion flow
4. **Week 1:** Monitor performance across all three Phase 2 campaigns
5. **Week 2-3:** A/B test and optimize based on learnings
6. **Week 3-4:** Prepare comprehensive Phase 2 report with cross-analysis
7. **Handoff:** Begin Phase 3 (Page Optimization for each category)

---

**Owner:** Teppich Paradies Marketing & Claude Code  
**Status:** Ready for Implementation  
**Version:** 1.0  
**Related:** Phase 2.1 (#46), Phase 2.2 (#47), Phase 3.1-3.3 (#49-51)
