#!/usr/bin/env python3
"""
Gmail-Scanner für VMA-Abwesenheits-Detektion
Sucht automatisch nach Krankschreibungen, Urlaub, AU, etc.
"""

import sys
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import re

# Gmail-Integration (wird dynamisch geladen, falls verfügbar)
GMAIL_AVAILABLE = False
try:
    from google.auth.transport.requests import Request
    from google.oauth2.service_account import Credentials
    from google.cloud import gmail_v1
    GMAIL_AVAILABLE = True
except ImportError:
    pass

# ============================================================================
# KONFIGURATION
# ============================================================================

EMPLOYEES = {
    'Thomas': ['Thomas', 'Rückheim'],
    'Ben': ['Ben', 'Ben Jason', 'Penske'],
    'Rufat': ['Rufat', 'Guseynov'],
    'Hayatin': ['Hayatin', 'Yuscen'],
}

# Manager-E-Mails für Krankschreibungs-Bestätigungen
# (E-Mails an diese Adresse = Krankschreibungen wurden eingereicht)
# Korrigiert 24.09.2026: tatsächliche Adresse ist @web.de, nicht @teppich-paradies.net
MANAGER_EMAILS = {
    'Rufat': 'e.carl-uezer@web.de',  # Empfänger von Krankschreibungen für Rufat
}

# Firmen-Postfach, das durchsucht wird (nicht das private Konto!)
COMPANY_INBOX = 'kontakt@teppich-paradies.net'

# HINWEIS (24.09.2026): Dieses Skript ist als eigenständiges Python-Programm NICHT
# ausführbar im Sinne von "läuft automatisch" - es hat keinen Zugriff auf den
# Gmail-MCP-Connector, den nur eine laufende Claude-Session hat. Die produktive
# Automatisierung läuft über eine monatliche Routine (Claude-Trigger), die
# mcp__Gmail__search_threads direkt aufruft. Siehe VMA_GMAIL_INTEGRATION.md.
# Dieses Skript dient nur als Referenz für Keywords/CSV-Format.

SEARCH_KEYWORDS = {
    'krank': ['krank', 'krankmeldung', 'krankschein', 'arzt', 'arzttermin'],
    'urlaub': ['urlaub', 'bezahlter urlaub', 'freistellung', 'frei'],
    'au': ['au', 'eAU', 'arbeitsunfähig', 'arbeitsunfähigkeit'],
}

CONFIDENCE_LEVELS = {
    'hoch': 'Automatisch eintragen',
    'mittel': 'Fragen',
    'niedrig': 'Ignorieren',
}

# ============================================================================
# HILFSFUNKTIONEN
# ============================================================================

def extract_date_from_email(subject: str, body: str, month: int, year: int) -> Optional[Tuple[int, int]]:
    """
    Versucht, Start- und End-Datum aus E-Mail zu extrahieren.
    Gibt (start_day, end_day) oder None zurück.
    """
    # Regex-Muster für Daten
    date_patterns = [
        r'(\d{1,2})[.\s-](\d{1,2})[.\s-](\d{2,4})',  # 10.06.2026 oder 10-06-2026
        r'(\d{1,2})[.\s-](\d{1,2})',  # 10.06 (nur Tag.Monat)
    ]

    full_text = f"{subject} {body}".lower()

    # Vereinfachte Logik: Suche nach Zahlenkombinationen
    for pattern in date_patterns:
        matches = re.findall(pattern, full_text)
        if matches:
            # Nehme das erste Match
            match = matches[0]
            try:
                if len(match) == 3:
                    day, month_found, year_found = int(match[0]), int(match[1]), int(match[2])
                    # Jahr normalisieren
                    if year_found < 100:
                        year_found += 2000
                    if year_found == year and month_found == month:
                        return (day, day)
                elif len(match) == 2:
                    day, month_found = int(match[0]), int(match[1])
                    if month_found == month:
                        return (day, day)
            except ValueError:
                continue

    return None

def assess_confidence(subject: str, body: str, absence_type: str) -> str:
    """
    Bewertet die Sicherheit, dass es sich um die angenommene Abwesenheitsart handelt.
    """
    full_text = f"{subject} {body}".lower()

    # Hoch-Sicherheit-Keywords
    high_confidence_kw = {
        'krank': ['ärztliche bescheinigung', 'arbeitsunfähigkeitsbescheinigung', 'krankenschein', 'von meinem arzt'],
        'urlaub': ['urlaubsantrag', 'urlaub genehmigt', 'freigestellte tage', 'freigegeben'],
        'au': ['au', 'arbeitsunfähig', 'eAU', 'arbeitsunfähigkeitsbescheinigung'],
    }

    # Mittel-Sicherheit: explizit genannt
    medium_confidence_kw = {
        'krank': ['bin krank', 'bin erkältet', 'arzttermin', 'flu', 'grippe'],
        'urlaub': ['nehme urlaub', 'bin im urlaub', 'freie tage'],
        'au': ['bin arbeitsunfähig', 'nicht arbeitsfähig'],
    }

    # Prüfe High-Confidence
    if absence_type in high_confidence_kw:
        for kw in high_confidence_kw[absence_type]:
            if kw in full_text:
                return 'hoch'

    # Prüfe Medium-Confidence
    if absence_type in medium_confidence_kw:
        for kw in medium_confidence_kw[absence_type]:
            if kw in full_text:
                return 'mittel'

    return 'niedrig'

# ============================================================================
# GMAIL-INTEGRATION (MCP-basiert)
# ============================================================================

def search_gmail_for_absences(month: int, year: int) -> Dict[str, List[Dict]]:
    """
    Sucht im Gmail nach Abwesenheits-E-Mails.
    Gibt {employee: [{'date': (start, end), 'type': 'krank|urlaub', 'subject': '...', 'confidence': 'hoch|mittel|niedrig', 'body': '...', 'source': 'gmail|manager_email'}]} zurück.

    Suchquellen:
    1. E-Mails VON Mitarbeitern (Betreff: krank, urlaub, au, etc.)
    2. E-Mails AN Manager (z.B. e.carl-uezer@ für Rufat) = Krankschreibungen eingereicht

    WARNUNG: Diese Funktion benötigt Gmail-Zugriff über MCP.
    Falls nicht verfügbar, gibt sie ein leeres Dict zurück.
    """
    results = {}

    # Zeitfenster: Monat ± 3 Tage
    start_date = datetime(year, month, 1) - timedelta(days=3)
    end_date = datetime(year, month, 28) + timedelta(days=3)

    print(f"\n📧 Gmail-Suche: {month}/{year} ({start_date.date()} bis {end_date.date()})")
    print("⚠️  Hinweis: Gmail-Zugriff nicht implementiert (würde MCP verwenden)")
    print("   → Sucht nach:")
    print("     • E-Mails VON Mitarbeitern (krank, urlaub, au, etc.)")
    print("     • E-Mails AN Manager (z.B. e.carl-uezer@ für Rufat)")
    print("   → Verwende stattdessen CSV-Abwesenheits-Datei")
    print()

    # PLACEHOLDER: Echte Implementierung würde MCP Gmail-Tools verwenden
    # Zwei Such-Strategien:
    # 1. Nach Mitarbeiternamen + Keyword suchen
    # 2. Nach Manager-Emails durchsuchen (TO: e.carl-uezer@...) und Mitarbeiter identifizieren
    #
    # Beispiel (würde von echtem Gmail kommen):
    # results['Rufat'] = [
    #     {
    #         'date': (10, 12),
    #         'type': 'krank',
    #         'subject': 'Krankmeldung 10.-12. Juni',
    #         'body': 'Bin erkältet und krankgemeldet...',
    #         'confidence': 'hoch',  # Von Manager-Email = high confidence
    #         'source': 'manager_email',  # Eingereicht an e.carl-uezer@
    #     }
    # ]

    return results

def print_gmail_findings(findings: Dict[str, List[Dict]], month: int, year: int) -> None:
    """
    Gibt gefundene Abwesenheits-E-Mails in tabellarischer Form aus.
    """
    if not findings:
        print("✓ Keine Abwesenheits-E-Mails gefunden.")
        return

    print("\n" + "="*100)
    print(f"GMAIL-SCAN-ERGEBNISSE: {month}/{year}")
    print("="*100)
    print()

    for emp in sorted(findings.keys()):
        items = findings[emp]
        if not items:
            continue

        print(f"📧 {emp}:")
        for i, item in enumerate(items, 1):
            start, end = item['date']
            print(f"  {i}. {start:02d}.–{end:02d}.{month:02d}.{year} | {item['type'].upper():6s} | Sicherheit: {item['confidence'].upper():6s}")
            print(f"     Betreff: {item['subject'][:60]}")
            print(f"     Sicherheit: {CONFIDENCE_LEVELS[item['confidence']]}")
            print()

def suggest_csv_entries(findings: Dict[str, List[Dict]], month: int, year: int) -> List[str]:
    """
    Konvertiert Gmail-Findings zu CSV-Einträgen für abwesenheiten.csv
    """
    csv_lines = []

    for emp in sorted(findings.keys()):
        items = findings[emp]
        for item in items:
            if item['confidence'] == 'hoch':  # Nur high-confidence
                start, end = item['date']
                csv_line = f"{emp},{start:02d}.{month:02d}.{year},{end:02d}.{month:02d}.{year},{item['type']},8.00,Aus Gmail erkannt"
                csv_lines.append(csv_line)

    return csv_lines

# ============================================================================
# CLI
# ============================================================================

def main():
    if len(sys.argv) < 3:
        print("Nutzung: python3 vma_gmail_scanner.py <Monat> <Jahr> [--create-csv]")
        print()
        print("Beispiele:")
        print("  python3 vma_gmail_scanner.py 6 2026")
        print("  python3 vma_gmail_scanner.py 6 2026 --create-csv")
        print()
        print("Hinweis: Gmail-Integration benötigt MCP Google Mail Connector")
        sys.exit(1)

    month = int(sys.argv[1])
    year = int(sys.argv[2])
    create_csv = '--create-csv' in sys.argv

    print(f"\n{'='*80}")
    print(f"VMA Gmail-Scanner")
    print(f"{'='*80}")
    print(f"Suche: {month}/{year}")
    print()

    # Suche im Gmail
    findings = search_gmail_for_absences(month, year)

    # Zeige Findings
    if findings:
        print_gmail_findings(findings, month, year)

        # CSV-Vorschlag
        csv_entries = suggest_csv_entries(findings, month, year)
        if csv_entries and create_csv:
            csv_file = f"abwesenheiten_{month:02d}_{year}.csv"
            print(f"\n📝 Erstelle {csv_file}...")
            with open(csv_file, 'w', encoding='utf-8') as f:
                f.write("Mitarbeiter,Startdatum,Enddatum,Art,Stunden_pro_Tag,Hinweis\n")
                for line in csv_entries:
                    f.write(line + "\n")
            print(f"✓ {csv_file} erstellt ({len(csv_entries)} Einträge)")
    else:
        print("✓ Keine Abwesenheits-E-Mails gefunden.")

    print(f"\n{'='*80}")
    print("Nächste Schritte:")
    print("  1. Überprüfe obige Ergebnisse manuell")
    print("  2. Ggf. CSV-Datei korrigieren")
    print(f"  3. Dann: python3 vma_batch.py {month} {year} --absences abwesenheiten_{month:02d}_{year}.csv")
    print()

if __name__ == '__main__':
    main()
