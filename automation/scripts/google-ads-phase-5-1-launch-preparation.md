# Google Ads Phase 5.1 – Launch Preparation & Pre-Flight Checklist
## Campaign Readiness & Go-Live Verification

**Issue:** #55  
**Status:** In Development  
**Priority:** P1  
**Date:** 2026-09-03  
**Depends On:** Phases 4.1-4.3 complete (conversion tracking, bidding, monitoring ready)  

---

## Overview

Phase 5.1 conducts comprehensive pre-launch verification to ensure all three Phase 2 campaigns (Teppichboden, Teppiche, Vinylboden) are fully configured, tested, and ready for live execution with full budget allocation.

### Objectives

1. Verify all campaign configurations (budgets, keywords, ads, landing pages)
2. Conduct technical pre-flight checks (tracking, landing pages, mobile)
3. Validate conversion tracking with test transactions
4. Confirm bidding strategies and budget allocation
5. Establish monitoring and alert systems
6. Prepare launch communication and team coordination
7. Document launch procedures and rollback plans

### Launch Readiness Criteria

**Go/No-Go Decision Framework:**
- ✅ **GO:** All checklists pass, confidence >90%, proceed to launch
- ⚠️ **CONDITIONAL GO:** Minor issues identified, plan to fix during launch, accept risk
- ❌ **NO-GO:** Critical issues found, must fix before launch, reschedule

---

## Pre-Launch Verification Checklist

### A. Campaign Configuration (GO/NO-GO Gate)

#### Teppichboden Campaign

```
☐ Campaign name: "[Google Ads] Phase 2.1 – Teppichboden"
☐ Campaign type: Search
☐ Daily budget: €20-50 (configured and approved)
☐ Bidding strategy: Target ROAS 2.5:1 (or Target CPA €33)
☐ Networks: Google Search only (Display disabled)
☐ Geographic targeting: Germany (Austria + Switzerland optional)
☐ Language targeting: German
☐ Device targeting: All devices (no restrictions)
☐ Schedule: 08:00-22:00 daily (standard business hours)

Ad Groups (8 total):
☐ Teppichboden-Basics (2 keywords)
☐ Teppichboden-Kaufen (3 keywords)
☐ Teppichboden-Typen (2 keywords)
☐ Guenstig (1 keyword)
☐ Verlegen (2 keywords)
☐ Langflor (1 keyword)
☐ Naturbelassener-Bodenbelag (1 keyword)
☐ Brand-Protection (3 negative keywords)

Ads per ad group: 3+ (A/B testing enabled)
Landing page: /collections/teppichboden (verified responsive + fast)
Negative keywords: 10+ (brand, educational intent, etc.)

Decision: ☐ GO  ☐ CONDITIONAL GO  ☐ NO-GO
Issues: _________________________
```

#### Teppiche Campaign

```
☐ Campaign name: "[Google Ads] Phase 2.2 – Teppiche"
☐ Campaign type: Search
☐ Daily budget: €25-60 (configured and approved)
☐ Bidding strategy: Target ROAS 3:1 (or Target CPA €40)
☐ Networks: Google Search only
☐ Geographic targeting: Germany + EU (premium market)
☐ Language targeting: German + English (optional)
☐ Device targeting: All devices
☐ Schedule: 08:00-22:00 daily

Ad Groups (27+ keywords across 4 groups):
☐ Teppiche-Basics
☐ Teppiche-Stil
☐ Teppiche-Material
☐ Teppiche-Kommerziell

Ads per ad group: 3+ (A/B testing enabled)
Landing page: /collections/teppiche (verified)
Negative keywords: 10+ configured

Decision: ☐ GO  ☐ CONDITIONAL GO  ☐ NO-GO
Issues: _________________________
```

#### Vinylboden Campaign

```
☐ Campaign name: "[Google Ads] Phase 2.3 – Vinylboden"
☐ Campaign type: Search
☐ Daily budget: €30-70 (configured and approved)
☐ Bidding strategy: Target ROAS 2:1 (or Target CPA €35)
☐ Networks: Google Search only
☐ Geographic targeting: Germany (high priority)
☐ Language targeting: German
☐ Device targeting: All devices
☐ Schedule: 08:00-22:00 daily

Ad Groups (30+ keywords across 4 groups):
☐ Vinylboden-Basics
☐ Vinylboden-Installation
☐ Vinylboden-Raum
☐ Vinylboden-Kommerziell

Ads per ad group: 3+ (A/B testing enabled)
Landing page: /collections/vinylboden (verified)
Negative keywords: 15+ (Rollenware exclusions, etc.)

Decision: ☐ GO  ☐ CONDITIONAL GO  ☐ NO-GO
Issues: _________________________
```

### B. Tracking & Conversion Verification

```
☐ Google Analytics 4 property linked to campaigns
☐ GA4 conversion events defined (purchase, add_to_cart, view_item)
☐ Conversion values configured (dynamic €-tracking)
☐ Tag Assistant validation: 0 errors
☐ Test purchase completed (past 24 hours)
☐ Conversion visible in Google Ads (within 5 min)
☐ Conversion value matches order amount (±1%)
☐ GA4 → Google Ads sync working (±5% discrepancy)
☐ Fallback tracking configured (Conversion API)
☐ UTM parameters correct in all ads
☐ Shopify order tracking enabled

Decision: ☐ GO  ☐ CONDITIONAL GO  ☐ NO-GO
Issues: _________________________
```

### C. Landing Page Verification

```
Teppichboden Page:
☐ Page loads <2.5s (LCP)
☐ Mobile responsive (tested on iOS + Android)
☐ H1 optimized with primary keyword
☐ Meta title + description present and keyword-rich
☐ Product showcase visible (first screen)
☐ Primary CTA visible and clickable
☐ Product images loaded (no broken images)
☐ Pricing display: €/m² visible
☐ Accessibility audit passed (WCAG 2.1 AA)

Teppiche Page:
☐ Page loads <2.5s (LCP)
☐ Mobile responsive
☐ Style discovery gallery functional
☐ Product filters working (style, price, material)
☐ CTA buttons clickable and visible
☐ Images optimized (responsive srcset)

Vinylboden Page:
☐ Page loads <2.5s (LCP)
☐ Mobile responsive
☐ Installation guide visible and readable
☐ Technical specs table present
☐ Water-resistance messaging clear
☐ Room-specific guidance visible
☐ CTA buttons functional

Decision: ☐ GO  ☐ CONDITIONAL GO  ☐ NO-GO
Issues: _________________________
```

### D. Budget & Cost Verification

```
Daily Budget Allocation:
☐ Teppichboden: €X (total: €20-50)
  Breakdown: ____________
☐ Teppiche: €X (total: €25-60)
  Breakdown: ____________
☐ Vinylboden: €X (total: €30-70)
  Breakdown: ____________
☐ Total daily budget: €75-180 (approved in accounting)
☐ Total monthly budget (30 days): €2,250-5,400
☐ CPA targets set (derived from ROAS)
☐ Budget pace monitoring tool configured
☐ Overspend alerts enabled

Cost Forecast (Month 1):
☐ Estimated spend: €2,250-5,400
☐ Estimated conversions: 300-600
☐ Estimated ROAS: 1.5-2:1 (conservative)
☐ Estimated ROI: 50-100%
☐ Contingency budget allocated (+20%)

Decision: ☐ GO  ☐ CONDITIONAL GO  ☐ NO-GO
Issues: _________________________
```

### E. Team Coordination & Handoff

```
☐ Campaign manager assigned and trained
☐ Daily monitoring schedule established (10 AM check-in)
☐ Weekly optimization meeting scheduled (Friday 14:00)
☐ Escalation contacts documented (who to call if issues)
☐ Alert notification system tested (email/Slack working)
☐ Dashboard access granted to team members
☐ Documentation shared and reviewed
☐ Rollback plan documented (how to pause campaigns)
☐ Success metrics agreement signed off
☐ Launch communication sent to stakeholders

Decision: ☐ GO  ☐ CONDITIONAL GO  ☐ NO-GO
Issues: _________________________
```

---

## Launch Day Procedure

### Pre-Launch (T-30 min)

```
Time: [Date] [Time - 30 minutes before launch]

Actions:
☐ 1. Final system check: All monitoring systems online?
☐ 2. Verify campaign budgets are set (not paused)
☐ 3. Confirm team is ready (campaign manager, backup)
☐ 4. Test alert notifications (send test email/Slack message)
☐ 5. Prepare launch announcement (stakeholders)
☐ 6. Document launch time (exact time when campaigns go live)
☐ 7. Open Google Ads dashboard (ready to monitor)
☐ 8. Open analytics dashboard (GA4 real-time)
☐ 9. Prepare rollback decision criteria (when to pause)
☐ 10. Notify team: "Campaigns launching in 30 minutes"
```

### Launch (T+0)

```
Time: [Date] [Time - LAUNCH MOMENT]

Actions:
☐ 1. Enable campaigns (or set budget to live amount)
☐ 2. Verify campaigns are "Eligible" status (not limited)
☐ 3. Log launch timestamp: _______________
☐ 4. Announce to team: "Campaigns LIVE"
☐ 5. Monitor real-time impressions/clicks (expect 0-10 min delay)
☐ 6. Check landing page traffic spikes (Google Analytics)
☐ 7. Monitor for immediate errors (GA4 real-time)
☐ 8. Confirm no errors in Tag Assistant
☐ 9. Establish continuous monitoring mode (first 2 hours critical)
```

### First Hour (T+1h)

```
Monitoring Frequency: Every 15 minutes

Metrics to Watch:
☐ Impressions: Should ramp up (target: 100-500 in first hour)
☐ Clicks: Should start appearing (target: 5-30 in first hour)
☐ Budget pace: Should see €2-5 spend in first hour
☐ Landing page load time: Monitor for spikes
☐ Errors: Any tracking errors or alerts?
☐ Landing page conversions: Any immediate conversions?

Red Flags to Watch:
⚠️ Zero impressions after 15 min → Check campaign status
⚠️ CTR >15% or <0.5% → Possible tracking issue
⚠️ Landing page 5XX errors → Page down, switch ad groups
⚠️ Tracking tag not firing → Stop campaign, investigate
⚠️ High bounce rate >90% → Landing page relevance issue

Actions:
- If all metrics normal: Continue monitoring every 15 min
- If minor issues: Document and plan fix during optimization phase
- If critical issues: Prepare to pause campaign and troubleshoot
```

### First 24 Hours (T+24h)

```
Next Morning Review (10:00 AM, +24h):

Verify:
☐ Total impressions: 500-2,000 (on pace for target)
☐ Total clicks: 30-150 (healthy CTR)
☐ Total spend: €25-150 (on budget pace)
☐ Conversions: 0-5+ expected (may be delayed 24h)
☐ Landing page performance stable
☐ No quality score drops
☐ Alert system working

Key Decision:
Continue monitoring? ☐ YES  ☐ Pause for fixes  ☐ NO-GO

If YES: Proceed to Phase 5.2 (Daily Monitoring)
If Pause: Fix issues (list below) and relaunch
If NO-GO: Escalate to management for decision

Issues identified (if any):
_________________________
_________________________
```

---

## Rollback Plan

### When to Pause Campaigns

**Immediate Pause (Critical Issues):**
- Zero conversions for 48 hours (no tracking)
- Landing page returns 5XX errors (server down)
- Tracking tag not firing in Tag Assistant
- Massive budget overspend (>200% daily)
- CPC spike >300% (bid misconfiguration)

**Pause Within 24 Hours (Severe Issues):**
- ROAS <0.5:1 (losing money rapidly)
- Quality scores drop to <4 (ad not showing)
- Conversion tracking inaccurate (±>10%)
- Landing page load time >5s (Core Web Vitals failure)

### Rollback Procedure

```
Step 1: Pause Campaigns
- Go to Google Ads: Campaigns
- Select affected campaign
- Click Pause (does NOT delete ad spend history)
- Verify status changed to "Paused"

Step 2: Notify Stakeholders
- Email campaign manager, team lead
- Subject: "[ALERT] Campaign Paused – [Reason]"
- Include: What happened, when discovered, next steps

Step 3: Investigate Root Cause
- Check logs: Tag Assistant, GA4 real-time
- Review landing page: Error logs, server status
- Check bid settings: Any misconfiguration?
- Verify tracking: Is code firing?

Step 4: Fix Issue
- Deploy fix (code, configuration, server restart)
- Verify fix with test transaction
- Confirm with Tag Assistant: 0 errors

Step 5: Relaunch Campaign
- Set campaign to active again
- Resume monitoring (follow "First Hour" protocol)
- Document lessons learned
```

---

## Success Criteria

✅ **Phase 5.1 Complete when:**
1. All campaign configurations verified and documented
2. Tracking validation complete (test purchase successful)
3. Landing pages verified (speed, mobile, conversions)
4. Budget allocation approved and in place
5. Team trained and ready
6. Monitoring systems online and tested
7. Go/No-Go decision made with leadership sign-off
8. Campaigns live or scheduled for launch
9. First 24-hour metrics reviewed
10. Rollback plan documented and team briefed

---

## Timeline

### Week Before Launch
- Days 1-2: Configuration review
- Days 2-3: Tracking validation
- Days 3-4: Landing page verification
- Days 4-5: Team coordination and training
- Day 5: Go/No-Go meeting with leadership

### Launch Day
- T-30: Pre-launch system check
- T+0: Campaigns go live
- T+1h: Critical monitoring phase
- T+24h: First full-day review

---

**Status:** Ready for Implementation  
**Version:** 1.0  
**Next:** Phase 5.2 (#56) Daily Monitoring, Phase 5.3 (#57) Optimization Cycle
