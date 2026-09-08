# -*- coding: utf-8 -*-
"""Farbnamen und Eigennamen fuer die 7 Linoleum-Produkte.

Die Farbnamen sind aus den Messwerten abgeleitet (Grundton aus colors.classify,
Helligkeit aus colors.stufe) und dort, wo zwei Farben im selben Feld landen,
ueber eine dritte Stufe getrennt - Shopify laesst doppelte Optionswerte nicht zu.
"""
import json

MARKEN = {
    'jokalino': {'name': 'Marenta',  'id': 16049244864846, 'alt': 'Jokalino',              'preis': '39.95', 'praefix': 'PVCJOKALE2'},
    'linoflex': {'name': 'Nordan',   'id': 16049246077262, 'alt': 'LINOFLEX',              'preis': '43.95', 'praefix': 'PVCLINOFLX'},
    'concrete': {'name': 'Cavero',   'id': 16049267441998, 'alt': 'Jokalino Concrete',     'preis': '49.95', 'praefix': 'PVCJOKALE5'},
    'vivace':   {'name': 'Fiora',    'id': 16049285759310, 'alt': 'Jokalino Vivace',       'preis': '55.95', 'praefix': 'PVCJOKELE4'},
    'cocoa':    {'name': 'Kaneo',    'id': 16049295065422, 'alt': 'Jokalino Cocoa',        'preis': '51.95', 'praefix': 'LINCOCOA'},
    'urban':    {'name': 'Loftis',   'id': 16049307386190, 'alt': 'Jokaleum Urban',        'preis': '60.95', 'praefix': 'LINURBAN'},
    'moon':     {'name': 'Selene',   'id': 16049315643726, 'alt': 'Jokaleum Moon',         'preis': '60.95', 'praefix': 'LINARTMOON'},
    # Coloria behaelt seinen Eigennamen, bekommt aber dieselben deutschen Farbnamen
    'coloria':  {'name': 'Coloria',  'id': 16049177723214, 'alt': 'Coloria',               'preis': '42.95', 'praefix': 'PVCJOKANEC'},
}

# Farbnummer -> deutscher Name. Reihenfolge im dict = Sortierung hell -> dunkel.
FARBEN = {
 'jokalino': {
   # 1413 und 1007 haben denselben Farbwert (#d9c8ad / #d8c7ad). Der Unterschied
   # liegt in der Oberflaeche: 1413 ist nahezu uniform (Streuung 4-6), 1007 ist
   # kraeftig meliert (Streuung 11-14). Deshalb "Meliert" statt einer erfundenen
   # Helligkeitsstufe - das sieht der Kunde auf dem Bild.
   '1413': 'Sand Hell',        '1007': 'Sand Hell Meliert', '1001': 'Sand Mittel',
   '1005': 'Sand Gold',        '1003': 'Sand Warm',       '1014': 'Gelb Hell',
   '1018': 'Gelb Grün',        '1002': 'Grau Hell',       '1015': 'Grau Warm',
   '1019': 'Grau Mittel',      '1022': 'Grau Dunkel',     '1017': 'Grau Oliv',
   '1011': 'Grau Braun',       '1016': 'Grau Anthrazit',  '1008': 'Blau Grau Hell',
   '1013': 'Blau Grau Mittel',
 },
 'linoflex': {
   '501': 'Sand Hell',  '102': 'Ocker',  '104': 'Braun Rot',
   '601': 'Grau Mittel', '604': 'Grau Anthrazit',
 },
 'concrete': {
   '1027': 'Beige Hell',  '1024': 'Beige Warm',  '1025': 'Beige Grau',
   '1026': 'Grau Mittel', '1023': 'Grau Warm',   '1028': 'Grau Dunkel',
 },
 'vivace': {
   '1029': 'Sand Hell', '1031': 'Ocker Warm', '1032': 'Gelb Grün', '1030': 'Beige Grau',
 },
 'cocoa': {
   '1084': 'Creme',      '1090': 'Sand Hell', '1082': 'Grau Hell',
   '1093': 'Beige Oliv', '1088': 'Grau Grün', '1080': 'Taupe',
 },
 'urban': {
   '4050': 'Beige Warm', '4070': 'Grau Mittel', '4080': 'Grau Grün', '4065': 'Grau Dunkel',
 },
 'moon': {
   '4133': 'Sand Hell', '4129': 'Grau Grün', '4107': 'Taupe', '4134': 'Grau Dunkel',
 },
 'coloria': {
   '4352 A': 'Grau Hell',  '4358': 'Grau Silber', '4332 A': 'Grün Hell',
   '4301 A': 'Gelb Gold',  '4371 A': 'Ocker',     '4359': 'Grau Mittel',
   '4306 A': 'Grün Dunkel','4380': 'Grau Blau',   '4381': 'Grau Anthrazit',
 },
}

if __name__ == '__main__':
    mess = json.load(open('messwerte.json', encoding='utf-8'))
    hexe = {c['artnr'].rsplit('_', 1)[-1]: c.get('hex')
            for p in mess.values() for c in p['colors']}
    labels = {c['artnr'].rsplit('_', 1)[-1]: c['label']
              for p in mess.values() for c in p['colors']}
    fehler = 0
    for key, m in MARKEN.items():
        f = FARBEN[key]
        soll = len(mess[key]['colors'])
        print('\n%s  ->  %s Linoleumboden 200cm   (%d Farben, %s EUR/m2)'
              % (m['alt'], m['name'], len(f), m['preis']))
        if len(f) != soll:
            print('  !! %d Namen fuer %d Farben' % (len(f), soll)); fehler += 1
        if len(set(f.values())) != len(f):
            print('  !! doppelte Namen'); fehler += 1
        for nr, name in f.items():
            print('  %-8s %-18s %-8s  alt: %s'
                  % (nr, name, hexe.get(nr, '?'), labels.get(nr, '?')))
    print('\nFehler:', fehler)
