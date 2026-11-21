## 2026-11-20 · Bestellen: Hinweis „Sammeln?“ bei Ware für einen einzelnen Auftrag


- **Geändert:** Wird im Bestelldialog Ware für genau einen Auftrag vorbereitet (Knopf aus Kundenakte oder Ablauf), zeigt der Dialog oben, wie viele Positionen beim selben Lieferanten aus anderen Aufträgen noch offen sind. Ein Klick auf „Alle offenen zusammen bestellen“ lädt den Dialog mit allen offenen Positionen des Lieferanten. Blockierte Positionen (Bestellangaben fehlen) zählen nicht mit. Umsetzung der Bestellregel „Abholen und Sammeln“ (Inhaber 11.11., Werkbank w-343, Ablaufblatt `docs/betrieb/bestellregel-abholen-sammeln.html`).
- **Getestet:** `tests/bestellvorbereitung-dialog.test.mjs` (zwei neue Fälle: Hinweis mit Zahl und Nachladen ohne Auftrag; kein Hinweis bei nichts anderem offen und bei Mustern), `npm run dashboard:test`, `npm run -s pruefen`, `npm run dashboard:pruefen`.
- **Risiken/Annahmen:** Der Hinweis zählt aus dem im Browser geladenen Bestellstand; ist der Einkauf noch nicht geladen (Dialog direkt aus der Kundenakte), fehlt der Hinweis still. Nur ein Hinweis, nichts wird gesperrt.
- **Nächste Stufe:** Bei Bedarf Warenwert der offenen Positionen anzeigen (Kleinmengengrenze), sobald Einkaufspreise je Position verlässlich vorliegen.
