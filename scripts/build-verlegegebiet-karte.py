#!/usr/bin/env python3
"""Basiskarten und PLZ-Tabelle fuer die Sektion "TP Verlegegebiet" erzeugen.

Warum vorgerendert und nicht als Live-Karte: die Sektion braucht weder Zoom
noch Pan, und ein statisches Bild kostet keinen externen Request (DSGVO),
kein JavaScript, keine Ladezeit und keinen Layout Shift. Die Kacheln werden
einmalig hier geholt, entsaettigt und aufgehellt; im Shop liegt nur das
fertige WebP.

Aufruf (braucht Pillow, nicht Teil der Laufzeit des Shops):
    python3 -m pip install --user Pillow
    python3 scripts/build-verlegegebiet-karte.py

Quellen und Lizenzen:
  Kacheln  OpenStreetMap-Mitwirkende, ODbL - https://osm.org/copyright
           Namensnennung steht sichtbar unter der Karte in der Sektion.
  PLZ      GeoNames postal codes, CC BY 4.0 - https://download.geonames.org
           Namensnennung steht im Feld "quelle" der erzeugten JSON-Datei.

Aendert sich der Standort oder der maximale Radius, hier die Konstanten
anpassen und neu erzeugen - die Sektion rechnet den Kreis aus GEOMETRIE
und darf nicht raten.
"""
import io
import json
import math
import os
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict

from PIL import Image, ImageFilter, ImageOps

# --- Standort -------------------------------------------------------------
LAT, LON = 52.7378, 13.2485          # Saarlandstrasse, 16515 Oranienburg
UA = "TeppichParadies-Theme/1.0 (kontakt@teppich-paradies.net)"

# --- Kartengeometrie ------------------------------------------------------
# Zoomstufe und Bildgroesse in logischen Kartenpixeln. Die Sektion braucht
# daraus nur das Seitenverhaeltnis und die Meter pro Pixel; beides wird unten
# ausgegeben und steht als Kommentar in sections/tp-verlegegebiet.liquid.
# Der Ausschnitt ist bewusst knapp: der Kreis soll die Flaeche fuellen, ohne
# anzustossen. Breiter gewaehlt zeigt die Karte halb Brandenburg und der Kreis
# verliert seine Aussage. Auf dem Smartphone kommt dazu, dass die Kacheln ihre
# Schriftgroesse fest mitbringen: je knapper der Ausschnitt, desto groesser
# erscheinen die Ortsnamen auf dem schmalen Display. Die mobile Breite liegt
# nahe an der tatsaechlichen Anzeigebreite eines Telefons, damit das Bild dort
# kaum hochskaliert werden muss.
VARIANTEN = (
    # name       zoom  breite  hoehe  schwelle  schrift
    ("desktop",     9,   1000,    700,     112,    0.64),
    ("mobile",      8,    340,    380,      80,    0.55),
)

# --- Umfaerbung -----------------------------------------------------------
# Getrennte Behandlung ist der Kern: Flaechen (Wald, Wasser, Siedlung) werden
# fast auf Weiss gezogen, die dunklen Ortsnamen bleiben lesbar. Ohne die
# Trennung ist die Karte entweder ruhig und unlesbar oder lesbar und unruhig.
# Die Schwelle steht je Variante in VARIANTEN. Auf dem Smartphone ist sie
# bewusst niedriger: dort sind die Namen kleiner Orte nur noch sieben Pixel
# hoch und zerfallen zu grauem Rauschen. Eine niedrige Schwelle laesst genau
# diese Kantenglaettung ins Weisse laufen und behaelt nur die Kerne der
# grossen Namen - Berlin und Potsdam bleiben scharf, der Rest verschwindet.
# Wenige lesbare Namen sind mehr wert als zwanzig unlesbare.
FLAT = 0.16          # Restanteil der Flaechenzeichnung
HELL = (250, 248, 245)   # Grundton hell: warmes Off-White wie im Shop
DUNKEL = (28, 26, 24)    # Grundton dunkel: warmes Anthrazit

# Die Kacheln gibt es nur in einfacher Aufloesung, und die Schriftgroesse haengt
# an der Zoomstufe: eine hoehere Stufe waere schaerfer, ihre Ortsnamen waeren auf
# der fertigen Karte aber halb so gross und damit unlesbar. Deshalb bleibt die
# Stufe, und die 2x-Fassung wird hier hochgerechnet und nachgeschaerft - das ist
# sichtbar sauberer als die weiche Interpolation des Browsers auf Retina.
SCHAERFE = dict(radius=1.1, percent=110, threshold=2)

# --- PLZ-Tabelle ----------------------------------------------------------
GEONAMES = "https://download.geonames.org/export/zip/DE.zip"
MAX_KM = 90          # Reserve ueber dem im Editor einstellbaren Radius (max. 60)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
CACHE = os.path.join(ROOT, ".cache", "osm-tiles")


def lonlat_to_px(lon, lat, z, tile_px=256):
    """Weltpixel-Koordinaten in Web Mercator."""
    n = 2 ** z * tile_px
    s = math.sin(math.radians(lat))
    return ((lon + 180.0) / 360.0 * n,
            (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n)


def meter_pro_pixel(z):
    return 156543.03392 * math.cos(math.radians(LAT)) / 2 ** z


def kachel(z, x, y):
    os.makedirs(CACHE, exist_ok=True)
    pfad = os.path.join(CACHE, f"osm-{z}-{x}-{y}.png")
    if not os.path.exists(pfad):
        req = urllib.request.Request(f"https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                                     headers={"User-Agent": UA})
        with open(pfad, "wb") as f:
            f.write(urllib.request.urlopen(req, timeout=30).read())
    return Image.open(pfad).convert("RGB")


def stitchen(z, breite, hoehe, tp=256):
    cx, cy = lonlat_to_px(LON, LAT, z, tp)
    links, oben = cx - breite / 2, cy - hoehe / 2
    x0, y0 = int(links // tp), int(oben // tp)
    x1, y1 = int((links + breite) // tp), int((oben + hoehe) // tp)
    flaeche = Image.new("RGB", ((x1 - x0 + 1) * tp, (y1 - y0 + 1) * tp))
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            flaeche.paste(kachel(z, x, y), ((x - x0) * tp, (y - y0) * tp))
    ox, oy = int(links - x0 * tp), int(oben - y0 * tp)
    return flaeche.crop((ox, oy, ox + breite, oy + hoehe))


def beruhigen(img, schwelle, schrift):
    def ton(x):
        return x * schrift if x < schwelle else 255 - (255 - x) * FLAT
    grau = ImageOps.grayscale(img).point(
        lambda x: max(0, min(255, int(round(ton(x)))))
    )
    return ImageOps.colorize(grau, DUNKEL, HELL)


def karten_bauen():
    geometrie = {}
    for name, z, breite, hoehe, schwelle, schrift in VARIANTEN:
        karte = beruhigen(stitchen(z, breite, hoehe), schwelle, schrift)
        ziel = os.path.join(ASSETS, f"tp-verlegegebiet-{name}.webp")
        karte.save(ziel, "WEBP", quality=85, method=6)
        ziel2x = os.path.join(ASSETS, f"tp-verlegegebiet-{name}-2x.webp")
        (karte.resize((breite * 2, hoehe * 2), Image.LANCZOS)
              .filter(ImageFilter.UnsharpMask(**SCHAERFE))
              .save(ziel2x, "WEBP", quality=82, method=6))
        mpp = meter_pro_pixel(z)
        geometrie[name] = {
            "breite": breite, "hoehe": hoehe, "meter_pro_pixel": round(mpp, 2),
            "km_je_prozent_breite": round(breite * mpp / 100000, 4),
        }
        print(f"{os.path.basename(ziel)}  {breite}x{hoehe}  "
              f"{os.path.getsize(ziel) / 1024:.0f} KB  (2x: "
              f"{os.path.getsize(ziel2x) / 1024:.0f} KB)  {mpp:.2f} m/px  "
              f"50 km = {50000 / mpp / breite * 100:.3f} % der Breite")
    return geometrie


def haversine(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def normalisieren(s):
    s = s.lower().replace("ß", "ss").replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if c.isalnum())


def plz_tabelle_bauen():
    daten = urllib.request.urlopen(
        urllib.request.Request(GEONAMES, headers={"User-Agent": UA}), timeout=60).read()
    with zipfile.ZipFile(io.BytesIO(daten)) as z:
        zeilen = z.read("DE.txt").decode("utf-8").splitlines()

    plz = {}
    # Grossstaedte reichen ueber den Rand, deshalb je Ort die naechste und die
    # entfernteste PLZ - sonst meldet "Berlin" pauschal "im Gebiet".
    orte = defaultdict(lambda: None)
    for zeile in zeilen:
        c = zeile.split("\t")
        if len(c) < 11 or not c[9] or not c[10]:
            continue
        try:
            km = haversine(LAT, LON, float(c[9]), float(c[10]))
        except ValueError:
            continue
        if km > MAX_KM:
            continue
        code, ort = c[1], c[2]
        if code not in plz or km < plz[code]:
            plz[code] = km
        n = normalisieren(ort)
        if not n:
            continue
        spanne = orte[n]
        orte[n] = [km, km] if spanne is None else [min(spanne[0], km), max(spanne[1], km)]

    ziel = os.path.join(ASSETS, "tp-verlegegebiet-orte.json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump({
            "quelle": "GeoNames postal codes, CC BY 4.0, https://www.geonames.org",
            "mittelpunkt": {"ort": "Oranienburg", "lat": LAT, "lon": LON},
            "max_km": MAX_KM,
            "plz": {k: round(v, 1) for k, v in sorted(plz.items())},
            "orte": {k: [round(v[0], 1), round(v[1], 1)] for k, v in sorted(orte.items())},
        }, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{os.path.basename(ziel)}  {len(plz)} PLZ, {len(orte)} Orte, "
          f"{os.path.getsize(ziel) / 1024:.0f} KB")


if __name__ == "__main__":
    geometrie = karten_bauen()
    plz_tabelle_bauen()
    print("\nGeometrie fuer sections/tp-verlegegebiet.liquid:")
    print(json.dumps(geometrie, indent=2, ensure_ascii=False))
