## 2026-11-06 · Test „Jetzt aktualisieren“ wartet auf das Ende statt fest 500 ms

- **Geaendert:** `tests/api.test.mjs` wartet in drei Tests mit `warteAufLaufende()` (hoechstens 15 s), bis der Aktualisierungslauf fertig ist. Vorher schlief ein Test fest 500 ms; unter Last brauchte schon der Start des Kindprozesses laenger, der Test wurde rot und hielt das automatische Nachziehen des Dashboards an (05.11., 14:07). Die beiden anderen Stellen gaben nach 2,5 s auf.
- **Getestet:** Simulierter langsamer Lauf (700 ms): alter Test rot, neuer gruen. `npm run dashboard:test`, `npm run -s pruefen`.
- **Risiken/Annahmen:** Nur Tests, kein Produktivcode. Haengt ein Lauf wirklich, schlaegt der Test nach 15 s fehl statt nach 0,5 s.
- **Naechste Stufe:** Keine.
