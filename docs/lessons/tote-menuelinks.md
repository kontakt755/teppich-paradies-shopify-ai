# Ein toter Menuelink sieht im Editor genauso aus wie ein lebender

**Regel:** Erst zaehlen, welche Werte die Produkte der Kollektion tatsaechlich
tragen, dann entscheiden. `npm run menu:guard` findet den Zustand; die Ursache
klaert nur eine Abfrage. `menuUpdate` ersetzt den gesamten Item-Baum.

## Was passierte

Zweimal ist derselbe Fehler wochenlang live gestanden: Menuepunkte filtern per
`?filter.p.m.custom.<feld>=<Metaobjekt>` und liefern ein leeres Raster. Zwei
verschiedene Ursachen, gleiches Symptom:

| Fall | Ursache | Fix |
|---|---|---|
| Vinyl (108467d) | kein Produkt trug den gefilterten Wert | Metafelder gesetzt |
| Bodenleisten (#123) | Wert korrekt, aber Produkte liegen in einer anderen Kollektion | Links auf die richtige Kollektion umgehaengt |

Die zweite Diagnose ist die verfuehrerische: „Metafelder fehlen" liegt nahe und
ist falsch. Wer beim Bodenleisten-Fall Metafelder gesetzt haette, haette
Produktdaten veraendert, ohne den Link zu reparieren.

## Beim Aendern des Menues

`menuUpdate` ersetzt den **gesamten** Item-Baum. Vorher den kompletten Bestand
auslesen und alle anderen Zweige mit ihren MenuItem-IDs unveraendert
zurueckschreiben. Gegenprobe ist, dass die Menge der MenuItem-IDs vorher und
nachher identisch ist — nicht `userErrors: []`.

Verschieben geht mit denselben IDs (am Entwurfsmenue belegt, 2026-10-15): Ein
bestehender Punkt, der mit seiner `id` unter einem anderen Oberpunkt steht,
behaelt ID, Ziel und Unterpunkte. Neue Punkte kommen ohne `id`. Gruppen
(Spalten im Mega-Menue) sind HTTP-Punkte mit `url: "#"` - Shopify nimmt das an.
Den neuen Baum baut `scripts/menue-umbau.mjs` aus dem gelesenen Menue und
einem Plan; es bricht ab, wenn eine ID fehlt oder doppelt vorkommt, und
`--pruefen` ist genau diese Gegenprobe.
