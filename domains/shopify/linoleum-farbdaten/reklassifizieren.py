# -*- coding: utf-8 -*-
"""messwerte.json neu klassifizieren - liest die gespeicherten HEX-Werte,
braucht kein Pillow und keinen Netzzugriff."""
import json, sys
from colors import classify, stufe

d = json.load(open('messwerte.json', encoding='utf-8'))
for key, prod in d.items():
    print('\n== %s (%d)' % (key, len(prod['colors'])))
    rows = sorted(prod['colors'], key=lambda c: -(c.get('L') or 0))
    for c in rows:
        if not c.get('hex'):
            continue
        r, g, b = c['rgb']
        ton, l, s, hd = classify(r, g, b)
        c['ton'], c['L'], c['S'], c['H'] = ton, l, s, hd
        print('  %-26s %-8s L=%.2f S=%.2f H=%5.1f  -> %-8s %s'
              % (c['label'], c['hex'], l, s, hd, ton, stufe(l)))

if '--write' in sys.argv:
    json.dump(d, open('messwerte.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('\nmesswerte.json aktualisiert')
