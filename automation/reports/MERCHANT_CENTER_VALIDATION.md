# Google Merchant Center Feed Validierungsbericht

**Generiert**: 3.9.2026, 14:46:55

## Zusammenfassung

| Metrik | Wert |
|--------|------|
| Produkte insgesamt | 3 |
| Vollständige Produkte | 2 |
| Vollständigkeit | 66.7% |
| Kritische Fehler | 6 |
| Warnungen | 1 |

## Status

❌ **FAIL** – Fehler müssen behoben werden

## Kritische Fehler (6)


### 1. defekt-001 – missing_fields
- **Nachricht**: Erforderliche Felder fehlen: gtin, mpn

- **Fehlende Felder**: gtin, mpn


### 2. defekt-001 – field_length
- **Nachricht**: Titel-Länge außerhalb Bereich (20-150 Zeichen): 4
- **Feld**: title



### 3. defekt-001 – field_length
- **Nachricht**: Beschreibung-Länge außerhalb Bereich: 7
- **Feld**: description



### 4. defekt-001 – price_format
- **Nachricht**: Ungültiges Preisformat: 99,99€




### 5. defekt-001 – invalid_url
- **Nachricht**: Ungültige Bild-URL: not-a-valid-url
- **Feld**: image_link



### 6. defekt-001 – invalid_url
- **Nachricht**: Ungültiger Produkt-Link: ftp://invalid.example.com
- **Feld**: link



## Warnungen (1)


### 1. defekt-001 – availability
- **Nachricht**: Ungültiger Verfügbarkeitsstatus: unknown



## Empfehlungen

1. **Erforderliche Maßnahmen**:
      - Alle kritischen Fehler müssen vor dem Upload gelöst werden

2. **Optimierungen**:
   - Hochwertige Produktbilder sicherstellen (min. 250x250px)
   - Aussagekräftige Beschreibungen verfassen
   - Alle optionalen Felder ausfüllen (Farbe, Größe, Material, etc.)

3. **Nächste Schritte**:
   - Feed-Format prüfen (XML, CSV oder TSV)
   - Test-Upload in Merchant Center durchführen
   - Indexierungsstatus überwachen

## Validierungsergebnisse

**Feed-Validierung**: FEHLGESCHLAGEN ✗

Für den Upload zu Google Merchant Center: NICHT BEREIT – Fehler beheben erforderlich

---

*Validiert mit Google Merchant Center Feed Validator v1.0*
