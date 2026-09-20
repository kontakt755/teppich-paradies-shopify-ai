# PR-021 – Einfasspreis, Kante und Mindestpreis

20.09.2026, S03. **Lokal abgeschlossen, keine Live-Abnahme.** 47 Fälle, 29 abgefangene Requests, 13 blockierte JS-Zustände, fünf Liquid-Gates. Kein Shop-/Produkt-/Cart-Write, kein Mailversand. Script: `audit/scripts/reproduce-einfass-pricing.mjs`; vollständige Daten: `einfass-pricing-2026-09-20.json`.

## Korrekte Referenzfälle

| Maße / Fall | Materialeinheiten | Kanteinheiten | Gesamtpreis |
| --- | ---: | ---: | ---: |
| Rechteck 200 × 300 cm | 600 | 1000 | 724,00 € |
| Mindestpreis, 50 × 50 cm | 69 | 200 | 99,41 € |
| 201 × 301 cm | 606 | 1004 | 730,10 € |
| 250 × 333 cm | 833 | 1166 | 962,91 € |
| 365 × 302 cm | 1103 | 1334 | 1.235,13 € |
| 350 × 420 oder 420 × 350 cm | 1470 | 1540 | 1.600,90 € |
| Synthetisch rund, Ø 200 cm | 400 | 628 | 475,32 € |
| Synthetisch oval, 200 × 300 cm | 600 | 793 | 684,67 € |

Referenzpreis 89 Cent/0,01 m² Material + 19 Cent/0,01 lfm Kante, Mindestpreis 99 €: historischer Piumera-Text vom 14.09., kein frischer Admin-Datensatz. Piumera war dort nur für Rechteck freigegeben. Alle IDs synthetisch. Andere Formen und Einfassarten sind Kontrollen der Codefähigkeit, keine Aussage zur aktuellen Shopauswahl.

- Ganzzahlige Material-Aufrundung, Mindestpreis als Zahl/Geldobjekt, knapp über/unter Schwellen, Rotation und Maxima ergeben konsistente Anzeigen/Properties/Requests.
- 99,41 € beim Mindestpreis ist korrekt: ganze Einheiten können 99,00 € übersteigen. Hauptzeile nennt erhöhte 0,69 m² und gewünschte 0,25 m².
- 365 × 302 ergibt hier bewusst 1103 Einheiten; die 1102 des kaufmännischen Raummaßpfads sind ein anderes Regelwerk.
- Leere/0/negative/zu kleine/zu große Maße, simuliertes badInput, nicht verfügbare Hauptvariante, fremde URL-Variante, fehlende Bandwahl und Anfrageform erzeugen keinen Request. Echte Browser-Normalisierung/Paste nicht getestet.
- Ohne Pflichtmetafelder/Variantenfreigabe/positiven Hauptpreis liefert der lokale Liquid-Datenvertrag keinen Konfigurator. Zwei direkte Submit-Aufrufe mit Neuberechnung während inFlight erzeugen nur einen Request.
- Gruppenzuordnung und Zuschnitt-Property werden korrekt erzeugt; der nachfolgende Zuschnittabgleich ist simuliert. 29 lokale Mailrenderings ohne Mengenwarnung, tatsächliches Deployment unbekannt.

## TP-005 – bedingter Service-Ausfall

Beim ausdrücklich konfigurierten, aber nicht verfügbaren Kettelservice erzeugt der Original-Liquid-Code `kettel: null`. Der Original-JS-Pfad zeigt 534,00 € für 200 × 300 cm und sendet nur 600 Materialeinheiten. „Gekettelt“, „Garn: Ton in Ton“ und 10,00 m Umfang bleiben zugesagt; 1.000 Serviceeinheiten / 190,00 € fehlen. CTA aktiv, keine Fehlermeldung. Lokale Mengenprüfung warnt nicht, weil die Materialmenge korrekt ist.

**Lokal bestätigt, P3; Live-Betroffenheit H-006 offen.** Fehlendes optionales Serviceprodukt ist ein eigener möglicher Preisvertrag, kein automatisch gleichartiger Fehler. Es wird keine aktuelle Kundenunterberechnung behauptet. Implementation Brief in ISSUES.md; keine Reparatur.

## H-007 – Oval-Näherung

Bei synthetischen 50 × 600 cm liefert die dokumentierte Ramanujan-Näherung 1212,777445 cm, gerundet 1213 Kanteinheiten. Numerische geometrische Integration ergibt 1214,077048 cm, gerundet 1214. Abweichung im Fixture 1 Einheit = 0,19 €. Fachliche Toleranz und aktive Ovalprodukte fehlen; deshalb kein zusätzliches bestätigtes Issue. Normales Oval 200 × 300 cm ergibt bei beiden Methoden 793 Einheiten.

## Herkunft / Fortsetzung

Sechs Themequellen stimmen per SHA-256 mit dem historischen Live-Snapshot überein. Aktuelles MAIN-Theme, Service-Bestand/-Policy, Formfreigaben und echte Cart-/Browserintegration nicht bestätigt. Lokale S01-/S02-Tests nicht wiederholt. Nächster Auditpunkt: **PR-022 Haftunterlage**. CODEX_PROGRESS bleibt WORKING; Gesamt-Audit nicht abgeschlossen.
