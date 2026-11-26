## 2026-11-26 · Bestellen › Je Lieferant zugeklappt

- **Geaendert:** Je Lieferant nur noch Name, offene Zahlen und Hauptknöpfe; „Positionen zeigen“ klappt die
  Arbeitsschritte auf, danach „Positionen bearbeiten“ die Tabellen. „Zuerst klären“ steht zugeklappt mit
  Zahlen (blockiert, prüfen) und merkt sich Auf/Zu. „Lieferant nicht zugeordnet“ zeigt die Tabelle erst auf
  Klick. `af`, `lf` und `auftrag` öffnen wie bisher direkt, `art` grenzt nur ein. Karten am Rechner in
  mehreren Spalten. Einklappen nach `lf=` bleibt auf „Je Lieferant“.
- **Getestet:** `npm run -s pruefen` grün, `dashboard:pruefen -- --rollen` (0 px Überlauf; Ladezeit-Meldungen
  unter Last in anderen Ansichten, jede Kombination in einem Wiederholungslauf grün), Klickstrecke gegen die
  Datenkopie. Höhe 1440 px: 9652 → 1878, 390 px: 19312 → 3456.
- **Risiken/Annahmen:** Wer Positionen sehen will, braucht je Karte einen Klick; der Zustand gilt bis zum
  Neuladen.
- **Nächste Stufe:** keine geplant.
