#!/usr/bin/env python3
"""
Google Calendar Scanner für VMA-Abwesenheits-Detektion
Sucht automatisch nach Urlaubseinträgen im Kalender.
"""

import sys
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import re

# Google Calendar Integration (wird dynamisch geladen, falls verfügbar)
CALENDAR_AVAILABLE = False
try:
    # Placeholder für Google Calendar MCP
    CALENDAR_AVAILABLE = True
except ImportError:
    pass

# ============================================================================
# KONFIGURATION
# ============================================================================

EMPLOYEES = {
    'Thomas': ['Thomas', 'Rückheim'],
    'Ben': ['Ben', 'Ben Jason', 'Penske'],
    'Rufat': ['Rufat', 'Guseynov'],
    'Hayatin': ['Hayatin', 'Yuscen'],  # Hinweis: Kalender nicht zuverlässig
}

SKIP_EMPLOYEES = ['Hayatin']  # Kalendereinträge bei Hayatin ignorieren

CALENDAR_KEYWORDS = {
    'urlaub': ['urlaub', 'vacation', 'time off', 'frei', 'freistellung'],
    'feiertag': ['feiertag', 'holiday'],
}

# ============================================================================
# HILFSFUNKTIONEN
# ============================================================================

def extract_dates_from_event(event_title: str, event_start: str, event_end: str,
                            month: int, year: int) -> Optional[Tuple[int, int]]:
    """
    Versucht, Start- und End-Datum aus Kalender-Event zu extrahieren.
    Gibt (start_day, end_day) oder None zurück.

    event_start/event_end sind ISO-Format: 2026-09-15 oder 2026-09-15T09:00:00Z
    """
    try:
        # Parse ISO dates
        if 'T' in event_start:
            start_date = datetime.fromisoformat(event_start.replace('Z', '+00:00')).date()
        else:
            start_date = datetime.fromisoformat(event_start).date()

        if 'T' in event_end:
            end_date = datetime.fromisoformat(event_end.replace('Z', '+00:00')).date()
        else:
            end_date = datetime.fromisoformat(event_end).date()

        # Prüfe, ob Datum im Zielmonat liegt
        if start_date.year == year and start_date.month == month:
            # Für ganztägige Events: end_date ist Exklusiv-Grenze (z.B. 2026-09-16 für Event bis 2026-09-15)
            # Für Events mit Zeit: beide Daten verwenden
            if event_start.endswith('T') or event_end.endswith('T'):
                # Ganztägig: nimm start bis end-1
                actual_end = end_date - timedelta(days=1)
            else:
                actual_end = end_date

            if actual_end.month == month:
                return (start_date.day, actual_end.day)
            else:
                # Event endet im nächsten Monat, aber startet im Zielmonat
                return (start_date.day, 30)  # Vereinfachung: bis Monatsende

        elif start_date.year == year and start_date.month < month:
            # Event startet im Vormonat, könnte aber in den Zielmonat reichen
            if end_date.year == year and end_date.month == month:
                return (1, end_date.day - 1)  # Von Monatsanfang bis Event-Ende

    except (ValueError, AttributeError):
        pass

    return None

def extract_employee_from_event(event_title: str, event_description: str = "") -> Optional[str]:
    """
    Versucht, Mitarbeiternamen aus Event-Titel oder -Beschreibung zu extrahieren.
    """
    full_text = f"{event_title} {event_description}".lower()

    for emp_key, variants in EMPLOYEES.items():
        for variant in variants:
            if variant.lower() in full_text:
                return emp_key

    return None

def search_calendar_for_absences(month: int, year: int) -> Dict[str, List[Dict]]:
    """
    Sucht im Google Calendar nach Urlaubseinträgen.
    Gibt {employee: [{'date': (start, end), 'type': 'urlaub', 'title': '...', 'source': 'calendar'}]} zurück.

    WARNUNG: Diese Funktion benötigt Google Calendar Zugriff über MCP.
    Falls nicht verfügbar, gibt sie ein leeres Dict zurück.
    """
    results = {}

    # Zeitfenster: Monat ± 3 Tage
    start_date = datetime(year, month, 1) - timedelta(days=3)
    end_date = datetime(year, month, 28) + timedelta(days=3)

    print(f"\n📅 Google Calendar-Suche: {month}/{year} ({start_date.date()} bis {end_date.date()})")
    print("⚠️  Hinweis: Google Calendar-Zugriff nicht implementiert (würde MCP verwenden)")
    print("   → Verwende stattdessen CSV-Abwesenheits-Datei oder Gmail-Scanner")
    print()

    # PLACEHOLDER: Echte Implementierung würde MCP Google Calendar-Tools verwenden
    # Beispiel-Struktur (würde von echtem Kalender kommen):
    # results['Thomas'] = [
    #     {
    #         'date': (10, 15),
    #         'type': 'urlaub',
    #         'title': 'Urlaub Thomas',
    #         'source': 'calendar',
    #         'calendar_id': 'thomas@example.com',
    #     }
    # ]

    return results

def print_calendar_findings(findings: Dict[str, List[Dict]], month: int, year: int) -> None:
    """
    Gibt gefundene Urlaubs-Events in tabellarischer Form aus.
    """
    if not findings:
        print("✓ Keine Urlaubseinträge im Kalender gefunden.")
        return

    print("\n" + "="*100)
    print(f"GOOGLE CALENDAR URLAUBS-ERGEBNISSE: {month}/{year}")
    print("="*100)
    print()

    for emp in sorted(findings.keys()):
        if emp in SKIP_EMPLOYEES:
            print(f"⊘ {emp}: Kalender-Einträge ignoriert (nicht zuverlässig)")
            continue

        items = findings[emp]
        if not items:
            continue

        print(f"📅 {emp}:")
        for i, item in enumerate(items, 1):
            start, end = item['date']
            print(f"  {i}. {start:02d}.–{end:02d}.{month:02d}.{year} | URLAUB | Quelle: Kalender")
            print(f"     Titel: {item['title'][:60]}")
            print()

def suggest_csv_entries_from_calendar(findings: Dict[str, List[Dict]], month: int, year: int) -> List[str]:
    """
    Konvertiert Kalender-Findings zu CSV-Einträgen.
    """
    csv_lines = []

    for emp in sorted(findings.keys()):
        if emp in SKIP_EMPLOYEES:
            continue

        items = findings[emp]
        for item in items:
            start, end = item['date']
            csv_line = f"{emp},{start:02d}.{month:02d}.{year},{end:02d}.{month:02d}.{year},urlaub,8.00,Aus Google Kalender erkannt"
            csv_lines.append(csv_line)

    return csv_lines

# ============================================================================
# CLI
# ============================================================================

def main():
    if len(sys.argv) < 3:
        print("Nutzung: python3 vma_calendar_scanner.py <Monat> <Jahr> [--create-csv]")
        print()
        print("Beispiele:")
        print("  python3 vma_calendar_scanner.py 9 2026")
        print("  python3 vma_calendar_scanner.py 9 2026 --create-csv")
        print()
        print("Hinweis: Google Calendar-Integration benötigt MCP Google Calendar Connector")
        print("Hayatin wird ausgelassen (Kalender stimmt nicht überein)")
        sys.exit(1)

    month = int(sys.argv[1])
    year = int(sys.argv[2])
    create_csv = '--create-csv' in sys.argv

    print(f"\n{'='*80}")
    print(f"VMA Google Calendar-Scanner")
    print(f"{'='*80}")
    print(f"Suche: {month}/{year}")
    print()

    # Suche im Kalender
    findings = search_calendar_for_absences(month, year)

    # Zeige Findings
    if findings:
        print_calendar_findings(findings, month, year)

        # CSV-Vorschlag
        csv_entries = suggest_csv_entries_from_calendar(findings, month, year)
        if csv_entries and create_csv:
            csv_file = f"abwesenheiten_kalender_{month:02d}_{year}.csv"
            print(f"\n📝 Erstelle {csv_file}...")
            with open(csv_file, 'w', encoding='utf-8') as f:
                f.write("Mitarbeiter,Startdatum,Enddatum,Art,Stunden_pro_Tag,Hinweis\n")
                for line in csv_entries:
                    f.write(line + "\n")
            print(f"✓ {csv_file} erstellt ({len(csv_entries)} Einträge)")
    else:
        print("✓ Keine Urlaubseinträge gefunden.")

    print(f"\n{'='*80}")
    print("Nächste Schritte:")
    print("  1. Überprüfe obige Ergebnisse manuell")
    print("  2. Kombiniere mit Gmail-Scanner: vma_gmail_scanner.py")
    print("  3. Führe VMA-Batch aus: python3 vma_batch.py")
    print()

if __name__ == '__main__':
    main()
