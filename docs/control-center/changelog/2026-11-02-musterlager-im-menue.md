## 2026-11-02 · Musterlager direkt im Menü (#1836)

- **Geaendert:** Das Musterlager lag versteckt unter „Bestellen“ als fünfter Reiter. Es steht jetzt als eigener Punkt im Menü unter „Packstation“, am Handy im Blatt „Mehr“, und führt auf die vorhandene Seite; es gibt keine neue Ansicht und keinen neuen Reiter. Auch die Suche oben (⌘K) kennt es als Arbeitsweg, die Hilfe erklärt es.
- **Getestet:** Neuer Test in `navigation.test.mjs` (Menüpunkt, Handyleiste unverändert, nur ein Punkt markiert), `palette-arbeitswege` ergänzt; `npm run -s pruefen` grün; Klicktest gegen die Datenkopie bei 1440 und 390 px: Klick öffnet das Lager, Markierung stimmt, kein seitliches Scrollen, keine JS-Fehler.
- **Risiken/Annahmen:** Annahme: „nicht als extra Reiter“ heißt, das Lager soll direkt erreichbar sein, ohne neuen Reiter. Der bisherige Reiter unter „Bestellen“ bleibt, damit alte Wege und Links weiter gehen.
- **Naechste Stufe:** keine.
