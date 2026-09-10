#!/usr/bin/env python3
"""PLZ- und Ortstabelle fuer die Sektion "TP Verlegegebiet" erzeugen.

Damit prueft die Sektion offline, ob ein Wohnort im Verlegegebiet liegt -
ohne Geocoding-Dienst, ohne Schluessel, ohne Kosten. Die Kartenbilder baut
das Schwesterskript scripts/build-verlegegebiet-karte.mjs.

Aufruf:
    python3 scripts/build-verlegegebiet-orte.py

Quelle und Lizenz:
  GeoNames postal codes, CC BY 4.0 - https://download.geonames.org
  Namensnennung steht im Feld "quelle" der erzeugten JSON-Datei.

Aendert sich der Standort, hier LAT/LON anpassen - und daran denken, dass
die Kartenbilder denselben Mittelpunkt brauchen.
"""

import io
import json
import math
import os
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict

# --- Standort -------------------------------------------------------------
LAT, LON = 52.7378, 13.2485          # Saarlandstrasse, 16515 Oranienburg
UA = "TeppichParadies-Theme/1.0 (kontakt@teppich-paradies.net)"

# --- PLZ-Tabelle ----------------------------------------------------------
GEONAMES = "https://download.geonames.org/export/zip/DE.zip"
MAX_KM = 90          # Reserve ueber dem im Editor einstellbaren Radius (max. 60)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")


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
    plz_tabelle_bauen()
