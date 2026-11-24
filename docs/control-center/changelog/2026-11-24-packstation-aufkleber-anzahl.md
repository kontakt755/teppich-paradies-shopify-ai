## 2026-11-24 · Packstation: Anzahl der Aufkleber je Motiv im Druckdialog änderbar

- **Geändert:** Im Druckdialog einer einzelnen Bestellung („Aufkleber und Adresse drucken“) steht je Motiv statt der festen Angabe „1 Aufkleber“ ein Feld „Anzahl“ (1 bis 99), wie schon beim Einzeldruck eines Musters. Summenzeile und Druckknopf rechnen mit der gewählten Anzahl; die Kopien bleiben an der Stelle des Motivs, die Adresse kommt weiter zuletzt. Kein Aufkleber eines Motivs: Haken „drucken“ entfernen. Wunsch aus der Packstation (#2326).
- **Getestet:** `npm run -s pruefen`; neuer Test in `tests/druckliste-sammeldruck.test.mjs` (Summe, Reihenfolge, Motive). Im Browser gegen eine Datenkopie: Anzahl geändert, Summenzeile und Knopftext folgen. Der echte Druck am Etikettendrucker ist ungetestet.
- **Risiken/Annahmen:** Im Sammeldruck mehrerer Umschläge bleibt die Menge fest, weil gleiche Motive verschiedener Kunden sonst an einer Stelle der Rolle zusammengezogen würden. „Vorbereitet“ wird wie bisher nur nach einem vollständigen Lauf vermerkt; gebucht oder versandt wird nichts.
- **Nächste Stufe:** keine.
