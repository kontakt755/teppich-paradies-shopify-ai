#!/usr/bin/env python3
"""
Generate mutations for ALL Teppichboden products from Shopify query result
Reads the query result and creates mutation batches
"""

import json
from pathlib import Path
from typing import Dict, List

def load_color_mapping() -> Dict:
    """Load the complete color mapping"""
    with open('automation/data/COMPLETE_COLOR_MAPPING_133.json', 'r') as f:
        return json.load(f)

def extract_color_code(variant_title: str, sku: str) -> str:
    """Extract color code from variant title or SKU"""
    # Try extracting from title like "Grün Dunkel (405)" or "Grau Dunkel (98) / 400 cm"
    if '(' in variant_title and ')' in variant_title:
        code = variant_title.split('(')[1].split(')')[0]
        return code.strip()

    # Try extracting from SKU like "TEPOMEG4_405" or "TEPRIVAO4_098"
    if sku and '_' in sku:
        code = sku.split('_')[-1]
        if code.isdigit() or (len(code) == 3 and code[:2].isdigit()):
            return code.zfill(3)

    return None

def get_width_from_title(title: str) -> int:
    """Extract width from product title"""
    if "200cm" in title or "200 cm" in title:
        return 200
    elif "500" in title or "500cm" in title:
        return 500
    return 400

def get_product_type(title: str) -> str:
    """Determine product type"""
    if "Nadelvlies" in title:
        if "Teppichfliese" in title:
            return "Teppichfliese"
        return "Nadelvlies"
    return "Teppichboden"

def load_query_result(filepath: str) -> List[Dict]:
    """Load products from Shopify query result file"""
    with open(filepath, 'r') as f:
        data = json.load(f)

    variants_list = []
    products = data.get('data', {}).get('products', {}).get('edges', [])

    for product_edge in products:
        product = product_edge.get('node', {})
        product_title = product.get('title', '')

        # Skip non-Teppichboden products
        if 'Teppichboden' not in product_title and 'Teppichfliese' not in product_title and 'Nadelvlies' not in product_title:
            continue

        width = get_width_from_title(product_title)
        product_type = get_product_type(product_title)

        variants = product.get('variants', {}).get('edges', [])
        for variant_edge in variants:
            variant = variant_edge.get('node', {})
            variant_id = variant.get('id', '').split('/')[-1]  # Extract numeric ID
            variant_title = variant.get('title', '')
            sku = variant.get('sku', '')

            if variant_id:
                variants_list.append({
                    'id': variant_id,
                    'product_title': product_title,
                    'title': variant_title,
                    'sku': sku,
                    'width': width,
                    'product_type': product_type
                })

    return variants_list

def create_mutation(variant_id: str, color_data: Dict) -> Dict:
    """Create a metafield mutation for a variant"""
    return {
        "ownerId": f"gid://shopify/ProductVariant/{variant_id}",
        "namespace": "color_data",
        "key": "color_info",
        "value": json.dumps(color_data),
        "type": "json"
    }

def main():
    print("\n" + "="*80)
    print("GENERATE ALL MUTATIONS FROM SHOPIFY QUERY RESULT")
    print("="*80)

    # Load query result
    query_file = '/root/.claude/projects/-home-user-teppich-paradies-shopify-ai/f25fb60d-e453-56fe-8f25-e9377cfc71fd/tool-results/mcp-Shopify-graphql_query-1788264490413.txt'

    if not Path(query_file).exists():
        print(f"❌ Query result file not found: {query_file}")
        return False

    variants = load_query_result(query_file)
    print(f"\n✓ Loaded {len(variants)} variants from query result")

    # Load color mapping
    color_mapping = load_color_mapping()
    colors = color_mapping.get('colors', {})
    print(f"✓ Loaded {len(colors)} colors from mapping")

    # Create mutations
    mutations = []
    skipped = 0

    for variant in variants:
        color_code = extract_color_code(variant['title'], variant['sku'])

        if not color_code or color_code not in colors:
            skipped += 1
            continue

        color_name = colors[color_code]

        color_data = {
            "color_number": color_code,
            "color_name": color_name,
            "width_cm": variant['width'],
            "width_code": str(variant['width'] // 100),
            "material_type": "polyamid",
            "usage_class": "33",
            "product_type": variant['product_type']
        }

        mutation = create_mutation(variant['id'], color_data)
        mutations.append(mutation)

    print(f"✓ Created {len(mutations)} mutations")
    print(f"⚠️  Skipped {skipped} variants (color not found)")

    # Split into batches of 25
    chunk_size = 25
    batches = {}
    for i in range(0, len(mutations), chunk_size):
        batch_num = (i // chunk_size) + 1
        batch = mutations[i:i + chunk_size]
        batches[batch_num] = batch

    print(f"✓ Split into {len(batches)} batches\n")

    # Save all mutation batches
    for batch_num, batch in batches.items():
        filename = f'automation/data/mutations_batch_{batch_num}_all.json'
        with open(filename, 'w') as f:
            json.dump(batch, f, indent=2)
        print(f"✓ Batch {batch_num}: {len(batch)} mutations → {filename}")

    print("\n" + "="*80)
    print("NEXT STEPS")
    print("="*80)
    print(f"""
✓ Total mutations ready: {len(mutations)}
✓ Total batches: {len(batches)}
✓ Ready for execution via GraphQL mutation

To proceed:
1. Execute each batch via mcp__Shopify__graphql_mutation
2. Use the metafieldsSet mutation with each batch's metafields array
3. Monitor for errors and rate limits
4. Verify in Shopify Admin
""")

    return True

if __name__ == "__main__":
    main()
