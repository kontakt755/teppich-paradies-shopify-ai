## 2026-11-26 · Packstation: Packbereit-Alter, fehlende Muster, Reiter „Vom Hersteller“

- **Geaendert:** Packbereite Umschläge werden ab 2 Tagen gelb, ab 4 Tagen rot („Liegt bereit · N Tage“), gezählt ab dem letzten Wareneingang. Die Kopfzeile nennt die fehlenden Muster mit Lieferant. Umschläge, bei denen nur der Direktversand zu prüfen ist, stehen im Reiter „Vom Hersteller“ statt unter „Zu klären“.
- **Getestet:** `dashboard:test`, `pruefen`, `dashboard:pruefen` mit Datenkopie.
- **Risiken/Annahmen:** Lagermuster haben keinen Eingangszeitpunkt; dort zählt das Alter ab der Kundenbestellung. Kalendertage, Wochenenden zählen mit.
- **Nächste Stufe:** Beim Lieferanten nachhaken direkt am Umschlag.
