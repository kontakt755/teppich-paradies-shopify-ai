# Google Ads Phase 4.1 – Conversion Tracking Configuration
## Setup & Validation Guide

**Issue:** #52  
**Status:** In Development  
**Priority:** P1  
**Date:** 2026-09-03  
**Depends On:** Phase 3 (#49-#51) completion & Phase 2 Search campaigns active  

---

## Overview

Phase 4.1 establishes comprehensive conversion tracking for Google Ads campaigns to measure ROI across all three Phase 2 product categories (Teppichboden, Teppiche, Vinylboden) and page optimization efforts (Phase 3).

### Objectives

1. Define and configure purchase conversion (primary KPI)
2. Set up intermediate conversions (AddToCart, ViewItem) for funnel analysis
3. Configure conversion value tracking (€/transaction)
4. Implement dynamic tracking for upsells/add-ons
5. Validate tracking with Google Tag Assistant
6. Create fallback tracking for data integrity
7. Document conversion definitions for team reference

### Success Metrics

**Conversion Tracking Readiness:**
- ✅ All 3 conversion types defined and active
- ✅ Conversion values accurately mapped to transaction amounts
- ✅ Tag Assistant validation: 0 errors, all recommended tags firing
- ✅ 48-hour test period shows consistent tracking
- ✅ GA4 → Google Ads conversion sync working

---

## Conversion Types Defined

### 1. Purchase Conversion (Primary KPI)

**Trigger:** Order completion (post-payment success)  
**Value Type:** Dynamic (transaction total in €)  
**Counting Method:** All conversions (even repeat customers)  

**Configuration Details:**
- **Conversion Name:** `purchase` (Shopify order confirmed)
- **Conversion Category:** Purchase
- **Count:** Every conversion (not one-per-user)
- **Value:** Transaction amount (€)
- **Currency:** EUR
- **Attribution Window:** 30 days (default Google Ads attribution)

**Data Source:**
```
Shopify Order Event → GA4 purchase event
→ Google Ads Conversion Tag
EventName: purchase
EventValue: order.total_price (€)
Currency: EUR
Transaction ID: order.id
```

**Expected Data:**
- Average order value: €50-300 (varies by product category)
- Conversion rate target: 2-3% of sessions
- Daily conversions: 5-20 (ramping during campaign)

### 2. AddToCart Conversion (Intermediate Funnel)

**Trigger:** Product added to shopping cart  
**Value Type:** None (tracking intent, not value)  
**Counting Method:** All conversions (funnel insight)  

**Configuration Details:**
- **Conversion Name:** `add_to_cart`
- **Conversion Category:** Add to cart
- **Count:** Every conversion (funnel analysis)
- **Value:** None (this is a leading indicator, not revenue)
- **Attribution Window:** 1 day (short-term intent)

**Data Source:**
```
Shopify Add to Cart → GA4 add_to_cart event
→ Google Ads Conversion Tag
EventName: add_to_cart
ProductName: [product title]
ProductCategory: [category]
Quantity: [items added]
```

**Expected Data:**
- Add-to-cart rate: 5-15% of sessions
- Daily conversions: 50-150 (funnel volume)
- Valuable for understanding drop-off between view and purchase

### 3. ViewItem Conversion (Awareness Funnel)

**Trigger:** Product detail page viewed (PDP load)  
**Value Type:** None (tracking awareness)  
**Counting Method:** All conversions (awareness metrics)  

**Configuration Details:**
- **Conversion Name:** `view_item`
- **Conversion Category:** View item
- **Count:** Every conversion (awareness funnel)
- **Value:** None (awareness metric, not revenue)
- **Attribution Window:** 1 day

**Data Source:**
```
Shopify Product Page View → GA4 view_item event
→ Google Ads Conversion Tag
EventName: view_item
ProductName: [product title]
ProductCategory: [category]
ProductPrice: [€ price]
```

**Expected Data:**
- View rate: 20-40% of sessions
- Daily conversions: 200-500 (top-of-funnel volume)
- Indicates ad relevance and landing page quality

---

## Conversion Funnel Architecture

### Funnel Flow

```
Google Ads Click (100%)
    ↓
Landing Page View (60-80%)
    ↓
Product Detail View [view_item] (20-40%)
    ↓
Add to Cart [add_to_cart] (5-15%)
    ↓
Checkout Start (3-8%)
    ↓
Purchase [purchase] (2-3%)
```

### Expected Conversion Rates by Phase

**Phase 2 Launch (Weeks 1-2):**
- View Item: 15-25%
- Add to Cart: 3-8%
- Purchase: 0.5-1.5%

**Phase 3 Optimization (Weeks 3-4):**
- View Item: 25-35% (improved landing page relevance)
- Add to Cart: 5-10% (better product showcase)
- Purchase: 1.5-2.5% (improved CRO)

**Phase 4+ Optimization (Month 2+):**
- View Item: 35-45%
- Add to Cart: 8-12%
- Purchase: 2-3.5%

---

## Google Ads Conversion Configuration

### Step 1: Access Google Ads Conversion Tracking

1. Login to Google Ads (ads.google.com)
2. Navigate to: **Tools & Settings** → **Conversions**
3. Click **+ Conversion** to add new conversion

### Step 2: Set Up Purchase Conversion

**Configuration:**
```
Name: purchase
Category: Purchase
Conversion window: 30 days
Attribution model: Data-driven (when available), else Last-click
Count conversions: Every
Include in "Conversions" column: Yes (primary metric)
Include in "Conv. value" column: Yes (revenue tracking)
Value tracking: Every conversion has different value
Revenue tracking: Enabled
Value currency: EUR
```

**Tracking Code Integration:**
- Source: Google Tag Manager + GA4
- Event name: `purchase`
- Event value parameter: `value` (in EUR)
- Transaction ID: `transaction_id`

### Step 3: Set Up AddToCart Conversion

**Configuration:**
```
Name: add_to_cart
Category: Add to cart
Conversion window: 1 day
Attribution model: Data-driven (when available), else Last-click
Count conversions: Every
Include in "Conversions" column: No (supporting metric)
Include in "Conv. value" column: No
Value tracking: None
Revenue tracking: Disabled
```

**Tracking Code Integration:**
- Source: Google Tag Manager + GA4
- Event name: `add_to_cart`
- Transaction ID: None (not order-level)

### Step 4: Set Up ViewItem Conversion

**Configuration:**
```
Name: view_item
Category: View item
Conversion window: 1 day
Attribution model: Data-driven (when available), else Last-click
Count conversions: Every
Include in "Conversions" column: No (awareness metric)
Include in "Conv. value" column: No
Value tracking: None
Revenue tracking: Disabled
```

**Tracking Code Integration:**
- Source: Google Tag Manager + GA4
- Event name: `view_item`
- Transaction ID: None

---

## Conversion Value Configuration

### Dynamic Conversion Value Setup

**For Purchase Conversions:**

```javascript
// Google Tag Manager - Conversion Value Tracking
dataLayer.push({
  event: 'purchase',
  transaction_id: '{{ Order.id }}',
  value: {{ Order.total_price }},  // €  amount
  currency: 'EUR',
  items: [
    {
      item_id: '{{ product.id }}',
      item_name: '{{ product.title }}',
      item_category: '{{ product.type }}',
      price: {{ product.price }},
      quantity: {{ product.quantity }}
    }
  ]
});
```

**Value Mapping by Product Category:**

| Category | Avg Order Value | Range | Example |
|---|---|---|---|
| Teppichboden | €80 | €40-150 | Package deals, m² pricing |
| Teppiche | €120 | €60-300 | Handmade premiums |
| Vinylboden | €70 | €35-200 | Installation bundles |

### Conversion Value Currency

- **Primary Currency:** EUR (€)
- **Shopify Default:** EUR (verify in store settings)
- **GA4 Reporting Currency:** EUR
- **Google Ads Target:** EUR

**Validation Checklist:**
- [ ] All price data in EUR
- [ ] No currency conversion in tracking code
- [ ] Google Ads campaign currency: EUR
- [ ] GA4 reporting currency: EUR

---

## GA4 to Google Ads Integration

### Enable Conversion Sync

**In GA4 Property:**
1. Navigate to: **Admin** → **Product Links** → **Google Ads Links**
2. Click **+ New Google Ads Link**
3. Select Google Ads account
4. Choose Google Ads property to link
5. **Enable Enhanced Ecommerce Data Sharing**

**Select Conversions to Sync:**
- ✅ `purchase` (primary)
- ✅ `add_to_cart` (funnel)
- ✅ `view_item` (awareness)

**Sync Frequency:** Real-time (data available in Google Ads within minutes)

### Verification of Sync

**In Google Ads:**
1. Go to: **Tools & Settings** → **Conversions**
2. Look for "Linked GA4 property" indicator
3. Verify conversion counts match GA4 (within 5% for 24-hour lag)

---

## Testing & Validation

### Pre-Launch Testing (48-Hour Period)

**Day 1 Testing Setup:**

1. **Install Tag Assistant**
   - Chrome extension: https://chrome.google.com/webstore (search "Tag Assistant")
   - Authorize with Google account

2. **Tag Assistant Validation**
   - Visit product page → should show `view_item` tag firing
   - Add product to cart → should show `add_to_cart` tag firing
   - Complete test purchase → should show `purchase` tag firing

3. **Expected Results:**
   ```
   Tag Assistant Report:
   - Google Analytics: ✅ Firing
   - Google Ads Tag (Purchase): ✅ Firing
   - GA4 Events (purchase, add_to_cart, view_item): ✅ All firing
   - Errors: 0
   - Warnings: 0
   ```

**Day 1 Google Ads Validation:**

1. Real-time: **Tools & Settings** → **Conversions**
   - Verify test purchase shows in conversion list
   - Confirm value (€) is correctly captured

2. GA4 Real-time: **Admin** → **Real-time**
   - View user journeys
   - Confirm events flowing: view_item → add_to_cart → purchase

**Day 2 Validation:**

1. **Conversion Count Verification**
   - Google Ads Conversions tab: should show 1+ purchase conversion
   - GA4 Conversion events: should show matching counts (±1)
   - Check 24-hour discrepancy is <5%

2. **Conversion Value Accuracy**
   - Verify purchase value matches order amount
   - Example: Order €87.50 → Conversion Value €87.50 ✅

3. **Cross-Device Tracking**
   - If possible, test purchase flow across mobile + desktop
   - Verify single purchase counted once (not duplicated)

### Tag Assistant Checklist

- [ ] Tag Assistant installed and updated
- [ ] Google Analytics tag fires on all pages
- [ ] Google Ads conversion tags fire on correct pages
- [ ] No tag errors or warnings
- [ ] Event parameters (value, currency, transaction_id) present
- [ ] All 3 conversion types firing in correct order

### Real-Time Monitoring

**Monitor for 48 hours:**

```
Hour 1-24:
- Check Google Ads Conversions tab every 4 hours
- Expected: At least 2-3 test conversions visible
- Latency: <5 minutes from click to conversion recording

Hour 24-48:
- Verify historical data in Conversions report
- Check GA4 ↔ Google Ads sync (Admin → Product Links)
- Confirm no duplicate counting

Post-48h:
- Campaign live - monitor daily conversion flow
- Set up alerts for unusual conversion spikes/drops
```

---

## Troubleshooting Guide

### Issue: No Conversions Showing in Google Ads

**Diagnosis:**
1. Check Tag Assistant: Is purchase tag firing?
2. Check GA4 Real-time: Are purchase events flowing?
3. Check conversion definition: Is it configured to "include in conversions"?

**Solutions:**
```
Step 1: Verify Tag Installation
- Confirm GA4 tag ID is correct
- Ensure GTM container is published
- Check for Content Security Policy blocking tags

Step 2: Check Conversion Event Mapping
- GA4 event name must match Google Ads conversion event name
- Case-sensitive: 'purchase' not 'Purchase'
- Verify event value parameter: 'value' (not 'total' or 'amount')

Step 3: Verify Conversion Settings
- Conversion window: Should be 30 days (purchase)
- Attribution model: Should be "Data-driven"
- "Include in Conversions" checkbox: Must be checked
```

### Issue: Conversion Values Are 0 or Missing

**Diagnosis:**
1. Check GTM data layer: Is `value` parameter present?
2. Check GA4 events: Do purchase events have `value` parameter?

**Solutions:**
```
Step 1: Verify Data Layer
- Console log should show: {value: 87.50, currency: 'EUR'}
- Confirm Shopify order total is in EUR

Step 2: Check Event Parameters
- GA4 debugger should show value parameter
- Currency parameter must be 'EUR'
- Numeric value (not string): 87.50 not "87.50"

Step 3: Verify Google Ads Configuration
- Conversion: "Include in Conv. value" should be checked
- Value tracking: "Every conversion has different value" should be selected
- Revenue tracking: Should be enabled
```

### Issue: Duplicate Conversions

**Diagnosis:**
1. Purchase counted multiple times for single order
2. Conversion count doesn't match order count

**Solutions:**
```
Step 1: Verify Deduplication
- Google Ads: Check transaction_id is unique per order
- GA4: Verify order ID is transaction_id
- Remove cross-domain tracking if not needed

Step 2: Check Conversion Configuration
- Count conversions: Should be "Every conversion"
- But transaction_id deduplicates automatically
- Verify Shopify order_id is unique
```

---

## Fallback Tracking (Data Integrity)

### Secondary Tracking Method

If GA4 → Google Ads sync has issues, implement direct server-side tracking:

```javascript
// Shopify Post-Purchase Webhook
POST /webhooks/orders/fulfilled
{
  shop_id: "...",
  order_id: "...",
  customer_email: "...",
  total_price: 87.50,
  timestamp: "2026-09-03T12:30:00Z",
  
  // Send to Google Ads Conversion API
  POST https://googleads.googleapis.com/v13/customers/{customer_id}/conversions:create
  {
    customerId: "...",
    conversions: [{
      gclid: "...", // From GA4 session
      conversionAction: "conversion_action/purchase", // Resource name
      conversionDateTime: "2026-09-03T12:30:00+00:00",
      conversionValue: 87.50,
      currencyCode: "EUR",
      conversionEnvironment: "WEB"
    }]
  }
}
```

**When to Enable:**
- After initial 48-hour validation
- As backup if GA4 sync has >10% discrepancy
- For high-value orders that must be tracked

---

## Implementation Checklist

### Phase 4.1A: Configuration
- [ ] Purchase conversion defined in Google Ads
- [ ] AddToCart conversion defined in Google Ads
- [ ] ViewItem conversion defined in Google Ads
- [ ] All conversions linked to GA4
- [ ] Conversion values configured (dynamic €)
- [ ] Attribution window set (30 days for purchase)

### Phase 4.1B: Tracking Code
- [ ] GA4 tag installed and firing
- [ ] GTM container configured with conversion events
- [ ] Data layer mapping verified (value, currency, transaction_id)
- [ ] Event parameters populated correctly
- [ ] No console errors or warnings

### Phase 4.1C: Testing & Validation
- [ ] Tag Assistant: 0 errors, all tags firing
- [ ] Test purchase completed (Day 1)
- [ ] Conversion visible in Google Ads (Day 1, <5 min latency)
- [ ] Conversion value matches order amount (€)
- [ ] GA4 ↔ Google Ads sync working (24-hour match ±5%)
- [ ] Real-time monitoring active

### Phase 4.1D: Documentation
- [ ] Conversion definitions documented
- [ ] Tracking code commented and version-controlled
- [ ] Troubleshooting guide reviewed
- [ ] Fallback tracking procedure documented
- [ ] Team trained on monitoring/debugging

---

## Success Criteria

✅ **Phase 4.1 Complete when:**
1. All 3 conversion types configured and active
2. Tag Assistant validation: 0 errors
3. Test period shows all conversions firing correctly
4. Conversion values accurate within ±1% of order amounts
5. GA4 ↔ Google Ads data sync working (±5% match)
6. Latency <5 minutes from click to conversion recording
7. No duplicate conversions (order_id deduplication working)
8. Real-time monitoring established
9. Troubleshooting guide documented
10. Team trained on validation procedures

---

## Timeline

### Week 1: Configuration & Testing
- Day 1-2: Set up conversions in Google Ads
- Day 2-3: Install tracking code and GTM configuration
- Day 3-4: Tag Assistant validation
- Day 4-5: 48-hour test period
- Day 5-6: Data validation and reconciliation
- Day 6-7: Documentation and team training

### Week 2+: Monitoring
- Daily: Check conversion flow (1-5 conversions/day minimum)
- Weekly: Reconcile Google Ads vs GA4 counts
- Ongoing: Monitor for tracking anomalies

---

## Monitoring & Alerts

### Daily Monitoring Dashboard Metrics

```
Purchase Conversions:
- Count: 1-20/day (ramping from launch)
- Value: €50-300 per conversion
- Rate: 2-3% of landing page sessions

Add-to-Cart:
- Count: 10-50/day (funnel volume)
- Rate: 5-15% of product view sessions

View Item:
- Count: 100-500/day (awareness)
- Rate: 20-40% of landing page sessions
```

### Alert Triggers

- **Zero conversions for 6+ hours** → Investigate tracking
- **Conversion value = 0** → Check GA4 event parameters
- **Duplicate spike** → Verify transaction_id deduplication
- **GA4 ↔ Ads discrepancy >10%** → Enable fallback tracking

---

## Handoff to Phase 4.2

**Phase 4.1 Deliverables:**
- ✅ Conversion tracking fully functional
- ✅ All conversions verified and firing
- ✅ Conversion values accurate (±1%)
- ✅ Data sync working (GA4 ↔ Google Ads)

**Phase 4.2 Prerequisites:**
- Conversion tracking ready (validation passed)
- Historical conversion data: 100+ conversions collected
- ROAS baseline established (revenue ÷ ad spend)
- Ready to optimize bids based on conversion value

---

**Status:** Ready for Implementation  
**Version:** 1.0  
**Next:** Phase 4.2 (#53), Phase 4.3 (#54) Dashboard, Phase 5 Monitoring
