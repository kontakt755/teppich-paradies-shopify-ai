## 2026-11-10 · Ansicht Laden: Musterkunden stehen nicht mehr in „Zu tun“

- **Geändert:** „Kunde antwortet nicht“ zeigte trotz Filter reine Musterbestellungen („Kunde schaut sich die Muster an“). Die Auftragsart stand nur in der Zeitleiste, nicht an der Bestellzeile; `bestellzeilenMitSchritt()` hängt sie jetzt an.
- **Getestet:** `npm run -s pruefen` alle 11 Schritte; Übersicht nur lesend gegen die echten Daten: vorher 2 Muster-Einträge, danach 0.
- **Risiken/Annahmen:** Kein eigener Test mit Bestell-Fixture für diesen Fall; der vorhandene Test prüft nur den Filter selbst.
- **Nächste Stufe:** Mail-Abruf, sobald das Postfach für den Laden steht.
