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
COLOR_NAMES = {
    # Alvento colors
    "50": "Beige Hell",
    "69": "Taupe",
    "72": "Braun",

    # Amara colors
    "95": "Grau Hell",
    "98": "Grau Dunkel",
    "79": "Blau Mittel",

    # Fortiva colors
    "016": "Anthrazit",
    "021": "Schiefer",
    "024": "Graphit",
    "044": "Dunkelbraun",
    "054": "Hellbeige",

    # Kalvea colors
    "94": "Grau",
    "98": "Dunkelgrau",
    "99": "Hellgrau",

    # Kontura colors
    "304": "Blau Mittel",
    "307": "Blau Dunkel",
    "403": "Grün Mittel",
    "405": "Grün Dunkel",
    "406": "Grün Hell",

    # Nuvara colors
    "12": "Creme",
    "15": "Beige",
    "40": "Grau",

    # Piumera colors
    "004": "Weiß",
    "027": "Braun Mittel",
    "030": "Braun Dunkel",

    # Practiva colors
    "78": "Grau Hell",
    "82": "Grau Mittel",
    "90": "Braun",

    # Quadra colors
    "024": "Graphit",
    "039": "Beige",
    "050": "Hellbeige",
    "070": "Anthrazit",
    "072": "Schiefer",

    # Sentira colors
    "003": "Creme",
    "009": "Beige",
    "018": "Taupe",

    # Serena colors
    "77": "Beige Hell",
    "79": "Beige Mittel",
    "83": "Beige Dunkel",

    # Velluna colors
    "332": "Beige Hell",
    "462": "Braun Mittel",
    "832": "Grau Dunkel",

    # Velory colors
    "20": "Creme",
    "40": "Beige",
    "50": "Taupe",

    # Vireno colors
    "003": "Creme",
    "005": "Beige",
    "024": "Taupe",

    # Zafira colors
    "250": "Warm Beige",
    "260": "Taupe Natur",
    "400": "Graphit Grau",
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
