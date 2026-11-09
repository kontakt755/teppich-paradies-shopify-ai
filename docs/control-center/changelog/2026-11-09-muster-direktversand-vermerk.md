## 2026-11-09 · Packstation: Muster im Direktversand nicht mehr „Überfällig“

- **Geaendert:**
  - Muster mit Vermerk `ueber: 'kunde'` (Lieferant schickt direkt an den Kunden) bekommen in der Packstation keine Warte-Ampel mehr. Statt rot „Überfällig · 20 Tage beim Lieferanten“ zeigt der Umschlag gelb „Direktversand prüfen“, die Standzeile „· direkt an den Kunden“.
  - Neuer Knopf **Kommt direkt zum Kunden…** an jedem bestellten Muster der Packstation: vermerkt den Direktversand nachträglich (`aktion: 'direktversand'` auf `/api/einkauf/auftragsstatus`, `vermerkeDirektversand` in `operations/lib/auftragsstatus.mjs`). Schritt und Bestelldatum bleiben, nur Muster in „bestellt“.
  - Ursache des Befunds (#1049, Lieferant E): die Bestellung lief am 20.10., der Vermerk im Bestellmail-Dialog („direkt an unsere Kunden“) kam erst am 24.10. dazu. Neue Bestellungen über den Dialog tragen ihn schon.
- **Getestet:** neue Tests in `tests/muster-packen.test.mjs` (Ampel mit/ohne Vermerk), `operations/tests/auftragsstatus.test.mjs` (`vermerkeDirektversand`) und `tests/zeitleiste-api.test.mjs` (API-Aktion inkl. Ablehnung für Ware und offene Muster). `npm run -s pruefen` 11/11.
- **Risiken/Annahmen:** Der Knopf steht an jedem bestellten Muster; ein Fehlklick lässt sich nur über „Zurück auf offen“ und neu bestellen zurücknehmen. Der Schritt „Muster bestellt“ aus der Kundenakte (Zeitleiste) setzt weiterhin keinen Direktversand-Vermerk.
- **Naechste Stufe:** Keine.
