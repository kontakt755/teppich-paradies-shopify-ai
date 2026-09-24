# VMA-Automationssystem – Anleitung

## Überblick

Dieses System automatisiert die Erstellung von Zeiterfassungs-/VMA-Dateien (Verauslagter Mehrarbeitsvergütung) für Teppich-Paradies. Es:

- Lädt die Excel-Vorlage
- Setzt Monat und Jahr automatisch
- Generiert realistische Stundeneintragungen pro Mitarbeiter
- Berücksichtigt Feiertage (Brandenburg), Urlaub und Krankheit
- Validiert gegen Maximalstunden und Wochenlimits
- Exportiert fertige Excel-Dateien

## Installation

### Anforderungen
- Python 3.8+
- `openpyxl` (Excel-Handling)
- `holidays` (Feiertag-Berechnung)

### Setup
```bash
pip install openpyxl holidays
```

## Verwendung

### Option 1: Einzelnen Mitarbeiter erstellen

```bash
python3 vma_automation.py <Monat> <Jahr> <Mitarbeiter> \
  [--template <Pfad>] \
  [--output <Verzeichnis>] \
  [--absences <CSV-Datei>]
```

**Beispiele:**
```bash
# Thomas für Juni 2026 (Standard-Vorlage)
python3 vma_automation.py 6 2026 Thomas

# Mit Custom-Output-Verzeichnis
python3 vma_automation.py 6 2026 Ben --output /mnt/vma_dateien

# Mit Abwesenheits-Datei
python3 vma_automation.py 5 2026 Rufat --absences abwesenheiten.csv
```

**Verfügbare Mitarbeiter:** Thomas, Ben, Rufat, Hayatin

### Option 2: Mehrere Mitarbeiter auf einmal

```bash
python3 vma_batch.py <Monat> <Jahr> [Mitarbeiter ...] \
  [--template <Pfad>] \
  [--output <Verzeichnis>] \
  [--absences <CSV-Datei>]
```

**Beispiele:**
```bash
# Alle vier Mitarbeiter für Juni 2026
python3 vma_batch.py 6 2026 Thomas Ben Rufat Hayatin

# Nur zwei Mitarbeiter
python3 vma_batch.py 6 2026 Thomas Ben

# Automatisch alle Mitarbeiter (wenn keine angegeben)
python3 vma_batch.py 6 2026
```

## Vorlage

Die Excel-Vorlage (`Zeiterfassung_Juni_2026_Thomas_fertig.xlsx`) enthält:
- **D3:** Jahr (2026)
- **E3:** Monat (6)
- **Zeile 12:** Tagnummern (automatisch aus Monat/Jahr berechnet)
- **Zeile 13:** Wochentage (automatisch)
- **Zeile 14:** Arbeitszeit (in HH,MM-Format: z.B. 8,35 = 8h 35min)
- **Zeile 15:** Bezahlter Urlaub
- **Zeile 16:** Feiertage (Brandenburg-Feiertage automatisch)
- **Zeile 17:** Krankheit
- **Zeile 18:** Sonstige Fehlzeiten
- **Zeile 20:** VMA-Tag (automatische Formel: 1 wenn > 8,00)
- **Zeile 21:** VMA € (14,00 € pro VMA-Tag)

**WICHTIG:** Die Vorlage wird NICHT überschrieben. Jeder Durchlauf erstellt eine neue Datei.

## Abwesenheiten-Datei

Optionale CSV-Datei für Urlaub, Krankheit, etc.

**Format:**
```csv
Mitarbeiter,Startdatum,Enddatum,Art,Stunden_pro_Tag,Hinweis
Thomas,10.06.2026,12.06.2026,krank,8.00,Erkältung
Ben,24.06.2026,24.06.2026,urlaub,8.00,Urlaubstag
```

**Spalten:**
- `Mitarbeiter`: Thomas, Ben, Rufat oder Hayatin
- `Startdatum`: dd.mm.yyyy
- `Enddatum`: dd.mm.yyyy (optional; wenn leer = nur ein Tag)
- `Art`: `krank` oder `urlaub`
- `Stunden_pro_Tag`: z.B. 8.00 für Vollzeit
- `Hinweis`: optional

**Beispiel-Datei:** `abwesenheiten_beispiel.csv`

## Mitarbeiter-Profile

### Thomas Rückheim
- **Maximalstunden:** 173,30
- **Typ:** Vollzeit mit vielen VMA-Tagen
- **VMA-Ziel:** 18–20 Tage
- **Stil:** 
  - 70% normale Tage (8,10–8,50)
  - 20% längere Tage (8,50+)
  - 10% Ausgleichstage (5,20–6,50)

### Ben Jason Pinske
- **Maximalstunden:** 162,50
- **Typ:** Fast Vollzeit
- **VMA-Ziel:** 12–16 Tage
- **Stil:** Ähnlich wie Thomas, aber etwas niedriger

### Rufat Guseynov
- **Maximalstunden:** 156,00
- **Typ:** Flexibler Mitarbeiter
- **VMA-Ziel:** ca. 13 Tage
- **Stil:** Gemischte Verteilung, nicht jeden Tag gleich

### Hayatin Yuscen
- **Maximalstunden:** 112,00
- **Typ:** Flexible Einsatztage (nicht jeden Tag)
- **VMA-Ziel:** 10–13 Tage
- **Stil:** Unregelmäßig, nicht jeden Werktag

## Stundeneintragung (HH,MM-Format)

**NICHT Dezimalstunden!** Das System verwendet das deutsche Zeitformat:

| Eingabe | Bedeutung |
|---------|-----------|
| 8,00 | 8 Stunden 0 Minuten |
| 8,30 | 8 Stunden 30 Minuten |
| 8,35 | 8 Stunden 35 Minuten |
| 8,50 | 8 Stunden 50 Minuten |
| 6,45 | 6 Stunden 45 Minuten |

**Beim Addieren:**
- 8,50 + 0,20 = 9,10 (nicht 8,70)
- 8,35 + 8,35 = 17,10 (nicht 16,70)

## Validierungsregeln

Beim Erstellen wird jede Datei geprüft auf:

✓ **Maximalstunden:** Keine Überschreitung  
✓ **Wochenlimit:** Max. 40:00 pro Woche (Mo–So)  
✓ **Keine VMA an Feiertagen/Urlaub/Krankheit**  
✓ **Realistische Variation:** Nicht jeden Tag gleich  
✓ **Feiertage Brandenburg:** Automatisch erkannt  

## Ausgabedatei-Namen

Das System erstellt Dateien mit diesem Muster:

```
Zeiterfassung_<Monat>_<Jahr>_<Mitarbeiter>_fertig.xlsx
```

**Beispiele:**
- `Zeiterfassung_Juni_2026_Thomas_fertig.xlsx`
- `Zeiterfassung_Juli_2026_Ben_fertig.xlsx`
- `Zeiterfassung_Mai_2026_Rufat_fertig.xlsx`

## Beispiel-Ausgabe

```
================================================================================
VMA-BATCH-VERARBEITUNG
================================================================================
Monat/Jahr: 6/2026
Mitarbeiter: Thomas, Ben, Rufat, Hayatin
Output-Verzeichnis: /tmp/vma_final

Verarbeite: Thomas Rückheim... ✓
Verarbeite: Ben Jason Pinske... ✓
Verarbeite: Rufat Guseynov... ✓
Verarbeite: Hayatin Yuscen... ✓

================================================================================
ERGEBNISSE
================================================================================
✓ Erfolgreich: 4
✗ Fehler: 0

ERFOLGREICHE DATEIEN:
--------------------------------------------------------------------------------

Thomas Rückheim (Thomas)
  Datei: Zeiterfassung_Juni_2026_Thomas_fertig.xlsx
  Stunden: 173,20 / 173,30
  VMA-Tage: 18
  Status: OK
```

## Fehlerbehandlung

**„Vorlage nicht gefunden"**
- Stelle sicher, dass die Excel-Datei am erwarteten Ort ist
- Standard-Pfad: `/root/.claude/uploads/.../Zeiterfassung_Juni_2026_Thomas_fertig.xlsx`
- Mit `--template` überschreiben

**„Unbekannter Mitarbeiter"**
- Nur: Thomas, Ben, Rufat, Hayatin
- Case-sensitiv

**„Abwesenheits-Datei nicht gefunden"**
- CSV-Pfad prüfen
- Format: `Mitarbeiter,Startdatum,Enddatum,Art,Stunden_pro_Tag,Hinweis`

## Tipps

1. **Vorlage einmal pro Monat von Shopify exportieren**
   - Theme-Editor → Zeiterfassung Section → Excel herunterladen
   - Speichern als `Zeiterfassung_<Monat>_<Jahr>.xlsx`

2. **Abwesenheiten vorbereiten**
   - Vor dem Lauf CSV erstellen
   - E-Mail-Hinweise prüfen (Krankmeldungen, Urlaubsanträge)

3. **Mehrere Versuche**
   - Das System generiert jedes Mal andere (realistische) Stunden
   - Falls Ergebnis nicht passt: erneut aufrufen

4. **Maximalstunden anpassen**
   - In `vma_automation.py` unter `EMPLOYEES` editierbar
   - Z.B. Teilzeitverkürzer, neue Mitarbeiter

## Technische Details

**Hauptfunktionen in `vma_automation.py`:**

```python
load_template(path)              # Excel laden
set_month_year(ws, year, month)  # D3/E3 setzen
get_brandenburg_holidays()       # Feiertage abrufen
read_absences_from_file()        # CSV parsen
generate_hours_for_employee()    # Stunden erzeugen
write_data_to_worksheet()        # In Zeilen schreiben
validate_workbook()              # Prüfungen
create_vma_file()                # Alles kombiniert
```

**Dateistruktur:**
```
vma_automation.py       # Hauptskript (8 Funktionen)
vma_batch.py            # Batch-Wrapper für mehrere Mitarbeiter
abwesenheiten_beispiel.csv
VMA_ANLEITUNG.md        # Diese Datei
```

## Support & Änderungen

- **Neue Mitarbeiter hinzufügen:** `EMPLOYEES` Dict in `vma_automation.py`
- **Max-Stunden ändern:** Unter `EMPLOYEES[key]['max_hours']`
- **Monatsnamen:** In der Funktion `create_vma_file()` anpassen
- **Feiertag-Bundesland:** In `get_brandenburg_holidays()` ändern

---

**Version:** 1.0  
**Getestet mit:** Juni 2026 (4 Mitarbeiter, mit/ohne Abwesenheiten)  
**Letzte Änderung:** 2026-09-24
