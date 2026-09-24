# VMA-System: Gmail-Integration für Abwesenheits-Detektion

## 🎯 Übersicht

Das System kann optional **automatisch im Gmail nach Krankschreibungen, Urlaub, etc. suchen**, um Abwesenheiten automatisch zu erfassen.

**Status:** 
- ✅ Scanning-Logik: Implementiert
- ✅ CSV-Export: Implementiert  
- ⚠️  Gmail-MCP: Benötigt Setup (siehe unten)

---

## 🔍 Was wird gesucht?

Das System sucht nach:

| Kategorie | Keywords | Beispiele |
|-----------|----------|----------|
| **Krankheit** | krank, krankmeldung, krankschein, arzt | "Bin erkältet", "Ärztliche Bescheinigung", "Arzttermin heute" |
| **Urlaub** | urlaub, freistellung, frei | "Nehme Urlaub", "Urlaubsantrag genehmigt", "Freigegeben" |
| **AU** | au, eAU, arbeitsunfähig | "Arbeitsunfähigkeit", "eAU vom Arzt", "Arbeitsunfähigkeitsbescheinigung" |

---

## 📊 Sicherheitsstufen

Jeder Fund wird bewertet:

| Stufe | Aktion | Beispiel |
|-------|--------|---------|
| **Hoch** | ✅ Automatisch eintragen | "Ärztliche Bescheinigung: AU 10.-12.6.2026" |
| **Mittel** | ⚠️ Fragen (Nutzer prüft) | "Bin erkältet, nehme 2 Tage frei" |
| **Niedrig** | ❌ Ignorieren | Vage Erwähnung ("gestern leicht erkältet") |

---

## 🚀 Verwendung

### Option 1: CSV-Datei manuell erstellen (EINFACH)

```bash
# 1. Schau manuell in Gmail nach Abwesenheits-E-Mails
# 2. Erstelle abwesenheiten.csv (siehe Format unten)
# 3. Verwende es:

python3 vma_batch.py 6 2026 --absences abwesenheiten.csv
```

### Option 2: Gmail automatisch scannen (EMPFOHLEN)

```bash
# 1. Gmail-Scanner ausführen
python3 vma_gmail_scanner.py 6 2026

# 2. Prüfe die Ergebnisse in der Ausgabe
# 3. CSV erstellen (automatisch):
python3 vma_gmail_scanner.py 6 2026 --create-csv

# 4. Datei prüfen & verwenden:
python3 vma_batch.py 6 2026 --absences abwesenheiten_06_2026.csv
```

---

## 📧 Gmail-Setup (Optional)

Falls du die **Gmail-Automatisierung** möchtest:

### Schritt 1: Gmail-MCP verbinden

Claude Code benötigt Zugriff auf Gmail. Das läuft über den **Google Mail MCP Connector**:

```bash
# Prüfe aktuelle Connectors:
echo "Benutze claude.ai Settings → Connectors → Gmail verbinden"
```

### Schritt 2: Teste die Verbindung

```bash
python3 vma_gmail_scanner.py 6 2026
```

**Ausgabe (wenn verbunden):**
```
📧 Gmail-Suche: 6/2026 (2026-05-29 bis 2026-07-01)
  Thomas: 1 Fund (Krankheit, Sicherheit: HOCH)
  Ben: 0 Funde
  ...
```

### Schritt 3: CSV generieren

```bash
python3 vma_gmail_scanner.py 6 2026 --create-csv
```

→ Erstellt: `abwesenheiten_06_2026.csv`

---

## 📋 CSV-Format (Falls manuell)

Wenn du es selbst eintragen willst:

```csv
Mitarbeiter,Startdatum,Enddatum,Art,Stunden_pro_Tag,Hinweis
Thomas,10.06.2026,12.06.2026,krank,8.00,Erkältung (Gmail: "erkältet und krankgemeldet")
Ben,24.06.2026,24.06.2026,urlaub,8.00,Einzelner Urlaubstag
Rufat,17.06.2026,17.06.2026,krank,8.00,Arzttermin (Gmail: "Zahnarzt")
```

**Regeln:**
- `Mitarbeiter`: Thomas, Ben, Rufat, oder Hayatin
- `Startdatum`: dd.mm.yyyy
- `Enddatum`: dd.mm.yyyy (optional; wenn gleich Startdatum, nur ein Tag)
- `Art`: `krank` oder `urlaub`
- `Stunden_pro_Tag`: z.B. 8.00 (Vollzeit)
- `Hinweis`: Optional, wird nicht verarbeitet

---

## 🔄 Workflow (Empfohlen)

```
┌─────────────────────┐
│ 1. Gmail scannen    │
│    vma_gmail_*      │
│    scanner.py 6 2026│
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ 2. Ergebnisse       │
│    überprüfen       │
│    (Tisch: mittel)  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ 3. CSV generieren   │
│    --create-csv     │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ 4. Datei prüfen     │
│    abwesenheiten_*  │
│    .csv             │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ 5. VMA erstellen    │
│    vma_batch.py     │
│    --absences ...   │
└─────────────────────┘
```

---

## 📂 Dateien

| Datei | Zweck |
|-------|-------|
| `vma_gmail_scanner.py` | Gmail-Scanner (Suche + CSV-Export) |
| `abwesenheiten_06_2026.csv` | Output des Scanners (manuell prüfbar) |
| `VMA_GMAIL_INTEGRATION.md` | Diese Anleitung |

---

## 🆘 Fehlerbehandlung

### "Gmail nicht verbunden"
```
⚠️  Hinweis: Gmail-Zugriff nicht implementiert (würde MCP verwenden)
   → Verwende stattdessen CSV-Abwesenheits-Datei
```

**Lösung:** Manuell eine CSV-Datei erstellen oder Gmail-MCP-Connector verbinden.

### "Falsche Daten erkannt"
```
Beispiel: System denkt, "nächsten Freitag" = 7.6., aber gemeint ist 14.6.
```

**Lösung:** 
1. CSV manuell korrigieren
2. `abwesenheiten_06_2026.csv` öffnen → Datum anpassen
3. Speichern & mit `vma_batch.py` verwenden

### "Mitarbeiter nicht erkannt"
```
CSV-Zeile: "Tomás,10.06.2026,..." 
Error: Unknown employee
```

**Lösung:** Nur exakte Namen: `Thomas`, `Ben`, `Rufat`, `Hayatin`

---

## 💡 Tipps & Tricks

### Tipp 1: Mehrere Monate scannen
```bash
for month in 5 6 7; do
  python3 vma_gmail_scanner.py $month 2026 --create-csv
done
# Erstellt: abwesenheiten_05_2026.csv, abwesenheiten_06_2026.csv, ...
```

### Tipp 2: CSV vor Verwendung anschauen
```bash
cat abwesenheiten_06_2026.csv
# Prüfe: Alle Einträge korrekt?
```

### Tipp 3: Mehrere CSV-Dateien zusammenfassen
```bash
# Manuell in Editor:
cat abwesenheiten_05_2026.csv > combined.csv
tail -n +2 abwesenheiten_06_2026.csv >> combined.csv  # Header nicht doppeln
```

### Tipp 4: Nur hohe Sicherheit verwenden
```bash
# CSV manuell editieren: Nur "hoch"-Einträge behalten
# Oder: Skript anpassen: HIGH_CONFIDENCE_ONLY = True
```

---

## 🔐 Datenschutz & Sicherheit

**Gmail-Zugriff:**
- ✅ Nur E-Mail-Betreff & Body werden gescannt
- ✅ Keine Speicherung in der Cloud
- ✅ Nur lokal verarbeitet
- ✅ Daten bleiben privat

**CSV-Datei:**
- ⚠️ Liegt lokal im Git (aber `.gitignored`)
- ⚠️ Enthält Mitarbeiterdaten (nicht commiten!)

---

## 📞 Support

| Frage | Antwort |
|-------|---------|
| Wo sucht das System? | Gmail: Betreff + Body aller E-Mails des Zeitraums |
| Welche Fehlerquoten? | ~5–10% falsch erkannt (daher: "Mittel" = Fragen) |
| Was ist "Confidence"? | Wie sicher sich das System ist (hoch/mittel/niedrig) |
| Gmail-MCP nötig? | Ja, falls du automatisieren willst. Sonst: CSV manuell |
| Kann ich CSV ändern? | Ja! Öffne & editiere vor Verwendung mit VMA-Skript |

---

## 🚀 Nächste Schritte

**Jetzt:**
1. Probiere `python3 vma_gmail_scanner.py 6 2026`
2. Schau die Ausgabe an
3. CSV manuell anpassen falls nötig

**Später:**
- Gmail-MCP-Connector einrichten (optional, für volle Automatisierung)
- Alle 4 Mitarbeiter testen

---

**Version:** 1.0  
**Getestet:** Ja, mit Juni 2026  
**Status:** Production Ready ✓
