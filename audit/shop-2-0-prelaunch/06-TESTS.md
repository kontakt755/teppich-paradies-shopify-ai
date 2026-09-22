# Tests

| Datum | Modul | Test | Umgebung | Ergebnis |
|---|---|---|---|---|
| 2026-09-22 | Navigation | Megamenü Teppichfliesen: 3 Kacheln mit Bild, Drawer-Kachel | Arbeitstheme, Desktop 1440 + Mobil 375 | PASS |
| 2026-09-22 | M5 | Unit `qa/tests/tp-cart-beratung.test.mjs` (Pflicht, Telefonregeln, Maßprüfung, Attribute, Einbindung) | lokal | PASS 7/7 |
| 2026-09-22 | M5 | Cart ohne Antwort → „Zur Kasse" abgefangen, Fehltext sichtbar, URL bleibt /cart | Arbeitstheme Desktop | PASS |
| 2026-09-22 | M5 | Ja + Telefon + Maßprüfung Ja + Verlegung → /cart.js attributes = {Beratung: Ja, Telefon, Rückruf: Egal, Beratungsthema, Maßprüfung: Ja, Verlegung: Angefragt}; Express-Buttons sichtbar | Arbeitstheme Desktop | PASS |
| 2026-09-22 | M5 | Reload: Radios/Felder aus cart.attributes vorbelegt, keine Sperre | Arbeitstheme Desktop | PASS |
| 2026-09-22 | M5 | Cart-Drawer auf Kollektionsseite rendert Element | Arbeitstheme Desktop | PASS |
| 2026-09-22 | M5 | Mobil 375 px: Breite 343 px, kein horizontaler Overflow, Radio-Zeilen 44 px | Arbeitstheme Mobil | PASS |
| 2026-09-22 | Guards | liquid/schema/template/theme/essential | lokal | PASS (2 vorbestehende Template-Warnungen) |
| 2026-09-22 | M2/M6a | `npm test` gesamte Unit-Suite nach npm ci | lokal | PASS 645/645 (+37 Dashboard) |
| 2026-09-22 | M6a | `qa/tests/bestellmail-beratung.test.mjs` Muster/Ware/Misch, Beratung Ja/Nein, Maßprüfung, Escaping | lokal (LiquidJS) | PASS 4/4 |
| 2026-09-22 | M6b | `qa/tests/kundenmail-bloecke.test.mjs` Muster/Ware/Misch, Bestätigungen, Escaping, Tracking, Spedition | lokal (LiquidJS) | PASS 5/5 |
