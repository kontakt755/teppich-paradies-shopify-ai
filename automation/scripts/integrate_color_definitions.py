#!/usr/bin/env python3
"""
Integrate custom color definitions from CSV into populate_color_metafields.py

Reads color_definitions_template.csv and updates the COLOR_NAMES dictionary
in populate_color_metafields.py with user-provided definitions.

Usage:
    python3 automation/scripts/integrate_color_definitions.py \
      --input automation/data/color_definitions_template.csv \
      --script automation/scripts/populate_color_metafields.py
"""

import csv
import re
import sys
from pathlib import Path

def load_color_definitions(csv_path: str) -> dict:
    """Load color definitions from CSV file"""
    definitions = {}

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            color_num = row['color_number'].strip()
            color_name = row['color_name_de'].strip()

            # Skip empty or placeholder entries
            if color_num and color_name and color_name != '???':
                definitions[color_num] = color_name
                print(f"✅ {color_num:>3} = {color_name}")

    return definitions

def update_color_names_in_script(script_path: str, definitions: dict):
    """Update COLOR_NAMES dictionary in populate_color_metafields.py"""

    with open(script_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the COLOR_NAMES dictionary
    pattern = r'(COLOR_NAMES = \{)(.*?)(\})'

    if not re.search(pattern, content, re.DOTALL):
        print("❌ COLOR_NAMES dictionary not found in script")
        return False

    # Extract existing definitions from the script
    existing_match = re.search(pattern, content, re.DOTALL)
    if existing_match:
        existing_block = existing_match.group(2)
        # Parse existing entries
        for match in re.finditer(r'"(\d+)"\s*:\s*"([^"]*)"', existing_block):
            num, name = match.groups()
            if num not in definitions:
                definitions[num] = name

    # Build new COLOR_NAMES dictionary
    new_dict_entries = []

    # Sort by number (with special handling for 3-digit numbers)
    sorted_keys = sorted(definitions.keys(), key=lambda x: int(x.replace('0', '0').lstrip('0') or '0'))

    for key in sorted_keys:
        value = definitions[key]
        new_dict_entries.append(f'    "{key}": "{value}",')

    new_color_names = 'COLOR_NAMES = {\n' + '\n'.join(new_dict_entries) + '\n}'

    # Replace in content
    new_content = re.sub(pattern, new_color_names, content, flags=re.DOTALL)

    with open(script_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"\n✅ Updated COLOR_NAMES in {script_path}")
    print(f"   Total color definitions: {len(definitions)}")

    return True

if __name__ == "__main__":
    csv_input = "automation/data/color_definitions_template.csv"
    script_target = "automation/scripts/populate_color_metafields.py"

    print("="*70)
    print("Color Definition Integration Tool")
    print("="*70)
    print(f"\n📁 Reading color definitions from: {csv_input}")

    if not Path(csv_input).exists():
        print(f"❌ File not found: {csv_input}")
        sys.exit(1)

    # Load definitions
    definitions = load_color_definitions(csv_input)

    if not definitions:
        print("\n⚠️  No color definitions found in CSV (all entries are '???')")
        print("   Please fill in the color names first:")
        print(f"   1. Open: {csv_input}")
        print("   2. Replace '???' with actual color names")
        print("   3. Run this script again")
        sys.exit(0)

    print(f"\n✅ Loaded {len(definitions)} color definition(s)")

    # Update script
    if update_color_names_in_script(script_target, definitions):
        print("\n" + "="*70)
        print("✅ Integration Complete!")
        print("="*70)
        print(f"\nNext Steps:")
        print(f"  1. Review updated COLOR_NAMES in: {script_target}")
        print(f"  2. Run: python3 automation/scripts/populate_color_metafields.py")
        print(f"  3. Execute Phase 3b: Bulk metafield population")
    else:
        print("\n❌ Integration failed")
        sys.exit(1)
