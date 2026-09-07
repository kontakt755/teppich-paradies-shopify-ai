"""Linoleum-Farbmessung: Produktbild -> dominante Farbe -> deutscher Grundton.

Die Funktion classify() wird auch von namen.py importiert, deshalb steht die
Pipeline unter __main__ und laeuft nicht beim Import los.
"""
# -*- coding: utf-8 -*-
import json, urllib.request, colorsys, os

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "Chrome/120.0 Safari/537.36")
CACHE = '/tmp/lino'


def fetch(url):
    os.makedirs(CACHE + '/img', exist_ok=True)
    p = CACHE + '/img/' + url.rsplit('/', 1)[-1]
    if not os.path.exists(p):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        open(p, 'wb').write(urllib.request.urlopen(req, timeout=30).read())
    return p


def dominant(path):
    """Median-Farbe des Bildzentrums - robust gegen Raender und Schatten."""
    from PIL import Image
    im = Image.open(path).convert('RGB')
    w, h = im.size
    im = im.crop((int(w * .25), int(h * .25), int(w * .75), int(h * .75)))
    im = im.resize((40, 40))
    px = list(im.getdata())
    r = sorted(p[0] for p in px)[len(px) // 2]
    g = sorted(p[1] for p in px)[len(px) // 2]
    b = sorted(p[2] for p in px)[len(px) // 2]
    return r, g, b


# Helligkeitsstufen, hell -> dunkel. Namen sind das Vokabular fuer die
# zweite Haelfte des Farbnamens.
def stufe(l):
    if l >= 0.80:
        return 'Sehr Hell'
    if l >= 0.66:
        return 'Hell'
    if l >= 0.50:
        return 'Mittel'
    if l >= 0.30:
        return 'Dunkel'
    return 'Sehr Dunkel'


def classify(r, g, b):
    """RGB -> (Grundton, L, S, H) nach deutschem Farbsystem.

    Reihenfolge ist entscheidend: Graustufen werden zuerst entschieden und
    von keiner Sonderregel mehr ueberschrieben (frueherer Bug: 1022 slate
    grey, S=0.03, wurde von der Warmton-Regel zu "Taupe" gemacht).
    """
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    hd = h * 360
    if s < 0.10:
        # unbunt - Hue ist hier Rauschen und darf nichts entscheiden
        ton = 'Grau'
    elif s < 0.25 and 15 <= hd < 70:
        # warm, aber schwach gesaettigt: Creme / Beige / Taupe
        ton = 'Creme' if l >= 0.80 else 'Beige' if l >= 0.55 else 'Taupe'
    elif hd < 15:
        ton = 'Rot'
    elif hd < 45:
        # warm-braune Achse - Helligkeit UND Saettigung entscheiden.
        # Kraeftig gesaettigte Mitteltoene sind Ocker, nicht Beige
        # (4371 mit S=0.77 landete sonst bei "Beige").
        if l >= 0.80:
            ton = 'Creme'
        elif s >= 0.55 and l < 0.70:
            ton = 'Ocker'
        elif l >= 0.66:
            ton = 'Sand'
        elif l >= 0.50:
            ton = 'Beige'
        else:
            ton = 'Braun'
    elif hd < 70:
        # Gelb/Oliv - der frueher hier liegende Bereich "Orange" (40-52 Grad)
        # war falsch: 1084 und 4133 sind Creme bzw. Sand, kein Orange.
        # Kraeftige Saettigung heisst Gelb, auch wenn es dunkel ist
        # (1018 chartreuse, S=0.45, war sonst "Oliv").
        if l >= 0.80:
            ton = 'Creme'
        elif s >= 0.35 or l >= 0.55:
            ton = 'Gelb'
        else:
            ton = 'Oliv'
    elif hd < 160:
        ton = 'Grün'
    elif hd < 200:
        ton = 'Türkis'
    elif hd < 255:
        ton = 'Blau'
    elif hd < 290:
        ton = 'Violett'
    else:
        ton = 'Rosé'
    return ton, round(l, 3), round(s, 3), round(hd, 1)


def main():
    data = json.load(open(CACHE + '/data.json'))
    out = {}
    for key, prod in data.items():
        rows = []
        for c in prod['colors']:
            if not c['image']:
                rows.append({**c, 'rgb': None})
                continue
            rgb = dominant(fetch(c['image']))
            ton, l, s, hd = classify(*rgb)
            rows.append({**c, 'rgb': rgb, 'hex': '#%02x%02x%02x' % rgb,
                         'ton': ton, 'L': l, 'S': s, 'H': hd})
        out[key] = {**prod, 'colors': rows}
    json.dump(out, open(CACHE + '/colors.json', 'w'), ensure_ascii=False, indent=1)
    print('saved ' + CACHE + '/colors.json')


if __name__ == '__main__':
    main()
