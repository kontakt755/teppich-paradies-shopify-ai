## 2026-11-04 · Nachziehen: Neustarts bei PR-Serien buendeln

- **Geaendert:** Der Nachzieh-Dienst wartet bei Aenderungen mit Neustart, bis main 15 Minuten ruhig ist, hoechstens 30 Minuten seit dem aeltesten neuen Commit. Von Hand gestartet zieht er sofort nach.
- **Getestet:** `npm run -s pruefen`; neue Tests fuer Regel und Lauf mit echter Probekopie.
- **Risiken/Annahmen:** Neue Stände erreichen das Control Center bis zu 30 Minuten spaeter (plus 5 Minuten Taktung). Wer es eilig hat, startet das Nachziehen von Hand.
- **Naechste Stufe:** keine.
