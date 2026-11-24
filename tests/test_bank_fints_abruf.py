"""FinTS-Kontoabruf: Lesesperre, Exportzeilen, Ablage. Erfundene Daten, ohne python-fints."""
import sys
import tempfile
import unittest
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "operations" / "scripts"))
import bank_fints_abruf as f  # noqa: E402

EIGEN = "DE89370400440532013000"  # erfunden, pruefziffergueltig
LIEF = "DE02120300000000202051"


def seg(typ):
    return SimpleNamespace(header=SimpleNamespace(type=typ))


class Lesesperre(unittest.TestCase):
    def test_abfragen_erlaubt(self):
        f.segmente_pruefen([seg("HKIDN"), seg("HKVVB"), seg("HKTAN"), seg("HKKAZ"), seg("HKSAL"), seg("HKEND")])

    def test_auftraege_gesperrt(self):
        for typ in ("HKCCS", "HKCCM", "HKIPZ", "HKDSE", "HKCDE", "HKVPA", None):
            with self.assertRaises(PermissionError, msg=typ):
                f.segmente_pruefen([seg("HKTAN"), seg(typ)])


class Export(unittest.TestCase):
    def lastschrift(self):
        return {"betrag": Decimal("-159.52"), "currency": "EUR", "date": date(2026, 11, 20), "entry_date": date(2026, 11, 19),
                "transaction_code": "105", "posting_text": "SEPA-BASISLASTSCHRIFT", "applicant_name": "Muster  Teppich GmbH",
                "purpose": "RE 4711", "end_to_end_reference": "E2E1", "additional_position_reference": "M-1",
                "applicant_creditor_id": "DE98ZZZ09999999999", "applicant_iban": LIEF}

    def test_zeile(self):
        z = f.zeile(self.lastschrift(), EIGEN)
        self.assertEqual(z[:3], ["19.11.2026", "20.11.2026", "Lastschrift"])
        self.assertEqual(z[4:7], ["-159,52", "EUR", EIGEN])
        self.assertEqual((z[8], z[9], z[10]), ("", "Muster Teppich GmbH", "RE 4711"))
        self.assertIn(f"IBAN: {LIEF}", z[3])  # Zwischenpruefer liest die Empfaenger-IBAN aus dem Buchungstext
        self.assertIn("Mandatsref: M-1", z[3])

    def test_eingang_und_arten(self):
        d = {"betrag": Decimal("670"), "date": date(2026, 11, 19), "transaction_code": "166", "applicant_name": "Kunde",
             "end_to_end_reference": "NOTPROVIDED"}
        z = f.zeile(d, EIGEN)
        self.assertEqual((z[2], z[4], z[8], z[9]), ("Überweisung", "670,00", "Kunde", ""))
        self.assertNotIn("NOTPROVIDED", z[3])
        self.assertEqual(f.umsatzart({"posting_text": "Echtzeitüberweisung"}), "Überweisung (Echtzeit)")
        self.assertEqual(f.umsatzart({"transaction_code": "117"}), "Dauerauftrag")
        self.assertEqual(f.umsatzart({"transaction_code": "805"}), "Zinsen/Entgelte")

    def test_csv_und_ablage(self):
        alt_eintrag = self.lastschrift() | {"entry_date": date(2026, 11, 1)}
        text = f.csv_text([alt_eintrag, self.lastschrift()], EIGEN)
        zeilen = text.splitlines()
        self.assertTrue(zeilen[0].startswith("﻿Buchungstag;Wertstellung;Umsatzart;"))
        self.assertTrue(zeilen[1].startswith("19.11.2026"))  # neueste zuerst
        with tempfile.TemporaryDirectory() as t:
            ordner, alt = Path(t, "bank-export"), Path(t, "bank-export-alt")
            ordner.mkdir()
            alt.mkdir()
            Path(ordner, "alt.csv").write_text("x")
            Path(alt, "alt.csv").write_text("aelter")
            neu = f.ablegen(text, ordner, alt, EIGEN, datetime(2026, 11, 24, 7, 5))
            self.assertEqual([p.name for p in ordner.iterdir()], [f"{EIGEN}_EUR_24-11-2026_0705.csv"])
            self.assertEqual(sorted(p.name for p in alt.iterdir()), ["alt-1.csv", "alt.csv"])
            self.assertEqual(neu.read_text(encoding="utf-8"), text)


if __name__ == "__main__":
    unittest.main()
