## 2026-11-02 · Lexikon: Musterlager direkt am Produkt

- **Geaendert:** Die Produktseite im Lexikon zeigt den Bereich „Im Musterlager“ (Farbe, Menge, Lagerplatz) und ein Formular „Ins Lager eintragen“. Zuordnung ueber die Artikelnummern, geschrieben wird als Einzelmuster ueber den bestehenden Endpunkt `einkauf/musterlager`. Rolle „lesen“ sieht kein Formular. Die Lager-API liefert dafuer zusaetzlich `schluessel`.
- **Getestet:** `npm run -s pruefen`; Unit-Tests `tests/lexikon-musterlager.test.mjs`; Klickstrecke gegen die Datenkopie (`dashboard:pruefen -- --offen`): 2× eingetragen, Zeile erscheint sofort mit Menge und Lagerplatz, keine JS-Fehler, 390 px ohne seitliches Scrollen. Echte Lagerdatei unveraendert.
- **Risiken/Annahmen:** Das Formular traegt nur Einzelmuster ein; Probestuecke und Bahnen weiter unter Einkauf > Musterlager. Der Bestand wird beim Oeffnen des Produkts geladen; eine Aenderung im Einkauf erscheint beim selben Produkt erst nach dem Neuladen der Seite.
- **Nächste Stufe:** Bei Bedarf Abziehen und Lagerplatz aendern im Lexikon.
