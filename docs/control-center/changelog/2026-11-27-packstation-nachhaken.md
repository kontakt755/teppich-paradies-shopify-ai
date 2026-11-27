## 2026-11-27 · Packstation: beim Lieferanten nachhaken direkt am Umschlag

- **Geaendert:** Umschläge mit Mustern, die seit mindestens 7 Tagen oder über den Liefertermin hinaus beim Lieferanten liegen, haben je Lieferant den Knopf „Bei … nachhaken…“. Er öffnet einen Mail-Entwurf mit allen so offenen Mustern dieses Lieferanten (ohne Kundennamen), zum Kopieren oder fürs Mailprogramm.
- **Getestet:** `dashboard:test`, `pruefen`, Klickstrecke gegen die Datenkopie.
- **Risiken/Annahmen:** Es wird nichts gesendet und nicht vermerkt, dass nachgefragt wurde. Empfänger ist die Muster-Adresse aus den Stammdaten.
- **Nächste Stufe:** Vermerk „nachgefragt am“, falls doppelte Nachfragen vorkommen.
