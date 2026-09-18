# Produktimport: zweimal gebaut, Farbcodes erfunden

**Regeln:** Das naechstliegende fertige Produkt abfragen und daran entlangbauen.
`productSet` nur fuer neue Produkte. Nach jedem Schreibvorgang gegenpruefen.
Farbcodes werden abgeschrieben, nie fortgesetzt. Lieferantennamen gehoeren
nicht ins Repository. Arbeitsweise: `domains/shopify/produktimport-arbeitsweise.md`.

## Import ohne geklaerte Namensregeln (2026-09-07)

Sieben Linoleum-Produkte entstanden mit Lieferantennamen im Titel (Linienname
der Hausmarke von A) und englischen Farbnamen samt Nummer (`1032 green melody`)
— beides musste vollstaendig zurueckgebaut werden, obwohl die Regel im
Import-Skill stand und die zwei fertigen Produkte im Shop (Coloria, Elastium)
sie vormachten. Eine Query gegen das naechstliegende fertige Produkt haette
eine Sitzung gespart.

Ebenfalls dort gelernt: Lieferantenseiten mit `curl` statt Browser lesen;
`productSet` bricht auf bestehenden Produkten an doppelten Metafeldern ab und
laesst die alte Variantenstruktur stehen; `userErrors: []` ist kein Beleg, dass
das Ergebnis stimmt.

## Farbcodes durchgezaehlt statt abgeschrieben (2026-09-04)

„Elastium Linoleumboden" fuehrte 24 Farbvarianten, von denen 21 erfunden waren:
ab 4290 war lueckenlos hochgezaehlt worden. Die Anzahl stimmte damit, der
Inhalt nicht — **24 = 24 ist keine Pruefung**, verglichen werden die Codes
selbst. Echte Lieferantenlisten haben Luecken, weil sie gewachsen sind.
`npm run farbcode:guard` findet das Zaehlmuster.

## Lieferantennamen (Regel des Inhabers, 2026-09-11)

Repository, Issues und Dashboard sind oeffentlich; Bezugsquellen sind
Geschaeftsgeheimnis. In Dateien, Commit- und PR-Texten und `npm run task`-Notizen
stehen deshalb nur Pseudonyme: Lieferant A bis D, Hausmarke von A,
Linoleum-Linien A-1 bis A-3, URLs als `lieferant-a.example`. SKUs bleiben
unveraendert — sie sind die Kennungen im Shop und dort ohnehin oeffentlich.
Die Git-Historie enthaelt aeltere Staende mit Namen; sie wird bewusst nicht
umgeschrieben.

Schluessel, Rohdaten, Scraper und Import-Plaene liegen nur lokal unter
`~/teppich-paradies-analyse/lieferantendaten/` (Uebersicht dort in `INHALT.md`,
im Repo `domains/lieferanten/AUSGELAGERT.md`).

## Der Import-Skill liegt in einem synchronisierten Bundle

Der Import-Skill fuer Lieferant A (`teppichparadies-*-import` in der Skill-Liste)
liegt unter `~/Library/Application Support/Claude/…/skills-plugin/` — ein Sync
von claude.ai setzt ihn zurueck. Sicherung und Wiederherstellung (der gepatchte
Volltext und `skill-patch.py`, das die Patches erneut einspielt und sauber
abbricht, wenn der Skill bereits gepatcht ist oder sich geaendert hat) liegen
nur lokal unter `~/teppich-paradies-analyse/lieferantendaten/`.
