## 2026-11-04 · dashboard:pruefen bricht unter Last nicht mehr nach vollstaendiger Pruefung ab

- **Geaendert:** Die Frist beim Beenden des Pruef-Browsers steigt von 3 s auf 15 s und ist ueber `TP_DASHBOARD_PRUEF_WARTE_MS` einstellbar. Haengt nur das Schliessen, nachdem alle Ansichten geprueft sind, schreibt der Lauf den Bericht, beendet den eigenen Browser begrenzt und meldet einen Hinweis; der Exit-Code kommt aus dem Pruefergebnis. Mit `--offen` bleibt die Instanz nur stehen, wenn der Browser nachweislich beendet ist.
- **Getestet:** `npm run -s pruefen`, `node --test docs/ai-dashboard/tests/pruefung-lauf.test.mjs`, `npm run dashboard:pruefen`.
- **Risiken/Annahmen:** Nur Pruefwerkzeug, keine Wirkung auf den Dashboard-Dienst. Das Haengen selbst wurde nicht unter echter Last nachgestellt, nur per Test mit haengendem `close`.
- **Naechste Stufe:** keine.
