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
# Complete mapping with 124 unique normalized colors for all 332 variants
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
    "021": "Gray/Beige 21",
    "024": "Gray/Beige 24",
    "027": "Gray/Beige 27",
    "029": "Grün Mittel",
    "030": "Gray/Beige 30",
    "031": "Beige Hell",
    "032": "Gray/Beige 32",
    "033": "Gray/Beige 33",
    "034": "Gray/Beige 34",
    "035": "Gray/Beige 35",
    "036": "Gray/Beige 36",
    "039": "Beige Mittel",
    "040": "Gray/Beige 40",
    "041": "Beige 41",
    "043": "Beige 43",
    "044": "Beige 44",
    "045": "Beige 45",
    "048": "Beige 48",
    "049": "Beige 49",
    "050": "Beige 50",
    "053": "Braun Hell",
    "054": "Tone 54",
    "056": "Braun Hell",
    "062": "Graphit Hell",
    "064": "Braun Dunkel",
    "065": "Braun",
    "068": "Tone 68",
    "069": "Tone 69",
    "070": "Gray/Brown 70",
    "071": "Gray/Brown 71",
    "072": "Braun",
    "073": "Gray/Brown 73",
    "074": "Gray/Brown 74",
    "075": "Braun Dunkel",
    "076": "Braun Dunkel",
    "077": "Gray/Brown 77",
    "078": "Gray/Brown 78",
    "079": "Blau Mittel",
    "080": "Gray/Brown 80",
    "081": "Gray/Brown 81",
    "082": "Gray/Brown 82",
    "083": "Gray/Brown 83",
    "084": "Gray/Brown 84",
    "085": "Gray/Brown 85",
    "088": "Gray/Brown 88",
    "089": "Gray/Brown 89",
    "090": "Braun",
    "091": "Tone 91",
    "092": "Tone 92",
    "094": "Tone 94",
    "095": "Grau Hell",
    "096": "Tone 96",
    "097": "Tone 97",
    "098": "Grau Dunkel",
    "099": "Tone 99",
    "106": "Rot Mittel",
    "107": "Rot Dunkel",
    "120": "Rot Hell",
    "141": "Beige Hell",
    "142": "Beige Hell",
    "170": "Red/Orange 170",
    "175": "Red/Orange 175",
    "176": "Red/Orange 176",
    "177": "Red/Orange 177",
    "178": "Red/Orange 178",
    "180": "Braun Natur",
    "181": "Braun Natur",
    "182": "Braun Natur",
    "205": "Gelb Mittel",
    "221": "Brown/Taupe 221",
    "231": "Brown/Taupe 231",
    "240": "Brown/Taupe 240",
    "241": "Brown/Taupe 241",
    "250": "Brown/Taupe 250",
    "252": "Brown/Taupe 252",
    "260": "Brown/Taupe 260",
    "262": "Brown/Taupe 262",
    "273": "Brown/Taupe 273",
    "274": "Brown/Taupe 274",
    "277": "Brown/Taupe 277",
    "282": "Brown/Taupe 282",
    "304": "Blau Mittel",
    "307": "Blau Dunkel",
    "309": "Blau Hell",
    "332": "Special 332",
    "400": "Grün/Special 400",
    "403": "Grün Mittel",
    "405": "Grün Dunkel",
    "406": "Grün Dunkel",
    "407": "Beige Dunkel",
    "420": "Special 420",
    "462": "Special 462",
    "474": "Special 474",
    "476": "Special 476",
    "482": "Special 482",
    "492": "Special 492",
    "508": "Anthrazit Mittel",
    "514": "Grau Mittel",
    "515": "Grau Hell",
    "516": "Grau Mittel",
    "630": "Special 630",
    "704": "Beige Mittel",
    "705": "Braun Mittel",
    "706": "Orange Dunkel",
    "764": "Special 764",
    "800": "Special 800",
    "820": "Special 820",
    "830": "Special 830",
    "832": "Special 832",
    "840": "Special 840",
    "850": "Special 850",
    "861": "Special 861",
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
