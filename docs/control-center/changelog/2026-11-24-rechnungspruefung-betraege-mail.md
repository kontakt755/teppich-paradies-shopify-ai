## 2026-11-24 · Rechnungsprüfung: Beträge für alle, Mail an verkauf@ eingeschaltet (#2301)

- **Geaendert:** Nach den Klickantworten des Benutzers vom 24.11. zeigt die Rechnungsprüfung AB-Preis,
  Rechnungspreis und Differenz allen (Ansicht Laden, „Heute“, Mail) – „EK dürfen Mitarbeiter sehen“. Den Text für
  den Lieferanten auf „Heute“ bekommen auch Mitarbeiter. Die Mail an verkauf@ ist eingeschaltet (privat,
  `einstellungen.json`); Abweichungen der letzten 30 Tage ohne Mail werden einmal nachgeholt.
- **Getestet:** `operations/tests/rechnungspruefung.test.mjs` (Laden-Hinweis mit Summe, Mail mit Beträgen, Nachholen
  genau einmal), `docs/ai-dashboard/tests/laden.test.mjs` (Mitarbeiter sehen Beträge und Entwurf); `npm run -s
  pruefen` grün.
- **Risiken/Annahmen:** Der Bildschirm im Laden zeigt jetzt Einkaufspreise und sollte nicht zum Kunden zeigen.
  „Einkauf über Verkauf“ und der Kettel-Tarif zeigen EK weiter nur dem Inhaber.
- **Nächste Stufe:** Leser für die häufigsten nicht lesbaren Rechnungs- und AB-Layouts (eigene Sitzung).
