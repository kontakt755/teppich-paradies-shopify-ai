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

Erzeugte Raender
----------------
Mit Ergebnisbild wird jeder KI-erzeugte Randstreifen zusaetzlich fuer sich
gemessen - nur mit seinen eigenen Pixeln, auch der Nachbar an der Naht wird
nicht mitgelesen. Das Motiv allein reicht nicht: nach dem Kompositieren sind
das die Originalpixel, das Urteil waere immer das der Quelle. Ein Rand, dessen
Urteil nicht OK ist, fuehrt zur Ablehnung.

  links/rechts  dieselben Zeilen wie die Messkaesten der Quelle, dieselben
                Schwellen wie das Motiv
  unten         obere gegen untere Lage des Streifens, die unteren Ecken
                je fuer sich. Die Schwelle 1,5 gilt fuer den Tiefenumfang
                der Quellkaesten; fuer den kuerzeren Umfang eines Streifens
                wird sie umgerechnet (verlauf_schwelle_unten - ein Modell,
                an echten Outpaint-Fotos nicht kalibriert), Filz bleibt
                < 1,0. Liegt die umgerechnete Schwelle weniger als
                UNTEN_MIN_ABSTAND ueber 1,0, ist der Streifen zu niedrig
                fuer eine Tiefenaussage -> "nicht messbar"
  oben          liegt ueber der Florzone -> "nicht messbar"

Ein Streifen, dessen Messkasten kleiner als RAND_MIN_KASTEN ist, wird
ebenfalls als "nicht messbar" gemeldet. Das lehnt nicht ab, steht aber
ausdruecklich in der Ausgabe (Begruendung bei messe_raender).

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

# Messkaesten im unteren Randstreifen, als Anteil seiner Hoehe (x ueber die
# ganze Streifenbreite). Der Streifen liegt naeher an der Kamera als alles in
# der Quelle; innerhalb des Streifens gilt dieselbe Regel: oben ferner, unten
# naeher. Die beiden Kaesten liegen so weit auseinander wie moeglich, damit
# der geringere Tiefenumfang eines schmalen Streifens nicht noch weiter
# schrumpft. Die Schwelle dafuer rechnet verlauf_schwelle_unten aus.
UNTEN_HINTEN = (0.05, 0.35)
UNTEN_VORN = (0.65, 0.95)

# Kleinste Kantenlaenge eines Messkastens im Randstreifen, in Pixeln. Darunter
# stehen in einem Kasten nur noch wenige Florbueschel, der Mikrokontrast
# haengt dann an einzelnen Fasern statt an der Zeichnung.
RAND_MIN_KASTEN = 32

# Kleinster Abstand, den die umgerechnete Schwelle eines unteren Streifens
# (verlauf_schwelle_unten) ueber VERLAUF_FILZ haben muss. Annahme, kein
# Messwert: ein Verlauf ist der Quotient zweier Mikrokontraste, und die
# schwanken auch ohne jeden Tiefenunterschied - Florbueschel, Licht,
# Kompression. Wie weit, ist an echten Outpaint-Fotos nicht vermessen. Liegt
# die Schwelle naeher an 1,0, trennt sie Filz nicht mehr von einer
# Fortsetzung, dann entscheidet diese Schwankung das Urteil. Der Streifen ist
# zu niedrig fuer eine Tiefenaussage und wird als "nicht messbar" gemeldet.
# 0,05 ist ein Zehntel des Abstands, den das Motiv zwischen Filz und
# brauchbar laesst (VERLAUF_GUT - VERLAUF_FILZ); gesetzt, nicht kalibriert.
# Im Modell von verlauf_schwelle_unten trifft das Streifen unter rund 8 %
# der Quellhoehe.
UNTEN_MIN_ABSTAND = 0.05

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


def _messkasten(bild, kasten, schritt=1):
    """Kasten so gekappt, wie mikrokontrast ihn abtastet: der Nachbar
    (x + schritt, y + schritt) muss noch im Bild liegen. Eine Stelle fuer
    beide Nutzer, damit Messung und Mindestmass nie auseinanderlaufen."""
    x0, y0, x1, y1 = kasten
    return x0, y0, min(x1, bild.w - schritt), min(y1, bild.h - schritt)


def mikrokontrast(bild, kasten, schritt=1):
    """Mittlere Helligkeitsdifferenz benachbarter Punkte, normiert auf die
    mittlere Helligkeit. Die Normierung macht das Mass unabhaengig davon, ob
    das Bild hell oder dunkel entwickelt wurde."""
    x0, y0, x1, y1 = _messkasten(bild, kasten, schritt)
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
    return _messwerte(bild, roi.kasten(FLOR_VORN), roi.kasten(FLOR_HINTEN),
                      weissreferenz(bild, roi), etikett)


def _messwerte(bild, kasten_vorn, kasten_hinten, weiss, etikett):
    vorn = mikrokontrast(bild, kasten_vorn)
    hinten = mikrokontrast(bild, kasten_hinten)
    flor = mittel(bild, kasten_vorn)
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


def urteil(m, gut=VERLAUF_GUT):
    """gut: Verlauf, ab dem die Zeichnung brauchbar ist - fuer das Motiv und
    die seitlichen Raender VERLAUF_GUT, fuer untere Streifen der auf ihren
    Tiefenumfang umgerechnete Wert (verlauf_schwelle_unten)."""
    if m["verlauf"] < VERLAUF_FILZ:
        return "VERWERFEN - Tiefe umgekehrt, wirkt wie Filz"
    if m["verlauf"] < gut:
        return "GRENZWERTIG - Zeichnung zu flach"
    return "OK"


def kopf():
    print(f"\n{'Bild':38}{'vorn':>8}{'hinten':>8}{'Verlauf':>9}{'Farbe':>10}{'Waerme':>8}")
    print("-" * 81)


def zeile(m, zusatz=""):
    print(f"{m['etikett'][:37]:38}{m['vorn']:7.2f}%{m['hinten']:7.2f}%"
          f"{m['verlauf']:8.2f}x{m['hex']:>10}{m['waerme']:+7.1f}%{zusatz}")


def randbereiche(roi, bild):
    """Die KI-erzeugten Randstreifen um das Quellrechteck, je Seite eine Roi.

    Jedes Pixel ausserhalb der Quelle gehoert genau einem Streifen. Links und
    rechts laufen nur ueber die Zeilen der Quelle - so liegen die seitlichen
    Messkaesten in genau denselben Zeilen wie die der Quelle. Oben laeuft ueber
    die ganze Breite (dort wird ohnehin nicht gemessen, siehe messe_raender).
    Die unteren Ecken sind eigene Streifen: sie sind kameranah und gut
    sichtbar, und im Mittel ueber die ganze Bildbreite ginge eine filzige Ecke
    neben einem guten Streifen unter der Quelle unter."""
    r = {}
    rechts, unten = roi.x + roi.w, roi.y + roi.h
    if roi.x > 0:
        r["links"] = Roi(0, roi.y, roi.x, roi.h)
    if rechts < bild.w:
        r["rechts"] = Roi(rechts, roi.y, bild.w - rechts, roi.h)
    if roi.y > 0:
        r["oben"] = Roi(0, 0, bild.w, roi.y)
    if unten < bild.h:
        hu = bild.h - unten
        if roi.x > 0:
            r["unten links"] = Roi(0, unten, roi.x, hu)
        r["unten"] = Roi(roi.x, unten, roi.w, hu)
        if rechts < bild.w:
            r["unten rechts"] = Roi(rechts, unten, bild.w - rechts, hu)
    return r


def _im_streifen(rand, kasten):
    """Kasten so kappen, dass auch der Nachbar (x + 1, y + 1), den
    mikrokontrast mitliest, noch im Streifen liegt. Ohne diese Kappung geht
    an der Naht eine Spalte bzw. Zeile des Nachbarn in die Messung ein - bei
    einem strukturlosen Rand entscheidet dann diese eine Spalte das Urteil,
    und links (Nachbar = Quelle) faellt es anders aus als rechts (Nachbar =
    Bildrand)."""
    x0, y0, x1, y1 = kasten
    return x0, y0, min(x1, rand.x + rand.w - 1), min(y1, rand.y + rand.h - 1)


def _kastenmass(bild, kasten):
    """(Breite, Hoehe) des Kastens in Pixeln, die in die Messung eingehen -
    einschliesslich des letzten Nachbarn, den mikrokontrast liest."""
    x0, y0, x1, y1 = _messkasten(bild, kasten)
    return x1 - x0 + 1, y1 - y0 + 1


def verlauf_schwelle_unten(roi, rand):
    """Verlauf, ab dem ein unterer Streifen als brauchbar gilt.

    VERLAUF_GUT ist am Motiv festgelegt: FLOR_HINTEN gegen FLOR_VORN, die
    Mitten der Kaesten liegen 0,275 Quellhoehen auseinander. Die Kaesten
    eines unteren Streifens liegen nur 0,6 Streifenhoehen auseinander - bei
    einem Streifen von 15 % der Quellhoehe also ein Drittel des
    Tiefenumfangs. Eine Zeichnung, die die Quelle fehlerfrei fortsetzt, bildet
    ueber diesen kuerzeren Umfang einen kleineren Verlauf ab; mit der festen
    Schwelle 1,5 wuerden gute untere Raender abgelehnt.

    Umrechnung, Modellannahme: Boden unter einer Lochkamera - der
    Abbildungsmassstab und damit die Zeichnung wachsen mit dem Zeilenabstand
    zum Horizont; hier vereinfachend linear. VERLAUF_GUT an den Quellkaesten
    entspricht dann genau einem Horizont; derselbe Horizont ergibt fuer die
    Kaesten des Streifens die umgerechnete Schwelle. Sie haengt nur an der
    Geometrie, ist immer > 1,0 und wird bei VERLAUF_GUT gekappt - ein Rand
    wird nicht strenger beurteilt als das Motiv. Je niedriger der Streifen,
    desto naeher liegt sie an 1,0; unter VERLAUF_FILZ + UNTEN_MIN_ABSTAND
    wird der Streifen nicht beurteilt (messe_raender). Filz (< VERLAUF_FILZ,
    Tiefe umgekehrt) haengt nicht am Umfang und bleibt, wie es ist.

    Was davon belegt ist: gemessen ist nur der Verlauf der Quelle von Foto 31,
    3,21x. Das lineare Modell passt nicht einmal zu diesem einen Wert - daran
    angepasst laege der Horizont bei 44,6 % der Quellhoehe, unterhalb der
    Sockelleiste, die in dieser Serie im oberen Drittel steht (siehe
    FLOR_VORN). Die Schwelle ist damit gerechnet, nicht gemessen; die
    Kalibrierung an echten Outpaint-Fotos mit erzeugtem unteren Rand ist
    offen."""
    mitte_q_hinten = roi.y + (FLOR_HINTEN[1] + FLOR_HINTEN[3]) / 2 * roi.h
    mitte_q_vorn = roi.y + (FLOR_VORN[1] + FLOR_VORN[3]) / 2 * roi.h
    horizont = (VERLAUF_GUT * mitte_q_hinten - mitte_q_vorn) / (VERLAUF_GUT - 1)
    mitte_r_hinten = rand.y + sum(UNTEN_HINTEN) / 2 * rand.h
    mitte_r_vorn = rand.y + sum(UNTEN_VORN) / 2 * rand.h
    return min(VERLAUF_GUT, (mitte_r_vorn - horizont) / (mitte_r_hinten - horizont))


def messe_raender(bild, roi, weiss=None):
    """Struktur jedes erzeugten Randstreifens, gemessen nur an dessen Pixeln.

    vorn = kameranah (unten im Bild), hinten = kamerafern (oben), wie beim
    Motiv. Die Entfernung zur Kamera haengt bei dieser Serie nur an der Zeile
    (Horizont waagerecht), daher:

      links/rechts  dieselben Zeilen wie FLOR_VORN/FLOR_HINTEN der Quelle -
                    gleiche Entfernung, der Verlauf ist direkt mit dem der
                    Quelle vergleichbar, Schwelle VERLAUF_GUT.
      unten         UNTEN_HINTEN gegen UNTEN_VORN innerhalb des Streifens,
                    ebenso je untere Ecke; Schwelle verlauf_schwelle_unten.
                    Liegt die unter VERLAUF_FILZ + UNTEN_MIN_ABSTAND, ist
                    der Streifen zu niedrig fuer eine Tiefenaussage: Filz
                    und Fortsetzung liegen dann naeher beieinander als die
                    angenommene Schwankung eines Verlaufs -> nicht messbar.
      oben        nicht messbar: der Streifen liegt vollstaendig ueber der
                    Florzone (die beginnt erst bei FLOR_HINTEN, also bei 52 %
                    der Quellhoehe). Dort stehen in dieser Serie Wand und
                    Sockelleiste - ein Mikrokontrastverlauf davon sagt nichts
                    ueber Filz.

    "nicht messbar" (oben, Messkasten unter RAND_MIN_KASTEN, unterer Streifen
    zu niedrig) lehnt nicht ab: ein Rand, der schmaler als der Mindestkasten
    ist, traegt zu wenig Flaeche fuer den flaechigen Filzeindruck, und oben
    ist keine Florzeichnung, die filzig werden koennte. Ablehnen hiesse, jede
    Erweiterung nach oben zu verbieten, ohne dass das Bild dadurch sicherer
    wird. Beim zu niedrigen unteren Streifen entschiede ein Urteil ueber die
    Schwankung statt ueber die Zeichnung - ablehnen waere so beliebig wie
    annehmen; er wird deshalb behandelt wie ein zu schmaler Rand. Stumm
    bleibt es trotzdem nicht - der Grund steht im Befund und in der Ausgabe.
    Beim zu kleinen Messkasten nennt der Grund beide Kastenmasse: bei
    seitlichen Streifen ist die Hoehe 10 % der Quellhoehe, eine niedrige
    Quelle macht also auch einen breiten Rand unmessbar.

    Rueckgabe: je vorhandenem Rand {"seite", "rand", "messung", "grund",
    "gut"}; genau eines von messung/grund ist gesetzt, gut ist die Schwelle
    fuer urteil."""
    if weiss is None:
        weiss = weissreferenz(bild, roi)
    befunde = []
    for seite, rand in randbereiche(roi, bild).items():
        b = {"seite": seite, "rand": rand, "messung": None, "grund": None,
             "gut": VERLAUF_GUT}
        befunde.append(b)
        if seite == "oben":
            b["grund"] = "liegt ueber der Florzone, keine Florzeichnung zu messen"
            continue
        if seite.startswith("unten"):
            vorn, hinten = UNTEN_VORN, UNTEN_HINTEN
            b["gut"] = verlauf_schwelle_unten(roi, rand)
        else:
            vorn, hinten = FLOR_VORN[1::2], FLOR_HINTEN[1::2]
        kv = _im_streifen(rand, rand.kasten((0.0, vorn[0], 1.0, vorn[1])))
        kh = _im_streifen(rand, rand.kasten((0.0, hinten[0], 1.0, hinten[1])))
        breite = min(_kastenmass(bild, kv)[0], _kastenmass(bild, kh)[0])
        hoehe = min(_kastenmass(bild, kv)[1], _kastenmass(bild, kh)[1])
        if min(breite, hoehe) < RAND_MIN_KASTEN:
            b["grund"] = (f"Messkasten zu klein ({max(breite, 0)}x{max(hoehe, 0)} px, "
                          f"Mindestkante {RAND_MIN_KASTEN} px; Streifen {rand.w}x{rand.h} px)")
            continue
        if seite.startswith("unten") and b["gut"] < VERLAUF_FILZ + UNTEN_MIN_ABSTAND:
            b["grund"] = (f"Streifen zu niedrig fuer eine Tiefenaussage ({rand.h} px = "
                          f"{rand.h / roi.h * 100:.1f} % der Quellhoehe; Schwelle "
                          f"{b['gut']:.3f}x liegt weniger als {UNTEN_MIN_ABSTAND:.2f} "
                          f"ueber {VERLAUF_FILZ:.1f})")
            continue
        b["messung"] = _messwerte(bild, kv, kh, weiss, f"Rand {seite} (erzeugt)")
    return befunde


def beurteile_raender(befunde):
    """(fehler, ungeprueft): ein gemessener Rand, dessen Urteil nicht OK ist,
    ist ein Fehler - genau wie beim Motiv. Nicht messbare Raender werden
    getrennt aufgefuehrt."""
    fehler, ungeprueft = [], []
    for b in befunde:
        if b["messung"] is None:
            ungeprueft.append(f"Rand {b['seite']} {b['grund']}")
            continue
        u = urteil(b["messung"], b["gut"])
        if u != "OK":
            fehler.append(f"Struktur Rand {b['seite']}: {u}")
    return fehler, ungeprueft


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

    kopf()
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
        bild_ziel = neu
    else:
        ziel = messe(erg, roi_e, "")
        bild_ziel = erg

    d = abs(ziel["waerme"] - mq["waerme"])
    print(f"\n  Farbtonabweichung: {d:.1f} Prozentpunkte "
          f"({'ok' if d <= FARBE_TOLERANZ else 'zu gross'})")
    if d > FARBE_TOLERANZ:
        fehler.append(f"Farbton {d:.1f} Prozentpunkte")
    u = urteil(ziel)
    print(f"  Struktur: {u}")
    if not u.startswith("OK"):
        fehler.append(f"Struktur: {u}")

    # Das Motiv-Urteil oben ist nach dem Kompositieren das der Quelle. Was die
    # KI tatsaechlich erzeugt hat, steht nur in den Raendern.
    befunde = messe_raender(bild_ziel, roi_e)
    ungeprueft = []
    if befunde:
        print("\n  Struktur der erzeugten Raender (nur KI-Pixel):")
        kopf()
        for b in befunde:
            if b["messung"]:
                zeile(b["messung"], f"  {urteil(b['messung'], b['gut'])} (ab {b['gut']:.2f}x)")
            else:
                etikett = f"Rand {b['seite']} (erzeugt)"
                print(f"{etikett:38}nicht messbar - {b['grund']}")
        rf, ungeprueft = beurteile_raender(befunde)
        fehler += rf
        if ungeprueft:
            print(f"\n  Ohne Strukturpruefung: {'; '.join(ungeprueft)}")

    if fehler:
        print(f"\n  ABGELEHNT: {'; '.join(fehler)}\n")
        sys.exit(1)
    print("\n  ANGENOMMEN" + (" - Rand ohne Strukturpruefung, siehe oben" if ungeprueft else "")
          + "\n")


if __name__ == "__main__":
    main()
