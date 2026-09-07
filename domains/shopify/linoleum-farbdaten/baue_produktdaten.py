# -*- coding: utf-8 -*-
"""Titel, Vendor, Handle, SEO und Beschreibung fuer die 7 neuen Eigennamen.

Der Beschreibungstext folgt bei allen sieben derselben Vorlage, deshalb genuegt
ein Austausch des alten Liniennamens - der Rest des Textes bleibt unangetastet.
"""
import json
from namensplan import MARKEN, FARBEN

BESCHREIBUNG = (
 '<div class="pd-card">\n<h3>{neu} Linoleumboden</h3>\n'
 '<p>{neu} ist ein elastischer Linoleumboden mit hoher Strapazierfähigkeit und '
 'einfacher Reinigung. Ideal für Wohnräume durch Rutschhemmung und Dauerhaftigkeit. '
 '{neu} funktioniert mit Fußbodenheizung (Warmwasser und Elektro) und ist in '
 '{n} Farben sowie 200cm erhältlich.</p>\n'
 '<div class="pd-badges">\n<span class="pd-badge">{starke} Stärke</span>'
 '<span class="pd-badge">Elastisch &amp; rutschhemmend</span>'
 '<span class="pd-badge">Fußbodenheizung geeignet</span>'
 '<span class="pd-badge">{badge}</span>\n</div>\n'
 '<table class="pd-specs">\n<tr>\n<th>Eignung</th>\n<td>Wohnräume &amp; Gewerbe</td>\n</tr>\n'
 '<tr>\n<th>Material</th>\n<td>{material}</td>\n</tr>\n'
 '<tr>\n<th>Stärke</th>\n<td>{starke}</td>\n</tr>\n'
 '<tr>\n<th>Verfügbare Breiten</th>\n<td>200cm</td>\n</tr>\n'
 '<tr>\n<th>Brandverhalten</th>\n<td>Cfl-s1</td>\n</tr>\n</table>\n</div>')

# aus dem Ist-Stand uebernommen, nicht neu erfunden
DETAIL = {
 'jokalino': ('2.5 mm', 'Linoleum elastisch', 'Nutzungsklasse 43/34', 'marenta-linoleumboden-200cm'),
 'linoflex': ('2.0 mm', 'Linoleum elastisch', 'Cfl-s1 Brandverhalten',  'nordan-linoleumboden-200cm'),
 'concrete': ('2.5 mm', 'Linoleum elastisch', 'Cfl-s1 Brandverhalten',  'cavero-linoleumboden-200cm'),
 'vivace':   ('2,5 mm', 'Linoleum',           'Cfl-s1 Brandverhalten',  'fiora-linoleumboden-200cm'),
 'cocoa':    ('2,5 mm', 'Linoleum',           'Cfl-s1 Brandverhalten',  'kaneo-linoleumboden-200cm'),
 'urban':    ('2,5 mm', 'Linoleum',           'Cfl-s1 Brandverhalten',  'loftis-linoleumboden-200cm'),
 'moon':     ('2,5 mm', 'Linoleum',           'Cfl-s1 Brandverhalten',  'selene-linoleumboden-200cm'),
}

out = {}
for key, (starke, material, badge, handle) in DETAIL.items():
    m = MARKEN[key]
    neu, n = m['name'], len(FARBEN[key])
    seo_t = '%s Linoleumboden 200cm | TeppichParadies' % neu
    seo_d = ('%s Linoleumboden in %d Farben, 200cm Breite. Elastisch, rutschhemmend, '
             'fußbodenheizungsgeeignet.' % (neu, n))
    out[key] = {
      'product': {
        'id': 'gid://shopify/Product/%d' % m['id'],
        'title': '%s Linoleumboden 200cm' % neu,
        'vendor': neu,
        'handle': handle,
        'redirectNewHandle': True,
        'seo': {'title': seo_t, 'description': seo_d},
        'descriptionHtml': BESCHREIBUNG.format(neu=neu, n=n, starke=starke,
                                               material=material, badge=badge),
      },
      'metafelder': [
        {'ownerId': 'gid://shopify/Product/%d' % m['id'], 'namespace': 'global',
         'key': 'title_tag', 'type': 'single_line_text_field', 'value': seo_t},
        {'ownerId': 'gid://shopify/Product/%d' % m['id'], 'namespace': 'global',
         'key': 'description_tag', 'type': 'single_line_text_field', 'value': seo_d},
        {'ownerId': 'gid://shopify/Product/%d' % m['id'], 'namespace': 'grosshandel',
         'key': 'sku', 'type': 'single_line_text_field', 'value': m['alt']},
      ],
    }

json.dump(out, open('produktdaten.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, v in out.items():
    print('%-9s %-30s handle=%s' % (k, v['product']['title'], v['product']['handle']))
print('\nproduktdaten.json geschrieben')
