#!/bin/bash
# Execute all 25 mutation batches sequentially
# This script prepares each batch for execution

echo "=========================================="
echo "PHASE 3b - BATCH EXECUTION SEQUENCE"
echo "=========================================="

total_batches=25
mutation_query='mutation SetColorMetafields($metafields: [MetafieldsSetInput!]!) {
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
}'

echo ""
echo "Total batches to execute: $total_batches"
echo "Mutations per batch: ~25 (except last batch: 16)"
echo "Total mutations: 616"
echo ""
echo "Execution plan:"
echo "- Execute batches sequentially (2-3 second delay between batches)"
echo "- Monitor responses for errors"
echo "- Expected completion: ~2-3 minutes"
echo ""

# For each batch, show the mutation data
for batch_num in {1..5}; do
    echo "=========================================="
    echo "BATCH $batch_num"
    echo "=========================================="

    batch_file="automation/data/mutations_batch_${batch_num}_all.json"

    if [ -f "$batch_file" ]; then
        # Count mutations in this batch
        mutation_count=$(python3 -c "import json; f=open('$batch_file'); data=json.load(f); print(len(data)); f.close()")
        echo "File: $batch_file"
        echo "Mutations: $mutation_count"
        echo "Status: Ready for execution"
        echo ""
        echo "To execute this batch:"
        echo "Use mcp__Shopify__graphql_mutation with:"
        echo "  - Query: (see above)"
        echo "  - Variables: {\"metafields\": [25 metafield objects from $batch_file]}"
        echo ""
    else
        echo "File not found: $batch_file"
    fi
done

echo "=========================================="
echo "..."
echo "... (Batches 6-25 follow the same pattern)"
echo "=========================================="
echo ""
echo "Note: For full automation, batches 6-25 need to be executed"
echo "Each batch file is ready in automation/data/mutations_batch_N_all.json"
