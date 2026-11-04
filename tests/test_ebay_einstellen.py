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
    'versand_gls_kosten': 10, 'versand_spedition_kosten': 80, 'versand_xxl_kosten': 130, 'stueck_mindestmarge': 0,
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


def liste(einkauf=10.0, preis=30.0, restlaenge=2000, bestand=80):
    return {'aufschlag': 0, 'ziel': 5, 'provision': 0.14, 'steuer': 0.19, 'fest': 0.45,
            'welle2': [{'produkt': 'Boden Zwei', 'status': 'Welle 2'}],
            'welle1': [{'rolle': 'Rolle Eins', 'breite': 400, 'restlaenge': restlaenge, 'bestand': bestand,
                        'preis': preis, 'einkauf': einkauf}]}


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
        self.assertEqual(e['schluessel'], 'TPG-99')
        self.assertEqual(len(e['artikel']), 26)
        self.assertIn('TP-1-L100', e['artikel'])
        self.assertIn('TP-1-L600', e['artikel'])

    def test_hinweis_schnittware_steht_in_jedem_angebot(self):
        rolle = modul.plane_welle1(liste(), [produkt()], KONFIG)[0]
        einzel = modul.plane_einzelmass(liste(), [produkt()], KONFIG, 'Rolle Eins', 400, 700, 700.0, 150.0)[0]
        self.assertIn(modul.HINWEIS_ZUSCHNITT, rolle['gruppe']['description'])
        self.assertIn(modul.HINWEIS_ZUSCHNITT, einzel['angebote'][0]['listingDescription'])

    def test_laengen_in_20_cm_schritten_bis_6_m(self):
        self.assertEqual(modul.LAENGEN_CM[:3], (100, 120, 140))
        self.assertEqual(modul.LAENGEN_CM[-1], 600)
        self.assertEqual(len(modul.LAENGEN_CM), 26)

    def test_preis_und_menge_je_laenge(self):
        e = modul.plane_welle1(liste(preis=40.0), [produkt()], KONFIG)[0]
        angebot = next(a for a in e['angebote'] if a['sku'] == 'TP-1-L300')
        self.assertEqual(angebot['pricingSummary']['price']['value'], '480.00')
        self.assertEqual(angebot['availableQuantity'], 6)

    def test_laengen_enden_an_der_restlaenge(self):
        e = modul.plane_welle1(liste(restlaenge=400, bestand=16), [produkt()], KONFIG)[0]
        self.assertIn('TP-1-L400', e['artikel'])
        self.assertNotIn('TP-1-L420', e['artikel'])

    def test_bestand_begrenzt_auch_ohne_restlaenge(self):
        e = modul.plane_welle1(liste(restlaenge=2000, bestand=8), [produkt()], KONFIG)[0]
        self.assertIn('TP-1-L200', e['artikel'])
        self.assertNotIn('TP-1-L220', e['artikel'])

    def test_ohne_einkauf_gesperrt(self):
        e = modul.plane_welle1(liste(einkauf=None), [produkt()], KONFIG)[0]
        self.assertIn('Einkauf fehlt in der Startliste', e['maengel'])

    def test_ohne_versandkosten_gesperrt(self):
        konfig = {k: v for k, v in KONFIG.items() if k != 'versand_xxl_kosten'}
        e = modul.plane_welle1(liste(), [produkt()], konfig)[0]
        self.assertIn('versand_xxl_kosten fehlt in der Konfiguration', e['maengel'])

    def test_versandweg_haengt_an_der_kuerzeren_seite(self):
        self.assertEqual(modul.versandkosten(400, 200, KONFIG), 10)
        self.assertEqual(modul.versandkosten(400, 220, KONFIG), 80)
        self.assertEqual(modul.versandkosten(400, 320, KONFIG), 80)
        self.assertEqual(modul.versandkosten(400, 340, KONFIG), 130)
        self.assertEqual(modul.versandkosten(400, 600, KONFIG), 130)

    def test_mischpreis_haelt_stueck_und_schnitt(self):
        daten = liste()
        p = modul.mischpreis(25.0, 400, modul.LAENGEN_CM, 10.0, daten, KONFIG)
        margen = []
        for l in modul.LAENGEN_CM:
            a = 400 * l / 10000
            margen.append((modul.stueckmarge(p, a, modul.versandkosten(400, l, KONFIG), 10.0, daten), a))
        self.assertGreaterEqual(min(m for m, _ in margen), 0)
        self.assertGreaterEqual(sum(m / a for m, a in margen) / len(margen), 5)

    def test_mischpreis_nie_unter_listenpreis(self):
        self.assertEqual(modul.mischpreis(50.0, 400, modul.LAENGEN_CM, 10.0, liste(), KONFIG), 50.0)

    def test_einzelmass_auch_ueber_6_m(self):
        e = modul.plane_einzelmass(liste(), [produkt()], KONFIG, 'Rolle Eins', 400, 700, 700.0, 150.0)[0]
        self.assertEqual(e['maengel'], [])
        self.assertEqual(e['angebote'][0]['availableQuantity'], 1)
        self.assertIn('TP-1-E400X700', e['artikel'])

    def test_einzelmass_unter_mindestmarge_gesperrt(self):
        e = modul.plane_einzelmass(liste(), [produkt()], KONFIG, 'Rolle Eins', 400, 700, 100.0, 150.0)[0]
        self.assertTrue(any('Mindestmarge' in m for m in e['maengel']))

    def test_einzelmass_nicht_laenger_als_rolle(self):
        with self.assertRaises(modul.Abbruch):
            modul.plane_einzelmass(liste(restlaenge=400, bestand=16), [produkt()], KONFIG, 'Rolle Eins', 400, 500, 500.0, 150.0)

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


class Einrichtung(unittest.TestCase):
    def test_rahmen_uebersicht_liest_alle_drei(self):
        def server(anfrage):
            if 'oauth2' in anfrage.full_url:
                return Antwort(json.dumps({'access_token': 't'}).encode())
            self.assertEqual(anfrage.get_method(), 'GET')
            antwort = {
                'fulfillmentPolicies': [{'name': 'V', 'fulfillmentPolicyId': '1'}],
                'paymentPolicies': [{'name': 'Z', 'paymentPolicyId': '2'}],
                'returnPolicies': [{'name': 'R', 'returnPolicyId': '3'}],
            }
            return Antwort(json.dumps(antwort).encode())
        ergebnis = modul.rahmen_uebersicht(modul.Ebay('sandbox', ZUGANG, server))
        self.assertEqual(ergebnis['returnPolicyId'], [('R', '3')])

    def test_standort_braucht_adresse(self):
        with self.assertRaises(modul.Abbruch):
            modul.lege_standort_an(modul.Ebay('sandbox', ZUGANG, FalscherServer()), {'merchantLocationKey': 'L'})

    def test_standort_wird_angelegt(self):
        server = FalscherServer()
        konfig = {'merchantLocationKey': 'lager', 'standort': {'city': 'Stadt', 'postalCode': '12345'}}
        modul.lege_standort_an(modul.Ebay('sandbox', ZUGANG, server), konfig)
        self.assertIn(('POST', '/sell/inventory/v1/location/lager'), server.aufrufe)


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
        self.assertIn(('POST', '/sell/inventory/v1/offer/publish_by_inventory_item_group'), server.aufrufe)

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
