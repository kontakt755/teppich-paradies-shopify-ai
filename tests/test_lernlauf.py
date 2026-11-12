"""Tests fuer scripts/lernlauf.py: Antworten zuordnen und einordnen, ohne Protokolle zu lesen."""

import importlib.util
import os
import unittest

PFAD = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'lernlauf.py')
spec = importlib.util.spec_from_file_location('lernlauf', PFAD)
modul = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modul)

ERGEBNIS = 'User has answered your questions: "Mergen?"="Ja (Empfohlen)", "Welcher Preis?"="49,95". You can now continue.'


class Lernlauf(unittest.TestCase):
    def test_antwort_je_frage(self):
        self.assertEqual(modul.antwort_zu('Mergen?', ERGEBNIS), 'Ja (Empfohlen)')
        self.assertEqual(modul.antwort_zu('Welcher Preis?', ERGEBNIS), '49,95')
        self.assertIsNone(modul.antwort_zu('Fehlt?', ERGEBNIS))

    def test_einordnen(self):
        optionen = ['Ja (Empfohlen)', 'Nein']
        self.assertEqual(modul.einordnen(optionen, 'Ja (Empfohlen)'), 'Empfehlung genommen')
        self.assertEqual(modul.einordnen(optionen, 'Nein'), 'andere Option')
        self.assertEqual(modul.einordnen(optionen, '49,95'), 'eigener Text')
        self.assertEqual(modul.einordnen(['A', 'B'], 'A'), 'ohne Empfehlung')
        self.assertEqual(modul.einordnen(optionen, None), 'unbeantwortet')

    def test_kurzmodell(self):
        self.assertEqual(modul.kurzmodell('claude-sonnet-5-5'), 'sonnet')
        self.assertEqual(modul.kurzmodell(None), '?')


if __name__ == '__main__':
    unittest.main()
