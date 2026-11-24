#!/usr/bin/env python3
"""Kontoumsaetze des Geschaeftskontos per FinTS 3.0 (PIN/TAN) NUR LESEN und als CSV im Format des
Banking-Exports ablegen, damit Sammeldatei und Zwischenpruefer ohne Handexport aktuell sind.

Aufruf (venv mit python-fints):
  ~/.venvs/analyse/bin/python operations/scripts/bank_fints_abruf.py            # Dienst: Freigabe noetig -> Abbruch
  ~/.venvs/analyse/bin/python operations/scripts/bank_fints_abruf.py --warten 300  # im Terminal: auf App-Freigabe warten

Zugangsdaten nur im macOS-Schluesselbund, Dienst "tp-fints-commerzbank", je ein Eintrag:
  Konto "anmeldename" (Teilnehmernummer), "pin", optional "produkt" (Produkt-Registrierungsnummer der DK).
Das Skript gibt sie nie aus. Nach einer abgelehnten PIN legt es zahlungen/fints-pin-falsch an und
versucht es nicht erneut (Sperre nach Fehlversuchen), bis die Datei geloescht ist.

Ausgabe: $TP_PRIVAT_DIR/laden-entlastung-2026-11/bank-export/<IBAN>_EUR_<TT-MM-JJJJ>_<HHMM>.csv,
alle anderen Dateien dort wandern nach bank-export-alt/ (dort liegt immer nur EIN Export).
Exit: 0 gut, 2 Freigabe in der photoTAN-App noetig, 3 Zugangsdaten fehlen/PIN gesperrt, 1 sonstiger Fehler.
"""
import argparse
import csv
import io
import json
import os
import subprocess
import sys
import time
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

BLZ = "10040000"
SERVER = "https://fints.commerzbank.de/fints"
SCHLUESSELBUND = "tp-fints-commerzbank"
KOPF = ["Buchungstag", "Wertstellung", "Umsatzart", "Buchungstext", "Betrag", "Währung", "IBAN Kontoinhaber",
        "Kategorie", "Sender", "Empfänger", "Verwendungszweck"]
# Lesesperre: nur diese Segmente duerfen zur Bank. Ueberweisung (HKCCS/HKCCM/HKIPZ), Lastschrift (HKDSE ...),
# Dauerauftrag (HKCDE ...) und alles andere bricht ab, bevor etwas gesendet wird.
ERLAUBT = {"HKIDN", "HKVVB", "HKSYN", "HKEND", "HKTAN", "HKTAB", "HKSPA", "HKKAZ", "HKCAZ", "HKSAL"}
GVC_LASTSCHRIFT = {"104", "105", "107", "108", "109"}
GVC_DAUERAUFTRAG = {"117", "152"}


class FreigabeNoetig(Exception):
    pass


class Zugang(Exception):
    pass


def segmente_pruefen(segmente):
    """Wirft, sobald ein Segment kein reines Abfragesegment ist."""
    for s in segmente:
        typ = getattr(getattr(s, "header", None), "type", None)
        if typ not in ERLAUBT:
            raise PermissionError(f"Lesesperre: Segment {typ!r} ist kein Abfragesegment, nichts gesendet")


def betrag_text(wert):
    """Decimal -> deutsches Format mit Komma ("-159,52")."""
    return f"{Decimal(wert):.2f}".replace(".", ",")


def umsatzart(d):
    gvc = str(d.get("transaction_code") or "")
    text = f"{d.get('posting_text') or ''}".lower()
    if "echtzeit" in text or "instant" in text:
        return "Überweisung (Echtzeit)"
    if gvc in GVC_LASTSCHRIFT or "lastschrift" in text:
        return "Lastschrift"
    if gvc in GVC_DAUERAUFTRAG or "dauerauftrag" in text:
        return "Dauerauftrag"
    if gvc.startswith("8") or "entgelt" in text or "abschluss" in text or "zins" in text:
        return "Zinsen/Entgelte"
    return "Überweisung"


def zeile(d, iban_eigen):
    """Eine Buchung (Werte aus python-fints/mt940, schon als Python-Typen) zu einer Exportzeile."""
    betrag = Decimal(d["betrag"])
    name = " ".join(str(d.get("applicant_name") or "").split())
    zweck = " ".join(str(d.get("purpose") or "").split())
    teile = [name, zweck]
    for marke, schluessel in (("End-to-End-Ref.:", "end_to_end_reference"), ("Mandatsref:", "additional_position_reference"),
                              ("Gläubiger-ID:", "applicant_creditor_id"), ("IBAN:", "applicant_iban"), ("BIC:", "applicant_bin")):
        wert = str(d.get(schluessel) or "").strip()
        if wert and wert.upper() != "NOTPROVIDED":
            teile.append(f"{marke} {wert}")
    buchung = d.get("entry_date") or d["date"]
    return [buchung.strftime("%d.%m.%Y"), d["date"].strftime("%d.%m.%Y"), umsatzart(d), " ".join(t for t in teile if t),
            betrag_text(betrag), d.get("currency") or "EUR", iban_eigen, "",
            name if betrag > 0 else "", name if betrag <= 0 else "", zweck]


def csv_text(buchungen, iban_eigen):
    """Neueste zuerst wie der Banking-Export, UTF-8 mit BOM, Semikolon."""
    puffer = io.StringIO()
    w = csv.writer(puffer, delimiter=";", lineterminator="\n")
    w.writerow(KOPF)
    for d in sorted(buchungen, key=lambda d: d.get("entry_date") or d["date"], reverse=True):
        w.writerow(zeile(d, iban_eigen))
    return "﻿" + puffer.getvalue()


def ablegen(text, ordner, alt, iban, jetzt):
    """Neue Datei atomar schreiben, danach alle anderen Exporte nach alt/ verschieben (nie ueberschreiben)."""
    ordner.mkdir(parents=True, exist_ok=True)
    alt.mkdir(parents=True, exist_ok=True)
    name = f"{iban}_EUR_{jetzt:%d-%m-%Y_%H%M}.csv"
    temp = ordner / f".{name}.{os.getpid()}.tmp"
    temp.write_text(text, encoding="utf-8")
    os.chmod(temp, 0o600)
    os.replace(temp, ordner / name)
    for p in ordner.iterdir():
        if p.name == name or p.name.startswith("."):
            continue
        ziel = alt / p.name
        n = 1
        while ziel.exists():
            ziel = alt / f"{p.stem}-{n}{p.suffix}"
            n += 1
        p.rename(ziel)
    return ordner / name


def geheim(konto):
    r = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", SCHLUESSELBUND, "-a", konto, "-w"],
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        raise Zugang(f"Schlüsselbund-Eintrag fehlt: Dienst {SCHLUESSELBUND}, Konto {konto}")
    return r.stdout.rstrip("\n")


def freigeben(client, antwort, warten):
    """Decoupled (photoTAN-App): bis `warten` Sekunden auf die Freigabe pollen, sonst Abbruch."""
    from fints.client import NeedTANResponse
    ende = time.monotonic() + warten
    if isinstance(antwort, NeedTANResponse):
        if not antwort.decoupled:
            # shortcut: nur App-Freigabe (decoupled); eine einzutippende TAN braucht einen Dialog, erst bauen, falls die Bank sie verlangt.
            raise FreigabeNoetig("Die Bank verlangt eine TAN zum Eintippen; das Skript kann nur die Freigabe in der photoTAN-App.")
        print("Freigabe nötig: bitte in der photoTAN-App der Commerzbank den Kontoabruf bestätigen.", file=sys.stderr, flush=True)
    while isinstance(antwort, NeedTANResponse):
        if time.monotonic() > ende:
            raise FreigabeNoetig("Keine Freigabe erhalten. Im Terminal mit --warten 300 starten und in der photoTAN-App bestätigen.")
        time.sleep(5)
        antwort = client.send_tan(antwort, "")
    return antwort


def tan_verfahren_waehlen(client):
    if client.get_current_tan_mechanism() not in (None, "999"):  # 999 = Einschritt, nur fuer den ersten Dialog
        return
    client.fetch_tan_mechanisms()
    verfahren = client.get_tan_mechanisms()
    wahl = next((k for k, v in verfahren.items() if "phototan" in str(getattr(v, "name", "")).lower()), next(iter(verfahren), None))
    if not wahl:
        raise FreigabeNoetig("Die Bank nennt kein TAN-Verfahren für diesen Zugang.")
    client.set_tan_mechanism(wahl)
    if client.is_tan_media_required() and not client.selected_tan_medium:
        medien = client.get_tan_media()[1]
        if medien:
            client.set_tan_medium(medien[0])


def abrufen(zustand_pfad, iban_soll, von, bis, warten):
    from fints import dialog
    from fints.client import FinTS3PinTanClient
    from fints.exceptions import FinTSClientPINError, FinTSDialogInitError

    original = dialog.FinTSDialog.send

    def gesperrt(self, *segmente, **kw):
        segmente_pruefen(segmente)
        antwort = original(self, *segmente, **kw)
        # Fehler (9xxx) der Bank ins Log, sonst bleibt nur "Could not find system_id"; enthalten keine Zugangsdaten.
        for seg in antwort.find_segments(("HIRMG", "HIRMS")):
            for r in seg.responses:
                if r.code.startswith("9"):
                    print(f"Bank {r.code}: {r.text}", file=sys.stderr)
                if r.code == "9952":
                    raise Zugang("Die Bank lehnt das Programm ab (9952): Produkt-Registrierungsnummer der Deutschen Kreditwirtschaft fehlt.")
        return antwort
    dialog.FinTSDialog.send = gesperrt

    zustand = zustand_pfad.read_bytes() if zustand_pfad.exists() else None
    try:
        produkt = geheim("produkt")
    except Zugang:
        # shortcut: ohne DK-Registrierungsnummer ein eigener, nicht registrierter Name; lehnt die Bank ihn ab, Nummer beantragen.
        produkt = "TPKontoabruf"
        print("Hinweis: keine Produkt-Registrierungsnummer im Schlüsselbund, versuche es unregistriert.", file=sys.stderr)
    client = FinTS3PinTanClient(BLZ, geheim("anmeldename"), geheim("pin"), SERVER, product_id=produkt, from_data=zustand)
    try:
        tan_verfahren_waehlen(client)
        with client:
            if client.init_tan_response:
                freigeben(client, client.init_tan_response, warten)
            konten = client.get_sepa_accounts()
            konto = next((k for k in konten if k.iban == iban_soll), None)
            if not konto:
                raise RuntimeError(f"Konto {iban_soll[:4]}…{iban_soll[-4:]} nicht unter den {len(konten)} Konten dieses Zugangs")
            antwort = freigeben(client, client.get_transactions(konto, von, bis), warten)
    except FinTSDialogInitError as e:
        if isinstance(e.__cause__, Zugang):
            raise e.__cause__
        raise
    except FinTSClientPINError:
        (zustand_pfad.parent / "fints-pin-falsch").touch()
        raise Zugang("Die Bank hat die PIN abgelehnt. Keine weiteren Versuche (Sperrgefahr): PIN im Schlüsselbund prüfen, dann zahlungen/fints-pin-falsch löschen.")
    finally:
        zustand_pfad.write_bytes(client.deconstruct(including_private=True))
        os.chmod(zustand_pfad, 0o600)
    buchungen = []
    for t in antwort:
        d = dict(t.data)
        d["betrag"] = d["amount"].amount
        d["currency"] = getattr(d["amount"], "currency", None) or d.get("currency")
        buchungen.append(d)
    return buchungen


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--tage", type=int, default=89, help="Zeitraum rückwärts ab heute (Banken geben ohne TAN meist 90 Tage)")
    ap.add_argument("--warten", type=int, default=0, help="Sekunden auf die App-Freigabe warten (0 = sofort abbrechen)")
    ap.add_argument("--privat", default=os.environ.get("TP_PRIVAT_DIR") or str(Path.home() / "teppich-paradies-analyse"))
    a = ap.parse_args()
    privat = Path(a.privat)
    zahlungen = privat / "zahlungen"
    if (zahlungen / "fints-pin-falsch").exists():
        print("Abbruch: PIN wurde zuletzt abgelehnt (zahlungen/fints-pin-falsch). Erst PIN prüfen, dann die Datei löschen.", file=sys.stderr)
        return 3
    iban = json.loads((zahlungen / "konfiguration.json").read_text(encoding="utf-8"))["auftraggeber"]["iban"].replace(" ", "")
    heute = date.today()
    try:
        buchungen = abrufen(zahlungen / "fints-zustand.bin", iban, heute - timedelta(days=a.tage), heute, a.warten)
    except FreigabeNoetig as e:
        print(f"Freigabe nötig: {e}", file=sys.stderr)
        return 2
    except Zugang as e:
        print(f"Zugang: {e}", file=sys.stderr)
        return 3
    basis = privat / "laden-entlastung-2026-11"
    datei = ablegen(csv_text(buchungen, iban), basis / "bank-export", basis / "bank-export-alt", iban, datetime.now())
    tage = sorted(d.get("entry_date") or d["date"] for d in buchungen)
    print(f"{len(buchungen)} Buchungen {tage[0] if tage else '-'} bis {tage[-1] if tage else '-'} -> {datei.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
