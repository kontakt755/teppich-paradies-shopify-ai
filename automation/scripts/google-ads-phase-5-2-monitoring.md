# Google Ads Phase 5.2 – Monitoring & Weekly Analysis
## Daily Check-In & Performance Review Protocol

**Issue:** #56  
**Status:** In Development  
**Priority:** P1  
**Date:** 2026-09-03  
**Depends On:** Phase 5.1 launch complete, campaigns live  

---

## Overview

Phase 5.2 establishes daily monitoring and weekly analysis procedures to track campaign performance, identify issues early, and maintain campaign health during the critical first 4 weeks post-launch.

---

## Daily Monitoring (10:00 AM)

### Quick Health Check (15 min)

```
Morning Dashboard Review:
1. ROAS yesterday: €___ ÷ €___ = __:1 (vs. target _:1)
2. Spend pace: €___ (target: 1/7 of daily = €___)
3. Conversions: ___ (target: 2-20 range?)
4. Quality scores: ___ avg (target: 7+)
5. Critical alerts? ☐ YES ☐ NO

Action Required?
☐ NO - Continue monitoring
☐ INVESTIGATE - Found anomaly, plan fix
☐ ESCALATE - Critical issue, pause campaign
```

---

## Weekly Review (Friday 14:00)

### Comprehensive Performance Analysis (45 min)

#### 1. Campaign ROAS Review

```
| Campaign | Spend | Revenue | ROAS | vs Target | vs Week 1 |
|----------|-------|---------|------|-----------|-----------|
| Teppichboden | €___ | €___ | ___:1 | ☐✓ ☐✗ | Trend: ↑↓→ |
| Teppiche | €___ | €___ | ___:1 | ☐✓ ☐✗ | Trend: ↑↓→ |
| Vinylboden | €___ | €___ | ___:1 | ☐✓ ☐✗ | Trend: ↑↓→ |
| TOTAL | €___ | €___ | ___:1 | ☐✓ ☐✗ | Trend: ↑↓→ |

Decision:
☐ On track
☐ Minor optimization needed (bid adjustments)
☐ Significant issues (budget reallocation or landing page changes)
```

#### 2. Keyword Performance Top 10

```
High Performers (ROAS >3:1):
Keyword | Conversions | ROAS | Action
1. ________ | ___ | ___:1 | ☐ Reduce bid (avoid waste)
2. ________ | ___ | ___:1 | ☐ Reduce bid
...

Low Performers (ROAS <1:1):
Keyword | Conversions | ROAS | Action
1. ________ | ___ | ___:1 | ☐ Increase bid OR pause if 0 conv
2. ________ | ___ | ___:1 | ☐ ...
```

#### 3. Ad Performance Testing

```
Campaign: _______________

Ad 1 (CTR: __%, Conv: __):
Headline: _________________
Copy: Better/Worse than Ad 2? ☐ Better ☐ Worse ☐ Same
Action: ☐ Keep testing ☐ Pause (worst performer) ☐ Winner detected

Ad 2 (CTR: __%, Conv: __):
Headline: _________________
Copy: Comments: ___________

Ad 3 (CTR: __%, Conv: __):
Headline: _________________
Copy: Test duration needed: 2-4 more weeks
```

#### 4. Quality Score Trends

```
Campaign | Avg QS | Week 1 | Trend | Issues? | Action
Teppichboden | ___ | ___ | ↑↓→ | ☐ YES | _______
Teppiche | ___ | ___ | ↑↓→ | ☐ YES | _______
Vinylboden | ___ | ___ | ↑↓→ | ☐ YES | _______

Any QS <6?
Keyword: _____ QS: ___ Issue: Landing page/Ad copy/Relevance
Action: Update ad copy OR improve landing page
```

#### 5. Budget Allocation Decision

```
Current Allocation: T€___, T€___, V€___
Optimal Allocation: T€___, T€___, V€___ (based on ROAS)

Change Needed?
☐ NO - Allocation optimal
☐ YES - Reallocate:
  - Increase: __________ (+10-20%)
  - Decrease: __________ (-10-20%)
  - Maintain: __________

Rationale: _______________
Expected impact: _________
```

#### 6. Next Week Priorities

```
Priority 1: ___________________
  Who: _______ When: _____ Expected impact: _______

Priority 2: ___________________
  Who: _______ When: _____ Expected impact: _______

Priority 3: ___________________
  Who: _______ When: _____ Expected impact: _______

Summary: This week we _________. Next week we will _________.
```

---

## Weekly Monitoring Dashboard Metrics

### By Campaign

```
Daily Impressions: 100-2000 per campaign (ramping)
Daily Clicks: 10-200 per campaign
Daily Conversions: 2-20 per campaign (varies by stage)
Daily Spend: Match daily budget ±5%

Weekly Trending:
- ROAS: Should be stable or improving (target: +5-10%)
- CPC: Should be stable or declining (target: -5-10%)
- Quality Scores: Should improve (target: +0.2-0.5)
- Conversions: Should increase (ramp effect)
```

### Alerts & Escalation

```
CRITICAL (Pause Campaign):
- ROAS <0.8:1 (losing money)
- Zero conversions >48h (tracking broken)
- Landing page 5XX errors
- Quality scores <4 (ad suppression)

INVESTIGATE (24h):
- ROAS drop >30% vs. week average
- Spend >120% of daily budget
- Conversions drop >50%
- Quality score drop >1 point

MONITOR (Note for next week):
- ROAS within 10% of target
- Spend variance ±10%
- Steady conversion rate
- Quality scores stable
```

---

## Issues & Troubleshooting

### Issue: ROAS Below Target

```
If ROAS 1.5:1 (Target 2.5:1):

Diagnosis:
☐ Check landing page quality (speed? conversions?)
☐ Review keyword relevance (targeting wrong audience?)
☐ Test ad copy (compelling messaging?)
☐ Analyze customer journey (cart abandonment?)

Actions:
☐ 1. Pause lowest ROAS keywords (bottom 20%)
☐ 2. Increase bid on high-converting keywords
☐ 3. Test new ad copy (design focus for Teppiche)
☐ 4. Review landing page: can we improve?

Timeline: Test 1-2 weeks, evaluate results
```

### Issue: Quality Score Below 6

```
Diagnosis:
Primary cause? ☐ Ad relevance ☐ Landing page ☐ Both

For Ad Relevance:
☐ Include primary keyword in headline
☐ Match ad text to landing page
☐ Test new ad copy variant

For Landing Page:
☐ Check page speed (target: <2.5s)
☐ Ensure mobile responsive
☐ Verify keyword appears in H1/content
☐ Test on actual device

Timeline: Should see improvement in 3-5 days
```

### Issue: Zero Conversions

```
Time threshold: >48 hours = Critical

Diagnosis:
☐ Check tracking: Is Tag Assistant showing no errors?
☐ Check GA4 real-time: Are purchase events appearing?
☐ Check landing page: Can you complete test purchase?
☐ Check Shopify: Are orders being placed?

Actions:
☐ If tracking broken: Stop campaign, fix code
☐ If landing page issue: Fix and restart
☐ If legitimate (low traffic): Wait 24 more hours

Timeline: Should resolve within 24 hours
```

---

## Weekly Report Template

**To:** Team leads, stakeholders  
**From:** Campaign Manager  
**Week of:** [Date]  
**Status:** ☐ ON TRACK ☐ MINOR ISSUES ☐ ESCALATION NEEDED

### Summary
This week we achieved [ROAS summary]. [Positive highlight]. [Challenge/opportunity].

### Key Metrics
- Total Spend: €___ (vs. target €___)
- Total Conversions: ___ (target: 100+)
- Average ROAS: __:1 (target: 2.5:1)
- Quality Score: ___ (target: 7+)

### Campaign Highlights
- **Teppichboden**: ROAS __:1 (ON TRACK / WATCH)
- **Teppiche**: ROAS __:1 (ON TRACK / WATCH)
- **Vinylboden**: ROAS __:1 (ON TRACK / WATCH)

### Actions Completed
☐ Ad copy test launched
☐ Keyword bids adjusted
☐ Landing page optimized
☐ Other: ___________

### Next Week Priorities
1. ________________ (estimated impact: +X% ROAS)
2. ________________ (estimated impact: +X% conversions)
3. ________________ (estimated impact: reduce costs)

### Risks & Escalations
☐ No critical issues
☐ Issue: __________ (impact: ____) [Mitigation: ____]

---

## Success Criteria

✅ **Phase 5.2 Complete when:**
1. Daily monitoring routine established and followed
2. Weekly review meetings scheduled and conducted
3. Alerts system working (team notified of issues)
4. First 4 weeks of monitoring data collected
5. Dashboard metrics stable or improving
6. ROAS trending toward target (+5-10% improvement)
7. Quality scores stable or improving
8. Weekly reports generated and shared
9. Issues tracked and resolved
10. Team trained on monitoring procedures

---

**Status:** Ready for Implementation  
**Version:** 1.0  
**Next:** Phase 5.3 (#57) Optimization Cycle
