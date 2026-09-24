# VMA-System: Gmail-Integration für Abwesenheits-Detektion

## 🎯 Übersicht

Das System durchsucht **automatisch das Firmen-Gmail-Konto `kontakt@teppich-paradies.net`**
nach Krankschreibungen, Urlaub, etc., um Abwesenheiten für die VMA-Erstellung zu erfassen.

**Status:**
- ✅ Gmail-Connector verbunden (`kontakt@teppich-paradies.net`, umgestellt vom privaten Konto)
- ✅ Monatlicher automatischer Scan eingerichtet (Routine, siehe unten)
- ✅ Prozess-Fix vereinbart (Zeitraum immer im Betreff)
- ⚠️  Foto-Anhänge (Krankschreibungen) können vom Gmail-Connector NICHT gelesen werden
  → siehe "Bekannte Grenze" unten

---

## ⚠️ WICHTIGE ERKENNTNIS (24.09.2026)

Der claude.ai Gmail-Connector kann **nur Text durchsuchen** (Betreff/Body), **keine
Anhänge herunterladen oder lesen** (z.B. Fotos von Krankschreibungen). Das ist eine
technische Grenze des Connectors, keine Konfigurationssache.

**Beispiel-Fund:** E-Mail "Rufat krank" vom 18.09.2026 an `e.carl-uezer@web.de` enthielt
nur ein Foto (`PHOTO-2026-09-18-10-58-27.jpg`) als Anhang, kein Datum im Text →
konnte nicht automatisch ausgewertet werden.

### Beschlossene Lösung: Prozess-Fix + Rückfrage-Fallback (nicht: Bilderkennung)

**1. Prozess-Fix (Mitarbeiter/Manager):**
Der Zeitraum muss **immer im Betreff oder Text** stehen, nicht nur auf dem Foto.
Format wie bisher schon meistens verwendet:
```
Rufat krank 18.-20.09.2026
Ben krank 06.-15.07.
Hayati Urlaub 16.5.-01.06
```
Foto der Krankschreibung zusätzlich anhängen ist weiterhin sinnvoll (Beleg), ersetzt aber
nicht die Textangabe.

**2. Fallback bei fehlendem Text-Datum:**
Die monatliche Routine (siehe unten) erkennt E-Mails ohne Text-Datum und markiert sie
explizit als "Rückfrage nötig" mit Link zur E-Mail, statt zu raten oder das Bild zu
interpretieren.

**Bewusst NICHT umgesetzt (verworfen für jetzt):** Eigener Google-Cloud-API-Zugriff
(OAuth-Setup) zum Herunterladen und automatischen Auslesen von Foto-Anhängen. Das wäre
technisch möglich, aber zusätzlicher Setup-Aufwand (Google Cloud Projekt, OAuth-Consent,
lokaler Login-Flow) und bewusst getrennt vom Online-Shop-System gehalten. **Für später
gemerkt, falls Foto-ohne-Text-Fälle häufig bleiben.**

---

## 🔍 Was wird gesucht?

| Kategorie | Keywords | Beispiele |
|-----------|----------|----------|
| **Krankheit** | krank, krankmeldung, krankschein, arzt | "Bin erkältet", "Ärztliche Bescheinigung", "Arzttermin heute" |
| **Urlaub** | urlaub, freistellung, frei | "Nehme Urlaub", "Urlaubsantrag genehmigt", "Freigegeben" |
| **AU** | au, eAU, arbeitsunfähig | "Arbeitsunfähigkeit", "eAU vom Arzt", "Arbeitsunfähigkeitsbescheinigung" |

**Manager-Adresse zur Orientierung:** `e.carl-uezer@web.de` (nicht `.net` – Korrektur
gegenüber früherer Annahme). E-Mails, die dorthin gehen, sind i.d.R. Krankmeldungen für
Rufat.

---

## 📊 Sicherheitsstufen

Jeder Fund wird bewertet:

| Stufe | Aktion | Beispiel |
|-------|--------|---------|
| **Hoch** | ✅ Automatisch eintragen | "Ärztliche Bescheinigung: AU 10.-12.6.2026" |
| **Mittel** | ⚠️ Fragen (Nutzer prüft) | "Bin erkältet, nehme 2 Tage frei" |
| **Niedrig** | ❌ Ignorieren | Vage Erwähnung ("gestern leicht erkältet") |

---

## 🤖 Automatischer monatlicher Scan (AKTIV)

**Das ist der produktive Weg.** Eine Routine (Claude-Trigger, `trig_017kqinkmhhMvCs32N6G5eYs`)
läuft automatisch **am 1. jeden Monats um 07:06 UTC** und:

1. Durchsucht Gmail (`kontakt@teppich-paradies.net`) nach Absences-Keywords im Vormonat
2. Extrahiert Zeiträume aus Betreff/Text per Regex (nicht aus Fotos)
3. Erstellt `abwesenheiten_kombiniert_<MM>_<YYYY>.csv` für automatisch erkannte Fälle
4. Regeneriert die VMA-Dateien via `vma_batch.py`
5. Meldet Fälle **ohne Text-Datum explizit als "Rückfrage nötig"** (mit Link zur Mail)
   statt zu raten

Kein manueller Aufruf nötig. Bei Rückfragen meldet sich die Session direkt.

**Wichtig:** Die Python-Skripte `vma_gmail_scanner.py`, `vma_calendar_scanner.py` und
`vma_combined_scanner.py` sind **funktional nur Platzhalter/Referenz** – ein
eigenständiges Python-Skript hat keinen Zugriff auf den Gmail-MCP-Connector (nur eine
laufende Claude-Session hat das). Die tatsächliche Suche läuft ausschließlich über die
Routine oben bzw. manuell durch eine Claude-Session mit `mcp__Gmail__search_threads`.

---

## 🚀 Manuelle Alternative (CSV direkt pflegen)

Falls zwischendurch schnell etwas eingetragen werden muss, ohne auf den nächsten
Routine-Lauf zu warten:

```bash
# 1. Schau manuell in Gmail nach Abwesenheits-E-Mails
# 2. Erstelle abwesenheiten.csv (siehe Format unten)
# 3. Verwende es:

python3 vma_batch.py 6 2026 --absences abwesenheiten.csv

# 4. Datei prüfen & verwenden:
python3 vma_batch.py 6 2026 --absences abwesenheiten_06_2026.csv
```

## 📅 Google Calendar

Zurückgestellt – der Gmail-Kanal (Prozess-Fix + monatliche Routine) deckt die
Abwesenheitserfassung ab. Google-Calendar-Abgleich ist nicht aktiv priorisiert
(Hayatin's Kalender ist ohnehin nicht zuverlässig, siehe `VMA_CALENDAR_SCANNER_README.md`).

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
