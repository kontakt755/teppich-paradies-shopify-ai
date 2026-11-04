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
UNTERORDNER = 'ebay-marktanalyse-2026-11'
STARTLISTE = 'eBay-Startliste-2026-11-04.xlsx'
BLATT_WELLE_1 = 'Welle 1 Sonderposten'
BLATT_WELLE_2 = 'Welle 2 bis 45 Euro'
KONFIG_PFLICHT = ('fulfillmentPolicyId', 'paymentPolicyId', 'returnPolicyId', 'merchantLocationKey')
ZUGANG_PFLICHT = ('EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN')
BASIS = {'sandbox': 'https://api.sandbox.ebay.com', 'produktion': 'https://api.ebay.com'}
SCOPES = 'https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly'
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
    aufschlag = zahl(mappe['Annahmen']['B9'].value) or 0
    ziel = zahl(mappe['Annahmen']['B8'].value)
    welle1 = []
    for z in mappe[BLATT_WELLE_1].iter_rows(min_row=5, values_only=True):
        if z[0] and z[0] != 'Summe':
            welle1.append({'rolle': z[0], 'bestand': z[4], 'preis': z[6], 'einkauf': z[8], 'marge': z[9]})
    welle2 = []
    for z in mappe[BLATT_WELLE_2].iter_rows(min_row=5, values_only=True):
        if z[0]:
            welle2.append({'produkt': z[0], 'status': z[13]})
    return {'aufschlag': aufschlag, 'ziel': ziel, 'welle1': welle1, 'welle2': welle2}


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


def beschreibung(produkt, zusatz):
    eig = produkt.get('eigenschaften') or {}
    zeilen = [f'<p>{html.escape(t)}</p>' for t in zusatz]
    punkte = [
        f'<li>{html.escape(n)}: {html.escape(v)}</li>'
        for n, s in BESCHREIBUNG.items()
        for v in [wert(eig, s)]
        if v
    ]
    if punkte:
        zeilen.append('<ul>' + ''.join(punkte) + '</ul>')
    return ''.join(zeilen)


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


def plane_welle1(liste, lexikon, konfig):
    plan = []
    for zeile in liste['welle1']:
        name = zeile['rolle']
        maengel = []
        if zahl(zeile['einkauf']) is None:
            maengel.append('Einkauf fehlt in der Startliste')
        elif zahl(zeile['marge']) is None:
            maengel.append('Marge nicht berechnet: Startliste in Excel öffnen und speichern')
        elif liste['ziel'] is not None and zeile['marge'] < liste['ziel']:
            maengel.append(f"Marge {zeile['marge']:.2f} unter Ziel {liste['ziel']:.2f}")
        menge = int(zahl(zeile['bestand']) or 0)
        if menge < 1:
            maengel.append('kein Bestand')
        treffer = [
            p for p in lexikon
            if p['produktgruppe'] == 'Teppichboden' and 'sonderposten' in tags(p) and p['titel'].startswith(name)
        ]
        if len(treffer) != 1:
            plan.append({'name': name, 'art': 'einzel', 'maengel': maengel + [f'{len(treffer)} Treffer im Lexikon']})
            continue
        produkt = treffer[0]
        variante = produkt['varianten'][0]
        breite = int(variante['rollenbreiteM'] * 100) if variante.get('rollenbreiteM') else None
        preis = zahl(zeile['preis'])
        if preis is None:
            maengel.append('Preis nicht berechnet: Startliste in Excel öffnen und speichern')
            preis = 0
        hinweis = f'Restposten, Bestand begrenzt auf {menge} m². Die Menge beim Kauf ist die Fläche in m².'
        if breite:
            hinweis += f' Rollenbreite {breite} cm.'
        text = beschreibung(produkt, [hinweis])
        aspekte = merkmale(produkt, konfig, maengel)
        ueberschrift = titel(name, breite)
        bilder = bilder_von(produkt, [variante])
        if not bilder:
            maengel.append('kein Bild')
        sku = eigene_sku(variante)
        plan.append({
            'name': name, 'art': 'einzel', 'maengel': maengel, 'schluessel': sku,
            'artikel': {sku: artikel(ueberschrift, text, bilder, aspekte, menge)},
            'angebote': [angebot_grund(sku, preis, menge, KATEGORIE_TEPPICHBODEN, text, konfig)],
        })
    return plan


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

    def offer_id(self, sku):
        pfad = f'/sell/inventory/v1/offer?sku={urllib.parse.quote(sku, safe="")}&marketplace_id={MARKTPLATZ}'
        antwort = self.rufe('GET', pfad, erlaubt=(404,))
        angebote = (antwort or {}).get('offers') or []
        return angebote[0]['offerId'] if angebote else None


def sende(eintrag, ebay, veroeffentlichen):
    """Legt an oder aktualisiert. Zweimal laufen lassen erzeugt keine Doppel."""
    ids = []
    for sku, inhalt in eintrag['artikel'].items():
        ebay.rufe('PUT', f'/sell/inventory/v1/inventory_item/{urllib.parse.quote(sku, safe="")}', inhalt)
    if eintrag['art'] == 'gruppe':
        ebay.rufe('PUT', f"/sell/inventory/v1/inventory_item_group/{eintrag['schluessel']}", eintrag['gruppe'])
    for angebot in eintrag['angebote']:
        vorhanden = ebay.offer_id(angebot['sku'])
        if vorhanden:
            ebay.rufe('PUT', f'/sell/inventory/v1/offer/{vorhanden}', angebot)
            ids.append(vorhanden)
        else:
            ids.append(ebay.rufe('POST', '/sell/inventory/v1/offer', angebot)['offerId'])
    gebuehren = ebay.rufe('POST', '/sell/inventory/v1/offer/get_listing_fees', {'offers': [{'offerId': i} for i in ids[:250]]})
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


def hauptlauf(argv=None):
    p = argparse.ArgumentParser(description='Teppichboden aus der eBay-Startliste einstellen.')
    p.add_argument('--welle', type=int, choices=(1, 2))
    p.add_argument('--rahmen-zeigen', action='store_true', help='IDs der Rahmenbedingungen aus dem Konto lesen')
    p.add_argument('--standort-anlegen', action='store_true', help='Artikelstandort aus ebay-konfig.json bei eBay anlegen')
    p.add_argument('--nur', help='nur Produkte, deren Name diesen Text enthält')
    p.add_argument('--liste')
    p.add_argument('--lexikon')
    p.add_argument('--senden', action='store_true', help='Entwürfe bei eBay anlegen oder aktualisieren')
    p.add_argument('--veroeffentlichen', action='store_true', help='Angebote wirklich veröffentlichen')
    p.add_argument('--rechtlich-geklaert', action='store_true')
    p.add_argument('--umgebung', choices=tuple(BASIS), default='sandbox')
    p.add_argument('--max', type=int, default=1, help='höchstens so viele Angebote je Lauf senden')
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
    if not args.welle:
        raise Abbruch('--welle 1 oder 2 fehlt')
    liste_pfad = args.liste or os.path.join(ordner, UNTERORDNER, STARTLISTE)
    lexikon_pfad = args.lexikon or os.path.join(ordner, 'lexikon', 'produkte.json')
    konfig, zugang, namen = lies_konfig(ordner), lies_zugang(ordner), verbotene_namen(ordner)
    liste, lexikon = lies_startliste(liste_pfad), lies_lexikon(lexikon_pfad)
    plan = (plane_welle1 if args.welle == 1 else plane_welle2)(liste, lexikon, konfig)
    if args.nur:
        plan = [e for e in plan if args.nur.lower() in e['name'].lower()]
    for eintrag in plan:
        fund = namens_fund(eintrag, namen)
        if fund:
            eintrag['maengel'].append(f'verbotener Name im Angebot ({len(fund)})')

    ziel = os.path.join(ordner, UNTERORDNER, f'einstellplan-welle{args.welle}.json')
    with open(ziel, 'w', encoding='utf-8') as datei:
        json.dump(plan, datei, ensure_ascii=False, indent=1)
    bereit = [e for e in plan if not e['maengel']]
    print(f'Welle {args.welle}: {len(plan)} Angebote im Plan, {len(bereit)} bereit. Plan: {ziel}')
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
