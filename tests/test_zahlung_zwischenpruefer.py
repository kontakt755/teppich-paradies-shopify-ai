"""Zwischenpruefer der Sammeldatei: erfundene Daten, ohne pypdf."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "operations" / "scripts"))
import zahlung_zwischenpruefer as z  # noqa: E402

# Erfundene, pruefzifferngueltige IBANs (keine echten Konten)
EIGEN = "DE89370400440532013000"
LIEF = "DE02120300000000202051"
FREMD = "DE02500105170137075030"


def pain(*tx):
    summe = sum(round(b * 100) for _, b, _, _ in tx)
    s = f"{summe // 100}.{summe % 100:02d}"
    teile = "".join(
        f"<CdtTrfTxInf><PmtId><EndToEndId>RE-{n}</EndToEndId></PmtId><Amt><InstdAmt Ccy=\"EUR\">{b:.2f}</InstdAmt></Amt>"
        f"<Cdtr><Nm>Muster Teppich GmbH</Nm></Cdtr><CdtrAcct><Id><IBAN>{i}</IBAN></Id></CdtrAcct><RmtInf><Ustrd>{zw}</Ustrd></RmtInf></CdtTrfTxInf>"
        for n, b, i, zw in tx)
    return (f"<GrpHdr><NbOfTxs>{len(tx)}</NbOfTxs><CtrlSum>{s}</CtrlSum></GrpHdr><PmtInf><NbOfTxs>{len(tx)}</NbOfTxs><CtrlSum>{s}</CtrlSum>"
            f"<DbtrAcct><Id><IBAN>{EIGEN}</IBAN></Id></DbtrAcct>{teile}</PmtInf>")


def beleg(nummer, brutto, text, art="rechnung", schluessel="muster.de"):
    return {"schluessel": schluessel, "nummer": nummer, "brutto": brutto, "datum": "2026-11-10", "art": art, "datei": f"{nummer}.pdf", "text": lambda: text}


LIEFERANTEN = {"muster.de": {"name": "Muster Teppich GmbH", "iban": LIEF}, "zieht.de": {"zahlart": "lastschrift"}}


def pruefen(xml, belege, buchungen=(), andere=None):
    return z.datei_pruefen("neu.xml", xml, lieferanten=LIEFERANTEN, belege=belege, buchungen=list(buchungen), andere=andere or {}, heute="2026-11-15")


class Zwischenpruefer(unittest.TestCase):
    def test_saubere_datei_mit_skonto(self):
        f, h = pruefen(pain(("100", 98.0, LIEF, "RE 100 abzgl Skonto 2,00 EUR")), [beleg("100", 100.0, f"innerhalb von 10 Tagen mit 2 % Skonto IBAN {LIEF}")])
        self.assertEqual(f, [])
        self.assertTrue(any("Skonto 2,00" in x for x in h))

    def test_fehler_werden_gefunden(self):
        belege = [beleg("100", 100.0, f"IBAN {LIEF}"), beleg("200", 50.0, "ohne Konto"), beleg("300", 40.0, f"Gutschrift IBAN {LIEF}", art="gutschrift")]
        xml = pain(("100", 90.0, LIEF, "RE 100"), ("200", 50.0, LIEF, "RE 200"), ("300", 40.0, LIEF, "RE 300"), ("999", 10.0, FREMD, "RE 999"))
        f, _ = pruefen(xml, belege, buchungen=[{"datum": "2026-11-12", "betrag": -100.0, "name": "Muster", "ibans": [LIEF], "text": "Rechnung 100"}], andere={"alt.xml": {"200"}})
        text = "\n".join(f)
        self.assertIn("RE 100: Abzug 10,00 EUR nicht als Skonto belegt", text)
        self.assertIn("RE 100: laut Kontoauszug schon bezahlt am 2026-11-12", text)
        self.assertIn("RE 200: IBAN steht nicht auf der Rechnung", text)
        self.assertNotIn("RE 200: steht auch in alt.xml", text)  # alt.xml kennt nur eine Nummer ohne Konto
        self.assertIn("RE 300: Beleg ist eine Gutschrift", text)
        self.assertIn("RE 999: IBAN steht bei keinem eingetragenen Lieferanten", text)

    def test_kopf_und_pruefziffer(self):
        xml = pain(("100", 100.0, LIEF, "RE 100")).replace("<NbOfTxs>1</NbOfTxs>", "<NbOfTxs>2</NbOfTxs>", 1)
        f, _ = pruefen(xml, [beleg("100", 100.0, f"IBAN {LIEF}")])
        self.assertTrue(any("Kopf passt nicht" in x for x in f))
        self.assertFalse(z.iban_gueltig("DE02120300000000202052"))

    def test_nummer_als_eigenes_wort(self):
        self.assertTrue(z.nummer_im("Re 208415TP050", "208415"))
        self.assertFalse(z.nummer_im("Kd 12084151", "208415"))


    def test_codex_runde_1(self):
        # Skonto nur bis zum belegten Satz: 2 % belegt, 5 % abgezogen
        f, _ = pruefen(pain(("100", 95.0, LIEF, "RE 100 abzgl Skonto 5,00 EUR")), [beleg("100", 100.0, f"2 % Skonto IBAN {LIEF}")])
        self.assertTrue(any("nicht als Skonto belegt" in x for x in f))
        # Skontobetrag steht woertlich auf der Rechnung (Lieferant A rechnet auf den Warenanteil)
        f, _ = pruefen(pain(("100", 98.4, LIEF, "RE 100 abzgl Skonto 1,60 EUR")), [beleg("100", 100.0, f"Zahlung bis 23 11 26 2,00 % Skonto 1,60 EUR Zahlung 98,40 EUR IBAN {LIEF}")])
        self.assertEqual(f, [])
        # Zweimal dieselbe Rechnung in einer Datei
        f, _ = pruefen(pain(("100", 100.0, LIEF, "RE 100"), ("100", 100.0, LIEF, "RE 100")), [beleg("100", 100.0, f"IBAN {LIEF}")])
        self.assertTrue(any("zweimal in dieser Datei" in x for x in f))
        # Fremde Abbuchung mit derselben Nummer macht die Rechnung nicht bezahlt
        fremd = {"datum": "2026-11-12", "betrag": -7.0, "name": "Andere Firma", "ibans": [FREMD], "text": "Bestellung 100"}
        f, _ = pruefen(pain(("100", 100.0, LIEF, "RE 100")), [beleg("100", 100.0, f"IBAN {LIEF}")], buchungen=[fremd])
        self.assertFalse(any("schon bezahlt" in x for x in f))
        # Gleiche Nummer bei anderem Konto in anderer Datei sperrt nicht, gleiches Konto sperrt
        f, _ = pruefen(pain(("100", 100.0, LIEF, "RE 100")), [beleg("100", 100.0, f"IBAN {LIEF}")], andere={"a.xml": {(FREMD, "100")}, "b.xml": {(LIEF, "100")}})
        self.assertEqual([x for x in f if "steht auch" in x], ["Muster Teppich GmbH RE 100: steht auch in b.xml"])


    def test_codex_runde_2(self):
        ok = f"Zahlbar innerhalb von 10 Tagen mit 2 % Skonto. IBAN {LIEF}"
        # Betrag „5,00“ steht als Fracht, nicht als Skonto: 5 % bleiben unbelegt
        f, _ = pruefen(pain(("100", 95.0, LIEF, "RE 100 abzgl Skonto 5,00 EUR")), [beleg("100", 100.0, f"Fracht 5,00 EUR {ok}")])
        self.assertTrue(any("nicht als Skonto belegt" in x for x in f))
        # Abgelaufene Skontofrist (Rechnung 10.11., 3 Tage)
        f, _ = pruefen(pain(("100", 98.0, LIEF, "RE 100 abzgl Skonto 2,00 EUR")), [beleg("100", 100.0, f"innerhalb von 3 Tagen mit 2 % Skonto IBAN {LIEF}")])
        self.assertTrue(any("Skontofrist am 2026-11-13 abgelaufen" in x for x in f))
        # Ein gemeinsames Namenswort ohne IBAN ist kein Empfaengernachweis
        andere = {"datum": "2026-11-12", "betrag": -7.0, "name": "Andere Teppich GmbH", "ibans": [], "text": "Rechnung 100"}
        f, _ = pruefen(pain(("100", 100.0, LIEF, "RE 100")), [beleg("100", 100.0, f"IBAN {LIEF}")], buchungen=[andere])
        self.assertFalse(any("schon bezahlt" in x for x in f))
        # Unbekanntes Brutto: nur der Gesamtbetrag zaehlt, nicht der Nettobetrag
        f, _ = pruefen(pain(("100", 84.03, LIEF, "RE 100")), [beleg("100", None, f"Netto 84,03 EUR Gesamtbetrag 100,00 EUR IBAN {LIEF}")])
        self.assertTrue(any("Rechnungswert im Archiv unbekannt" in x for x in f))
        # Rechnung nennt Einzug
        f, _ = pruefen(pain(("100", 100.0, LIEF, "RE 100")), [beleg("100", 100.0, f"Der Betrag wird per Lastschrift eingezogen. IBAN {LIEF}")])
        self.assertTrue(any("Lastschrift" in x for x in f))

    def test_bankexport_mit_spalte_iban(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            Path(d, "a.csv").write_text(f"Buchungstag;Beguenstigter;IBAN;Verwendungszweck;Betrag\n12.11.2026;Muster Teppich GmbH;{LIEF};RE 100;-100,00\n", "utf-8")
            b = z.bank_lesen(d)
        self.assertEqual((b[0]["name"], b[0]["ibans"]), ("Muster Teppich GmbH", [LIEF]))
        f, _ = pruefen(pain(("100", 100.0, LIEF, "RE 100")), [beleg("100", 100.0, f"IBAN {LIEF}")], buchungen=b)
        self.assertTrue(any("schon bezahlt am 2026-11-12" in x for x in f))


if __name__ == "__main__":
    unittest.main()
