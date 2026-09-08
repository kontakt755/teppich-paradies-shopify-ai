#!/usr/bin/env python3
"""Baut aus jordan-zubehoer.json den Import-Plan (JSON + Markdown).

Regeln (domains/shopify/zubehoer-struktur.md):
- eigener neutraler Produkttitel, Lieferantenlinie nur in grosshandel.sku
- Hersteller (JOKA, UZIN, ...) nur als Metafeld custom.marke fuer den Marken-Filter
- Preis = empf. Brutto-VK des Lieferanten; bei Preis je Kg mal Gebindegroesse
- custom.arten = genau ein Metaobjekt der Unterkategorie
"""
import json, re, math, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "jordan-zubehoer.json")

ARTEN = {
    "uebergangsprofile": ("gid://shopify/Metaobject/1724386279758", "Übergangsprofile"),
    "abschlussprofile": ("gid://shopify/Metaobject/1724386509134", "Abschlussprofile"),
    "kleber": ("gid://shopify/Metaobject/1724386640206", "Kleber & Fixierung"),
    "bauchemie": ("gid://shopify/Metaobject/1805084295502", "Bauchemie"),
    "unterlagen": ("gid://shopify/Metaobject/1805084328270", "Verlege- u. Dämmunterlagen"),
    "reinigung": ("gid://shopify/Metaobject/1805084361038", "Reinigungsmittel"),
    "verlegeband": ("gid://shopify/Metaobject/1805084393806", "Verlegeband"),
    "sauberlauf": ("gid://shopify/Metaobject/1805084426574", "Sauberlauf"),
}

TITEL = {
    "531452": "Übergangsprofil Aluminium selbstklebend 28 mm",
    "531397": "Übergangsprofil Aluminium gebohrt 28 mm",
    "507698": "Übergangsprofil Aluminium schraubbar 7–15 mm",
    "507990": "Anpassungsprofil Aluminium schraubbar 7–15 mm",
    "595812": "Übergangsprofil Aluminium schraubbar 5–9 mm",
    "474871": "Abschlussprofil Aluminium selbstklebend 34 mm",
    "468005": "Abschlussprofil Aluminium gebohrt 47 mm",
    "507816": "Abschlussprofil Aluminium schraubbar 7–15 mm",
    "531660": "Winkelprofil Aluminium selbstklebend 18 × 24,5 mm",
    "517295": "Treppenkantenprofil Aluminium gebohrt 40 × 37 mm",
    "492442": "Universalklebstoff für Teppich, PVC und CV",
    "400": "Designbelagsklebstoff für Vinyl und LVT",
    "468616": "Linoleumklebstoff",
    "361881": "Textilbelagsklebstoff",
    "474697": "Nass- und Haftklebstoff für elastische Beläge",
    "473388": "Haftfixierung für Designböden",
    "461722": "Dispersionsfixierung wasserablösbar",
    "493253": "Dispersionsgrundierung für Spachtelmassen",
    "364849": "Spachtelmasse zementär, selbstverlaufend",
    "540180": "Blitzspachtel zementär, schnell",
    "526344": "Silikon-Dichtstoff dauerelastisch 310 ml",
    "398": "Acryl-Dichtstoff überstreichbar 310 ml",
    "464864": "Teppichunterlage elastisch, Rollenware",
    "4388425": "Antirutsch-Unterlage für Teppiche, Rollenware",
    "415920": "Komfortunterlage für Teppichboden",
    "1896048": "Unterlage für Designböden 1,5 mm mit Antirutsch-Oberfläche",
    "548499": "Trittschalldämmung XPS für Laminat und Parkett",
    "507527": "Dampfbremse PE-Folie 0,2 mm",
    "632868": "Abdeckvlies saugstark mit Antirutsch-Rücken",
    "637765": "PU-Reiniger für Designböden",
    "467346": "Fußbodenreiniger für die tägliche Reinigung",
    "497239": "Teppichreiniger Konzentrat",
    "467482": "Laminat-Reiniger",
    "467389": "PU-Reiniger für Hartböden",
    "637719": "Designbodenpflege matt",
    "635797": "Sockelklebeband doppelseitig",
    "468076": "Trockenkleber-Band für Sockelleisten",
    "492896": "Verlegeband für Textil- und elastische Beläge",
    "396694": "Universal-Verlegeband 70 mm",
    "370143": "Trockenklebstoff für Bahnenware, Rolle 75 cm",
    "3915101": "Sauberlaufmatte 55 × 90 cm",
    "3471097": "Sauberlaufmatte 90 × 155 cm",
    "3471085": "Sauberlaufmatte 135 × 205 cm",
}

MARKEN = ["Dr. Schutz", "JOKA", "UZIN", "Uzin", "SwitchTec", "Switchtec", "AKO", "Ako", "CORAL", "Mapei", "Schönox", "Pallmann", "RZ "]


def marke(supplier_title):
    for m in MARKEN:
        if m.lower() in (supplier_title or "").lower():
            return {"uzin": "UZIN", "switchtec": "SwitchTec", "ako": "AKO", "coral": "Forbo Coral", "rz ": "RZ"}.get(m.lower(), m)
    return ""


CORAL_FARBEN = {"racing green": "Dunkelgrün", "olive green": "Olivgrün", "whisper grey": "Hellgrau",
    "hurricane grey": "Sturmgrau", "vintage red": "Weinrot", "sandy beige": "Sandbeige", "black": "Schwarz",
    "anthracite": "Anthrazit", "dark brown": "Dunkelbraun", "charcoal": "Kohlegrau", "navy": "Marineblau",
    "moss green": "Moosgrün", "asphalt grey": "Asphaltgrau", "charcoal grey": "Anthrazit", "fossil grey": "Steingrau", "glacier blue": "Gletscherblau", "granite brown": "Granitbraun", "stratos blue": "Stahlblau", "vulcan black": "Schwarz", "stone grey": "Steingrau", "ash grey": "Aschgrau", "cocoa": "Kakaobraun"}


def parse_label(label, cat):
    """Variantenlabel -> Optionen. Gibt dict Optionname->Wert."""
    s = re.sub(r"\s+", " ", label or "").strip()
    opts = {}
    m = re.match(r"^Fb\.\s*(\d{4})\s+(.+)$", s)
    if m:
        name = m.group(2).strip().lower()
        opts["Farbe"] = CORAL_FARBEN.get(name, name.title() + " (übersetzen)")
        return opts, s
    m = re.search(r"(\d+[.,]?\d*)\s*(kg|l|ltr\.?|liter|ml)\b", s, re.I)
    if m and re.search(r"geb\.|pack|sack|kan\.|eimer|flasche|kanister|liter|^\d", s, re.I):
        unit = m.group(2).lower()
        unit = {"ltr": "l", "ltr.": "l", "liter": "l"}.get(unit, unit)
        opts["Gebinde"] = f"{m.group(1).replace('.', ',')} {unit}"
        return opts, s
    m = re.search(r"(\d+)\s*cm\b", s)
    if m and cat not in ("unterlagen",) and not re.search(r"\bbr\.|breit|stark|m2|m²|rolle", s, re.I):
        opts["Länge"] = f"{m.group(1)} cm"
        farbe = re.sub(r"\b\d{5,6}\b", "", s[: m.start()]).strip(" ,")
        farbe = re.sub(r"\s+", " ", farbe)
        if farbe:
            opts["Farbe"] = farbe
        return opts, s
    a = re.sub(r"\b\d{6,10}\b", "", s).strip(" ,-")
    if a:
        opts["Ausführung"] = re.sub(r"\s+", " ", a)
    return opts, s


def pack_qty(label):
    m = re.search(r"(\d+[.,]?\d*)\s*(kg|l|ltr|liter)\b", label or "", re.I)
    return float(m.group(1).replace(",", ".")) if m else None


def build():
    data = json.load(open(SRC))
    plan = []
    for pid, p in data.items():
        cat = p["kategorie"]
        gid, cat_label = ARTEN[cat]
        unit = (p.get("unit") or "").strip()
        variants = []
        warn = []
        seen_sku = set()
        for v in p["variants"]:
            if v.get("sku") in seen_sku:
                continue
            seen_sku.add(v.get("sku"))
            opts, raw = parse_label(v.get("variant_label"), cat)
            uvp = v.get("uvp_brutto")
            price = None
            if uvp is not None:
                if unit in ("/ Kg", "/ kg", "/ l", "/ L") or (unit == "" and "Kg" in raw):
                    q = pack_qty(raw)
                    if q:
                        price = round(uvp * q, 2)
                    else:
                        warn.append(f"{v.get('sku')}: Preis je {unit or 'Kg'} aber Gebindemenge unklar ({raw})")
                elif unit in ("/ St", "/ Stk", "/ Stück", ""):
                    price = round(uvp, 2)
                elif unit in ("/ m²", "/ m2", "/ qm"):
                    m2 = re.search(r"(\d+[.,]?\d*)\s*(m2|m²|qm)", raw, re.I)
                    if m2:
                        price = round(uvp * float(m2.group(1).replace(",", ".")), 2)
                    else:
                        warn.append(f"{v.get('sku')}: Preis je m², Rollengroesse unklar ({raw}) - UVP je m² eingetragen")
                        price = round(uvp, 2)
                elif unit in ("/ m", "/ lfm"):
                    warn.append(f"{v.get('sku')}: Rollenware, Preis je laufendem Meter ({raw}) - Verkauf je Meter klaeren")
                    price = round(uvp, 2)
                else:
                    warn.append(f"{v.get('sku')}: Preiseinheit '{unit}' nicht umgerechnet ({raw})")
                    price = round(uvp, 2)
            else:
                warn.append(f"{v.get('sku')}: kein UVP vom Lieferanten")
            variants.append({
                "sku": v.get("sku"), "ean": v.get("ean"), "label": raw, "options": opts,
                "uvp_supplier": uvp, "price": price, "image": (v.get("images") or [None])[0],
                "supplier_pid": v.get("pid"), "ve": v.get("attrs", {}).get("Verkaufseinheit"),
            })
        option_names = []
        for v in variants:
            for k in v["options"]:
                if k not in option_names:
                    option_names.append(k)
        # Doppelte Optionskombinationen -> Warnung
        seen = set()
        for v in variants:
            key = tuple(v["options"].get(k, "") for k in option_names)
            if key in seen:
                warn.append(f"{v['sku']}: doppelte Optionskombination {key}")
            seen.add(key)
        prices = [v["price"] for v in variants if v["price"] is not None]
        plan.append({
            "supplier_pid": pid, "title": TITEL.get(pid, p["arbeitsname"]),
            "handle": re.sub(r"[^a-z0-9]+", "-", TITEL.get(pid, p["arbeitsname"]).lower()
                             .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")).strip("-"),
            "kategorie": cat, "arten_gid": gid, "arten_label": cat_label,
            "marke": marke(p.get("supplier_title")), "supplier_title": p.get("supplier_title"),
            "grosshandel_sku": (variants[0]["sku"] or "").split("_")[0] if variants else "",
            "unit_supplier": unit, "option_names": option_names, "variants": variants,
            "images": p.get("images", []), "supplier_description": p.get("description", ""),
            "price_min": min(prices) if prices else None, "price_max": max(prices) if prices else None,
            "warnings": warn,
        })
    json.dump(plan, open(os.path.join(HERE, "import-plan.json"), "w"), ensure_ascii=False, indent=1)
    lines = ["# Zubehör – Import-Plan (Jordan)", "",
             f"{len(plan)} Produkte, {sum(len(p['variants']) for p in plan)} Varianten. Preise = empf. Brutto-VK des Lieferanten (bei kg-Preisen × Gebinde).", ""]
    for cat, (gid, label) in ARTEN.items():
        ps = [p for p in plan if p["kategorie"] == cat]
        if not ps:
            continue
        lines.append(f"## {label} ({len(ps)})")
        lines.append("| Neuer Titel | Marke | Varianten | Optionen | Preis € | Lieferantenlinie | Hinweise |")
        lines.append("|---|---|---:|---|---|---|---|")
        for p in ps:
            pr = "–" if p["price_min"] is None else (f"{p['price_min']:.2f}" if p["price_min"] == p["price_max"] else f"{p['price_min']:.2f} – {p['price_max']:.2f}")
            lines.append(f"| {p['title']} | {p['marke']} | {len(p['variants'])} | {', '.join(p['option_names'])} | {pr} | {p['grosshandel_sku']} | {'; '.join(p['warnings'])[:160]} |")
        lines.append("")
    open(os.path.join(HERE, "import-plan.md"), "w").write("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    build()
