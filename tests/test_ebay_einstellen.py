"""Tests fuer scripts/ebay/einstellen.py: Plan, Sperren und Sendeablauf ohne Netz."""

import importlib.util
import io
import json
import os
import unittest
import urllib.error

PFAD = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'ebay', 'einstellen.py')
spec = importlib.util.spec_from_file_location('ebay_einstellen', PFAD)
modul = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modul)

KONFIG = {
    'fulfillmentPolicyId': 'F', 'paymentPolicyId': 'P', 'returnPolicyId': 'R', 'merchantLocationKey': 'L',
    'marke_ersatz': 'Markenlos', 'menge_bestellware': 50,
}


def variante(nummer=1, preis=30.0, verfuegbar=True, einheit='m2'):
    return {
        'id': f'gid://shopify/ProductVariant/{nummer}', 'sku': 'GEHEIM_ARTIKEL', 'farbe': f'Grau {nummer}',
        'preis': preis, 'preisJeEinheit': {'betrag': preis, 'einheit': einheit}, 'verfuegbar': verfuegbar,
        'rollenbreiteM': 4, 'bild': f'https://cdn.example/{nummer}.jpg',
        'einkauf': {'lieferant': 'A', 'hersteller': 'Geheimfirma'},
    }


def produkt(titel='Rolle Eins – Restposten, 400 cm', tag='sonderposten', varianten=None):
    return {
        'titel': titel, 'handle': 'x', 'adminUrl': 'https://admin/products/99', 'status': 'ACTIVE',
        'produktgruppe': 'Teppichboden', 'bild': 'https://cdn.example/p.jpg',
        'musterRegeln': {'tags': [tag]}, 'eigenschaften': {'material': 'Polyamid'},
        'varianten': varianten or [variante()],
    }


def liste(einkauf=10.0, marge=9.0):
    return {'aufschlag': 0, 'ziel': 5, 'welle2': [{'produkt': 'Boden Zwei', 'status': 'Welle 2'}],
            'welle1': [{'rolle': 'Rolle Eins', 'bestand': 80, 'preis': 30.0, 'einkauf': einkauf, 'marge': marge}]}


class Antwort(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class FalscherServer:
    def __init__(self, vorhanden=False):
        self.aufrufe = []
        self.vorhanden = vorhanden

    def __call__(self, anfrage):
        pfad = anfrage.full_url.split('.com', 1)[1]
        self.aufrufe.append((anfrage.get_method(), pfad))
        if 'oauth2/token' in pfad:
            return Antwort(json.dumps({'access_token': 't'}).encode())
        if anfrage.get_method() == 'GET':
            if not self.vorhanden:
                raise urllib.error.HTTPError(pfad, 404, 'x', {}, io.BytesIO(b'{}'))
            return Antwort(json.dumps({'offers': [{'offerId': 'alt'}]}).encode())
        if pfad.endswith('/offer'):
            return Antwort(json.dumps({'offerId': 'neu'}).encode())
        if 'publish' in pfad:
            return Antwort(json.dumps({'listingId': '123'}).encode())
        return Antwort(b'{}')


ZUGANG = {k: 'x' for k in modul.ZUGANG_PFLICHT}


class Plan(unittest.TestCase):
    def test_vollstaendige_rolle_ist_bereit(self):
        e = modul.plane_welle1(liste(), [produkt()], KONFIG)[0]
        self.assertEqual(e['maengel'], [])
        self.assertEqual(e['schluessel'], 'TP-1')
        self.assertEqual(e['angebote'][0]['availableQuantity'], 80)
        self.assertEqual(e['angebote'][0]['pricingSummary']['price']['value'], '30.00')

    def test_ohne_einkauf_gesperrt(self):
        e = modul.plane_welle1(liste(einkauf=None, marge='EK fehlt'), [produkt()], KONFIG)[0]
        self.assertIn('Einkauf fehlt in der Startliste', e['maengel'])

    def test_marge_unter_ziel_gesperrt(self):
        e = modul.plane_welle1(liste(marge=2.0), [produkt()], KONFIG)[0]
        self.assertTrue(any('unter Ziel' in m for m in e['maengel']))

    def test_einkauf_und_lieferant_nie_im_angebot(self):
        e = modul.plane_welle1(liste(), [produkt()], KONFIG)[0]
        inhalt = json.dumps(e)
        for geheim in ('GEHEIM_ARTIKEL', 'Geheimfirma', 'lieferant', 'einkauf'):
            self.assertNotIn(geheim, inhalt)

    def test_kein_widerrufsausschluss_im_text(self):
        e = modul.plane_welle1(liste(), [produkt()], KONFIG)[0]
        self.assertNotIn('widerruf', json.dumps(e, ensure_ascii=False).lower())

    def test_welle2_nimmt_nur_verfuegbar_und_bis_45(self):
        vs = [variante(1, 30), variante(2, 50), variante(3, 30, verfuegbar=False), variante(4, 30, einheit='stueck')]
        p = produkt('Boden Zwei', 'art: teppichboden', vs)
        e = modul.plane_welle2(liste(), [p], KONFIG)[0]
        self.assertEqual(list(e['artikel']), ['TP-1'])
        self.assertEqual(e['gruppe']['variantSKUs'], ['TP-1'])

    def test_welle2_ueberspringt_andere_status(self):
        daten = liste()
        daten['welle2'] = [{'produkt': 'Boden Zwei', 'status': 'Marge zu klein'}]
        self.assertEqual(modul.plane_welle2(daten, [produkt('Boden Zwei')], KONFIG), [])

    def test_teppichfliese_braucht_eigene_kategorie(self):
        p = produkt('Boden Zwei', 'art: teppichfliese')
        e = modul.plane_welle2(liste(), [p], KONFIG)[0]
        self.assertTrue(any('Teppichfliesen' in m for m in e['maengel']))

    def test_titel_hoechstens_80_zeichen(self):
        self.assertLessEqual(len(modul.titel('L' * 120 + ' – Restposten', 400)), 80)

    def test_verbotener_name_wird_gefunden(self):
        p = produkt()
        p['eigenschaften']['material'] = 'Sperrname'
        e = modul.plane_welle1(liste(), [p], KONFIG)[0]
        self.assertEqual(modul.namens_fund(e, ['sperrname']), ['sperrname'])


class Sperren(unittest.TestCase):
    def args(self, **werte):
        return type('A', (), dict({'veroeffentlichen': False, 'umgebung': 'sandbox', 'rechtlich_geklaert': False}, **werte))

    def test_ohne_namensliste_gesperrt(self):
        self.assertTrue(any('Namensliste' in s for s in modul.sendesperren(self.args(), KONFIG, ZUGANG, [])))

    def test_produktion_braucht_rechtliche_klaerung(self):
        a = self.args(veroeffentlichen=True, umgebung='produktion')
        self.assertTrue(any('rechtlich' in s for s in modul.sendesperren(a, KONFIG, ZUGANG, ['x'])))

    def test_alles_da_keine_sperre(self):
        a = self.args(veroeffentlichen=True, umgebung='produktion', rechtlich_geklaert=True)
        self.assertEqual(modul.sendesperren(a, KONFIG, ZUGANG, ['x']), [])

    def test_veroeffentlichen_ohne_senden_bricht_ab(self):
        with self.assertRaises(modul.Abbruch):
            modul.hauptlauf(['--welle', '1', '--veroeffentlichen'])


class Senden(unittest.TestCase):
    def eintrag(self):
        return modul.plane_welle1(liste(), [produkt()], KONFIG)[0]

    def test_entwurf_veroeffentlicht_nicht(self):
        server = FalscherServer()
        modul.sende(self.eintrag(), modul.Ebay('sandbox', ZUGANG, server), False)
        self.assertFalse(any('publish' in p for _, p in server.aufrufe))
        self.assertIn(('POST', '/sell/inventory/v1/offer'), server.aufrufe)

    def test_veroeffentlichen_nur_mit_schalter(self):
        server = FalscherServer()
        ergebnis = modul.sende(self.eintrag(), modul.Ebay('sandbox', ZUGANG, server), True)
        self.assertEqual(ergebnis['listingId'], '123')
        self.assertIn(('POST', '/sell/inventory/v1/offer/neu/publish'), server.aufrufe)

    def test_zweiter_lauf_erzeugt_kein_doppel(self):
        server = FalscherServer(vorhanden=True)
        modul.sende(self.eintrag(), modul.Ebay('sandbox', ZUGANG, server), False)
        self.assertNotIn(('POST', '/sell/inventory/v1/offer'), server.aufrufe)
        self.assertIn(('PUT', '/sell/inventory/v1/offer/alt'), server.aufrufe)

    def test_gruppe_nutzt_gruppenveroeffentlichung(self):
        p = produkt('Boden Zwei', 'art: teppichboden')
        e = modul.plane_welle2(liste(), [p], KONFIG)[0]
        server = FalscherServer()
        modul.sende(e, modul.Ebay('sandbox', ZUGANG, server), True)
        self.assertIn(('PUT', '/sell/inventory/v1/inventory_item_group/TPG-99'), server.aufrufe)
        self.assertIn(('POST', '/sell/inventory/v1/offer/publish_by_inventory_item_group'), server.aufrufe)

    def test_fehler_von_ebay_bricht_ab(self):
        def kaputt(anfrage):
            if 'oauth2' in anfrage.full_url:
                return Antwort(json.dumps({'access_token': 't'}).encode())
            raise urllib.error.HTTPError(anfrage.full_url, 400, 'x', {}, io.BytesIO(b'kaputt'))
        with self.assertRaises(modul.Abbruch):
            modul.sende(self.eintrag(), modul.Ebay('sandbox', ZUGANG, kaputt), False)


if __name__ == '__main__':
    unittest.main()
