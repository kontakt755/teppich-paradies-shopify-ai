## 2026-11-05 · „Muster anrufen“: Vermutungen, Zahlen und Ideen, warum nicht gekauft wird

- **Geaendert:** Im Reiter steht unter den Gründen zugeklappt „Warum nicht gekauft wird“: sieben Vermutungen mit den aktuellen Zahlen aus den eigenen Bestellungen und der Zahl der Nennungen, dazu neun Vorschläge, was statt oder neben dem Gratis-Muster ginge. Vier neue Klick-Ergebnisse machen die Vermutungen prüfbar: „Muster kamen zu spät“, „Wollte nur vergleichen“, „Maß oder Preis unklar“, „Kauft später“.
- **Getestet:** `docs/ai-dashboard/tests/muster-anrufe.test.mjs` 18 von 18 grün, `npm run -s pruefen` alle 11 Schritte. Klickstrecke gegen die Datenkopie bei 1440 und 390 px: 16 Einträge sichtbar, neues Ergebnis erscheint als „genannt“ an der passenden Vermutung, 0 JS-Fehler, 0 px Überlauf.
- **Risiken/Annahmen:** Die Texte sind Vermutungen und Vorschläge, beschlossen ist nichts. „Noch nicht verschickt“ zählt, was im Dashboard nicht als verschickt eingetragen ist; Herstellermuster können trotzdem unterwegs sein.
- **Nächste Stufe:** Inhaber wählt aus, was getestet wird; nach einigen Wochen Gründe auswerten.
