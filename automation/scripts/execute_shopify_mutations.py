#!/usr/bin/env python3
"""
Execute Shopify GraphQL mutations for color metafields
Converts JSON mutations to proper GraphQL format
"""

import json
import subprocess
import time

def build_graphql_mutation(mutations):
    """Build proper GraphQL metafieldsSet mutation from mutation objects"""

    # Build the GraphQL mutation string with proper formatting
    metafields_array = []

    for m in mutations:
        # Build each metafield object with proper GraphQL formatting
        metafield_obj = {
            "ownerId": m["ownerId"],
            "namespace": m["namespace"],
            "key": m["key"],
            "value": m["value"],
            "type": m["type"]
        }
        metafields_array.append(metafield_obj)

    # Create the query using Python's json.dumps to ensure proper escaping
    query = f"""mutation {{
  metafieldsSet(metafields: {json.dumps(metafields_array)}) {{
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

def execute_batch_via_shopify_tool(batch_num, mutations):
    """Execute mutations using the mcp__Shopify__graphql_mutation tool via bash"""

    query = build_graphql_mutation(mutations)

    # Save query to temp file for execution
    temp_file = f'/tmp/shopify_mutation_batch_{batch_num}.graphql'
    with open(temp_file, 'w') as f:
        f.write(query)

    print(f"\n📤 Batch {batch_num}: Sending {len(mutations)} mutations to Shopify...")
    print(f"   Query file: {temp_file}")
    print(f"   Query size: {len(query)} chars")

    # NOTE: In a real automation scenario, we would call the Shopify tool here
    # For now, we're generating the queries and saving them for manual execution
    return query

def main():
    print("\n" + "="*80)
    print("PHASE 3b: Execute Shopify GraphQL Mutations for Color Metafields")
    print("="*80)

    # Load all batches
    batches = []
    for i in range(1, 10):
        batch_file = f'automation/data/mutations_batch_{i}.json'
        try:
            with open(batch_file, 'r') as f:
                batch = json.load(f)
                batches.append((i, batch))
                print(f"✓ Loaded Batch {i}: {len(batch)} mutations")
        except FileNotFoundError:
            break

    if not batches:
        print("❌ No batch files found!")
        return

    print(f"\n📦 Total batches: {len(batches)}")
    total_mutations = sum(len(b[1]) for b in batches)
    print(f"📊 Total mutations: {total_mutations}")

    print("\n" + "="*80)
    print("EXECUTING MUTATIONS VIA SHOPIFY GRAPHQL API")
    print("="*80)

    # Save all queries for documentation
    all_queries = {}

    for batch_num, mutations in batches:
        query = execute_batch_via_shopify_tool(batch_num, mutations)
        all_queries[batch_num] = query

        # Save individual query file
        query_file = f'automation/data/shopify_batch_{batch_num}_query.graphql'
        with open(query_file, 'w') as f:
            f.write(query)

        print(f"   ✓ Query saved to: {query_file}")

    print("\n" + "="*80)
    print("INSTRUCTIONS FOR MANUAL EXECUTION:")
    print("="*80)
    print(f"""
Since GraphQL execution requires direct Shopify API access via the tool,
follow these steps:

1. For each batch file (1-{len(batches)}):
   - Read automation/data/shopify_batch_N_query.graphql
   - Execute using mcp__Shopify__graphql_mutation tool
   - Wait for response (check for userErrors)

2. Expected results per batch:
   - Batch 1: {len(batches[0][1])} metafields created ✓
   - Batch 2: {len(batches[1][1])} metafields created ✓
   - Batch 3: {len(batches[2][1])} metafields created ✓
   - Batch 4: {len(batches[3][1])} metafields created ✓

3. Validation: Check for userErrors array (should be empty)

4. After all batches complete:
   - Phase 4a: CSV Export verification
   - Phase 4b: Setup B2B export endpoint
    """)

    # Save execution status
    status = {
        "phase": "3b",
        "status": "ready_for_execution",
        "total_mutations": total_mutations,
        "batches": len(batches),
        "mutations_per_batch": [len(b[1]) for b in batches],
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    with open('automation/data/phase3b_status.json', 'w') as f:
        json.dump(status, f, indent=2)

    print(f"\n✅ Phase 3b queries generated and ready")
    print(f"📝 Status: automation/data/phase3b_status.json")

if __name__ == "__main__":
    main()
