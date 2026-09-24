#!/usr/bin/env python3
"""Analyse der Excel-VMA-Vorlage"""

from openpyxl import load_workbook
import sys

template_path = "/root/.claude/uploads/dd47e704-857a-5cf7-a908-774f0efd089b/91a63829-Zeiterfassung_Juni_2026_Thomas_fertig.xlsx"

try:
    wb = load_workbook(template_path)
    ws = wb.active

    print("=" * 80)
    print(f"EXCEL-VORLAGE ANALYSE: {ws.title}")
    print("=" * 80)

    # Wichtige Zellen
    print("\n### GRUNDSTRUKTUR ###")
    print(f"D3 (Jahr): {ws['D3'].value}")
    print(f"E3 (Monat): {ws['E3'].value}")
    print(f"C4 (Hinweis): {ws['C4'].value}")

    # Zeilenlabels
    print("\n### ZEILENLABELS ###")
    for row in range(10, 25):
        col_c = ws[f'C{row}'].value
        if col_c:
            print(f"Zeile {row}: {col_c}")

    # Spalten (Kalendertage)
    print("\n### SPALTEN (Tage) ###")
    print(f"Spalte B-AF für die Tage 1-31")
    print(f"B3: {ws['B3'].value}")
    print(f"C3: {ws['C3'].value}")
    for col in ['D', 'E', 'F']:
        print(f"{col}3: {ws[col + '3'].value}")

    # Beispiel-Daten
    print("\n### BEISPIEL-DATEN (erste Woche) ###")
    for row in [14, 15, 16, 17, 18]:
        label = ws[f'C{row}'].value
        values = []
        for col in ['D', 'E', 'F', 'G', 'H']:
            val = ws[col + str(row)].value
            values.append(f"{col}:{val}")
        print(f"Zeile {row} ({label}): {' | '.join(values)}")

    # Summen und Formeln
    print("\n### SUMMEN-BEREICH ###")
    for row in range(22, 30):
        col_c = ws[f'C{row}'].value
        col_d = ws[f'D{row}'].value
        if col_c or col_d:
            print(f"Zeile {row}: C={col_c} | D={col_d}")

    # Alle Zellen mit Formeln in D14-AF18
    print("\n### FORMELN IN DATENBEREICH ###")
    for row in [14, 15, 16, 17, 18, 20, 21]:
        for col in ['D', 'E', 'F']:
            cell = ws[col + str(row)]
            if cell.data_type == 'f':
                print(f"{col}{row}: {cell.value}")

    print("\n### ZELLFORMAT BEISPIELE ###")
    for row in [14]:
        for col in ['D', 'E']:
            cell = ws[col + str(row)]
            print(f"{col}{row}: format={cell.number_format}, value={cell.value}")

    wb.close()

except Exception as e:
    print(f"Fehler: {e}")
    import traceback
    traceback.print_exc()
