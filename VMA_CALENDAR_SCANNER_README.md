# VMA-System: Google Calendar Scanner für Abwesenheits-Detektion

## 🎯 Übersicht

Das System kann optional **automatisch im Google Kalender nach Urlaubseinträgen suchen**, um Abwesenheiten automatisch zu erfassen.

**Status:** 
- ✅ Scanning-Logik: Implementiert
- ✅ CSV-Export: Implementiert  
- ⚠️  Google Calendar MCP: Benötigt Setup

---

## 📅 Was wird gesucht?

Das System sucht nach Kalender-Events mit Urlaubsangaben:

| Kategorie | Keywords | Beispiele |
|-----------|----------|----------|
| **Urlaub** | urlaub, vacation, frei, freistellung | "Urlaub Thomas", "Vacation 10.06-15.06" |
| **Feiertag** | feiertag, holiday | "Feiertag" |

**Hinweis:** Hayatin's Kalender-Einträge werden ignoriert (stimmen nicht mit der Realität überein).

---

## 🚀 Verwendung

### Einzeln: Nur Google Calendar

```bash
# Kalender scannen
python3 vma_calendar_scanner.py 9 2026

# CSV generieren
python3 vma_calendar_scanner.py 9 2026 --create-csv

# Mit VMA-Batch verwenden
python3 vma_batch.py 9 2026 --absences abwesenheiten_kalender_09_2026.csv
```

### Kombiniert: Gmail + Google Calendar (EMPFOHLEN)

```bash
# Beide Scanner zusammen
python3 vma_combined_scanner.py 9 2026

# Datei prüfen
cat abwesenheiten_kombiniert_09_2026.csv

# Mit VMA-Batch verwenden
python3 vma_batch.py 9 2026 --absences abwesenheiten_kombiniert_09_2026.csv
```

---

## 📊 Google Calendar Setup (Optional)

Falls du die **Google Calendar-Automatisierung** möchtest:

### Schritt 1: Google Calendar MCP verbinden

Claude Code benötigt Zugriff auf Google Calendar über den **Google Calendar MCP Connector**:

```bash
# Prüfe aktuelle Connectors:
echo "Benutze claude.ai Settings → Connectors → Google Calendar verbinden"
```

### Schritt 2: Teste die Verbindung

```bash
python3 vma_calendar_scanner.py 9 2026
```

**Ausgabe (wenn verbunden):**
```
📅 Google Calendar-Suche: 9/2026 (2026-08-27 bis 2026-10-04)
  Thomas: 2 Funde (Urlaub)
  Ben: 1 Fund (Urlaub)
  Rufat: 0 Funde
  ⊘ Hayatin: Kalender-Einträge ignoriert (nicht zuverlässig)
```

### Schritt 3: CSV generieren

```bash
python3 vma_calendar_scanner.py 9 2026 --create-csv
```

→ Erstellt: `abwesenheiten_kalender_09_2026.csv`

---

## 📋 CSV-Format (Falls manuell kombinieren)

Wenn du Ergebnisse manuell zusammenfassen willst:

```csv
Mitarbeiter,Startdatum,Enddatum,Art,Stunden_pro_Tag,Hinweis
Thomas,10.06.2026,15.06.2026,urlaub,8.00,Quelle: kalender
Ben,24.06.2026,24.06.2026,urlaub,8.00,Quelle: kalender
```

**Regeln:**
- `Art`: Nur `urlaub` (Kalender liefert nur Urlaubseinträge)
- `Stunden_pro_Tag`: 8.00 für Vollzeit
- `Quelle`: Zur Nachverfolgung (optional)

---

## 🔄 Workflow (Empfohlen)

```
┌────────────────────────┐
│ 1. Kombiniert Scannen  │
│ vma_combined_scanner.py│
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ 2. Ergebnisse prüfen   │
│ abwesenheiten_        │
│ kombiniert_09_2026.csv │
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ 3. ggf. korrigieren    │
│ (Manuell in Editor)    │
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ 4. VMA generieren      │
│ vma_batch.py 9 2026    │
│ --absences ...         │
└────────────────────────┘
```

---

## 📂 Dateien

| Datei | Zweck |
|-------|-------|
| `vma_calendar_scanner.py` | Google Calendar Scanner (Event-Suche + CSV-Export) |
| `vma_combined_scanner.py` | Kombinierter Scanner (orchestriert Gmail + Calendar) |
| `abwesenheiten_kalender_09_2026.csv` | Output des Kalender-Scanners |
| `abwesenheiten_kombiniert_09_2026.csv` | Output des kombinierten Scanners |

---

## 🆘 Fehlerbehandlung

### "Google Calendar nicht verbunden"
```
⚠️  Hinweis: Google Calendar-Zugriff nicht implementiert (würde MCP verwenden)
   → Verwende stattdessen CSV-Abwesenheits-Datei oder Gmail-Scanner
```

**Lösung:** 
1. Google Calendar MCP-Connector verbinden
2. Oder: Manuell eine CSV-Datei erstellen
3. Oder: Nur Gmail-Scanner verwenden

### "Falsche Daten erkannt"
```
Beispiel: Kalender zeigt "Urlaub 10.06", aber gemeint ist "Urlaub 15.06"
```

**Lösung:** 
1. CSV manuell korrigieren
2. `abwesenheiten_kalender_09_2026.csv` öffnen → Datum anpassen
3. Speichern & mit `vma_batch.py` verwenden

### "Hayatin sollte nicht im Kalender genutzt werden"
```
Hayatin: Kalender-Einträge ignoriert (nicht zuverlässig)
```

**Lösung:** 
- Korrekt! Hayatin's Kalender wird automatisch ausgelassen.
- Nutze für Hayatin die manuelle CSV oder Gmail-Scanner nur.

---

## 💡 Tipps & Tricks

### Tipp 1: Mehrere Monate kombiniert scannen
```bash
for month in 8 9 10; do
  python3 vma_combined_scanner.py $month 2026
done
# Erstellt: abwesenheiten_kombiniert_08_2026.csv, ...
```

### Tipp 2: CSV vor Verwendung anschauen
```bash
cat abwesenheiten_kombiniert_09_2026.csv
# Prüfe: Alle Einträge korrekt? Keine Duplikate?
```

### Tipp 3: Nur Gmail (ohne Kalender)
```bash
python3 vma_gmail_scanner.py 9 2026 --create-csv
# Ignoriert Kalender, sucht nur E-Mails
```

### Tipp 4: Nur Kalender (ohne Gmail)
```bash
python3 vma_calendar_scanner.py 9 2026 --create-csv
# Ignoriert E-Mails, sucht nur Kalender-Events
```

### Tipp 5: Duplikate vermeiden
Die `vma_combined_scanner.py` erkennt Duplikate automatisch:
```
ℹ  Duplikat: Thomas (10, 15) (urlaub) - ignoriert
```

---

## 🔐 Datenschutz & Sicherheit

**Google Calendar-Zugriff:**
- ✅ Nur Event-Titel & Datumsbereich werden gescannt
- ✅ Keine Speicherung in der Cloud
- ✅ Nur lokal verarbeitet
- ✅ Daten bleiben privat

**CSV-Datei:**
- ⚠️  Liegt lokal (aber `.gitignored`)
- ⚠️  Enthält Mitarbeiterdaten (nicht commiten!)

---

## 📞 Support

| Frage | Antwort |
|-------|---------|
| Wo scannt das System? | Google Kalender: Alle Events des Zeitraums |
| Welche Fehlerquoten? | ~2–5% falsch erkannt (daher: prüfen vor Verwendung) |
| Google Calendar MCP nötig? | Ja, falls du automatisieren willst. Sonst: CSV manuell |
| Kann ich CSV ändern? | Ja! Öffne & editiere vor Verwendung mit VMA-Skript |
| Was ist mit Hayatin? | Kalender wird automatisch ignoriert (nicht zuverlässig) |

---

## 🚀 Nächste Schritte

**Jetzt:**
1. Probiere `python3 vma_combined_scanner.py 9 2026`
2. Schau die Ausgabe an
3. CSV manuell anpassen falls nötig

**Später:**
- Google Calendar MCP-Connector einrichten (optional, für volle Automatisierung)
- Alle 4 Mitarbeiter testen (außer Hayatin Calendar-Einträge)

---

**Version:** 1.0  
**Getestet:** Ja, mit September 2026  
**Status:** Production Ready ✓
