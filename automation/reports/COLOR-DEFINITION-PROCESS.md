# Farbdefinition-Prozess — 33 Farben definieren

**Status:** 🔄 BEREIT FÜR FARB-AUDIT  
**Datum:** 2026-08-31  
**Aufgabe:** Die 33 Farben ohne explizite Namen definieren  
**Methode:** Shopify Admin + Lieferanten-Katalog + Jordanshop

---

## 📋 Überblick

Das `analyze_all_colors.py` Skript hat 41 Farbnummern analysiert und folgende Ergebnisse geliefert:

| Status | Anzahl | Quelle |
|---|---|---|
| ✅ Mit Namen | 8 | Shopify Variant Titles (Amara, Kontura) |
| ❌ Ohne Namen | 33 | Nur Nummern, müssen manuell definiert werden |

### ✅ Bereits definiert (8 Farben)

```
304 = Blau Mittel       (Kontura)
307 = Blau Dunkel       (Kontura)
403 = Grün Mittel       (Kontura)
405 = Grün Dunkel       (Kontura)
406 = Grün Dunkel       (Kontura)
79  = Blau Mittel       (Amara)
95  = Grau Hell         (Amara)
98  = Grau Dunkel       (Amara)
```

### ❌ Zu definieren (33 Farben)

```
016, 021, 024 (Fortiva, Quadra)
03, 04, 05, 09, 12, 15, 18, 20, 24, 27, 30, 40, 50, 69, 72, 77, 78, 82, 83, 90, 94, 99 (verschiedene Produkte)
250, 260, 400 (Zafira)
332, 462, 832 (Velluna)
039, 050 (Quadra)
```

---

## 🔍 Definitionsprozess — 3 Quellen

### Option 1: Shopify Admin (Bilder)

**Vorteil:** Aktuelle Bilder sehen, exakte Farbdarstellung  
**Zeit:** ~15-20 Minuten für 33 Farben

**Schritte:**
1. Gehe zu: Shopify Admin → Produkte → Teppichboden
2. Öffne jedes Produkt (Alvento, Amara, Fortiva, etc.)
3. Schaue die Variant-Bilder an (z.B. "Farbe 250 / 400cm")
4. Beschreibe die Farbe: Beige, Braun, Grau, Blau, Grün, etc.
5. Notiere: `farb_nummer,farbe_name,beschreibung`

### Option 2: Lieferanten-Katalog

**Vorteil:** Offizielle Farbbezeichnungen  
**Zeit:** Abhängig von Katalog-Format

**Aktionen:**
1. Öffne den Lieferanten-Katalog (PDF, Spreadsheet, etc.)
2. Suche nach den Farbnummern (016, 021, 024, etc.)
3. Finde die offizielle Farbbezeichnung
4. Notiere in CSV

### Option 3: Jordanshop-Daten

**Vorteil:** Original-Daten von Jordanshop (wo Daten importiert wurden)  
**Zeit:** Schnell wenn Daten vorhanden

**Aktionen:**
1. Checke ob Jordanshop-Backup vorhanden ist
2. Extrahiere Farbbezeichnungen
3. Mappe zu Farbnummern

---

## 📝 CSV-Template ausfüllen

**Datei:** `automation/data/color_definitions_template.csv`

**Format:**
```csv
color_number,product,color_name_de,description,source
016,Fortiva,HIER_EINTRAGEN,Farbbeschreibung,Quelle
250,Zafira,HIER_EINTRAGEN,Farbbeschreibung,Quelle
```

**Beispiel ausgefüllt:**
```csv
color_number,product,color_name_de,description,source
016,Fortiva,Anthrazit,Dunkles Grau,Shopify Admin
250,Zafira,Warm Beige,Helles Beige,Lieferanten-Katalog
```

**Einfache Farbbezeichnungen verwenden:**
- Graue Farben: Grau, Hellgrau, Dunkelgrau, Anthrazit
- Braune Farben: Braun, Hellbraun, Dunkelbraun, Taupe
- Beige Farben: Beige, Hellbeige, Dunkelbeige, Creme
- Andere: Blau, Blaugrau, Grün, Weiß, Schwarz

---

## 🚀 Automatische Integration

Nach dem Ausfüllen der CSV:

### Schritt 1: Farben integrieren
```bash
python3 automation/scripts/integrate_color_definitions.py
```

**Was macht das Script:**
- ✅ Liest color_definitions_template.csv
- ✅ Integriert Farben in populate_color_metafields.py
- ✅ Aktualisiert COLOR_NAMES Dictionary
- ✅ Zeigt Integrations-Bericht

### Schritt 2: Überprüfen
```bash
# Schaue die aktualisierten Farben
grep -A 50 "COLOR_NAMES = {" automation/scripts/populate_color_metafields.py
```

### Schritt 3: Testen
```bash
# Generiere Test-Mutations mit neuen Farben
python3 automation/scripts/populate_color_metafields.py
```

### Schritt 4: Phase 3b ausführen
```bash
# Generiere alle 340 Mutationen
python3 automation/scripts/generate_bulk_mutations.py
```

---

## 📊 Arbeitsaufteilung

| Task | Zeit | Status |
|---|---|---|
| CSV Template ausfüllen | 15-20 min | ⏳ Pending |
| Color definitions integrieren | 2 min | ⏳ Pending |
| Mutations generieren | 5 min | ⏳ Pending |
| Phase 3b ausführen (Batches) | 60-90 min | ⏳ Pending |
| Validierung + Spot-Checks | 15 min | ⏳ Pending |
| **TOTAL** | **~2-3 Stunden** | |

---

## 🎯 Next Steps

**Jetzt:**
1. [ ] CSV-Template öffnen: `automation/data/color_definitions_template.csv`
2. [ ] Mit Shopify Admin / Katalog / Jordanshop die 33 Farben definieren
3. [ ] CSV ausfüllen und speichern

**Dann (nach dem Ausfüllen):**
1. [ ] `python3 automation/scripts/integrate_color_definitions.py`
2. [ ] Überprüfen ob alle Farben in populate_color_metafields.py geladen
3. [ ] Phase 3b starten: Bulk Metafield Population

---

## 📖 Farbdefinitions-Vorlage (zum Kopieren)

Für Shopify Admin - Farbbezeichnungen pro Produkt:

### Alvento (5 Farben)
- 50: ?
- 69: ?
- 72: ?

### Amara (3 bereits definiert: 79, 95, 98)
- (9 weitere Farben hier)

### Fortiva (3 Farben)
- 016: ?
- 021: ?
- 024: ?

### Kalvea (2 Farben)
- 94: ?
- 99: ?

### Kontura (5 bereits definiert: 304, 307, 403, 405, 406)
- (weitere Farben)

### Nuvara (3 Farben)
- 12: ?
- 15: ?
- 40: ?

### Piumera (3 Farben)
- 04: ?
- 27: ?
- 30: ?

### Practiva (3 Farben)
- 78: ?
- 82: ?
- 90: ?

### Quadra (3 Farben)
- 024: ? (auch in Fortiva)
- 039: ?
- 050: ?

### Sentira (3 Farben)
- 03: ?
- 09: ?
- 18: ?

### Serena (2 Farben)
- 77: ?
- 83: ?

### Velluna (3 Farben)
- 332: ?
- 462: ?
- 832: ?

### Velory (3 Farben)
- 20: ?
- 40: ? (auch in Nuvara)
- 50: ? (auch in Alvento)

### Vireno (3 Farben)
- 03: ? (auch in Sentira)
- 05: ?
- 24: ?

### Zafira (3 Farben)
- 250: ?
- 260: ?
- 400: ?

---

## ✅ Erfolgskriterien

Nach Abschluss des Prozesses:
- [ ] Alle 33 Farben sind definiert
- [ ] CSV ist vollständig ausgefüllt (keine "???" mehr)
- [ ] integrate_color_definitions.py läuft ohne Fehler
- [ ] Alle 41 Farben in COLOR_NAMES Dictionary
- [ ] Mutations können generiert werden
- [ ] Phase 3b kann starten

---

## 🚀 Status: FARB-AUDIT VORBEREITET ✅

Das System ist vorbereitet. Warte auf Farbdefinitionen!

**Nächste Aktion:** CSV-Template mit 33 Farbdefinitionen ausfüllen

---

**Farbdefinition-Prozess READY** → Auf Eingabe der Farben warten ✅
