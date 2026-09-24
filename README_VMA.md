# VMA-Automationssystem für Teppich-Paradies

## 🎯 Ziel

Automatische Erstellung von Excel-Zeitnachweisen (VMA) pro Mitarbeiter nach realistischen, individuellen Mustern – ohne Vorlage zu überschreiben, ohne Formeln zu brechen.

## 📁 Dateien

| Datei | Zweck |
|-------|-------|
| `vma_automation.py` | Hauptskript mit allen Funktionen |
| `vma_batch.py` | Batch-Processor für mehrere Mitarbeiter |
| `abwesenheiten_beispiel.csv` | Beispiel-Format für Urlaub/Krankheit |
| `VMA_ANLEITUNG.md` | Detaillierte Nutzer-Anleitung |
| `README_VMA.md` | Diese Datei (technische Übersicht) |

## 🚀 Quickstart

### Installation
```bash
pip install openpyxl holidays
```

### Alle vier Mitarbeiter für Juni 2026
```bash
python3 vma_batch.py 6 2026
```

### Mit Abwesenheiten
```bash
python3 vma_batch.py 6 2026 --absences abwesenheiten.csv
```

### Custom-Output
```bash
python3 vma_batch.py 6 2026 --output ./vma_dateien
```

## 📊 Architektur

```
vma_automation.py
├── Hilfsfunktionen
│   ├── hhmm_to_minutes()      # HH,MM → Minuten (8,35 → 515)
│   ├── minutes_to_hhmm()      # Minuten → HH,MM (515 → 8,35)
│   └── add_minutes_hhmm()     # Korrekte Addition
│
├── Daten-Import
│   ├── get_brandenburg_holidays()  # Feiertage automatisch
│   └── read_absences_from_file()   # CSV parsen
│
├── Generierung
│   ├── generate_hours_for_employee()  # Realistische Stunden
│   └── _generate_daily_hours()        # Profil-spezifisch
│
├── Excel-Verarbeitung
│   ├── load_template()        # Vorlage laden (nicht überschreiben!)
│   ├── set_month_year()       # D3/E3 setzen
│   └── write_data_to_worksheet()  # Nur Eingabefelder füllen
│
└── Validation & Export
    ├── validate_workbook()    # Prüfung gegen Regeln
    └── create_vma_file()      # Alles kombiniert
```

## 🔢 Stunden-Format: HH,MM (nicht Dezimalstunden!)

Das System arbeitet INTERN mit Minuten, gibt aber in **HH,MM-Format** aus:

| HH,MM | Minuten | Stunden:Minuten |
|-------|---------|-----------------|
| 8,00 | 480 | 8:00 |
| 8,30 | 510 | 8:30 |
| 8,35 | 515 | 8:35 |
| 8,50 | 530 | 8:50 |
| 9,10 | 550 | 9:10 |

**Beispiel-Addition:**
```
8,50 + 0,20 = 9,10  ✓ (nicht 8,70)
8,35 + 8,35 = 17,10 ✓ (nicht 16,70)
```

## 👥 Mitarbeiter-Profile

Jeder Mitarbeiter hat ein Profil, das die Stundenverteilung steuert:

### Thomas Rückheim
```python
{
    'max_hours': 173.30,
    'type': 'fulltime',
    'vma_target': (18, 20),
    'style': 'high_vma'
}
```
- **Stil:** 70% normale Tage (8,10–8,50), 20% längere (8,50+), 10% Ausgleichstage (5,20–6,50)
- **Ziel:** 18–20 VMA-Tage
- **Beispiel-Monat:** 20 Arbeitstage, davon 18 VMA

### Ben Jason Pinske
```python
{
    'max_hours': 162.50,
    'type': 'fulltime_lower',
    'vma_target': (12, 16),
    'style': 'medium_vma'
}
```
- **Stil:** Ähnlich Thomas, aber etwas niedriger
- **Ziel:** 12–16 VMA-Tage

### Rufat Guseynov
```python
{
    'max_hours': 156.00,
    'type': 'flexible',
    'vma_target': 13,
    'style': 'flexible'
}
```
- **Stil:** Flexibler Mix, nicht täglich gleich
- **Ziel:** ca. 13 VMA-Tage

### Hayatin Yuscen
```python
{
    'max_hours': 112.00,
    'type': 'flex_part_time',
    'vma_target': (10, 13),
    'style': 'irregular'
}
```
- **Stil:** Unregelmäßig, nicht jeden Tag, nur ~55% der Werktage
- **Ziel:** 10–13 Tage

## 🧪 Validierungsregeln

Jede generierte Datei wird auf folgende Kriterien geprüft:

### 1. Maximalstunden
```
Eingabe: Stunden pro Mitarbeiter, Summe ≤ max_hours
✓ Thomas 2026-06: 173,20 ≤ 173,30
```

### 2. Wochenlimit
```
Mo–So: ≤ 40:00 (2400 Minuten)
✓ Woche 1: 39:50
✓ Woche 2: 40:00
```

### 3. Keine VMA an Ausfall-Tagen
```
✓ Feiertag: Zeile 16 (keine Arbeitszeit)
✓ Urlaub: Zeile 15 (keine Arbeitszeit, keine VMA)
✓ Krankheit: Zeile 17 (keine Arbeitszeit, keine VMA)
```

### 4. Realistische Variation
```
✓ Nicht jeden Tag 8,00
✓ Nicht jeden Tag 8,30
✓ Keine Muster wie "Mo immer 8,20, Di immer 8,35"
✗ Blockiert: Zu regelmäßige Wiederholungen
```

### 5. Feiertag-Korrektheit
```
Brandenburg 2026-06: 0 Feiertage
(Juni hat keine Feiertage in Deutschland)
```

## 📥 Abwesenheits-CSV

Format:
```csv
Mitarbeiter,Startdatum,Enddatum,Art,Stunden_pro_Tag,Hinweis
Thomas,10.06.2026,12.06.2026,krank,8.00,Erkältung
Ben,24.06.2026,24.06.2026,urlaub,8.00,Urlaubstag
```

**Logik:**
1. Wenn Abwesenheit vorhanden → keine Arbeitszeit in Zeile 14
2. Wenn Feiertag + Abwesenheit → Feiertag gewinnt
3. Abwesenheitstyp bestimmt Zeile (Urlaub → 15, Krankheit → 17)

## 📤 Excel-Struktur (unverändert)

Das System **verändert nur die Eingabefelder:**

| Zeile | Feld | Status | Aktion |
|-------|------|--------|--------|
| 3 | D (Jahr), E (Monat) | Setzen | ✓ Werden gesetzt |
| 12 | Tagnummern | Formel | – Unverändert |
| 13 | Wochentage | Formel | – Unverändert |
| 14 | Arbeitszeit | Input | ✓ Befüllt |
| 15 | Bezahlter Urlaub | Input | ✓ Befüllt |
| 16 | Feiertage | Input | ✓ Befüllt |
| 17 | Krankheit | Input | ✓ Befüllt |
| 18 | Sonstige Fehlzeiten | Input | ✓ Befüllt |
| 20 | VMA-Tag | Formel | – Unverändert |
| 21 | VMA € | Formel | – Unverändert |

**Formeln in Zeile 20 (VMA-Detektor):**
```
=IF(D12="","",IF(D14="-","-",
   IF(D14="","",
      IF(AND(ISNUMBER(D14),
             INT(D14)*100+ROUND(MOD(D14,1)*100,0)>800),
         1,"-"))))
```

Übersetzung: Wenn Arbeitszeit > 8,00 → dann 1 (VMA-Tag) → dann 14€ in Zeile 21

## 🔍 Beispiel-Ablauf

```python
# 1. Vorlage laden
wb, ws = load_template(Path("Zeiterfassung_Juni_2026_Thomas_fertig.xlsx"))

# 2. Feiertage abholen
holidays = get_brandenburg_holidays(2026, 6)  # {}

# 3. Abwesenheiten lesen
absences = read_absences_from_file(Path("abwesenheiten.csv"), 2026, 6)
# {'Thomas': [(10, 'krank', 8.0), (11, 'krank', 8.0), (12, 'krank', 8.0)]}

# 4. Stunden generieren
data = generate_hours_for_employee('Thomas', 2026, 6, holidays, absences)
# {1: {'work': 8.2, 'leave': 0.0, ...},
#  2: {'work': 8.35, 'leave': 0.0, ...},
#  ...
#  10: {'work': 0.0, 'sick': 8.0, ...},  # Krankheitstag
#  ...}

# 5. In Excel schreiben
write_data_to_worksheet(ws, 2026, 6, data, holidays)

# 6. Validieren
report = validate_workbook(ws, 2026, 6, 'Thomas', data)
# {'actual_hours': 173.2, 'vma_days': 18, 'status': 'OK', ...}

# 7. Speichern
wb.save('Zeiterfassung_Juni_2026_Thomas_fertig.xlsx')
```

## 🎲 Determinismus & Variabilität

Das System nutzt **seeded random**, um:
- Unterschiedliche Stunden pro Durchlauf zu generieren
- Aber **reproduzierbar** für gleiche Input-Parameter

```python
random.seed(hash(f"{employee_key}_{year}_{month}_{day}") % (2**32))
```

→ Jeder Tag bekommt eine konsistente "Basis-Stundenzahl" pro Mitarbeiter/Monat

## 📈 Fehler-Handling

| Fehler | Grund | Lösung |
|--------|-------|--------|
| `FileNotFoundError` | Vorlage nicht gefunden | `--template` Pfad prüfen |
| `ModuleNotFoundError` | openpyxl/holidays fehlt | `pip install openpyxl holidays` |
| `ValueError` (Datum) | Ungültiges Datumsformat in CSV | Format: `dd.mm.yyyy` |
| `Gesamtstunden > Max` | Zu viele Eingaben | Wird korrigiert (Kürzung) |
| `Wochenstunden > 40:00` | Zu viele pro Woche | Wird korrigiert (Kürzung) |

## 🔧 Erweiterbarkeit

### Neuen Mitarbeiter hinzufügen
```python
EMPLOYEES['Maria'] = {
    'fullname': 'Maria Mustermann',
    'max_hours': 150.00,
    'type': 'fulltime',
    'vma_target': (15, 18),
    'style': 'high_vma',
}
```

### Neuen Stil definieren
```python
def _generate_daily_hours(...):
    if style == 'custom_pattern':
        # Eigene Logik
        return minutes_to_hhmm(mins)
```

### Andere Bundesländer
```python
# In get_brandenburg_holidays():
de_holidays = holidays.Germany(state='BW', years=year)  # Baden-Württemberg
```

## 🧵 Threading & Parallelisierung

Das System ist **nicht thread-safe** (Dateisystem, Random-Seed). 
Für parallele Verarbeitung:
```bash
# Separate Prozesse
python3 vma_automation.py 6 2026 Thomas &
python3 vma_automation.py 6 2026 Ben &
python3 vma_automation.py 6 2026 Rufat &
python3 vma_automation.py 6 2026 Hayatin &
```

## 📋 Checkliste vor dem Deploy

- [ ] `pip install openpyxl holidays`
- [ ] Vorlage existiert und ist lesbar
- [ ] Abwesenheits-CSV hat richtige Spalten
- [ ] Mindestens ein Test: `python3 vma_batch.py 6 2026 Thomas`
- [ ] Output-Verzeichnis hat Schreibzugriff
- [ ] Keine Fehler im Validierungsbericht
- [ ] Datei-Namen sind korrekt
- [ ] Stunden liegen unter Maximal

## 📞 Support-Matrix

| Problem | Kontakt | Schnell-Check |
|---------|---------|---------------|
| Python-Modul fehlt | pip install | `python3 -c "import openpyxl"` |
| Excel-Vorlage alt | Neu exportieren | Prüfe D3/E3 & Zeile 14 |
| Zu viele/wenig Stunden | Profil anpassen | `EMPLOYEES[key]['max_hours']` |
| Falsche Feiertage | Bundesland | `state='BB'` in Kode |
| Abwesenheiten wirken nicht | CSV-Format | Spalten-Namen exakt prüfen |

---

**Version:** 1.0  
**Python:** 3.8+  
**Getestet:** Juni 2026 (4 Mitarbeiter)  
**Status:** Production Ready ✓
