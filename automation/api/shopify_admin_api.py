#!/usr/bin/env python3
"""
Shopify Admin API - Color Metafield Management
Production-ready API for managing color data metafields across all variants
"""

import json
import os
import hashlib
import hmac
import time
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class MetafieldBatch:
    batch_num: int
    mutations: List[Dict]
    status: str = "pending"
    created_at: str = None
    executed_at: str = None
    response: Optional[Dict] = None
    error: Optional[str] = None

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now().isoformat()


class ShopifyAdminAPI:
    """Production Shopify Admin API for color metafield management"""

    def __init__(self, shop_url: Optional[str] = None, access_token: Optional[str] = None):
        self.shop_url = shop_url or os.getenv("SHOPIFY_SHOP_URL")
        self.access_token = access_token or os.getenv("SHOPIFY_ACCESS_TOKEN")
        self.api_version = os.getenv("SHOPIFY_API_VERSION", "2024-01")

        if not self.shop_url or not self.access_token:
            raise ValueError("SHOPIFY_SHOP_URL and SHOPIFY_ACCESS_TOKEN environment variables required")

        self.base_url = f"{self.shop_url}/admin/api/{self.api_version}/graphql.json"
        self.rate_limit_reset = 0
        self.rate_limit_remaining = None
        self.batches: Dict[int, MetafieldBatch] = {}
        self.load_batches()

    def load_batches(self):
        """Load all mutation batches from files"""
        for i in range(1, 5):
            batch_file = f'automation/data/mutations_batch_{i}.json'
            if os.path.exists(batch_file):
                with open(batch_file, 'r') as f:
                    mutations = json.load(f)
                    self.batches[i] = MetafieldBatch(
                        batch_num=i,
                        mutations=mutations
                    )
                logger.info(f"✓ Loaded Batch {i}: {len(mutations)} mutations")

    def build_graphql_mutation(self, mutations: List[Dict]) -> str:
        """Build GraphQL metafieldsSet mutation from JSON mutations"""
        metafields = []
        for m in mutations:
            metafields.append({
                "ownerId": m["ownerId"],
                "namespace": m["namespace"],
                "key": m["key"],
                "value": m["value"],
                "type": m["type"]
            })

        query = f"""mutation {{
  metafieldsSet(metafields: {json.dumps(metafields)}) {{
    metafields {{
      id
      ownerId
      namespace
      key
      value
    }}
    userErrors {{
      field
      message
      code
    }}
  }}
}}"""
        return query

    def execute_batch(self, batch_num: int) -> Tuple[bool, Dict]:
        """Execute a single batch mutation"""
        if batch_num not in self.batches:
            return False, {"error": f"Batch {batch_num} not found"}

        batch = self.batches[batch_num]
        if batch.status == "executed":
            return False, {"error": f"Batch {batch_num} already executed"}

        query = self.build_graphql_mutation(batch.mutations)

        logger.info(f"📤 Executing Batch {batch_num} ({len(batch.mutations)} mutations)...")
        response = self._make_request(query)

        batch.status = "executed"
        batch.executed_at = datetime.now().isoformat()
        batch.response = response

        success = self._validate_response(response)
        if success:
            logger.info(f"✅ Batch {batch_num}: {len(batch.mutations)} metafields created")
        else:
            batch.status = "failed"
            batch.error = response.get("errors", [{}])[0].get("message", "Unknown error")
            logger.error(f"❌ Batch {batch_num} failed: {batch.error}")

        return success, response

    def execute_all_batches(self) -> Dict:
        """Execute all 4 batches sequentially with rate limit handling"""
        results = {"total": 0, "successful": 0, "failed": 0, "batches": {}}

        for batch_num in sorted(self.batches.keys()):
            # Check rate limit
            if time.time() < self.rate_limit_reset:
                wait_time = self.rate_limit_reset - time.time()
                logger.info(f"⏳ Rate limit - waiting {wait_time:.1f}s...")
                time.sleep(wait_time + 0.5)

            success, response = self.execute_batch(batch_num)
            results["batches"][batch_num] = {
                "success": success,
                "mutations": len(self.batches[batch_num].mutations),
                "response": response if not success else None
            }

            if success:
                results["successful"] += len(self.batches[batch_num].mutations)
            else:
                results["failed"] += len(self.batches[batch_num].mutations)

            results["total"] += len(self.batches[batch_num].mutations)

            # Wait between batches
            if batch_num < 4:
                time.sleep(2)

        return results

    def get_batch_status(self, batch_num: int) -> Dict:
        """Get status of a specific batch"""
        if batch_num not in self.batches:
            return {"error": f"Batch {batch_num} not found"}

        batch = self.batches[batch_num]
        return {
            "batch_num": batch.batch_num,
            "status": batch.status,
            "mutations": len(batch.mutations),
            "created_at": batch.created_at,
            "executed_at": batch.executed_at,
            "error": batch.error
        }

    def get_all_batches_status(self) -> Dict:
        """Get status of all batches"""
        return {
            "total_batches": len(self.batches),
            "total_mutations": sum(len(b.mutations) for b in self.batches.values()),
            "batches": {i: self.get_batch_status(i) for i in sorted(self.batches.keys())}
        }

    def export_colors_csv(self, output_file: str = "automation/data/color_export.csv") -> bool:
        """Export all color metafields as CSV for partners"""
        try:
            all_mutations = []
            for batch in sorted(self.batches.values(), key=lambda x: x.batch_num):
                all_mutations.extend(batch.mutations)

            import csv
            with open(output_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=[
                    'variant_id', 'sku', 'color_number', 'color_name',
                    'width_cm', 'width_code', 'material_type', 'usage_class'
                ])
                writer.writeheader()

                for mutation in all_mutations:
                    value = json.loads(mutation["value"])
                    writer.writerow({
                        'variant_id': mutation["ownerId"],
                        'sku': f"sku_{value.get('color_number', 'unknown')}",
                        'color_number': value.get('color_number', ''),
                        'color_name': value.get('color_name', ''),
                        'width_cm': value.get('width_cm', ''),
                        'width_code': value.get('width_code', ''),
                        'material_type': value.get('material_type', ''),
                        'usage_class': value.get('usage_class', '')
                    })

            logger.info(f"✅ CSV exported: {output_file} ({len(all_mutations)} rows)")
            return True
        except Exception as e:
            logger.error(f"❌ CSV export failed: {str(e)}")
            return False

    def _make_request(self, query: str) -> Dict:
        """Make GraphQL request to Shopify Admin API"""
        headers = {
            "X-Shopify-Access-Token": self.access_token,
            "Content-Type": "application/json"
        }

        payload = {"query": query}

        try:
            logger.info(f"📡 Posting GraphQL mutation to {self.base_url}")
            response = requests.post(
                self.base_url,
                json=payload,
                headers=headers,
                timeout=30
            )

            # Update rate limit tracking
            if "X-Shopify-Shop-Api-Call-Limit" in response.headers:
                limit_header = response.headers["X-Shopify-Shop-Api-Call-Limit"]
                used, total = map(int, limit_header.split("/"))
                self.rate_limit_remaining = total - used
                logger.info(f"⏱️  Rate limit: {used}/{total} ({self.rate_limit_remaining} remaining)")

            # Check for rate limit reset time
            if "Retry-After" in response.headers:
                retry_after = int(response.headers["Retry-After"])
                self.rate_limit_reset = time.time() + retry_after
                logger.warning(f"⚠️  Rate limited - reset in {retry_after}s")

            response.raise_for_status()
            data = response.json()

            if "errors" in data and data["errors"]:
                logger.error(f"❌ GraphQL errors: {data['errors']}")

            return data

        except requests.exceptions.RequestException as e:
            logger.error(f"❌ HTTP request failed: {str(e)}")
            return {"errors": [{"message": str(e)}]}

    def _validate_response(self, response: Dict) -> bool:
        """Validate GraphQL response"""
        if "errors" in response:
            return False

        data = response.get("data", {})
        metafields_set = data.get("metafieldsSet", {})
        user_errors = metafields_set.get("userErrors", [])

        return len(user_errors) == 0


class PartnerAPI:
    """Partner-facing API for color data access"""

    def __init__(self, api_key: str, api_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self.requests_log = []

    def verify_signature(self, data: str, signature: str) -> bool:
        """Verify HMAC signature for webhook/API calls"""
        expected = hmac.new(
            self.api_secret.encode(),
            data.encode(),
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def authenticate_request(self, api_key: str, signature: str, data: str) -> bool:
        """Authenticate partner API request"""
        if api_key != self.api_key:
            return False
        return self.verify_signature(data, signature)

    def get_colors(self, filters: Optional[Dict] = None) -> List[Dict]:
        """Get color data with optional filters"""
        # Load color mapping
        with open('automation/data/COMPLETE_COLOR_MAPPING_133.json', 'r') as f:
            mapping = json.load(f)

        colors = mapping.get("colors", {})

        if not filters:
            return [{"number": k, "name": v} for k, v in colors.items()]

        # Apply filters
        result = []
        for num, name in colors.items():
            if filters.get("color_number") and num != filters["color_number"]:
                continue
            if filters.get("name_contains") and filters["name_contains"].lower() not in name.lower():
                continue
            result.append({"number": num, "name": name})

        return result

    def get_variant_colors(self, variant_id: str) -> Optional[Dict]:
        """Get color data for specific variant"""
        # This would query Shopify metafields in production
        logger.info(f"Query color data for variant: {variant_id}")
        return None


def main():
    """Demo execution"""
    print("\n" + "="*80)
    print("Shopify Admin API - Phase 3b Color Metafield Management")
    print("="*80)

    try:
        # Initialize API from environment
        api = ShopifyAdminAPI()
        print(f"✅ Connected to: {api.shop_url}")

        print("\n📊 Batch Status:")
        status = api.get_all_batches_status()
        print(json.dumps(status, indent=2))

        print("\n💾 Export CSV for partners:")
        api.export_colors_csv()

        print("\n✅ API Ready for execution!")
        print("\nTo execute batches:")
        print("  results = api.execute_all_batches()")

    except ValueError as e:
        print(f"\n❌ Configuration Error: {str(e)}")
        print("\nSetup Instructions:")
        print("1. Copy .env.example to .env")
        print("2. Add your Shopify credentials:")
        print("   - SHOPIFY_SHOP_URL (e.g., https://store.myshopify.com)")
        print("   - SHOPIFY_ACCESS_TOKEN (from Shopify Admin)")
        print("   - SHOPIFY_API_VERSION (default: 2024-01)")


if __name__ == "__main__":
    main()
