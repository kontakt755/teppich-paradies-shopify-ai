## 2026-11-05 · Aufkleber: denselben Aufkleber mehrfach drucken
- **Geaendert:** Der Druckdialog zeigt je Aufkleber ein Feld „Anzahl“ (1 bis 99), der Druckknopf nennt die Summe. Das gilt fuer Einzeldrucke: Packstation (einzelnes Muster), Musterlager (Aufkleber am Eintrag, „Aufkleber drucken…“, Verlegereste) und Lexikon. Sammeldrucke mit Packreihenfolge oder Bestaetigung behalten ihre Menge. „Angaben bearbeiten“ gilt jetzt fuer alle Kopien eines Aufklebers, damit sich die Stueckzahl nicht aufspaltet.
- **Getestet:** `npm run -s pruefen`, `dashboard:pruefen` fuer Einkauf und Kunden bei 390 und 1440 px, Klickstrecke gegen die Datenkopie: Anzahl 1 → 9 → Knopf „Jetzt 9 Aufkleber drucken“, Eingabe 0 bleibt bei 9 mit Hinweis, 3 → „Jetzt 3 Aufkleber drucken“, kein seitliches Scrollen, keine JS-Fehler. Nicht getestet: echter Druck auf dem Niimbot B1.
- **Risiken/Annahmen:** Der Druck bucht weiterhin nichts; die Menge im Musterlager wird getrennt eingetragen.
- **Nächste Stufe:** Keine geplant.
