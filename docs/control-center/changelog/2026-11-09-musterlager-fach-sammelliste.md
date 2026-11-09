## 2026-11-09 · Musterlager: Fach, „Ohne Fach“, Knapp ab 3, Sammelliste in der Packstation

- **Geaendert:**
  - Musterlager: das Feld `ort` heißt jetzt **Fach** und steht vorn in jeder Zeile („Fach B3“ bzw. „ohne Fach“). Neuer Filter **Ohne Fach (n)**; die Suche heißt „Wo liegt …? Farbe, Produkt oder Fach“ (sucht wie bisher auch im Fach).
  - Knapp: ein Eintrag steht auf „Knapp“, wenn er nur noch für höchstens 3 Muster reicht (`KNAPP_AB` 5 → 3; bei Einzelmustern zählen die freien Stücke, vorher erst bei 0 frei). Nur Anzeige, es wird nichts bestellt.
  - Packstation: Lagermuster zeigen „aus dem Musterlager – Fach B3“. Neuer Reiter **Sammelliste**: alle noch nicht eingelegten Muster der packbereiten Umschläge, gleiche zusammengefasst, nach Fach sortiert (numerisch, B 2 vor B 10), mit Anzahl und Bestellnummern; Lagermuster ohne Fach und angekommene Lieferanten-Muster stehen darunter. „Sammelliste drucken“ druckt per Browser (A4).
- **Getestet:** `tests/muster-packen.test.mjs` (Sortierung, Zusammenfassen, nur packbereit/nicht eingelegt), `tests/ampel.test.mjs` (Knapp bei 3, nicht bei 4), `npm run -s pruefen`, Sichtprüfung `dashboard:pruefen` Desktop und 390 px.
- **Risiken/Annahmen:** Viele Einzelmuster liegen nur einmal da und stehen dadurch jetzt gelb auf „Knapp“ – so gewünscht (09.11.). Fachetikett für den Niimbot ist nicht gebaut (der Etikettendruck wird parallel umgebaut).
- **Naechste Stufe:** Fachetikett 50 × 30 über den Etikettendruck, sobald dessen Umbau gemergt ist.
