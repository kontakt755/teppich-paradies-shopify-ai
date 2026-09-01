#!/usr/bin/env python3
"""
Interactive color verification tool - Check Shopify titles + images
Systematically verify each unknown color number against Shopify variant data
Don't trust titles blindly - compare title + image + actual product

Usage:
    python3 automation/scripts/verify_colors_with_images.py
"""

import json
from collections import defaultdict

# Real data from Phase 1 Audit - with TITLES visible
VARIANTS_WITH_DATA = [
    # Alvento (Farbe: 50, 69, 72)
    {"sku": "TEPMONTEG4_050", "title": "Farbe 50 / 400cm", "product": "Alvento", "color_num": "50"},
    {"sku": "TEPMONTEG5_050", "title": "Farbe 50 / 500cm", "product": "Alvento", "color_num": "50"},
    {"sku": "TEPMONTEG4_069", "title": "Farbe 69 / 400cm", "product": "Alvento", "color_num": "69"},
    {"sku": "TEPMONTEG5_069", "title": "Farbe 69 / 500cm", "product": "Alvento", "color_num": "69"},
    {"sku": "TEPMONTEG4_072", "title": "Farbe 72 / 400cm", "product": "Alvento", "color_num": "72"},

    # Amara (Farbe: 95=Hell, 98=Dunkel, 79=Mittel) - SCHON MIT NAMEN!
    {"sku": "TEPRIVAO4_098", "title": "Grau Dunkel (98) / 400 cm", "product": "Amara", "color_num": "98"},
    {"sku": "TEPRIVAO5_098", "title": "Grau Dunkel (98) / 500 cm", "product": "Amara", "color_num": "98"},
    {"sku": "TEPRIVAO4_095", "title": "Grau Hell (95) / 400 cm", "product": "Amara", "color_num": "95"},
    {"sku": "TEPRIVAO5_095", "title": "Grau Hell (95) / 500 cm", "product": "Amara", "color_num": "95"},
    {"sku": "TEPRIVAO4_079", "title": "Blau Mittel (79) / 400 cm", "product": "Amara", "color_num": "79"},

    # Fortiva (016, 021, 024)
    {"sku": "TEPM733L_016", "title": "Farbe 016", "product": "Fortiva", "color_num": "016"},
    {"sku": "TEPM733L_021", "title": "Farbe 021", "product": "Fortiva", "color_num": "021"},
    {"sku": "TEPM733L_024", "title": "Farbe 024", "product": "Fortiva", "color_num": "024"},

    # Kalvea (94, 98, 99)
    {"sku": "TEPLORN04_099", "title": "Farbe 99 / 400 cm", "product": "Kalvea", "color_num": "99"},
    {"sku": "TEPLORN05_099", "title": "Farbe 99 / 500 cm", "product": "Kalvea", "color_num": "99"},
    {"sku": "TEPLORN04_098", "title": "Farbe 98 / 400 cm", "product": "Kalvea", "color_num": "98"},
    {"sku": "TEPLORN04_094", "title": "Farbe 94 / 400 cm", "product": "Kalvea", "color_num": "94"},

    # Kontura (304=Blau Mittel, 307=Dunkel, 403=Mittel, 405=Dunkel, 406=Hell) - MIT NAMEN!
    {"sku": "TEPOMEG4_405", "title": "Grün Dunkel (405)", "product": "Kontura", "color_num": "405"},
    {"sku": "TEPOMEG4_406", "title": "Grün Dunkel (406)", "product": "Kontura", "color_num": "406"},
    {"sku": "TEPOMEG4_403", "title": "Grün Mittel (403)", "product": "Kontura", "color_num": "403"},
    {"sku": "TEPOMEG4_304", "title": "Blau Mittel (304)", "product": "Kontura", "color_num": "304"},
    {"sku": "TEPOMEG4_307", "title": "Blau Dunkel (307)", "product": "Kontura", "color_num": "307"},

    # Nuvara (12, 15, 40)
    {"sku": "TEPNOBEL4_012", "title": "Farbe 12 / 400cm", "product": "Nuvara", "color_num": "12"},
    {"sku": "TEPNOBEL5_012", "title": "Farbe 12 / 500cm", "product": "Nuvara", "color_num": "12"},
    {"sku": "TEPNOBEL4_015", "title": "Farbe 15 / 400cm", "product": "Nuvara", "color_num": "15"},
    {"sku": "TEPNOBEL4_040", "title": "Farbe 40 / 400cm", "product": "Nuvara", "color_num": "40"},

    # Piumera (04, 27, 30)
    {"sku": "TEPDOLCE4_004", "title": "Farbe 04 / 400cm", "product": "Piumera", "color_num": "04"},
    {"sku": "TEPDOLCE4_027", "title": "Farbe 27 / 400cm", "product": "Piumera", "color_num": "27"},
    {"sku": "TEPDOLCE4_030", "title": "Farbe 30 / 400cm", "product": "Piumera", "color_num": "30"},

    # Practiva (78, 82, 90)
    {"sku": "TEPLIMBO4_090", "title": "Farbe 90 / 400 cm", "product": "Practiva", "color_num": "90"},
    {"sku": "TEPLIMBO4_082", "title": "Farbe 82 / 400 cm", "product": "Practiva", "color_num": "82"},
    {"sku": "TEPLIMBO4_078", "title": "Farbe 78 / 400 cm", "product": "Practiva", "color_num": "78"},

    # Quadra (024, 039, 050)
    {"sku": "TEPSTR966_024", "title": "Farbe 024", "product": "Quadra", "color_num": "024"},
    {"sku": "TEPSTR966_039", "title": "Farbe 039", "product": "Quadra", "color_num": "039"},
    {"sku": "TEPSTR966_050", "title": "Farbe 050", "product": "Quadra", "color_num": "050"},

    # Sentira (03, 09, 18)
    {"sku": "TEPFEELIN4_003", "title": "Farbe 03 / 400cm", "product": "Sentira", "color_num": "03"},
    {"sku": "TEPFEELIN4_009", "title": "Farbe 09 / 400cm", "product": "Sentira", "color_num": "09"},
    {"sku": "TEPFEELIN4_018", "title": "Farbe 18 / 400cm", "product": "Sentira", "color_num": "18"},

    # Serena (77, 83)
    {"sku": "TEPDAMOS4_083", "title": "Farbe 83 / 400 cm", "product": "Serena", "color_num": "83"},
    {"sku": "TEPDAMOS4_077", "title": "Farbe 77 / 400 cm", "product": "Serena", "color_num": "77"},

    # Velluna (332, 462, 832)
    {"sku": "TEPASTR4_832", "title": "Farbe 832 / 400 cm", "product": "Velluna", "color_num": "832"},
    {"sku": "TEPASTR4_462", "title": "Farbe 462 / 400 cm", "product": "Velluna", "color_num": "462"},
    {"sku": "TEPASTR4_332", "title": "Farbe 332 / 400 cm", "product": "Velluna", "color_num": "332"},

    # Velory (20, 40, 50)
    {"sku": "TEPSUMATR4_020", "title": "Farbe 20 / 400cm", "product": "Velory", "color_num": "20"},
    {"sku": "TEPSUMATR4_040", "title": "Farbe 40 / 400cm", "product": "Velory", "color_num": "40"},
    {"sku": "TEPSUMATR4_050", "title": "Farbe 50 / 400cm", "product": "Velory", "color_num": "50"},

    # Vireno (03, 05, 24)
    {"sku": "TEPALAMO4_003", "title": "Farbe 03 / 400cm", "product": "Vireno", "color_num": "03"},
    {"sku": "TEPALAMO4_005", "title": "Farbe 05 / 400cm", "product": "Vireno", "color_num": "05"},
    {"sku": "TEPALAMO4_024", "title": "Farbe 24 / 400cm", "product": "Vireno", "color_num": "24"},

    # Zafira (250, 260, 400)
    {"sku": "TEPZIRKON4_250", "title": "Farbe 250 / 400cm", "product": "Zafira", "color_num": "250"},
    {"sku": "TEPZIRKON5_250", "title": "Farbe 250 / 500cm", "product": "Zafira", "color_num": "250"},
    {"sku": "TEPZIRKON4_260", "title": "Farbe 260 / 400cm", "product": "Zafira", "color_num": "260"},
    {"sku": "TEPZIRKON5_260", "title": "Farbe 260 / 500cm", "product": "Zafira", "color_num": "260"},
    {"sku": "TEPZIRKON4_400", "title": "Farbe 400 / 400cm", "product": "Zafira", "color_num": "400"},
]

def generate_verification_checklist():
    """Generate systematic checklist for color verification"""

    color_by_number = defaultdict(list)

    # Group by color number
    for variant in VARIANTS_WITH_DATA:
        color_num = variant["color_num"]
        color_by_number[color_num].append({
            "product": variant["product"],
            "sku": variant["sku"],
            "title": variant["title"]
        })

    print("\n" + "="*80)
    print("FARBVERIFIKATION — Systematischer Check von Titel + Bild")
    print("="*80)
    print("\n📋 Anleitung:")
    print("1. Gehe zu: Shopify Admin → Produkte → [Produkt] → Varianten")
    print("2. Suche nach der SKU in der Varianten-Tabelle")
    print("3. Schaue das BILD an (nicht nur Titel!)")
    print("4. Vergleiche: Titel + Bild — stimmen sie zusammen?")
    print("5. Notiere die tatsächliche Farbe (nicht blind vertrauen)")
    print("\n" + "-"*80 + "\n")

    verification_list = []

    for color_num in sorted(color_by_number.keys(), key=lambda x: int(x.replace('0', '0').lstrip('0') or '0')):
        variants = color_by_number[color_num]

        print(f"\n🔍 FARBE {color_num}")
        print("-" * 80)

        # Group by product
        by_product = defaultdict(list)
        for v in variants:
            by_product[v["product"]].append(v)

        for product in sorted(by_product.keys()):
            product_variants = by_product[product]
            print(f"\n   Produkt: {product}")

            for v in product_variants:
                print(f"   • SKU: {v['sku']}")
                print(f"   • Titel in Shopify: '{v['title']}'")
                print(f"   ")
                print(f"   📸 AKTION: Öffne Shopify Admin:")
                print(f"      1. Produkte → {product}")
                print(f"      2. Finde Variante mit SKU {v['sku']}")
                print(f"      3. Schaue das BILD an")
                print(f"      4. Lese Titel/Beschreibung nochmal")
                print(f"      5. Was ist die ECHTE Farbe?")
                print()

        verification_list.append({
            "color_number": color_num,
            "products": list(by_product.keys()),
            "variants_count": len(variants)
        })

        print(f"   ➜ Deine Antwort: (z.B. 'Grau', 'Beige Hell', 'Braun Dunkel')")
        print("   ➜ Quelle: (Shopify Admin / Katalog / Andere)")
        print()

    # Save checklist
    with open("automation/data/color_verification_checklist.json", "w") as f:
        json.dump(verification_list, f, indent=2)

    print("\n" + "="*80)
    print("✅ Checkliste für all 33 Farben generiert")
    print("="*80)
    print("\n📌 Wichtig:")
    print("   ✓ Traue nicht blind den Titeln (manchmal fehlerhaft)")
    print("   ✓ Schaue IMMER die Bilder in Shopify an")
    print("   ✓ Vergleiche Titel + Bild + Großhandels-Katalog")
    print("   ✓ Notiere nur die Farbe die du wirklich siehst")
    print("\n📝 Wenn fertig:")
    print("   1. Trage deine Ergebnisse in color_definitions_template.csv ein")
    print("   2. Speichern und mir mitteilen")
    print("   3. Automatische Integration läuft dann")
    print("\n" + "="*80 + "\n")

if __name__ == "__main__":
    generate_verification_checklist()
