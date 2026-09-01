# Shopify Admin API Setup Guide

## Overview

Complete production-ready APIs for managing color metafield data:

1. **Admin API** (`shopify_admin_api.py`) - Internal mutation management
2. **Partner REST API** (`partner_rest_api.py`) - B2B color data access
3. **Webhook Integration** - Real-time updates

---

## 1. Admin API Setup

### Features
- Batch mutation management (4 batches × 100 mutations)
- Sequential execution with rate limiting
- CSV export for partners
- Comprehensive logging

### Usage

```python
from automation.api.shopify_admin_api import ShopifyAdminAPI

# Initialize
api = ShopifyAdminAPI(
    shop_url="https://your-store.myshopify.com",
    access_token="shpat_xxxxx"  # From Shopify Admin
)

# Load all batches
api.load_batches()

# Get status
status = api.get_all_batches_status()
print(status)

# Execute all batches
results = api.execute_all_batches()

# Export CSV
api.export_colors_csv()
```

### Configuration

**Environment Variables** (`.env`):
```
SHOPIFY_SHOP_URL=https://your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
SHOPIFY_API_VERSION=2024-01
```

### Get Shopify Access Token

1. Go to Shopify Admin → Apps and channels → App and sales channel settings
2. Create custom app or use existing
3. Scopes required:
   - `write_products`
   - `read_products`
   - `write_metafields`
   - `read_metafields`
4. Copy access token

---

## 2. Partner REST API Setup

### Quick Start

```bash
# Install dependencies
pip install -r automation/api/requirements.txt

# Start API server
python -m uvicorn automation.api.partner_rest_api:app --reload

# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### Docker Deployment

```bash
cd automation/api

# Build image
docker build -t teppich-api .

# Run container
docker run -p 8000:8000 \
  -e SHOPIFY_SHOP_URL=https://your-store.myshopify.com \
  -e SHOPIFY_ACCESS_TOKEN=shpat_xxxxx \
  teppich-api
```

### API Endpoints

#### Authentication
All requests except `/health` require:
```
Header: X-API-Key: your-api-key
```

#### Public Endpoints

**Health Check**
```
GET /api/v1/health
```

**Get All Colors**
```
GET /api/v1/colors
Authorization: X-API-Key

Response:
{
  "total_colors": 124,
  "colors": {
    "003": "Creme",
    "004": "Weiß",
    ...
  }
}
```

**Get Specific Color**
```
GET /api/v1/colors/405
Authorization: X-API-Key

Response:
{
  "color_number": "405",
  "color_name": "Grün Dunkel"
}
```

**Search Colors**
```
POST /api/v1/colors/search
Authorization: X-API-Key
Content-Type: application/json

{
  "name_contains": "Grün",
  "color_range": {"min": 400, "max": 410}
}

Response:
{
  "total": 2,
  "colors": [
    {"color_number": "403", "color_name": "Grün Mittel"},
    {"color_number": "405", "color_name": "Grün Dunkel"}
  ]
}
```

**Get Variant Color Data**
```
GET /api/v1/variants/{variant_id}/color
Authorization: X-API-Key

Response:
{
  "variant_id": "gid://shopify/ProductVariant/60326240813390",
  "color_data": {
    "color_number": "405",
    "color_name": "Grün Dunkel",
    "width_cm": 400,
    "width_code": "4",
    "material_type": "polyamid",
    "usage_class": "33",
    "product_type": "Teppichboden"
  },
  "last_updated": "2026-09-01T12:00:00"
}
```

**Bulk Export**
```
POST /api/v1/export/bulk
Authorization: X-API-Key
Content-Type: application/json

{
  "format": "csv",
  "include_metadata": true
}

Response: CSV file download
```

**Statistics**
```
GET /api/v1/stats
Authorization: X-API-Key

Response:
{
  "total_colors": 124,
  "total_variants": 332,
  "colors_from_titles": 28,
  "colors_intelligent": 96,
  "last_updated": "2026-09-01T12:00:00"
}
```

---

## 3. Webhook Integration

### Setup Shopify Webhooks

1. Admin → Settings → Webhooks
2. Create webhook:
   - **Topic**: Metafield updates
   - **URL**: `https://your-api.com/api/v1/webhooks/metafield-update`
   - **API version**: 2024-01

3. Configure signature verification:
   - Copy webhook secret
   - Set as `API_SECRET` in `.env`

### Webhook Flow

```
Shopify → POST /api/v1/webhooks/metafield-update
         ├─ Verify HMAC signature
         ├─ Process update
         └─ Return 200 OK
```

---

## 4. API Key Management

### Create Partner API Keys

```python
from automation.api.partner_rest_api import app

# Generate API key (use UUID or strong random string)
import uuid
API_KEY = str(uuid.uuid4())

# Store securely (database or secrets manager)
API_KEYS[API_KEY] = {
    "partner": "partner-name",
    "created_at": datetime.now(),
    "rate_limit": 1000  # requests/hour
}
```

### Distribute to Partners

```
Partner API Credentials:
- Endpoint: https://api.teppich-paradies.de/api/v1
- API Key: <your-key>
- Documentation: https://api.teppich-paradies.de/api/v1/docs

Example Request:
curl -H "X-API-Key: <your-key>" \
  https://api.teppich-paradies.de/api/v1/colors
```

---

## 5. Rate Limiting

### Current Configuration
- 1000 requests/hour per API key
- Batch requests: 10 requests/minute

### Headers Returned
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1693526400
```

---

## 6. Error Handling

### Standard Error Responses

**401 Unauthorized**
```json
{
  "detail": "Invalid API key"
}
```

**404 Not Found**
```json
{
  "detail": "Color not found"
}
```

**400 Bad Request**
```json
{
  "detail": "Unsupported format"
}
```

---

## 7. Production Checklist

- [ ] Set all environment variables
- [ ] Generate secure API keys
- [ ] Configure HTTPS/TLS
- [ ] Setup rate limiting
- [ ] Configure webhooks in Shopify
- [ ] Deploy to production (Docker/Cloud)
- [ ] Monitor API logs
- [ ] Setup backup and failover

---

## 8. Testing

### Health Check
```bash
curl http://localhost:8000/api/v1/health
```

### API Documentation (Interactive)
```
http://localhost:8000/docs
```

### Example Requests

```bash
# Get all colors
curl -H "X-API-Key: test-key" \
  http://localhost:8000/api/v1/colors

# Search colors
curl -X POST http://localhost:8000/api/v1/colors/search \
  -H "X-API-Key: test-key" \
  -H "Content-Type: application/json" \
  -d '{"name_contains": "Grün"}'

# Get variant color
curl -H "X-API-Key: test-key" \
  http://localhost:8000/api/v1/variants/60326240813390/color
```

---

## Support & Monitoring

### Logging
```
automation/logs/api.log
```

### Metrics
- Request count by endpoint
- Average response time
- Error rate
- API key usage

### Alerts
- High error rate (>5%)
- Slow responses (>500ms)
- Rate limit violations
- Webhook failures

---

## Next Steps

1. ✅ Set Shopify access token
2. ✅ Execute Phase 3b mutations via Admin API
3. ✅ Deploy Partner REST API
4. ✅ Distribute API keys to partners
5. ✅ Setup webhooks for real-time updates
