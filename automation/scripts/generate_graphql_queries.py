#!/usr/bin/env python3
"""
Generate GraphQL queries for each mutation batch.
Converts JSON mutations to GraphQL metafieldsSet mutations.
"""

import json

def build_graphql_query(mutations):
    """Build GraphQL metafieldsSet mutation from batch mutations"""

    # Build metafields array
    metafields = []
    for m in mutations:
        metafields.append({
            "ownerId": m["ownerId"],
            "namespace": m["namespace"],
            "key": m["key"],
            "value": m["value"],
            "type": m["type"]
        })

    # Build GraphQL query
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

print("\n" + "="*80)
print("Phase 3b: Generate GraphQL Queries for All Batches")
print("="*80)

# Generate queries for all 4 batches
for batch_num in range(1, 5):
    batch_file = f'automation/data/mutations_batch_{batch_num}.json'

    # Load mutations
    with open(batch_file, 'r') as f:
        mutations = json.load(f)

    # Build GraphQL query
    query = build_graphql_query(mutations)

    # Save to file
    query_file = f'automation/data/shopify_batch_{batch_num}_query.graphql'
    with open(query_file, 'w') as f:
        f.write(query)

    print(f"\n✓ Batch {batch_num}:")
    print(f"    Mutations: {len(mutations)}")
    print(f"    Query file: {query_file}")
    print(f"    Query size: {len(query):,} bytes")

print("\n" + "="*80)
print("✅ All GraphQL queries generated!")
print("="*80)

# Create execution summary
summary = {
    "phase": "3b",
    "status": "ready_for_execution",
    "batches": 4,
    "mutations_per_batch": [100, 100, 100, 22],
    "total_mutations": 322,
    "next_step": "Execute each GraphQL query via Shopify API",
    "instructions": """
For each batch in order:
1. Read the GraphQL query from automation/data/shopify_batch_N_query.graphql
2. Execute via mcp__Shopify__graphql_mutation tool
3. Verify response (check userErrors array = empty)
4. Wait ~2 seconds before next batch
5. Repeat for batches 1-4
"""
}

with open('automation/data/phase3b_graphql_status.json', 'w') as f:
    json.dump(summary, f, indent=2)

print(f"📋 Status saved to: automation/data/phase3b_graphql_status.json\n")
