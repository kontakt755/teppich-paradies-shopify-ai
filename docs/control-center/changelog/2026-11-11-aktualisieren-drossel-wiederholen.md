## 2026-11-11 · Aktualisieren: gedrosselter Teil wird einmal wiederholt

- **Geaendert:** `aktualisiere()` in `operations/scripts/aktualisieren.mjs` wiederholt einen Teil genau einmal nach 5 s Pause, wenn Shopify mit „Throttled“ antwortet. Gilt fuer Knopf, Dienst und Handaufruf. Andere Fehler werden nicht wiederholt.
- **Getestet:** neuer Test in `operations/tests/aktualisieren.test.mjs` (einmal gedrosselt → Erfolg, dauerhaft gedrosselt → zwei Versuche und Fehler, anderer Fehler → ein Versuch); `npm run -s pruefen`.
- **Risiken/Annahmen:** Anlass war der Knopf-Lauf vom 11.11. (w-334): vier Teile neu, Kennzahlen gedrosselt. Ein Lauf dauert im Drosselfall rund 5 s plus die Abrufzeit laenger. Ein echter Knopf-Lauf mit Drosselung ist nicht nachgestellt.
- **Naechste Stufe:** Keine.
