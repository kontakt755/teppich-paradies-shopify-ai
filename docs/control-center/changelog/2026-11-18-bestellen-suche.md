## 2026-11-18 · Bestellen: Suche nach Auftrag oder Kunde

- **Geaendert:** Im Reiter „Je Auftrag“ unter Bestellen steht oben ein Suchfeld („#Nummer oder Kundenname“). Es durchsucht alle offenen Aufträge nach Bestellnummer, Kundenname und Ort; mehrere Wörter müssen alle passen. Während einer Suche gelten Art-Chips und Gruppen nicht, die Treffer stehen als Karten direkt darunter, „Suche aufheben“ führt zurück. Der Begriff steht wie bei der Kundensuche nur als Verweis in der Adresse (`abq` in `lib/suchverweis.mjs`), damit Kundennamen nicht im Browserverlauf landen. Kein neuer Endpunkt, gefiltert wird auf die schon geladenen Bestellungen (#2240).
- **Getestet:** `npm run dashboard:test` und `npm test` grün, neuer Test für `abq` in `tests/suchverweis.test.mjs`; `npm run dashboard:pruefen` und Klickstrecke gegen die Datenkopie (siehe PR).
- **Risiken/Annahmen:** Gesucht wird nur unter offenen Aufträgen; erledigte findet man weiter unter Kunden (Hinweis bei null Treffern).
- **Naechste Stufe:** Suche auch im Reiter „Je Lieferant“, falls der Laden sie dort vermisst.
