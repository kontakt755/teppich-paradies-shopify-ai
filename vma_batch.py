#!/usr/bin/env python3
"""
VMA-Batch-Verarbeitung: Erstelle Dateien für mehrere Mitarbeiter auf einmal
"""

import sys
from pathlib import Path
from vma_automation import create_vma_file, EMPLOYEES

def batch_create_vma(
    month: int,
    year: int,
    employee_keys: list,
    template_path: Path,
    output_dir: Path,
    absences_file: Path = None,
):
    """Erstellt VMA-Dateien für mehrere Mitarbeiter"""

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*80}")
    print(f"VMA-BATCH-VERARBEITUNG")
    print(f"{'='*80}")
    print(f"Monat/Jahr: {month}/{year}")
    print(f"Mitarbeiter: {', '.join(employee_keys)}")
    print(f"Output-Verzeichnis: {output_dir}")
    if absences_file:
        print(f"Abwesenheits-Datei: {absences_file.name}")
    print()

    results = []

    for emp_key in employee_keys:
        if emp_key not in EMPLOYEES:
            print(f"⚠ Skipped: Unbekannter Mitarbeiter '{emp_key}'")
            continue

        try:
            print(f"Verarbeite: {EMPLOYEES[emp_key]['fullname']}...", end=" ")
            output_file, report = create_vma_file(
                template_path, emp_key, year, month, output_dir, absences_file
            )
            print(f"✓")
            results.append((emp_key, output_file, report, None))
        except Exception as e:
            print(f"✗ Fehler: {e}")
            results.append((emp_key, None, None, str(e)))

    # Zusammenfassung
    print(f"\n{'='*80}")
    print(f"ERGEBNISSE")
    print(f"{'='*80}")

    successful = [r for r in results if r[3] is None]
    failed = [r for r in results if r[3] is not None]

    print(f"✓ Erfolgreich: {len(successful)}")
    print(f"✗ Fehler: {len(failed)}")
    print()

    if successful:
        print("ERFOLGREICHE DATEIEN:")
        print("-" * 80)
        for emp_key, output_file, report, _ in successful:
            print(f"\n{EMPLOYEES[emp_key]['fullname']} ({emp_key})")
            print(f"  Datei: {output_file.name}")
            print(f"  Stunden: {report['actual_hours']} / {report['max_hours']}")
            print(f"  VMA-Tage: {report['vma_days']}")
            print(f"  Status: {report['status']}")

    if failed:
        print("\nFEHLERHAFTE EINTRÄGE:")
        print("-" * 80)
        for emp_key, _, _, error in failed:
            print(f"✗ {emp_key}: {error}")

    print("\n" + "="*80)
    return results

def main():
    if len(sys.argv) < 3:
        print("Nutzung: python3 vma_batch.py <Monat> <Jahr> [Mitarbeiter ...] [--template <path>] [--output <dir>] [--absences <path>]")
        print()
        print("Beispiele:")
        print("  python3 vma_batch.py 6 2026 Thomas Ben Rufat Hayatin")
        print("  python3 vma_batch.py 6 2026 Thomas --absences abwesenheiten_beispiel.csv")
        print()
        print(f"Verfügbare Mitarbeiter: {', '.join(EMPLOYEES.keys())}")
        sys.exit(1)

    month = int(sys.argv[1])
    year = int(sys.argv[2])

    employee_keys = []
    template_path = Path("/root/.claude/uploads/dd47e704-857a-5cf7-a908-774f0efd089b/91a63829-Zeiterfassung_Juni_2026_Thomas_fertig.xlsx")
    output_dir = Path.cwd()
    absences_file = None

    i = 3
    while i < len(sys.argv):
        if sys.argv[i] == '--template':
            template_path = Path(sys.argv[i+1])
            i += 2
        elif sys.argv[i] == '--output':
            output_dir = Path(sys.argv[i+1])
            i += 2
        elif sys.argv[i] == '--absences':
            absences_file = Path(sys.argv[i+1])
            i += 2
        else:
            # Mitarbeitername
            employee_keys.append(sys.argv[i])
            i += 1

    if not employee_keys:
        employee_keys = list(EMPLOYEES.keys())  # Alle, wenn keine angegeben

    batch_create_vma(
        month, year, employee_keys, template_path, output_dir, absences_file
    )

if __name__ == '__main__':
    main()
