# 🚀 VMA-Automation – Quickstart (5 Minuten)

## Installation (Einmalig)

```bash
pip install openpyxl holidays
```

## Verwendung

### Schritt 1: Vorlage bereitstellen
Stelle sicher, dass die Excel-Datei `Zeiterfassung_Juni_2026_Thomas_fertig.xlsx` vorhanden ist.

Pfad kann überschrieben werden mit:
```bash
--template /pfad/zur/vorlage.xlsx
```

### Schritt 2: Alle 4 Mitarbeiter für Juni 2026 erstellen

```bash
python3 vma_batch.py 6 2026
```

Fertig! 4 neue Excel-Dateien im aktuellen Verzeichnis:
- `Zeiterfassung_Juni_2026_Thomas_fertig.xlsx`
- `Zeiterfassung_Juni_2026_Ben_fertig.xlsx`
- `Zeiterfassung_Juni_2026_Rufat_fertig.xlsx`
- `Zeiterfassung_Juni_2026_Hayatin_fertig.xlsx`

### Schritt 3: Mit Abwesenheiten (3 Optionen)

**Option A: Manuell (einfach)**
Erstelle `abwesenheiten.csv`:
```csv
Mitarbeiter,Startdatum,Enddatum,Art,Stunden_pro_Tag,Hinweis
Thomas,10.06.2026,12.06.2026,krank,8.00,Erkältung
Ben,24.06.2026,24.06.2026,urlaub,8.00,Urlaubstag
```

Dann:
```bash
python3 vma_batch.py 6 2026 --absences abwesenheiten.csv
```

**Option B: Gmail Scanner**
```bash
python3 vma_gmail_scanner.py 6 2026 --create-csv
python3 vma_batch.py 6 2026 --absences abwesenheiten_06_2026.csv
```

**Option C: Gmail + Google Calendar (EMPFOHLEN)**
```bash
python3 vma_combined_scanner.py 6 2026
python3 vma_batch.py 6 2026 --absences abwesenheiten_kombiniert_06_2026.csv
```

### Schritt 4: Eigener Ausgabe-Ordner

```bash
python3 vma_batch.py 6 2026 --output ./vma_dateien
```

## Einzelne Mitarbeiter

```bash
# Nur Thomas
python3 vma_automation.py 6 2026 Thomas

# Nur Ben (mit Abwesenheiten)
python3 vma_automation.py 6 2026 Ben --absences abwesenheiten.csv
```

## Verfügbare Mitarbeiter

- `Thomas` (Thomas Rückheim)
- `Ben` (Ben Jason Pinske)
- `Rufat` (Rufat Guseynov)
- `Hayatin` (Hayatin Yuscen)

## Output-Format

Jede Datei hat diesen Namen:
```
Zeiterfassung_<Monat>_<Jahr>_<Mitarbeiter>_fertig.xlsx
```

Beispiele:
- `Zeiterfassung_Juni_2026_Thomas_fertig.xlsx`
- `Zeiterfassung_Juli_2026_Ben_fertig.xlsx`

## Validierung

Nach jedem Lauf siehst du einen Bericht:

```
✓ Datei erstellt: Zeiterfassung_Juni_2026_Thomas_fertig.xlsx

VALIDIERUNGSBERICHT:
────────────────────────────────────────────────────────────
Mitarbeiter: Thomas Rückheim
Monat/Jahr: 6/2026
Max. Stunden: 173.30
Eingetragene Stunden: 173.20
Differenz: 0.10 unter Max
VMA-Tage: 18
Feiertage: 0
Urlaubstage: 0
Kranktage: 0
Wochenlimit OK: Ja
Status: OK
────────────────────────────────────────────────────────────
```

## Tipps

| Szenario | Befehl |
|----------|--------|
| **Schnell: Alle 4, Juni** | `python3 vma_batch.py 6 2026` |
| **Mit Abwesenheiten** | `python3 vma_batch.py 6 2026 --absences file.csv` |
| **Nur bestimmte MA** | `python3 vma_batch.py 6 2026 Thomas Ben` |
| **Zu Dateiablage** | `python3 vma_batch.py 6 2026 --output ~/Dateien/VMA` |
| **Einzeln testen** | `python3 vma_automation.py 6 2026 Thomas` |

## Fehler

| Fehler | Lösung |
|--------|--------|
| `ModuleNotFoundError: openpyxl` | `pip install openpyxl holidays` |
| `FileNotFoundError` | Vorlage-Pfad mit `--template` prüfen |
| `Unbekannter Mitarbeiter` | Nur: Thomas, Ben, Rufat, Hayatin |
| CSV wird nicht erkannt | Format: `Mitarbeiter,Startdatum,Enddatum,Art,Stunden_pro_Tag,Hinweis` |

## Wo sind die Dateien?

```bash
ls -la *.xlsx  # Aktuelles Verzeichnis
# oder
ls -la vma_dateien/*.xlsx  # Mit --output
```

## Nächste Schritte

- Dateien in Excel öffnen & prüfen
- Bei Bedarf Formeln-Tab "Tabelle1" nicht verändern!
- Nur Zeilen 14–18 sind Eingabefelder
- Zeilen 20–21 sind automatisch berechnet

---

**Das System ist produktionsreif. Viel Erfolg! ✓**

Für Details: `VMA_ANLEITUNG.md` oder `README_VMA.md`
