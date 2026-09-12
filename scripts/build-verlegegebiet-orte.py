#!/usr/bin/env python3
"""PLZ- und Ortstabelle fuer die Sektion "TP Verlegegebiet" erzeugen.

Damit prueft die Sektion offline, ob ein Wohnort im Verlegegebiet liegt -
ohne Geocoding-Dienst, ohne Schluessel, ohne Kosten.

Ortsnamen sind mehrdeutig: es gibt vier Werder, drei Bernau, fuenf Schoenwalde.
Die erste Fassung kannte nur, was im Umkreis liegt, und liess den nahen Namen
stumm gewinnen - "Bernau" war damit auch fuer Bernau am Chiemsee "im Gebiet",
"Werder" fuer Werder (Havel) "ausserhalb". Deshalb wird jeder Name gegen ganz
Deutschland geprueft. Gehoeren zu einem Namen mehrere Orte, bekommt er ein
Kennzeichen; liegen sie auf verschiedenen Seiten der Grenze, fragt die Sektion
nach der Postleitzahl, statt zu raten.

Kurzformen laufen als Zweitnamen mit: "Werder (Havel)" auch als "Werder",
"Neuenhagen bei Berlin" auch als "Neuenhagen". Dadurch geraten sie in dieselbe
Pruefung und werden bei Namensgleichheit ebenfalls mehrdeutig.

Die Postleitzahl-Liste von GeoNames kennt keine Ortsteile und keine Gemeinden,
die anders heissen als ihr Postort - Spandau, Hoppegarten, Panketal fehlten.
Deshalb kommen die Ortsnamen im Umkreis zusaetzlich aus OpenStreetMap.

GeoNames fuehrt ausserdem die Postleitzahlen von Grosskunden und Behoerden
unter ihrem Namen - "Zalando Lounge", "Auswaertiges Amt", "Berliner
Feuerwehr". Eine Liste von Firmenwoertern erwischt davon nur einen Teil; die
erste Fassung hatte eine und liess die meisten durch. Deshalb entscheidet ein
Merkmal der Daten: ein Name aus der Postleitzahl-Liste zaehlt nur, wenn er
sich vollstaendig in echte Orte aus OpenStreetMap zerlegen laesst. "Berlin
Kreuzberg" wird zu Berlin und Kreuzberg und bleibt, "Agentur fuer Arbeit
Berlin Mitte" scheitert an "Agentur". Die Postleitzahlen selbst bleiben alle
in der Tabelle - wer eine Grosskunden-PLZ eintippt, bekommt trotzdem eine
Antwort.

Nebenbei entsteht .cache/verlegegebiet-punkte.json mit den Koordinaten. Daraus
zeichnet scripts/build-verlegegebiet-karte.mjs den Umriss des Verlegegebiets.
Beide lesen damit dieselbe Quelle - die Flaeche auf der Karte und die Antwort
der Pruefung koennen so gar nicht auseinanderlaufen. Dieses Skript zuerst
laufen lassen.

Aufruf:
    python3 scripts/build-verlegegebiet-orte.py

Quellen und Lizenzen:
  GeoNames postal codes, CC BY 4.0 - https://download.geonames.org
  OpenStreetMap-Mitwirkende, ODbL - Ortsnamen im Umkreis ueber Overpass
  Namensnennung steht im Feld "quelle" der erzeugten JSON-Datei.

Aendert sich der Standort, hier LAT/LON anpassen - und daran denken, dass
die Kartenbilder denselben Mittelpunkt brauchen.
"""

import io
import json
import math
import os
import re
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict

# --- Standort -------------------------------------------------------------
LAT, LON = 52.7378, 13.2485          # Saarlandstrasse, 16515 Oranienburg
UA = "TeppichParadies-Theme/1.0 (kontakt@teppich-paradies.net)"

# --- PLZ-Tabelle ----------------------------------------------------------
GEONAMES = "https://download.geonames.org/export/zip/DE.zip"
# Reserve ueber dem groessten Radius des Reglers (50 km): so wird ein Ort in
# 70 km noch als "ausserhalb" erkannt statt als "kennen wir nicht" - und
# bekommt damit den Weg in den Shop statt nur die Bitte um eine Postleitzahl.
MAX_KM = 90
# Fuer den Umriss braucht die Karte auch Punkte ausserhalb: sie begrenzen die
# aeusseren Zellen, sonst franst die Flaeche am Rand aus.
PUNKTE_KM = 130

OVERPASS = "https://overpass-api.de/api/interpreter"

# Wie weit zwei Fundstellen desselben Namens auseinanderliegen duerfen, um
# noch als ein Ort zu gelten. Berlins 182 Postleitzahlen liegen je ein bis drei
# Kilometer auseinander und verketten sich zu einem Ort; die beiden Werder in
# Brandenburg liegen 60 km auseinander und bleiben zwei.
GLEICHER_ORT_KM = 10


# Kurzform eines Ortsnamens: ohne Klammerzusatz, ohne "/Zusatz", ohne
# "bei/am/an der ...". Bindestriche bleiben - "Schoenwalde-Glien" ist ein
# eigener Name, "Gross" und "Bad" allein waeren keine Orte.
ZUSATZ = re.compile(r"\s+(bei|b\.|am|an der|an den|a\.\s?d\.|im|in der|in|ob der|vor der)\s+.*$", re.I)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
CACHE = os.path.join(ROOT, ".cache")


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


def kurzform(name):
    ohne = re.sub(r"\s*\(.*?\)", "", name)
    ohne = ohne.split("/")[0]
    ohne = ZUSATZ.sub("", ohne)
    return ohne.strip()


def schluessel(name):
    """Voller Name und Kurzform, jeweils normalisiert."""
    voll = normalisieren(name)
    kurz = normalisieren(kurzform(name))
    return {k for k in (voll, kurz) if k}


def geografisch(name, orte):
    """Laesst sich der Name vollstaendig in bekannte Orte zerlegen?

    Die Woerter werden von vorn mit dem jeweils laengsten Stueck belegt, das
    ein Ortsname ist - "Bad Saarow Petersdorf" wird zu "Bad Saarow" und
    "Petersdorf". Bleibt ein Wort uebrig, das zu keinem Ort gehoert, ist der
    Name kein Ort.
    """
    woerter = [normalisieren(w) for w in re.split(r"[\s,/()\-]+", name)]
    woerter = [w for w in woerter if w]
    if not woerter:
        return False
    belegt = [False] * (len(woerter) + 1)
    belegt[len(woerter)] = True
    for i in range(len(woerter) - 1, -1, -1):
        for j in range(len(woerter), i, -1):
            if belegt[j] and "".join(woerter[i:j]) in orte:
                belegt[i] = True
                break
    return belegt[0]


def osm_orte():
    """Ortsnamen im Umkreis aus OpenStreetMap, zwischengespeichert unter .cache."""
    ablage = os.path.join(CACHE, "verlegegebiet-osm-orte.json")
    if os.path.exists(ablage):
        with open(ablage, encoding="utf-8") as f:
            return json.load(f)
    abfrage = (
        "[out:json][timeout:160];("
        f'node["place"~"^(city|town|village|suburb|borough|quarter)$"](around:{MAX_KM * 1000},{LAT},{LON});'
        f'relation["boundary"="administrative"]["admin_level"~"^(8|9|10)$"](around:{MAX_KM * 1000},{LAT},{LON});'
        ");out center tags;"
    )
    anfrage = urllib.request.Request(
        OVERPASS, data=urllib.parse.urlencode({"data": abfrage}).encode(),
        headers={"User-Agent": UA})
    elemente = json.loads(urllib.request.urlopen(anfrage, timeout=180).read())["elements"]
    orte = []
    for e in elemente:
        name = e.get("tags", {}).get("name")
        lage = e if "lat" in e else e.get("center")
        if name and lage:
            orte.append([name, lage["lat"], lage["lon"]])
    os.makedirs(CACHE, exist_ok=True)
    with open(ablage, "w", encoding="utf-8") as f:
        json.dump(orte, f, ensure_ascii=False)
    return orte


def zu_orten_buendeln(fundstellen):
    """Fundstellen eines Namens zu Orten zusammenfassen (Einfachverkettung)."""
    eltern = list(range(len(fundstellen)))

    def wurzel(i):
        while eltern[i] != i:
            eltern[i] = eltern[eltern[i]]
            i = eltern[i]
        return i

    for i in range(len(fundstellen)):
        for j in range(i + 1, len(fundstellen)):
            if haversine(fundstellen[i][0], fundstellen[i][1],
                         fundstellen[j][0], fundstellen[j][1]) <= GLEICHER_ORT_KM:
                eltern[wurzel(i)] = wurzel(j)
    return len({wurzel(i) for i in range(len(fundstellen))})


def plz_tabelle_bauen():
    daten = urllib.request.urlopen(
        urllib.request.Request(GEONAMES, headers={"User-Agent": UA}), timeout=60).read()
    with zipfile.ZipFile(io.BytesIO(daten)) as z:
        zeilen = z.read("DE.txt").decode("utf-8").splitlines()

    # Echte Orte im Umkreis - der Massstab dafuer, was ein Ortsname ist.
    osm = osm_orte()
    osm_nah = [(n, la, lo) for n, la, lo in osm if haversine(LAT, LON, la, lo) <= MAX_KM]
    orte_osm = set()
    for name, _, _ in osm_nah:
        orte_osm |= schluessel(name)

    punkte = {}
    plz = {}
    praefixe = set()
    # Je Name alle Fundstellen in ganz Deutschland: (lat, lon, km). Auch die
    # fernen und die der Grosskunden - sie zaehlen nur fuer Namen, die am Ende
    # zugelassen sind, und machen dort gleichnamige Orte sichtbar.
    fundstellen = defaultdict(list)
    zugelassen = set(orte_osm)
    verworfen = set()
    for zeile in zeilen:
        c = zeile.split("\t")
        if len(c) < 11 or not c[9] or not c[10]:
            continue
        try:
            lat, lon = float(c[9]), float(c[10])
        except ValueError:
            continue
        km = haversine(LAT, LON, lat, lon)
        code, ort = c[1], c[2]
        praefixe.add(code[:3])
        if km <= PUNKTE_KM and (code not in punkte or km < punkte[code][2]):
            punkte[code] = [round(lon, 5), round(lat, 5), round(km, 1)]
        if km <= MAX_KM:
            # Je Postleitzahl die Spanne, wie bei den Ortsnamen - eine PLZ kann
            # mehrere Doerfer umfassen, und beide Eingaben sollen gleich zaehlen.
            spanne = plz.get(code)
            plz[code] = [km, km] if spanne is None else [min(spanne[0], km), max(spanne[1], km)]
        schl = schluessel(ort)
        for k in schl:
            fundstellen[k].append((lat, lon, km))
        if km <= MAX_KM:
            if geografisch(ort, orte_osm):
                zugelassen |= schl
            else:
                verworfen.add(ort)

    for name, lat, lon in osm_nah:
        km = haversine(LAT, LON, lat, lon)
        for k in schluessel(name):
            fundstellen[k].append((lat, lon, km))

    orte = {}
    mehrfach = 0
    for k, liste in fundstellen.items():
        if k not in zugelassen:
            continue
        entfernungen = [f[2] for f in liste]
        if min(entfernungen) > MAX_KM:
            continue  # nur Namen, die im Umkreis vorkommen
        eintrag = [round(min(entfernungen), 1), round(max(entfernungen), 1)]
        if zu_orten_buendeln(liste) > 1:
            eintrag.append(1)  # mehrere Orte dieses Namens
            mehrfach += 1
        orte[k] = eintrag
    ziel = os.path.join(ASSETS, "tp-verlegegebiet-orte.json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump({
            "quelle": "GeoNames postal codes (CC BY 4.0, geonames.org), "
                      "OpenStreetMap-Mitwirkende (ODbL, openstreetmap.org)",
            "mittelpunkt": {"ort": "Oranienburg", "lat": LAT, "lon": LON},
            "max_km": MAX_KM,
            # Spanne je Postleitzahl: [naechster, entferntester Ort]
            "plz": {k: [round(v[0], 1), round(v[1], 1)] for k, v in sorted(plz.items())},
            # Spanne je Ortsname; eine angehaengte 1 heisst: mehrere Orte dieses Namens
            "orte": dict(sorted(orte.items())),
            # Gueltige Anfaenge deutscher Postleitzahlen - "00000" ist keine
            "praefixe": "".join(sorted(praefixe)),
        }, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{os.path.basename(ziel)}  {len(plz)} PLZ, {len(orte)} Ortsnamen "
          f"(davon {mehrfach} mehrdeutig), {len(verworfen)} Postnamen ohne Ort verworfen, "
          f"{len(praefixe)} PLZ-Anfaenge, "
          f"{os.path.getsize(ziel) / 1024:.0f} KB")

    os.makedirs(CACHE, exist_ok=True)
    punkteziel = os.path.join(CACHE, "verlegegebiet-punkte.json")
    with open(punkteziel, "w", encoding="utf-8") as f:
        json.dump(punkte, f, separators=(",", ":"))
    print(f"{os.path.join('.cache', 'verlegegebiet-punkte.json')}  {len(punkte)} Punkte bis "
          f"{PUNKTE_KM} km (Vorlage fuer den Umriss, nicht im Repository)")


if __name__ == "__main__":
    plz_tabelle_bauen()
