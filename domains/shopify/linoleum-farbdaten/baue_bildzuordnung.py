# -*- coding: utf-8 -*-
"""Variante -> Variantenbild fuer Marenta, Cavero und Nordan.

Zuordnung geht ueber die Bilddatei aus messwerte.json, nicht ueber die
Reihenfolge - die Reihenfolge war genau das, was bei Jokalino und Concrete
vertauscht war.
"""
import json
from namensplan import MARKEN, FARBEN

mess = json.load(open('messwerte.json', encoding='utf-8'))
smed = json.load(open('shopify_media.json', encoding='utf-8'))

# SKU -> Varianten-ID, aus der Shopify-Abfrage
VARIANTEN = {
 'PVCJOKALE2_1022':'60690708988238','PVCJOKALE2_1013':'60690709021006','PVCJOKALE2_1011':'60690709053774',
 'PVCJOKALE2_1008':'60690709086542','PVCJOKALE2_1007':'60690709119310','PVCJOKALE2_1005':'60690709152078',
 'PVCJOKALE2_1003':'60690709184846','PVCJOKALE2_1002':'60690709217614','PVCJOKALE2_1001':'60690709250382',
 'PVCJOKALE2_1015':'60690709283150','PVCJOKALE2_1014':'60690709315918','PVCJOKALE2_1019':'60690709348686',
 'PVCJOKALE2_1018':'60690709381454','PVCJOKALE2_1017':'60690709414222','PVCJOKALE2_1016':'60690709446990',
 'PVCJOKALE2_1413':'60690709479758',
 'PVCJOKALE5_1028':'60690815418702','PVCJOKALE5_1027':'60690815451470','PVCJOKALE5_1026':'60690815484238',
 'PVCJOKALE5_1025':'60690815517006','PVCJOKALE5_1024':'60690815549774','PVCJOKALE5_1023':'60690815582542',
 'PVCLINOFLX_604':'60690712985934','PVCLINOFLX_601':'60690713018702','PVCLINOFLX_501':'60690713051470',
 'PVCLINOFLX_104':'60690713084238','PVCLINOFLX_102':'60690713117006',
}

out, fehler = {}, []
for key in ['jokalino', 'concrete', 'linoflex']:
    m, namen, vs = MARKEN[key], FARBEN[key], []
    for c in mess[key]['colors']:
        sku, nr = c['artnr'], c['artnr'].rsplit('_', 1)[-1]
        basis = c['image'].rsplit('/', 1)[-1].split('-')[0]
        if sku not in VARIANTEN: fehler.append('%s: keine Variante' % sku); continue
        if basis not in smed[key]: fehler.append('%s: kein Bild %s' % (sku, basis)); continue
        vs.append({'id': 'gid://shopify/ProductVariant/' + VARIANTEN[sku],
                   'mediaId': 'gid://shopify/MediaImage/' + smed[key][basis],
                   '_farbe': namen[nr], '_datei': basis})
    if len(set(v['mediaId'] for v in vs)) != len(vs): fehler.append('%s: Bild doppelt' % key)
    out[key] = {'productId': 'gid://shopify/Product/%d' % m['id'], 'variants': vs}
    print('%-9s %d Zuordnungen' % (key, len(vs)))
    for v in vs: print('   %-18s <- %s' % (v['_farbe'], v['_datei']))

if fehler:
    print('\nFEHLER:'); [print(' -', f) for f in fehler]
else:
    json.dump(out, open('bildzuordnung.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\nbildzuordnung.json geschrieben - keine Fehler')
