# Google Ads Phase 4.3 – Dashboard Setup & Monitoring
## Real-Time Performance Visualization Guide

**Issue:** #54  
**Status:** In Development  
**Priority:** P1  
**Date:** 2026-09-03  
**Depends On:** Phase 4.1 (#52) & 4.2 (#53) completion, conversion tracking active  

---

## Overview

Phase 4.3 establishes real-time monitoring dashboards to visualize Google Ads campaign performance, conversion data, and ROI metrics. Enables daily performance review and quick decision-making during campaign optimization phases.

### Objectives

1. Set up Google Ads API connection for real-time data
2. Create campaign performance dashboard (impressions, clicks, spend, ROAS)
3. Build conversion funnel dashboard (view → cart → purchase)
4. Implement alert system for anomalies
5. Create automated reports (daily, weekly, monthly)
6. Integrate GA4 data with Google Ads metrics
7. Establish dashboard maintenance procedures

### Dashboard Features

**Real-Time Metrics:**
- Daily spend vs. budget pace
- Campaign-level ROAS and conversions
- Keyword performance and quality scores
- Geographic and device performance
- AD group conversion rates

---

## Dashboard Architecture

### Data Sources

```
Google Ads API
├─ Campaign metrics (impressions, clicks, cost)
├─ Conversion data (value, count)
├─ Keyword performance (bids, QS, CTR)
└─ Ad performance (impressions, conversions)

GA4 API
├─ User journeys (session data)
├─ Conversion events (purchase, add_to_cart, view_item)
└─ Revenue tracking

Shopify API
├─ Order data (value, timestamp, items)
├─ Customer data (acquisition source)
└─ Product performance
```

### Dashboard Types

**Type 1: Executive Dashboard (Campaign Level)**
- Focus: High-level ROAS, spend, ROI
- Audience: Management, stakeholders
- Update frequency: Daily (morning review)
- Metrics: 5-7 key metrics

**Type 2: Analyst Dashboard (Keyword Level)**
- Focus: Detailed performance by keyword, ad group
- Audience: Marketing team, optimization specialists
- Update frequency: Real-time (continuous monitoring)
- Metrics: 20-30 detailed metrics

**Type 3: Performance Alerts Dashboard**
- Focus: Anomalies, issues, urgent actions
- Audience: Campaign manager
- Update frequency: Real-time alerts
- Metrics: Quality score drops, budget spikes, low conversions

---

## Core Metrics & KPIs

### Campaign-Level Metrics

```
Impressions: Total ad impressions (targeting reach)
- Target: 1,000-5,000/day (ramping from launch)
- Alert: <500/day (low reach) or >10,000/day (overspend)

Clicks: Total clicks on ads
- Target: 50-300/day (varies by category)
- CTR target: 3-5% (quality indicator)

Spend (Cost): Total ad spend in €
- Target: Match daily budget (90-100% utilization)
- Alert: <50% or >110% of daily budget

Conversions: Purchase conversions (primary KPI)
- Target: 2-20/day (ramping from launch)
- Conversion rate: 2-3% of clicks

Revenue: €-value of conversions (tracked by conversion)
- Target: €100-3000/day (depends on AOV)
- Ramps with campaign maturity

ROAS: Return on Ad Spend (€revenue ÷ €spend)
- Target: 2:1 to 3:1 (month 2+)
- Alert: <1.5:1 (losing money) or >4:1 (budget limited)

CPC: Cost per click (average)
- Target: €0.20-1.00 (varies by category)
- Trend: -5-10% improvement over time

CPA: Cost per action/purchase (€spend ÷ conversions)
- Target: €25-50 (derived from ROAS target)
- Formula: AOV ÷ Target ROAS = Target CPA
```

### Quality Score Metrics

```
Average Quality Score: Mean across all keywords
- Target: 7+ (80% of keywords)
- Alert: <6 (significant issue)

Quality Score Distribution:
- 9-10: Premium keywords (highly relevant)
- 7-8: Good performance
- 5-6: Fair, needs optimization
- 3-4: Poor, consider pausing
- 1-2: Very poor, likely to pause

Trends:
- Weekly QS improvement (target: +0.2-0.5)
- Keywords improving: 60%+
- Keywords declining: <20%
```

### Funnel Metrics

```
View Item (Awareness): Product page views
- Rate: 20-40% of landing page sessions
- Trend: Should increase with better targeting

Add to Cart (Consideration): Cart additions
- Rate: 5-15% of product views
- Trend: Should increase with better product showcase

Purchase (Conversion): Order completion
- Rate: 2-3% of product views
- Trend: Should increase with page optimization

Funnel Efficiency:
- View → Cart: 25-75% (consideration rate)
- Cart → Purchase: 20-40% (checkout completion rate)
- View → Purchase: 5-15% (overall funnel efficiency)
```

---

## Dashboard Implementation

### Option 1: Google Ads Dashboard (Native)

**Pros:**
- Built-in, no setup required
- Real-time data from Google Ads
- Campaign-level metrics

**Cons:**
- Limited customization
- No integration with GA4 or Shopify
- Manual report generation

**Setup:**
1. Go to Google Ads account
2. Click **Reports** (sidebar)
3. Select **Predefined reports** or create **Custom report**
4. Choose metrics: Impressions, Clicks, Cost, Conversions, Conv. value
5. Save and schedule daily email delivery

### Option 2: Google Sheets Dashboard (Recommended for Phase 4)

**Pros:**
- Easy to set up and maintain
- Shareable with team
- Can combine GA4 + Google Ads data
- Formula-based calculations (ROAS, CPC, etc.)

**Setup Steps:**

1. **Create New Spreadsheet**
```
File > New > Spreadsheet
Name: "Google Ads Dashboard – [Date]"
```

2. **Add Campaign Summary Tab**
```
Columns:
A: Campaign Name
B: Daily Budget (€)
C: Spend (€) - [IMPORTRANGE from Google Ads export]
D: Impressions - [IMPORTRANGE]
E: Clicks - [IMPORTRANGE]
F: Conversions - [IMPORTRANGE]
G: Revenue (€) - [IMPORTRANGE from GA4]
H: ROAS = G/C [FORMULA]
I: CPC = C/E [FORMULA]
J: CPA = C/F [FORMULA]
K: CTR = E/D [FORMULA]

Rows:
- Teppichboden
- Teppiche
- Vinylboden
- TOTAL
```

3. **Daily Data Update Process**
```
Time: 10:00 AM (German time)
Source: Google Ads automated report email
Process:
1. Download CSV export from Google Ads
2. Paste data into "Raw Data" tab
3. Formulas auto-calculate metrics
4. Dashboard tab auto-updates
5. Check for alerts (highlighted cells)
```

4. **Add Alerts Tab**
```
Alerts (automated highlights):
- ROAS <1.5:1 → Red highlight
- Spend >110% budget → Orange highlight
- QS <6 average → Yellow highlight
- Conversions = 0 (24h) → Red flag
```

### Option 3: Looker Studio Dashboard (Advanced)

**Pros:**
- Professional appearance
- Real-time data connectors
- Complex visualizations
- Shareable reports

**Setup:**
1. Go to looker.studio (formerly Data Studio)
2. Create new report
3. Connect data sources:
   - Google Ads connector (select account)
   - Google Analytics 4 connector (select property)
4. Add visualization blocks:
   - Scorecard: ROAS, CPA, Spend
   - Time series chart: Daily ROAS trend
   - Bar chart: Campaign comparison
   - Table: Keyword performance

---

## Real-Time Monitoring Setup

### Google Alerts Configuration

**Alert 1: Zero Conversions Alert**
```
IF: Conversions = 0 for 24 hours
THEN: Email alert to campaign manager
ACTION: Investigate tracking or landing page issue
```

**Alert 2: ROAS Drop Alert**
```
IF: Daily ROAS drops >20% vs. 7-day average
THEN: Email alert
ACTION: Review high-spend keywords or landing page changes
```

**Alert 3: Budget Pace Alert**
```
IF: Daily spend >110% of daily budget
OR: Daily spend <50% of daily budget by 14:00
THEN: Email alert
ACTION: Adjust bids or check campaign status
```

**Alert 4: Quality Score Drop**
```
IF: Average QS drops below 6
THEN: Email alert
ACTION: Review ad copy and landing page quality
```

### Alert Delivery

**Email Setup:**
1. Google Ads: **Tools & Settings** > **Notifications**
2. Configure email alerts for:
   - Unusual activity
   - Quality score drops
   - Budget and spend notifications

**Slack Integration (Optional):**
- Use Zapier or Google Apps Script
- Route alerts to Slack #google-ads-monitoring channel
- Enable quick team response

---

## Daily Review Process

### Morning Review (10:00 AM)

**Duration:** 15 minutes  
**Checklist:**

```
☐ 1. Check ROAS vs. target
   Previous day: €X revenue ÷ €Y spend = R:1
   Is R > target (2:1)? 
   Action: If <1.5:1, review high-spend keywords

☐ 2. Verify budget pace
   Current spend: €X (target: 1/7 of daily budget by 12:00)
   Is spend on pace?
   Action: If <50%, may need bid increase; if >110%, consider pause

☐ 3. Check conversion rate
   Conversions: X (target: 2-20 per day)
   Is rate stable or improving?
   Action: If <2, review landing page quality

☐ 4. Quality scores
   Average QS: X (target: 7+)
   Any campaigns <6?
   Action: If yes, prioritize for optimization

☐ 5. Alert review
   Any red/orange highlights?
   Action: Address anomalies first
```

### Weekly Review (Friday)

**Duration:** 30-45 minutes  
**Checklist:**

```
☐ 1. Campaign-level ROAS
   Calculate 7-day ROAS: Total revenue ÷ Total spend
   Compare to target and previous week
   Decision: Reallocate budget if >20% variance?

☐ 2. Keyword performance
   Top 5 converting keywords (highest ROAS)
   Bottom 5 underperforming (lowest ROAS or 0 conversions)
   Action: Bid adjustments, pausing, or copy testing?

☐ 3. Ad performance
   Best performing ad copy (highest CTR)
   Worst performing ads (lowest CTR)
   Decision: Pause worst, scale best?

☐ 4. Quality score trends
   Keywords improving vs. declining
   Ad relevance and landing page feedback
   Action: Update ad copy or landing page?

☐ 5. Budget allocation
   Has ROAS changed enough to reallocate?
   Current allocation vs. optimal allocation
   Decision: Adjust budgets by +/- 10-20%?

☐ 6. Next week priorities
   Top 3 actions to focus on
   Timeline for implementation
   Expected impact estimation
```

---

## Automated Reports

### Daily Report Email

**Recipient:** Marketing manager, team leads  
**Frequency:** 10:00 AM daily  
**Content:**

```
Subject: Google Ads Performance – [Date]

Yesterday's Performance:
- Impressions: 2,456
- Clicks: 145
- Cost: €125
- Conversions: 3
- Revenue: €280
- ROAS: 2.24:1
- Status: ✅ On track

Campaign Breakdown:
- Teppichboden: ROAS 2.8:1 (€80), 2 conversions
- Teppiche: ROAS 2.1:1 (€30), 1 conversion
- Vinylboden: ROAS 1.5:1 (€15), 0 conversions ⚠️

Alerts:
⚠️ Vinylboden: Zero conversions, check landing page quality

Recommendation:
Review Vinylboden campaign – ROAS below target (1.5 vs. 2.5)
Consider bid adjustment or pause low-performing keywords.

---
Report generated automatically – Next report tomorrow 10:00 AM
```

### Weekly Performance Report

**Recipient:** Management, stakeholders  
**Frequency:** Monday 09:00 AM  
**Content:**

```
Subject: Weekly Google Ads Summary – Week of [Date]

Key Metrics (7-day):
- Total Impressions: 16,500
- Total Clicks: 980
- Total Spend: €850
- Total Conversions: 42
- Total Revenue: €2,180
- ROAS: 2.56:1
- Avg CPC: €0.87
- Avg CPA: €20.24

Campaign Performance:
┌─────────────────────────────────────────────────────────┐
│ Campaign       │ Spend  │ Conversions │ Revenue │ ROAS  │
├─────────────────────────────────────────────────────────┤
│ Teppichboden   │ €280   │ 12          │ €900    │ 3.21  │
│ Teppiche       │ €340   │ 18          │ €1,080  │ 3.18  │
│ Vinylboden     │ €230   │ 12          │ €200    │ 0.87  │
└─────────────────────────────────────────────────────────┘

Budget Allocation Recommendation:
- Teppichboden: Increase to €350/day (+25%) – Highest ROAS
- Teppiche: Maintain at €340/day – Solid performer
- Vinylboden: Decrease to €150/day (-35%) – Below target

Quality Scores:
- Teppichboden: 7.2 avg (Good)
- Teppiche: 6.8 avg (Fair – improve ad copy)
- Vinylboden: 5.9 avg (Poor – landing page issue?)

Next Week Actions:
1. Update Vinylboden landing page for conversion
2. Increase bids on high-converting keywords (Teppiche)
3. Reallocate budget per recommendation
4. Test new ad copy for Vinylboden

---
Report generated automatically – Next report Monday 09:00 AM
```

---

## Dashboard Maintenance

### Weekly Updates

```
Every Monday:
1. Refresh Google Ads data export
2. Update Sheets dashboard with latest metrics
3. Recalculate ROAS targets and bid strategies
4. Review and update alert thresholds
5. Backup dashboard (File > Version history)
```

### Monthly Audit

```
Every 1st of month:
1. Review dashboard accuracy
2. Compare Sheets data vs. Google Ads native reports
3. Verify GA4 ↔ Google Ads sync (±5% tolerance)
4. Update metric definitions if needed
5. Refresh trend calculations
6. Archive previous month's data
```

---

## Implementation Checklist

### Phase 4.3A: Data Setup
- [ ] Google Ads API access configured
- [ ] GA4 property linked to Google Ads
- [ ] Shopify order data available
- [ ] Data export/import process tested

### Phase 4.3B: Dashboard Creation
- [ ] Campaign summary metrics table
- [ ] ROAS and funnel calculations
- [ ] Alert highlighting (automated conditions)
- [ ] Format and branding applied

### Phase 4.3C: Real-Time Monitoring
- [ ] Alert rules configured (zero conversions, ROAS drop, etc.)
- [ ] Email notifications set up
- [ ] Slack integration (if applicable)
- [ ] On-call rotation established

### Phase 4.3D: Reporting
- [ ] Daily report email scheduled
- [ ] Weekly report template created
- [ ] Report recipients configured
- [ ] Archive process established

### Phase 4.3E: Team Training
- [ ] Dashboard walkthrough (how to read metrics)
- [ ] Alert interpretation (when to act, when to observe)
- [ ] Daily review process (morning checklist)
- [ ] Weekly review meeting agenda

---

## Success Criteria

✅ **Phase 4.3 Complete when:**
1. Campaign performance dashboard created and functional
2. Real-time ROAS, spend, conversion metrics visible
3. All 3 campaigns visible with comparative metrics
4. Alert system operational (email/Slack notifications)
5. Daily automated report email sending
6. Weekly performance summary report active
7. Team trained on dashboard reading
8. Daily review process established (10-15 min morning)
9. Weekly review meeting scheduled
10. Dashboard maintenance procedures documented

---

## Timeline

### Week 1: Setup
- Days 1-2: Data source configuration
- Days 2-3: Dashboard creation
- Days 3-4: Metrics and calculations
- Days 4-5: Testing and validation

### Week 2: Monitoring
- Days 1-2: Alert configuration
- Days 2-3: Report automation setup
- Days 3-4: Team training
- Days 4-5: Process documentation

### Week 3+: Operations
- Daily: Morning dashboard review (10-15 min)
- Weekly: Performance review meeting (30-45 min)
- Monthly: Dashboard audit and refresh

---

**Status:** Ready for Implementation  
**Version:** 1.0  
**Next:** Phase 5 Monitoring & Analysis, Phase 5.1 Daily Monitoring Protocol
