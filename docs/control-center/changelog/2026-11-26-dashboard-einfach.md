## 2026-11-26 · Lieferanten-Seite, kein Fehler beim Neustart, frischere Daten

- **Geaendert:** Neuer Menuepunkt „Lieferanten“ (je Lieferant Portal, Telefon, E-Mail, Kundennummer, offene Zahlen; auch in der Suche). Der Start des Dienstes wartet nicht mehr auf GitHub, die Aufgaben werden direkt danach geholt. Lesezugriffe wiederholen sich bei Verbindungsfehlern, stehen gebliebene Verbindungsfehler laden sich selbst neu. Datenabgleich: Bestellungen und Kunden zuerst, Standardtakt 5 statt 10 Minuten.
- **Getestet:** `npm run -s pruefen`; `npm run dashboard:pruefen -- --rollen` (Lieferanten-Seiten, Heute, Hilfe bei 1440, 800, 390, 360 px ohne Fehler); Start bis erreichbar 1 s statt rund 25 s.
- **Risiken/Annahmen:** Der gemeldete Fehler stand nicht im Dienstprotokoll; nachgewiesen ist die Ausfallzeit je Neustart. Ein schon eingerichteter Abgleich-Dienst behaelt 10 Minuten, bis er mit der neuen Vorlage neu eingerichtet ist.
- **Nächste Stufe:** „Je Lieferant“ kuerzen (Positionen erst auf Klick).
