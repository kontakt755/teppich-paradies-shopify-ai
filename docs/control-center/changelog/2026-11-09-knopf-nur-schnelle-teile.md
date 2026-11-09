## 2026-11-09 · Knopf „Jetzt aktualisieren“ holt nur die schnellen Teile

- **Geaendert:** `aktualisierungStarten` startet `aktualisieren.mjs --nur bestellungen,kennzahlen,kunden,angebote,warenkoerbe` (ca. 28 s statt ca. 390 s). Lexikon und Bestand holt weiter der Dauerdienst stuendlich; bei Bedarf `npm run daten:aktualisieren -- --nur lexikon`. Status und Fehlerbehandlung unveraendert.
- **Getestet:** neuer Test in `tests/api.test.mjs` prueft die Argumente des Kindprozesses; `npm run -s pruefen` 11/11.
- **Risiken/Annahmen:** Die Teileliste steht doppelt (dashboard-api.mjs und SCHNELLE_TEILE in sync-dienst.mjs), muss gleich bleiben. Praxisbeleg (ein Klick, Dauer unter ca. 40 s in aktualisierung.json) steht nach dem Merge aus.
- **Naechste Stufe:** Keine.
