#!/usr/bin/env python3
"""Zwischenpruefer fuer SEPA-Sammeldateien (Benutzer 24.11.2026): kontrolliert jede Ueberweisung
unabhaengig vom Erzeuger (zahlung-sammeldatei.mjs), bevor die Datei zur Bank geht. Ohne KI, ohne Token.

  ~/.venvs/analyse/bin/python operations/scripts/zahlung_zwischenpruefer.py [sammeldatei.xml ...]

Ohne Argument: alle noch nicht verworfenen sammeldatei-*.xml im Privatordner ($TP_PRIVAT_DIR/zahlungen).
Prueft je Zahlung: Rechnung im Archiv, Empfaenger-IBAN (Pruefziffer, Konfiguration, steht auf der
Rechnung, frueher an dieselbe IBAN gezahlt), Betrag (Rechnungswert oder hoechstens 5 % Skonto, das
auf der Rechnung steht), nicht schon laut Kontoauszug bezahlt, nicht in einer anderen Datei, keine
Lastschrift, keine Gutschrift; dazu Anzahl und Kontrollsumme der Datei.
Ausgabe: je Datei FREI oder NICHT HOCHLADEN mit Gruenden. Exit 1, sobald eine Datei einen Fehler hat.
Liest nur, schreibt nichts. Die PDFs kommen aus fremden Mails: gelesen wird nur Text (pypdf).
"""
import csv
import io
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

SKONTO_MAX = 0.05


def nur_zeichen(s):
    return re.sub(r"[^A-Z0-9]", "", str(s or "").upper())


RECHTSFORM = {"gmbh", "kg", "ohg", "co", "und", "der", "die", "das", "weberei"}


def worte(name):
    """Kennzeichnende Namensworte (ohne Rechtsform, Umlaute aufgeloest)."""
    s = str(name or "").lower().translate(str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}))
    return {w for w in re.split(r"[^a-z0-9]+", s) if len(w) >= 4 and w not in RECHTSFORM}


def iban_gueltig(iban):
    s = nur_zeichen(iban)
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", s):
        return False
    return int("".join(str(int(c, 36)) for c in s[4:] + s[:4])) % 97 == 1


def cent(betrag):
    return round(float(betrag) * 100)


def nummer_im(text, nummer):
    """Rechnungsnummer als eigenes Wort (Ziffern duerfen rechts an Buchstaben grenzen, nie an Ziffern)."""
    n = re.escape(str(nummer).upper())
    rechts = "0-9" if str(nummer).isdigit() else "A-Z0-9"
    return re.search(rf"(^|[^A-Z0-9]){n}($|[^{rechts}])", str(text).upper()) is not None


def sepa_lesen(xml):
    """Zahlungen und Kopf einer pain.001 (nur die Felder, die die Bank ausfuehrt)."""
    blatt = lambda tag, s: (re.search(rf"<{tag}[^>]*>([^<]*)</{tag}>", s) or [None, None])[1]
    zahlungen = []
    for tx in re.findall(r"<CdtTrfTxInf>(.*?)</CdtTrfTxInf>", xml, re.S):
        zahlungen.append({
            "ende": blatt("EndToEndId", tx) or "",
            "cent": cent(blatt("InstdAmt", tx) or "nan") if blatt("InstdAmt", tx) else None,
            "name": (blatt("Nm", tx) or "").replace("&amp;", "&"),
            "iban": blatt("IBAN", tx) or "",
            "zweck": (blatt("Ustrd", tx) or "").replace("&amp;", "&"),
        })
    kopf = {
        "anzahl": [int(x) for x in re.findall(r"<NbOfTxs>(\d+)</NbOfTxs>", xml)],
        "summe": [cent(x) for x in re.findall(r"<CtrlSum>([\d.]+)</CtrlSum>", xml)],
        "schuldner": (re.search(r"<DbtrAcct><Id><IBAN>([^<]*)</IBAN>", xml) or [None, ""])[1],
    }
    return kopf, zahlungen


def bank_lesen(ordner):
    """Commerzbank-CSV-Exporte: Ausgaenge mit Datum, Betrag, Empfaenger, IBAN aus dem Buchungstext, Zweck."""
    buchungen = []
    for datei in sorted(Path(ordner).glob("*.csv")) if Path(ordner).is_dir() else []:
        roh = datei.read_bytes()
        try:
            text = roh.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = roh.decode("cp1252")
        for z in csv.DictReader(io.StringIO(text), delimiter=";"):
            try:
                betrag = float((z.get("Betrag") or "").replace(".", "").replace(",", "."))
                t, m, j = (z.get("Buchungstag") or "").split(".")
            except ValueError:
                continue
            text_ = f"{z.get('Buchungstext') or ''} {z.get('Verwendungszweck') or ''}"
            ibans = [i for i in re.findall(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", z.get("Buchungstext") or "") if iban_gueltig(i)]
            buchungen.append({"datum": f"{j}-{m}-{t}", "betrag": betrag, "name": z.get("Empfänger") or "", "ibans": ibans, "text": text_})
    return buchungen


def glaetten(text):
    """Gesperrte Schrift: „R e c h n u n g“ und „63 , 63“ zu „Rechnung“ und „63,63“."""
    t = re.sub(r"\b(?:[A-Za-zÄÖÜäöü] ){3,}[A-Za-zÄÖÜäöü]\b", lambda m: m.group(0).replace(" ", ""), str(text or ""))
    return re.sub(r"(\d) +, *(\d{2})(?!\d)", r"\1,\2", t)


def pdf_text(pfad):
    import logging
    from pypdf import PdfReader  # nur hier: Tests laufen ohne pypdf
    logging.getLogger("pypdf").setLevel(logging.ERROR)
    r = PdfReader(str(pfad))
    if r.is_encrypted and not r.decrypt(""):
        return ""
    return " ".join((s.extract_text() or "") for s in r.pages)


def archiv_lesen(privat):
    """Rechnungen aus belege-archiv/<Jahr>/<Monat>/manifest.json, mit Lesefunktion fuer den Rechnungstext."""
    belege = []
    for manifest in sorted(Path(privat, "belege-archiv").glob("*/*/manifest.json")):
        ordner = manifest.parent
        for b in json.loads(manifest.read_text("utf-8")).get("belege", []):
            if b.get("nichtMehrGefunden") or b.get("dublette") or b.get("rolle") not in ("rechnung", "unklar"):
                continue

            def text(b=b, ordner=ordner, merk={}):
                if "t" in merk:
                    return merk["t"]
                teile = []
                for name in (b.get("xmlDatei"), b.get("datei")):
                    p = ordner / name if name else None
                    if not p or not p.exists():
                        continue
                    try:
                        teile.append(p.read_text("utf-8", "replace") if p.suffix.lower() == ".xml" else pdf_text(p))
                    except Exception:  # unlesbare Datei: dann fehlt eben der Beleg im Text
                        pass
                merk["t"] = " ".join(teile)
                return merk["t"]
            belege.append({"schluessel": b.get("anbieterSchluessel"), "nummer": str(b.get("rechnungsnummer") or ""), "brutto": b.get("brutto"),
                           "datum": b.get("rechnungsdatum") or b.get("tag") or "", "art": b.get("art"), "datei": b.get("datei"), "text": text})
    return belege


def datei_pruefen(name, xml, *, lieferanten, belege, buchungen, andere):
    """@returns (fehler, hinweise) als Listen von Saetzen."""
    fehler, hinweise = [], []
    kopf, zahlungen = sepa_lesen(xml)
    gesamt = sum(z["cent"] or 0 for z in zahlungen)
    if not zahlungen:
        fehler.append("keine Zahlung in der Datei")
    if kopf["anzahl"] != [len(zahlungen)] * 2 or kopf["summe"] != [gesamt] * 2:
        fehler.append(f"Kopf passt nicht: Anzahl {kopf['anzahl']} bei {len(zahlungen)} Zahlungen, Kontrollsumme {kopf['summe']} bei {gesamt}")
    if not iban_gueltig(kopf["schuldner"]):
        fehler.append("Auftraggeber-IBAN ungueltig")
    for z in zahlungen:
        nummer = re.sub(r"^RE-", "", z["ende"])
        wer = f"{z['name']} RE {nummer}"
        if not z["cent"] or z["cent"] <= 0:
            fehler.append(f"{wer}: Betrag ungueltig")
            continue
        if not iban_gueltig(z["iban"]):
            fehler.append(f"{wer}: IBAN-Pruefziffer falsch")
        konfig = [k for k, l in lieferanten.items() if nur_zeichen(l.get("iban")) == nur_zeichen(z["iban"])]
        if not konfig:
            fehler.append(f"{wer}: IBAN steht bei keinem eingetragenen Lieferanten")
        treffer = [b for b in belege if nur_zeichen(b["nummer"]) == nur_zeichen(nummer) and (not konfig or b["schluessel"] in konfig)]
        # Archiv ohne Nummer (gesperrte Schrift einer Spedition): Nummer muss im Rechnungstext desselben Lieferanten stehen.
        if not treffer and konfig:
            treffer = [b for b in belege if not b["nummer"] and b["schluessel"] in konfig and nummer_im(glaetten(b["text"]()), nummer)]
        if not treffer:
            fehler.append(f"{wer}: Rechnung nicht im Archiv")
            continue
        b = treffer[0]
        if any(l.get("zahlart") == "lastschrift" for k, l in lieferanten.items() if k == b["schluessel"]):
            fehler.append(f"{wer}: Lieferant zieht per Lastschrift ein")
        if b["art"] == "gutschrift":
            fehler.append(f"{wer}: Beleg ist eine Gutschrift")
        text = glaetten(b["text"]())
        if nur_zeichen(z["iban"]) not in nur_zeichen(text):
            fehler.append(f"{wer}: IBAN steht nicht auf der Rechnung")
        if b["brutto"] is None:
            betrag = f"{z['cent'] // 100},{z['cent'] % 100:02d}"
            if re.search(rf"(^|[^0-9.,]){betrag}($|[^0-9])", text):
                hinweise.append(f"{wer}: Rechnungswert nicht im Archiv, Betrag {betrag} steht aber auf der Rechnung")
            else:
                fehler.append(f"{wer}: Rechnungswert im Archiv unbekannt")
        else:
            abzug = cent(b["brutto"]) - z["cent"]
            if abzug < 0:
                fehler.append(f"{wer}: zahlt mehr als den Rechnungswert ({b['brutto']:.2f})")
            elif abzug == 0 and re.search(r"skonto", re.sub(r"#SKONTO#TAGE=\d+#PROZENT=0+(?:[.,]0+)?#", "", text), re.I):
                hinweise.append(f"{wer}: Rechnung nennt Skonto, die Datei zahlt den vollen Betrag")
            elif abzug > 0:
                genannt = f"{abzug // 100},{abzug % 100:02d}"
                if abzug > cent(b["brutto"]) * SKONTO_MAX or not re.search(r"skonto", text, re.I) or genannt not in z["zweck"]:
                    fehler.append(f"{wer}: Abzug {genannt} EUR nicht als Skonto belegt (Rechnung {b['brutto']:.2f})")
                else:
                    hinweise.append(f"{wer}: Skonto {genannt} EUR ({abzug / cent(b['brutto']) * 100:.1f} %) – Frist auf der Rechnung beachten")
        for x in buchungen:
            if x["betrag"] < 0 and x["datum"] >= (b["datum"] or "") and nummer_im(x["text"], nummer):
                fehler.append(f"{wer}: laut Kontoauszug schon bezahlt am {x['datum']} ({-x['betrag']:.2f} EUR)")
                break
        frueher = {i for x in buchungen if x["betrag"] < 0 and konfig and worte(x["name"]) & worte(lieferanten[konfig[0]].get("name")) for i in x["ibans"]}
        if frueher and nur_zeichen(z["iban"]) not in frueher:
            hinweise.append(f"{wer}: frueher an eine andere IBAN dieses Namens gezahlt – Konto vor Freigabe pruefen")
        if not frueher:
            hinweise.append(f"{wer}: an diese IBAN noch nie ueberwiesen (laut Kontoauszug)")
        for andere_datei, nummern in andere.items():
            if andere_datei != name and nur_zeichen(nummer) in nummern:
                fehler.append(f"{wer}: steht auch in {andere_datei}")
    return fehler, hinweise


def main(argv):
    privat = Path(os.environ.get("TP_PRIVAT_DIR") or Path.home() / "teppich-paradies-analyse")
    ordner = privat / "zahlungen"
    konfig = json.loads((ordner / "konfiguration.json").read_text("utf-8"))
    dateien = [Path(a) for a in argv] or sorted(ordner.glob("sammeldatei-*.xml"))
    aktive = sorted(ordner.glob("sammeldatei-*.xml"))
    andere = {p.name: {nur_zeichen(re.sub(r"^RE-", "", z["ende"])) for z in sepa_lesen(p.read_text("utf-8"))[1]} for p in set(aktive) | set(dateien)}
    belege = archiv_lesen(privat)
    buchungen = bank_lesen(privat / "laden-entlastung-2026-11" / "bank-export")
    bis = max((b["datum"] for b in buchungen), default="keiner")
    print(f"Zwischenpruefer {date.today().isoformat()}: {len(dateien)} Datei(en), Kontoauszug bis {bis}")
    schlecht = 0
    for p in dateien:
        if p.suffix != ".xml":
            continue
        fehler, hinweise = datei_pruefen(p.name, p.read_text("utf-8"), lieferanten=konfig.get("lieferanten", {}), belege=belege, buchungen=buchungen, andere=andere)
        _, zahlungen = sepa_lesen(p.read_text("utf-8"))
        summe = sum(z["cent"] or 0 for z in zahlungen)
        print(f"\n{'NICHT HOCHLADEN' if fehler else 'FREI'}: {p.name} – {len(zahlungen)} Zahlung(en), {summe // 100},{summe % 100:02d} EUR")
        for f in fehler:
            print(f"  FEHLER  {f}")
        for h in hinweise:
            print(f"  Hinweis {h}")
        schlecht += bool(fehler)
    print(f"\nWas nach {bis} von Hand bezahlt wurde, sieht der Pruefer nicht.")
    return 1 if schlecht else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
