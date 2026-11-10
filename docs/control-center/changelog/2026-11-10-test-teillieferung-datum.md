## 2026-11-10 · Test Teillieferung nicht mehr vom Tagesdatum abhängig

- **Geändert:** `je-auftrag-teillieferung.test.mjs`: Bestelldatum der Testpositionen ist „gestern“ statt fest 03.11.2026.
- **Getestet:** `node --test docs/ai-dashboard/tests/je-auftrag-teillieferung.test.mjs` (5 von 5), `npm run -s pruefen`.
- **Risiken/Annahmen:** Nur Testdaten; die Ansicht war richtig (ab 7 Tagen beim Lieferanten gilt „Nachhaken“).
- **Nächste Stufe:** keine.
