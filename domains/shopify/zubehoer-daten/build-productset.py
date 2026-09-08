#!/usr/bin/env python3
"""Erzeugt aus import-plan.json die ProductSetInput-Objekte (productset-inputs.json).

Beschreibungen werden hier selbst formuliert (pd-card-Format wie bei Bodenleisten),
nicht vom Lieferanten kopiert. Technische Daten kommen nur aus den Lieferanten-
attributen (Gewicht, Laenge, Verbrauch), nichts wird aus Bildern abgeleitet.
"""
import json, os, re, html
HERE = os.path.dirname(os.path.abspath(__file__))
plan = json.load(open(os.path.join(HERE, "import-plan.json")))
raw = json.load(open(os.path.join(HERE, "jordan-zubehoer.json")))

INTRO = {
    "531452": "Selbstklebendes Übergangsprofil aus eloxiertem Aluminium für den sauberen Übergang zwischen zwei gleich hohen Bodenbelägen. Schutzfolie abziehen, andrücken, fertig.",
    "531397": "Übergangsprofil aus eloxiertem Aluminium, mittig vorgebohrt für die feste Verschraubung. Für Übergänge zwischen gleich hohen Bodenbelägen.",
    "507698": "Schraubbares Übergangsprofil für Beläge von 7 bis 15 mm Stärke. Unterschiene und Deckprofil gleichen Höhenunterschiede aus und verdecken die Fuge.",
    "507990": "Schraubbares Anpassungsprofil für Höhenunterschiede zwischen Belägen von 7 bis 15 mm Stärke. Gleicht die Stufe sauber und trittsicher aus.",
    "595812": "Schlankes Übergangsprofil für dünne Beläge von 5 bis 9 mm Stärke, zum Verschrauben. Ideal für Designböden und dünne Teppichböden.",
    "474871": "Selbstklebendes Abschlussprofil aus eloxiertem Aluminium. Schließt Belagskanten an Türen, Fliesen oder Bodenabschlüssen sauber ab.",
    "468005": "Breites Abschlussprofil aus eloxiertem Aluminium, vorgebohrt zum Verschrauben. Für stark beanspruchte Belagskanten.",
    "507816": "Schraubbares Abschlussprofil für Beläge von 7 bis 15 mm Stärke. Deckt die Belagskante ab und schützt sie vor Ausfransen und Abnutzung.",
    "531660": "Selbstklebendes Winkelprofil aus eloxiertem Aluminium für Belagsabschlüsse an Stufen, Podesten und Türschwellen.",
    "517295": "Treppenkantenprofil aus eloxiertem Aluminium, vorgebohrt. Schützt Stufenkanten und sorgt für einen sicheren Tritt.",
    "492442": "Universalklebstoff für Teppichboden, PVC- und CV-Beläge auf saugfähigen Untergründen. Lösemittelfrei und gebrauchsfertig.",
    "400": "Klebstoff für Designbeläge und LVT-Planken mit hoher Scherfestigkeit. Für dauerhafte, dimensionsstabile Verklebung auf Spachtelmassen.",
    "468616": "Klebstoff für Linoleum-Bahnenware und Linoleumfliesen. Lange Einlegezeit, kräftiger Anfangshaftung, lösemittelfrei.",
    "361881": "Klebstoff für Textilbeläge mit Textil-, Schaum- oder Vliesrücken. Gebrauchsfertig und gut verstreichbar.",
    "474697": "Nass- und Haftklebstoff mit sehr hoher Klebkraft für elastische Beläge wie PVC, CV, Kautschuk und Dämmunterlagen. Auch für stark belastete Bereiche.",
    "473388": "Haftfixierung für Designböden und Vinylplanken. Beläge lassen sich später rückstandsarm wieder aufnehmen – ideal für Mietwohnungen.",
    "461722": "Wasserablösbare Fixierung für Teppichboden und CV-Beläge. Der Belag liegt fest, lässt sich aber später ohne Untergrundschaden entfernen.",
    "493253": "Dispersionsgrundierung als Haftbrücke vor Spachtelmassen auf saugfähigen und nicht saugfähigen Untergründen. Verbessert die Haftung und bindet Staub.",
    "364849": "Selbstverlaufende zementäre Spachtelmasse zum Ausgleichen von Estrichen vor der Belagsverlegung. Ergibt eine glatte, feste Verlegefläche.",
    "540180": "Schnell erhärtender zementärer Blitzspachtel für kleine Reparaturen, Löcher und Unebenheiten. Nach kurzer Zeit belegreif.",
    "526344": "Dauerelastischer Silikon-Dichtstoff in vielen Farben für Anschlussfugen an Sockelleisten, Türen und Wandanschlüssen.",
    "398": "Überstreichbarer Acryl-Dichtstoff für Fugen zwischen Sockelleiste und Wand sowie Risse im Innenbereich.",
    "464864": "Elastische Teppichunterlage von der Rolle für lose verlegte Teppiche auf glatten Böden. Verhindert Verrutschen und erhöht den Gehkomfort.",
    "4388425": "Dünne Antirutsch-Unterlage von der Rolle für Teppiche und Läufer auf glatten Böden. Zuschneidbar mit der Schere.",
    "415920": "Komfortunterlage für Teppichboden, die den Trittschall dämpft und den Gehkomfort spürbar erhöht.",
    "1896048": "Dünne Verlegeunterlage für Designböden mit Antirutsch-Oberfläche und selbstklebender Überlappung. Gleicht kleine Unebenheiten aus.",
    "548499": "XPS-Trittschalldämmung als Faltplatte für Laminat, Parkett und Klick-Vinyl. Schnell verlegt, druckstabil und feuchtebeständig.",
    "507527": "PE-Folie als Dampfbremse unter Laminat, Parkett und Klick-Böden auf mineralischen Untergründen.",
    "632868": "Saugstarkes Abdeckvlies mit rutschhemmender Folienrückseite zum Schutz von Böden bei Renovierung und Umzug.",
    "637765": "Reiniger für PU-beschichtete Designböden und Vinyl. Für die regelmäßige, schonende Unterhaltsreinigung.",
    "467346": "Neutraler Fußbodenreiniger für die tägliche Reinigung von elastischen Böden, Laminat und versiegeltem Parkett.",
    "497239": "Teppichreiniger-Konzentrat für die Sprühextraktion und die Reinigung von Teppichböden und Läufern.",
    "467482": "Reiniger speziell für Laminat: entfernt Schmutz streifenfrei und hinterlässt keine Rückstände.",
    "467389": "Reiniger für PU-beschichtete Hartböden wie Vinyl, Linoleum und Kautschuk. Für die tägliche Unterhaltsreinigung.",
    "637719": "Pflegemittel für Designböden mit matter Oberfläche. Frischt die Optik auf und schützt vor Abnutzung.",
    "635797": "Doppelseitiges Klebeband zum Befestigen von Sockelleisten ohne Schrauben oder Kleber aus der Kartusche.",
    "468076": "Trockenkleber-Band zum Fixieren von Sockelleisten und Belagsrändern. Sofort belastbar, sauber in der Verarbeitung.",
    "492896": "Doppelseitiges Verlegeband für Textilbeläge und elastische Beläge. Hält Nähte und Ränder sicher am Boden.",
    "396694": "Universelles Verlegeband für Ränder, Nähte und Treppen. Für die Fixierung ohne flüssigen Klebstoff.",
    "370143": "Trockenklebstoff auf Rolle für die vollflächige Verlegung von Bahnenware ohne flüssigen Klebstoff. Rückstandsarm wieder aufnehmbar.",
    "3915101": "Strapazierfähige Sauberlaufmatte mit Bürstenstruktur für den Eingangsbereich. Nimmt Schmutz und Feuchtigkeit auf und schützt den Boden dahinter.",
    "3471097": "Strapazierfähige Sauberlaufmatte mit Bürstenstruktur für stark genutzte Eingänge. Nimmt Schmutz und Feuchtigkeit zuverlässig auf.",
    "3471085": "Große Sauberlaufmatte mit Bürstenstruktur für Eingangsbereiche in Wohnhaus und Objekt. Hält Schmutz und Nässe vom Boden fern.",
}

BADGES = {
    "uebergangsprofile": ["Aluminium eloxiert", "Mehrere Farben", "Einfache Montage"],
    "abschlussprofile": ["Aluminium eloxiert", "Mehrere Farben", "Schützt Belagskanten"],
    "kleber": ["Gebrauchsfertig", "Für Profis und Heimwerker", "Passend zu unseren Belägen"],
    "bauchemie": ["Für Innenräume", "Bewährte Verarbeitung", "Passend zu unseren Belägen"],
    "unterlagen": ["Zuschneidbar", "Mehr Gehkomfort", "Passend zu unseren Belägen"],
    "reinigung": ["Schonende Reinigung", "Für die regelmäßige Pflege", "Ergiebig"],
    "verlegeband": ["Ohne flüssigen Klebstoff", "Sofort belastbar", "Saubere Verarbeitung"],
    "sauberlauf": ["Bürstenstruktur", "12 Farben", "Für Eingangsbereiche"],
}
EIGNUNG = {
    "uebergangsprofile": "Übergänge zwischen Teppich, Vinyl, Laminat und Fliesen",
    "abschlussprofile": "Belagsabschlüsse an Türen, Stufen und Fliesen",
    "kleber": "Wohn- und Objektbereiche, innen",
    "bauchemie": "Untergrundvorbereitung und Fugen, innen",
    "unterlagen": "Unter lose oder verklebt verlegten Bodenbelägen",
    "reinigung": "Unterhaltsreinigung und Pflege",
    "verlegeband": "Ränder, Nähte, Sockelleisten",
    "sauberlauf": "Eingangsbereiche in Wohnung, Haus und Objekt",
}
SEO_DESC = {
    "uebergangsprofile": "{t} bei TeppichParadies: passend zu Teppich, Vinyl und Laminat, in mehreren Farben und Längen. Schneller Versand, persönliche Beratung.",
    "abschlussprofile": "{t} bei TeppichParadies: sauberer Abschluss für Belagskanten, in mehreren Farben und Längen. Schneller Versand, persönliche Beratung.",
    "kleber": "{t} bei TeppichParadies kaufen: der passende Kleber zu unseren Bodenbelägen, gebrauchsfertig im Gebinde. Fachberatung inklusive.",
    "bauchemie": "{t} bei TeppichParadies: Untergrund richtig vorbereiten, damit der neue Boden lange hält. Gebinde für Wohnung und Objekt.",
    "unterlagen": "{t} bei TeppichParadies: mehr Gehkomfort und Trittschallschutz unter Teppich, Vinyl und Laminat.",
    "reinigung": "{t} bei TeppichParadies: passende Reinigung und Pflege für Ihren Boden, damit er lange schön bleibt.",
    "verlegeband": "{t} bei TeppichParadies: Bodenbeläge und Sockelleisten fixieren ohne flüssigen Klebstoff.",
    "sauberlauf": "{t} bei TeppichParadies: robuste Schmutzfangmatte in 12 Farben für den Eingangsbereich. Schneller Versand.",
}


def esc(s):
    return html.escape(str(s or ""), quote=False)


def specs_for(p):
    r = raw[p["supplier_pid"]]
    v0 = r["variants"][0]
    a = v0.get("attrs", {})
    rows = [("Eignung", EIGNUNG[p["kategorie"]])]
    if p["marke"]:
        rows.append(("Hersteller", p["marke"]))
    if p["option_names"]:
        rows.append(("Varianten", f"{len(p['variants'])} ({', '.join(p['option_names'])})"))
    verbrauch = a.get("Ca.-Verbrauch")
    if verbrauch and verbrauch not in ("0", ""):
        rows.append(("Verbrauch ca.", verbrauch))
    laenge = a.get("Länge (mm)")
    if laenge and laenge not in ("0", "0,00") and p["kategorie"] in ("uebergangsprofile", "abschlussprofile"):
        rows.append(("Längen", ", ".join(sorted({v["options"].get("Länge", "") for v in p["variants"] if v["options"].get("Länge")}, key=lambda x: int(x.split()[0])))))
    if p["kategorie"] in ("kleber", "bauchemie", "reinigung"):
        rows.append(("Gebinde", ", ".join(v["options"].get("Gebinde") or v["options"].get("Ausführung", "") for v in p["variants"])))
    return rows


def description(p):
    badges = "".join(f'<span class="pd-badge">{esc(b)}</span>' for b in BADGES[p["kategorie"]])
    specs = "".join(f"<tr>\n<th>{esc(k)}</th>\n<td>{esc(v)}</td>\n</tr>\n" for k, v in specs_for(p))
    return (f'<div class="pd-card">\n<h3>{esc(p["title"])}</h3>\n<p>{esc(INTRO[p["supplier_pid"]])}</p>\n'
            f'<div class="pd-badges">\n{badges}\n</div>\n<table class="pd-specs">\n{specs}</table>\n</div>')


import base64
def variant_image(pid, fallback):
    """Bild, dessen Originalpfad zur Varianten-ID gehoert; sonst Fallback."""
    r = raw.get(pid) or {}
    for v in r.get("variants", []):
        if v.get("pid") != pid: continue
        for u in v.get("images", []):
            seg = u.split("/")[-1].split(".webp")[0].split("?")[0]
            try: orig = base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4)).decode("utf-8", "ignore")
            except Exception: orig = ""
            if f"/products/{pid}/" in orig: return u
    return fallback

FARBE_FIX = [(" dkl", " dunkel"), ("edelstahlf.", "edelstahlfarben"), ("edelstahlfarbig", "edelstahlfarben"), ("bronce", "bronze"),
             ("silberfarbig", "silber"), ("goldfarbig", "gold"), ("bronzefarb. hell", "bronze hell"), ("bronzef. dunkel", "bronze dunkel"),
             ("bronzefarb. dunkel", "bronze dunkel"), ("alu ", ""), ("aluminium ", "")]
def fix_farbe(name):
    n = " " + name.lower().strip() + " "
    for a, b in FARBE_FIX: n = n.replace(a, b)
    n = re.sub(r"\s+", " ", n).strip(" .,-")
    return n[:1].upper() + n[1:]

def orig_url(u):
    """Signierte intellishop-URL -> Original beim Lieferanten (die signierte URL liefert 403, sobald man sie veraendert)."""
    seg = u.split("/")[-1].split(".webp")[0].split("?")[0]
    try:
        o = base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4)).decode("utf-8", "ignore")
        return o if o.startswith("http") else u
    except Exception:
        return u

def build():
    inputs = []
    for p in plan:
        cat = p["kategorie"]
        title = p["title"]
        files, seen = [], set()
        for u in [orig_url(x) for x in p["images"]]:
            if u and u not in seen:
                seen.add(u); files.append({"originalSource": u, "alt": title, "contentType": "IMAGE"})
        variants, combos = [], set()
        for i, v in enumerate(p["variants"]):
            if v["price"] is None:
                continue
            if "Farbe" in v["options"]:
                v["options"]["Farbe"] = fix_farbe(v["options"]["Farbe"])
            combo = tuple(v["options"].get(k, "") for k in p["option_names"])
            if combo in combos or "" in combo:
                continue
            combos.add(combo)
            vi = {
                "optionValues": [{"optionName": k, "name": v["options"][k]} for k in p["option_names"]],
                "price": f"{v['price']:.2f}", "sku": v["sku"], "taxable": True,
                "inventoryPolicy": "CONTINUE", "inventoryItem": {"tracked": False, "requiresShipping": True},
            }
            if v.get("ean") and re.fullmatch(r"\d{8,14}", v["ean"]):
                vi["barcode"] = v["ean"]
            v["image"] = variant_image(v.get("supplier_pid"), v.get("image"))
            if v.get("image"): v["image"] = orig_url(v["image"])
            if v.get("image"):
                if v["image"] not in seen:
                    seen.add(v["image"]); files.append({"originalSource": v["image"], "alt": f"{title} – {' / '.join(combo)}", "contentType": "IMAGE"})
                vi["file"] = {"originalSource": v["image"], "alt": f"{title} – {' / '.join(combo)}", "contentType": "IMAGE"}
            variants.append(vi)
        if not variants:
            print("!! keine Varianten", title); continue
        options = []
        for k in p["option_names"]:
            vals = []
            for v in variants:
                n = next(o["name"] for o in v["optionValues"] if o["optionName"] == k)
                if n not in vals:
                    vals.append(n)
            options.append({"name": k, "position": len(options) + 1, "values": [{"name": n} for n in vals]})
        art_slug = {"uebergangsprofile": "uebergangsprofile", "abschlussprofile": "abschlussprofile", "kleber": "kleber-und-fixierung",
                    "bauchemie": "bauchemie", "unterlagen": "verlege-und-daemmunterlagen", "reinigung": "reinigungsmittel",
                    "verlegeband": "verlegeband", "sauberlauf": "sauberlauf"}[cat]
        tags = ["zubehoer", f"art: {art_slug}"]
        if p["marke"]:
            tags.append(f"marke: {p['marke'].lower()}")
        seo_title = f"{title} | TeppichParadies"
        seo_desc = SEO_DESC[cat].format(t=title)
        mfs = [
            {"namespace": "custom", "key": "arten", "type": "list.metaobject_reference", "value": json.dumps([p["arten_gid"]])},
            {"namespace": "grosshandel", "key": "sku", "type": "single_line_text_field", "value": f"{p['grosshandel_sku']} ({p['supplier_title']})"[:255]},
            {"namespace": "global", "key": "title_tag", "type": "string", "value": seo_title},
            {"namespace": "global", "key": "description_tag", "type": "string", "value": seo_desc},
        ]
        if p["marke"]:
            mfs.append({"namespace": "custom", "key": "marke", "type": "single_line_text_field", "value": p["marke"]})
        inputs.append({
            "title": title, "handle": p["handle"], "vendor": "TeppichParadies", "productType": p["arten_label"],
            "status": "ACTIVE", "templateSuffix": "zubehoer", "tags": tags,
            "seo": {"title": seo_title, "description": seo_desc},
            "descriptionHtml": description(p), "metafields": mfs, "files": files[:12],
            "productOptions": options, "variants": variants,
        })
    json.dump(inputs, open(os.path.join(HERE, "productset-inputs.json"), "w"), ensure_ascii=False, indent=1)
    print(len(inputs), "Inputs,", sum(len(i["variants"]) for i in inputs), "Varianten,", sum(len(i["files"]) for i in inputs), "Dateien")


if __name__ == "__main__":
    build()
