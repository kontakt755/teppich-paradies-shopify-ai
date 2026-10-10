# Kollektionsseite laeuft in den Render-Timeout

**Regel:** Bevor jemand eine Liquid-Seite „schneller macht“, wird ohne Seiten-Cache
gemessen und profiliert. Produktreferenzen (`metafield.value` auf einen anderen
Artikel) nie je Produkt einer langen Liste aufloesen.

## Was passierte

Am 2026-10-10 zeigte `/collections/teppich-nach-mass` nach 10 s Shopifys
„Something went wrong“, sobald die Kollektion ~227 Teppiche hatte. Die Vermutung war
die siebenfache Gruppen-Zuordnung je Produkt. Der Profiler sagte etwas anderes:

| Posten (133 Teppiche, ohne Cache) | Anteil |
|---|---|
| `service.einfass_basis.value` aufloesen (Qualitaetszeile, Breite, Gruppe, Rechner) | ~12 ms je Teppich |
| Rechner-JSON im Hero, je Farbe Rollenbreiten der Basis | ~47 % |
| jede Produktkarte | ~8-19 ms |
| die Gruppen-Zuordnung selbst | ~2 % |

Live wirkte die Seite mit 0,6 s schnell - das war nur der Seiten-Cache. Ohne Cache
brauchte sie schon mit 133 Teppichen 4-8 s.

## Messen

- **Profil:** `shopify theme profile --store sjjyq1-6w.myshopify.com --theme <dev-id> --url /collections/<handle>`
  liefert eine Speedscope-Datei (Frames mit Datei und Zeile). Laeuft die Seite selbst
  in den Timeout, bricht auch der Profiler ab: dieselbe Vorlage auf einer kleineren
  Kollektion profilieren (im Dev-Theme `templates/collection.json` = die Vorlage setzen,
  `--url` kennt kein `?view=`).
- **Zeit:** Header `server-timing: processing;dur=…` (dazu `render`, `db_async`, `gc`).
  Vorschau per Cookie halten (`curl -c/-b` nach `?preview_theme_id=`), sonst misst curl
  still Live. Den Seiten-Cache umgeht `&page=1&_x=<zufall>`; Werte unter ~150 ms sind
  trotzdem Cache-Treffer und zaehlen nicht.
- Mit 250+ Produkten testen: vorruebergehend eine versteckte Smart-Kollektion
  (`seo.hidden`) mit passenden Tag-Regeln anlegen und danach loeschen.

## Was geaendert wurde

- `custom.teppich_basis_daten` (JSON) traegt das Ergebnis der Basis-Regeln am Teppich;
  gepflegt per `npm run -s teppich:basis-daten` aus der Vorlage
  `product.teppich-basis-daten`, die die echten Snippets mit `live: true` auswertet.
  Die Regeln stehen weiter nur in den Snippets. Nach Importen laufen lassen.
- Je Gruppen-Reihe stehen nur die ersten Karten im HTML (`karten_sofort`), der Rest
  kommt aus `collection.teppiche-reihen` nach. Die Rechner-Daten kommen aus
  `collection.teppiche-rechner` nach.
- Ergebnis ohne Cache: 134 Teppiche ~5,1 s → ~1,3 s; 267 Produkte 10 s (Timeout) → ~2 s.

## Was bleibt

Wer ueber `collection.products` mit `paginate by 250` iteriert, laedt alle Produkte
(~2 ms je Produkt plus `db_async`). Und ueber 250 Produkte sieht eine solche Seite
gar nicht alle. Waechst die Kollektion weiter, braucht sie eigene Gruppen-Kollektionen
statt einer Schleife ueber alles.
