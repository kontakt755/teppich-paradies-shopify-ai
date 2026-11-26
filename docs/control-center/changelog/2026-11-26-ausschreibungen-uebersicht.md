## 2026-11-26 · Neuer Bereich „Ausschreibungen“ im Control Center (#2371)

- **Geaendert:** Unter „Weitere Bereiche“ gibt es „Ausschreibungen“ (nur Inhaber): alle öffentlichen Verfahren mit Auftraggeber, Ort, Leistung, Portal-Link, Frist, Stand und nächstem Schritt. Offene stehen nach Frist oben, darunter die noch ungeprüften Treffer des wöchentlichen Suchlaufs (neue markiert), unten Erledigtes und Abgesagtes. Fristen in den nächsten 7 Tagen sind hervorgehoben; zeigt „Suche zuletzt“ und Ausfälle der Quellen. Die Seite liest bei jedem Öffnen die lokalen Dateien neu, ohne KI. Ersetzt das von Hand gepflegte Artefakt.
- **Getestet:** `tests/ausschreibungen.test.mjs` (7 Tests: Kopfblock-Parser, Zusammenführen, Fristen, frisches Lesen, Rolle Mitarbeiter/lesen 403, Ansicht), `dashboard:test`, `npm test`, `dashboard:pruefen` nur OK, Sichtprüfung Desktop und 390 px mit den lokalen Daten.
- **Risiken/Annahmen:** Pflege nur über den Kopfblock in der CHECKLISTE.md; fehlt er, steht „Kopfblock fehlt“. `treffer:` trennt an Kommas. Nur Inhaber sehen die Seite.
- **Naechste Stufe:** Zahl der Fristen ≤ 7 Tage als Hinweis auf „Heute“, falls gewünscht.
