# Deployment & Execution Guide

## Overview

Complete guide for deploying the Shopify Admin API and Partner REST API, then executing Phase 3b mutations.

---

## Prerequisites

- Python 3.11+
- pip / virtual environment
- Shopify Admin access (to generate access token)
- 322 prepared mutations in `automation/data/mutations_batch_*.json`

---

## Step 1: Configure Environment

### 1.1 Copy Environment Template

```bash
cd automation/api
cp .env.example .env
```

### 1.2 Get Shopify Access Token

1. Go to Shopify Admin → Apps and channels → App and sales channel settings
2. Create a custom app (or use existing):
   - **App name**: Teppich Paradies AI
   - **Admin API scopes** required:
     - `write_products`
     - `read_products`
     - `write_metafields`
     - `read_metafields`
3. Save and retrieve access token (format: `shpat_xxxxxxxxx`)

### 1.3 Edit .env File

```bash
# automation/api/.env
SHOPIFY_SHOP_URL=https://your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_VERSION=2024-01
API_SECRET=your-webhook-secret-here
API_PORT=8000
```

---

## Step 2: Install Dependencies

```bash
# Install from requirements.txt
pip install -r automation/api/requirements.txt

# Verify installation
python -c "import fastapi, uvicorn, pydantic, requests; print('✅ All dependencies installed')"
```

---

## Step 3: Validate Configuration

Run the deployment checker:

```bash
python automation/api/deploy.py
```

This will verify:
- ✅ Environment variables set correctly
- ✅ All Python packages installed
- ✅ Admin API can connect to Shopify
- ✅ Partner REST API can initialize
- ✅ Batch files loaded correctly

---

## Step 4: Execute Phase 3b Mutations

### Option A: Manual Execution (Recommended for first run)

```python
#!/usr/bin/env python3
import sys
sys.path.insert(0, 'automation/api')

from shopify_admin_api import ShopifyAdminAPI

# Initialize API from environment
api = ShopifyAdminAPI()

# Check batch status
print("\n📊 Batch Status:")
status = api.get_all_batches_status()
print(f"  Total batches: {status['total_batches']}")
print(f"  Total mutations: {status['total_mutations']}")

# Execute all batches sequentially
print("\n🚀 Executing all batches...")
results = api.execute_all_batches()

print(f"\n✅ Execution Complete:")
print(f"  Total processed: {results['total']}")
print(f"  Successful: {results['successful']}")
print(f"  Failed: {results['failed']}")

# Export CSV for partners
print("\n💾 Exporting CSV...")
api.export_colors_csv()

print("\n✅ Phase 3b Complete!")
```

Save as `execute_mutations.py` and run:

```bash
python execute_mutations.py
```

### Option B: Using Admin API Directly

```python
from automation.api.shopify_admin_api import ShopifyAdminAPI

api = ShopifyAdminAPI()

# Execute all 4 batches (322 mutations total)
# Batch 1: 100 mutations
# Batch 2: 100 mutations
# Batch 3: 100 mutations
# Batch 4: 22 mutations

results = api.execute_all_batches()
```

### Expected Behavior

- Batch 1 executes → logs response → waits 2s
- Batch 2 executes → logs response → waits 2s
- Batch 3 executes → logs response → waits 2s
- Batch 4 executes (22 mutations) → logs response
- Rate limiting handled automatically
- CSV export generated: `automation/data/color_export.csv`

### Monitoring Execution

Real-time logs show:
```
📤 Executing Batch 1 (100 mutations)...
⏱️  Rate limit: 40/40 (0 remaining)
⏳ Rate limit - waiting 5.2s...
✅ Batch 1: 100 metafields created
📊 Response: {...}
```

---

## Step 5: Verify Mutations in Shopify

After execution, verify metafields in Shopify Admin:

1. Navigate to Products → [Any carpet product] → Variants
2. Scroll to Metafields section
3. Confirm `color_data` metafield populated with JSON:
   ```json
   {
     "color_number": "405",
     "color_name": "Grün Dunkel",
     "width_cm": 400,
     "width_code": "4",
     "material_type": "polyamid",
     "usage_class": "33",
     "product_type": "Teppichboden"
   }
   ```

---

## Step 6: Deploy Partner REST API

### Option A: Local Development

```bash
cd automation/api

# Start API with auto-reload
python deploy.py
```

This runs the validation checks and starts the Partner REST API on `http://localhost:8000`

### Option B: Docker Deployment

```bash
cd automation/api

# Build image
docker build -t teppich-api:latest .

# Run container
docker run -d \
  -p 8000:8000 \
  -e SHOPIFY_SHOP_URL=https://your-store.myshopify.com \
  -e SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx \
  -e API_SECRET=your-webhook-secret \
  --name teppich-api \
  teppich-api:latest

# View logs
docker logs -f teppich-api

# Stop container
docker stop teppich-api
```

### Option C: Cloud Deployment (Heroku example)

```bash
# Initialize Heroku
heroku login
heroku create teppich-api

# Set environment variables
heroku config:set SHOPIFY_SHOP_URL=https://your-store.myshopify.com
heroku config:set SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx
heroku config:set API_SECRET=your-webhook-secret

# Deploy
git push heroku main

# View logs
heroku logs -t
```

---

## Step 7: API Access & Testing

### Health Check

```bash
curl http://localhost:8000/api/v1/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-09-01T12:00:00",
  "version": "1.0.0"
}
```

### Get All Colors

```bash
curl -H "X-API-Key: test-key" \
  http://localhost:8000/api/v1/colors
```

### Search Colors

```bash
curl -X POST http://localhost:8000/api/v1/colors/search \
  -H "X-API-Key: test-key" \
  -H "Content-Type: application/json" \
  -d '{"name_contains": "Grün"}'
```

### API Documentation (Interactive)

```
http://localhost:8000/docs
```

---

## Step 8: Generate & Distribute Partner API Keys

### Generate Secure Key

```python
import uuid
import secrets

# Strong random key
api_key = str(uuid.uuid4())
# OR
api_key = secrets.token_urlsafe(32)

print(f"New API Key: {api_key}")
```

### Store Keys in Environment

```bash
# .env
PARTNER_API_KEYS='{"partner-1": "uuid-key-1", "partner-2": "uuid-key-2"}'
```

### Distribute to Partners

```
Partner API Credentials:
────────────────────────
Endpoint: https://api.teppich-paradies.de/api/v1
API Key: YOUR_KEY_HERE
Documentation: https://api.teppich-paradies.de/api/v1/docs

Example Request:
curl -H "X-API-Key: YOUR_KEY_HERE" \
  https://api.teppich-paradies.de/api/v1/colors
```

---

## Step 9: Setup Shopify Webhooks

1. Shopify Admin → Settings → Webhooks
2. Create webhook:
   - **Event**: Metafield updates
   - **Endpoint URL**: `https://your-api.com/api/v1/webhooks/metafield-update`
   - **API version**: 2024-01

3. Copy webhook secret to `.env`:
   ```bash
   API_SECRET=whsec_xxxxxxxxxxxxx
   ```

4. Test webhook:
   ```bash
   curl -X POST http://localhost:8000/api/v1/webhooks/metafield-update \
     -H "Content-Type: application/json" \
     -H "X-Shopify-Hmac-SHA256: test" \
     -d '{"id": "test-webhook"}'
   ```

---

## Troubleshooting

### Issue: "Invalid access token"

**Solution**: Verify token format and scopes in Shopify Admin

```bash
# Check environment variable is set
echo $SHOPIFY_ACCESS_TOKEN
# Should output: shpat_xxxxxxxxxxxxx
```

### Issue: "Rate limit exceeded"

**Solution**: API automatically handles rate limiting. Check logs:

```
⏳ Rate limit - waiting 5.2s...
```

The API will wait and retry automatically.

### Issue: "Color mapping file not found"

**Solution**: Ensure file exists and path is correct

```bash
ls -la automation/data/COMPLETE_COLOR_MAPPING_133.json
```

### Issue: "Batch already executed"

**Solution**: Each batch can only execute once per session. Reload batches:

```python
api = ShopifyAdminAPI()  # Fresh instance loads fresh batches
results = api.execute_all_batches()
```

---

## Monitoring & Logging

### Admin API Logs

```bash
# Real-time logs while running
tail -f automation/logs/api.log

# All logs
cat automation/logs/api.log
```

### Metrics to Track

- Mutations per batch
- Success/failure rate
- Average response time
- Rate limit utilization
- Partner API requests

### Alerts

Monitor for:
- ❌ Error rate > 5%
- ⏱️ Response time > 500ms
- 🚫 Rate limit violations
- 🔌 Webhook delivery failures

---

## Post-Deployment Checklist

- [x] Environment configured (.env with real credentials)
- [x] Dependencies installed (`pip install -r requirements.txt`)
- [x] Configuration validated (`python deploy.py`)
- [x] Admin API connected to Shopify
- [x] Phase 3b mutations executed (322 variants updated)
- [x] CSV export generated for partners
- [x] Partner REST API deployed (local/Docker/cloud)
- [x] Partner API keys generated and distributed
- [x] Shopify webhooks configured
- [x] Monitoring and logging enabled
- [x] Documentation shared with partners

---

## Next Steps

1. **Phase 4a**: Verify CSV export with complete variant data
2. **Phase 4b**: Test B2B export endpoint with partner credentials
3. **Phase 4c**: Document API integration guide for partners
4. **Phase 4d**: Setup analytics and usage monitoring

---

## Support

For issues or questions:
- Check logs: `automation/logs/api.log`
- Review API docs: `http://localhost:8000/docs`
- Test endpoints: Use curl examples above
- Debug: Enable `LOG_LEVEL=DEBUG` in `.env`

