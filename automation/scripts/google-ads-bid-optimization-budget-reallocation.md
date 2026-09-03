# Google Ads – Bid Optimization & Budget Reallocation
## Performance Tuning & ROAS-Based Bidding Guide (Supplementary)

**Issue:** Nicht an eine einzelne Issue gebunden – Referenzmaterial für Phase 5.3 (#57)
**Status:** In Development
**Priority:** P1
**Date:** 2026-09-03
**Depends On:** Phase 4.1 (#52) conversion tracking active, 100+ conversions collected

---

## Hinweis zur Einordnung

Dieses Dokument wurde ursprünglich fälschlich als "Phase 4.2" unter Issue #53
angelegt. Issue #53 ("UTM Parameter einrichten") wird tatsächlich von
`automation/scripts/google-ads-phase-4-2-utm-parameters.md` abgedeckt. Der
Inhalt hier bleibt gültig und wertvoll, ist aber **kein eigenständiger
Phasen-Schritt** mit zugehöriger Issue – er dient als vertiefendes
Referenzmaterial für die Bid-Anpassungen, die in Phase 5.3
("Optimierungs-Cycle", Issue #57) wöchentlich durchgeführt werden.

---

## Overview

Dieser Guide optimiert Gebote und verteilt Budget über die Phase-2-Kampagnen (Teppichboden, Teppiche, Vinylboden) neu, basierend auf realen Conversion-Daten und ROAS-Performance, um Kampagneneffizienz und ROI zu maximieren.

### Objectives

1. Calculate ROAS (Return on Ad Spend) baseline for each campaign
2. Implement target ROAS bidding strategy
3. Adjust keyword-level bids based on performance
4. Reallocate budget to high-performing product categories
5. Optimize quality scores through bid adjustments
6. Set up automated bid rules for continuous optimization
7. Document bid strategy and decision framework

### Success Metrics

**Bid Optimization Goals:**
- ✅ All campaigns using Target ROAS bidding (or CPA alternative)
- ✅ ROAS improvement: +10-20% vs. baseline
- ✅ Quality scores: 7+ on 80% of keywords
- ✅ CPC efficiency: -5-10% cost reduction
- ✅ Budget utilization: 90%+ of daily budget spent

---

## ROAS Baseline Calculation

### ROAS Formula

```
ROAS = Revenue ÷ Ad Spend
```

**Example:**
- Total revenue from ads: €500
- Total ad spend: €150
- ROAS: €500 ÷ €150 = 3.33:1

### Expected ROAS by Phase

**Phase 2 Launch (Weeks 1-2):**
- Target: 1.5:1 to 2:1 (breaking even to profitable)
- Acceptable: 1:1 or higher
- Reality: Often 0.8-1.2:1 initially due to learning

**Phase 3 Optimization (Weeks 3-4):**
- Target: 2:1 to 3:1 (improved landing pages)
- Acceptable: 1.5:1 minimum
- Reality: 1.8-2.5:1 with page optimization

**Phase 4 Bid Optimization (Month 2):**
- Target: 3:1 to 4:1 (bid optimization + targeting refinement)
- Acceptable: 2.5:1 minimum
- Reality: 2.5-3.5:1 with active optimization

### ROAS by Product Category

Expected ROAS variance by product:

| Category | Avg Order Value | Expected ROAS | Reason |
|---|---|---|---|
| **Teppichboden** | €80 | 2-3:1 | Practical product, high intent |
| **Teppiche** | €120 | 2.5-3.5:1 | Higher AOV, design intent |
| **Vinylboden** | €70 | 1.5-2.5:1 | Lower AOV, technical audience |

**Strategy:** Higher ROAS products get higher budget allocation

---

## Bidding Strategies

### Strategy 1: Target ROAS (Recommended)

**When to Use:**
- When you have 100+ conversions accumulated
- When conversion value tracking is accurate
- Long-term optimization focus

**How It Works:**
1. Set target ROAS goal (e.g., 2.5:1)
2. Google Ads automatically adjusts bids to achieve this ROAS
3. System learns from conversion data and improves over time
4. Bid adjustments: +20% to -30% based on probability

**Configuration:**
```
Campaign Settings:
- Bidding strategy: Target ROAS
- Target ROAS: 2.5 (meaning €2.50 revenue per €1 spend)
- Daily budget: €50
- Bid adjustment range: -100% to +25%
```

**Advantages:**
- Automated optimization based on actual ROI
- Scales bids up for high-converting keywords
- Natural efficiency gain over 2-4 weeks

**Disadvantages:**
- Requires stable conversion tracking
- May need 200+ conversions for accuracy
- Risk of overspending if target too aggressive

### Strategy 2: Target CPA (Alternative)

**When to Use:**
- When ROAS targets are unclear
- Focus on cost-efficiency vs. revenue

**Configuration:**
```
Campaign Settings:
- Bidding strategy: Target CPA
- Target CPA: €35 (cost per purchase)
- Formula: AOV ÷ Desired ROAS = Target CPA
  Example: €100 AOV ÷ 3:1 ROAS = €33 target CPA
```

### Strategy 3: Maximize Conversions (Conservative)

**When to Use:**
- Early phase when conversion data is limited
- Budget is secondary to volume

**Configuration:**
```
Campaign Settings:
- Bidding strategy: Maximize Conversions
- Target CPA: Set to sustainable value (€30-50)
- Daily budget: All spent on conversions
```

---

## Keyword-Level Bid Adjustments

### Quality Score Improvement

**Quality Score Tiers:**

| Score | CTR | Landing Page | Bid Adjustment | Action |
|---|---|---|---|---|
| **10** | Excellent | Excellent | None (baseline) | Monitor |
| **8-9** | Good | Good | -10% to -20% (reduce waste) | Optimize copy |
| **6-7** | Fair | Fair | None (maintain) | Monitor and test |
| **4-5** | Poor | Poor | +20% to +30% (compensate) | Review landing page |
| **1-3** | Very Poor | Very Poor | +50% to +100% or pause | Consider pausing |

### Bid Adjustment Framework

**Step 1: Segment Keywords by Performance**

```
High Performers (ROAS >3:1):
- Keywords: 5-10
- Bid adjustment: -10% (reduce unnecessary spend)
- Rationale: Converting efficiently, room to optimize

Mid Performers (ROAS 1.5-3:1):
- Keywords: 20-30
- Bid adjustment: 0% (maintain baseline)
- Rationale: Core keywords, stable performance

Low Performers (ROAS <1.5:1):
- Keywords: 10-20
- Bid adjustment: +20% (improve visibility)
- Rationale: Not converting, need better visibility

Non-Performers (0 conversions, >50 clicks):
- Keywords: 5-10
- Action: Pause keyword
- Rationale: Wasting budget, unlikely to convert
```

**Step 2: Implement Bid Adjustments**

In Google Ads UI:
1. Go to **Keywords** tab
2. Sort by conversion rate or ROAS
3. Select keywords
4. Click **Edit** → **Bid adjustments**
5. Enter adjustment (e.g., -10%, +20%)

### Real-Time Bid Rules (Automated)

**Rule 1: Reduce Bids on High-Converting Keywords**

```
IF: Conversion rate > 5% AND ROAS > 3:1
THEN: Reduce bid by 10%
TIME: Weekly evaluation
RATIONALE: Premium positions wasteful for high converters
```

**Rule 2: Increase Bids on Low-Converting Keywords**

```
IF: Conversion rate < 1% AND clicks > 20 AND CPC < €0.50
THEN: Increase bid by 20%
TIME: Weekly evaluation
RATIONALE: Good candidates for improved visibility
```

**Rule 3: Pause Non-Converting Keywords**

```
IF: Clicks > 50 AND conversions = 0
THEN: Pause keyword
TIME: Weekly evaluation
RATIONALE: Wasting budget with no conversion potential
```

---

## Budget Reallocation Strategy

### Current Budget Distribution (Phase 2)

```
Total Daily Budget: €75-180

Teppichboden: €20-50/day (30-35%)
  - Search volume: Highest
  - Competition: Medium
  - Expected ROAS: 2-3:1

Teppiche: €25-60/day (35-40%)
  - Search volume: Medium-High
  - Competition: Medium-High
  - Expected ROAS: 2.5-3.5:1

Vinylboden: €30-70/day (30-40%)
  - Search volume: Medium
  - Competition: Low-Medium
  - Expected ROAS: 1.5-2.5:1
```

### Phase 4 Reallocation Logic

**After Phase 3 Optimization + 100 conversions:**

```
Reallocation Rules:
1. Highest ROAS gets +20% budget
2. Lowest ROAS gets -20% budget
3. Mid-range campaigns stay stable
4. Minimum spend: €10/day per campaign (brand presence)
```

**Example Scenario:**

```
Initial (Phase 2):
- Teppichboden: €35/day
- Teppiche: €45/day  
- Vinylboden: €50/day
Total: €130/day

Observed ROAS after Phase 3:
- Teppichboden: 3.2:1 (HIGH)
- Teppiche: 2.1:1 (MID)
- Vinylboden: 1.8:1 (LOW)

Reallocation (Phase 4):
- Teppichboden: €42/day (+€7, +20%)  ← Highest ROAS
- Teppiche: €45/day (±€0)  ← Mid performer
- Vinylboden: €40/day (-€10, -20%)  ← Lowest ROAS (but maintain minimum)
Total: €127/day (within ±5%)
```

### Budget Monitoring Criteria

**Weekly Decision Points:**

```
Monday Review:
1. Calculate last 7-day ROAS per campaign
2. Check if +/- 20% of target ROAS
3. If significant variance, prepare reallocation

Wednesday Check:
4. Verify budget pace (should spend 1/7 daily budget by mid-week)
5. Adjust bids if pace is off

Friday Update:
6. Prepare next week's budget allocation
7. If significant ROAS shift, adjust +/- 10%
```

---

## Quality Score Optimization

### Quality Score Components

| Component | Weight | Target | How to Improve |
|---|---|---|---|
| **Expected CTR** | 35% | Above Average | Better ad copy, refine targeting |
| **Ad Relevance** | 35% | Excellent | Match ad text to keyword intent |
| **Landing Page Experience** | 30% | Excellent | Improve page speed, mobile UX |

### Quality Score Improvement Plan

**For Keywords with Quality Score <6:**

1. **Review Ad Copy**
   - Include primary keyword in headline
   - Match ad text to landing page
   - Test multiple ad variations

2. **Check Landing Page**
   - Ensure page loads fast (<2s)
   - Mobile responsive
   - Clear CTA visible above fold

3. **Refine Targeting**
   - Remove irrelevant keywords
   - Use phrase match instead of broad
   - Add negative keywords for irrelevant searches

**Expected Impact:**
- Quality Score improvement: 5-7 (1-2 point increase)
- CPC reduction: 10-20%
- CTR improvement: 20-30%

---

## Monitoring & Decision Framework

### Daily Monitoring Checklist

```
☐ 1. Check budget pace
  Target: 1/7 of daily budget spent by 12:00
  
☐ 2. Monitor conversion rate
  Target: 1-3% of clicks (varies by category)
  
☐ 3. Check CPC trend
  Target: Stable or -5-10% week-over-week
  
☐ 4. Quality score alerts
  Target: 7+ average quality score
  
☐ 5. ROAS tracking
  Target: At or above target ROAS
```

### Weekly Optimization Meeting Agenda

```
1. ROAS Review (15 min)
   - Campaign-level ROAS last 7 days
   - Top 5 keywords by ROAS
   - Bottom 5 keywords by ROAS

2. Budget Reallocation Discussion (10 min)
   - Should any campaign budget change?
   - Maintain +/- 5% variance threshold
   - Document rationale

3. Bid Optimization (15 min)
   - Keywords to pause (0 conversions, 50+ clicks)
   - Keywords to increase bids (+20%)
   - Keywords to decrease bids (-10%)

4. Quality Score Issues (10 min)
   - Any campaigns below QS 6?
   - Ad copy test results
   - Landing page feedback

5. Next Week Plan (10 min)
   - Budget allocation (final)
   - Keyword bids finalized
   - A/B tests to run
```

---

## Implementation Checklist

### Phase 4.2A: ROAS Baseline
- [ ] Collect minimum 100 conversions (Phase 4.1 complete)
- [ ] Calculate ROAS per campaign
- [ ] Establish target ROAS for each product category
- [ ] Document baseline metrics for comparison

### Phase 4.2B: Bidding Strategy Selection
- [ ] Evaluate Target ROAS vs. Target CPA options
- [ ] Set campaign bidding strategy
- [ ] Configure bid adjustment parameters
- [ ] Test with conservative target (e.g., 2:1 ROAS)

### Phase 4.2C: Bid Adjustments
- [ ] Segment keywords by quality score
- [ ] Implement quality score bid adjustments (QS <6: +20%)
- [ ] Set up bid rules for automated optimization
- [ ] Create pause rules for non-converting keywords

### Phase 4.2D: Budget Reallocation
- [ ] Analyze ROAS by product category
- [ ] Prepare reallocation plan (±20%)
- [ ] Document decision rationale
- [ ] Implement budget changes

### Phase 4.2E: Monitoring Setup
- [ ] Create weekly ROAS review process
- [ ] Set up alert thresholds
- [ ] Schedule optimization meetings
- [ ] Document decision framework

---

## Success Criteria

✅ **Phase 4.2 Complete when:**
1. Target ROAS bidding configured on all campaigns
2. ROAS baseline established and documented
3. Quality score bid adjustments implemented (80%+ QS 7+)
4. Bid rules automated (pause, increase, decrease)
5. Budget reallocation complete (top performer +20%, low performer -20%)
6. Weekly optimization meeting schedule established
7. ROAS improvement tracked (target +10-20% vs. Phase 2)
8. CPC efficiency improved (-5-10% cost reduction)
9. Decision framework documented for ongoing optimization
10. Team trained on bid management and ROAS monitoring

---

## Timeline

### Week 1: Analysis & Baseline
- Days 1-2: Collect ROAS data (minimum 100 conversions)
- Days 2-3: Calculate baseline and set targets
- Days 3-4: Select bidding strategy and configure
- Days 4-5: Test conservative target settings

### Week 2: Optimization & Monitoring
- Days 1-2: Implement bid adjustments
- Days 2-3: Set up automated bid rules
- Days 3-4: Prepare budget reallocation
- Days 4-5: Review and finalize changes

### Week 3+: Continuous Optimization
- Weekly: ROAS review and budget decisions
- As-needed: Bid adjustments based on performance
- Monthly: ROAS target review and strategy update

---

**Status:** Ready for Implementation
**Version:** 1.0
**Referenziert von:** Phase 5.3 (#57) Optimierungs-Cycle – dort werden diese Bid-Regeln wöchentlich angewendet
