# Ausgelagerte Lieferantendaten

Seit 2026-09-11 liegen Rohdaten, Scraper, Import-Plaene und die Skill-Sicherung, die
Lieferantendaten enthalten, **nicht mehr im Repository**, sondern nur lokal unter
`~/teppich-paradies-analyse/lieferantendaten/` — dieselben Pfade wie frueher im Repo, dazu
`INHALT.md` mit dem Schluessel der Pseudonyme. Grund: Das Repository ist oeffentlich, und
Bezugsquellen sind Geschaeftsgeheimnis (Regel des Inhabers, 2026-09-11).

In der Doku stehen deshalb nur Pseudonyme: Lieferant A bis D, Hausmarke von A,
Linoleum-Linien A-1 bis A-3, URLs als `lieferant-a.example`. SKUs bleiben unveraendert, weil
sie die Kennungen im Shop sind und dort ohnehin oeffentlich stehen.

| Frueher im Repository | Inhalt | Zusammenfassung im Repo |
|---|---|---|
| `domains/lieferanten/teppichboden-abgleich/` | Sortimentsabgleich Teppichboden: Ergebnis-JSON und -CSV, Rohdaten, Scraper, Matching-Skripte | `README.md` |
| `domains/lieferanten/paketinhalt/` (Rohwerttabelle) | Paketinhalt je Lieferantenlinie mit Rohwerten und Quotienten | `paketinhalt/README.md` |
| `domains/shopify/zubehoer-daten/` | Zubehoer-Import: Rohdaten von Lieferant A, Import-Plan, productSet-Eingaben, Build-Skripte | `domains/shopify/zubehoer-struktur.md` |
| `domains/shopify/linoleum-farbdaten/` | Linoleum-Farbmessung: Messwerte, Bildzuordnung, Namensplan, Mutationen, Skripte | `domains/shopify/linoleum-rollenware-template.md` |
| `domains/shopify/` (Einzeldateien) | Export der Linoleum-Produkte, Farbnummern JK 34 der Hausmarke, Sicherung des Import-Skills samt Patch-Skript | `CLAUDE.md` (Punkt 7 und 8), `domains/shopify/farbverwaltung.md` |
| `data/`, `scripts/` (Einzeldateien) | Farbcode- und Bildliste Linie A-1, Bild-Scraper fuer Lieferant A, Einmal-Korrektur Elastium vom 2026-09-04 (ausgefuehrt) | `docs/elastium-test2-batch-upload.md` |

Die Git-Historie enthaelt diese Dateien weiterhin; sie wird bewusst nicht umgeschrieben.
Neue Lieferantendaten gehoeren direkt in den lokalen Ordner, nicht ins Repository.
