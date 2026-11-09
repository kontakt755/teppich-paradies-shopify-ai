## 2026-11-09 · Reste & Sonderposten: eine Karte je Rolle, Restlänge, Abholhinweis

- **Geaendert:** Auf `/collections/reste-sonderposten` stand jede Restrolle doppelt (Rolle und
  Kettelteppich, gleiches Bild, 20 Karten für 10 Rollen). Jetzt eine Karte je Rolle
  (`sections/main-collection.liquid`, Zuordnung über `service.einfass_basis`); die Rollenkarte zeigt
  „Noch 50 m² · 12,50 m Restlänge“ und verlinkt „Auch als Teppich nach Maß, gekettelt →“
  (`blocks/tp-card-aktion.liquid`). Trefferzahl folgt (10 Artikel). Der Standard-Preisfilter
  (0 bis 41,95 €, Kettelteppiche je 0,01 m²) ist aus, „Preis je m²“ bleibt
  (`snippets/tp-preisfilter-versteckt.liquid`). Unter der Beschreibung ein kurzer Hinweis
  „Im Laden ansehen, selbst abholen“ mit Sprung zum Ladenteil.
- **Getestet:** Arbeitstheme per `--only`, Desktop 1280 px und Telefon 390 px (keine Querscroll),
  10 Karten, 10 Kettel-Links führen auf die richtigen Produkte; `npm run -s pruefen` alle 11 Schritte grün.
- **Risiken/Annahmen:** Zusammenlegung nur, solange die Kollektion auf eine Seite passt (24);
  darüber bleiben alle Karten. Kettelteppiche bleiben in Suche und Teppich-Kategorien einzeln sichtbar.
- **Offen:** Farbfilter zeigt nur „Grau“ (Farbe fehlt an 9 von 10 Rollen); Sortierung „größter
  Abstand zur UVP“ kann Shopify nicht serverseitig.
