#!/usr/bin/env python3
"""Kompositor und Abnahmetest fuer KI-erweiterte Produktfotos (Teppich/Rollenware).

Warum es das gibt
-----------------
Ein KI-erweitertes Teppichfoto sieht auf den ersten Blick immer gut aus. Zwei
Fehler fallen erst auf, wenn der Kunde die Ware in der Hand haelt:

  1. Der Farbton driftet.  -> Retoure.
  2. Die Florzeichnung wird gleichmaessig ueber die ganze Flaeche gelegt,
     statt nach hinten abzufallen. Das Ergebnis sieht aus wie gepresster
     Filz, nicht wie Schnittflor.

Fehler 2 sieht man mit blossem Auge sofort, kann ihn aber nicht benennen und
damit auch nicht automatisch aussortieren. Dieses Skript misst beides - und
setzt auf Wunsch die Originalpixel bitgenau wieder ein.

Gemessen am 2026-09-09 an der Serie der Fotografin (Foto 31, Sandbeige):

  Quelle (Referenz)                    vorn 8,76 %  hinten 2,73 %  Verlauf 3,21x
  FLUX.2 Pro Outpaint, ihr Bereich     vorn 8,22 %  hinten 2,28 %  Verlauf 3,60x
  FLUX.2 Pro Outpaint, Rand erzeugt    vorn 7,19 %  hinten 4,89 %  Verlauf 1,47x
  Higgsfield outpaint (neu gerendert)  vorn 9,64 %  hinten 12,10 % Verlauf 0,80x

Der letzte Fall ist der Filz: Verlauf unter 1,0 heisst, die Zeichnung ist
hinten staerker als vorn - die Tiefe ist umgekehrt. Das kann kein Objektiv.
Wichtig: dieses Bild besteht den Farbtest (0,3 Prozentpunkte) und faellt
trotzdem durch. Farbe allein reicht als Pruefung nicht.

Schwellen
---------
  Verlauf  >= 1,5   brauchbar        < 1,0  verwerfen (Filz)
  Farbton  <= 1,5 Prozentpunkte Abweichung im R-B-Verhaeltnis zur Weissreferenz
  Pixel    nach dem Kompositieren muss die Abweichung exakt 0 sein

Aufruf
------
  # nur messen
  bild-qualitaetstest.py quelle.jpg

  # Ergebnis gegen Quelle pruefen; --bei nennt die Ecke, an der die Quelle
  # unskaliert im Ergebnis sitzt (bei per-Seite-Outpaint = expand_left/top)
  bild-qualitaetstest.py quelle.jpg ergebnis.png --bei 400,0

  # Originalpixel bitgenau einsetzen und verlustfrei ausgeben
  bild-qualitaetstest.py quelle.jpg ergebnis.png --bei 400,0 --ausgabe fertig.png

Braucht nur `sips` (macOS) fuer die Formatwandlung, sonst reines Python.
"""

import os
import struct
import subprocess
import sys
import tempfile

# Messregionen als Anteil des Quell-Rechtecks (nicht der Gesamtleinwand!).
# Passend fuer die Bodenaufnahmen der Serie: Kamera schraeg von oben,
# Sockelleiste im oberen Drittel, Flor fuellt die untere Bildhaelfte.
FLOR_VORN = (0.15, 0.75, 0.58, 0.94)
FLOR_HINTEN = (0.15, 0.52, 0.58, 0.62)

VERLAUF_GUT = 1.5
VERLAUF_FILZ = 1.0
FARBE_TOLERANZ = 1.5
NAHT_TOLERANZ = 6.0   # Helligkeitssprung ueber die Kante, in Stufen von 255


def _sips(*args):
    r = subprocess.run(["sips", *args], capture_output=True)
    return r.returncode == 0


def nach_bmp(pfad):
    if pfad.lower().endswith(".bmp"):
        return pfad
    ziel = os.path.join(tempfile.mkdtemp(), "bild.bmp")
    if not _sips("-s", "format", "bmp", pfad, "--out", ziel) or not os.path.exists(ziel):
        sys.exit(f"Konnte {pfad} nicht nach BMP wandeln - ist sips vorhanden?")
    return ziel


class Bild:
    def __init__(self, pfad):
        self.name = os.path.basename(pfad)
        d = open(nach_bmp(pfad), "rb").read()
        self.d = d
        self.off = struct.unpack_from("<I", d, 10)[0]
        w, h = struct.unpack_from("<ii", d, 18)
        bpp = struct.unpack_from("<H", d, 28)[0]
        if bpp not in (24, 32):
            sys.exit(f"{self.name}: {bpp} bpp wird nicht unterstuetzt")
        # 32 bpp kommt bei PNG mit Alphakanal - ohne diese Fallunterscheidung
        # sind alle Offsets falsch und man misst Muell.
        self.px = bpp // 8
        self.w, self.h = w, abs(h)
        self.bottom_up = h > 0
        self.row = (w * self.px + 3) // 4 * 4

    def rgb(self, x, y):
        yy = self.h - 1 - y if self.bottom_up else y
        i = self.off + yy * self.row + x * self.px
        return self.d[i + 2], self.d[i + 1], self.d[i]

    def lum(self, x, y):
        r, g, b = self.rgb(x, y)
        return 0.299 * r + 0.587 * g + 0.114 * b


class Roi:
    """Rechteck, in dem das Motiv der Quelle liegt. Alle Messregionen werden
    relativ dazu berechnet - sonst misst man bei erweiterter Leinwand eine
    andere Stelle des Motivs als in der Quelle."""

    def __init__(self, x, y, w, h):
        self.x, self.y, self.w, self.h = x, y, w, h

    def kasten(self, anteil):
        a, b, c, d = anteil
        return (self.x + int(a * self.w), self.y + int(b * self.h),
                self.x + int(c * self.w), self.y + int(d * self.h))

    def passt_in(self, bild):
        return (self.x >= 0 and self.y >= 0
                and self.x + self.w <= bild.w and self.y + self.h <= bild.h)


def mikrokontrast(bild, kasten, schritt=1):
    """Mittlere Helligkeitsdifferenz benachbarter Punkte, normiert auf die
    mittlere Helligkeit. Die Normierung macht das Mass unabhaengig davon, ob
    das Bild hell oder dunkel entwickelt wurde."""
    x0, y0, x1, y1 = kasten
    x1 = min(x1, bild.w - schritt - 1)
    y1 = min(y1, bild.h - schritt - 1)
    summe = flaeche = 0.0
    n = 0
    for y in range(y0, y1, schritt):
        for x in range(x0, x1, schritt):
            a = bild.lum(x, y)
            summe += abs(a - bild.lum(x + schritt, y)) + abs(a - bild.lum(x, y + schritt))
            flaeche += a
            n += 1
    if not n or flaeche <= 0:
        return 0.0
    return (summe / (2 * n)) / (flaeche / n) * 100


def mittel(bild, kasten, schritt=3):
    x0, y0, x1, y1 = kasten
    x1, y1 = min(x1, bild.w), min(y1, bild.h)
    a = [0.0, 0.0, 0.0]
    n = 0
    for y in range(y0, y1, schritt):
        for x in range(x0, x1, schritt):
            r, g, b = bild.rgb(x, y)
            a[0] += r
            a[1] += g
            a[2] += b
            n += 1
    return [v / n for v in a] if n else [0.0, 0.0, 0.0]


def weissreferenz(bild, roi):
    """Hellste Kachel im oberen Teil des Motivs - in dieser Serie ist das der
    weisse Pouf bzw. die Wand. Ein neutrales Objekt im Bild ist die
    Voraussetzung dafuer, dass der Farbtest ueberhaupt funktioniert."""
    beste = None
    kante = max(20, roi.w // 40)
    for y in range(roi.y, roi.y + int(roi.h * 0.45) - kante, kante):
        for x in range(roi.x, roi.x + roi.w - kante, kante):
            c = mittel(bild, (x, y, x + kante, y + kante), 2)
            hell = sum(c) / 3
            if beste is None or hell > beste[0]:
                beste = (hell, c)
    return beste[1] if beste else [255.0, 255.0, 255.0]


def messe(bild, roi, etikett):
    vorn = mikrokontrast(bild, roi.kasten(FLOR_VORN))
    hinten = mikrokontrast(bild, roi.kasten(FLOR_HINTEN))
    flor = mittel(bild, roi.kasten(FLOR_VORN))
    weiss = weissreferenz(bild, roi)
    quot = [flor[i] / weiss[i] if weiss[i] else 0.0 for i in range(3)]
    return {
        "etikett": etikett,
        "vorn": vorn,
        "hinten": hinten,
        "verlauf": vorn / hinten if hinten > 0 else 0.0,
        "hex": "#%02x%02x%02x" % tuple(min(255, round(v)) for v in flor),
        "waerme": (quot[0] - quot[2]) * 100,
    }


def pixeltreue(quelle, ergebnis, roi):
    """Vergleicht JEDES Pixel des eingesetzten Bereichs. Eine Stichprobe wuerde
    eine kleine, oertlich begrenzte Aenderung uebersehen - genau die, die ein
    Modell beim Nachbessern einer Kante macht."""
    abweichend = 0
    groesste = 0
    summe = 0
    erste = []
    for y in range(roi.h):
        for x in range(roi.w):
            a = quelle.rgb(x, y)
            b = ergebnis.rgb(roi.x + x, roi.y + y)
            d = max(abs(a[i] - b[i]) for i in range(3))
            if d:
                abweichend += 1
                summe += d
                if d > groesste:
                    groesste = d
                if len(erste) < 5:
                    erste.append((roi.x + x, roi.y + y, d))
    gesamt = roi.w * roi.h
    return {
        "gesamt": gesamt,
        "abweichend": abweichend,
        "anteil": abweichend / gesamt * 100 if gesamt else 0.0,
        "groesste": groesste,
        "mittel": summe / abweichend if abweichend else 0.0,
        "erste": erste,
    }


SRGB_PROFIL = "/System/Library/ColorSync/Profiles/sRGB Profile.icc"


def profil_von(pfad):
    r = subprocess.run(["sips", "-g", "profile", pfad], capture_output=True, text=True)
    for zeile in r.stdout.splitlines():
        if "profile:" in zeile:
            return zeile.split("profile:", 1)[1].strip()
    return None


def setze_profil(pfad):
    """Gleiche RGB-Zahlen ergeben ohne gleiches Profil nicht die gleiche Farbe.
    Der selbst geschriebene BMP traegt keines, deshalb wird der Ausgabe
    ausdruecklich sRGB mitgegeben - dasselbe Profil, das die Kameradateien
    der Serie tragen."""
    if os.path.exists(SRGB_PROFIL):
        _sips("-m", SRGB_PROFIL, pfad)
    return profil_von(pfad)


def schreibe_bmp(pfad, w, h, hole_rgb):
    """24-bpp BMP, bottom-up. Verlustfrei - danach wandelt sips nach PNG."""
    row = (w * 3 + 3) // 4 * 4
    puffer = bytearray(row * h)
    for y in range(h):
        ziel = (h - 1 - y) * row
        zeile = bytearray(row)
        i = 0
        for x in range(w):
            r, g, b = hole_rgb(x, y)
            zeile[i] = b
            zeile[i + 1] = g
            zeile[i + 2] = r
            i += 3
        puffer[ziel:ziel + row] = zeile
    kopf = bytearray(54)
    kopf[0:2] = b"BM"
    struct.pack_into("<I", kopf, 2, 54 + len(puffer))
    struct.pack_into("<I", kopf, 10, 54)
    struct.pack_into("<I", kopf, 14, 40)
    struct.pack_into("<ii", kopf, 18, w, h)
    struct.pack_into("<HH", kopf, 26, 1, 24)
    struct.pack_into("<I", kopf, 34, len(puffer))
    open(pfad, "wb").write(bytes(kopf) + bytes(puffer))


SEITEN = ("links", "rechts", "oben", "unten")


def _kantenbaender(bild, roi, seite, band):
    """(innen, aussen) - zwei schmale Streifen beiderseits einer ROI-Kante."""
    x, y, w, h = roi.x, roi.y, roi.w, roi.h
    if seite == "links":
        return (x, y, x + band, y + h), (x - band, y, x, y + h)
    if seite == "rechts":
        return (x + w - band, y, x + w, y + h), (x + w, y, x + w + band, y + h)
    if seite == "oben":
        return (x, y, x + w, y + band), (x, y - band, x + w, y)
    return (x, y + h - band, x + w, y + h), (x, y + h, x + w, y + h + band)


def nahtmessung(bild, roi, band=12):
    """Wie stark springt die Helligkeit ueber die ROI-Kante? Das Original bleibt
    unveraendert, der KI-Rand wurde aber zu einem leicht anderen Innenbereich
    erzeugt - genau dort entsteht die sichtbare Kante."""
    ergebnis = {}
    for seite in SEITEN:
        innen, aussen = _kantenbaender(bild, roi, seite, band)
        if (aussen[0] < 0 or aussen[1] < 0
                or aussen[2] > bild.w or aussen[3] > bild.h
                or aussen[2] <= aussen[0] or aussen[3] <= aussen[1]):
            continue  # an dieser Seite wurde nicht erweitert
        mi = mittel(bild, innen, 2)
        ma = mittel(bild, aussen, 2)
        ergebnis[seite] = {
            "innen": mi, "aussen": ma,
            "delta": max(abs(mi[i] - ma[i]) for i in range(3)),
            "gain": [mi[i] / ma[i] if ma[i] else 1.0 for i in range(3)],
        }
    return ergebnis


def komponiere(quelle, ergebnis, roi, ausgabe, band=40):
    """Raender aus dem KI-Ergebnis, Motiv aus der Quelle - unskaliert und
    bitgenau. Damit ist die Pixeltreue nicht mehr eine Messung, sondern eine
    Eigenschaft der Ausgabe.

    Der Uebergang wird ausschliesslich AUSSERHALB des Quellrechtecks
    angeglichen: ein schmales Band bekommt einen Helligkeitsverlauf, der an der
    Kante die Werte des Originals trifft und nach aussen auf 1,0 auslaeuft.
    Die Originalpixel werden dabei nicht angefasst."""
    naht = nahtmessung(ergebnis, roi)

    def seite_und_abstand(x, y):
        if x < roi.x:
            return "links", roi.x - x
        if x >= roi.x + roi.w:
            return "rechts", x - (roi.x + roi.w) + 1
        if y < roi.y:
            return "oben", roi.y - y
        return "unten", y - (roi.y + roi.h) + 1

    def hole(x, y):
        if roi.x <= x < roi.x + roi.w and roi.y <= y < roi.y + roi.h:
            return quelle.rgb(x - roi.x, y - roi.y)
        r, g, b = ergebnis.rgb(x, y)
        seite, d = seite_und_abstand(x, y)
        info = naht.get(seite)
        if not info or d > band:
            return r, g, b
        t = 1.0 - d / band                       # 1 an der Kante, 0 am Bandende
        gain = info["gain"]
        return tuple(min(255, max(0, round(v * (1 + (gain[i] - 1) * t))))
                     for i, v in enumerate((r, g, b)))

    tmp = os.path.join(tempfile.mkdtemp(), "komposit.bmp")
    schreibe_bmp(tmp, ergebnis.w, ergebnis.h, hole)
    if ausgabe.lower().endswith(".bmp"):
        os.replace(tmp, ausgabe)
    else:
        fmt = "png" if ausgabe.lower().endswith(".png") else "jpeg"
        if fmt == "jpeg":
            print("  Hinweis: JPEG ist verlustbehaftet - fuer Pixelgleichheit .png nehmen.")
        if not _sips("-s", "format", fmt, tmp, "--out", ausgabe):
            sys.exit(f"Konnte {ausgabe} nicht schreiben")
    setze_profil(ausgabe)
    return naht


def urteil(m):
    if m["verlauf"] < VERLAUF_FILZ:
        return "VERWERFEN - Tiefe umgekehrt, wirkt wie Filz"
    if m["verlauf"] < VERLAUF_GUT:
        return "GRENZWERTIG - Zeichnung zu flach"
    return "OK"


def zeile(m):
    print(f"{m['etikett'][:37]:38}{m['vorn']:7.2f}%{m['hinten']:7.2f}%"
          f"{m['verlauf']:8.2f}x{m['hex']:>10}{m['waerme']:+7.1f}%")


def main():
    argv = sys.argv[1:]
    bei = (0, 0)
    ausgabe = None
    pfade = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--bei" and i + 1 < len(argv):
            teile = argv[i + 1].replace(" ", "").split(",")
            bei = (int(teile[0]), int(teile[1]) if len(teile) > 1 else 0)
            i += 2
        elif a == "--ausgabe" and i + 1 < len(argv):
            ausgabe = argv[i + 1]
            i += 2
        elif a.startswith("--"):
            sys.exit(f"Unbekannte Option {a}")
        else:
            pfade.append(a)
            i += 1
    if not pfade:
        sys.exit(__doc__)

    quelle = Bild(pfade[0])
    roi_q = Roi(0, 0, quelle.w, quelle.h)
    mq = messe(quelle, roi_q, f"{quelle.name} (Quelle)")

    print(f"\n{'Bild':38}{'vorn':>8}{'hinten':>8}{'Verlauf':>9}{'Farbe':>10}{'Waerme':>8}")
    print("-" * 81)
    zeile(mq)

    if len(pfade) < 2:
        print(f"\n  Struktur: {urteil(mq)}\n")
        return

    erg = Bild(pfade[1])
    roi_e = Roi(bei[0], bei[1], quelle.w, quelle.h)
    if not roi_e.passt_in(erg):
        sys.exit(f"\nQuelle {quelle.w}x{quelle.h} passt bei Versatz {bei} nicht "
                 f"in Ergebnis {erg.w}x{erg.h}.")
    zeile(messe(erg, roi_e, f"{erg.name} (Ergebnis)"))
    print()

    fehler = []
    p = pixeltreue(quelle, erg, roi_e)
    print(f"  Pixeltreue im eingesetzten Bereich ({p['gesamt']} Pixel vollstaendig geprueft):")
    if not p["abweichend"]:
        print("    bitgenau identisch")
    else:
        print(f"    {p['abweichend']} Pixel abweichend ({p['anteil']:.2f} %), "
              f"groesste Kanalabweichung {p['groesste']}, mittlere {p['mittel']:.1f}")
        print(f"    erste Fundstellen: {p['erste']}")
        print("    -> Modell hat die Quelle veraendert, nicht nur erweitert."
              if p["groesste"] > 24 else
              "    -> Abweichung im Bereich der Kompressionstoleranz.")

    if ausgabe:
        naht = komponiere(quelle, erg, roi_e, ausgabe)
        neu = Bild(ausgabe)
        pn = pixeltreue(quelle, neu, roi_e)
        m2 = messe(neu, roi_e, f"{os.path.basename(ausgabe)} (komponiert)")
        print(f"\n  Komposit geschrieben: {ausgabe} ({neu.w}x{neu.h})")
        print(f"    Farbprofil: {profil_von(ausgabe)}")
        print(f"    abweichende Pixel im Motiv: {pn['abweichend']}"
              f" ({'bitgenau' if not pn['abweichend'] else 'FEHLER'})")
        if pn["abweichend"]:
            fehler.append("Originalpixel nicht bitgenau uebernommen")

        nach = nahtmessung(neu, roi_e)
        print("    Naht (Helligkeitssprung ueber die Kante, nach Angleich):")
        for seite in SEITEN:
            if seite in nach:
                vor = naht[seite]["delta"] if seite in naht else float("nan")
                print(f"      {seite:7} vorher {vor:5.1f}  nachher {nach[seite]['delta']:5.1f}")
                if nach[seite]["delta"] > NAHT_TOLERANZ:
                    fehler.append(f"sichtbare Naht {seite} ({nach[seite]['delta']:.1f})")
        print()
        zeile(m2)
        ziel = m2
    else:
        ziel = messe(erg, roi_e, "")

    d = abs(ziel["waerme"] - mq["waerme"])
    print(f"\n  Farbtonabweichung: {d:.1f} Prozentpunkte "
          f"({'ok' if d <= FARBE_TOLERANZ else 'zu gross'})")
    if d > FARBE_TOLERANZ:
        fehler.append(f"Farbton {d:.1f} Prozentpunkte")
    u = urteil(ziel)
    print(f"  Struktur: {u}")
    if not u.startswith("OK"):
        fehler.append(f"Struktur: {u}")

    if fehler:
        print(f"\n  ABGELEHNT: {'; '.join(fehler)}\n")
        sys.exit(1)
    print("\n  ANGENOMMEN\n")


if __name__ == "__main__":
    main()
