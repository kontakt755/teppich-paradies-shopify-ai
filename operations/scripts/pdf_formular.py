#!/usr/bin/env python3
"""PDF-Formulare (AcroForm) auslesen und ausfuellen - auch verschluesselte ohne Passwort.

  ~/.venvs/analyse/bin/python operations/scripts/pdf_formular.py felder <pdf>
  ~/.venvs/analyse/bin/python operations/scripts/pdf_formular.py ausfuellen <pdf> <werte.json> <ziel.pdf>

`felder` gibt JSON aus: Name, Typ (text, auswahl, kreuz, radio) und erlaubte Werte.
`werte.json` ist ein Objekt {Feldname: Wert}; bei kreuz/radio ist der Wert ein
Zustand aus `felder` (z. B. "/Ja", der Schraegstrich darf fehlen, "/Off" = leer).
Neben dem Ziel entsteht per Quick Look eine PNG-Vorschau der ersten Seite
(poppler zeigt Kreuze teils falsch); ohne qlmanage (nicht macOS) entfaellt sie.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

RADIO = 1 << 15


def lesen(pfad):
    reader = PdfReader(pfad)
    if reader.is_encrypted:
        reader.decrypt("")  # Formulare der Banken sind nur gegen Aendern geschuetzt, leeres Benutzerpasswort
    return reader


def _typ(feld):
    ft = feld.get("/FT")
    if ft == "/Btn":
        return "radio" if int(feld.get("/Ff", 0)) & RADIO else "kreuz"
    return {"/Tx": "text", "/Ch": "auswahl"}.get(ft, str(ft))


def _werte(feld):
    if feld.get("/FT") == "/Btn":
        return [str(s) for s in feld.get("/_States_", [])]
    if feld.get("/FT") == "/Ch":
        return [str(o[0] if isinstance(o, list) else o) for o in feld.get("/Opt", [])]
    return []


def felder(pfad):
    return [
        {"name": name, "typ": _typ(f), "werte": _werte(f), "wert": None if f.get("/V") is None else str(f.get("/V"))}
        for name, f in (lesen(pfad).get_fields() or {}).items()
    ]


def _voller_name(obj):
    teile = []
    while obj is not None:
        if "/T" in obj:
            teile.append(str(obj["/T"]))
        obj = obj.get("/Parent")
        obj = obj.get_object() if obj is not None else None
    return ".".join(reversed(teile))


def _pruefen(werte, liste):
    """Unbekannte Felder und Werte ausserhalb der erlaubten Liste brechen ab, statt still nichts zu tun."""
    nach_name = {f["name"]: f for f in liste}
    fehler = []
    for name, wert in werte.items():
        feld = nach_name.get(name)
        if feld is None:
            fehler.append(f"unbekanntes Feld: {name}")
        elif feld["typ"] in ("kreuz", "radio"):
            if "/" + str(wert).lstrip("/") not in feld["werte"]:
                fehler.append(f"{name}: {wert!r} nicht in {feld['werte']}")
        elif feld["typ"] == "auswahl" and feld["werte"] and wert not in feld["werte"]:
            fehler.append(f"{name}: {wert!r} nicht in {feld['werte']}")
    if fehler:
        raise SystemExit("Abbruch, nichts geschrieben:\n  " + "\n  ".join(fehler))
    return nach_name


def ausfuellen(pdf, werte, ziel, vorschau=True):
    nach_name = _pruefen(werte, felder(pdf))
    knoepfe = {n: NameObject("/" + str(w).lstrip("/")) for n, w in werte.items() if nach_name[n]["typ"] in ("kreuz", "radio")}
    texte = {n: str(w) for n, w in werte.items() if n not in knoepfe}

    writer = PdfWriter(clone_from=lesen(pdf))
    for seite in writer.pages:
        if texte:
            writer.update_page_form_field_values(seite, texte, auto_regenerate=False)
        for annot in seite.get("/Annots", []) or []:
            widget = annot.get_object()
            name = _voller_name(widget)
            if name not in knoepfe:
                continue
            zustand = knoepfe[name]
            feld = widget if "/FT" in widget else widget["/Parent"].get_object()
            feld[NameObject("/V")] = zustand
            # Radio: jedes Widget hat seinen eigenen An-Zustand, alle anderen gehen auf /Off
            an = zustand in widget.get("/AP", {}).get("/N", {})
            widget[NameObject("/AS")] = zustand if an else NameObject("/Off")
    writer.set_need_appearances_writer(True)
    ziel = Path(ziel)
    with open(ziel, "wb") as f:
        writer.write(f)

    if vorschau and shutil.which("qlmanage"):
        # shortcut: nur Seite 1 (Quick-Look-Vorschaubild); mehrseitige Formulare bei Bedarf seitenweise rendern
        subprocess.run(["qlmanage", "-t", "-s", "900", "-o", str(ziel.parent), str(ziel)], check=True, capture_output=True)
        return ziel.parent / (ziel.name + ".png")
    return None


def main(argv):
    if len(argv) == 2 and argv[0] == "felder":
        print(json.dumps(felder(argv[1]), ensure_ascii=False, indent=2))
    elif len(argv) == 4 and argv[0] == "ausfuellen":
        werte = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
        png = ausfuellen(argv[1], werte, argv[3])
        print(f"geschrieben: {argv[3]}" + (f"\nVorschau: {png}" if png else "\nkeine Vorschau (qlmanage fehlt)"))
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
