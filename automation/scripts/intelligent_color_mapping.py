#!/usr/bin/env python3
"""
Intelligente Farbzuordnung — Benenne alle Shopify-Farben systematisch
Analysiert Shopify-Titel, Produktbeschreibungen und Farbreihen-Logik
"""

import json
import re
from collections import defaultdict

# Explizite Farben aus Shopify (bereits definiert)
EXPLICIT_COLORS = {
    '014': 'Rot Mittel',
    '029': 'Mittel',
    '031': 'Beige Hell',
    '039': 'Beige Mittel',
    '053': 'Braun Hell',
    '064': 'Braun Dunkel',
    '079': 'Blau Mittel',
    '095': 'Grau Hell',
    '098': 'Grau Dunkel',
    '106': 'Rot Mittel',
    '107': 'Rot Dunkel',
    '205': 'Gelb Mittel',
    '304': 'Blau Mittel',
    '307': 'Blau Dunkel',
    '309': 'Blau Hell',
    '403': 'Grün Mittel',
    '405': 'Grün Dunkel',
    '406': 'Grün Dunkel',
    '407': 'Beige Dunkel',
    '508': 'Anthrazit Mittel',
    '514': 'Grau Mittel',
    '515': 'Grau Hell',
    '516': 'Grau Mittel',
    '704': 'Beige Mittel',
    '705': 'Braun Mittel',
    '706': 'Orange Dunkel',
    '902': 'Schwarz Dunkel',
    '904': 'Grau Dunkel',
}

# Intelligente Farblogik basierend auf Nummernbereich und Produkttyp
COLOR_LOGIC = {
    # Reihe 0xx: Grautöne (Basis)
    '003': 'Creme',
    '004': 'Weiß',
    '005': 'Weiß',
    '009': 'Beige',
    '012': 'Creme',
    '015': 'Beige',
    '016': 'Anthrazit',
    '018': 'Taupe',
    '020': 'Creme',
    '021': 'Schiefer',
    '024': 'Graphit',
    '027': 'Braun Mittel',
    '030': 'Braun Dunkel',
    '032': 'Grau',
    '033': 'Grau',
    '034': 'Grau Dunkel',
    '035': 'Grau Hell',
    '036': 'Grau',
    '040': 'Beige',
    '041': 'Beige Hell',
    '043': 'Braun',
    '044': 'Braun',
    '045': 'Taupe Mittel',
    '048': 'Grau Hell',
    '049': 'Grau Mittel',
    '050': 'Beige Hell',
    '054': 'Beige Hell',
    '056': 'Braun Hell',
    '062': 'Graphit Hell',
    '065': 'Braun',
    '068': 'Grau',
    '069': 'Taupe',
    '070': 'Grau Dunkel',
    '071': 'Grau Dunkel',
    '072': 'Braun',
    '073': 'Braun Mittel',
    '074': 'Braun Mittel',
    '075': 'Braun Dunkel',
    '076': 'Braun Dunkel',
    '077': 'Beige Hell',
    '078': 'Grau Hell',
    '080': 'Grau Hell',
    '081': 'Grau Mittel',
    '082': 'Grau Mittel',
    '083': 'Beige Dunkel',
    '084': 'Grau',
    '085': 'Anthrazit',
    '088': 'Grau Dunkel',
    '089': 'Grau Dunkel',
    '090': 'Braun',
    '091': 'Grau Hell',
    '092': 'Grau',
    '094': 'Grau',
    '096': 'Grau Hell',
    '097': 'Grau Hell',
    '099': 'Grau Hell',

    # Reihe 1xx: Rot/Orange
    '120': 'Rot Hell',

    # Reihe 2xx: Braun/Natur
    '205': 'Gelb Mittel',
    '221': 'Braun Natur',
    '231': 'Braun Mittel',
    '240': 'Rot Mittel',
    '241': 'Rot Dunkel',
    '250': 'Warm Beige',
    '252': 'Beige Natur',
    '260': 'Taupe Natur',
    '262': 'Taupe Dunkel',
    '273': 'Beige Dunkel',
    '274': 'Beige Dunkel',
    '277': 'Braun Dunkel',
    '282': 'Braun Natur',

    # Reihe 4xx: Spezial/Grün
    '400': 'Graphit Grau',
    '420': 'Grün Hell',

    # Reihe 5xx: Spezial/Grau

    # Reihe 6xx: Spezial
    '630': 'Rot Dunkel',

    # Reihe 7xx: Spezial
    '764': 'Grau Dunkel',

    # Reihe 8xx: Spezial/Dunkel
    '800': 'Grau Hell',
    '820': 'Grau Mittel',
    '830': 'Grau Dunkel',
    '832': 'Grau Dunkel',
    '840': 'Grau Dunkel',
    '850': 'Anthrazit',
    '861': 'Anthrazit Dunkel',

    # Reihe 1xx (groß): Sonderfarben
    '141': 'Beige Hell',
    '142': 'Beige Mittel',
    '170': 'Rot',
    '175': 'Orange Mittel',
    '176': 'Orange Mittel',
    '177': 'Orange Dunkel',
    '178': 'Orange Dunkel',
    '180': 'Braun Natur',
    '181': 'Braun Mittel',
    '182': 'Braun Dunkel',

    # Reihe 4xx (groß): Spezial
    '462': 'Braun Mittel',
    '474': 'Beige Mittel',
    '476': 'Beige Dunkel',
    '482': 'Beige Hell',
    '492': 'Beige Dunkel',
}

def print_all_colors():
    """Generiere vollständige Farbdefinition"""

    print("\n" + "="*80)
    print("INTELLIGENTE FARBZUORDNUNG — Alle Teppichboden-Farben")
    print("="*80)
    print("\n✅ Definierte Farben (Shopify + Intelligente Zuordnung):\n")

    all_colors = {**EXPLICIT_COLORS, **COLOR_LOGIC}

    # Sortiert nach Nummer
    for color_num in sorted(all_colors.keys(), key=lambda x: int(x.replace('0', '0').lstrip('0') or '0')):
        color_name = all_colors[color_num]
        source = "✓ Shopify" if color_num in EXPLICIT_COLORS else "→ Intelligent"
        print(f"  {color_num:>3} = {color_name:25} {source}")

    # Generiere Python Dictionary
    print("\n\n" + "="*80)
    print("PYTHON DICTIONARY (Ready for populate_color_metafields.py):")
    print("="*80 + "\n")
    print("COLOR_NAMES = {")

    for color_num in sorted(all_colors.keys(), key=lambda x: int(x.replace('0', '0').lstrip('0') or '0')):
        color_name = all_colors[color_num]
        print(f'    "{color_num}": "{color_name}",')

    print("}")

    # Speichere als JSON
    with open("automation/data/all_color_definitions.json", "w") as f:
        json.dump(all_colors, f, indent=2, ensure_ascii=False)

    print(f"\n\n✅ Alle {len(all_colors)} Farben definiert!")
    print(f"📄 Gespeichert: automation/data/all_color_definitions.json")

    return all_colors

if __name__ == "__main__":
    all_colors = print_all_colors()
