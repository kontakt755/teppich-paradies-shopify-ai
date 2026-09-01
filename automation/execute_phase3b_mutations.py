#!/usr/bin/env python3
"""
Phase 3b Execution - Color Metafield Mutations
Executes all 322 mutations in chunks of 25
NOTE: This script requires mcp__Shopify__graphql_mutation access via Claude
"""

import json
import sys
import time
from pathlib import Path

def load_all_mutations():
    """Load all mutation batches from files"""
    all_mutations = []

    for batch_num in range(1, 5):
        batch_file = f'automation/data/mutations_batch_{batch_num}.json'
        if Path(batch_file).exists():
            with open(batch_file, 'r') as f:
                mutations = json.load(f)
                all_mutations.extend(mutations)

    return all_mutations

def build_graphql_mutation_payload(metafields_chunk):
    """Build GraphQL mutation payload for a chunk"""
    mutation_query = """
    mutation SetColorMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          ownerId
          namespace
          key
          value
          type
        }
        userErrors {
          field
          message
          code
        }
      }
    }
    """

    return {
        "query": mutation_query.strip(),
        "variables": {
            "metafields": metafields_chunk
        }
    }

def main():
    """Execute Phase 3b mutations"""
    print("\n" + "="*80)
    print("PHASE 3b EXECUTION - COLOR METAFIELD MUTATIONS")
    print("="*80)

    # Load all mutations
    all_mutations = load_all_mutations()
    print(f"\n✓ Loaded {len(all_mutations)} mutations")

    # Split into chunks of 25
    chunk_size = 25
    chunks = []
    for i in range(0, len(all_mutations), chunk_size):
        chunk = all_mutations[i:i + chunk_size]
        chunks.append(chunk)

    print(f"✓ Split into {len(chunks)} chunks\n")

    # Generate all payloads
    payloads = []
    for i, chunk in enumerate(chunks, 1):
        payload = build_graphql_mutation_payload(chunk)
        payloads.append({
            "chunk_num": i,
            "total_chunks": len(chunks),
            "size": len(chunk),
            "payload": payload
        })

    # Print instructions for manual execution
    print("="*80)
    print("EXECUTION INSTRUCTIONS")
    print("="*80)
    print("""
Each chunk below needs to be executed via mcp__Shopify__graphql_mutation.
Execute in order with 2-second delays between chunks.

IMPORTANT: The query and variables are separate - pass them as:
  - query: the GraphQL mutation string
  - variables: the JSON object with metafields array
""")

    # Print all payloads
    for payload_info in payloads:
        print(f"\n{'='*80}")
        print(f"CHUNK {payload_info['chunk_num']}/{payload_info['total_chunks']} ({payload_info['size']} metafields)")
        print(f"{'='*80}")

        payload = payload_info['payload']

        print(f"\n📋 GraphQL Query:")
        print(payload['query'])

        print(f"\n📊 Variables (metafields array with {len(payload['variables']['metafields'])} items):")
        print(json.dumps(payload['variables'], indent=2)[:500] + "...")

        print(f"\n💡 Sample mutation (first metafield):")
        first = payload['variables']['metafields'][0]
        print(f"  ownerId: {first['ownerId']}")
        print(f"  namespace: {first['namespace']}")
        print(f"  key: {first['key']}")
        print(f"  type: {first['type']}")
        print(f"  value: {first['value'][:100]}...")

    print("\n" + "="*80)
    print("TO EXECUTE:")
    print("="*80)
    print("""
For each chunk:
1. Use mcp__Shopify__graphql_mutation tool
2. Pass the GraphQL query and variables above
3. Wait 2 seconds before next chunk
4. Monitor for errors and user errors in response

Expected success: 322 metafields created across 13 chunks.
Each response should have:
  - metafields array (success items)
  - userErrors array (empty if successful)
""")

    # Save payloads to file for reference
    output_file = 'automation/data/phase3b_payloads.json'
    with open(output_file, 'w') as f:
        json.dump(payloads, f, indent=2)
    print(f"\n✓ Payloads saved to {output_file}")

if __name__ == "__main__":
    main()
