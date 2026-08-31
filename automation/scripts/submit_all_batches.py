#!/usr/bin/env python3
"""
Execute all 4 mutation batches sequentially to Shopify GraphQL API
This script reads each GraphQL query file and prepares it for API submission
"""

import json
import time
import os

def submit_batch_to_shopify(batch_num):
    """
    Prepare batch for Shopify GraphQL API submission
    Returns the GraphQL query to be submitted
    """

    query_file = f'automation/data/shopify_batch_{batch_num}_query.graphql'
    mutations_file = f'automation/data/mutations_batch_{batch_num}.json'

    if not os.path.exists(query_file):
        print(f"❌ Batch {batch_num} query file not found: {query_file}")
        return None

    with open(query_file, 'r') as f:
        graphql_query = f.read()

    with open(mutations_file, 'r') as f:
        mutations = json.load(f)

    return {
        "batch_num": batch_num,
        "query": graphql_query,
        "mutations_count": len(mutations),
        "query_size_chars": len(graphql_query),
        "status": "ready"
    }

def main():
    print("\n" + "="*80)
    print("PHASE 3b: EXECUTE ALL MUTATION BATCHES")
    print("="*80)

    all_batches = []

    # Prepare all 4 batches
    for batch_num in range(1, 5):
        batch_info = submit_batch_to_shopify(batch_num)
        if batch_info:
            all_batches.append(batch_info)
            print(f"\n✓ Batch {batch_num} prepared:")
            print(f"    Mutations: {batch_info['mutations_count']}")
            print(f"    Query size: {batch_info['query_size_chars']:,} chars")

    if not all_batches:
        print("❌ No batches found!")
        return

    print(f"\n📦 Total batches ready: {len(all_batches)}")
    print(f"📊 Total mutations: {sum(b['mutations_count'] for b in all_batches)}")

    print("\n" + "="*80)
    print("NEXT STEPS:")
    print("="*80)
    print("""
To execute these mutations in Shopify:

1. For EACH batch (1, 2, 3, 4) in order:
   a. Read the query from automation/data/shopify_batch_N_query.graphql
   b. Execute via mcp__Shopify__graphql_mutation tool
   c. Check response for userErrors (should be empty array [])
   d. Verify metafields returned (should match batch size)
   e. Wait ~2-3 seconds before next batch

2. Expected API Response Structure:
   {
     "data": {
       "metafieldsSet": {
         "metafields": [
           {
             "id": "gid://shopify/Metafield/...",
             "ownerId": "gid://shopify/ProductVariant/...",
             "namespace": "color_data",
             "key": "color_info",
             "value": "{...json...}"
           }
           // 100 items per batch (22 for batch 4)
         ],
         "userErrors": []  // Should be empty!
       }
     }
   }

3. After all batches complete:
   - Phase 4a: Verify CSV export
   - Phase 4b: Test B2B export endpoint
   - Phase 4c: Document API for partners

EXECUTION CHECKLIST:
""")

    for i, batch in enumerate(all_batches, 1):
        print(f"  ☐ Batch {batch['batch_num']}: Submit {batch['mutations_count']} mutations")

    print("\n" + "="*80)

    # Save execution plan
    execution_plan = {
        "phase": "3b",
        "action": "Execute GraphQL mutations via Shopify API",
        "batches": len(all_batches),
        "total_mutations": sum(b['mutations_count'] for b in all_batches),
        "batch_details": [
            {
                "batch": b['batch_num'],
                "mutations": b['mutations_count'],
                "query_file": f"automation/data/shopify_batch_{b['batch_num']}_query.graphql",
                "status": "ready"
            }
            for b in all_batches
        ],
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "instructions": "Execute each batch in sequence via mcp__Shopify__graphql_mutation tool"
    }

    with open('automation/data/execution_plan_phase3b.json', 'w') as f:
        json.dump(execution_plan, f, indent=2)

    print(f"📋 Execution plan saved: automation/data/execution_plan_phase3b.json")
    print("\n✅ All batches ready for API submission!\n")

if __name__ == "__main__":
    main()
