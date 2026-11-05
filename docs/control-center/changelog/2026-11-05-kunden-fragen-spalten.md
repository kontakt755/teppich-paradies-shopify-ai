## 2026-11-05 · „Kunden nach Produkt fragen“: zwei Spalten und Telefonnummern sichtbar

- **Geaendert:** Die Liste ist in zwei Spalten geteilt: „Telefonnummer vorhanden: anrufen“ und „Keine Telefonnummer: per E-Mail“, am Handy untereinander. Die Telefonnummern werden jetzt auch ohne Rückrufwunsch angezeigt. Das wurde am 05.11. im Chat nach Hinweis auf § 7 UWG so entschieden.
- **Getestet:** `docs/ai-dashboard/tests/muster-anrufe.test.mjs` grün, `npm run -s pruefen`. Datenkopie bei 1440 und 390 px: 24 links, 0 rechts, 24 Anrufen-Links, 0 Mail-Knöpfe, 0 JS-Fehler, 0 px Überlauf.
- **Risiken/Annahmen:** Anrufe ohne ausdrückliche Einwilligung können als unzulässige Werbung gelten. Die rechtliche Klärung steht aus (Werkbank w-270). „Möchte keine Anrufe“ sperrt den Kunden dauerhaft. Zurück geht es, indem `ANRUF_NUR_MIT_RUECKRUFWUNSCH` wieder auf `true` gestellt wird.
- **Nächste Stufe:** Freiwilliges Häkchen beim Muster-Bestellen, wenn gewünscht.
