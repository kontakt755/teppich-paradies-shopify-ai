# -*- coding: utf-8 -*-
"""Erzeugt die GraphQL-Variablen fuer alle Umbenennungen.

Zuordnung laeuft ueber die Farbnummer, die im bestehenden Optionswert steckt
("1022 slate grey" -> 1022, "Farbe 4352 A" -> 4352 A). Nichts wird geraten:
faellt eine Nummer durch, bricht das Script ab.
"""
import json, re, sys
from namensplan import MARKEN, FARBEN

ov = json.load(open('optionvalues.json', encoding='utf-8'))
out = {}
fehler = []

for key, m in MARKEN.items():
    namen = FARBEN[key]
    treffer, benutzt = [], set()
    for altname, vid in ov[key]['values'].items():
        roh = re.sub(r'^Farbe\s+', '', altname)
        mm = re.match(r'^(\d+(?:\s+A)?)', roh)
        if not mm:
            fehler.append('%s: Nummer nicht erkannt in %r' % (key, altname)); continue
        nr = re.sub(r'\s+', ' ', mm.group(1))
        if nr not in namen:
            fehler.append('%s: kein Name fuer Nummer %r (aus %r)' % (key, nr, altname)); continue
        treffer.append({'id': 'gid://shopify/ProductOptionValue/' + vid,
                        'name': namen[nr], '_alt': altname, '_nr': nr})
        benutzt.add(nr)
    offen = set(namen) - benutzt
    if offen:
        fehler.append('%s: Namen ohne Optionswert: %s' % (key, sorted(offen)))
    if len(set(t['name'] for t in treffer)) != len(treffer):
        fehler.append('%s: doppelte Zielnamen' % key)
    out[key] = {
        'productId': 'gid://shopify/Product/%d' % m['id'],
        'optionId': ov[key]['optionId'],
        'titel': '%s Linoleumboden 200cm' % m['name'],
        'vendor': m['name'],
        'farben': len(treffer),
        'renames': treffer,
    }

if fehler:
    print('ABBRUCH:'); [print(' -', f) for f in fehler]; sys.exit(1)

json.dump(out, open('mutationen.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, v in out.items():
    print('%-9s %-32s %2d Farben  vendor=%s' % (k, v['titel'], v['farben'], v['vendor']))
print('\nmutationen.json geschrieben - keine Fehler')
