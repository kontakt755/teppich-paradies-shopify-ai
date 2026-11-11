## 2026-11-11 · Gesamtübersicht: eigener Chip „Büro“ (w-234)

- **Geaendert:** Die Gesamtübersicht des Inhabers (`#/heute?sicht=…`) hat einen vierten Chip „Büro“ zwischen „Website“ und „Alles“ (Entscheidung im Chat am 11.11.). Er zeigt die To-dos, die bisher nur unter „Alles“ standen: Freigaben, neue Aufträge (Wiedervorlagen) und Hausverwaltungen. Damit gilt Laden + Website + Büro = Alles. Wie bei „Website“ fehlen in der Büro-Sicht Nachfragen, Lieferantenbelege, Restrollen und der Block „Laden & Montage“.
- **Getestet:** Neuer Test in `tests/todos.test.mjs` (Summe der drei Chips = Alles, Sicht zeigt nur Büro-Themen, Chip-Zahl = Listenlänge). `npm run dashboard:pruefen` für `heute?sicht=buero` und `heute?sicht=alles`, `npm run -s pruefen`.
- **Risiken/Annahmen:** Mitarbeiter sehen den Chip nicht (wie bisher nur der Inhaber schaltet um). Vier Chips in der Kopfzeile am Handy geprüft bei 390 und 360 px.
- **Nächste Stufe:** keine.
