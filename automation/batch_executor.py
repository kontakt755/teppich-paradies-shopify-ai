#!/usr/bin/env python3
"""
Batch executor - Load batch files and prepare for execution
Reads all batch files and generates the GraphQL mutation data
"""

import json
import time
from pathlib import Path

MUTATION_QUERY = """mutation SetColorMetafields($metafields: [MetafieldsSetInput!]!) {
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
}"""

def load_batch(batch_num: int) -> list:
    """Load a batch file"""
    filepath = f'automation/data/mutations_batch_{batch_num}_all.json'
    if not Path(filepath).exists():
        return None
    with open(filepath) as f:
        return json.load(f)

def main():
    print("\n" + "="*80)
    print("BATCH EXECUTOR - PREPARE FOR EXECUTION")
    print("="*80)

    total_executed = 0
    batch_configs = []

    for batch_num in range(1, 26):
        batch = load_batch(batch_num)
        if not batch:
            print(f"⚠️  Batch {batch_num} not found")
            continue

        # Create config for this batch
        config = {
            "batch_num": batch_num,
            "size": len(batch),
            "metafields": batch
        }
        batch_configs.append(config)
        total_executed += len(batch)

    print(f"\n✓ Loaded {len(batch_configs)} batches")
    print(f"✓ Total mutations: {total_executed}")
    print(f"✓ Ready for sequential execution\n")

    # Show batch summary
    print("Batches loaded:")
    for config in batch_configs:
        print(f"  Batch {config['batch_num']:2d}: {config['size']:2d} metafields")

    # Save execution config
    exec_config = {
        "total_batches": len(batch_configs),
        "total_mutations": total_executed,
        "batches": batch_configs
    }

    with open('automation/data/batch_execution_config.json', 'w') as f:
        # Save without metafield details for size (just metadata)
        metadata = {
            "total_batches": len(batch_configs),
            "total_mutations": total_executed,
            "batches": [{"batch_num": b["batch_num"], "size": b["size"]} for b in batch_configs]
        }
        json.dump(metadata, f, indent=2)

    print(f"""

✓ Configuration saved to automation/data/batch_execution_config.json
✓ All batches ready for sequential execution

To execute all batches:
1. Use mcp__Shopify__graphql_mutation for each batch
2. Pass query + variables (from batch files)
3. Wait 2-3 seconds between each batch
4. Monitor for errors

Estimated execution time: 2-3 minutes
Rate limit usage: ~25 out of 40 API calls per minute
""")

    return batch_configs

if __name__ == "__main__":
    configs = main()
    print(f"\n✓ Ready to execute {len(configs)} batches")
