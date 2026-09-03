# Google Ads Phase 2.2 – Search Campaign: Teppiche
## Setup & Implementation Guide

**Issue:** #47  
**Status:** In Development  
**Priority:** P1  
**Date:** 2026-09-03  
**Previous Phase:** #46 (Phase 2.1 - Teppichboden)  

---

## Overview

Phase 2.2 establishes Google Ads Search Campaigns for the "Teppiche" (carpets/rugs) product category. This phase follows Phase 2.1 (Teppichboden) and precedes Phase 2.3 (Vinylboden).

### Objectives

1. Create Search Campaign structure targeting Teppiche keywords
2. Configure ad copy with carpet-specific messaging and benefits
3. Set up bid strategies and budgets (separate from Teppichboden)
4. Link to conversion tracking and Phase 1.2 GA4 integration
5. Enable performance monitoring and category-specific optimization

### Key Differences from Phase 2.1

- **Audience:** Rug/carpet buyers (different intent than flooring)
- **Keywords:** Emphasis on decoration, design, comfort
- **Ad Copy:** Lifestyle messaging, color/style options
- **Landing Pages:** /collections/teppiche (distinct from teppichboden)
- **Bid Strategy:** May differ based on audience value

---

## Prerequisites

### Required Accounts & Access
- [ ] Google Ads Account (with Teppich Paradies linked)
- [ ] Phase 2.1 (Teppichboden campaign) active or completed
- [ ] Google Merchant Center (connected to Google Ads)
- [ ] Google Analytics 4 (Phase 1.2 - for conversion tracking)
- [ ] Shopify Store Admin Access

### Shopify Prerequisites
- [ ] Merchant Center Feed validated (Phase 1.1)
- [ ] Teppiche product collection configured
- [ ] Product data complete (descriptions, images, pricing)
- [ ] Conversion pixel installed (Phase 1.2)
- [ ] UTM tracking parameters configured
- [ ] /collections/teppiche page optimized for landing

---

## Teppiche Target Keywords

### Primary Keywords - Branding

| Keyword | Search Volume | Bid Priority | Match Type |
|---------|---------------|--------------|-----------|
| teppiche | High | High | Broad |
| teppiche kaufen | High | High | Phrase |
| perserteppiche | High | High | Phrase |
| orientteppiche | Medium | High | Phrase |
| moderne teppiche | High | High | Phrase |
| wohnzimmerteppiche | Medium | High | Phrase |
| kinder teppiche | Medium | Medium | Phrase |
| outdoor teppiche | Medium | Medium | Phrase |

### Primary Keywords - Style & Material

| Keyword | Search Volume | Bid Priority | Match Type |
|---------|---------------|--------------|-----------|
| sisal teppich | Medium | Medium | Phrase |
| hochflor teppich | Medium | High | Phrase |
| kurzflor teppich | Low | Medium | Phrase |
| baumwoll teppich | Low | Medium | Phrase |
| handgeknüpfter teppich | Low | High | Phrase |
| design teppich | Medium | Medium | Phrase |
| teppich grau | Low | Low | Phrase |
| teppich geometrisch | Low | Low | Phrase |

### Commercial Intent Keywords

| Keyword | Search Volume | Bid Priority | Match Type |
|---------|---------------|--------------|-----------|
| teppiche günstig | High | High | Phrase |
| teppiche sale | Medium | Medium | Phrase |
| teppiche reduziert | Medium | Medium | Phrase |
| teppiche ausverkauf | Low | Medium | Phrase |
| teppiche online bestellen | Medium | High | Phrase |

### Negative Keywords

- "teppich reinigung" (cleaning services - not sales)
- "teppich entfernen" (removal - not sales)
- "teppich muster" (patterns/samples - informational)
- "teppich anleitung" (instructions - informational)
- "wiki" (informational content)
- "definition" (informational)
- "gebrauchte" (used - not in inventory focus)

---

## Campaign Structure

### Campaign Configuration

```
Account: Teppich Paradies
  └─ Campaign: Teppiche Search
      ├─ Network: Google Search (not Display)
      ├─ Type: Search
      ├─ Locations: Germany (primary), Austria & Switzerland (secondary)
      ├─ Languages: German
      ├─ Daily Budget: €25-60 (adjustable; higher than Teppichboden)
      ├─ Bid Strategy: Manual CPC (later optimize by performance)
      └─ Ad Schedule: Continuous (optimization in Phase 5)
        │
        ├─ Ad Group 1: Teppiche Basics
        │   ├─ Keywords: teppiche, teppich kaufen
        │   ├─ Bid: €0.60-1.00
        │   └─ Landing Page: /collections/teppiche
        │
        ├─ Ad Group 2: Style & Design
        │   ├─ Keywords: moderne teppiche, perserteppiche, orientteppiche
        │   ├─ Bid: €0.80-1.20
        │   └─ Landing Page: /collections/teppiche?filter=style
        │
        ├─ Ad Group 3: Material Focus
        │   ├─ Keywords: sisal teppich, hochflor, baumwoll
        │   ├─ Bid: €0.70-1.10
        │   └─ Landing Page: /collections/teppiche?filter=material
        │
        └─ Ad Group 4: Commercial Intent
            ├─ Keywords: teppiche günstig, sale, reduziert
            ├─ Bid: €1.00-1.50 (higher conversion likely)
            └─ Landing Page: /collections/teppiche?sort=price
```

### Ad Copy Template

**Headline 1:** Wunderschöne Teppiche für Ihr Zuhause  
**Headline 2:** Hochwertige Qualität – Günstige Preise  
**Headline 3:** Versand innerhalb 48h – Kostenlos  

**Description 1:** Perserteppiche, Orientteppiche & moderne Designs. Große Auswahl, beste Qualität, unschlagbare Preise.  
**Description 2:** ✓ Kostenloser Versand ✓ 30-Tage Rückgabe ✓ Sichere Zahlung ✓ Schnelle Lieferung  

**Display URL:** www.teppich-paradies.net/  
**Landing Page:** https://www.teppich-paradies.net/collections/teppiche  

### Ad Copy Variations (A/B Testing)

#### Variation A: Lifestyle Focus
- "Teppiche, die Räume verwandeln"
- "Perfekt für Wohnzimmer, Schlafzimmer & mehr"

#### Variation B: Value Focus
- "Premium-Teppiche zu günstigen Preisen"
- "Bis zu 50% Rabatt auf ausgewählte Designs"

#### Variation C: Quality Focus
- "Handgeknüpfte Teppiche in Meisterqualität"
- "Trusted seit 20+ Jahren"

---

## Implementation Checklist

### Phase 2.2A: Campaign Setup (Manual via Google Ads)
- [ ] Create campaign "Teppiche Search"
- [ ] Configure campaign settings (budget €25-60, languages, locations)
- [ ] Create 4 ad groups per structure above
- [ ] Add keywords (30-40 keywords across groups)
- [ ] Configure negative keywords (10-15 terms)
- [ ] Create ad copy (3+ variations for A/B testing)
- [ ] Set up Smart Bidding (CPC initially, optimize week 2+)
- [ ] Link Merchant Center Feed
- [ ] Enable location targeting (Germany primary, AT/CH secondary)
- [ ] Set up audience exclusions (prior converters, brand searches)

### Phase 2.2B: Tracking & Attribution
- [ ] Verify GA4 connection active (from Phase 1.2)
- [ ] Confirm conversion tracking active and firing
- [ ] Test UTM parameters:
  - `utm_source=google`
  - `utm_medium=cpc`
  - `utm_campaign=teppiche_search`
  - `utm_content={ad_group_name}`
- [ ] Verify conversion pixels firing in Google Ads
- [ ] Test cart/checkout tracking (if ecommerce enabled)

### Phase 2.2C: Quality Score & Optimization
- [ ] Monitor Quality Scores (target: 7+)
- [ ] Review ad relevance and click-through rates
- [ ] Adjust bids based on performance vs. Teppichboden
- [ ] A/B test ad copy variations
- [ ] Document baseline metrics:
  - Average CPC (compare to Teppichboden)
  - CTR baseline
  - Conversion Rate baseline
  - Cost per conversion

### Phase 2.2D: Differentiation from Phase 2.1
- [ ] Verify bids are optimized separately (different audience value)
- [ ] Confirm landing pages are distinct
- [ ] Ensure ad copy doesn't overlap with Teppichboden
- [ ] Monitor for budget allocation fairness
- [ ] Document performance delta vs. Teppichboden

---

## Expected Outcomes

### Baseline Metrics (First 2 Weeks)

| Metric | Target | Notes |
|--------|--------|-------|
| Impressions | 800-1500 | Higher budget than Phase 2.1 |
| Clicks | 40-75 | Estimated 4-5% CTR |
| CTR | 4-5% | Lifestyle products often higher |
| Average CPC | €0.60-1.10 | Likely higher than Teppichboden |
| Conversions | 5-10 | ~7-13% conversion rate |
| ROAS | 2.5:1 minimum | Carpets higher value typically |

### Quality Score Expectations

- Target: 7-10 (Good to Excellent)
- Components: Ad Relevance, Expected CTR, Landing Page Experience
- Expected: Higher CTR than Teppichboden (lifestyle appeal)
- Note: May have lower initial CTR if audience is more niche

---

## Success Criteria

✅ **Phase 2.2 Complete when:**
1. Campaign is live and receiving impressions (800+ in first week)
2. Quality Score is 7+ for all 4 ad groups
3. Conversion tracking confirmed active and firing
4. Daily budget appropriately spent (€25-60 as configured)
5. Click data flowing to Google Analytics 4 with correct UTM params
6. At least 5+ conversions recorded in first 2 weeks
7. Baseline metrics documented in performance report
8. A/B testing of ad copy variations initiated
9. Budget allocation balanced with Phase 2.1 (Teppichboden)
10. Landing page performance acceptable (>2% conversion rate)

---

## Known Constraints & Dependencies

- **Depends On:**
  - Phase 1.1 (Merchant Center) ✅
  - Phase 1.2 (Google Analytics 4) - IN PROGRESS
  - Phase 2.1 (Teppichboden Campaign) - IN PROGRESS
  - Phase 2 Budget allocation approval
  
- **Blocks:**
  - Phase 2.3 (Vinylboden Campaign)
  - Phase 3.2 (Teppiche Page Optimization)
  - Phase 4 (Conversion Tracking & Dashboard)

---

## Performance Comparison Strategy

### Phase 2.1 vs Phase 2.2

Track these metrics side-by-side to understand category performance:

| Metric | Teppichboden (2.1) | Teppiche (2.2) | Notes |
|--------|-------------------|-----------------|-------|
| Avg CPC | Expected lower | Expected higher | Carpets = higher value |
| CTR | 3-5% baseline | 4-6% target | Lifestyle appeal |
| Conv Rate | TBD | TBD compare | Teppiche may vary |
| ROAS | 2:1 | 2.5:1 target | Higher margin expected |
| Cost per Conv | Calculate | Calculate | Direct comparison |

---

## Monitoring & Optimization Timeline

### Week 1: Setup & Validation
- Monitor initial impressions and engagement
- Validate conversion tracking is working
- Document baseline metrics for comparison
- Compare early performance vs. Teppichboden

### Week 2-3: A/B Testing & Optimization
- Test 3 ad copy variations (Lifestyle, Value, Quality)
- Adjust bids by performance and audience segment
- Monitor Quality Scores across ad groups
- Optimize landing page load times if needed

### Week 3-4: Campaign Scaling
- Increase budget if ROAS exceeds targets
- Pause underperforming keywords (QS <5)
- Expand keyword list based on search insights
- Handoff to Phase 2.3 (Vinylboden)

---

## Files & Artifacts

- `automation/scripts/google-ads-phase-2-2-search-setup.md` - This file
- `automation/reports/GOOGLE_ADS_PHASE_2_2_REPORT.md` - Performance baseline (to be created)
- `automation/reports/GOOGLE_ADS_PHASE_COMPARISON.md` - 2.1 vs 2.2 analysis (to be created)

---

## Next Steps

1. **Immediate:** Complete Phase 2.1 campaign setup and validation
2. **Day 1-2:** Create Phase 2.2 campaign per specifications
3. **Day 3:** Configure tracking and verify conversion flow
4. **Week 1:** Monitor performance and compare to Phase 2.1
5. **Week 2-3:** A/B test and optimize based on learnings
6. **Handoff:** Complete comparison report for Phase 2.3

---

**Owner:** Teppich Paradies Marketing & Claude Code  
**Status:** Ready for Implementation  
**Version:** 1.0  
**Related:** Phase 2.1 (#46), Phase 2.3 (#48)
