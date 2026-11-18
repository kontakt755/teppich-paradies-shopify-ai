## 2026-11-18 · Kleine Fehler: „1 Tagen“ und UTC-Datum

- **Geaendert:** Kunden-Fälle und Lexikon-Wartelisten zeigen „seit 1 Tag“ statt „seit 1 Tagen“. Die Großbrief-Prüfung zählt „heute“ in Berlin-Zeit statt UTC (zwischen 0 und 1 Uhr stand sonst der Vortag).
- **Getestet:** `npm run dashboard:test` (1529 grün), `npm test`, `npm run dashboard:pruefen`.
- **Risiken/Annahmen:** Keine; nur Anzeige und Standardwert des Tagesdatums.
- **Naechste Stufe:** Offen: Sichtlauf meldete einmal bei 390 px „Lade …“ nach 6 s (Ansicht unklar, unter Last).
