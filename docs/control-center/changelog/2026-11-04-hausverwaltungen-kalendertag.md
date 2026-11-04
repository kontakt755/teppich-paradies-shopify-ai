## 2026-11-04 · Hausverwaltungen und Akquise: Datum nach Berliner Kalendertag

- **Geaendert:** Der Dienst bildet "heute" beim Speichern von Hausverwaltungen, Akquise-Status und Referenzen als Kalendertag in Berlin statt als UTC-Tag. Stempel und Wiedervorlage sind nachts nicht mehr einen Tag zu frueh.
- **Getestet:** `npm run -s pruefen`; neuer Test mit 23:30 UTC.
- **Risiken/Annahmen:** Bereits gespeicherte Daten bleiben unveraendert.
- **Naechste Stufe:** keine.
