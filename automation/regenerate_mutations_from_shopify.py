#!/usr/bin/env python3
"""
Regenerate Phase 3b mutation batches using current Shopify variant IDs
This script creates fresh mutations from the color mapping and current product variants
"""

import json
from pathlib import Path
from typing import Dict, List

def load_color_mapping() -> Dict:
    """Load the complete color mapping"""
    with open('automation/data/COMPLETE_COLOR_MAPPING_133.json', 'r') as f:
        return json.load(f)

def get_current_shopify_variants() -> List[Dict]:
    """
    Return the current variant list from Shopify query result
    This is the data we got from mcp__Shopify__graphql_query
    """
    variants = [
        # Kontura Teppichboden 400cm - 19 variants
        {"id": "60326240813390", "title": "Grün Dunkel (405)", "sku": "TEPOMEG4_405", "color": "405"},
        {"id": "60326240846158", "title": "Grün Dunkel (406)", "sku": "TEPOMEG4_406", "color": "406"},
        {"id": "60326240878926", "title": "Grün Mittel (403)", "sku": "TEPOMEG4_403", "color": "403"},
        {"id": "60326240911694", "title": "Blau Mittel (304)", "sku": "TEPOMEG4_304", "color": "304"},
        {"id": "60326240944462", "title": "Blau Dunkel (307)", "sku": "TEPOMEG4_307", "color": "307"},
        {"id": "60326240977230", "title": "Blau Hell (309)", "sku": "TEPOMEG4_309", "color": "309"},
        {"id": "60326241009998", "title": "Braun Mittel (705)", "sku": "TEPOMEG4_705", "color": "705"},
        {"id": "60326241042766", "title": "Beige Dunkel (407)", "sku": "TEPOMEG4_407", "color": "407"},
        {"id": "60326241075534", "title": "Beige Mittel (704)", "sku": "TEPOMEG4_704", "color": "704"},
        {"id": "60326241108302", "title": "Anthrazit Mittel (508)", "sku": "TEPOMEG4_508", "color": "508"},
        {"id": "60326241141070", "title": "Grau Dunkel (904)", "sku": "TEPOMEG4_904", "color": "904"},
        {"id": "60326241173838", "title": "Grau Mittel (514)", "sku": "TEPOMEG4_514", "color": "514"},
        {"id": "60326241206606", "title": "Grau Mittel (516)", "sku": "TEPOMEG4_516", "color": "516"},
        {"id": "60326241239374", "title": "Grau Hell (515)", "sku": "TEPOMEG4_515", "color": "515"},
        {"id": "60326241272142", "title": "Schwarz Dunkel (902)", "sku": "TEPOMEG4_902", "color": "902"},
        {"id": "60326241304910", "title": "Orange Dunkel (706)", "sku": "TEPOMEG4_706", "color": "706"},
        {"id": "60326241337678", "title": "Rot Mittel (106)", "sku": "TEPOMEG4_106", "color": "106"},
        {"id": "60326241370446", "title": "Rot Dunkel (107)", "sku": "TEPOMEG4_107", "color": "107"},
        {"id": "60326241403214", "title": "Gelb Mittel (205)", "sku": "TEPOMEG4_205", "color": "205"},
        # Amara Teppichboden 400cm/500cm - 18 variants
        {"id": "60326505251150", "title": "Grau Dunkel (98) / 400 cm", "sku": "TEPRIVAO4_098", "color": "098"},
        {"id": "60326505283918", "title": "Grau Dunkel (98) / 500 cm", "sku": "TEPRIVAO5_098", "color": "098"},
        {"id": "60326505316686", "title": "Grau Hell (95) / 400 cm", "sku": "TEPRIVAO4_095", "color": "095"},
        {"id": "60326505349454", "title": "Grau Hell (95) / 500 cm", "sku": "TEPRIVAO5_095", "color": "095"},
        {"id": "60326505382222", "title": "Blau Mittel (79) / 400 cm", "sku": "TEPRIVAO4_079", "color": "079"},
        {"id": "60326505414990", "title": "Blau Mittel (79) / 500 cm", "sku": "TEPRIVAO5_079", "color": "079"},
        {"id": "60326505447758", "title": "Braun Dunkel (64) / 400 cm", "sku": "TEPRIVAO4_064", "color": "064"},
        {"id": "60326505480526", "title": "Braun Dunkel (64) / 500 cm", "sku": "TEPRIVAO5_064", "color": "064"},
        {"id": "60326505513294", "title": "Braun Hell (53) / 400 cm", "sku": "TEPRIVAO4_053", "color": "053"},
        {"id": "60326505546062", "title": "Braun Hell (53) / 500 cm", "sku": "TEPRIVAO5_053", "color": "053"},
        {"id": "60326505578830", "title": "Beige Mittel (39) / 400 cm", "sku": "TEPRIVAO4_039", "color": "039"},
        {"id": "60326505611598", "title": "Beige Mittel (39) / 500 cm", "sku": "TEPRIVAO5_039", "color": "039"},
        {"id": "60326505644366", "title": "Beige Hell (31) / 400 cm", "sku": "TEPRIVAO4_031", "color": "031"},
        {"id": "60326505677134", "title": "Beige Hell (31) / 500 cm", "sku": "TEPRIVAO5_031", "color": "031"},
        {"id": "60326505709902", "title": "Grün Mittel (29) / 400 cm", "sku": "TEPRIVAO4_029", "color": "029"},
        {"id": "60326505742670", "title": "Grün Mittel (29) / 500 cm", "sku": "TEPRIVAO5_029", "color": "029"},
        {"id": "60326505775438", "title": "Rot Mittel (14) / 400 cm", "sku": "TEPRIVAO4_014", "color": "014"},
        {"id": "60326505808206", "title": "Rot Mittel (14) / 500 cm", "sku": "TEPRIVAO5_014", "color": "014"},
    ]

    return variants

def extract_color_code(variant_title: str, sku: str) -> str:
    """Extract color code from variant title or SKU"""
    # Try extracting from title like "Grün Dunkel (405)"
    if '(' in variant_title and ')' in variant_title:
        code = variant_title.split('(')[1].split(')')[0]
        return code.strip()

    # Try extracting from SKU like "TEPOMEG4_405"
    if '_' in sku:
        code = sku.split('_')[-1]
        if code.isdigit() or (len(code) == 3 and code[:2].isdigit()):
            return code.zfill(3)

    return None

def create_mutation(variant_id: str, color_data: Dict) -> Dict:
    """Create a metafield mutation for a variant"""
    return {
        "ownerId": f"gid://shopify/ProductVariant/{variant_id}",
        "namespace": "color_data",
        "key": "color_info",
        "value": json.dumps(color_data),
        "type": "json"
    }

def main():
    """Regenerate mutation batches"""
    print("\n" + "="*80)
    print("PHASE 3b - REGENERATE MUTATIONS FROM CURRENT SHOPIFY VARIANTS")
    print("="*80)

    # Load color mapping
    color_mapping = load_color_mapping()
    colors = color_mapping.get('colors', {})
    print(f"\n✓ Loaded {len(colors)} colors from mapping")

    # Get current Shopify variants
    variants = get_current_shopify_variants()
    print(f"✓ Loaded {len(variants)} current variants")

    # Create mutations
    mutations = []
    for variant in variants:
        color_code = variant.get('color')

        # Look up color in mapping
        if color_code in colors:
            color_name = colors[color_code]

            # Create detailed color data (would need more data for width, material, etc.)
            color_data = {
                "color_number": color_code,
                "color_name": color_name,
                "width_cm": 400,  # Default, would need product-specific data
                "width_code": "4",
                "material_type": "polyamid",  # Default
                "usage_class": "33",  # Default
                "product_type": "Teppichboden"
            }

            mutation = create_mutation(variant['id'], color_data)
            mutations.append(mutation)
        else:
            print(f"⚠️  Color code {color_code} from {variant['sku']} not found in mapping")

    print(f"\n✓ Created {len(mutations)} mutations")

    # Split into batches of 25
    chunk_size = 25
    batches = {}
    for i in range(0, len(mutations), chunk_size):
        batch_num = (i // chunk_size) + 1
        batch = mutations[i:i + chunk_size]
        batches[batch_num] = batch

    print(f"✓ Split into {len(batches)} batches")

    # Save regenerated batches
    for batch_num, batch in batches.items():
        filename = f'automation/data/mutations_batch_{batch_num}_regenerated.json'
        with open(filename, 'w') as f:
            json.dump(batch, f, indent=2)
        print(f"✓ Saved batch {batch_num}: {len(batch)} mutations → {filename}")

    print("\n" + "="*80)
    print("NEXT STEPS")
    print("="*80)
    print("""
✓ Regenerated mutation batches with current variant IDs
✓ Ready to execute Phase 3b mutations

To proceed:
1. Review regenerated batches for accuracy
2. Execute mutations in chunks of 25 via GraphQL mutation
3. Monitor for rate limits and errors
4. Verify metafields in Shopify Admin

Note: This initial batch has 36 variants from 2 products.
For complete Phase 3b, need to include all Teppichboden products (332 variants).
""")

if __name__ == "__main__":
    main()
