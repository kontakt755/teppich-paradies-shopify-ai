# PR-020 – Raummaß-Preisprüfung

Status: lokal abgeschlossen am 20.09.2026, S02. Keine Reparatur, keine Netzwerkrequests, keine Produkte geändert. Originalfunktionen und Datenherkunft: `room-pricing-2026-09-20.json` und `../scripts/reproduce-room-pricing.mjs`.

| Maße in cm | Volle m², Fixture 89 €/m² | Hundertstel, Fixture 89 Cent/Einheit | Bewertung |
| --- | --- | --- | --- |
| 250 × 201 | 6 Einheiten, 534,00 € | 503 Einheiten, 447,67 € | Beide Regeln korrekt |
| 333 × 200 | 7 Einheiten, 623,00 € | 666 Einheiten, 592,74 € | Beide Regeln korrekt |
| 365 × 302 | 12 Einheiten, 1.068,00 € | 1102 Einheiten, 980,78 € | Kaufmännische Rundung beabsichtigt; nicht auf 1103 ändern |
| 250 × 333 | 9 Einheiten, 801,00 € | **832 statt 833**, 740,48 statt 741,37 € | TP-004 nur im bedingten Hundertstelmodus |
| 350 × 129 | 5 Einheiten, 445,00 € | **451 statt 452**, 401,39 statt 402,28 € | TP-004 auch im Meterware-Tipp sichtbar |
| 50 × 203 | 2 Einheiten, 178,00 € | **101 statt 102**, 89,89 statt 90,78 € | Weiterer Halbwertfall |

Die auffälligen Werte stimmen zwischen Preisbox und abgesendeter Menge überein. Der Fehler liegt vor beiden Ausgaben: Die Menge selbst verletzt die dokumentierte Rundungsregel. Die aktuelle lokale Bestellmail berechnet die regelkonforme Menge aus den cm-Maßen und warnt bei diesen regulären Rechner-Payloads.

Das Raster von 2.185.846 Maßpaaren deckt für das 400-/500-cm-Rollen-Fixture sämtliche erlaubten ganzen cm ab. Volle m²: keine Rundungsabweichung. Hundertstel: 3.310 exakte Halbgrenzen werden um eins zu niedrig gerundet. Separat 19.604 Maßpaare mit vollen Rollenbreiten in beiden Modi ohne Abweichung. Die sechs absichtlich ungültigen/fehlenden Eingaben der Integrationsprüfung senden nichts.

**Offen:** H-005, welche aktuellen Rollenware-Produkte den Hundertstel-Modus tatsächlich verwenden, und ob die untersuchte Mail-Vorlage eingesetzt ist. Historische Piumera-Rollenwarebelege zeigen volle m²; das Einfassprodukt ist ein anderer Pfad. Keine Behauptung eines fehlerhaft abgerechneten Live-Auftrags.

**Nächster Schritt:** PR-021, Einfass-Konfigurator mit Form/Kante/Mindestpreis und echten bzw. ausdrücklich synthetischen Produktfixtures. Keine Wiederholung des abgeschlossenen lokalen PR-020-Rasters ohne Quellenänderung.
