## 2026-11-26 · Bestellen › Je Lieferant: ein Knopf je Tabellenzeile

- **Geaendert:** In den Tabellen („Positionen bearbeiten“) steht je Zeile ein Knopf für den nächsten Schritt
  (bei gescheitertem Versand „In Shopify buchen“). Liefertermin, Zurück auf offen, Haben wir da, AB,
  Bestelldaten, Übernahme und Wieder öffnen liegen unter „Mehr“. „Beim Lieferanten öffnen“ und „Im Lexikon
  ansehen“ sind Textlinks. Stand, Warnungen und Name einer Übernahme bleiben sichtbar; „Noch nicht
  übernommen“ entfällt in der Zeile.
- **Getestet:** `npm run -s pruefen`, `npm run dashboard:pruefen -- --rollen`, Klickstrecke gegen die Datenkopie (36 Zeilen,
  je 1 sichtbarer Knopf; lf=A 1440 px 14469 → 9693, 390 px 30190 → 22305).
- **Risiken/Annahmen:** Seltene Schritte brauchen einen Klick mehr.
- **Nächste Stufe:** keine.
