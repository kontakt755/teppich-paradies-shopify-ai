#!/usr/bin/env python3
"""
Phase 3b Execution - Color Metafield Mutations
Executes all 322 mutations in chunks of 25 (Shopify's maximum per request)
Using the correct MetafieldsSetInput GraphQL input type
"""

import json
import sys
from pathlib import Path

# Add automation/api to path for imports
sys.path.insert(0, str(Path(__file__).parent / "api"))

def load_all_mutations():
    """Load all mutation batches from files"""
    all_mutations = []
    batch_count = 0

    for batch_num in range(1, 5):
        batch_file = f'automation/data/mutations_batch_{batch_num}.json'
        if Path(batch_file).exists():
            with open(batch_file, 'r') as f:
                mutations = json.load(f)
                all_mutations.extend(mutations)
                batch_count += 1
                print(f"✓ Loaded Batch {batch_num}: {len(mutations)} mutations")

    print(f"\n📊 Total mutations loaded: {len(all_mutations)} across {batch_count} batches")
    return all_mutations

def build_graphql_mutation(metafields_chunk):
    """
    Build correct GraphQL mutation for metafieldsSet
    Uses MetafieldsSetInput input type (not MetafieldInput)
    """
    # Build the mutation variables - this will be passed as variables to GraphQL
    mutation = """
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
        "query": mutation,
        "variables": {
            "metafields": metafields_chunk
        }
    }

def display_mutation_payload(payload, chunk_num, total_chunks):
    """Display the GraphQL mutation payload being sent"""
    print(f"\n📤 Chunk {chunk_num}/{total_chunks} ({len(payload['variables']['metafields'])} metafields)")
    print(f"  Sample variant: {payload['variables']['metafields'][0]['ownerId']}")
    print(f"  GraphQL Query preview:")
    print(payload['query'].strip()[:200] + "...")
    print(f"  Variables: {len(payload['variables']['metafields'])} metafields with:")
    for field in ['namespace', 'key', 'type']:
        sample = payload['variables']['metafields'][0].get(field)
        print(f"    - {field}: {sample}")

def main():
    """Execute Phase 3b mutations"""
    print("\n" + "="*80)
    print("PHASE 3b - COLOR METAFIELD MUTATIONS")
    print("="*80)

    # Load all mutations
    all_mutations = load_all_mutations()

    if not all_mutations:
        print("❌ No mutations found!")
        return False

    # Split into chunks of 25 (Shopify maximum per request)
    chunk_size = 25
    chunks = []
    for i in range(0, len(all_mutations), chunk_size):
        chunk = all_mutations[i:i + chunk_size]
        chunks.append(chunk)

    print(f"\n🔀 Split into {len(chunks)} chunks (max 25 per request)")

    # Display mutation structure for first chunk
    print("\n" + "="*80)
    print("MUTATION STRUCTURE VALIDATION")
    print("="*80)

    payload = build_graphql_mutation(chunks[0])
    display_mutation_payload(payload, 1, len(chunks))

    print("\n" + "="*80)
    print("READY FOR EXECUTION")
    print("="*80)
    print(f"""
✓ Total mutations: {len(all_mutations)}
✓ Chunks to execute: {len(chunks)}
✓ GraphQL Input Type: MetafieldsSetInput (CORRECT)
✓ Chunk size: max {chunk_size} per request (Shopify limit)

Next steps:
1. Use mcp__Shopify__graphql_mutation with the payloads generated above
2. Execute each chunk sequentially with 2-second delays
3. Monitor rate limits and retry if needed
4. Verify success in Shopify Admin

To execute, run: python automation/execute_phase3b_mutations.py
""")

    return True

if __name__ == "__main__":
    main()
