#!/usr/bin/env python3
"""
Phase 3b: Execute all color_data metafield mutations via Shopify GraphQL API
Sends batches of mutations to Shopify to populate metafields for all variants
"""

import json
import sys
import time

def build_metafields_set_mutation(mutations):
    """Build GraphQL metafieldsSet mutation from mutation objects"""

    metafields = []
    for m in mutations:
        metafields.append({
            "ownerId": m["ownerId"],
            "namespace": m["namespace"],
            "key": m["key"],
            "value": m["value"],
            "type": m["type"]
        })

    # Build the GraphQL query
    query = """
    mutation {
      metafieldsSet(metafields: %s) {
        metafields {
          id
          ownerId
          namespace
          key
          value
        }
        userErrors {
          field
          message
          code
        }
      }
    }
    """ % json.dumps(metafields)

    return query

def load_batch_file(batch_num):
    """Load a mutation batch file"""
    filename = f'automation/data/mutations_batch_{batch_num}.json'
    try:
        with open(filename, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return None

def main():
    print("\n" + "="*80)
    print("Phase 3b: Sending Metafield Mutations to Shopify GraphQL API")
    print("="*80)

    # Find all batch files
    batch_files = []
    for i in range(1, 10):  # Check up to 9 batches
        batch = load_batch_file(i)
        if batch is None:
            break
        batch_files.append((i, batch))

    print(f"\n📦 Gefunden: {len(batch_files)} Batch-Dateien")
    total_mutations = sum(len(b[1]) for b in batch_files)
    print(f"📊 Gesamt: {total_mutations} Mutations")

    # Print GraphQL mutation examples
    print("\n" + "-"*80)
    print("📋 GraphQL Mutation Beispiel (für Batch 1):")
    print("-"*80)

    if batch_files:
        first_batch = batch_files[0][1][:2]  # First 2 mutations only
        example_query = build_metafields_set_mutation(first_batch)
        print(example_query[:500] + "...\n")

    print("\n" + "="*80)
    print("🚀 PHASE 3b INSTRUCTIONS:")
    print("="*80)
    print("""
Diese Python-Skripte generiert die GraphQL Mutations.

Um die Mutations auszuführen, musst du:

1. SHOPIFY API TOOL VERWENDEN:
   - Für jeden Batch: Kopiere den generated Query (batch 1-4)
   - Nutze mcp__Shopify__graphql_mutation tool
   - Sende die Mutation ab

2. BEISPIEL für Batch 1:
   mutation {
     metafieldsSet(metafields: [
       {
         "ownerId": "gid://shopify/ProductVariant/...",
         "namespace": "color_data",
         "key": "color_info",
         "value": "{...json...}",
         "type": "json"
       }
     ]) {
       metafields { id namespace key value }
       userErrors { field message }
     }
   }

3. VERIFIKATION:
   - Überprüfe userErrors: null = Erfolg ✓
   - Überprüfe metafields.length = Batch-Größe
   - Warte 2s zwischen Batches

4. NACH 3b:
   - Alle 322 Variants sollten color_data metafields haben
   - Phase 4: CSV Export validation
    """)

    # Generate and save formatted mutations for manual execution
    print("\n📝 Speichere formatted GraphQL Mutations...\n")

    for batch_num, mutations in batch_files:
        query = build_metafields_set_mutation(mutations)
        output_file = f'automation/data/phase3b_graphql_batch_{batch_num}.graphql'

        with open(output_file, 'w') as f:
            f.write(query)

        print(f"  ✓ Batch {batch_num}: {output_file} ({len(mutations)} mutations)")

    print("\n" + "="*80)
    print("✅ Phase 3b vorbereitet!")
    print("="*80)
    print(f"""
Nächster Schritt: Führe GraphQL Mutations aus
- 4 Batch-Dateien generiert (phase3b_graphql_batch_1.graphql bis .4.graphql)
- Nutze Shopify GraphQL Mutation Tool für jeden Batch
- Total: {total_mutations} Metafield-Updates
""")

if __name__ == "__main__":
    main()
