# Google Ads Phase 5.3 – Continuous Optimization Cycle
## Weeks 3-4 Performance Tuning & Budget Scaling

**Issue:** #57  
**Status:** In Development  
**Priority:** P1  
**Date:** 2026-09-03  
**Depends On:** Phase 5.2 (2 weeks monitoring complete), 500+ conversions collected  

**Vertiefendes Referenzmaterial:** Detaillierte Bid-Anpassungslogik und
Budget-Reallokationsregeln siehe
`automation/scripts/google-ads-bid-optimization-budget-reallocation.md`.

---

## Overview

Phase 5.3 implements continuous optimization based on 2+ weeks of performance data, focusing on bid adjustments, budget scaling, and campaign refinement during weeks 3-4 of the launch period.

---

## Week 3-4 Optimization Framework

### Daily Actions

```
Daily (10:00 AM, 15 min):
☐ Check ROAS: On target? If <target-20%, investigate
☐ Budget pace: Spending correctly?
☐ Conversion alerts: Any spikes/drops?
☐ Quality scores: Any <5? Pause if needed
☐ New issues? Document for weekly review
```

### Weekly Optimization Cycle (Friday)

```
Weekly (Friday 14:00, 60 min):

1. DATA ANALYSIS (15 min)
   - Calculate 7-day ROAS per campaign
   - Identify top 5 keywords (highest ROAS)
   - Identify bottom 5 keywords (lowest ROAS)
   - Quality score changes since Week 1

2. BID OPTIMIZATION (20 min)
   - Top 5 keywords: Reduce bids by 10-20%
   - Bottom 5 keywords: Increase by 20% or PAUSE if 0 conversions
   - Mid-range keywords: Hold bids
   - Estimate impact: How much will this improve ROAS?

3. BUDGET REALLOCATION (15 min)
   - Campaign ROAS comparison
   - Is top performer getting minimum share of budget?
   - Reallocate +/- 10-20% based on ROAS
   - Document changes and expected ROI impact

4. TESTING & ITERATIONS (10 min)
   - Launch new A/B test ad copy? (if current test complete)
   - Update landing pages based on feedback
   - Pause underperforming ad variations

Actions Implemented:
☐ Bid adjustments deployed
☐ Budget changes applied
☐ New ads launched
☐ Dashboard updated
```

---

## Bid Optimization Matrix

```
Quality Score Tier | Conversion Rate | Bid Action | Rationale
QS 9-10, CR >5% | Excellent | -15% | Reduce waste, premium positions
QS 8, CR 3-5% | Good | -5% | Slight optimization
QS 7, CR 2-3% | Fair | HOLD | Baseline, monitor
QS 6, CR 1-2% | Below Avg | +15% | Improve visibility
QS <6, CR <1% | Poor | PAUSE if 0 conv, else +25% | Fix quality issues first
```

---

## Budget Scaling Rules

### When to Scale Up

```
IF: Campaign ROAS > Target + 20%
THEN: Increase daily budget by 10-20%
Rationale: Profitable enough to allocate more investment
Example: €50 → €55-60 (if ROAS 3.5:1 vs. 2.5:1 target)
```

### When to Scale Down

```
IF: Campaign ROAS < Target - 20%
THEN: Decrease daily budget by 10-20%
Rationale: Poor efficiency, reduce losses
Example: €50 → €40-45 (if ROAS 1.5:1 vs. 2.5:1 target)
```

### When to Hold

```
IF: Campaign ROAS within ±20% of target
THEN: Maintain current budget
Rationale: Balanced performance, room to optimize bids first
```

---

## A/B Testing Framework

### Ad Copy Testing

```
TEST DURATION: Minimum 500 conversions per ad variant
SAMPLE SIZE: 2-4 weeks with 2-3 variations

Variant A (Control): Practical benefit
  "Praktischer Bodenbelag – Langlebig & Günstig"
  
Variant B (Lifestyle): Design focus
  "Elegante Designs für Ihr Zuhause"
  
Variant C (Value): Price focus
  "Premium Teppiche zu Outlet-Preisen"

Evaluation Criteria:
☐ CTR (click-through rate)
☐ Conversion rate (cost per conversion)
☐ Quality score impact

Winner: Ad with highest conversion rate + QS
Action: Pause worst performer, double down on winner
```

### Landing Page Testing

```
TEST ELEMENT: CTA button color, position, copy
HYPOTHESIS: Red CTA will improve conversion by 5-10%
MEASUREMENT: GA4 conversion tracking

Before: __ conversions / __ sessions = __%
After: __ conversions / __ sessions = __%
Improvement: +__%

Statistical Significance? ☐ YES (n>100 conversions) ☐ NO (keep testing)
Action: If significant, deploy winner. If not, test new element.
```

---

## Common Issues & Solutions

### Issue: ROAS Still Below Target

```
After 2+ weeks, if ROAS <target:

Root Cause Analysis:
☐ Landing page conversion issue? (A/B test CTA or messaging)
☐ Wrong audience targeting? (Review search terms)
☐ Ad copy mismatch? (Update ad text to landing page)
☐ Competitive pressure? (Check competitor ads)

Actions:
1. Pause lowest 20% of keywords
2. Increase bids on top 20% keywords
3. Test new ad copy (lifestyle vs. practical focus)
4. Improve landing page (A/B test button color, copy)

Timeline: 1-2 weeks, evaluate results
```

### Issue: Quality Scores Not Improving

```
Diagnosis:
1. Ad relevance: Does keyword appear in headline?
2. Landing page: Is it relevant to keyword + ad copy?
3. CTR: Is it above average for industry?

Improvements:
- Rewrite ad: Include keyword in headline 1
- Improve landing page: Add keyword to H1, optimize speed
- Refine targeting: Use phrase match instead of broad

Expected improvement: 1-2 QS points in 5-7 days
```

---

## End-of-Month Analysis

### Month 1 Performance Review

```
Campaign | Spend | Conversions | Revenue | ROAS | vs Target
Teppich. | €___ | ___ | €___ | __:1 | +/- ___
Teppiche | €___ | ___ | €___ | __:1 | +/- ___
Vinylbo. | €___ | ___ | €___ | __:1 | +/- ___
TOTAL | €___ | ___ | €___ | __:1 | +/- ___

Key Wins:
1. ________________ (ROAS __:1, up from __:1)
2. ________________ (conversions up __%)
3. ________________ (CPC down __)

Challenges:
1. ________________ (ROAS __:1, below target)
2. ________________ (QS issues, fix: __)
3. ________________ (budget constraint, solution: __)

Decisions for Month 2:
- Scale up: __________ (+30% budget)
- Hold: __________ (monitoring)
- Scale down: __________ (-20% budget)
- Pause: __________ (performance concern)

Expected Month 2 ROAS: __:1 (vs. Month 1: __:1)
```

---

## Success Criteria

✅ **Phase 5.3 Complete when:**
1. Week 3 optimization cycle completed and applied
2. Week 4 performance data analyzed and documented
3. ROAS trending toward target (+10-20% improvement)
4. Quality scores improving (80%+ of keywords QS 7+)
5. A/B test results analyzed and winners deployed
6. Budget allocation optimized (high performers scaled +10-20%)
7. Bid adjustments implemented and tracked
8. End-of-month report generated
9. Month 2 strategy documented
10. Team trained on continuous optimization procedures

---

**Status:** Ready for Implementation  
**Version:** 1.0  
**Next:** Month 2 Continuous Optimization, Scale-Up Phase
