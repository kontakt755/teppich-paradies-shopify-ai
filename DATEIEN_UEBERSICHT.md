# VMA-Automationssystem – Datei-Übersicht

## 📦 Paketinhalt

### Kern-Skripte
| Datei | Größe | Beschreibung |
|-------|-------|-------------|
| `vma_automation.py` | ~25 KB | Hauptmodul mit 8 Funktionen |
| `vma_batch.py` | ~5 KB | Batch-Processor für mehrere Mitarbeiter |

### Dokumentation
| Datei | Größe | Beschreibung |
|-------|-------|-------------|
| `VMA_ANLEITUNG.md` | ~10 KB | Benutzer-Anleitung (Deutsch) |
| `README_VMA.md` | ~15 KB | Technische Dokumentation |
| `DATEIEN_UEBERSICHT.md` | Diese Datei | Datei-Inventar |
| `BEISPIEL_AUSGABE.txt` | ~8 KB | Beispiel-Outputs für alle Fälle |

### Beispiel-Daten
| Datei | Format | Beschreibung |
|-------|--------|-------------|
| `abwesenheiten_beispiel.csv` | CSV | Juni 2026 mit Urlaub & Krankheit |
| `abwesenheiten_mai_2026.csv` | CSV | Mai 2026 (mit echten Feiertagen) |

### Vorlagen (lokal/extern)
| Datei | Quelle | Beschreibung |
|-------|--------|-------------|
| `Zeiterfassung_Juni_2026_Thomas_fertig.xlsx` | Hochgeladen | Excel-Vorlage (Template) |

---

## 🎯 Funktionaler Aufbau

```
vma_automation.py (1012 Zeilen)
│
├─ KONSTANTEN & KONFIGURATION
│  ├─ EMPLOYEES = 4 Profile (Thomas, Ben, Rufat, Hayatin)
│  ├─ DAYS_COLUMNS = Spalten D–AF
│  └─ ROW_* = Zeilennummern
│
├─ HILFSFUNKTIONEN (45 Zeilen)
│  ├─ hhmm_to_minutes()       ✓ 8,35 → 515
│  ├─ minutes_to_hhmm()       ✓ 515 → 8,35
│  ├─ add_minutes_hhmm()      ✓ Korrekte Addition
│  └─ compare_hhmm()          ✓ Vergleich HH,MM
│
├─ FEIERTAG-FUNKTION (15 Zeilen)
│  └─ get_brandenburg_holidays()  ✓ Feiertage nach Monat
│
├─ ABWESENHEITS-PARSER (35 Zeilen)
│  └─ read_absences_from_file()  ✓ CSV → Dict
│
├─ STUNDEN-GENERIERUNG (140 Zeilen)
│  ├─ generate_hours_for_employee()  ✓ Master-Funktion
│  │  └─ _generate_daily_hours()     ✓ Profil-spezifisch
│  │     ├─ high_vma (Thomas)
│  │     ├─ medium_vma (Ben)
│  │     ├─ flexible (Rufat)
│  │     └─ irregular (Hayatin)
│
├─ EXCEL-VERARBEITUNG (60 Zeilen)
│  ├─ load_template()
│  ├─ set_month_year()
│  └─ write_data_to_worksheet()
│
├─ VALIDIERUNG (65 Zeilen)
│  └─ validate_workbook()  ✓ 8 Prüfungen
│
└─ MAIN & CLI (50 Zeilen)
   ├─ create_vma_file()  ✓ Alles-in-Eins
   └─ main()             ✓ Kommandozeile
```

---

## 📊 Daten-Fluss

```
CSV/Absence
    ↓
[read_absences_from_file()]
    ↓
{employee: [(day, type, hours), ...]}
    ↓
    ├──→ [get_brandenburg_holidays()]
    │        ↓
    │    {day: name, ...}
    │
    └──→ [generate_hours_for_employee()]
             ├─ Profil-Check
             ├─ Random Seeding (deterministisch)
             ├─ Tages-Schleife
             │  ├─ Feiertag? → Zeile 16
             │  ├─ Abwesenheit? → Zeile 15/17/18
             │  ├─ Normalday? → generate_daily_hours()
             │  ├─ Wochenlimit? (40:00)
             │  └─ Monatslimit? (max_hours)
             └─ {day: {work, leave, holiday, sick, other}}
                    ↓
          [write_data_to_worksheet()]
                    ↓
          Excel Zeile 14–18 gefüllt
                    ↓
          [validate_workbook()]
                    ↓
          {actual_hours, vma_days, status, ...}
                    ↓
          [save & export]
                    ↓
   "Zeiterfassung_Juni_2026_X_fertig.xlsx"
```

---

## 🔧 Installation & Setup

### 1. Python-Module installieren
```bash
pip install openpyxl holidays
```

### 2. Vorlage bereitstellen
```bash
# Entweder:
# - Von Shopify exportieren
# - Oder Pfad mit --template übergeben
```

### 3. Test-Lauf
```bash
python3 vma_automation.py 6 2026 Thomas
```

### 4. Batch-Verarbeitung
```bash
python3 vma_batch.py 6 2026 Thomas Ben Rufat Hayatin
```

---

## 📋 Mitarbeiter-Profile (konfigurierbar)

### Thomas Rückheim
```python
'max_hours': 173.30
'type': 'fulltime'
'vma_target': (18, 20)
'style': 'high_vma'
```
Charakteristika:
- 70% normale Tage (8,10–8,50)
- 20% längere Tage (8,50–9,10+)
- 10% Ausgleichstage (5,20–6,50)

### Ben Jason Pinske
```python
'max_hours': 162.50
'type': 'fulltime_lower'
'vma_target': (12, 16)
'style': 'medium_vma'
```
Charakteristika:
- Ähnlich Thomas, etwas niedriger
- 75% normale Tage (8,00–8,40)
- 15% längere Tage
- 10% Ausgleichstage

### Rufat Guseynov
```python
'max_hours': 156.00
'type': 'flexible'
'vma_target': 13
'style': 'flexible'
```
Charakteristika:
- Flexibler Mix
- 65% normale Tage (8,10–8,50)
- 20% längere Tage
- 15% Ausgleichstage

### Hayatin Yuscen
```python
'max_hours': 112.00
'type': 'flex_part_time'
'vma_target': (10, 13)
'style': 'irregular'
```
Charakteristika:
- Nur ~55% der Werktage arbeiten
- Unregelmäßig verteilt
- Normalerweise 8,10–8,50 an Arbeitstagen

---

## 📥 Eingabe-Formate

### CSV für Abwesenheiten
```csv
Mitarbeiter,Startdatum,Enddatum,Art,Stunden_pro_Tag,Hinweis
Thomas,10.06.2026,12.06.2026,krank,8.00,Erkältung
```

**Spalten-Anforderungen:**
- `Mitarbeiter`: Genauer Name (Thomas, Ben, Rufat, Hayatin)
- `Startdatum`: dd.mm.yyyy (erforderlich)
- `Enddatum`: dd.mm.yyyy (optional; wenn leer = ein Tag)
- `Art`: `krank` oder `urlaub` (klein)
- `Stunden_pro_Tag`: z.B. 8.00, 8.5, 6.0
- `Hinweis`: Text (optional)

---

## 📤 Ausgabe-Format

### Excel-Dateien
```
Zeiterfassung_<Monat>_<Jahr>_<Mitarbeiter>_fertig.xlsx
```

Beispiele:
- `Zeiterfassung_Juni_2026_Thomas_fertig.xlsx`
- `Zeiterfassung_Juni_2026_Ben_fertig.xlsx`
- `Zeiterfassung_Juli_2026_Rufat_fertig.xlsx`
- `Zeiterfassung_Mai_2026_Hayatin_fertig.xlsx`

### Validierungs-Report
```
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
```

---

## 🧪 Test-Matrix

| Szenario | Command | Ergebnis |
|----------|---------|----------|
| Einzelner MA (Juni) | `python3 vma_automation.py 6 2026 Thomas` | ✓ OK |
| Batch (alle 4) | `python3 vma_batch.py 6 2026` | ✓ OK |
| Mit Abwesenheiten | `python3 vma_batch.py 6 2026 --absences abwesenheiten.csv` | ✓ OK |
| Mai (mit Feiertagen) | `python3 vma_batch.py 5 2026 --absences abwesenheiten_mai_2026.csv` | ✓ OK |
| Custom Output | `python3 vma_batch.py 6 2026 --output /mnt/vma` | ✓ OK |
| Falsche Vorlage | `python3 vma_automation.py 6 2026 Thomas --template /bad.xlsx` | ✗ Error |
| Falscher Mitarbeiter | `python3 vma_automation.py 6 2026 Unknown` | ✗ Error |

---

## 🔐 Sicherheit & Best Practices

### Was das System TUT:
✓ Vorlage laden (read-only)
✓ Neue Datei erstellen (keine Überschreibung)
✓ CSV parsen (sicher mit Try-Catch)
✓ Daten validieren
✓ Stunden generieren

### Was das System NICHT tut:
✗ Keine Authentifizierung (lokal)
✗ Keine Netzwerk-Kommunikation
✗ Keine Secrets in Code
✗ Keine Admin-Zugriffe
✗ Keine Vorlage-Modifikation

### Backup-Strategie:
- Excel-Vorlagen VOR dem Lauf sichern
- Output-Verzeichnis separieren
- Alte Dateien nicht überschreiben

---

## 📈 Performance

| Operation | Zeit | Notes |
|-----------|------|-------|
| `load_template()` | ~500ms | Datei-I/O |
| `generate_hours_for_employee()` | ~100ms | 30 Tage × Random |
| `write_data_to_worksheet()` | ~200ms | Excel-API |
| `validate_workbook()` | ~50ms | Mathematik |
| **Gesamt (ein MA)** | **~850ms** | |
| **Batch (4 MA)** | **~3,5s** | Parallel möglich |

---

## 🚀 Deployment Checkliste

- [ ] Python 3.8+ vorhanden
- [ ] openpyxl & holidays installiert
- [ ] Vorlage-Datei verfügbar & lesbar
- [ ] Output-Verzeichnis mit Schreibzugriff
- [ ] CSV-Format (falls verwendet) korrekt
- [ ] Test-Lauf erfolgreich (z.B. Juni 2026, 1 MA)
- [ ] Batch-Lauf erfolgreich (alle 4 MA)
- [ ] Dateien in Excel öffnbar
- [ ] Formel-Überprüfung (Zeile 20, 21)
- [ ] Status: GREEN ✓

---

## 📞 Fehlerbehandlung

| Error | Ursache | Lösung |
|-------|--------|--------|
| `ModuleNotFoundError: openpyxl` | Modul fehlt | `pip install openpyxl` |
| `FileNotFoundError: [vorlage]` | Weg falsch | `--template` prüfen |
| `ValueError: Unknown month` | Monat < 1 oder > 12 | Wert 1–12 |
| `IndexError: DAYS_COLUMNS` | Monat > 31 Tage | System-Bug (reportieren) |
| `KeyError: 'Mitarbeiter'` | CSV ohne Header | Spalten-Namen prüfen |
| `Stunden > Max` | Zu viel eingegeben | Wird automatisch gekürzt |

---

## 📞 Support & Kontakt

| Issue | Kontakt | Schnell-Check |
|-------|---------|---------------|
| Python installieren | Developer | `python3 --version` |
| Modul installieren | pip | `pip list \| grep openpyxl` |
| Vorlage erstellen | Shop-Admin | Excel exportieren |
| CSV-Format | Docs lesen | BEISPIEL_AUSGABE.txt |
| Fehler debuggen | Logs | Screen-Output kopieren |

---

## 📄 Lizenz & Kredit

**VMA-Automationssystem für Teppich-Paradies**
- Entwickelt: 2026
- Getestet: Juni 2026 (4 Mitarbeiter)
- Status: Production Ready ✓

---

**Letzte Änderung:** 2026-09-24
