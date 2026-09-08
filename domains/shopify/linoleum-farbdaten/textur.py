# -*- coding: utf-8 -*-
"""Oberflaechen-Messung fuer Farben, die der Median nicht mehr trennt.

colors.py misst den Median des Bildkerns - das ist die Farbe. Zwei Boeden
koennen dieselbe Farbe haben und trotzdem voellig verschieden aussehen:
uniform gegen meliert. Das zeigt erst die Streuung ueber dem Bildkern.

    Streuung (std_rgb)   ~4-6   -> uniform, ruhig
    Streuung (std_rgb)  ~10-15  -> meliert, geadert

Beispiel Marenta: 1413 (#d9c8ad, std 4-6) und 1007 (#d8c7ad, std 11-14) -
gleicher Farbwert, aber "Sand Hell" gegen "Sand Hell Meliert".

Aufruf:  <venv>/bin/python textur.py <bild.jpg> [weitere.jpg ...]
Braucht Pillow (venv anlegen, siehe HANDOFF.md).
"""
import sys, colorsys
from PIL import Image, ImageStat


def messen(pfad):
    im = Image.open(pfad).convert('RGB')
    w, h = im.size
    kern = im.crop((int(w * .25), int(h * .25), int(w * .75), int(h * .75)))
    st = ImageStat.Stat(kern)
    mean = [round(x) for x in st.mean]
    std = [round(x, 1) for x in st.stddev]
    hue, l, s = colorsys.rgb_to_hls(*[m / 255 for m in mean])
    grau = kern.convert('L').resize((64, 64))
    textur = ImageStat.Stat(grau).stddev[0]
    return {
        'hex': '#%02x%02x%02x' % tuple(mean),
        'H': round(hue * 360, 1), 'L': round(l, 3), 'S': round(s, 3),
        'std_rgb': std, 'textur': round(textur, 1),
        'urteil': 'meliert' if textur >= 4.0 else 'uniform',
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        m = messen(p)
        print('%-32s %s  L=%.3f S=%.3f  std=%s  textur=%4.1f  -> %s'
              % (p.rsplit('/', 1)[-1], m['hex'], m['L'], m['S'],
                 m['std_rgb'], m['textur'], m['urteil']))
