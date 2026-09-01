#!/usr/bin/env python3
"""
Comprehensive Color Analysis - Extract REAL color names from Shopify data
Analyzes variant titles, descriptions, and patterns to determine accurate color names
"""

import re
from collections import defaultdict

# REAL data from Phase 1 Audit - Variant Titles
VARIANTS_WITH_TITLES = [
    # Alvento (32 variants)
    {"sku": "TEPMONTEG4_050", "title": "Farbe 50 / 400cm", "product": "Alvento"},
    {"sku": "TEPMONTEG5_050", "title": "Farbe 50 / 500cm", "product": "Alvento"},
    {"sku": "TEPMONTEG4_069", "title": "Farbe 69 / 400cm", "product": "Alvento"},
    {"sku": "TEPMONTEG5_069", "title": "Farbe 69 / 500cm", "product": "Alvento"},
    {"sku": "TEPMONTEG4_072", "title": "Farbe 72 / 400cm", "product": "Alvento"},

    # Amara (18 variants) - Diese haben FARBNAMEN!
    {"sku": "TEPRIVAO4_098", "title": "Grau Dunkel (98) / 400 cm", "product": "Amara"},
    {"sku": "TEPRIVAO5_098", "title": "Grau Dunkel (98) / 500 cm", "product": "Amara"},
    {"sku": "TEPRIVAO4_095", "title": "Grau Hell (95) / 400 cm", "product": "Amara"},
    {"sku": "TEPRIVAO5_095", "title": "Grau Hell (95) / 500 cm", "product": "Amara"},
    {"sku": "TEPRIVAO4_079", "title": "Blau Mittel (79) / 400 cm", "product": "Amara"},

    # Fortiva (13 variants) - Nur Nummern
    {"sku": "TEPM733L_016", "title": "Farbe 016", "product": "Fortiva"},
    {"sku": "TEPM733L_021", "title": "Farbe 021", "product": "Fortiva"},
    {"sku": "TEPM733L_024", "title": "Farbe 024", "product": "Fortiva"},

    # Kalvea (20 variants) - Nur Nummern
    {"sku": "TEPLORN04_99", "title": "Farbe 99 / 400 cm", "product": "Kalvea"},
    {"sku": "TEPLORN05_99", "title": "Farbe 99 / 500 cm", "product": "Kalvea"},
    {"sku": "TEPLORN04_98", "title": "Farbe 98 / 400 cm", "product": "Kalvea"},
    {"sku": "TEPLORN05_98", "title": "Farbe 98 / 500 cm", "product": "Kalvea"},
    {"sku": "TEPLORN04_94", "title": "Farbe 94 / 400 cm", "product": "Kalvea"},

    # Kontura (19 variants) - FARBNAMEN inklusive!
    {"sku": "TEPOMEG4_405", "title": "Grün Dunkel (405)", "product": "Kontura"},
    {"sku": "TEPOMEG4_406", "title": "Grün Dunkel (406)", "product": "Kontura"},
    {"sku": "TEPOMEG4_403", "title": "Grün Mittel (403)", "product": "Kontura"},
    {"sku": "TEPOMEG4_304", "title": "Blau Mittel (304)", "product": "Kontura"},
    {"sku": "TEPOMEG4_307", "title": "Blau Dunkel (307)", "product": "Kontura"},

    # Nuvara (30 variants) - Nur Nummern
    {"sku": "TEPNOBEL4_012", "title": "Farbe 12 / 400cm", "product": "Nuvara"},
    {"sku": "TEPNOBEL5_012", "title": "Farbe 12 / 500cm", "product": "Nuvara"},
    {"sku": "TEPNOBEL4_015", "title": "Farbe 15 / 400cm", "product": "Nuvara"},
    {"sku": "TEPNOBEL5_015", "title": "Farbe 15 / 500cm", "product": "Nuvara"},
    {"sku": "TEPNOBEL4_040", "title": "Farbe 40 / 400cm", "product": "Nuvara"},

    # Piumera (28 variants) - Nur Nummern
    {"sku": "TEPDOLCE4_004", "title": "Farbe 04 / 400cm", "product": "Piumera"},
    {"sku": "TEPDOLCE4_027", "title": "Farbe 27 / 400cm", "product": "Piumera"},
    {"sku": "TEPDOLCE4_030", "title": "Farbe 30 / 400cm", "product": "Piumera"},

    # Practiva (18 variants) - Nur Nummern
    {"sku": "TEPLIMBO4_090", "title": "Farbe 90 / 400 cm", "product": "Practiva"},
    {"sku": "TEPLIMBO4_082", "title": "Farbe 82 / 400 cm", "product": "Practiva"},
    {"sku": "TEPLIMBO4_078", "title": "Farbe 78 / 400 cm", "product": "Practiva"},

    # Quadra (10 variants) - Nur Nummern
    {"sku": "TEPSTR966_024", "title": "Farbe 024", "product": "Quadra"},
    {"sku": "TEPSTR966_039", "title": "Farbe 039", "product": "Quadra"},
    {"sku": "TEPSTR966_050", "title": "Farbe 050", "product": "Quadra"},

    # Sentira (30 variants) - Nur Nummern
    {"sku": "TEPFEELIN4_003", "title": "Farbe 03 / 400cm", "product": "Sentira"},
    {"sku": "TEPFEELIN4_009", "title": "Farbe 09 / 400cm", "product": "Sentira"},
    {"sku": "TEPFEELIN4_018", "title": "Farbe 18 / 400cm", "product": "Sentira"},

    # Serena (20 variants) - Nur Nummern
    {"sku": "TEPDAMOS4_083", "title": "Farbe 83 / 400 cm", "product": "Serena"},
    {"sku": "TEPDAMOS4_079", "title": "Farbe 79 / 400 cm", "product": "Serena"},
    {"sku": "TEPDAMOS4_077", "title": "Farbe 77 / 400 cm", "product": "Serena"},

    # Velluna (24 variants) - Nur Nummern
    {"sku": "TEPASTR4_832", "title": "Farbe 832 / 400 cm", "product": "Velluna"},
    {"sku": "TEPASTR4_462", "title": "Farbe 462 / 400 cm", "product": "Velluna"},
    {"sku": "TEPASTR4_332", "title": "Farbe 332 / 400 cm", "product": "Velluna"},

    # Velory (24 variants) - Nur Nummern
    {"sku": "TEPSUMATR4_020", "title": "Farbe 20 / 400cm", "product": "Velory"},
    {"sku": "TEPSUMATR4_040", "title": "Farbe 40 / 400cm", "product": "Velory"},
    {"sku": "TEPSUMATR4_050", "title": "Farbe 50 / 400cm", "product": "Velory"},

    # Vireno (28 variants) - Nur Nummern
    {"sku": "TEPALAMO4_003", "title": "Farbe 03 / 400cm", "product": "Vireno"},
    {"sku": "TEPALAMO4_005", "title": "Farbe 05 / 400cm", "product": "Vireno"},
    {"sku": "TEPALAMO4_024", "title": "Farbe 24 / 400cm", "product": "Vireno"},

    # Zafira (18 variants) - Nur Nummern, aber Jordanshop-Nummer!
    {"sku": "TEPZIRKON4_250", "title": "Farbe 250 / 400cm", "product": "Zafira"},
    {"sku": "TEPZIRKON5_250", "title": "Farbe 250 / 500cm", "product": "Zafira"},
    {"sku": "TEPZIRKON4_260", "title": "Farbe 260 / 400cm", "product": "Zafira"},
    {"sku": "TEPZIRKON5_260", "title": "Farbe 260 / 500cm", "product": "Zafira"},
    {"sku": "TEPZIRKON4_400", "title": "Farbe 400 / 400cm", "product": "Zafira"},
]

# PRODUCT DESCRIPTIONS - Hinweise auf Farben
PRODUCT_DESCRIPTIONS = {
    "Alvento": "samtig-weicher Teppichboden mit dichtem, gleichmäßigem Flor im edlen Samt-Design",
    "Amara": "pflegeleichter Schlingen-Teppichboden mit kurzer, dichter Oberfläche",
    "Fortiva": "robuster Nadelvlies-Teppichboden mit hoher Nutzungsklasse",
    "Kalvea": "robuster Schlingen-Teppichboden mit kurzer, dichter Oberfläche aus Polyamid",
    "Kontura": "besonders strapazierfähiger Teppichboden mit kurzem, dichtem Flor aus 100% Polyamid",
    "Nuvara": "samtig-weicher Teppichboden mit dichtem, gleichmäßigem Flor im edlen Samt-Design",
    "Piumera": "besonders plüschiger, hochfloriger Teppichboden mit extra dichtem Samt-Flor",
    "Practiva": "robuster Schlingen-Teppichboden mit kurzer, dichter Oberfläche aus Polypropylen",
    "Quadra": "strapazierfähige Nadelvlies-Teppichfliese",
    "Sentira": "hochwertiger, samtig-weicher Teppichboden mit dichtem, gleichmäßigem Flor",
    "Serena": "weicher, dicht gewebter Teppichboden mit angenehm hohem Flor",
    "Velluna": "weicher Teppichboden mit samtig glänzender Oberfläche",
    "Velory": "samtig-weicher Teppichboden mit dichtem, gleichmäßigem Flor",
    "Vireno": "samtig-weicher Teppichboden mit dichtem, gleichmäßigem Flor",
    "Zafira": "samtig-weicher Teppichboden mit dichtem, gleichmäßigem Flor",
}

def extract_color_from_title(title):
    """Extract color name from variant title if present"""
    # Pattern: "Farbe NAME (NUMBER)" or "NAME (NUMBER)"
    match = re.search(r'(\w+(?:\s+\w+)*?)\s*\((\d{2,3})\)', title)
    if match:
        color_name = match.group(1).strip()
        color_number = match.group(2)
        return color_number, color_name

    # Pattern: "Farbe NUMBER / ..."
    match = re.search(r'Farbe\s+(\d{2,3})', title)
    if match:
        return match.group(1), None

    return None, None

def analyze_colors():
    """Analyze all colors and extract names where available"""

    color_by_number = defaultdict(list)
    extracted_names = {}

    print("\n" + "="*80)
    print("COLOR ANALYSIS - Extracting REAL Color Names from Shopify Data")
    print("="*80)

    # Extract colors from titles
    print("\n📊 VARIANT TITLE ANALYSIS:")
    print("-"*80)

    for variant in VARIANTS_WITH_TITLES:
        color_number, color_name = extract_color_from_title(variant["title"])

        if color_number:
            color_by_number[color_number].append({
                "product": variant["product"],
                "title": variant["title"],
                "name": color_name
            })

            if color_name and color_number not in extracted_names:
                extracted_names[color_number] = color_name
                print(f"✅ Found: {color_number} = {color_name} (from {variant['product']})")
            elif not color_name:
                if color_number not in extracted_names:
                    print(f"❌ Unknown: {color_number} (from {variant['product']} / {variant['title']})")

    # Summary
    print("\n" + "="*80)
    print("SUMMARY:")
    print("="*80)
    print(f"Total unique color numbers found: {len(color_by_number)}")
    print(f"Color numbers WITH explicit names: {len(extracted_names)}")
    print(f"Color numbers WITHOUT names: {len(color_by_number) - len(extracted_names)}")

    # List extracted names
    print("\n✅ EXTRACTED COLOR NAMES (From Shopify):")
    print("-"*80)
    for color_num in sorted(extracted_names.keys()):
        print(f"{color_num:>3} = {extracted_names[color_num]}")

    # List unknown colors
    print("\n❌ COLORS NEEDING DEFINITION:")
    print("-"*80)
    unknown_colors = set(color_by_number.keys()) - set(extracted_names.keys())

    for color_num in sorted(unknown_colors):
        variants = color_by_number[color_num]
        products = ", ".join(set([v["product"] for v in variants]))
        print(f"{color_num:>3} ← Used in: {products}")

    # Generate Python dictionary
    print("\n" + "="*80)
    print("GENERATED COLOR DICTIONARY (Ready for Script):")
    print("="*80)
    print("\nCOLOR_NAMES = {")

    # First add extracted names
    for color_num in sorted(extracted_names.keys()):
        print(f'    "{color_num}": "{extracted_names[color_num]}",')

    # Then add placeholders for unknown
    print("\n    # UNKNOWN COLORS - Need manual definition:")
    for color_num in sorted(unknown_colors):
        print(f'    "{color_num}": "???",  # TODO: Determine from images/catalog')

    print("}")

    # Export JSON for reference
    import json
    export_data = {
        "extracted_colors": extracted_names,
        "unknown_colors": sorted(list(unknown_colors)),
        "total_variants": len(VARIANTS_WITH_TITLES),
        "coverage_percent": round(len(extracted_names) / len(color_by_number) * 100, 1)
    }

    with open("automation/data/color_analysis_report.json", "w") as f:
        json.dump(export_data, f, indent=2)

    print(f"\n📄 Detailed report exported to: automation/data/color_analysis_report.json")
    print("="*80 + "\n")

    return extracted_names, unknown_colors

if __name__ == "__main__":
    extracted, unknown = analyze_colors()
