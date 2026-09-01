#!/usr/bin/env python3
"""
Execute all mutation batches sequentially
This script generates the GraphQL mutation calls that need to be executed
"""

import json
from pathlib import Path

MUTATION_QUERY = """
mutation SetColorMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      id
      namespace
      key
      value
      type
      ownerType
    }
    userErrors {
      field
      message
      code
    }
  }
}
"""

def load_batch(batch_num: int):
    """Load mutation batch"""
    filename = f'automation/data/mutations_batch_{batch_num}_all.json'
    with open(filename, 'r') as f:
        return json.load(f)

def main():
    print("\n" + "="*80)
    print("EXECUTE ALL MUTATION BATCHES")
    print("="*80)

    total_mutations = 0
    payloads = []

    for batch_num in range(1, 26):
        batch = load_batch(batch_num)
        total_mutations += len(batch)

        payload = {
            "query": MUTATION_QUERY.strip(),
            "variables": {
                "metafields": batch
            }
        }

        payloads.append({
            "batch_num": batch_num,
            "size": len(batch),
            "payload": payload
        })

    print(f"\n✓ Loaded {len(payloads)} batches")
    print(f"✓ Total mutations to execute: {total_mutations}")

    # Save payloads to file for reference
    with open('automation/data/all_batch_payloads.json', 'w') as f:
        # Convert to a simpler format for display
        summary = []
        for p in payloads:
            summary.append({
                "batch": p['batch_num'],
                "mutations": p['size'],
                "total_from_batch": total_mutations
            })
        json.dump(summary, f, indent=2)

    print(f"""
✓ Payloads prepared and saved
✓ Ready for execution

EXECUTION PLAN:
- 25 batches × 1-2 GraphQL mutations each
- Estimated rate: 25 API calls total (~37.5% of 40 calls/min limit)
- Execution time: ~2 minutes with pauses

To execute: Each batch below needs to be sent via mcp__Shopify__graphql_mutation
Use this GraphQL query and the variables from each batch file

GraphQL Mutation Query (same for all batches):
{MUTATION_QUERY}

Instructions:
1. Load each mutations_batch_N_all.json file
2. Execute via mcp__Shopify__graphql_mutation with query + variables
3. Wait 2-3 seconds between batches (rate limit safety)
4. Monitor responses for errors

Batch summary (first 5):
""")

    for i, p in enumerate(payloads[:5]):
        print(f"  Batch {p['batch_num']}: {p['size']} metafields")

    if len(payloads) > 5:
        print(f"  ... ({len(payloads) - 5} more batches)")

    print("\nReady for execution!")

if __name__ == "__main__":
    main()
