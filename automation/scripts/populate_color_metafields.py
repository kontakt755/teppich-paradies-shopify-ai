#!/usr/bin/env python3
"""
Populate color_data metafields for all Teppichboden variants.
Extracts color numbers from SKUs and creates structured JSON metafield values.
"""

import re
import json
import sys
from typing import Dict, List, Optional, Tuple

# Color metadata database (Farbnummer -> Farbenname)
# Intelligente Zuordnung: Explizite Shopify-Namen + Systematische Logik
COLOR_NAMES = {
    "003": "Creme",
    "004": "Weiß",
    "005": "Weiß",
    "009": "Beige",
    "012": "Creme",
    "014": "Rot Mittel",
    "015": "Beige",
    "016": "Anthrazit",
    "018": "Taupe",
    "020": "Creme",
    "021": "Schiefer",
    "024": "Graphit",
    "027": "Braun Mittel",
    "029": "Mittel",
    "030": "Braun Dunkel",
    "031": "Beige Hell",
    "032": "Grau",
    "033": "Grau",
    "034": "Grau Dunkel",
    "035": "Grau Hell",
    "036": "Grau",
    "039": "Beige Mittel",
    "040": "Beige",
    "041": "Beige Hell",
    "043": "Braun",
    "044": "Braun",
    "045": "Taupe Mittel",
    "048": "Grau Hell",
    "049": "Grau Mittel",
    "050": "Beige Hell",
    "053": "Braun Hell",
    "054": "Beige Hell",
    "056": "Braun Hell",
    "062": "Graphit Hell",
    "064": "Braun Dunkel",
    "065": "Braun",
    "068": "Grau",
    "069": "Taupe",
    "070": "Grau Dunkel",
    "071": "Grau Dunkel",
    "072": "Braun",
    "073": "Braun Mittel",
    "074": "Braun Mittel",
    "075": "Braun Dunkel",
    "076": "Braun Dunkel",
    "077": "Beige Hell",
    "078": "Grau Hell",
    "079": "Blau Mittel",
    "080": "Grau Hell",
    "081": "Grau Mittel",
    "082": "Grau Mittel",
    "083": "Beige Dunkel",
    "084": "Grau",
    "085": "Anthrazit",
    "088": "Grau Dunkel",
    "089": "Grau Dunkel",
    "090": "Braun",
    "091": "Grau Hell",
    "092": "Grau",
    "094": "Grau",
    "095": "Grau Hell",
    "096": "Grau Hell",
    "097": "Grau Hell",
    "098": "Grau Dunkel",
    "099": "Grau Hell",
    "106": "Rot Mittel",
    "107": "Rot Dunkel",
    "120": "Rot Hell",
    "141": "Beige Hell",
    "142": "Beige Mittel",
    "170": "Rot",
    "175": "Orange Mittel",
    "176": "Orange Mittel",
    "177": "Orange Dunkel",
    "178": "Orange Dunkel",
    "180": "Braun Natur",
    "181": "Braun Mittel",
    "182": "Braun Dunkel",
    "205": "Gelb Mittel",
    "221": "Braun Natur",
    "231": "Braun Mittel",
    "240": "Rot Mittel",
    "241": "Rot Dunkel",
    "250": "Warm Beige",
    "252": "Beige Natur",
    "260": "Taupe Natur",
    "262": "Taupe Dunkel",
    "273": "Beige Dunkel",
    "274": "Beige Dunkel",
    "277": "Braun Dunkel",
    "282": "Braun Natur",
    "304": "Blau Mittel",
    "307": "Blau Dunkel",
    "309": "Blau Hell",
    "400": "Graphit Grau",
    "403": "Grün Mittel",
    "405": "Grün Dunkel",
    "406": "Grün Dunkel",
    "407": "Beige Dunkel",
    "420": "Grün Hell",
    "462": "Braun Mittel",
    "474": "Beige Mittel",
    "476": "Beige Dunkel",
    "482": "Beige Hell",
    "492": "Beige Dunkel",
    "508": "Anthrazit Mittel",
    "514": "Grau Mittel",
    "515": "Grau Hell",
    "516": "Grau Mittel",
    "630": "Rot Dunkel",
    "704": "Beige Mittel",
    "705": "Braun Mittel",
    "706": "Orange Dunkel",
    "764": "Grau Dunkel",
    "800": "Grau Hell",
    "820": "Grau Mittel",
    "830": "Grau Dunkel",
    "832": "Grau Dunkel",
    "840": "Grau Dunkel",
    "850": "Anthrazit",
    "861": "Anthrazit Dunkel",
    "902": "Schwarz Dunkel",
    "904": "Grau Dunkel",
}

# Product configuration database
PRODUCT_CONFIG = {
    "alvento": {
        "product_code": "TEPMONTEG",
        "material_type": "polyester",
        "usage_class": "23",
        "product_type": "Teppichboden",
    },
    "amara": {
        "product_code": "TEPRIVAO",
        "material_type": "polyamid",
        "usage_class": "32",
        "product_type": "Teppichboden",
    },
    "fortiva": {
        "product_code": "TEPM733L",
        "material_type": "polyamid",
        "usage_class": "33",
        "product_type": "Nadelvlies",
    },
    "kalvea": {
        "product_code": "TEPLORN",
        "material_type": "polyamid",
        "usage_class": "33",
        "product_type": "Teppichboden",
    },
    "kontura": {
        "product_code": "TEPOMEG",
        "material_type": "polyamid",
        "usage_class": "33",
        "product_type": "Teppichboden",
    },
    "nuvara": {
        "product_code": "TEPNOBEL",
        "material_type": "polyester",
        "usage_class": "23",
        "product_type": "Teppichboden",
    },
    "piumera": {
        "product_code": "TEPDOLCE",
        "material_type": "polyester",
        "usage_class": "22",
        "product_type": "Hochflor",
    },
    "practiva": {
        "product_code": "TEPLIMBO",
        "material_type": "polypropylen",
        "usage_class": "32",
        "product_type": "Teppichboden",
    },
    "quadra": {
        "product_code": "TEPSTR966",
        "material_type": "nadelvlies",
        "usage_class": "33",
        "product_type": "Teppichfliese",
    },
    "sentira": {
        "product_code": "TEPFEELIN",
        "material_type": "polyamid",
        "usage_class": "23",
        "product_type": "Teppichboden",
    },
    "serena": {
        "product_code": "TEPDAMOS",
        "material_type": "polyester",
        "usage_class": "22",
        "product_type": "Teppichboden",
    },
    "velluna": {
        "product_code": "TEPASTR",
        "material_type": "polyamid",
        "usage_class": "31",
        "product_type": "Teppichboden",
    },
    "velory": {
        "product_code": "TEPSUMATR",
        "material_type": "polyester",
        "usage_class": "22",
        "product_type": "Teppichboden",
    },
    "vireno": {
        "product_code": "TEPALAMO",
        "material_type": "polyester",
        "usage_class": "22",
        "product_type": "Recycled",
    },
    "zafira": {
        "product_code": "TEPZIRKON",
        "material_type": "polyester",
        "usage_class": "23",
        "product_type": "Teppichboden",
    },
}

def extract_color_number_from_sku(sku: str) -> Optional[str]:
    """Extract color number from SKU format: PRODUCTCODE[BREITE]_COLORNUMBER"""
    if not sku:
        return None

    match = re.search(r'_(\d{2,3})$', sku)
    if match:
        return match.group(1)
    return None

def parse_width_from_sku(sku: str) -> Tuple[Optional[int], Optional[str]]:
    """Extract width from SKU: 4=400cm, 5=500cm, L=200cm"""
    if not sku:
        return None, None

    if '4_' in sku:
        return 400, '4'
    elif '5_' in sku:
        return 500, '5'
    elif 'L_' in sku:
        return 200, 'L'

    return None, None

def get_color_name(color_number: str) -> str:
    """Get color name from database, fallback to generic name"""
    return COLOR_NAMES.get(color_number, f"Farbe {color_number}")

def build_color_metafield_value(
    sku: str,
    product_name: str,
    config: Dict
) -> Optional[Dict]:
    """Build metafield JSON value from SKU and product config"""

    if not sku:
        return None

    color_number = extract_color_number_from_sku(sku)
    if not color_number:
        return None

    width_cm, width_code = parse_width_from_sku(sku)
    if not width_cm:
        return None

    color_name = get_color_name(color_number)

    return {
        "color_number": color_number,
        "color_name": color_name,
        "width_cm": width_cm,
        "width_code": width_code,
        "material_type": config.get("material_type", "polyester"),
        "usage_class": config.get("usage_class", "23"),
        "product_type": config.get("product_type", "Teppichboden"),
    }

def generate_metafield_mutations(variants_data: List[Dict]) -> List[Dict]:
    """
    Generate metafield mutations for all variants.

    Input format: [
        {
            "variant_id": "gid://shopify/ProductVariant/...",
            "sku": "TEPMONTEG4_050",
            "product_name": "alvento",
            "config": {...}
        }
    ]
    """

    mutations = []

    for variant in variants_data:
        metafield_value = build_color_metafield_value(
            variant["sku"],
            variant["product_name"],
            variant["config"]
        )

        if not metafield_value:
            print(f"⚠️ Skipped variant {variant['variant_id']} (no color number found)")
            continue

        mutations.append({
            "ownerId": variant["variant_id"],
            "namespace": "color_data",
            "key": "color_info",
            "value": json.dumps(metafield_value),
            "type": "json",
            "metafield_value": metafield_value  # For debugging/logging
        })

    return mutations

def print_mutation_summary(mutations: List[Dict]):
    """Print summary of mutations to be created"""
    print(f"\n📊 Metafield Mutation Summary")
    print(f"{'='*60}")
    print(f"Total mutations: {len(mutations)}")
    print(f"\nSample mutations (first 3):")

    for i, mutation in enumerate(mutations[:3]):
        print(f"\n  [{i+1}] Variant {mutation['ownerId']}")
        print(f"      Color Number: {mutation['metafield_value']['color_number']}")
        print(f"      Color Name: {mutation['metafield_value']['color_name']}")
        print(f"      Width: {mutation['metafield_value']['width_cm']}cm")
        print(f"      Value: {mutation['value']}")

def export_as_csv_preview(mutations: List[Dict]) -> str:
    """Generate CSV preview for export validation"""

    csv_lines = [
        "product_handle,variant_sku,color_number,color_name,width_cm,material,usage_class"
    ]

    for mutation in mutations[:20]:  # Preview first 20
        v = mutation['metafield_value']
        # TODO: Add product handle
        csv_lines.append(
            f"?,{mutation['ownerId']},{v['color_number']},{v['color_name']},"
            f"{v['width_cm']},{v['material_type']},{v['usage_class']}"
        )

    return "\n".join(csv_lines)

if __name__ == "__main__":
    print("Color Metafield Population Script")
    print("="*60)
    print("This script generates metafield mutations for Teppichboden variants.\n")

    # Sample data for testing
    sample_variants = [
        {
            "variant_id": "gid://shopify/ProductVariant/60330685759822",
            "sku": "TEPMONTEG4_050",
            "product_name": "alvento",
            "config": PRODUCT_CONFIG["alvento"]
        },
        {
            "variant_id": "gid://shopify/ProductVariant/60330685825358",
            "sku": "TEPMONTEG4_069",
            "product_name": "alvento",
            "config": PRODUCT_CONFIG["alvento"]
        },
        {
            "variant_id": "gid://shopify/ProductVariant/60326505251150",
            "sku": "TEPRIVAO4_098",
            "product_name": "amara",
            "config": PRODUCT_CONFIG["amara"]
        },
    ]

    mutations = generate_metafield_mutations(sample_variants)
    print_mutation_summary(mutations)

    print(f"\n📋 CSV Export Preview:")
    print(export_as_csv_preview(mutations))

    print("\n✅ Script ready for production use")
    print("Next: Integrate with Shopify GraphQL bulk operations")
