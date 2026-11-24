"""pdf_formular: selbst gebautes, verschluesseltes Formular mit erfundenen Werten."""
import sys
import tempfile
import unittest
from pathlib import Path

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import ArrayObject, DecodedStreamObject, DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject
except ImportError:  # lokal ohne pypdf (bares python3); die CI installiert es
    PdfWriter = None

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "operations" / "scripts"))


def _rect(y):
    return ArrayObject([FloatObject(50), FloatObject(y), FloatObject(250), FloatObject(y + 20)])


def _ap(*zustaende):
    return DictionaryObject({NameObject("/N"): DictionaryObject({NameObject(z): DecodedStreamObject() for z in zustaende})})


def formular(pfad):
    w = PdfWriter()
    seite = w.add_blank_page(300, 400)
    basis = {NameObject("/Type"): NameObject("/Annot"), NameObject("/Subtype"): NameObject("/Widget"), NameObject("/F"): NumberObject(4)}

    def widget(y, **extra):
        d = DictionaryObject({**basis, NameObject("/Rect"): _rect(y)})
        d.update({NameObject("/" + k): v for k, v in extra.items()})
        return d

    name = widget(350, FT=NameObject("/Tx"), T=TextStringObject("name"), DA=TextStringObject("/Helv 10 Tf 0 g"))
    agb = widget(300, FT=NameObject("/Btn"), T=TextStringObject("agb"), V=NameObject("/Off"), AS=NameObject("/Off"), AP=_ap("/Ja", "/Off"))
    art = DictionaryObject({NameObject("/FT"): NameObject("/Btn"), NameObject("/T"): TextStringObject("art"),
                            NameObject("/Ff"): NumberObject(49152), NameObject("/V"): NameObject("/Off")})
    kinder = [widget(250 - 30 * i, AS=NameObject("/Off"), AP=_ap(z, "/Off")) for i, z in enumerate(("/Privat", "/Firma"))]
    wahl = widget(150, FT=NameObject("/Ch"), T=TextStringObject("land"), Ff=NumberObject(1 << 17), DA=TextStringObject("/Helv 10 Tf 0 g"),
                  Opt=ArrayObject([TextStringObject("DE"), TextStringObject("AT")]))

    refs = {k: w._add_object(v) for k, v in {"name": name, "agb": agb, "art": art, "land": wahl}.items()}
    kind_refs = [w._add_object(k) for k in kinder]
    for k in kinder:
        k[NameObject("/Parent")] = refs["art"]
    art[NameObject("/Kids")] = ArrayObject(kind_refs)
    seite[NameObject("/Annots")] = ArrayObject([refs["name"], refs["agb"], *kind_refs, refs["land"]])
    helv = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    w._root_object[NameObject("/AcroForm")] = DictionaryObject({
        NameObject("/Fields"): ArrayObject(refs.values()),
        NameObject("/DR"): DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/Helv"): w._add_object(helv)})}),
        NameObject("/DA"): TextStringObject("/Helv 10 Tf 0 g"),
    })
    w.encrypt(user_password="", owner_password="geheim", algorithm="RC4-128")  # wie die Bankformulare: oeffnen ohne Passwort
    with open(pfad, "wb") as f:
        w.write(f)


@unittest.skipIf(PdfWriter is None, "pypdf fehlt (lokal: ~/.venvs/analyse/bin/python -m unittest tests/test_pdf_formular.py)")
class PdfFormular(unittest.TestCase):
    def setUp(self):
        import pdf_formular
        self.p = pdf_formular
        self.dir = tempfile.TemporaryDirectory()
        self.quelle = Path(self.dir.name) / "formular.pdf"
        self.ziel = Path(self.dir.name) / "ausgefuellt.pdf"
        formular(self.quelle)

    def tearDown(self):
        self.dir.cleanup()

    def test_felder(self):
        f = {x["name"]: x for x in self.p.felder(self.quelle)}
        self.assertEqual(f["name"]["typ"], "text")
        self.assertEqual(f["agb"]["typ"], "kreuz")
        self.assertIn("/Ja", f["agb"]["werte"])
        self.assertEqual(f["art"]["typ"], "radio")
        self.assertEqual(set(f["art"]["werte"]) - {"/Off"}, {"/Privat", "/Firma"})
        self.assertEqual(f["land"], {"name": "land", "typ": "auswahl", "werte": ["DE", "AT"], "wert": None})

    def test_ausfuellen(self):
        self.p.ausfuellen(self.quelle, {"name": "Erika Muster", "agb": "Ja", "art": "/Firma", "land": "AT"}, self.ziel, vorschau=False)
        r = PdfReader(self.ziel)
        if r.is_encrypted:
            r.decrypt("")
        werte = {k: f.get("/V") for k, f in r.get_fields().items()}
        self.assertEqual((werte["name"], werte["agb"], werte["art"], werte["land"]), ("Erika Muster", "/Ja", "/Firma", "AT"))
        annots = [a.get_object() for a in r.pages[0]["/Annots"]]
        self.assertEqual([a.get("/AS") for a in annots[1:4]], ["/Ja", "/Off", "/Firma"])
        self.assertTrue(r.trailer["/Root"]["/AcroForm"]["/NeedAppearances"])

    def test_falsche_werte_brechen_ab(self):
        for werte in ({"gibtsnicht": "x"}, {"art": "/Verein"}, {"land": "CH"}):
            with self.assertRaises(SystemExit):
                self.p.ausfuellen(self.quelle, werte, self.ziel, vorschau=False)
        self.assertFalse(self.ziel.exists())


if __name__ == "__main__":
    unittest.main()
