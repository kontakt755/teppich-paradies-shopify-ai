#!/usr/bin/env python3
"""
Generiere GraphQL Mutations für ALLE Teppichboden-Varianten
Basierend auf echten Shopify-Daten + intelligenten Farbzuordnungen
"""

import json
import re
from populate_color_metafields import (
    extract_color_number_from_sku,
    parse_width_from_sku,
    build_color_metafield_value,
    PRODUCT_CONFIG,
    COLOR_NAMES
)

# Lade GraphQL Response
with open('/root/.claude/projects/-home-user-teppich-paradies-shopify-ai/f25fb60d-e453-56fe-8f25-e9377cfc71fd/tool-results/mcp-Shopify-graphql_query-1788204586489.txt', 'r') as f:
    shopify_data = json.load(f)

# Extrahiere alle Teppichboden-Varianten
all_variants = []

for product in shopify_data['data']['products']['edges']:
    prod = product['node']
    title = prod.get('title', '')

    # Nur Teppichboden-Produkte
    if 'Teppichboden' not in title and 'Hochflor' not in title and 'Nadelvlies' not in title and 'Teppichfliese' not in title:
        continue

    # Extrahiere Produktname
    match = re.search(r'(\w+)\s+(?:Teppichboden|Hochflor|Nadelvlies|Teppichfliese)', title)
    if not match:
        continue

    product_name = match.group(1).lower()

    # Check if we have config for this product
    if product_name not in PRODUCT_CONFIG:
        continue

    variant_id = prod.get('id', '')

    # Process variants
    for variant in prod.get('variants', {}).get('edges', []):
        var = variant['node']
        sku = var.get('sku', '')
        variant_id = var.get('id', '')

        if not sku or not variant_id:
            continue

        all_variants.append({
            'variant_id': variant_id,
            'sku': sku,
            'product_name': product_name,
            'config': PRODUCT_CONFIG[product_name]
        })

print(f"✅ Gefunden: {len(all_variants)} Varianten aus Shopify")

# Generiere Mutations
mutations = []
skipped = []

for variant in all_variants:
    color_num = extract_color_number_from_sku(variant['sku'])

    if not color_num:
        skipped.append(variant['sku'])
        continue

    width_cm, width_code = parse_width_from_sku(variant['sku'])
    if not width_cm:
        skipped.append(variant['sku'])
        continue

    metafield_value = build_color_metafield_value(
        variant['sku'],
        variant['product_name'],
        variant['config']
    )

    if not metafield_value:
        skipped.append(variant['sku'])
        continue

    mutations.append({
        "ownerId": variant['variant_id'],
        "namespace": "color_data",
        "key": "color_info",
        "value": json.dumps(metafield_value),
        "type": "json",
        "metafield_value": metafield_value
    })

print(f"✅ Generiert: {len(mutations)} Mutations")
print(f"⚠️  Übersprungen: {len(skipped)} (keine Farbnummer parsbar)")

# Speichere Mutations
with open('automation/data/all_mutations.json', 'w') as f:
    json.dump(mutations, f, indent=2)

# Teile in Batches (max 100 pro Batch)
batch_size = 100
batch_count = (len(mutations) + batch_size - 1) // batch_size

print(f"\n📦 Teile in {batch_count} Batches auf (max {batch_size} pro Batch):")

for i in range(batch_count):
    start_idx = i * batch_size
    end_idx = min((i + 1) * batch_size, len(mutations))
    batch_mutations = mutations[start_idx:end_idx]

    batch_file = f'automation/data/mutations_batch_{i+1}.json'
    with open(batch_file, 'w') as f:
        json.dump(batch_mutations, f, indent=2)

    print(f"  Batch {i+1}: {batch_file} ({len(batch_mutations)} Mutations)")

print(f"\n✅ FERTIG! {len(mutations)} Mutations bereit für Phase 3b")
print(f"\nNächster Schritt: Execute Phase 3b via GraphQL API")
