#!/usr/bin/env python3
"""PDF-Helfer des Rechnungs-Archivs (npm run belege:monat). Braucht pypdf: ~/.venvs/analyse.

  belege_pdf.py analyse   PDF auf stdin -> JSON: Seiten, Text, eingebettete Dateien (base64)
  belege_pdf.py seiten    Pfad -> Seitenzahl
  belege_pdf.py fuegen    Plan-JSON auf stdin ({"ausgabe", "teile": [{"pfad", "titel"}]})
                          -> eine Datei mit Lesezeichen, schreibt erst ganz zum Schluss

Die PDFs kommen aus fremden Mails: gelesen wird nur (Text, Struktur), ausgefuehrt wird nichts.
"""
import base64
import io
import json
import os
import sys

from pypdf import PdfReader, PdfWriter

TEXT_MAX = 400_000


def oeffnen(quelle):
    reader = PdfReader(quelle)
    if reader.is_encrypted:
        # Viele Rechnungen sind nur gegen Aendern geschuetzt: leeres Passwort reicht zum Lesen.
        if not reader.decrypt(""):
            raise ValueError("verschluesselt")
    return reader


def eingebettete_dateien(reader):
    gefunden = []
    try:
        anhaenge = reader.attachments
        for name in anhaenge:
            for inhalt in anhaenge[name]:
                gefunden.append({"name": str(name), "inhalt": base64.b64encode(inhalt).decode("ascii")})
    except Exception as fehler:  # kaputter Namensbaum: Beleg bleibt lesbar, Hinweis genuegt
        return gefunden, f"Anhaenge im PDF nicht lesbar: {type(fehler).__name__}"
    return gefunden, None


def analyse(daten):
    try:
        reader = oeffnen(io.BytesIO(daten))
    except Exception as fehler:
        art = "verschluesselt" if "verschluesselt" in str(fehler) else type(fehler).__name__
        return {"lesbar": False, "fehler": art, "seiten": 0, "text": "", "eingebettet": []}
    teile = []
    laenge = 0
    for seite in reader.pages:
        try:
            stueck = seite.extract_text(extraction_mode="layout") or ""
        except Exception:
            try:
                stueck = seite.extract_text() or ""
            except Exception:
                stueck = ""
        teile.append(stueck)
        laenge += len(stueck)
        if laenge > TEXT_MAX:
            break
    eingebettet, hinweis = eingebettete_dateien(reader)
    return {
        "lesbar": True,
        "seiten": len(reader.pages),
        "text": "\n".join(teile)[:TEXT_MAX],
        "eingebettet": eingebettet,
        "hinweis": hinweis,
    }


def fuegen(plan):
    writer = PdfWriter()
    seiten = []
    fehler = []
    for teil in plan["teile"]:
        start = len(writer.pages)
        try:
            reader = oeffnen(teil["pfad"])
            for seite in reader.pages:
                writer.add_page(seite)
        except Exception as e:
            fehler.append({"pfad": teil["pfad"], "fehler": type(e).__name__})
            continue
        if teil.get("titel"):
            writer.add_outline_item(teil["titel"], start)
        seiten.append({"pfad": teil["pfad"], "start": start + 1, "seiten": len(writer.pages) - start})
    # Erst vollstaendig in eine Nachbardatei, dann umbenennen: nie ein halbes Druck-PDF.
    ziel = plan["ausgabe"]
    temp = f"{ziel}.{os.getpid()}.tmp"
    with open(temp, "wb") as datei:
        writer.write(datei)
    os.replace(temp, ziel)
    return {"seiten": len(writer.pages), "teile": seiten, "fehler": fehler}


def main():
    befehl = sys.argv[1] if len(sys.argv) > 1 else ""
    if befehl == "analyse":
        print(json.dumps(analyse(sys.stdin.buffer.read())))
    elif befehl == "seiten":
        print(json.dumps({"seiten": len(oeffnen(sys.argv[2]).pages)}))
    elif befehl == "fuegen":
        print(json.dumps(fuegen(json.load(sys.stdin))))
    else:
        sys.exit("Befehl fehlt: analyse | seiten | fuegen")


if __name__ == "__main__":
    main()
