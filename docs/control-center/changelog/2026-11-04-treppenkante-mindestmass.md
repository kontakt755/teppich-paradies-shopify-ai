## 2026-11-04 · Treppenkanten: Zuschnitt erst ab 3 m Gesamtlänge, Sperrgut schon über 172 cm

- **Geaendert:** Lieferant G berechnet bei jedem Zuschnitt die volle Stange. Der Längen-Zuschnitt hat deshalb die Block-Einstellung `min_gesamt_cm` (Standard 0 = keine Grenze), in der Treppenkanten-Vorlage 300: unter 3 m Länge × Stückzahl bleibt der Warenkorb-Knopf gesperrt und der Hinweis nennt, was fehlt. Die ganze Stange ist ausgenommen, Läufer sind unberührt. `sperrgut_ab_cm` steht auf 172 (Paketgrenze des Lieferanten); dafür hat der Schieberegler jetzt 100 bis 200 cm in 1-cm-Schritten, weil 172 auf dem alten 5-cm-Raster nicht lag. Keine Preisänderung.
- **Getestet:** `npm run -s pruefen`; Testdatei `qa/tests/tp-laengen-zuschnitt.test.mjs` mit neuen Fällen (genau 300, 299, Stange, Einstellung 0, Läufer); Block mit echtem Rechenkern lokal in Chrome durchgeklickt (Stange, Zuschnitt 100 × 1, 100 × 3, 99 × 3, 69 × 10, Variante ohne Stange).
- **Risiken/Annahmen:** Die Grenze prüft die Produktseite, nicht der Warenkorb. Die Mindestlänge 70 cm je Stück kommt über das Produkt-Metafeld `service.min_seite_cm` und ist nicht Teil dieser Änderung.
- **Nächste Stufe:** keine.
