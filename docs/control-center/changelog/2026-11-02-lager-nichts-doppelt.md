## 2026-11-02 · Musterlager: nichts doppelt bestellen, bis der Bestand 0 ist

- **Geaendert:** Liegt ein Stueck fuer eine Musterposition im Lager, lehnt der Server „bestellt“ und die Wahl „beim Lieferanten“ ab; der Sammelschritt „bestellt“ ueberspringt sie. Erst „leer“ im Musterlager gibt sie frei. Die Wahl „haben wir da“ belegt jetzt ein Stueck und zaehlt beim Verschicken ab. „Kunde fertig“ und der Einzelstatus „erledigt“ zaehlen ebenfalls ab; vorher blieb der Bestand dort zu hoch.
- **Getestet:** `npm run -s pruefen`; neue Tests in `musterlager-api.test.mjs` (Sperren, Sammelschritt, Abgaenge, Wahl „haben wir da“). Lesende Probe gegen den Betriebsstand: keine offene Lagerposition steht auf „bestellen“.
- **Risiken/Annahmen:** Direkt in Shopify Versendetes ohne Schritt im Dashboard zaehlt weiter nicht ab. Dasselbe Produkt unter zwei Artikelnummern (Linie umbenannt) gilt als zwei Muster, bis der Lagereintrag beide kennt. Eine schon gespeicherte Wahl „beim Lieferanten“ bleibt bestehen.
- **Nächste Stufe:** Alias-Pflege fuer umbenannte Linien im Lagereintrag, sobald der Inhaber die Umbenennung bestaetigt.
