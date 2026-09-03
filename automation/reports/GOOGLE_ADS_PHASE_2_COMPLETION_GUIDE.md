# Google Ads Phase 2 – Search Campaign Completion & Analysis Guide

**Phase:** Phase 2 (Complete)  
**Covers:** Issues #46-48 (Phase 2.1, 2.2, 2.3)  
**Status:** Ready for Execution  
**Date:** 2026-09-03  

---

## Executive Summary

Phase 2 represents the full expansion of Google Ads Search Campaigns across Teppich Paradies' three primary product categories:

| Phase | Category | Budget | Keywords | Ad Groups | Status |
|-------|----------|--------|----------|-----------|--------|
| 2.1 | Teppichboden | €20-50/day | 8 primary | 3 | PR #72 ✅ |
| 2.2 | Teppiche | €25-60/day | 27+ primary | 4 | PR #73 ✅ |
| 2.3 | Vinylboden | €30-70/day | 30+ primary | 4 | PR #74 ✅ |

**Combined Budget:** €75-180/day  
**Total Keywords:** 65+ across all campaigns  
**Total Ad Groups:** 11 distinct ad groups  
**Expected Combined ROAS:** 2-2.5:1  

---

## Phase 2 Architecture Overview

### Campaign Structure

```
Google Ads Account: Teppich Paradies
├─ Campaign 2.1: Teppichboden Search (€20-50/day)
│  ├─ Ad Group 1: Basics (Broad match)
│  ├─ Ad Group 2: Product Specific (Phrase match)
│  └─ Ad Group 3: Commercial Intent (Exact match)
│
├─ Campaign 2.2: Teppiche Search (€25-60/day)
│  ├─ Ad Group 1: Basics (Branding)
│  ├─ Ad Group 2: Style & Design
│  ├─ Ad Group 3: Material Focus
│  └─ Ad Group 4: Commercial Intent
│
└─ Campaign 2.3: Vinylboden Search (€30-70/day)
   ├─ Ad Group 1: Basics (Product Type)
   ├─ Ad Group 2: Installation & Technical
   ├─ Ad Group 3: Room-Specific
   └─ Ad Group 4: Commercial Intent
```

### Unified Tracking Strategy

All campaigns use consistent UTM parameters:
- `utm_source=google`
- `utm_medium=cpc`
- `utm_campaign={phase_2_1|phase_2_2|phase_2_3}`
- `utm_content={ad_group_name}`

This enables:
- ✅ GA4 conversion tracking across all three campaigns
- ✅ Side-by-side performance comparison
- ✅ Budget allocation optimization
- ✅ ROI analysis by category

---

## Phase 2 Timeline & Execution Plan

### Week 1: Campaign Setup (Day 1-7)

#### Day 1-2: Phase 2.1 Setup
- [ ] Create "Teppichboden Search" campaign
- [ ] Configure budget €20-50, locations, languages
- [ ] Add 3 ad groups with 8 keywords
- [ ] Create 3 ad copy variations
- [ ] Set negative keywords
- [ ] Link Merchant Center Feed
- [ ] **Status Target:** Campaign live, impressions incoming

#### Day 3-4: Phase 2.2 Setup
- [ ] Create "Teppiche Search" campaign
- [ ] Configure budget €25-60, locations (broader)
- [ ] Add 4 ad groups with 27+ keywords
- [ ] Create lifestyle-focused ad copy (3 variations)
- [ ] Configure negative keywords (10-15)
- [ ] Link Merchant Center Feed
- [ ] **Status Target:** Campaign live, 50+ impressions/day

#### Day 5-6: Phase 2.3 Setup
- [ ] Create "Vinylboden Search" campaign
- [ ] Configure budget €30-70, locations
- [ ] Add 4 ad groups with 30+ keywords
- [ ] Create durability-focused ad copy (3 variations)
- [ ] Technical config: Klick-Vinyl emphasis, Rollenware exclusion
- [ ] Link Merchant Center Feed
- [ ] **Status Target:** Campaign live, technical keywords active

#### Day 7: Verification & Monitoring Setup
- [ ] Verify all three campaigns receiving impressions
- [ ] Confirm GA4 conversion tracking active
- [ ] Test UTM parameter flow to Analytics
- [ ] Set up Google Ads conversion tracking
- [ ] Document baseline metrics for all three
- [ ] **Status Target:** All systems operational

### Week 2: Performance Monitoring (Day 8-14)

#### Daily Activities
- [ ] Monitor impressions, clicks, CTR across campaigns
- [ ] Check Quality Scores (target 7+)
- [ ] Review conversion tracking data
- [ ] Monitor daily budget spend
- [ ] Document anomalies (unusual CTR spikes, low impressions)

#### A/B Testing Kickoff
- [ ] Pause lower-performing ad copy variants
- [ ] Increase bids on high-CTR keywords
- [ ] Add keywords from search queries (high CTR, no conversions)

#### Performance Milestones
- **Phase 2.1:** 500+ impressions, 20+ clicks, 3+ conversions
- **Phase 2.2:** 800+ impressions, 35+ clicks, 5+ conversions
- **Phase 2.3:** 1000+ impressions, 45+ clicks, 8+ conversions

### Week 3: Optimization & Analysis (Day 15-21)

#### A/B Testing Results
- [ ] Analyze ad copy performance across variations
- [ ] Document winning ad copy themes:
  - **2.1 Winner:** Likely practical/price messaging
  - **2.2 Winner:** Likely lifestyle/design messaging
  - **2.3 Winner:** Likely durability/maintenance messaging
- [ ] Pause underperforming variations (lowest CTR)
- [ ] Scale top performers with increased bid

#### Quality Score Improvements
- [ ] Identify keywords with QS <5
- [ ] Increase bids on 7+ QS keywords
- [ ] Refine ad copy for low-relevance keywords
- [ ] Add negative keywords based on irrelevant searches

#### Cross-Campaign Analysis
- [ ] Compare CPC across campaigns:
  - 2.1 Expected: €0.50-1.00
  - 2.2 Expected: €0.60-1.10
  - 2.3 Expected: €0.80-1.30
- [ ] Calculate conversion rate by category
- [ ] Determine ROAS for each campaign
- [ ] Identify budget reallocation opportunities

#### Conversion Insights
- [ ] Analyze conversion paths (search query → landing page → conversion)
- [ ] Identify top converting keywords by category
- [ ] Check cart abandonment (if tracked)
- [ ] Review average order value by campaign

### Week 4: Budget Optimization & Handoff (Day 22-28)

#### Performance-Based Budget Reallocation
- [ ] Rank campaigns by ROAS (highest first)
- [ ] Increase budget for top 2 campaigns (10-20%)
- [ ] Maintain minimum budgets for all three (€15/day each)
- [ ] Example scenario:
  - **Phase 2.3 (Best):** €30→50/day (+20)
  - **Phase 2.2 (Good):** €25→35/day (+10)
  - **Phase 2.1 (Baseline):** €20→20/day (maintain)
  - **Total:** €75-105/day (up from €75)

#### Conversion Tracking Verification
- [ ] Confirm pixel firing on all conversion events
- [ ] Validate GA4 ecommerce tracking
- [ ] Test order tracking and value attribution
- [ ] Document any discrepancies between GA4 and Google Ads

#### Phase 2 Completion Report
- [ ] Generate performance summary for each campaign
- [ ] Document baseline metrics (will be compared in Phase 5)
- [ ] List optimization recommendations for Phase 5
- [ ] Create side-by-side performance comparison table

#### Handoff to Phase 3
- [ ] Confirm Phase 3 (Page Optimization) prerequisites met:
  - [ ] Content ready for Teppichboden page optimization (#49)
  - [ ] Content ready for Teppiche page optimization (#50)
  - [ ] Content ready for Vinylboden page optimization (#51)
- [ ] Document learnings from Phase 2 keywords (feed into Phase 3)
- [ ] Prioritize Phase 3.1-3.3 based on Phase 2 performance

---

## Phase 2 Success Metrics

### Campaign-Level KPIs

#### Phase 2.1: Teppichboden
- ✅ Quality Score: 7+ (all ad groups)
- ✅ Click-Through Rate: 3-5%
- ✅ Average CPC: €0.50-1.00
- ✅ Conversion Rate: 10%+
- ✅ ROAS: 2:1 minimum
- ✅ Weekly Budget Spend: €140-350

#### Phase 2.2: Teppiche
- ✅ Quality Score: 7+ (3+ of 4 ad groups)
- ✅ Click-Through Rate: 4-6%
- ✅ Average CPC: €0.60-1.10
- ✅ Conversion Rate: 7%+
- ✅ ROAS: 2.5:1 minimum
- ✅ Weekly Budget Spend: €175-420

#### Phase 2.3: Vinylboden
- ✅ Quality Score: 7+ (3+ of 4 ad groups)
- ✅ Click-Through Rate: 4-5%
- ✅ Average CPC: €0.80-1.30
- ✅ Conversion Rate: 15%+
- ✅ ROAS: 2.5:1 minimum
- ✅ Weekly Budget Spend: €210-490

### Phase 2 Overall KPIs

| Metric | Target | Notes |
|--------|--------|-------|
| Combined Weekly Budget | €525-1260 | €75-180/day |
| Total Impressions (Week 1-4) | 10,000+ | Across all campaigns |
| Total Clicks (Week 1-4) | 500+ | Combined CTR 4-5% |
| Total Conversions (Week 1-4) | 50+ | Combined conv rate 10%+ |
| Average ROAS | 2.2:1 | Target: profitability |
| Quality Score Average | 7.5+ | Most keywords |
| Cost per Conversion | €8-12 | Depends on AOV |

---

## Phase 2 Risks & Mitigation

### Risk: Low Quality Scores (<5)

**Impact:** Increased CPC, reduced impressions  
**Mitigation:**
- Review ad copy relevance to keywords
- Improve landing page load speed
- Add negative keywords to remove irrelevant traffic
- A/B test ad copy variations

**Prevention:**
- Audit ad groups before launch
- Group keywords by theme
- Use exact/phrase match for high-value keywords

### Risk: High CPC, Low Conversion Rate

**Impact:** Negative ROAS, budget burnout  
**Mitigation:**
- Identify top-converting keywords (pause underperformers)
- Increase bid on high-quality keywords
- Refine landing page messaging
- Test alternate landing pages

**Prevention:**
- Set conservative daily budgets initially
- Monitor spend closely first week
- Use conversion tracking from day 1

### Risk: GA4 Tracking Issues

**Impact:** No visibility into conversions, optimization blind spot  
**Mitigation:**
- Test conversion pixels before launch
- Verify UTM parameters on landing pages
- Cross-check Google Ads conversions vs GA4
- Set up alerts for tracking discrepancies

**Prevention:**
- Coordinate with Phase 1.2 (GA4 setup)
- Test tracking setup in staging first
- Document tracking flow (pixels, events, UTM)

### Risk: Unequal Budget Allocation

**Impact:** Some categories underperform due to insufficient budget  
**Mitigation:**
- Weekly budget review (Week 2-4)
- Rebalance based on ROAS (high performers get more)
- Maintain minimum budgets per campaign

**Prevention:**
- Start with planned budget allocation
- Set daily budget limits
- Document reallocation decisions

---

## Expected Phase 2 Outcomes

### Best Case (Optimistic)

| Metric | 2.1 | 2.2 | 2.3 | Combined |
|--------|-----|-----|-----|----------|
| Conversions (4 wks) | 20 | 15 | 25 | **60** |
| Cost per Conv | €10 | €12 | €8.50 | €9.85 |
| Total Spend (4 wks) | €200 | €180 | €215 | **€595** |
| Revenue (AOV €50) | €1000 | €750 | €1250 | **€3000** |
| ROAS | 5:1 | 4.2:1 | 5.8:1 | **5:1** |

**Likelihood:** 20% (requires excellent execution & high AOV)

### Expected Case (Realistic)

| Metric | 2.1 | 2.2 | 2.3 | Combined |
|--------|-----|-----|-----|----------|
| Conversions (4 wks) | 14 | 10 | 16 | **40** |
| Cost per Conv | €14 | €18 | €13 | €15 |
| Total Spend (4 wks) | €196 | €180 | €208 | **€584** |
| Revenue (AOV €50) | €700 | €500 | €800 | **€2000** |
| ROAS | 3.6:1 | 2.8:1 | 3.8:1 | **3.4:1** |

**Likelihood:** 60% (normal performance, some optimization)

### Conservative Case (Pessimistic)

| Metric | 2.1 | 2.2 | 2.3 | Combined |
|--------|-----|-----|-----|----------|
| Conversions (4 wks) | 8 | 5 | 10 | **23** |
| Cost per Conv | €24 | €36 | €21 | €25 |
| Total Spend (4 wks) | €192 | €180 | €210 | **€582** |
| Revenue (AOV €50) | €400 | €250 | €500 | **€1150** |
| ROAS | 2.1:1 | 1.4:1 | 2.4:1 | **1.98:1** |

**Likelihood:** 20% (execution issues, low conversions)

---

## Phase 2 Success Criteria (Go/No-Go)

### PASS Criteria (Phase 2 Complete)

✅ **Required (ALL must pass):**
1. All 3 campaigns live and receiving impressions (1000+/wk)
2. Quality Score 7+ for 75%+ of keywords across all campaigns
3. Conversion tracking active and verified in GA4
4. At least 30 conversions total across 3 campaigns (4 weeks)
5. Average ROAS 2:1 or higher
6. No critical bugs or tracking failures

✅ **Recommended (MOST should pass):**
- A/B testing initiated; winning ad copy identified
- Daily budget spend within 90-110% of target
- CTR matches or exceeds Google search averages
- Conversion rate 8%+ (Phase 2.3 target)
- Clear recommendations for Phase 5 optimization

### NEEDS IMPROVEMENT (Yellow Flag)

🟡 **Issues requiring attention but not blocking:**
- Quality Score 5-6 (below 7 target): Requires ad copy optimization
- ROAS 1.5-2:1 (below 2 target): Requires bid or landing page optimization
- CTR 2-3% (below expected 3-5%): May indicate messaging mismatch

### STOP/REPLAN (Red Flag)

🔴 **Critical issues requiring intervention:**
- Quality Score <5 (most keywords): Pause campaigns, rebuild structure
- Zero conversions (after 1000+ clicks): Tracking issue or landing page problem
- ROAS <1.5 (spending more than generating): Pause and review strategy
- Daily spend >150% of target: Budget overruns, bid strategy issue

---

## Handoff to Phase 3

### Prerequisites for Phase 3 Success

Phase 2 must deliver:
- ✅ Keyword performance insights (top keywords to feature on pages)
- ✅ Landing page feedback (what users search for, what they convert on)
- ✅ Messaging validation (which ad copy themes work best)
- ✅ Budget allocation (recommend budget by category for Phase 3+)
- ✅ Audience insights (who converts, what pages they visit)

### Phase 3 Optimization (Issues #49-51)

Phase 3 uses Phase 2 learnings to optimize landing pages:

- **Phase 3.1 (#49):** Teppichboden page optimization
  - Incorporate top-performing keywords
  - Emphasize practical/price messaging (won't work in Phase 2.1)
  - Add technical specs to support search intent
  
- **Phase 3.2 (#50):** Teppiche page optimization
  - Add lifestyle/design content
  - Style gallery and visual merchandising
  - Feature best-performing carpet types from Phase 2.2

- **Phase 3.3 (#51):** Vinylboden page optimization
  - Add installation guides and technical specs
  - Room-specific product recommendations
  - Feature durability/maintenance benefits

---

## Files & Documentation

### Produced in Phase 2

- `automation/scripts/google-ads-phase-2-1-search-setup.md` - Phase 2.1 guide (PR #72)
- `automation/scripts/google-ads-phase-2-2-search-setup.md` - Phase 2.2 guide (PR #73)
- `automation/scripts/google-ads-phase-2-3-search-setup.md` - Phase 2.3 guide (PR #74)
- `automation/scripts/verify-google-ads-tracking.mjs` - Tracking verification script (PR #72)
- `automation/reports/GOOGLE_ADS_PHASE_2_COMPLETION_GUIDE.md` - This file

### To Be Produced During Phase 2 Execution

- `automation/reports/GOOGLE_ADS_PHASE_2_1_REPORT.md` - Teppichboden baseline metrics
- `automation/reports/GOOGLE_ADS_PHASE_2_2_REPORT.md` - Teppiche baseline metrics
- `automation/reports/GOOGLE_ADS_PHASE_2_3_REPORT.md` - Vinylboden baseline metrics
- `automation/reports/GOOGLE_ADS_PHASE_2_COMPLETE.md` - Cross-phase analysis & recommendations

---

## Contact & Escalation

### Phase 2 Owner

- **Planning & Strategy:** Claude Code (autonomous)
- **Setup & Configuration:** Google Ads Specialist (Ahmet or delegate)
- **Monitoring & Optimization:** Google Ads Specialist + Claude Code

### Escalation Contacts

| Issue | Contact | Action |
|-------|---------|--------|
| Quality Score <5 | Google Ads Specialist | Ad copy/landing page audit |
| Tracking failure | GA4 Owner | Pixel & event debugging |
| Budget overruns | Finance | Budget reallocation approval |
| ROAS <1.5 | Marketing Lead | Strategy review + pause decision |

---

## Next Steps

1. **Approval:** Review Phase 2 strategy and approve budget allocation
2. **Setup:** Execute Week 1 campaign setup (Day 1-7)
3. **Monitoring:** Daily tracking Week 2-4
4. **Analysis:** Produce Phase 2 completion report (Week 4)
5. **Handoff:** Begin Phase 3 (Page Optimization) planning

---

**Status:** Ready for Execution  
**Version:** 1.0  
**Last Updated:** 2026-09-03  
**Next Review:** After Phase 2.1 live (Day 2)
