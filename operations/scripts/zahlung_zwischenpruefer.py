#!/usr/bin/env python3
"""Zwischenpruefer fuer SEPA-Sammeldateien (Benutzer 24.11.2026): kontrolliert jede Ueberweisung
unabhaengig vom Erzeuger (zahlung-sammeldatei.mjs), bevor die Datei zur Bank geht. Ohne KI, ohne Token.

  ~/.venvs/analyse/bin/python operations/scripts/zahlung_zwischenpruefer.py [sammeldatei.xml ...]

Ohne Argument: alle Dateien, die in $TP_PRIVAT_DIR/zahlungen/vorgemerkt.json stehen (also nicht verworfen sind).
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


def gleicher_name(a, b):
    """Ohne IBAN: alle kennzeichnenden Worte des kuerzeren Namens im laengeren (ein gemeinsames Wort reicht nicht)."""
    wa, wb = worte(a), worte(b)
    kurz, lang = sorted((wa, wb), key=len)
    return bool(kurz) and kurz <= lang


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
            # Commerzbank: Empfaenger-IBAN im Buchungstext („IBAN Kontoinhaber“ ist das eigene Konto); andere Exporte: Spalte IBAN.
            quellen = f"{z.get('Buchungstext') or ''} {z.get('IBAN') or ''} {z.get('IBAN Empfänger') or ''}"
            ibans = [i for i in re.findall(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", quellen.replace(" ", " ")) if iban_gueltig(i)]
            name = next((z.get(k) for k in ("Empfänger", "Beguenstigter", "Begünstigter", "Begünstigter/Zahlungspflichtiger", "Beguenstigter/Zahlungspflichtiger", "Name") if z.get(k)), "")
            buchungen.append({"datum": f"{j}-{m}-{t}", "betrag": betrag, "name": name, "ibans": ibans, "text": text_})
    return buchungen


def glaetten(text):
    """Gesperrte Schrift: „R e c h n u n g“ und „63 , 63“ zu „Rechnung“ und „63,63“."""
    t = re.sub(r"\b(?:[A-Za-zÄÖÜäöü] ){3,}[A-Za-zÄÖÜäöü]\b", lambda m: m.group(0).replace(" ", ""), str(text or ""))
    return re.sub(r"(\d) +, *(\d{2})(?!\d)", r"\1,\2", t)


def skonto_stufen(text, rechnungsdatum):
    """Skontostufen der Rechnung als (Frist ISO, Satz %, Betrag in Cent oder None). Erkannt:
    „Zahlung bis 27.11.26 2,00 % Skonto 31,92 EUR“, XRechnung „#SKONTO#TAGE=10#PROZENT=4.00#“,
    „innerhalb von 10 Tagen mit 4 % Skonto“ und „10 Tage -3% Skonto“ (die letzten drei ab Rechnungsdatum)."""
    stufen = []
    for t, m, j, satz, betrag in re.findall(r"Zahlung bis (\d{1,2})[. ](\d{1,2})[. ](\d{2,4})\s+(\d{1,2},\d{2})\s*%\s*Skonto\s+(\d+(?:\.\d{3})*,\d{2})", text, re.I):
        try:
            frist = date(int(j) + (2000 if len(j) == 2 else 0), int(m), int(t)).isoformat()
        except ValueError:
            continue
        stufen.append((frist, float(satz.replace(",", ".")), cent(betrag.replace(".", "").replace(",", "."))))
    try:
        start = date.fromisoformat(rechnungsdatum)
    except (TypeError, ValueError):
        return stufen
    tage = re.findall(r"#SKONTO#TAGE=(\d{1,3})#PROZENT=(\d{1,2}(?:\.\d{1,2})?)#", text, re.I)
    tage += re.findall(r"(\d{1,3})\s+Tag(?:e|en)\s+(?:mit\s+|abz\w*\s+)?-?\s*(\d{1,2}(?:,\d{1,2})?)\s*%\s*Skonto", text, re.I)
    for n, satz in tage:
        if float(satz.replace(",", ".")) > 0:
            stufen.append((date.fromordinal(start.toordinal() + int(n)).isoformat(), float(satz.replace(",", ".")), None))
    return [x for x in stufen if 0 < x[1] <= SKONTO_MAX * 100]


def skonto_basis(xml_text, brutto_cent):
    """Skontobasis einer XRechnung wie im Erzeuger: mit Zuschlaegen (Fracht) und ohne angegebene Basis nur der
    Warenanteil, brutto x Warensumme / Steuerbasis; geht die Summe nicht auf, der volle Betrag."""
    block = re.search(r"<(?:[\w.-]+:)?SpecifiedTradeSettlementHeaderMonetarySummation\b[^>]*>(.*?)</(?:[\w.-]+:)?SpecifiedTradeSettlementHeaderMonetarySummation>", xml_text, re.S)
    feld = lambda n: (lambda m: float(m.group(1)) if m else None)(re.search(rf"<(?:[\w.-]+:)?{n}\b[^>]*>\s*([\d.]+)\s*<", block.group(1))) if block else None
    zuschlag, ware, basis, nachlass = feld("ChargeTotalAmount") or 0, feld("LineTotalAmount"), feld("TaxBasisTotalAmount"), feld("AllowanceTotalAmount") or 0
    explizit = re.findall(r"#SKONTO#TAGE=\d+#PROZENT=[\d.]+#BASISBETRAG=(\d+(?:\.\d{1,2})?)#", xml_text)
    if explizit:
        return round(float(explizit[0]) * 100) if len(set(explizit)) == 1 else 0
    if zuschlag <= 0:
        return brutto_cent
    if ware and basis and not nachlass and round((ware + zuschlag) * 100) == round(basis * 100):
        return round(brutto_cent * ware / basis)
    return 0  # Basis ungeklaert: der Erzeuger zahlt dann voll, jeder Abzug ist ein Fehler


def skonto_pruefen(text, rechnungsdatum, abzug, brutto_cent, heute, teilbasis_sperrt=True):
    """@returns (None, frist) wenn der Abzug zu einer noch laufenden Stufe passt, sonst (Grund, None).
    Satz und Frist gehoeren zusammen: eine abgelaufene hoehere Stufe zaehlt nicht."""
    if brutto_cent <= 0:
        return "Skontobasis ungeklaert: der Erzeuger zahlt voll", None
    stufen = skonto_stufen(text, rechnungsdatum)
    # Nur fuer reine PDF-Rechnungen (wie der Erzeuger): bei XML rechnet der Erzeuger die Basis aus den Summen
    # (z. B. Skonto nur auf den Warenanteil ohne Fracht); dort zaehlt nur die Obergrenze Satz x Rechnungsbetrag.
    if teilbasis_sperrt and re.search(r"ausgenommen|ausgeschlossen|exkl|skontof(?:ä|ae)hig|skontierf|nicht\s+skont|nicht\s+abzugsf|material|waren|fracht|versand|porto|nur\s+auf|teilbetrag|\(\s*(?:ohne|nicht|exkl)", text, re.I) and not any(b is not None for _, _, b in stufen):
        return "Skonto nur auf einen Teil des Betrags: selbst pruefen", None
    if not stufen:
        return "Skontobedingung auf der Rechnung nicht lesbar", None
    passend = [f for f, satz, betrag in stufen if (abzug == betrag if betrag is not None else abzug <= round(brutto_cent * satz / 100) + 1)]
    if not passend:
        return "Abzug passt zu keiner Skontostufe der Rechnung", None
    laufend = [f for f in passend if f >= heute]
    return (None, max(laufend)) if laufend else (f"Skontofrist am {max(passend)} abgelaufen", None)


def brutto_aus_summen(text):
    """Genau ein Betrag X mit Netto N und Steuer S (19 % oder 7 %, auf den Cent) und N + S = X im Text; sonst None."""
    werte = {int(m.replace(".", "").replace(",", "")) for m in re.findall(r"(?<![0-9.,])(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?![0-9])", text)}
    steuer = lambda n, q: (n * q + 50) // 100  # kaufmaennisch wie Math.round im Erzeuger (Cent, positiv)
    treffer = {n + steuer(n, q) for n in werte for q in (19, 7) if steuer(n, q) > 0 and steuer(n, q) in werte and n + steuer(n, q) in werte}
    beschriftet = {m for m in re.findall(r"(?:Rechnungsbetrag|Gesamtbetrag|Zahlbetrag|zu zahlen|Endbetrag|Gesamtsumme)[ \t]*:?[ \t]*(?:EUR|€)?[ \t]*(\d{1,3}(?:\.\d{3})*,\d{2})", text, re.I)}
    if len(beschriftet) > 1:
        return None
    if re.search(r"rabatt|nachlass|abzug|abz(?:ü|ue)g|abzgl|gutschrift|anzahlung|bereits|teilzahlung|(?:^|\s)[-−–]\s*\d+,\d{2}|\d,\d{2}\s*[-−–](?!\s*\d)", text, re.I):
        return None
    # Nur das Rechnungsgesamt: der groesste Betrag im Text.
    return treffer.pop() / 100 if len(treffer) == 1 and max(treffer) == max(werte) else None


MONATE = ["januar", "februar", "maerz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"]


def rechnungsdatum_aus_text(text, vor=None):
    """Beschriftetes Rechnungsdatum (dd.mm.yyyy), sonst ein ausgeschriebenes Datum direkt hinter dem Ort der
    Vorlage am Zeilenanfang („Berlin 23. November 2026“); bei beschriftetem, aber unlesbarem Datum None."""
    beschriftet = {f"{j}-{int(m):02d}-{int(t):02d}" for t, m, j in re.findall(r"Rechnungsdatum\s*:?\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", text, re.I)}
    if len(beschriftet) == 1:
        return beschriftet.pop()
    if not vor or re.search(r"rechnungsdatum|datum\s*:", text, re.I):
        return None
    d = {f"{j}-{MONATE.index(m.lower().replace('ä', 'ae')) + 1:02d}-{int(t):02d}"
         for t, m, j in re.findall(rf"(?:^|\n)[ \t]*{re.escape(vor)},?[ \t]+(\d{{1,2}})\.[ \t]*(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)[ \t]+(\d{{4}})", text, re.I)}
    if len(d) != 1:
        return None
    tag = d.pop()
    try:
        date.fromisoformat(tag)
    except ValueError:
        return None
    return tag


def ocr_text(pfad):
    """Texterkennung ueber pdf_ocr.swift; ohne swift (Linux, CI) leer."""
    import subprocess
    try:
        r = subprocess.run(["swift", str(Path(__file__).with_name("pdf_ocr.swift")), str(pfad)], capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return r.stdout if r.returncode == 0 else ""


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
                           "datum": b.get("rechnungsdatum") or b.get("tag") or "", "rechnungsdatum": b.get("rechnungsdatum"), "art": b.get("art"), "datei": b.get("datei"), "text": text, "xml": bool(b.get("xmlDatei")),
                           "pfad": ordner / b["datei"] if b.get("datei") and str(b["datei"]).lower().endswith(".pdf") else None})
    return belege


def datei_pruefen(name, xml, *, lieferanten, belege, buchungen, andere, heute=None):
    """@returns (fehler, hinweise) als Listen von Saetzen."""
    fehler, hinweise = [], []
    heute = heute or date.today().isoformat()
    kopf, zahlungen = sepa_lesen(xml)
    gesamt = sum(z["cent"] or 0 for z in zahlungen)
    if not zahlungen:
        fehler.append("keine Zahlung in der Datei")
    if kopf["anzahl"] != [len(zahlungen)] * 2 or kopf["summe"] != [gesamt] * 2:
        fehler.append(f"Kopf passt nicht: Anzahl {kopf['anzahl']} bei {len(zahlungen)} Zahlungen, Kontrollsumme {kopf['summe']} bei {gesamt}")
    if not iban_gueltig(kopf["schuldner"]):
        fehler.append("Auftraggeber-IBAN ungueltig")
    gesehen = set()
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
        # Bankverbindung nur als Bild im PDF: lokale Texterkennung (macOS Vision) nachlegen.
        if (nur_zeichen(z["iban"]) not in nur_zeichen(text) or b["brutto"] is None) and b.get("pfad"):
            text += " " + ocr_text(b["pfad"])
        if re.search(r"lastschrift|eingezogen|abgebucht|abbuchen|bankeinzug|mandat|<(?:ram:)?TypeCode>\s*59\s*</", text, re.I):
            fehler.append(f"{wer}: Rechnung nennt Lastschrift oder Einzug")
        if nur_zeichen(z["iban"]) not in nur_zeichen(text):
            fehler.append(f"{wer}: IBAN steht nicht auf der Rechnung")
        vorlage = (lieferanten.get(b["schluessel"]) or {}).get("vorlage") or {}
        # Rechenprobe nur fuer Lieferanten mit bestaetigter Vorlage (wie der Erzeuger).
        brutto = b["brutto"] if b["brutto"] is not None else (brutto_aus_summen(text) if vorlage.get("rechenprobe") is True else None)
        if brutto is not None and b["brutto"] is None:
            hinweise.append(f"{wer}: Rechnungsbetrag {brutto:.2f} aus Netto + MwSt der Rechnung ermittelt")
            b = {**b, "brutto": brutto}
        if b["brutto"] is None:
            betrag = f"{z['cent'] // 100},{z['cent'] % 100:02d}"
            if re.search(rf"(Gesamtbetrag|Rechnungsbetrag|Endbetrag|zu zahlen|Zahlbetrag)(?:(?!netto)[^0-9]){{0,30}}(^|[^0-9.,]){betrag}($|[^0-9])", text, re.I):
                hinweise.append(f"{wer}: Rechnungswert nicht im Archiv, Gesamtbetrag {betrag} steht aber auf der Rechnung")
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
                # Reine PDF ohne XML: Skonto nur mit Vorlage, deren Bedingungen wortgleich drinstehen; ausserhalb davon
                # kein Skonto-/Netto-Hinweis, und keine widerspruechlichen Gesamtbetraege (wie der Erzeuger).
                flach = re.sub(r"\s+", " ", text)
                bed = re.sub(r"\s+", " ", str(vorlage.get("bedingungen") or "")).strip()
                gesamt = {x for x in re.findall(r"(?:Rechnungsbetrag|Gesamtbetrag|Zahlbetrag|zu zahlen|Endbetrag|Gesamtsumme)[ \t]*:?[ \t]*(?:EUR|€)?[ \t]*(\d{1,3}(?:\.\d{3})*,\d{2})", text, re.I)}
                if not b.get("xml") and (not bed or bed not in flach or re.search(r"skonto|netto|basis|betrag\s+ohne|abzugsf", flach.replace(bed, " "), re.I)):
                    fehler.append(f"{wer}: Skonto aus der PDF nur mit wortgleich bestaetigten Bedingungen des Lieferanten")
                elif not b.get("xml") and (len(gesamt) > 1 or (gesamt and cent(gesamt.pop().replace(".", "").replace(",", ".")) != cent(b["brutto"]))):
                    fehler.append(f"{wer}: widerspruechliche Gesamtbetraege auf der Rechnung")
                # Skontofrist nur ab belegtem Rechnungsdatum (Archiv oder ausgeschrieben im Text), nie ab dem Maileingang.
                grund, frist = skonto_pruefen(text, b.get("rechnungsdatum") or rechnungsdatum_aus_text(text, vorlage.get("datumVor")), abzug, skonto_basis(text, cent(b["brutto"])) if b.get("xml") else cent(b["brutto"]), heute, teilbasis_sperrt=not b.get("xml"))
                if abzug > cent(b["brutto"]) * SKONTO_MAX or genannt not in z["zweck"] or grund:
                    fehler.append(f"{wer}: Abzug {genannt} EUR nicht als Skonto belegt (Rechnung {b['brutto']:.2f}){': ' + grund if grund else ''}")
                else:
                    hinweise.append(f"{wer}: Skonto {genannt} EUR ({abzug / cent(b['brutto']) * 100:.1f} %), Frist {frist} – bis dahin freigeben")
        for x in buchungen:
            gleicher = nur_zeichen(z["iban"]) in x["ibans"] if x["ibans"] else bool(konfig) and gleicher_name(x["name"], lieferanten[konfig[0]].get("name"))
            if x["betrag"] < 0 and gleicher and x["datum"] >= (b["datum"] or "") and nummer_im(x["text"], nummer):
                fehler.append(f"{wer}: laut Kontoauszug schon bezahlt am {x['datum']} ({-x['betrag']:.2f} EUR)")
                break
        frueher = {i for x in buchungen if x["betrag"] < 0 and konfig and gleicher_name(x["name"], lieferanten[konfig[0]].get("name")) for i in x["ibans"]}
        if frueher and nur_zeichen(z["iban"]) not in frueher:
            hinweise.append(f"{wer}: frueher an eine andere IBAN dieses Namens gezahlt – Konto vor Freigabe pruefen")
        if not frueher:
            hinweise.append(f"{wer}: an diese IBAN noch nie ueberwiesen (laut Kontoauszug)")
        schluessel = (nur_zeichen(z["iban"]), nur_zeichen(nummer))
        if schluessel in gesehen:
            fehler.append(f"{wer}: steht zweimal in dieser Datei")
        gesehen.add(schluessel)
        for andere_datei, nummern in andere.items():
            if andere_datei != name and schluessel in nummern:
                fehler.append(f"{wer}: steht auch in {andere_datei}")
    return fehler, hinweise


def main(argv):
    privat = Path(os.environ.get("TP_PRIVAT_DIR") or Path.home() / "teppich-paradies-analyse")
    ordner = privat / "zahlungen"
    konfig = json.loads((ordner / "konfiguration.json").read_text("utf-8"))
    # Aktiv ist, was in vorgemerkt.json steht: eine verworfene Datei verliert dort ihre Eintraege.
    vorgemerkt = json.loads((ordner / "vorgemerkt.json").read_text("utf-8")) if (ordner / "vorgemerkt.json").exists() else []
    aktive = {ordner / v["datei"] for v in vorgemerkt if v.get("datei") and (ordner / v["datei"]).exists()}
    dateien = [Path(a) for a in argv] or sorted(aktive)
    andere = {p.name: {(nur_zeichen(z["iban"]), nur_zeichen(re.sub(r"^RE-", "", z["ende"]))) for z in sepa_lesen(p.read_text("utf-8"))[1]} for p in aktive | set(dateien)}
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
