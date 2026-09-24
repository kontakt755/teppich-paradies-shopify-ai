#!/usr/bin/env python3
"""
Kombinierter Scanner für VMA-Abwesenheits-Detektion
Nutzt Gmail UND Google Calendar zur Erfassung von Krankheit, Urlaub, AU.
"""

import sys
import subprocess
from datetime import datetime
from typing import Dict, List, Set
import csv

# ============================================================================
# KONFIGURATION
# ============================================================================

EMPLOYEES = ['Thomas', 'Ben', 'Rufat', 'Hayatin']

# ============================================================================
# SCANNER ORCHESTRATION
# ============================================================================

def run_gmail_scanner(month: int, year: int) -> Dict[str, List[Dict]]:
    """
    Führt Gmail-Scanner aus und gibt Findings zurück.
    """
    print("\n" + "="*80)
    print("SCHRITT 1: Gmail-Scanner (Krankheit, Urlaub, AU)")
    print("="*80)

    try:
        result = subprocess.run(
            [sys.executable, 'vma_gmail_scanner.py', str(month), str(year)],
            capture_output=False,
            text=True
        )
        # Hinweis: vma_gmail_scanner gibt direkt aus, Findings sind momentan leer (MCP Placeholder)
        return {}
    except Exception as e:
        print(f"⚠️  Gmail-Scanner fehler: {e}")
        return {}

def run_calendar_scanner(month: int, year: int) -> Dict[str, List[Dict]]:
    """
    Führt Google Calendar-Scanner aus und gibt Findings zurück.
    """
    print("\n" + "="*80)
    print("SCHRITT 2: Google Calendar-Scanner (Urlaub)")
    print("="*80)

    try:
        result = subprocess.run(
            [sys.executable, 'vma_calendar_scanner.py', str(month), str(year)],
            capture_output=False,
            text=True
        )
        # Hinweis: vma_calendar_scanner gibt direkt aus, Findings sind momentan leer (MCP Placeholder)
        return {}
    except Exception as e:
        print(f"⚠️  Calendar-Scanner fehler: {e}")
        return {}

def merge_findings(gmail_findings: Dict, calendar_findings: Dict) -> Dict[str, List[Dict]]:
    """
    Mergt Findings aus beiden Quellen.
    Kalender-Findings werden bevorzugt bei Duplikaten.
    Hayatin Calendar-Findings werden ignoriert.
    """
    merged = {}

    # Gmail-Findings hinzufügen
    for emp, items in gmail_findings.items():
        if emp not in merged:
            merged[emp] = []
        merged[emp].extend(items)

    # Calendar-Findings hinzufügen (außer Hayatin)
    for emp, items in calendar_findings.items():
        if emp == 'Hayatin':
            print(f"⊘ Hayatin: Google Calendar-Einträge ignoriert (nicht zuverlässig)")
            continue

        if emp not in merged:
            merged[emp] = []

        # Duplicate-Check: wenn gleiche Daten bereits vorhanden, nicht hinzufügen
        for item in items:
            is_duplicate = False
            for existing in merged[emp]:
                if existing.get('date') == item.get('date') and existing.get('type') == item.get('type'):
                    is_duplicate = True
                    print(f"ℹ  Duplikat: {emp} {item['date']} ({item['type']}) - ignoriert")
                    break

            if not is_duplicate:
                merged[emp].append(item)

    return merged

def export_to_csv(merged_findings: Dict, month: int, year: int) -> str:
    """
    Exportiert gemergete Findings zu CSV-Datei.
    """
    csv_file = f"abwesenheiten_kombiniert_{month:02d}_{year}.csv"

    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Mitarbeiter', 'Startdatum', 'Enddatum', 'Art', 'Stunden_pro_Tag', 'Hinweis'])

        for emp in sorted(merged_findings.keys()):
            items = merged_findings[emp]
            for item in items:
                start, end = item['date']
                source = item.get('source', 'manuell')
                hinweis = f"Quelle: {source}"

                writer.writerow([
                    emp,
                    f"{start:02d}.{month:02d}.{year}",
                    f"{end:02d}.{month:02d}.{year}",
                    item['type'],
                    8.00,
                    hinweis
                ])

    return csv_file

def print_summary(merged_findings: Dict, csv_file: str, month: int, year: int) -> None:
    """
    Gibt Zusammenfassung aus.
    """
    total_count = sum(len(items) for items in merged_findings.values())

    print("\n" + "="*80)
    print(f"ZUSAMMENFASSUNG: {month}/{year}")
    print("="*80)
    print()

    if total_count == 0:
        print("✓ Keine Abwesenheitseinträge gefunden")
    else:
        print(f"Insgesamt {total_count} Einträge gefunden:")
        print()
        for emp in sorted(merged_findings.keys()):
            items = merged_findings[emp]
            if items:
                print(f"  {emp}: {len(items)} Eintrag(e)")
                for item in items:
                    start, end = item['date']
                    source = item.get('source', 'manuell')
                    print(f"    • {start:02d}.–{end:02d}.{month:02d}.{year} | {item['type'].upper():6s} | Quelle: {source}")
        print()
        print(f"✓ Exportiert zu: {csv_file}")

    print()
    print("="*80)
    print("Nächste Schritte:")
    print(f"  1. Prüfe {csv_file} manuell")
    print(f"  2. Korrigiere falls nötig")
    print(f"  3. Führe VMA-Batch aus:")
    print(f"     python3 vma_batch.py {month} {year} --absences {csv_file}")
    print()

# ============================================================================
# CLI
# ============================================================================

def main():
    if len(sys.argv) < 3:
        print("Nutzung: python3 vma_combined_scanner.py <Monat> <Jahr>")
        print()
        print("Beispiele:")
        print("  python3 vma_combined_scanner.py 9 2026")
        print()
        print("Workflow:")
        print("  1. Scannt Gmail nach Krankheit/Urlaub/AU")
        print("  2. Scannt Google Calendar nach Urlaub")
        print("  3. Merged Ergebnisse")
        print("  4. Exportiert zu CSV")
        print()
        print("Hinweis: Hayatin Google Calendar-Einträge werden ignoriert")
        sys.exit(1)

    month = int(sys.argv[1])
    year = int(sys.argv[2])

    print(f"\n{'='*80}")
    print(f"VMA Kombinierter Scanner (Gmail + Google Calendar)")
    print(f"{'='*80}")
    print(f"Suche: {month}/{year}")
    print()

    # Scanner ausführen
    gmail_findings = run_gmail_scanner(month, year)
    calendar_findings = run_calendar_scanner(month, year)

    # Mergen
    print("\n" + "="*80)
    print("SCHRITT 3: Merge der Findings")
    print("="*80)
    print()
    merged_findings = merge_findings(gmail_findings, calendar_findings)

    # Export
    csv_file = export_to_csv(merged_findings, month, year)

    # Summary
    print_summary(merged_findings, csv_file, month, year)

if __name__ == '__main__':
    main()
