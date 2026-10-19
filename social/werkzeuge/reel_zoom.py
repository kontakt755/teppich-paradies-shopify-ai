#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy>=1.26", "opencv-python-headless>=4.9", "pillow>=10.4"]
# ///
"""Produkt-Reel aus einem scharfen Standbild: langsamer Zoom und animierte Texte, 1080 x 1920, 10 s, ohne Ton.

Aufruf (aus social/lib/produkt-reel.mjs, per `uv run --script` oder SOCIAL_REEL_PYTHON):
  reel_zoom.py rendern  <auftrag.json> --schrift <woff2|ttf> --logo <png> [--ffmpeg <pfad>]
  reel_zoom.py vorschau <auftrag.json> --schrift <woff2|ttf> --logo <png>
Die letzte Ausgabezeile ist JSON. Exit 2: Auftrag fehlerhaft, 3: Schaerfepruefung nicht bestanden.

Bewegung nur durch Zoom (1,00 -> 1,08, weich an und aus), nichts wird verformt - KI-Videos sind verworfen
(Inhaber 16.10.2026). Jedes Bild wird aus dem Standbild in voller Aufloesung ausgeschnitten und per
Flaechenmittelung verkleinert: wie cv2.INTER_AREA, aber subpixelgenau, sonst ruckelt der Zoom.
Preise prueft der Aufrufer live gegen den Shop; hier wird nur gezeichnet und gemessen.

Pruefung (Pflicht vor dem Vorlegen): jedes Bild ab 0,8 s wird aus der fertigen MP4 dekodiert und in der
Produktflaeche gegen den exakten Render verglichen (Schaerfe = mittlerer quadrierter Sobel-Gradient, PSNR,
Ruckeln per Phasenkorrelation). Dazu an vier Zeitpunkten ein Vergleich mit einer unabhaengigen
cv2.INTER_AREA-Verkleinerung des Standbilds - als Zahl und als Pruefblatt (JPG) zum Ansehen.

Auftrag: {"standbild": "...jpg", "ausschnitt": [x, y, b, h], "zoom": [1.0, 1.08], "anker": [x, y],
          "produktflaeche": [x0, y0, x1, y1], "zeilen": {kicker, name, preis, preis_zusatz, merkmale},
          "stand": "16.10.2026", "fusszeile": "...", "aus": "...mp4", "pruefblatt": "...jpg"}
Ausschnitt in Pixeln des Standbilds (Seitenverhaeltnis 4:5 oder 1:1), Anker = Punkt, der beim Zoomen stehen bleibt.
"""
import json, math, os, subprocess, sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS, DAUER = 1080, 1920, 30, 10.0
HG, SCHWARZ, DUNKEL, GRAU, ROT = (247, 245, 241), (17, 17, 17), (51, 51, 51), (110, 110, 110), (176, 48, 63)
URL = 'teppich-paradies.net'
FUSSZEILE = 'Preise inkl. MwSt., zzgl. Versand (ab 50 € frei)'
VY, RAD = 330, 34
ZEITEN = [0.8, 3.0, 6.0, 9.9]
DETAIL = 300
# Grenzen der Pruefung. Gemessen an elf Reels vom 16.10.2026: Schaerfe >= 0,995, PSNR >= 32,7 dB, Ruckeln <= 0,14 px.
GRENZE_SCHAERFE, GRENZE_PSNR, GRENZE_RUCKELN = 0.95, 30.0, 0.5


class AuftragFehler(Exception):
    pass


# ---------- Zeichnen ----------

class Schrift:
    def __init__(self, pfad):
        if not os.path.exists(pfad): raise AuftragFehler(f'Schrift fehlt: {pfad}')
        self.pfad = pfad

    def __call__(self, gr, gew):
        f = ImageFont.truetype(self.pfad, gr)
        try: f.set_variation_by_axes([gew, 0])
        except Exception: pass   # statische Schrift ohne Achsen
        return f


def text(schrift, t, gr, gew, farbe, abstand=0, maxb=W - 90):
    f = schrift(gr, gew)
    breite = sum(f.getlength(c) for c in t) + abstand * (len(t) - 1) if abstand else f.getlength(t)
    if breite > maxb and gr > 14:   # zu lange Zeile: Schrift verkleinern statt ueber den Rand laufen
        return text(schrift, t, gr - 2, gew, farbe, abstand, maxb)
    oben, unten = f.getmetrics()
    im = Image.new('RGBA', (int(breite) + 6, oben + unten + 6), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if abstand:
        x = 0
        for c in t:
            d.text((x, 0), c, font=f, fill=farbe)
            x += f.getlength(c) + abstand
    else:
        d.text((0, 0), t, font=f, fill=farbe)
    box = im.getbbox()
    return im.crop(box) if box else im


def maske(w, h, r):
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    return m


def schatten(w, h, r):
    s = Image.new('RGBA', (w + 160, h + 160), (0, 0, 0, 0))
    ImageDraw.Draw(s).rounded_rectangle([80, 96, 80 + w, 96 + h], radius=r, fill=(0, 0, 0, 70))
    return s.filter(ImageFilter.GaussianBlur(28))


def raus(p): return 1 - (1 - p) ** 3
def zurueck(p):
    c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2
def weich(p): return 0.5 - 0.5 * math.cos(math.pi * p)   # langsam an, langsam aus
def anteil(t, st, d): return min(1.0, max(0.0, (t - st) / d))


def mit_alpha(im, f):
    if f >= 1: return im
    im = im.copy(); im.putalpha(im.getchannel('A').point(lambda v: int(v * f))); return im


def kastengroesse(b, h):
    """Groesse des Bildkastens im Reel: 1:1 -> 860 x 860, sonst 744 breit (4:5 -> 744 x 930)."""
    if abs(b / h - 1) < 0.02: return 860, 860
    return 744, int(round(744 * h / b))


# ---------- Standbild: subpixelgenaue Flaechenmittelung ----------

def gewichte(a0, laenge, n):
    """Matrix n x m: Ausgabepixel i deckt [a0 + i*s, a0 + (i+1)*s) im Standbild ab (s = laenge/n), Gewicht = Flaechenanteil."""
    s = laenge / n
    a = a0 + np.arange(n) * s
    b = a + s
    j0, j1 = int(math.floor(a[0])), int(math.ceil(b[-1]))
    j = np.arange(j0, j1)
    m = np.clip(np.minimum(b[:, None], j[None, :] + 1) - np.maximum(a[:, None], j[None, :]), 0, None) / s
    return m.astype(np.float32), j0, j1


def ausschnitt_verkleinern(bild_chw, x, y, b, h, vw, vh):
    """bild_chw: float32 (3, H, W). Liefert uint8 (vh, vw, 3) - Flaechenmittel wie cv2.INTER_AREA bei ganzzahligem Ausschnitt."""
    mx, x0, x1 = gewichte(x, b, vw)
    my, y0, y1 = gewichte(y, h, vh)
    # Gleitkomma-Rest am Bildrand (z. B. 2630,0000001): Spalten ausserhalb des Bildes haben Gewicht ~0
    _, hoehe, breite = bild_chw.shape
    if x1 > breite: mx, x1 = mx[:, :breite - x0], breite
    if y1 > hoehe: my, y1 = my[:, :hoehe - y0], hoehe
    if x0 < 0: mx, x0 = mx[:, -x0:], 0
    if y0 < 0: my, y0 = my[:, -y0:], 0
    teil = bild_chw[:, y0:y1, x0:x1]
    aus = my @ (teil @ mx.T)                     # (3, vh, vw)
    return np.clip(np.rint(aus), 0, 255).astype(np.uint8).transpose(1, 2, 0)


class Standbild:
    def __init__(self, auftrag):
        bgr = cv2.imread(auftrag['standbild'], cv2.IMREAD_COLOR)
        if bgr is None: raise AuftragFehler(f"Standbild fehlt oder ist kein Bild: {auftrag['standbild']}")
        self.rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        self.bild = np.ascontiguousarray(self.rgb.transpose(2, 0, 1), dtype=np.float32)
        self.x, self.y, self.b, self.h = map(float, auftrag['ausschnitt'])
        self.hoehe, self.breite = bgr.shape[:2]
        if self.x < 0 or self.y < 0 or self.x + self.b > self.breite + 0.01 or self.y + self.h > self.hoehe + 0.01:
            raise AuftragFehler(f'Ausschnitt {auftrag["ausschnitt"]} liegt nicht im Standbild ({self.breite}x{self.hoehe})')
        self.z0, self.z1 = auftrag.get('zoom', [1.0, 1.08])
        self.ax, self.ay = auftrag.get('anker', [self.x + self.b / 2, self.y + self.h / 2])
        if not (self.x <= self.ax <= self.x + self.b and self.y <= self.ay <= self.y + self.h):
            raise AuftragFehler('Anker muss im Ausschnitt liegen (sonst wandert der Ausschnitt aus dem Bild)')
        self.vw, self.vh = kastengroesse(self.b, self.h)
        if self.b < self.vw * self.z1:
            raise AuftragFehler(f'Ausschnitt zu klein: {self.b:.0f} px breit, gebraucht werden mindestens {self.vw * self.z1:.0f} px (sonst wird hochgerechnet und unscharf)')

    def rechteck(self, t):
        z = self.z0 + (self.z1 - self.z0) * weich(min(1.0, max(0.0, t / DAUER)))
        return (self.ax - (self.ax - self.x) / z, self.ay - (self.ay - self.y) / z, self.b / z, self.h / z)

    def bei(self, t):
        return ausschnitt_verkleinern(self.bild, *self.rechteck(t), self.vw, self.vh)


# ---------- Reel ----------

class Reel:
    def __init__(self, auftrag, schrift, logo_pfad):
        self.a = auftrag
        self.s = Standbild(auftrag)
        z = auftrag['zeilen']
        for k in ('kicker', 'name', 'preis', 'preis_zusatz', 'merkmale'):
            if not str(z.get(k, '')).strip(): raise AuftragFehler(f'zeilen.{k} fehlt')
        if not os.path.exists(logo_pfad): raise AuftragFehler(f'Logo fehlt: {logo_pfad}')
        vw, vh = self.s.vw, self.s.vh
        self.vx, self.vy = (W - vw) // 2, VY
        self.msk, self.sch = maske(vw, vh, RAD), schatten(vw, vh, RAD)
        logo = Image.open(logo_pfad).convert('RGBA')
        self.logo = logo.resize((260, int(260 * logo.height / logo.width)), Image.LANCZOS)
        stand = auftrag.get('stand')
        if not stand: raise AuftragFehler('stand (Datum des Preisstands) fehlt')
        ty = self.vy + vh + 44
        el = []   # (Bild, x, y, Start, Dauer, Art)
        def mitte(im, y, st, d=0.6, art='hoch'): el.append((im, (W - im.width) // 2, y, st, d, art))
        mitte(text(schrift, z['kicker'].upper(), 28, 600, GRAU, abstand=4), ty, 0.6)
        mitte(text(schrift, z['name'], 74, 700, SCHWARZ), ty + 52, 0.9)
        preis = text(schrift, z['preis'], 104, 800, ROT)
        mitte(preis, ty + 158, 1.4, 0.5, 'pop')
        y2 = ty + 158 + preis.height + 26
        mitte(text(schrift, z['preis_zusatz'], 32, 500, DUNKEL), y2, 1.9)
        mitte(text(schrift, z['merkmale'], 32, 500, GRAU), y2 + 54, 2.3)
        mitte(text(schrift, f"{auftrag.get('fusszeile') or FUSSZEILE} · Stand {stand}", 22, 400, GRAU), y2 + 112, 2.7, 0.6, 'blende')
        mitte(text(schrift, URL, 38, 700, SCHWARZ), y2 + 156, 3.0)
        if y2 + 156 + 60 > H - 40: raise AuftragFehler('Texte laufen unten aus dem Bild - Bildkasten flacher waehlen (4:5 oder 1:1)')
        self.el = el

    def bild(self, t):
        bild = Image.new('RGBA', (W, H), HG + (255,))
        a = raus(anteil(t, 0.0, 0.6))
        bild.alpha_composite(mit_alpha(self.logo, a), ((W - self.logo.width) // 2, int(170 - 20 * (1 - a))))
        av = raus(anteil(t, 0.15, 0.6))
        bild.alpha_composite(mit_alpha(self.sch, av), (self.vx - 80, self.vy - 80))
        v = Image.fromarray(self.s.bei(t)).convert('RGBA'); v.putalpha(self.msk.point(lambda p: int(p * av)))
        bild.alpha_composite(v, (self.vx, self.vy))
        for im, x, y, st, d, art in self.el:
            p = anteil(t, st, d)
            if p <= 0: continue
            if art == 'hoch':
                bild.alpha_composite(mit_alpha(im, raus(p)), (x, int(y + 36 * (1 - raus(p)))))
            elif art == 'pop':
                s = 0.82 + 0.18 * zurueck(p)
                g = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
                bild.alpha_composite(mit_alpha(g, min(1, p / 0.4)), ((W - g.width) // 2, int(y + (im.height - g.height) / 2)))
            else:
                bild.alpha_composite(mit_alpha(im, raus(p)), (x, y))
        return bild.convert('RGB')

    def rendern(self, ffmpeg):
        # crf 14 + tune grain: feine Strukturen (Rasen, Schlingen, Holz) bleiben so scharf wie gerendert
        os.makedirs(os.path.dirname(os.path.abspath(self.a['aus'])), exist_ok=True)
        # Stumme Tonspur wie bei den Baustellen-Reels (lib/reel.mjs): manche Player zeigen Videos ohne Audiospur nicht an.
        ff = subprocess.Popen([ffmpeg, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                               '-f', 'lavfi', '-t', str(DAUER), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                               '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(self.a.get('crf', 14)), '-tune', self.a.get('tune', 'grain'),
                               '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', self.a['aus']], stdin=subprocess.PIPE)
        for i in range(int(DAUER * FPS)):
            ff.stdin.write(self.bild(i / FPS).tobytes())
            if i % 60 == 0: print(f'  {i / FPS:4.1f} s', file=sys.stderr, flush=True)
        ff.stdin.close()
        if ff.wait() != 0: raise RuntimeError(f'ffmpeg brach ab (Code {ff.returncode})')


# ---------- Pruefung ----------

def schaerfe(rgb, m):
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    return float(((gx ** 2 + gy ** 2)[m]).mean())


def flaeche(s, auftrag, rechteck):
    """Produktflaeche in Kasten-Koordinaten fuer einen Ausschnitt; die runden Ecken bleiben aussen vor."""
    x, y, b, _ = rechteck
    k = s.vw / b
    px0, py0, px1, py1 = auftrag['produktflaeche']
    m = np.zeros((s.vh, s.vw), bool)
    m[max(40, int((py0 - y) * k)):min(s.vh - 40, int((py1 - y) * k)), max(40, int((px0 - x) * k)):min(s.vw - 40, int((px1 - x) * k))] = True
    if m.sum() < 10000: raise AuftragFehler('produktflaeche liegt (fast) ausserhalb des Ausschnitts')
    return m


def beschriften(im, t, gr=0.8):
    im = im.copy()
    (b, h), _ = cv2.getTextSize(t, cv2.FONT_HERSHEY_SIMPLEX, gr, 2)
    cv2.rectangle(im, (0, 0), (b + 24, h + 24), (30, 30, 30), -1)
    cv2.putText(im, t, (12, h + 12), cv2.FONT_HERSHEY_SIMPLEX, gr, (255, 255, 255), 2, cv2.LINE_AA)
    return im


def pruefen(auftrag, s):
    """Liest die fertige MP4 einmal ganz: alle Bilder ab 0,8 s gegen den exakten Render, vier davon zusaetzlich gegen INTER_AREA."""
    vx, vy = (W - s.vw) // 2, VY
    m_ganz = flaeche(s, auftrag, s.rechteck(DAUER))   # Produktflaeche bei Zoom-Ende - liegt in jedem Bild
    nummern = {round(t * FPS) for t in ZEITEN}
    cap, n = cv2.VideoCapture(auftrag['aus']), 0
    verh, psnr, ruck, vorher, zeilen, zeitpunkte = [], [], [], None, [], []
    gx0, gy0 = 60, 60   # Messfeld oben links im Kasten: bewegt sich beim Zoom am staerksten
    while True:
        ok, fr = cap.read()
        if not ok: break
        t = n / FPS
        ganz = cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)
        kasten = ganz[vy:vy + s.vh, vx:vx + s.vw]
        if t >= 0.8:
            exakt = s.bei(t)
            verh.append(schaerfe(kasten, m_ganz) / schaerfe(exakt, m_ganz))
            d = (kasten.astype(np.float32) - exakt.astype(np.float32))[m_ganz]
            psnr.append(10 * np.log10(255 ** 2 / max(1e-6, float((d ** 2).mean()))))
            g = cv2.cvtColor(kasten, cv2.COLOR_RGB2GRAY).astype(np.float32)[gy0:gy0 + 256, gx0:gx0 + 256]
            if vorher is not None:
                (dx, dy), _ = cv2.phaseCorrelate(vorher, g)
                x1, y1, b1, _ = s.rechteck(t - 1 / FPS); x2, y2, b2, _ = s.rechteck(t)
                cx, cy = gx0 + 128, gy0 + 128
                ex = (x1 + cx * b1 / s.vw - x2) * s.vw / b2 - cx
                ey = (y1 + cy * b1 / s.vw - y2) * s.vw / b2 - cy
                ruck.append(float(np.hypot(dx - ex, dy - ey)))
            vorher = g
        if n in nummern:
            zeitpunkte.append(zeitpunkt(auftrag, s, ganz, kasten, t, zeilen))
        n += 1
    if not verh: raise RuntimeError('MP4 nicht lesbar')
    ganzes = {'bilder': len(verh), 'schaerfe_min': round(min(verh), 3), 'psnr_min_db': round(min(psnr), 1),
              'ruckeln_max_px': round(max(ruck), 2), 'ruckeln_mittel_px': round(float(np.mean(ruck)), 3)}
    gruende = []
    if ganzes['schaerfe_min'] < GRENZE_SCHAERFE: gruende.append(f"Produktflaeche im Video weicher als im Standbild ({ganzes['schaerfe_min']} < {GRENZE_SCHAERFE})")
    if ganzes['psnr_min_db'] < GRENZE_PSNR: gruende.append(f"Kodierverlust zu hoch ({ganzes['psnr_min_db']} dB < {GRENZE_PSNR})")
    if ganzes['ruckeln_max_px'] > GRENZE_RUCKELN: gruende.append(f"Zoom ruckelt ({ganzes['ruckeln_max_px']} px > {GRENZE_RUCKELN})")
    for z in zeitpunkte:
        if z['verhaeltnis'] < GRENZE_SCHAERFE: gruende.append(f"bei {z['t']} s weicher als das Standbild ({z['verhaeltnis']})")
    blatt = np.vstack([np.vstack([z, np.full((8, z.shape[1], 3), 255, np.uint8)]) for z in zeilen])
    cv2.imwrite(auftrag['pruefblatt'], cv2.cvtColor(blatt, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
    return {'ok': not gruende, 'gruende': gruende, 'ganzes_video': ganzes, 'zeitpunkte': zeitpunkte}


def zeitpunkt(auftrag, s, ganz, kasten, t, zeilen):
    """Ein Zeitpunkt: Zahl gegen INTER_AREA und eine Zeile im Pruefblatt (Ueberblick, Reel 2x, Standbild 2x, Originalpixel)."""
    vx, vy = (W - s.vw) // 2, VY
    x, y, b, h = s.rechteck(t)
    xi, yi, bi, hi = int(round(x)), int(round(y)), int(round(b)), int(round(h))
    ref = cv2.resize(s.rgb[yi:yi + hi, xi:xi + bi], (s.vw, s.vh), interpolation=cv2.INTER_AREA)
    m = flaeche(s, auftrag, (x, y, b, h))
    sr, ss = schaerfe(kasten, m), schaerfe(ref, m)
    diff = np.abs(kasten.astype(np.float32) - ref.astype(np.float32))[m]
    psnr = 10 * np.log10(255 ** 2 / max(1e-6, float((diff ** 2).mean())))
    k = s.vw / b
    ys, xs = np.where(m)
    cx, cy = int(xs.mean()), int(ys.mean())
    x0, y0 = min(max(0, cx - DETAIL // 2), s.vw - DETAIL), min(max(0, cy - DETAIL // 2), s.vh - DETAIL)
    ox, oy, ob = int(x + x0 / k), int(y + y0 / k), int(DETAIL / k)
    d_orig = cv2.resize(s.rgb[oy:oy + ob, ox:ox + ob], (DETAIL * 2, DETAIL * 2), interpolation=cv2.INTER_AREA)
    klein = cv2.resize(ganz, (DETAIL * 2 * W // H, DETAIL * 2), interpolation=cv2.INTER_AREA)
    cv2.rectangle(klein, ((vx + x0) * klein.shape[1] // W, (vy + y0) * klein.shape[0] // H),
                  ((vx + x0 + DETAIL) * klein.shape[1] // W, (vy + y0 + DETAIL) * klein.shape[0] // H), (255, 0, 0), 2)
    gross = lambda im: cv2.resize(im, (DETAIL * 2, DETAIL * 2), interpolation=cv2.INTER_NEAREST)
    trenn = np.full((DETAIL * 2, 8, 3), 255, np.uint8)
    zeilen.append(np.hstack([beschriften(klein, f'{t:.1f} s  Schaerfe {sr / ss:.2f}', 0.5), trenn,
                             beschriften(gross(kasten[y0:y0 + DETAIL, x0:x0 + DETAIL]), f'Reel {t:.1f} s aus der MP4 (2x)'), trenn,
                             beschriften(gross(ref[y0:y0 + DETAIL, x0:x0 + DETAIL]), 'Standbild gleicher Massstab (2x)'), trenn,
                             beschriften(d_orig, 'Standbild Originalpixel')]))
    return {'t': round(t, 2), 'zoom': round(s.b / b, 4), 'verhaeltnis': round(sr / ss, 3), 'psnr_db': round(float(psnr), 1)}


def vorschau(auftrag, reel):
    """Zum Einrichten des Ausschnitts: drei Reel-Bilder und das Standbild mit Ausschnitt, Zoom-Ende, Produktflaeche und Anker."""
    s = reel.s
    basis = os.path.splitext(auftrag['aus'])[0]
    dateien = []
    for t in (0.8, 5.0, 9.9):
        ziel = f'{basis}-vorschau-{t:.1f}s.jpg'
        reel.bild(t).save(ziel, quality=88)
        dateien.append(ziel)
    k = 1600 / max(s.breite, s.hoehe)
    ueber = cv2.resize(s.rgb, (int(s.breite * k), int(s.hoehe * k)), interpolation=cv2.INTER_AREA)
    r = lambda x0, y0, x1, y1, farbe: cv2.rectangle(ueber, (int(x0 * k), int(y0 * k)), (int(x1 * k), int(y1 * k)), farbe, 3)
    r(s.x, s.y, s.x + s.b, s.y + s.h, (0, 200, 0))
    x, y, b, h = s.rechteck(DAUER)
    r(x, y, x + b, y + h, (255, 200, 0))
    if 'produktflaeche' in auftrag: r(*auftrag['produktflaeche'], (220, 0, 0))
    cv2.circle(ueber, (int(s.ax * k), int(s.ay * k)), 12, (255, 255, 255), -1)
    ziel = f'{basis}-vorschau-ausschnitt.jpg'
    cv2.imwrite(ziel, cv2.cvtColor(beschriften(ueber, 'gruen: Start  gelb: Zoom-Ende  rot: Produktflaeche  weiss: Anker', 0.6), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])
    dateien.append(ziel)
    return {'ok': True, 'dateien': dateien, 'standbild': [s.breite, s.hoehe], 'kasten': [s.vw, s.vh]}


def main(argv):
    if len(argv) < 2 or argv[0] not in ('rendern', 'vorschau'):
        raise AuftragFehler('Aufruf: reel_zoom.py rendern|vorschau <auftrag.json> --schrift <datei> --logo <png> [--ffmpeg <pfad>]')
    opt = {argv[i][2:]: argv[i + 1] for i in range(2, len(argv) - 1, 2) if argv[i].startswith('--')}
    with open(argv[1], encoding='utf-8') as f: auftrag = json.load(f)
    for k in ('standbild', 'ausschnitt', 'zeilen', 'aus'):
        if k not in auftrag: raise AuftragFehler(f'{k} fehlt im Auftrag')
    reel = Reel(auftrag, Schrift(opt.get('schrift', '')), opt.get('logo', ''))
    if argv[0] == 'vorschau': return vorschau(auftrag, reel)
    for k in ('produktflaeche', 'pruefblatt'):
        if k not in auftrag: raise AuftragFehler(f'{k} fehlt im Auftrag')
    flaeche(reel.s, auftrag, reel.s.rechteck(DAUER))   # vor dem langen Rendern: liegt die Produktflaeche im Bild?
    reel.rendern(opt.get('ffmpeg', 'ffmpeg'))
    return {'video': auftrag['aus'], 'pruefblatt': auftrag['pruefblatt'], 'kasten': [reel.s.vw, reel.s.vh], **pruefen(auftrag, reel.s)}


if __name__ == '__main__':
    try:
        ergebnis = main(sys.argv[1:])
    except AuftragFehler as e:
        print(json.dumps({'ok': False, 'fehler': str(e)}, ensure_ascii=False))
        sys.exit(2)
    print(json.dumps(ergebnis, ensure_ascii=False))
    sys.exit(0 if ergebnis.get('ok') else 3)
