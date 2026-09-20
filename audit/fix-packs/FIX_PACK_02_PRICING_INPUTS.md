# FIX_PACK_02_PRICING_INPUTS

Status: READY zur späteren Übergabe. Audit Phase 1/2: **noch nicht ausführen**. Eine spätere ausdrückliche Umsetzungsbeauftragung und separate Freigabe für geschützte externe Schritte bleiben erforderlich.

## CLAUDE CODE TASK

Lies zuerst:

- `TASK.md` einschließlich WATCHDOG EXECUTION OVERRIDE und `AGENTS.md`
- `audit/MASTER_STATUS.md`, `audit/ISSUES.md` (TP-001, TP-002)
- `audit/TEST_MATRIX.md`, `audit/DEPENDENCY_MAP.md`
- `audit/evidence/README.md`, `audit/evidence/pricing-reproduction-2026-09-20.json`
- den aktuellen vollständigen Block `blocks/paket-auswahl.liquid`

Ziel: Der Paketrechner soll nur vollständig validierte, endliche und sicher abrechenbare Zahlen verwenden. Eingabetext darf nicht still zu einer anderen Fläche werden. Bestehende Paket-, Verschnitt-, Varianten- und Preislogik bleibt erhalten.

Arbeite ausschließlich an **TP-001 und TP-002**. Beginne erst, wenn dieses Fix-Pack ausdrücklich zur Implementierung beauftragt wurde. READY allein ist keine Freigabe. Arbeite sequenziell und ohne Subagenten.

WICHTIG:

- Nichts außerhalb des Scopes ändern; keine unnötigen Refactorings, keine Funktionen entfernen.
- Vor Änderungen die betroffenen Dateien lesen und die historische Evidence mit aktuellem Code/Live-Theme abgleichen. Themenkennung ausschließlich aus `domains/shopify/live-theme.json`, MAIN frisch prüfen, soweit Zugriff vorhanden.
- Bestehende Shoplogik respektieren, Änderungen minimal halten, jeden Fix einzeln testen und Regressionen prüfen.
- Keine Preise, SKUs, Varianten, Metafelder, Checkout-Einstellungen oder App-Konfiguration verändern.
- Keine pauschale maximale Bestellfläche erfinden. Technische Endlichkeit/Ganzzahlsicherheit prüfen; eine kaufmännische Grenze benötigt eine belegte Vorgabe.
- Das Audit-Reproduktionsscript dokumentiert fehlerhaftes Istverhalten. Seine bisherigen Assertions nicht als erfolgreiche Fix-Abnahme verwenden; gezielte Tests für das Sollverhalten ergänzen.
- Neue Beobachtungen sauber dokumentieren. Bei abweichender Quelle den Scope erneut bewerten, nicht blind historische Zeilennummern ändern.

Nach Abschluss erstelle `audit/fix-results/FIX_PACK_02_PRICING_INPUTS_RESULT.md` mit geänderten Dateien/Funktionen, erledigten/nicht erledigten Issues, neuen Auffälligkeiten, Tests und Ergebnissen sowie Risiken. Keine Live-Veröffentlichung ohne konkrete Freigabe.

## ZIEL

Keine stillen Teilzahlen, `Infinity`-Preise, unsicheren Paketmengen oder ungültigen Cart-Payloads aus diesem Eingabefeld. Normale Käufer können weiterhin eine Fläche nennen oder direkt ganze Pakete kaufen.

## BETROFFENE ISSUES / PRIORITÄT

- **TP-001 (P2):** `1.234,56` wird zu einer Teilzahl; `20abc` wird wie 20 behandelt.
- **TP-002 (P3):** `Infinity` und sehr große Zahlen bleiben kaufbar dargestellt; lokal `quantity:null` oder unsichere Ganzzahl.

Zwei Issues sind hier sinnvoller als drei: derselbe Datenweg, dieselben Handler, keine zusätzliche unabhängige Baustelle.

## BETROFFENE DATEIEN

- Änderungsschwerpunkt: `blocks/paket-auswahl.liquid`, insbesondere Zeilen 547–591, 607–728, 773–799 des auditierten Standes.
- Gezielte neue/ergänzte Verhaltenstests in `qa/tests/`, sofern sie reale Validierungs- und Payload-Invarianten prüfen.
- Audit-Ergebnisdatei. Keine weiteren Theme-Dateien ohne belegte technische Notwendigkeit.

## ABHÄNGIGKEITEN / PARALLEL SAFE

**PARALLEL SAFE: NO.** Beide Issues greifen in `parseSqm`, Input/Blur und `addToCart` ein. Zusätzlich verbietet der Watchdog jegliche parallele Ausführung. Keine parallel freigegebenen Pakete.

**FILE CONFLICT:** `blocks/paket-auswahl.liquid` – TP-001/TP-002 nicht auf unabhängige Implementer verteilen. Erst Parser/Validitätszustand → Ergebnisprüfung → Submission-Gate → Tests → Review.

Die Varianten-ID und der Paketpreis werden durch `variant:update` aktualisiert. Cart-Paketzeilen rechnen aus `line_item.quantity`; `cart:update` betreibt Drawer/Bubble. Diese Verträge müssen erhalten bleiben.

## NICHT VERÄNDERN

- 5 % Verschnitt und Aufrundung auf Originalpakete.
- Interner Shopify-Paketpreis und primäre €/m²-Darstellung.
- Leerer/0/negativer Eingabewert nach Blur als bestehender Ein-Paket-Ruhezustand.
- Manuelle +/- Steuerung, stabile Cursorposition, Variantenwechsel.
- Bestehende Cart-Properties und Cart-Events.
- Rollenware-/Einfassrechner, Mengensperren, Gruppen, Muster/Vergleich, Menüs, globales CSS.

## UMSETZUNGSREIHENFOLGE

1. Quellenstand abgleichen; TP-001/002 anhand des Originalcodes bestätigen.
2. Eindeutige vollständige Zahleneingabe definieren: `1,5`/`1.5` bleiben gültig. Gemischtes Format `1.234,56` korrekt verarbeiten oder mit erklärender Meldung ablehnen; nie still auf einen Zahlenanfang kürzen.
3. Expliziten Fehlerzustand mit zugeordnetem Hinweis verwenden. Eingabe während des Tippens nicht überschreiben. `aria-invalid`/Fehlerzuordnung auf dem vorhandenen Feld berücksichtigen.
4. Endlichkeit und sichere Ganzzahl für Paketmenge sowie Cent-Gesamtsumme nach der Berechnung prüfen; dieselbe Validität vor jedem Absenden erzwingen.
5. Akzeptanz- und Regressionstests seriell ausführen; neue Browser-Cart-/Mobile-Belege liefern, soweit verfügbar. Fehlende Live-Tests klar offen lassen.
6. Kleinen nachvollziehbaren Commit und Ergebnisbericht erstellen; keine geschützte externe Aktion ohne Freigabe.

## ISSUE-BY-ISSUE IMPLEMENTATION BRIEF

### TP-001

- **Ziel/Problem:** keine still veränderte Bestellfläche; Teilzahlparsing erzeugt eine andere Menge.
- **Root Cause:** `replace(',', '.')` plus permissives `parseFloat`, danach blindes Normalisieren und Submit ohne Eingabeprüfung.
- **Dateien/Funktionen/Code:** Paketblock, `parseSqm` 773–779, Input/Blur 781–799, `setDesiredSqm`/`syncInputValue` 674–686, `addToCart` 689–728.
- **Logik ändern:** vollständige Zahl validieren, einen gemeinsamen gültigen Zustand bis zum Payload erhalten; Fehlereingabe und bewussten leeren Ruhezustand unterscheiden.
- **Nicht ändern/Abhängigkeiten:** oben genannte Verträge; TP-002 gemeinsam einbauen.
- **Seiteneffekte:** deutsche Kommas, Zwischenzustände beim Tippen und manuelle Paketsteuerung könnten unbeabsichtigt blockieren.
- **Akzeptanz/Testfälle:** gültige Komm-/Punktdezimalzahl, gemischtes Format, Buchstabenreste; Fehler verhindern Request; Korrektur hebt Fehler auf; Input→Blur→Click sowie Input→Click.
- **Regression:** 20 m²/5 % → 11 Pakete, ohne Verschnitt → 10; Start 1 und +1 → 2; Varianten-ID/Preis wechseln weiterhin.
- **Rollback/Aufwand/Reihenfolge:** kleiner isolierter Block-Commit; S–M; zuerst.

### TP-002

- **Ziel/Problem:** keine unendliche/unsichere Mengen- oder Preisberechnung anzeigen/absenden.
- **Root Cause:** `isNaN` akzeptiert Infinity, Ergebnisse werden nicht auf Endlichkeit/Ganzzahlsicherheit geprüft.
- **Dateien/Funktionen/Code:** gleicher Block, Parser 773–779, `computePackages` 588–591, `renderResults` 607–612, `addToCart` 689–728.
- **Logik ändern:** endliche Eingabe und endliche sichere positive Paket-/Cent-Ergebnisse verlangen, Zustand vor Payload nochmals prüfen; keine spontane Geschäftslimitierung.
- **Nicht ändern/Abhängigkeiten:** bestehende Berechnungsformel und Preise; gemeinsam mit TP-001.
- **Seiteneffekte:** zu strenge Prüfung lehnt gültige Eingaben ab; ungültiger Zustand bleibt nach Korrektur bestehen.
- **Akzeptanz/Testfälle:** Infinity, `1e309`, große Ziffernfolge, NaN und anschließend `20`; ungültig erzeugt keinen Netzwerkrequest; Mobile zeigt keinen daraus resultierenden Überlauf.
- **Regression:** alle gültigen Kontrollen TP-001; echte ganze Pakete und passende Cent-Summe.
- **Rollback/Aufwand/Reihenfolge:** gemeinsam rücksetzbarer Block-Commit; S; nach Parserzustand, vor Abschlussprüfung.

## AKZEPTANZTESTS

| Eingabe/Aktion | Erwartung |
| --- | --- |
| `1.234,56` | Eindeutige korrekte Interpretation oder erklärende Ablehnung, nie still 1 Paket |
| `20abc` | Sichtbarer Fehler; kein Cart-Request |
| `Infinity`, `1e309`, unsichere Ergebnisgröße | Keine bestellbare ungültige Zahl; kein `null`-/unsicherer Mengen-Payload |
| Ungültig → `20` | Fehler weg; 11 Pakete/22,88 m²/116.578 Cent für Referenzfixture |
| `1,5` und `1.5` | Gleiche Berechnung und Properties |
| Tippen/Paste, Blur, direktes Klicken | Gleicher wirksamer Validierungszustand; keine falsche Normalisierung |
| 390 px und Desktop | Hinweis lesbar; Eingabefeld/Kaufbutton erreichbar; kein zahlenbedingter Überlauf |

## REGRESSIONSTESTS

Leer/0/negativ nach Blur → ein Paket kaufbar; manuelle Paketerhöhung +1 → genau zwei Pakete; Reserve an/aus; Grenzwert 20,8 m²/2,08 m² ohne Reserve → zehn Pakete; Produkt-/Farbwechsel übernimmt korrekte ID und Preis; Cart-Menge/Gesamtpreis, Drawer und zurück/reload gezielt prüfen. Bestehende relevante QA verwenden; keine Kaufabschlüsse.

## ABSCHLUSSCHECK

- TP-001/002 jeweils durch Sollverhalten und ausbleibenden ungültigen Request belegt.
- Gültige Referenzwerte und Paket-/Variantensemantik unverändert.
- Kein Produktionsdaten-/Preiseingriff; kein großer Umbau.
- Diff, Tests, Restgrenzen und Ergebnisbericht vollständig; unabhängige spätere Fix-QA bleibt ausstehend.
