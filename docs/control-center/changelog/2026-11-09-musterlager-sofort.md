## 2026-11-09 · Musterlager: „Aus dem Lager genommen“ in der Packstation, Shop-Hinweis „Sofort lieferbar“

- **Geaendert:**
  - Packstation: Lagermuster stehen fett mit Ort („aus dem Musterlager – liegt: Büro“), damit klar ist, wo gegriffen wird.
  - Packstation: Neuer Knopf **Aus dem Lager genommen (Ort)** an Mustern, die beim Lieferanten bestellt (oder so gewählt) sind, aber inzwischen im Musterlager liegen. Ein Klick zählt das Lager sofort um 1 ab (musterherkunft-Ereignis mit `lagerId`); die Position gilt danach als Lagermuster. Der Knopf erscheint nur, solange nach allen Reservierungen noch ein Stück frei ist.
  - Musterlager → Shop: `operations/lib/muster-sofort.mjs` schreibt die SKUs freier Lagermuster ins Shop-Metafeld `custom.muster_sofort` (jede Minute und nach jeder Lageränderung, nur bei geändertem Stand, mit Gegenprobe). Läuft nur mit Freigabe: `muster-sofort-shop.json` im Privatordner mit `"aktiv": true`.
  - Theme: Snippet `tp-muster-sofort` gibt die Liste im Musterkonfigurator aus; die Farbkarte zeigt „Sofort lieferbar – schneller Versand“ (dunkle Grundfarbe, kein Rot).
- **Getestet:** `operations/tests/musterlager.test.mjs` (sofortLieferbar, musterLagerMoeglich), `tests/musterlager-api.test.mjs` (Lager 3 → nach Klick 1 frei bei 1 Reservierung, zweiter Klick 409, Rolle „lesen“ 403; Metafeld nur mit Freigabe, bei 0 leer), `qa/tests/muster-sofort.test.mjs`.
- **Risiken/Annahmen:** „Nächster Werktag“ wird bewusst nicht versprochen (erst 2 belegte Lagerabgänge, Packzeiten nicht fest). Ein versehentlicher Klick auf „Aus dem Lager genommen“ wird im Musterlager über die Anzahl korrigiert. Rückweg Shop: `aktiv: false` und Metafeld `custom.muster_sofort` löschen.
- **Naechste Stufe:** Keine.
