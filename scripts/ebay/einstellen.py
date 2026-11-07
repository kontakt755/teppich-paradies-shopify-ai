#!/usr/bin/env python3
"""Stellt Teppichboden aus der privaten eBay-Startliste bei eBay ein.

Ohne Schalter ist das ein Probelauf: Es gibt keinen Netzzugriff, der Plan landet
im Privatordner. Mit --senden entstehen Angebote als Entwurf. Veroeffentlicht
wird nur mit --veroeffentlichen, und je Lauf hoechstens --max Angebote (Standard 1).

Einkaufspreise und Lieferanten bleiben draussen: Der Plan enthaelt nur, was der
Kaeufer sehen darf, und jede Sendung wird gegen die Namensliste geprueft.

Zugang steht in <Privatordner>/ebay-zugang.env oder in der Umgebung:
EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN.
Rahmenbedingungen stehen in <Privatordner>/ebay-konfig.json, siehe KONFIG_PFLICHT.
"""

import argparse
import base64
import datetime
import html
import json
import math
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

KATEGORIE_TEPPICHBODEN = '175820'
MARKTPLATZ = 'EBAY_DE'
MAX_TITEL = 80
MAX_VARIANTEN = 250
MAX_BILDER = 12
PREIS_GRENZE = 45.0
# Sonderposten: Laengen in cm. Ueber 6 m nur auf Anfrage, wegen Gewicht (Inhaber 04.11.2026).
LAENGEN_CM = tuple(range(100, 601, 20))
# Kettelteppiche: Standardgroessen plus gaengige Zwischenmasse (Inhaber 07.11.2026), Breite x Laenge in cm
KETTEL_GROESSEN = ((80, 150), (120, 170), (140, 200), (160, 230), (170, 240), (200, 200), (200, 250), (200, 300), (240, 340))
KETTEL_MENGE = 2
KATEGORIE_TEPPICHE = '45510'
GRENZE_GLS_CM = 200
GRENZE_STANDARD_CM = 320
VERSAND_FELDER = ('versand_gls_kosten', 'versand_spedition_kosten', 'versand_xxl_kosten')
UNTERORDNER = 'ebay-marktanalyse-2026-11'
STARTLISTE = 'eBay-Startliste-2026-11-04.xlsx'
BLATT_WELLE_1 = 'Welle 1 Sonderposten'
BLATT_WELLE_2 = 'Welle 2 bis 45 Euro'
# Rat des Anwalts vom 04.11.2026: ausdruecklich als Zuschnitt und nicht als Fertigmass vermerken
HINWEIS_ZUSCHNITT = (
    'Alle Angebote sind Zuschnitte von der Rolle, keine Fertigmaße. Wir schneiden erst nach Ihrer Bestellung. '
    'Schnittware ist vom Austausch ausgeschlossen, es sei denn, sie ist fehlerhaft oder beschädigt.'
)
KEIN_BESTAND = 'kein Bestand'
MAX_MENGEN_JE_AUFRUF = 25
KONFIG_PFLICHT = ('fulfillmentPolicyId', 'paymentPolicyId', 'returnPolicyId', 'merchantLocationKey')
ZUGANG_PFLICHT = ('EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN')
BASIS = {'sandbox': 'https://api.sandbox.ebay.com', 'produktion': 'https://api.ebay.com'}
SCOPES = 'https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account'
# Nur Eigenschaften aus dem Lexikon; fehlt ein Wert, bleibt das Merkmal weg (nie erfinden).
MERKMALE = {
    'Material': ('fasermaterial', 'material'),
    'Florhöhe': ('florhoehe',),
    'Rückenmaterial': ('ruecken',),
    'Gesamtstärke': ('gesamtstaerke',),
    'Nutzungsklasse': ('nutzungsklasse',),
    'Geeignet für': ('zimmer',),
}
BESCHREIBUNG = dict(MERKMALE, **{'Fußbodenheizung': ('fussbodenheizung',), 'Brandverhalten': ('brandverhalten',)})


class Abbruch(Exception):
    pass


def privat_ordner():
    return os.environ.get('TP_PRIVAT_DIR') or os.path.expanduser('~/teppich-paradies-analyse')


def zahl(wert):
    return wert if isinstance(wert, (int, float)) and not isinstance(wert, bool) else None


def lies_startliste(pfad):
    """Liest berechnete Werte. Ohne berechnete Werte (Datei nie geoeffnet) bleiben die Zellen leer."""
    import openpyxl

    mappe = openpyxl.load_workbook(pfad, data_only=True)
    annahmen = mappe['Annahmen']
    aufschlag = zahl(annahmen['B9'].value) or 0
    ziel = zahl(annahmen['B8'].value)
    provision = zahl(annahmen['B5'].value)
    steuer = zahl(annahmen['B6'].value)
    fest = zahl(annahmen['B7'].value)
    kettel_klein = zahl(annahmen['B10'].value)
    kettel_gross = zahl(annahmen['B11'].value)
    welle1 = []
    for z in mappe[BLATT_WELLE_1].iter_rows(min_row=5, values_only=True):
        if z[0] and z[0] != 'Summe':
            welle1.append({'rolle': z[0], 'breite': z[2], 'restlaenge': z[3], 'bestand': z[4], 'preis': z[6], 'einkauf': z[8]})
    welle2 = []
    for z in mappe[BLATT_WELLE_2].iter_rows(min_row=5, values_only=True):
        if z[0]:
            welle2.append({'produkt': z[0], 'status': z[13]})
    return {'aufschlag': aufschlag, 'ziel': ziel, 'provision': provision, 'steuer': steuer, 'fest': fest,
            'kettel_klein': kettel_klein, 'kettel_gross': kettel_gross, 'welle1': welle1, 'welle2': welle2}


def lies_lexikon(pfad):
    with open(pfad, encoding='utf-8') as datei:
        return [p for p in json.load(datei)['produkte'] if p.get('status') == 'ACTIVE']


def tags(produkt):
    return (produkt.get('musterRegeln') or {}).get('tags') or []


def eigene_sku(variante):
    """Neutrale SKU: Lieferanten-Artikelnummern gehoeren nicht zu eBay."""
    return 'TP-' + variante['id'].rsplit('/', 1)[-1]


def gruppen_schluessel(produkt):
    return 'TPG-' + produkt['adminUrl'].rsplit('/', 1)[-1]


def wert(eigenschaften, schluessel):
    for k in schluessel:
        v = eigenschaften.get(k)
        if v not in (None, ''):
            return str(v).replace('\xa0', ' ')
    return None


def merkmale(produkt, konfig, maengel):
    eig = produkt.get('eigenschaften') or {}
    ergebnis = {}
    for name, schluessel in MERKMALE.items():
        v = wert(eig, schluessel)
        if v:
            ergebnis[name] = [v[:65]]
    marke = eig.get('marke') or konfig.get('marke_ersatz')
    if marke:
        ergebnis['Marke'] = [str(marke)]
    else:
        maengel.append('Marke fehlt (Lexikon oder marke_ersatz in der Konfiguration)')
    ergebnis['Produktart'] = ['Teppichboden']
    return ergebnis


STIL_KASTEN = 'border:1px solid #d9d4cc;border-radius:6px;padding:12px 16px;margin:16px 0'
STIL_ZEILE = 'padding:6px 12px 6px 0;border-bottom:1px solid #eee;vertical-align:top'


def _abschnitt(ueberschrift, inhalt):
    return f'<h3 style="font-size:17px;margin:20px 0 6px">{html.escape(ueberschrift)}</h3>{inhalt}'


VERSAND_BODEN = ('Kostenloser Versand innerhalb Deutschlands. '
                 'Der Teppichboden kommt gerollt: bis 2 m Länge als Paket, größere Stücke per Spedition.')
VERSAND_KETTEL = ('Kostenloser Versand innerhalb Deutschlands. Der Teppich wird nach Ihrer Bestellung zugeschnitten, '
                  'rundum gekettelt und gerollt verschickt, kleinere Größen als Paket, ab 2 m Breite per Spedition.')


def beschreibung(produkt, zusatz, eckdaten=None, bestellen=None, kopf=None, versand=VERSAND_BODEN):
    """eBay-Beschreibung: Kopf, Eckdaten als Tabelle, Bestellen, Versand, Zuschnitt-Hinweis.

    Nur Werte aus dem Lexikon und der Startliste - fehlt ein Wert, faellt die Zeile weg (nie erfinden).
    Der Anwaltshinweis HINWEIS_ZUSCHNITT steht woertlich und unveraendert im Kasten.
    """
    eig = produkt.get('eigenschaften') or {}
    zeilen = list((eckdaten or {}).items()) + [
        (n, v) for n, s in BESCHREIBUNG.items() for v in [wert(eig, s)] if v
    ]
    teile = ['<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:760px">']
    if kopf:
        teile.append(f'<h2 style="font-size:21px;margin:0 0 8px">{html.escape(kopf)}</h2>')
    teile += [f'<p style="margin:0 0 10px">{html.escape(t)}</p>' for t in zusatz]
    if zeilen:
        tabelle = ''.join(
            f'<tr><td style="{STIL_ZEILE};color:#666;white-space:nowrap">{html.escape(n)}</td>'
            f'<td style="{STIL_ZEILE}">{html.escape(v)}</td></tr>'
            for n, v in zeilen
        )
        teile.append(_abschnitt('Auf einen Blick', f'<table style="border-collapse:collapse;width:100%">{tabelle}</table>'))
    if bestellen:
        punkte = ''.join(f'<li style="margin:0 0 4px">{html.escape(t)}</li>' for t in bestellen)
        teile.append(_abschnitt('So bestellen Sie', f'<ul style="margin:0;padding-left:20px">{punkte}</ul>'))
    teile.append(_abschnitt('Versand', f'<p style="margin:0">{html.escape(versand)}</p>'))
    teile.append(f'<div style="{STIL_KASTEN};background:#faf8f5"><strong>Wichtig: Zuschnitt</strong><br>{html.escape(HINWEIS_ZUSCHNITT)}</div>')
    teile.append('<p style="margin:16px 0 0;color:#666;font-size:13px">Teppich Paradies Oranienburg – Ihr Fachhandel für Teppichboden.</p>')
    teile.append('</div>')
    return ''.join(teile)


def titel(name, breite):
    grund = re.sub(r'\s+–.*$', '', name)
    grund = re.sub(r'\s+Teppichboden.*$', '', grund)
    teile = f'{grund} Teppichboden Meterware'
    voll = f'{teile} {breite} cm breit' if breite else teile
    return (voll if len(voll) <= MAX_TITEL else teile)[:MAX_TITEL]


def angebot_grund(sku, preis, menge, kategorie, text, konfig):
    return {
        'sku': sku,
        'marketplaceId': MARKTPLATZ,
        'format': 'FIXED_PRICE',
        'availableQuantity': menge,
        'categoryId': kategorie,
        'listingDescription': text,
        'listingDuration': 'GTC',
        'listingPolicies': {k: konfig.get(k, '') for k in KONFIG_PFLICHT[:3]},
        'merchantLocationKey': konfig.get('merchantLocationKey', ''),
        'pricingSummary': {'price': {'value': f'{preis:.2f}', 'currency': 'EUR'}},
    }


def artikel(ueberschrift, text, bilder, aspekte, menge):
    return {
        'condition': 'NEW',
        'availability': {'shipToLocationAvailability': {'quantity': menge}},
        'product': {'title': ueberschrift, 'description': text, 'aspects': aspekte, 'imageUrls': bilder[:MAX_BILDER]},
    }


def bilder_von(produkt, varianten):
    gesehen = []
    for url in [produkt.get('bild')] + [v.get('bild') for v in varianten]:
        if url and url.startswith('https://') and url not in gesehen:
            gesehen.append(url)
    return gesehen


def versandkosten(breite_cm, laenge_cm, konfig):
    """Gerollt wird ueber die kuerzere Seite; die entscheidet ueber den Versandweg."""
    kurz = min(breite_cm, laenge_cm)
    if kurz <= GRENZE_GLS_CM:
        return konfig['versand_gls_kosten']
    if kurz <= GRENZE_STANDARD_CM:
        return konfig['versand_spedition_kosten']
    return konfig['versand_xxl_kosten']


def nettofaktor(liste):
    return 1 / (1 + liste['steuer']) - liste['provision']


def stueckmarge(preis_m2, flaeche, kosten, einkauf, liste):
    return preis_m2 * flaeche * nettofaktor(liste) - liste['fest'] - einkauf * flaeche - kosten


def mischpreis(listenpreis, breite_cm, laengen, einkauf, liste, konfig):
    """Ein Preis je m² fuer alle Laengen: Kleine Stuecke tragen die teure Fracht mit.

    Der Schnitt ueber alle Laengen erreicht die Zielmarge, kein Stueck faellt unter
    die Mindestmarge. Der Preis faellt nie unter den Listenpreis.
    """
    faktor = nettofaktor(liste)
    mindest = konfig.get('stueck_mindestmarge', 0)
    bedarf_stueck, bedarf_schnitt = 0, 0
    for laenge in laengen:
        flaeche = breite_cm * laenge / 10000
        kosten = versandkosten(breite_cm, laenge, konfig) + liste['fest']
        bedarf_stueck = max(bedarf_stueck, (mindest + kosten) / flaeche + einkauf)
        bedarf_schnitt += kosten / flaeche
    bedarf_schnitt = bedarf_schnitt / len(laengen) + einkauf + liste['ziel']
    noetig = max(bedarf_stueck, bedarf_schnitt) / faktor
    if noetig <= listenpreis:
        return listenpreis
    return math.ceil((noetig + 0.05) * 2) / 2 - 0.05


def euro(wert):
    return f'{wert:.2f}'.replace('.', ',')


def text_laenge(cm):
    return f'{cm / 100:.2f} m'.replace('.', ',')


def rollen_mangel(zeile, konfig, liste):
    maengel = []
    if zahl(zeile['einkauf']) is None:
        maengel.append('Einkauf fehlt in der Startliste')
    if zahl(zeile['preis']) is None or None in (liste['ziel'], liste['provision'], liste['steuer'], liste['fest']):
        maengel.append('Werte nicht berechnet: Startliste in Excel öffnen und speichern')
    maengel += [f'{k} fehlt in der Konfiguration' for k in VERSAND_FELDER if zahl(konfig.get(k)) is None]
    return maengel


def finde_rolle(name, lexikon):
    return [
        p for p in lexikon
        if p['produktgruppe'] == 'Teppichboden' and 'sonderposten' in tags(p) and p['titel'].startswith(name)
    ]


def plane_welle1(liste, lexikon, konfig):
    plan = []
    for zeile in liste['welle1']:
        name = zeile['rolle']
        maengel = rollen_mangel(zeile, konfig, liste)
        treffer = finde_rolle(name, lexikon)
        if len(treffer) != 1:
            plan.append({'name': name, 'art': 'gruppe', 'maengel': maengel + [f'{len(treffer)} Treffer im Lexikon']})
            continue
        produkt = treffer[0]
        variante = produkt['varianten'][0]
        # Fehlt ein Wert, ist nichts ueber den Bestand bekannt: das ist kein Ausverkauf
        if zahl(zeile['restlaenge']) is None or zahl(zeile['bestand']) is None:
            plan.append({'name': name, 'art': 'gruppe', 'maengel': maengel + ['Bestand oder Restlänge fehlt in der Startliste']})
            continue
        breite = int(zeile['breite'])
        rest_cm = min(zeile['restlaenge'], zeile['bestand'] * 10000 / breite)
        laengen = [l for l in LAENGEN_CM if l <= rest_cm]
        if not laengen:
            plan.append({'name': name, 'art': 'gruppe', 'schluessel': gruppen_schluessel(produkt), 'maengel': maengel + [KEIN_BESTAND]})
            continue
        if maengel:
            preis_m2 = zahl(zeile['preis']) or 0
        else:
            preis_m2 = mischpreis(zeile['preis'], breite, laengen, zeile['einkauf'], liste, konfig)
        posten, angebote, margen = {}, [], []
        aspekte = merkmale(produkt, konfig, maengel)
        ueberschrift = titel(name, breite)
        bilder = bilder_von(produkt, [variante])
        if not bilder:
            maengel.append('kein Bild')
        for laenge in laengen:
            flaeche = breite * laenge / 10000
            preis = round(preis_m2 * flaeche, 2)
            if not rollen_mangel(zeile, konfig, liste):
                margen.append((laenge, stueckmarge(preis_m2, flaeche, versandkosten(breite, laenge, konfig), zeile['einkauf'], liste)))
        text = beschreibung(
            produkt,
            ['Restposten direkt von der Rolle: Wir schneiden Ihr Stück in der gewünschten Länge zu.'],
            eckdaten={
                'Rollenbreite': text_laenge(breite),
                'Preis': f'{euro(preis_m2)} EUR je m²',
                'Längen': f'{text_laenge(laengen[0])} bis {text_laenge(laengen[-1])}',
            },
            bestellen=[
                f'Länge auswählen: Die Breite ist immer {text_laenge(breite)}, den Preis zeigt eBay bei jeder Länge.',
                f'Beispiel: {text_laenge(breite)} × {text_laenge(laengen[0])} = {euro(breite * laengen[0] / 10000)} m² für {euro(round(preis_m2 * breite * laengen[0] / 10000, 2))} EUR.',
                f'Anderes Maß oder länger als {text_laenge(laengen[-1])}? Schreiben Sie uns über eBay, wir erstellen ein passendes Angebot.',
            ],
            kopf=ueberschrift,
        )
        for laenge in laengen:
            flaeche = breite * laenge / 10000
            sku = f'{eigene_sku(variante)}-L{laenge}'
            menge = int(rest_cm // laenge)
            posten[sku] = artikel(ueberschrift, text, bilder, dict(aspekte, Länge=[text_laenge(laenge)]), menge)
            angebote.append(angebot_grund(sku, round(preis_m2 * flaeche, 2), menge, KATEGORIE_TEPPICHBODEN, text, konfig))
        eintrag = {
            'name': name, 'art': 'gruppe', 'maengel': maengel, 'schluessel': gruppen_schluessel(produkt),
            'artikel': posten, 'angebote': angebote,
            'gruppe': {
                'title': ueberschrift, 'description': text, 'aspects': aspekte, 'imageUrls': bilder[:MAX_BILDER],
                'variantSKUs': list(posten),
                'variesBy': {'specifications': [{'name': 'Länge', 'values': [text_laenge(l) for l in laengen]}]},
            },
        }
        if margen:
            eintrag['rechnung'] = {
                'listenpreis_m2': zeile['preis'], 'mischpreis_m2': preis_m2,
                'schnitt_marge_m2': round(sum(m / (breite * l / 10000) for l, m in margen) / len(margen), 2),
                'kleinste_marge_stueck': round(min(m for _, m in margen), 2),
            }
        plan.append(eintrag)
    return plan


def kettel_kosten(breite_cm, laenge_cm, liste):
    """Ketteln rundum, Preis je laufendem Meter laut Rechnung des Kettlers (Startliste, Annahmen)."""
    flaeche = breite_cm * laenge_cm / 10000
    satz = liste['kettel_klein'] if flaeche <= 6 else liste['kettel_gross']
    return 2 * (breite_cm + laenge_cm) / 100 * satz


def finde_kettel(zeile, rolle, lexikon, konfig):
    """Kettelprodukt im Shop zur Rolle: gleicher restvorlage-Tag, sonst gleicher Namensanfang, sonst Zuordnung in der Konfiguration."""
    kandidaten = [p for p in lexikon if p['produktgruppe'] == 'Teppich nach Maß' and 'gekettelt' in tags(p)]
    vorlage = [t for t in tags(rolle) if t.startswith('restvorlage:')]
    treffer = [p for p in kandidaten if vorlage and vorlage[0] in tags(p)]
    if not treffer:
        treffer = [p for p in kandidaten if p['titel'].startswith(zeile['rolle'])]
    if not treffer:
        handle = (konfig.get('kettel_zuordnung') or {}).get(zeile['rolle'])
        treffer = [p for p in kandidaten if handle and p['handle'] == handle]
    return treffer


def kettel_titel(name, groessen=()):
    grund = re.sub(r'\s+–.*$', '', name)
    spanne = f' {groessen[0][0]}x{groessen[0][1]} bis {groessen[-1][0]}x{groessen[-1][1]} cm' if len(groessen) > 1 else ''
    voll = f'{grund} Teppich gekettelt{spanne}'
    return (voll if len(voll) <= MAX_TITEL else f'{grund} Teppich gekettelt')[:MAX_TITEL]


def plane_kettel(liste, lexikon, konfig):
    """Je Rolle ein Angebot mit gekettelten Standardgroessen. Preis je m² wie der Kettelteppich im Shop.

    Groessen, die nach Ketteln, Versand, Gebuehren und Einkauf unter der Mindestmarge laegen, fallen weg.
    """
    plan = []
    versand = konfig.get('versand_kettel') or {}
    mindest = konfig.get('stueck_mindestmarge', 0)
    for zeile in liste['welle1']:
        name = zeile['rolle']
        maengel = rollen_mangel(zeile, konfig, liste)
        if None in (liste.get('kettel_klein'), liste.get('kettel_gross')):
            maengel.append('Kettelkosten fehlen in der Startliste (Annahmen B10/B11)')
        rollen = finde_rolle(name, lexikon)
        kettel = finde_kettel(zeile, rollen[0], lexikon, konfig) if len(rollen) == 1 else []
        if len(kettel) != 1:
            plan.append({'name': f'{name} gekettelt', 'art': 'gruppe', 'maengel': maengel + [f'{len(kettel)} Kettelprodukte im Lexikon']})
            continue
        # Gleiche Ware wie die Rolle: fehlende Eigenschaften kommen von der Rolle, eigene haben Vorrang
        produkt = dict(kettel[0], eigenschaften={**(rollen[0].get('eigenschaften') or {}), **(kettel[0].get('eigenschaften') or {})})
        variante = produkt['varianten'][0]
        einheit = variante.get('preisJeEinheit') or {}
        preis_m2 = einheit.get('betrag') if einheit.get('einheit') == 'm2' else None
        if not preis_m2:
            maengel.append('Kettelpreis je m² fehlt im Lexikon')
        breite = zeile['breite']
        rest_cm = min(zahl(zeile['restlaenge']) or 0, (zahl(zeile['bestand']) or 0) * 10000 / breite)
        groessen, verworfen = [], []
        for b, l in KETTEL_GROESSEN:
            if b > breite or l > rest_cm:
                continue
            fracht = versand.get(f'{b}x{l}')
            if fracht is None:
                maengel.append(f'Versandkosten für {b}x{l} fehlen (versand_kettel)')
                continue
            flaeche = b * l / 10000
            preis = round((preis_m2 or 0) * flaeche, 2)
            marge = None
            if not maengel:
                marge = stueckmarge(preis_m2, flaeche, fracht + kettel_kosten(b, l, liste), zeile['einkauf'], liste)
                if marge < mindest:
                    verworfen.append(f'{b}x{l}')
                    continue
            groessen.append((b, l, preis, marge))
        if not groessen and not maengel:
            maengel.append('keine Größe über der Mindestmarge')
        ueberschrift = kettel_titel(name, groessen)
        aspekte = merkmale(produkt, konfig, maengel)
        aspekte['Produktart'] = ['Teppich']
        bilder = bilder_von(produkt, [variante])
        if not bilder:
            maengel.append('kein Bild')
        text = beschreibung(
            produkt,
            ['Restposten von der Rolle, für Sie zugeschnitten und rundum gekettelt (eingefasst), damit nichts ausfranst.'],
            eckdaten={
                'Preis': f'{euro(preis_m2 or 0)} EUR je m²',
                'Größen': ', '.join(f'{b} × {l} cm' for b, l, _, _ in groessen),
                'Kante': 'rundum gekettelt',
            },
            bestellen=[
                'Größe auswählen: Den Preis zeigt eBay bei jeder Größe.',
                'Wunschmaß? Schreiben Sie uns über eBay, wir erstellen Ihnen ein eigenes Angebot für genau Ihr Maß.',
            ],
            kopf=ueberschrift,
            versand=VERSAND_KETTEL,
        )
        posten, angebote = {}, []
        for b, l, preis, _ in groessen:
            sku = f'{eigene_sku(variante)}-K{b}X{l}'
            menge = max(1, min(KETTEL_MENGE, (breite // b) * int(rest_cm // l)))
            groesse = f'{b} x {l} cm'
            posten[sku] = artikel(ueberschrift, text, bilder, dict(aspekte, Größe=[groesse]), menge)
            angebote.append(angebot_grund(sku, preis, menge, KATEGORIE_TEPPICHE, text, konfig))
        eintrag = {
            'name': f'{name} gekettelt', 'art': 'gruppe', 'maengel': maengel, 'schluessel': gruppen_schluessel(produkt),
            'artikel': posten, 'angebote': angebote,
            'gruppe': {
                'title': ueberschrift, 'description': text, 'aspects': aspekte, 'imageUrls': bilder[:MAX_BILDER],
                'variantSKUs': list(posten),
                'variesBy': {'specifications': [{'name': 'Größe', 'values': [f'{b} x {l} cm' for b, l, _, _ in groessen]}]},
            },
        }
        if not maengel:
            eintrag['rechnung'] = {
                'kettel_m2': preis_m2, 'verworfen': verworfen,
                'margen': {f'{b}x{l}': round(m, 2) for b, l, _, m in groessen},
            }
        plan.append(eintrag)
    return plan


def plane_einzelmass(liste, lexikon, konfig, name, breite_cm, laenge_cm, preis, frachtkosten, kettel=False):
    """Einmaliges Angebot auf Kundenanfrage, auch ueber 6 m; mit kettel=True rundum gekettelt."""
    treffer = [z for z in liste['welle1'] if name.lower() in z['rolle'].lower()]
    if len(treffer) != 1:
        raise Abbruch(f'{len(treffer)} Rollen passen zu "{name}"')
    zeile = treffer[0]
    if not all(math.isfinite(w) and w > 0 for w in (breite_cm, laenge_cm, preis)):
        raise Abbruch('Breite, Länge und Preis müssen größer als null sein')
    if not (math.isfinite(frachtkosten) and frachtkosten >= 0):
        raise Abbruch('Frachtkosten dürfen nicht negativ sein')
    maengel = rollen_mangel(zeile, dict(konfig, **{k: 0 for k in VERSAND_FELDER}), liste)
    gefunden = finde_rolle(zeile['rolle'], lexikon)
    if len(gefunden) != 1:
        raise Abbruch(f"{len(gefunden)} Treffer im Lexikon für {zeile['rolle']}")
    if breite_cm > zeile['breite']:
        raise Abbruch('Breite ist größer als die Rolle')
    if laenge_cm > min(zahl(zeile['restlaenge']) or 0, (zahl(zeile['bestand']) or 0) * 10000 / zeile['breite']):
        raise Abbruch('So viel Länge ist nicht mehr auf der Rolle')
    flaeche = breite_cm * laenge_cm / 10000
    marge = None
    if not maengel:
        kosten = frachtkosten + (kettel_kosten(breite_cm, laenge_cm, liste) if kettel else 0)
        marge = stueckmarge(preis / flaeche, flaeche, kosten, zeile['einkauf'], liste)
        if marge < konfig.get('stueck_mindestmarge', 0):
            maengel.append(f'Marge {marge:.2f} EUR unter der Mindestmarge')
    produkt = gefunden[0]
    kategorie = KATEGORIE_TEPPICHBODEN
    if kettel:
        passend = finde_kettel(zeile, produkt, lexikon, konfig)
        if len(passend) != 1:
            raise Abbruch(f"{len(passend)} Kettelprodukte im Lexikon für {zeile['rolle']}")
        produkt, kategorie = passend[0], KATEGORIE_TEPPICHE
    variante = produkt['varianten'][0]
    sku = f"{eigene_sku(variante)}-{'K' if kettel else 'E'}{breite_cm}X{laenge_cm}"
    aspekte = merkmale(produkt, konfig, maengel)
    if kettel:
        aspekte['Produktart'] = ['Teppich']
        groesse = f'{breite_cm} x {laenge_cm} cm'
        text = beschreibung(produkt, [f'Gekettelter Teppich nach Ihrer Anfrage: {groesse}, {euro(flaeche)} m². Restposten, rundum gekettelt.'],
                            kopf=f"{re.sub(r'\s+–.*$', '', zeile['rolle'])} Teppich gekettelt {groesse}", versand=VERSAND_KETTEL)
        ueberschrift = kettel_titel(zeile['rolle']).split(' Teppich gekettelt')[0][:MAX_TITEL - len(groesse) - 19] + ' Teppich gekettelt ' + groesse
    else:
        groesse = f'{text_laenge(breite_cm)} × {text_laenge(laenge_cm)}'
        text = beschreibung(produkt, [f'Zuschnitt nach Ihrer Anfrage: {groesse}, {euro(flaeche)} m². Restposten.'])
        ueberschrift = titel(zeile['rolle'], None)[:MAX_TITEL - len(groesse) - 1] + ' ' + groesse
    bilder = bilder_von(produkt, [variante])
    if not bilder:
        maengel.append('kein Bild')
    return [{
        'name': f"{zeile['rolle']} {groesse}", 'art': 'einzel', 'maengel': maengel, 'schluessel': sku,
        'artikel': {sku: artikel(ueberschrift, text, bilder, dict(aspekte, **({'Größe': [groesse]} if kettel else {'Länge': [text_laenge(laenge_cm)]})), 1)},
        'angebote': [angebot_grund(sku, preis, 1, kategorie, text, konfig)],
        'rechnung': {'marge_stueck': None if marge is None else round(marge, 2)},
    }]


def kategorie_fuer(produkt, konfig, maengel):
    if 'art: teppichfliese' in tags(produkt):
        k = konfig.get('kategorie_teppichfliesen')
        if not k:
            maengel.append('Kategorie für Teppichfliesen fehlt (kategorie_teppichfliesen)')
        return k or ''
    return KATEGORIE_TEPPICHBODEN


def plane_welle2(liste, lexikon, konfig):
    plan = []
    menge = int(konfig.get('menge_bestellware') or 0)
    for zeile in liste['welle2']:
        if zeile['status'] != 'Welle 2':
            continue
        name = zeile['produkt']
        maengel = []
        if menge < 1:
            maengel.append('menge_bestellware fehlt in der Konfiguration')
        treffer = [p for p in lexikon if p['produktgruppe'] == 'Teppichboden' and p['titel'] == name]
        if len(treffer) != 1:
            plan.append({'name': name, 'art': 'gruppe', 'maengel': maengel + [f'{len(treffer)} Treffer im Lexikon']})
            continue
        produkt = treffer[0]
        varianten = []
        for v in produkt['varianten']:
            einheit = v.get('preisJeEinheit') or {}
            if v.get('verfuegbar') and einheit.get('einheit') == 'm2' and einheit.get('betrag') and einheit['betrag'] <= PREIS_GRENZE:
                varianten.append(v)
        if not varianten:
            plan.append({'name': name, 'art': 'gruppe', 'maengel': maengel + ['keine Variante bis 45 EUR/m²']})
            continue
        if len(varianten) > MAX_VARIANTEN:
            maengel.append(f'{len(varianten)} Varianten, eBay erlaubt {MAX_VARIANTEN}')
        kategorie = kategorie_fuer(produkt, konfig, maengel)
        aspekte = merkmale(produkt, konfig, maengel)
        text = beschreibung(produkt, ['Die Menge beim Kauf ist die Fläche in m².'])
        ueberschrift = titel(name, None)
        posten, angebote, farben, breiten = {}, [], [], []
        for v in varianten:
            sku = eigene_sku(v)
            farbe = v.get('farbe') or 'Standard'
            breite = f"{int(v['rollenbreiteM'] * 100)} cm" if v.get('rollenbreiteM') else 'Standard'
            farben += [farbe] if farbe not in farben else []
            breiten += [breite] if breite not in breiten else []
            eigene = dict(aspekte, Farbe=[farbe], Breite=[breite])
            preis = round(v['preisJeEinheit']['betrag'] * (1 + liste['aufschlag']), 2)
            posten[sku] = artikel(ueberschrift, text, bilder_von({}, [v]) or bilder_von(produkt, []), eigene, menge)
            angebote.append(angebot_grund(sku, preis, menge, kategorie, text, konfig))
        bilder = bilder_von(produkt, varianten)
        if not bilder:
            maengel.append('kein Bild')
        schluessel = gruppen_schluessel(produkt)
        plan.append({
            'name': name, 'art': 'gruppe', 'maengel': maengel, 'schluessel': schluessel,
            'artikel': posten, 'angebote': angebote,
            'gruppe': {
                'title': ueberschrift, 'description': text, 'aspects': aspekte, 'imageUrls': bilder[:MAX_BILDER],
                'variantSKUs': list(posten),
                'variesBy': {
                    'aspectsImageVariesBy': ['Farbe'],
                    'specifications': [{'name': 'Farbe', 'values': farben}, {'name': 'Breite', 'values': breiten}],
                },
            },
        })
    return plan


def verbotene_namen(ordner):
    """Dieselbe Liste wie der Masstepich-Guard. Fail closed: ohne Liste keine Sendung."""
    roh = os.environ.get('TP_LIEFERANTEN_NAMEN', '')
    if roh:
        return [n.strip().lower() for n in roh.split(',') if n.strip()]
    pfad = os.path.join(ordner, 'kettelservice', 'masstepich-konfig.json')
    if not os.path.exists(pfad):
        return []
    with open(pfad, encoding='utf-8') as datei:
        return [str(n).strip().lower() for n in json.load(datei).get('lieferantennamen') or [] if str(n).strip()]


def namens_fund(eintrag, namen):
    inhalt = json.dumps({k: eintrag.get(k) for k in ('artikel', 'angebote', 'gruppe')}, ensure_ascii=False).lower()
    return [n for n in namen if n in inhalt]


class Ebay:
    """Duenne Huelle um die Inventory-API. oeffnen ist austauschbar, damit Tests ohne Netz laufen."""

    def __init__(self, umgebung, zugang, oeffnen=urllib.request.urlopen):
        self.basis = BASIS[umgebung]
        self.zugang = zugang
        self.oeffnen = oeffnen
        self.token = None

    def anmelden(self):
        paar = f"{self.zugang['EBAY_CLIENT_ID']}:{self.zugang['EBAY_CLIENT_SECRET']}".encode()
        daten = urllib.parse.urlencode({
            'grant_type': 'refresh_token', 'refresh_token': self.zugang['EBAY_REFRESH_TOKEN'], 'scope': SCOPES,
        }).encode()
        anfrage = urllib.request.Request(self.basis + '/identity/v1/oauth2/token', data=daten, method='POST', headers={
            'Authorization': 'Basic ' + base64.b64encode(paar).decode(),
            'Content-Type': 'application/x-www-form-urlencoded',
        })
        with self.oeffnen(anfrage) as antwort:
            self.token = json.loads(antwort.read())['access_token']

    def rufe(self, methode, pfad, inhalt=None, erlaubt=()):
        if not self.token:
            self.anmelden()
        daten = None if inhalt is None else json.dumps(inhalt).encode()
        anfrage = urllib.request.Request(self.basis + pfad, data=daten, method=methode, headers={
            'Authorization': 'Bearer ' + self.token,
            'Content-Type': 'application/json',
            'Content-Language': 'de-DE',
            'Accept-Language': 'de-DE',
        })
        try:
            with self.oeffnen(anfrage) as antwort:
                roh = antwort.read()
        except urllib.error.HTTPError as fehler:
            if fehler.code in erlaubt:
                return None
            raise Abbruch(f'{methode} {pfad}: HTTP {fehler.code}: {fehler.read().decode(errors="replace")[:800]}')
        return json.loads(roh) if roh else {}

    def angebot(self, sku):
        pfad = f'/sell/inventory/v1/offer?sku={urllib.parse.quote(sku, safe="")}&marketplace_id={MARKTPLATZ}'
        antwort = self.rufe('GET', pfad, erlaubt=(404,))
        angebote = (antwort or {}).get('offers') or []
        return angebote[0] if angebote else None

    def varianten(self, schluessel):
        antwort = self.rufe('GET', f'/sell/inventory/v1/inventory_item_group/{schluessel}', erlaubt=(404,))
        return (antwort or {}).get('variantSKUs') or []

    def menge_null(self, skus):
        for start in range(0, len(skus), MAX_MENGEN_JE_AUFRUF):
            teil = skus[start:start + MAX_MENGEN_JE_AUFRUF]
            antwort = self.rufe('POST', '/sell/inventory/v1/bulk_update_price_quantity', {
                'requests': [{'sku': s, 'shipToLocationAvailability': {'quantity': 0}} for s in teil],
            })
            # Teilfehler kommen als 207 mit Status je Artikel
            fehler = [r.get('sku') for r in antwort.get('responses') or [] if r.get('statusCode') != 200]
            if fehler:
                raise Abbruch('Menge nicht auf null gesetzt: ' + ', '.join(map(str, fehler)))


def sende(eintrag, ebay, veroeffentlichen):
    """Legt an oder aktualisiert. Zweimal laufen lassen erzeugt keine Doppel."""
    bisher = ebay.varianten(eintrag['schluessel']) if eintrag['art'] == 'gruppe' else []
    vorhanden = {s: ebay.angebot(s) for s in [*(a['sku'] for a in eintrag['angebote']), *bisher]}
    live = {o['offerId'] for o in vorhanden.values() if o and o.get('status') == 'PUBLISHED'}
    # Jede Aenderung an Artikel oder Angebot wirkt auf ein Live-Angebot sofort
    if live and not veroeffentlichen:
        raise Abbruch(f"{eintrag['name']} ist schon live: Änderungen nur mit --veroeffentlichen")
    ebay.menge_null([s for s in bisher if s not in eintrag['artikel']])
    ids = []
    for sku, inhalt in eintrag['artikel'].items():
        ebay.rufe('PUT', f'/sell/inventory/v1/inventory_item/{urllib.parse.quote(sku, safe="")}', inhalt)
    if eintrag['art'] == 'gruppe':
        ebay.rufe('PUT', f"/sell/inventory/v1/inventory_item_group/{eintrag['schluessel']}", eintrag['gruppe'])
    for angebot in eintrag['angebote']:
        alt = vorhanden[angebot['sku']]
        if alt:
            ebay.rufe('PUT', f"/sell/inventory/v1/offer/{alt['offerId']}", angebot)
            ids.append(alt['offerId'])
        else:
            ids.append(ebay.rufe('POST', '/sell/inventory/v1/offer', angebot)['offerId'])
    # Gebuehren gibt eBay nur fuer noch nicht veroeffentlichte Angebote aus
    neu = [i for i in ids if i not in live]
    gebuehren = ebay.rufe('POST', '/sell/inventory/v1/offer/get_listing_fees', {'offers': [{'offerId': i} for i in neu[:250]]}) if neu else None
    ergebnis = {'schluessel': eintrag['schluessel'], 'offerIds': ids, 'gebuehren': gebuehren}
    if veroeffentlichen:
        if eintrag['art'] == 'gruppe':
            antwort = ebay.rufe('POST', '/sell/inventory/v1/offer/publish_by_inventory_item_group', {
                'inventoryItemGroupKey': eintrag['schluessel'], 'marketplaceId': MARKTPLATZ,
            })
        else:
            antwort = ebay.rufe('POST', f'/sell/inventory/v1/offer/{ids[0]}/publish', {})
        ergebnis['listingId'] = antwort.get('listingId')
    return ergebnis


def ausverkauft(eintrag, ebay):
    """Rolle ohne Bestand: vorhandene Angebote auf null, damit nichts mehr verkauft wird."""
    skus = ebay.varianten(eintrag['schluessel'])
    ebay.menge_null(skus)
    return skus


def rahmen_uebersicht(ebay):
    """Liest die IDs fuer ebay-konfig.json aus dem Konto, aendert nichts."""
    ergebnis = {}
    for feld, pfad, liste_name in (
        ('fulfillmentPolicyId', 'fulfillment_policy', 'fulfillmentPolicies'),
        ('paymentPolicyId', 'payment_policy', 'paymentPolicies'),
        ('returnPolicyId', 'return_policy', 'returnPolicies'),
    ):
        antwort = ebay.rufe('GET', f'/sell/account/v1/{pfad}?marketplace_id={MARKTPLATZ}')
        ergebnis[feld] = [(e['name'], e[feld]) for e in antwort.get(liste_name) or []]
    return ergebnis


def lege_standort_an(ebay, konfig):
    schluessel = konfig.get('merchantLocationKey')
    standort = konfig.get('standort') or {}
    fehlend = [k for k in ('city', 'postalCode') if not standort.get(k)]
    if not schluessel or fehlend:
        raise Abbruch('In ebay-konfig.json fehlt: ' + ', '.join((['merchantLocationKey'] if not schluessel else []) + [f'standort.{k}' for k in fehlend]))
    ebay.rufe('POST', f'/sell/inventory/v1/location/{urllib.parse.quote(schluessel, safe="")}', {
        'location': {'address': {'city': standort['city'], 'postalCode': standort['postalCode'], 'country': 'DE'}},
        'locationTypes': ['WAREHOUSE'],
        'merchantLocationStatus': 'ENABLED',
        'name': schluessel,
    })
    return schluessel


def lies_zugang(ordner):
    zugang = {k: os.environ.get(k, '') for k in ZUGANG_PFLICHT}
    pfad = os.path.join(ordner, 'ebay-zugang.env')
    if os.path.exists(pfad):
        with open(pfad, encoding='utf-8') as datei:
            for zeile in datei:
                if '=' in zeile and not zeile.lstrip().startswith('#'):
                    k, v = zeile.strip().split('=', 1)
                    if k in zugang and not zugang[k]:
                        zugang[k] = v
    return zugang


def lies_konfig(ordner):
    pfad = os.path.join(ordner, 'ebay-konfig.json')
    if not os.path.exists(pfad):
        return {}
    with open(pfad, encoding='utf-8') as datei:
        return json.load(datei)


def protokolliere(ordner, eintrag):
    pfad = os.path.join(ordner, UNTERORDNER, 'einstell-protokoll.jsonl')
    eintrag = dict(eintrag, zeit=datetime.datetime.now().isoformat(timespec='seconds'))
    with open(pfad, 'a', encoding='utf-8') as datei:
        datei.write(json.dumps(eintrag, ensure_ascii=False) + '\n')


def sendesperren(args, konfig, zugang, namen):
    sperren = []
    sperren += [f'Rahmenbedingung fehlt: {k}' for k in KONFIG_PFLICHT if not konfig.get(k)]
    sperren += [f'Zugang fehlt: {k}' for k in ZUGANG_PFLICHT if not zugang.get(k)]
    if not namen:
        sperren.append('Namensliste fehlt: TP_LIEFERANTEN_NAMEN oder kettelservice/masstepich-konfig.json')
    if args.veroeffentlichen and args.umgebung == 'produktion' and not args.rechtlich_geklaert:
        sperren.append('Veröffentlichen braucht --rechtlich-geklaert (Widerruf und Rücksendekosten durch den Inhaber geklärt)')
    return sperren


def einzelmass_breite(wert, treffer):
    if wert is not None:
        return wert
    return int(treffer[0]['breite']) if len(treffer) == 1 else 0


def positive_zahl(text):
    wert = int(text)
    if wert < 1:
        raise argparse.ArgumentTypeError('muss mindestens 1 sein')
    return wert


def hauptlauf(argv=None):
    p = argparse.ArgumentParser(description='Teppichboden aus der eBay-Startliste einstellen.')
    p.add_argument('--welle', type=int, choices=(1, 2))
    p.add_argument('--rahmen-zeigen', action='store_true', help='IDs der Rahmenbedingungen aus dem Konto lesen')
    p.add_argument('--standort-anlegen', action='store_true', help='Artikelstandort aus ebay-konfig.json bei eBay anlegen')
    p.add_argument('--nur', help='nur Produkte, deren Name diesen Text enthält')
    p.add_argument('--einzelmass', help='einmaliges Angebot auf Anfrage: Name der Rolle')
    p.add_argument('--kettel', action='store_true', help='gekettelte Teppiche statt Meterware (mit --welle 1 oder --einzelmass)')
    p.add_argument('--breite-cm', type=int)
    p.add_argument('--laenge-cm', type=int)
    p.add_argument('--preis', type=float, help='Gesamtpreis des Einzelmaßes in EUR')
    p.add_argument('--frachtkosten', type=float, help='eigene Versandkosten des Einzelmaßes in EUR')
    p.add_argument('--liste')
    p.add_argument('--lexikon')
    p.add_argument('--senden', action='store_true', help='Entwürfe bei eBay anlegen oder aktualisieren')
    p.add_argument('--veroeffentlichen', action='store_true', help='Angebote wirklich veröffentlichen')
    p.add_argument('--rechtlich-geklaert', action='store_true')
    p.add_argument('--umgebung', choices=tuple(BASIS), default='sandbox')
    p.add_argument('--max', type=positive_zahl, default=1, help='höchstens so viele Angebote je Lauf senden')
    args = p.parse_args(argv)
    if args.veroeffentlichen and not args.senden:
        raise Abbruch('--veroeffentlichen geht nur zusammen mit --senden')

    ordner = privat_ordner()
    if args.rahmen_zeigen or args.standort_anlegen:
        zugang = lies_zugang(ordner)
        fehlt = [k for k in ZUGANG_PFLICHT if not zugang.get(k)]
        if fehlt:
            raise Abbruch('Zugang fehlt: ' + ', '.join(fehlt))
        ebay = Ebay(args.umgebung, zugang)
        if args.standort_anlegen:
            print(f'Standort angelegt: {lege_standort_an(ebay, lies_konfig(ordner))}')
        if args.rahmen_zeigen:
            for feld, eintraege in rahmen_uebersicht(ebay).items():
                print(feld)
                for name, nummer in eintraege:
                    print(f'  {nummer}  {name}')
        return 0
    if not args.welle and not args.einzelmass:
        raise Abbruch('--welle 1, --welle 2 oder --einzelmass fehlt')
    if args.einzelmass and None in (args.laenge_cm, args.preis, args.frachtkosten):
        raise Abbruch('--einzelmass braucht --laenge-cm, --preis und --frachtkosten')
    liste_pfad = args.liste or os.path.join(ordner, UNTERORDNER, STARTLISTE)
    lexikon_pfad = args.lexikon or os.path.join(ordner, 'lexikon', 'produkte.json')
    konfig, zugang, namen = lies_konfig(ordner), lies_zugang(ordner), verbotene_namen(ordner)
    liste, lexikon = lies_startliste(liste_pfad), lies_lexikon(lexikon_pfad)
    if args.einzelmass:
        treffer = [z for z in liste['welle1'] if args.einzelmass.lower() in z['rolle'].lower()]
        breite = einzelmass_breite(args.breite_cm, treffer)
        plan = plane_einzelmass(liste, lexikon, konfig, args.einzelmass, breite, args.laenge_cm, args.preis, args.frachtkosten, args.kettel)
    elif args.kettel:
        if args.welle != 1:
            raise Abbruch('--kettel geht nur mit --welle 1')
        plan = plane_kettel(liste, lexikon, konfig)
    else:
        plan = (plane_welle1 if args.welle == 1 else plane_welle2)(liste, lexikon, konfig)
    if args.nur:
        plan = [e for e in plan if args.nur.lower() in e['name'].lower()]
    for eintrag in plan:
        fund = namens_fund(eintrag, namen)
        if fund:
            eintrag['maengel'].append(f'verbotener Name im Angebot ({len(fund)})')

    datei_name = 'einstellplan-einzelmass.json' if args.einzelmass else ('einstellplan-kettel.json' if args.kettel else f'einstellplan-welle{args.welle}.json')
    ziel = os.path.join(ordner, UNTERORDNER, datei_name)
    with open(ziel, 'w', encoding='utf-8') as datei:
        json.dump(plan, datei, ensure_ascii=False, indent=1)
    bereit = [e for e in plan if not e['maengel']]
    print(f'{"Einzelmaß" if args.einzelmass else f"Welle {args.welle}"}: {len(plan)} Angebote im Plan, {len(bereit)} bereit. Plan: {ziel}')
    for eintrag in plan:
        r = eintrag.get('rechnung')
        if r and 'mischpreis_m2' in r:
            print(f"  {eintrag['name']}: Liste {r['listenpreis_m2']:.2f}, Misch {r['mischpreis_m2']:.2f} EUR/m²; Schnitt {r['schnitt_marge_m2']:.2f} EUR/m², kleinstes Stück {r['kleinste_marge_stueck']:.2f} EUR")
        elif r and 'kettel_m2' in r:
            margen = ', '.join(f'{g} {m:.2f}' for g, m in r['margen'].items())
            weg = f"; ohne {', '.join(r['verworfen'])} (unter Mindestmarge)" if r['verworfen'] else ''
            print(f"  {eintrag['name']}: {r['kettel_m2']:.2f} EUR/m²; Marge je Stück {margen}{weg}")
        elif r and r.get('marge_stueck') is not None:
            print(f"  {eintrag['name']}: Marge {r['marge_stueck']:.2f} EUR")
    gruende = {}
    for eintrag in plan:
        for m in eintrag['maengel']:
            kurz = re.sub(r'\d+[.,]?\d*', '#', m)
            gruende[kurz] = gruende.get(kurz, 0) + 1
    for grund, anzahl in sorted(gruende.items(), key=lambda x: -x[1]):
        print(f'  {anzahl} × {grund}')

    sperren = sendesperren(args, konfig, zugang, namen)
    if not args.senden:
        print('Probelauf: nichts gesendet.')
        for s in sperren:
            print(f'  vor dem Senden nötig: {s}')
        return 0
    if sperren:
        raise Abbruch('Nicht gesendet:\n  ' + '\n  '.join(sperren))
    ebay = Ebay(args.umgebung, zugang)
    # Senkt nur Mengen, deshalb ohne --max und ohne Veroeffentlichungs-Freigabe
    for eintrag in plan:
        if KEIN_BESTAND in eintrag['maengel'] and eintrag.get('schluessel'):
            skus = ausverkauft(eintrag, ebay)
            if skus:
                protokolliere(ordner, {'name': eintrag['name'], 'umgebung': args.umgebung, 'auf_null': skus})
                print(f"  auf null gesetzt: {eintrag['name']}")
    for eintrag in bereit[:args.max]:
        ergebnis = sende(eintrag, ebay, args.veroeffentlichen)
        protokolliere(ordner, dict(ergebnis, name=eintrag['name'], umgebung=args.umgebung))
        print(f"  {'veröffentlicht' if args.veroeffentlichen else 'Entwurf'}: {eintrag['name']}")
    return 0


if __name__ == '__main__':
    try:
        sys.exit(hauptlauf())
    except Abbruch as fehler:
        print(fehler, file=sys.stderr)
        sys.exit(1)
