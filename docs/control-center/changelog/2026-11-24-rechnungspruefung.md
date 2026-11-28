## 2026-11-24 · Rechnungsprüfung im Probebetrieb: Warenrechnung gegen Auftragsbestätigung (#2301)

- **Geaendert:** Freitags prüft der Rechner jede neue Warenrechnung gegen die AB desselben Auftrags (Artikel, Menge,
  Einzelpreis, Zuschläge) – ohne KI, mit Rechenprobe statt Raten. Abweichungen stehen rot auf „Heute“ und als
  „Rechnung prüfen“ unter „Zu tun“ in der Ansicht Laden (mit „Erledigt“), darunter die Wochenzeile „geprüft · passt ·
  offen“ und die nicht prüfbaren zum Ansehen. Der Inhaber sieht die Beträge und einen Text für den Lieferanten zum
  Kopieren. Die Mail an verkauf@ ist vorbereitet und ausgeschaltet.
- **Getestet:** `operations/tests/rechnungspruefung.test.mjs` (11 Tests: Zuordnung, Vergleich, Rechenprobe, drei
  Ergebnisse, Mail-Schalter), API-Test in `laden.test.mjs`; Probelauf November über 51 Warenrechnungen: 15 passt,
  1 Abweichung (Mehrmenge, von Hand gegen die AB bestätigt), 35 nicht prüfbar; `npm run -s pruefen` grün.
- **Risiken/Annahmen:** Viele PDF-Layouts lassen sich (noch) nicht sicher lesen – sie landen als „nicht prüfbar“,
  nie als geratenes Ergebnis. Die Ansicht Laden zeigt keine Einkaufspreise (Regel „nur Inhaber“). Lieferanten ohne
  AB per Mail bleiben „keine AB gefunden“.
- **Nächste Stufe:** nach zwei bis vier Wochen Probebetrieb entscheiden, ob die Mail an verkauf@ eingeschaltet wird;
  Leser für die häufigsten nicht lesbaren Layouts ergänzen.
