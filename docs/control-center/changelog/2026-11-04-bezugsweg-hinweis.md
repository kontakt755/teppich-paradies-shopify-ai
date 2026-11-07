## 2026-11-04 · Bestelldialog: Hinweis zum Bezugsweg

- **Geaendert:** Der Waren-Bestelldialog zeigt bei Massware aus der Rolle je Auftrag einen Hinweis. Kunde in der Naehe: Die Rolle direkt beim Hersteller kann guenstiger sein, wir schneiden zu und liefern an. Kunde weiter weg: Meist ist der Grosshandel besser, wegen der Speditionskosten.
- **Getestet:** `npm run -s pruefen`, `npm run dashboard:test`, `npm run dashboard:pruefen`; neue Tests fuer Server und Dialog.
- **Risiken/Annahmen:** Der Inhaber hat keine feste Grenze genannt. "Nah" ist die vorhandene Grenze des Kettler-Vorschlags (PLZ 10-14 und 16). Der Hinweis nennt keine Preise, schaltet nichts um und erscheint auch bei Lieferanten, die selbst Hersteller sind, weil die Stammdaten das nicht unterscheiden.
- **Naechste Stufe:** Preisvergleich beider Wege, sobald Rollenpreise und Anlieferkosten als Daten vorliegen.
