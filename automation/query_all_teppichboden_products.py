#!/usr/bin/env python3
"""
Query ALL Teppichboden products from Shopify and generate complete mutation set
This will fetch variants for all 15 Teppichboden products and create mutations
"""

import json
from pathlib import Path

# GraphQL query to fetch all Teppichboden products with their variants
QUERY = """
{
  products(first: 50, query: "title:*Teppichboden* OR title:*Teppichfliese*") {
    edges {
      node {
        id
        title
        handle
        variants(first: 100) {
          edges {
            node {
              id
              title
              sku
            }
          }
        }
      }
    }
  }
}
"""

def extract_color_code(title: str, sku: str) -> str:
    """Extract color code from variant title or SKU"""
    if '(' in title and ')' in title:
        code = title.split('(')[1].split(')')[0]
        return code.strip()

    if '_' in sku:
        parts = sku.split('_')
        code = parts[-1]
        if code.isdigit() or (len(code) == 3 and code[:2].isdigit()):
            return code.zfill(3)

    return None

def load_color_mapping():
    """Load color mapping"""
    with open('automation/data/COMPLETE_COLOR_MAPPING_133.json', 'r') as f:
        return json.load(f)

def create_mutation(variant_id: str, color_data: dict) -> dict:
    """Create metafield mutation"""
    return {
        "ownerId": f"gid://shopify/ProductVariant/{variant_id}",
        "namespace": "color_data",
        "key": "color_info",
        "value": json.dumps(color_data),
        "type": "json"
    }

def get_default_product_type(title: str) -> str:
    """Determine product type from title"""
    if "Nadelvlies" in title:
        if "Teppichfliese" in title:
            return "Teppichfliese"
        return "Nadelvlies"
    return "Teppichboden"

def get_default_width(title: str) -> int:
    """Extract width from title"""
    if "200cm" in title:
        return 200
    elif "500" in title or "500cm" in title:
        return 500
    return 400

def main():
    print("\n" + "="*80)
    print("FETCH ALL TEPPICHBODEN PRODUCTS & GENERATE MUTATIONS")
    print("="*80)

    # This will be executed via the Shopify GraphQL API
    # For now, this is the query that needs to be run
    print(f"\n📋 GraphQL Query to execute:")
    print(QUERY)

    print(f"""

Next step: Execute this query via mcp__Shopify__graphql_query to fetch all products
Then I'll generate mutations for all variants

Expected results:
- 15 Teppichboden products
- ~332 total variants
- Color codes extracted from titles/SKUs
- Mutations split into batches of 25
""")

if __name__ == "__main__":
    main()
