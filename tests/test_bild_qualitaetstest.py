"""Tests fuer domains/shopify/bild-qualitaetstest.py - die Strukturpruefung
der KI-erzeugten Raender.

Laeuft ohne sips: Bilder werden synthetisch im Speicher gebaut, und fuer den
Ende-zu-Ende-Lauf als BMP geschrieben, das das Skript ohne Formatwandlung
liest. Der Dateiname des Skripts enthaelt einen Bindestrich, deshalb wird es
ueber importlib geladen.
"""

import contextlib
import importlib.util
import io
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

WURZEL = Path(__file__).resolve().parents[1]
SKRIPT = WURZEL / "domains" / "shopify" / "bild-qualitaetstest.py"


def lade_modul():
    spec = importlib.util.spec_from_file_location("bild_qualitaetstest", SKRIPT)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


bq = lade_modul()


class KunstBild:
    """Synthetisches Graubild: Schachbrett mit ortsabhaengiger Amplitude.

    Der Mikrokontrast eines Kastens ist 2*amp/BASIS*100; das Verhaeltnis
    zweier Kaesten ist damit genau das Verhaeltnis ihrer Amplituden. So laesst
    sich ein Verlauf (vorn/hinten) exakt vorgeben."""

    BASIS = 128

    def __init__(self, w, h, amp):
        self.w, self.h, self.amp = w, h, amp
        self.name = "kunst"

    def rgb(self, x, y):
        a = self.amp(x, y)
        v = self.BASIS + (a if (x + y) % 2 else -a)
        return v, v, v

    def lum(self, x, y):
        return float(self.rgb(x, y)[0])


QW, QH = 600, 400                 # Quelle
STUFE = int(0.68 * QH)            # Zeile zwischen FLOR_HINTEN (bis 0,62) und FLOR_VORN (ab 0,75)
GUT = 24                          # Amplitude vorn (kameranah, unten)
FLACH = 8                         # Amplitude hinten (kamerafern, oben)


def stufe_unten(y0, hoehe):
    """Zeile zwischen UNTEN_HINTEN und UNTEN_VORN eines unteren Streifens."""
    return y0 + int((bq.UNTEN_HINTEN[1] + bq.UNTEN_VORN[0]) / 2 * hoehe)


def verlauf_gut(y, stufe=STUFE):
    """Zeichnung faellt nach hinten ab: vorn 3x so stark wie hinten."""
    return GUT if y >= stufe else FLACH


def verlauf_filz(y, stufe=STUFE):
    """Tiefe umgekehrt: hinten staerker als vorn."""
    return FLACH if y >= stufe else GUT


def verlauf_gleich(y, stufe=STUFE):
    return 16


def befund(befunde, seite):
    for b in befunde:
        if b["seite"] == seite:
            return b
    return None


def rechteck(roi):
    return (roi.x, roi.y, roi.w, roi.h)


class RandbereicheTests(unittest.TestCase):
    def test_nur_links_erweitert(self):
        erg = KunstBild(QW + 400, QH, lambda x, y: 16)
        r = bq.randbereiche(bq.Roi(400, 0, QW, QH), erg)
        self.assertEqual(list(r), ["links"])
        self.assertEqual(rechteck(r["links"]), (0, 0, 400, QH))

    def test_alle_seiten_und_ecken(self):
        erg = KunstBild(QW + 300, QH + 150, lambda x, y: 16)
        r = bq.randbereiche(bq.Roi(100, 50, QW, QH), erg)
        self.assertEqual(list(r), ["links", "rechts", "oben", "unten links", "unten", "unten rechts"])
        # links/rechts nur ueber die Zeilen der Quelle ...
        self.assertEqual(rechteck(r["links"]), (0, 50, 100, QH))
        self.assertEqual(rechteck(r["rechts"]), (100 + QW, 50, 200, QH))
        # ... oben ueber die ganze Breite, die unteren Ecken je fuer sich:
        # jedes Pixel ausserhalb der Quelle gehoert genau einem Rand.
        self.assertEqual(rechteck(r["oben"]), (0, 0, QW + 300, 50))
        self.assertEqual(rechteck(r["unten links"]), (0, 50 + QH, 100, 100))
        self.assertEqual(rechteck(r["unten"]), (100, 50 + QH, QW, 100))
        self.assertEqual(rechteck(r["unten rechts"]), (100 + QW, 50 + QH, 200, 100))
        flaeche = sum(b.w * b.h for b in r.values())
        self.assertEqual(flaeche, erg.w * erg.h - QW * QH)

    def test_ohne_erweiterung_keine_raender(self):
        erg = KunstBild(QW, QH, lambda x, y: 16)
        self.assertEqual(bq.randbereiche(bq.Roi(0, 0, QW, QH), erg), {})


class RandmessungTests(unittest.TestCase):
    def setUp(self):
        self.roi = bq.Roi(200, 0, QW, QH)     # Quelle sitzt bei 200,0 - links und rechts je 200 px erzeugt

    def bild(self, amp):
        return KunstBild(QW + 400, QH, amp)

    def test_guter_rand_ist_ok(self):
        befunde = bq.messe_raender(self.bild(lambda x, y: verlauf_gut(y)), self.roi)
        self.assertEqual([b["seite"] for b in befunde], ["links", "rechts"])
        for b in befunde:
            self.assertIsNone(b["grund"])
            self.assertAlmostEqual(b["messung"]["verlauf"], 3.0, places=1)
            self.assertEqual(bq.urteil(b["messung"]), "OK")
        fehler, ungeprueft = bq.beurteile_raender(befunde)
        self.assertEqual((fehler, ungeprueft), ([], []))

    def test_gleichmaessiger_rand_wird_abgelehnt(self):
        befunde = bq.messe_raender(self.bild(lambda x, y: verlauf_gleich(y)), self.roi)
        for b in befunde:
            self.assertAlmostEqual(b["messung"]["verlauf"], 1.0, places=1)
            self.assertTrue(bq.urteil(b["messung"]).startswith("GRENZWERTIG"))
        fehler, ungeprueft = bq.beurteile_raender(befunde)
        self.assertEqual(len(fehler), 2)
        self.assertEqual(ungeprueft, [])

    def test_umgekehrte_tiefe_ist_filz(self):
        befunde = bq.messe_raender(self.bild(lambda x, y: verlauf_filz(y)), self.roi)
        for b in befunde:
            self.assertLess(b["messung"]["verlauf"], bq.VERLAUF_FILZ)
            self.assertTrue(bq.urteil(b["messung"]).startswith("VERWERFEN"))
        fehler, _ = bq.beurteile_raender(befunde)
        self.assertEqual(len(fehler), 2)
        self.assertTrue(all("Filz" in f for f in fehler))

    def test_guter_rand_neben_filzrand(self):
        # links gut, rechts Filz - die Seiten werden getrennt beurteilt
        def amp(x, y):
            return verlauf_gut(y) if x < 200 + QW else verlauf_filz(y)
        befunde = bq.messe_raender(self.bild(amp), self.roi)
        self.assertEqual(bq.urteil(befund(befunde, "links")["messung"]), "OK")
        self.assertTrue(bq.urteil(befund(befunde, "rechts")["messung"]).startswith("VERWERFEN"))
        fehler, _ = bq.beurteile_raender(befunde)
        self.assertEqual(len(fehler), 1)
        self.assertIn("rechts", fehler[0])
        self.assertNotIn("links", fehler[0])

    def test_zu_schmaler_rand_ist_nicht_messbar(self):
        roi = bq.Roi(20, 0, QW, QH)
        bild = KunstBild(QW + 20, QH, lambda x, y: verlauf_filz(y))
        befunde = bq.messe_raender(bild, roi)
        self.assertEqual(len(befunde), 1)
        b = befunde[0]
        self.assertEqual(b["seite"], "links")
        self.assertIsNone(b["messung"])
        self.assertIn("zu klein", b["grund"])
        self.assertIn("20x", b["grund"])              # die Breite ist das Mass, das fehlt
        fehler, ungeprueft = bq.beurteile_raender(befunde)
        self.assertEqual(fehler, [])
        self.assertEqual(len(ungeprueft), 1)
        self.assertIn("links", ungeprueft[0])

    def test_mindestbreite_links_und_rechts_gleich(self):
        # Der rechte Streifen liegt am Bildrand, der linke an der Quelle. Beide
        # muessen ab derselben Breite messbar sein (vorher: links 32, rechts 34).
        for breite, messbar in ((31, False), (32, True)):
            links = bq.messe_raender(KunstBild(QW + breite, QH, lambda x, y: 16),
                                     bq.Roi(breite, 0, QW, QH))[0]
            rechts = bq.messe_raender(KunstBild(QW + breite, QH, lambda x, y: 16),
                                      bq.Roi(0, 0, QW, QH))[0]
            self.assertEqual((links["seite"], rechts["seite"]), ("links", "rechts"))
            self.assertEqual(links["messung"] is not None, messbar, breite)
            self.assertEqual(rechts["messung"] is not None, messbar, breite)

    def test_niedrige_quelle_nennt_die_kastenhoehe(self):
        # Seitliche Kaesten sind 10 % der Quellhoehe hoch: bei 300 px Quelle
        # nur 30 px - der Grund muss die Hoehe nennen, nicht "zu schmal".
        bild = KunstBild(QW + 500, 300, lambda x, y: 16)
        b = bq.messe_raender(bild, bq.Roi(0, 0, QW, 300))[0]
        self.assertIsNone(b["messung"])
        self.assertIn("500x31 px", b["grund"])
        self.assertNotIn("schmal", b["grund"])

    def test_zu_niedriger_unterer_rand_ist_nicht_messbar(self):
        # 60 px Streifen -> Messkasten 0,3 * 60 = 18 px
        roi = bq.Roi(0, 0, QW, QH)
        bild = KunstBild(QW, QH + 60, lambda x, y: verlauf_filz(y))
        befunde = bq.messe_raender(bild, roi)
        self.assertEqual([b["seite"] for b in befunde], ["unten"])
        self.assertIsNone(befunde[0]["messung"])
        self.assertIn("zu klein", befunde[0]["grund"])

    def test_strukturloser_rand_links_wie_rechts(self):
        # Ein Rand ohne jede Zeichnung, beidseitig identisch. Vorher las der
        # linke Kasten die erste Quellspalte mit und erbte deren Verlauf (3,0x,
        # OK), waehrend rechts 0,0x VERWERFEN herauskam.
        def amp(x, y):
            return verlauf_gut(y) if 200 <= x < 200 + QW else 0
        befunde = bq.messe_raender(self.bild(amp), self.roi)
        links, rechts = befund(befunde, "links")["messung"], befund(befunde, "rechts")["messung"]
        self.assertEqual((links["vorn"], links["hinten"]), (0.0, 0.0))
        self.assertEqual((rechts["vorn"], rechts["hinten"]), (0.0, 0.0))
        self.assertEqual(bq.urteil(links), bq.urteil(rechts))
        fehler, _ = bq.beurteile_raender(befunde)
        self.assertEqual(len(fehler), 2)

    def test_untere_ecke_liest_nicht_den_nachbarstreifen(self):
        # unten links ohne Zeichnung, unten (unter der Quelle) mit guter
        # Zeichnung: die Ecke darf die erste Spalte des Nachbarn nicht sehen.
        roi = bq.Roi(200, 0, QW, QH)
        s = stufe_unten(QH, 200)

        def amp(x, y):
            if y < QH:
                return verlauf_gut(y)
            return 0 if x < 200 else verlauf_gut(y, s)
        befunde = bq.messe_raender(KunstBild(QW + 200, QH + 200, amp), roi)
        ecke = befund(befunde, "unten links")["messung"]
        self.assertEqual((ecke["vorn"], ecke["hinten"]), (0.0, 0.0))
        self.assertEqual(bq.urteil(befund(befunde, "unten")["messung"], befund(befunde, "unten")["gut"]), "OK")

    def test_schwelle_unten_haengt_am_tiefenumfang(self):
        roi = bq.Roi(0, 0, QW, QH)
        s15 = bq.verlauf_schwelle_unten(roi, bq.Roi(0, QH, QW, int(0.15 * QH)))
        s50 = bq.verlauf_schwelle_unten(roi, bq.Roi(0, QH, QW, int(0.50 * QH)))
        s300 = bq.verlauf_schwelle_unten(roi, bq.Roi(0, QH, QW, 3 * QH))
        self.assertGreater(s15, 1.0)                  # flach bleibt immer GRENZWERTIG
        self.assertLess(s15, s50)                     # mehr Tiefe, hoehere Schwelle
        self.assertLess(s50, bq.VERLAUF_GUT)
        self.assertEqual(s300, bq.VERLAUF_GUT)        # nie strenger als das Motiv
        # Seitliche Raender bleiben bei VERLAUF_GUT
        b = bq.messe_raender(KunstBild(QW + 200, QH, lambda x, y: 16), bq.Roi(200, 0, QW, QH))[0]
        self.assertEqual(b["gut"], bq.VERLAUF_GUT)

    def test_fortgesetzte_zeichnung_unten_ist_ok(self):
        # Zeichnung waechst linear mit dem Zeilenabstand zum Horizont (wie in
        # der Quelle, 3,2x zwischen den Quellkaesten) und setzt sich 30 % der
        # Quellhoehe nach unten fort. Ueber den kurzen Umfang des Streifens
        # ergibt das nur ~1,29x - mit der festen Schwelle 1,5 GRENZWERTIG,
        # mit der umgerechneten OK.
        horizont = 0.446 * QH

        def amp(x, y):
            return max(0.0, 0.06 * (y - horizont))
        roi = bq.Roi(0, 0, QW, QH)
        mq = bq.messe(KunstBild(QW, QH, amp), roi, "q")
        self.assertGreater(mq["verlauf"], 3.0)
        b = bq.messe_raender(KunstBild(QW, QH + 120, amp), roi)[0]
        self.assertEqual(b["seite"], "unten")
        self.assertLess(b["messung"]["verlauf"], bq.VERLAUF_GUT)
        self.assertEqual(bq.urteil(b["messung"], b["gut"]), "OK")
        self.assertEqual(bq.beurteile_raender([b]), ([], []))

    def test_flacher_unterer_rand_bleibt_grenzwertig(self):
        roi = bq.Roi(0, 0, QW, QH)
        for hu in (120, 400):
            b = bq.messe_raender(KunstBild(QW, QH + hu, lambda x, y: 16), roi)[0]
            self.assertAlmostEqual(b["messung"]["verlauf"], 1.0, places=2)
            self.assertTrue(bq.urteil(b["messung"], b["gut"]).startswith("GRENZWERTIG"), hu)
            fehler, _ = bq.beurteile_raender([b])
            self.assertEqual(len(fehler), 1)

    def test_oberer_rand_liegt_ueber_der_florzone(self):
        roi = bq.Roi(0, 120, QW, QH)
        bild = KunstBild(QW, QH + 120, lambda x, y: verlauf_filz(y, 120 + STUFE))
        befunde = bq.messe_raender(bild, roi)
        self.assertEqual([b["seite"] for b in befunde], ["oben"])
        self.assertIsNone(befunde[0]["messung"])
        self.assertIn("Florzone", befunde[0]["grund"])
        fehler, ungeprueft = bq.beurteile_raender(befunde)
        self.assertEqual(fehler, [])
        self.assertEqual(len(ungeprueft), 1)
        self.assertIn("oben", ungeprueft[0])

    def test_unterer_rand_mit_filz_wird_abgelehnt(self):
        roi = bq.Roi(0, 0, QW, QH)
        s = stufe_unten(QH, 200)
        bild = KunstBild(QW, QH + 200,
                         lambda x, y: verlauf_filz(y, s) if y >= QH else verlauf_gut(y))
        befunde = bq.messe_raender(bild, roi)
        self.assertEqual([b["seite"] for b in befunde], ["unten"])
        self.assertTrue(bq.urteil(befunde[0]["messung"]).startswith("VERWERFEN"))
        fehler, _ = bq.beurteile_raender(befunde)
        self.assertEqual(len(fehler), 1)
        self.assertIn("unten", fehler[0])

    def test_vier_seiten_gleichzeitig(self):
        # Quelle bei 200,100 in 1000x700: links, rechts (je 200 px), oben (100 px)
        # und unten (200 px) erzeugt. Links gut, rechts flach, unten (mit den
        # unteren Ecken) gut, oben nicht messbar.
        roi = bq.Roi(200, 100, QW, QH)
        s_seite = 100 + STUFE
        s_unten = stufe_unten(100 + QH, 200)

        def amp(x, y):
            if y >= 100 + QH:
                return verlauf_gut(y, s_unten)
            if x >= 200 + QW:
                return verlauf_gleich(y)
            return verlauf_gut(y, s_seite)

        bild = KunstBild(QW + 400, QH + 300, amp)
        befunde = bq.messe_raender(bild, roi)
        self.assertEqual([b["seite"] for b in befunde],
                         ["links", "rechts", "oben", "unten links", "unten", "unten rechts"])
        self.assertEqual(befund(befunde, "unten")["rand"].w, QW)
        for seite in ("links", "unten links", "unten", "unten rechts"):
            self.assertEqual(bq.urteil(befund(befunde, seite)["messung"]), "OK", seite)
        self.assertTrue(bq.urteil(befund(befunde, "rechts")["messung"]).startswith("GRENZWERTIG"))
        self.assertIsNone(befund(befunde, "oben")["messung"])
        fehler, ungeprueft = bq.beurteile_raender(befunde)
        self.assertEqual(len(fehler), 1)
        self.assertIn("rechts", fehler[0])
        self.assertEqual(len(ungeprueft), 1)
        self.assertIn("oben", ungeprueft[0])

    def test_filz_in_der_unteren_ecke_faellt_auf(self):
        # Nur die untere rechte Ecke ist Filz. Im Mittel mit dem guten Streifen
        # unter der Quelle (600 px gegen 200 px) laege der Verlauf bei 1,67x
        # und ginge durch - deshalb ist die Ecke ein eigener Rand.
        roi = bq.Roi(0, 0, QW, QH)
        s = stufe_unten(QH, 200)

        def amp(x, y):
            if y < QH:
                return verlauf_gut(y)
            return verlauf_filz(y, s) if x >= QW else verlauf_gut(y, s)

        bild = KunstBild(QW + 200, QH + 200, amp)
        befunde = bq.messe_raender(bild, roi)
        self.assertEqual([b["seite"] for b in befunde], ["rechts", "unten", "unten rechts"])
        self.assertEqual(bq.urteil(befund(befunde, "rechts")["messung"]), "OK")
        self.assertEqual(bq.urteil(befund(befunde, "unten")["messung"]), "OK")
        self.assertTrue(bq.urteil(befund(befunde, "unten rechts")["messung"]).startswith("VERWERFEN"))
        fehler, _ = bq.beurteile_raender(befunde)
        self.assertEqual(fehler, ["Struktur Rand unten rechts: " + bq.urteil(
            befund(befunde, "unten rechts")["messung"])])


def schreibe_paar(verzeichnis, rand_amp, rand=200):
    """Quelle (Zeichnung faellt gut ab) bitgenau bei rand,0 im Ergebnis;
    links und rechts je rand px Rand mit rand_amp."""
    def amp(x, y):
        if rand <= x < rand + QW:
            return verlauf_gut(y)
        return rand_amp(y)
    erg = KunstBild(QW + 2 * rand, QH, amp)
    quelle = KunstBild(QW, QH, lambda x, y: amp(x + rand, y))
    qp = os.path.join(verzeichnis, "quelle.bmp")
    ep = os.path.join(verzeichnis, "ergebnis.bmp")
    bq.schreibe_bmp(qp, quelle.w, quelle.h, quelle.rgb)
    bq.schreibe_bmp(ep, erg.w, erg.h, erg.rgb)
    return qp, ep


class EndeZuEndeTests(unittest.TestCase):
    """Das Skript als Prozess, mit BMP-Dateien (kein sips noetig)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def lauf(self, rand_amp, rand=200):
        qp, ep = schreibe_paar(self.tmp.name, rand_amp, rand)
        return subprocess.run([sys.executable, str(SKRIPT), qp, ep, "--bei", f"{rand},0"],
                              capture_output=True, text=True)

    def test_filzrand_wird_abgelehnt(self):
        r = self.lauf(verlauf_filz)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("ABGELEHNT", r.stdout)
        self.assertIn("Rand links", r.stdout)
        self.assertIn("Rand rechts", r.stdout)

    def test_zu_schmaler_rand_steht_in_der_ausgabe(self):
        # 20 px Filzrand: nicht messbar, lehnt nicht ab - aber beides muss in
        # der Ausgabe stehen, sonst besteht der Rand still.
        r = self.lauf(verlauf_filz, rand=20)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("Rand links (erzeugt)", r.stdout)
        self.assertIn("nicht messbar - Messkasten zu klein", r.stdout)
        self.assertIn("Ohne Strukturpruefung: Rand links", r.stdout)
        self.assertIn("Rand rechts", r.stdout.split("Ohne Strukturpruefung")[1])
        self.assertIn("ANGENOMMEN - Rand ohne Strukturpruefung", r.stdout)

    def test_guter_rand_wird_angenommen(self):
        r = self.lauf(verlauf_gut)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("ANGENOMMEN", r.stdout)
        self.assertIn("Rand links", r.stdout)

    def test_nur_quelle_misst_ohne_raender(self):
        qp, _ = schreibe_paar(self.tmp.name, verlauf_filz)
        r = subprocess.run([sys.executable, str(SKRIPT), qp], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("Struktur: OK", r.stdout)
        self.assertNotIn("Rand", r.stdout)


class KompositTests(unittest.TestCase):
    """Der Fall aus dem Befund: mit --ausgabe sind die Motivpixel bitgenau die
    der Quelle, das Motiv-Urteil ist also immer das der Quelle. Laeuft im
    selben Prozess, damit sips (nur fuer das Farbprofil) ersetzt werden kann."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def lauf(self, rand_amp):
        qp, ep = schreibe_paar(self.tmp.name, rand_amp)
        aus = os.path.join(self.tmp.name, "fertig.bmp")
        argv = [str(SKRIPT), qp, ep, "--bei", "200,0", "--ausgabe", aus]
        ausgabe = io.StringIO()
        code = 0
        with mock.patch.object(sys, "argv", argv), \
                mock.patch.object(bq, "_sips", return_value=True), \
                mock.patch.object(bq, "profil_von", return_value="sRGB (Test)"), \
                contextlib.redirect_stdout(ausgabe):
            try:
                bq.main()
            except SystemExit as e:
                code = e.code
        return code, ausgabe.getvalue()

    def test_komposit_mit_filzrand_wird_abgelehnt(self):
        code, text = self.lauf(verlauf_filz)
        self.assertEqual(code, 1, text)
        self.assertIn("bitgenau", text)
        self.assertIn("Struktur Rand links", text)
        self.assertIn("ABGELEHNT", text)

    def test_komposit_mit_gutem_rand_wird_angenommen(self):
        code, text = self.lauf(verlauf_gut)
        self.assertEqual(code, 0, text)
        self.assertIn("ANGENOMMEN", text)


if __name__ == "__main__":
    unittest.main()
