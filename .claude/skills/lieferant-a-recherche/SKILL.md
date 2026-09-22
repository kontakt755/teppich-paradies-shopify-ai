---
name: lieferant-a-recherche
description: Produktdaten beim Hauptlieferanten (Lieferant A) nachschlagen und Einkaufsfelder (einkauf.*) belegt klaeren – Artikelnummer, Farbnummer, Produkt-URL, Lieferant. Verwenden, wenn in der Bestelluebersicht oder im Dashboard-Bereich "Einkauf" etwas UNGEKLAERT steht, bei neuen Produkten oder beim Abgleich von SKUs.
---

# Lieferant A – Produktrecherche

Ziel: jeden Einkaufswert mit **Quelle** belegen. Nichts raten, nichts fortzaehlen.
Was nicht belegt ist, bleibt `UNKLAR` und kommt mit Grund in `offen.json`.

## Vorher

- `CLAUDE.md` Punkt 7 und 8, `domains/shopify/produktimport-arbeitsweise.md`.
- **Klarnamen und echte Domains nie ins Repository**, nie in Commits, PRs,
  Issues oder `npm run task`-Notizen. Die echte Basis-URL steht nur lokal in
  `~/teppich-paradies-analyse/lieferantendaten/lieferant-a.env`
  (`LIEFERANT_A_BASIS=...`). In Dateien und Berichten `lieferant-a.example`.
- Inhaberregeln fuer Einkaufsfelder: Memory
  `einkauf_felder_inhaberentscheidungen` (SKU = Artikelnummer A, Endung =
  Farbnummer; Rollenvinyl/Linoleum/Leisten = A; Wunschmass von der 400-cm-Rolle;
  Masteppiche in lfm; Zubehoer je Stueck; Route immer SUPPLIER_TO_TP).

## Nachschlagen per curl (ohne Login)

Die Suche braucht eine Sitzung. Reihenfolge einhalten, Cookies mitnehmen:

```bash
source ~/teppich-paradies-analyse/lieferantendaten/lieferant-a.env
J=$(mktemp)
curl -s -c "$J" -b "$J" "$LIEFERANT_A_BASIS/shop-select" -o /dev/null
curl -s -c "$J" -b "$J" "$LIEFERANT_A_BASIS/de-DE/" -o /dev/null
curl -s -c "$J" -b "$J" "$LIEFERANT_A_BASIS/de-DE/quicksearch?query=<SKU>"
```

- Parameter heisst **`query=`**. `searchparam=` wird still ignoriert und liefert
  den ungefilterten Katalog – sieht nach Treffern aus, ist aber keiner.
- Antwort: `products.data[]`. **`material_number` ist die Artikelnummer.**
  Belegt ist nur ein **exakter** 1:1-Treffer gegen unsere SKU.
- Farbnummer nur uebernehmen, wenn die SKU-Endung **und** die fuehrende Zahl in
  `short_description` uebereinstimmen. Achtung zwei Nummernsysteme: bei
  manchen Kanten-/Randprodukten ist die SKU-Endung eine Listenposition, keine
  Farbnummer.
- Technischer Aufbau steht nur im Datenblatt `TTD_*.PDF`, nicht auf der Seite.
- Preise nur mit Login. Mit Login nur **lesen** (Chrome-Werkzeuge,
  `mcp__claude-in-chrome__*`, Sitzung des Inhabers). Nie Zugangsdaten
  eingeben, nie bestellen, nichts aendern.
- Ergebnisse cachen: `~/teppich-paradies-analyse/lieferantendaten/lieferant-a-katalog-<datum>.json`
  (vorher pruefen, ob ein aktueller Cache existiert). Hoeflich abfragen: eine
  Anfrage nach der anderen, kleine Pause, kein Parallel-Sturm.

## Schreiben in Shopify

1. Plan lokal bauen: je Variante `feld -> {value, source, confidence}`.
2. Typen aus den Live-`metafieldDefinitions` (`einkauf.lieferant` ist eine
   Metaobjekt-Referenz auf `tp_lieferant`, kein Text).
3. Rollback-Datei mit den alten Werten **vor** dem Schreiben.
4. `metafieldsSet` in Paketen zu 25 (Massen-Mutationen sind ueber den MCP
   gesperrt). Mehrfaches Senden ist unschaedlich.
5. Gegenprobe per Export: jeder geplante Wert steht exakt so im Shop.
   `userErrors: []` ist kein Beleg.

## Danach

Bestelluebersicht neu erzeugen (`operations/README.md`, Abschnitt
"Bestelluebersicht"); der Dashboard-Bereich "Einkauf" (`npm run dashboard`)
liest dieselben Dateien.
