## 2026-11-16 · Hinweis „geht getrennt raus“

- **Geaendert:** Bei Aufträgen mit verschiedenen Abgangsorten ergänzt die Lieferweg-Zeile eine ruhige Plakette „geht getrennt raus“ mit Bernstein-Rahmen und -Text. Ihr Titel erklärt „nicht zusammen packen“. Über uns, aus Lager und über Kettler zählen als gemeinsamer Abgang; Hersteller → Kunde und Hersteller → Baustelle jeweils separat.
- **Getestet:** `node --test docs/ai-dashboard/tests/lieferweg.test.mjs` grün (20/20), einschließlich verschiedener Abgangsorte mit HTML-Plakette, gemeinsamer Abgänge über uns/Lager/Kettler und eines einzelnen Wegs. `npm run -s pruefen` grün (alle 11 Schritte), `npm run dashboard:pruefen` ohne JS-Fehler; Sichtprüfung an einer echten Bestellung mit zwei Wegen im laufenden Control Center.
- **Risiken/Annahmen:** Der Hinweis folgt den vorhandenen Lieferwegen einschließlich Vorschlägen und Stammdaten; er bestätigt keinen tatsächlichen Versand.
- **Naechste Stufe:** Hinweis auch im Bestell- und Packdialog, falls der Laden ihn dort vermisst. Umgesetzt von Codex, geprüft von Claude.
