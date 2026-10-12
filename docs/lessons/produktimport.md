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

## Lieferantennamen im Bilddateinamen, PVC-freie Ware als PVC (2026-10-10)

Rund 600 Produkte von Lieferant C gingen mit den Original-Dateinamen der
Lieferanten-Mediendatenbank live (`PB_<Linie>_<Nummer>.jpg`). Titel, Alt-Texte
und Beschreibungen waren sauber, aber die Linie stand in jeder Bild-URL und im
Quelltext. 1.550 Dateien mussten nachträglich per `fileUpdate` umbenannt
werden. Seitdem setzt der Import `files[].filename` schon im `productSet`.

Am selben Tag trugen 35 Designböden „Material PVC“, obwohl die
Artikelspezifikation „PVC-frei“ (Polyurethan) nannte. Das Material war je
Warengruppe gesetzt statt je Artikel gelesen. Dasselbe galt für „phthalatfrei“
bei einer CV-Qualität, deren Datenblatt die Angabe nicht enthält.

Gegenprobe nach jedem Import: Live-Seite auf Linien- und Lieferantennamen
durchsuchen, nicht nur Titel und Beschreibung prüfen. Den Plan auf Reste des
Seitenparsers prüfen (` | `, `millimeter`); unbekannte Spezifikationsfelder
hängen sich sonst an den Vorwert (`R10 | Florhöhe in millimeter | 2.8`).

## Dieselben Dekore unter anderer Nummer (2026-10-10)

Beim Linoleum der Hausmarke von C waren 38 von 89 Farben schon im Shop, als
Farben von Lieferant A: Marenta, Kaneo, Coloria und Elastium führen dieselben
Herstellerdekore. Lieferant A nummeriert um: eigenes Präfix plus die letzten
zwei Ziffern der Herstellernummer (aus Herstellerfarbe 0081 wird 4381, aus
3593 wird 1093). Ein
Abgleich über die Farbnummer findet deshalb nichts. Mehrere Linien nutzen sogar
pixelgleiche Herstellerfotos.

Vor dem Anlegen neuer Farben gegen den ganzen Bestand derselben Produktart
prüfen, und zwar auf drei Wegen: Bildmerkmale (ORB, findet gleiche Fotos),
Farbabstand des Bildmittels und Endziffern-Schema. Grenzfälle mit Bild nebeneinander
ansehen. Raumbild-Dateinamen des Bestands nennen oft den Herstellerdekor.

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

Der alte Import-Skill fuer Lieferant A (`teppichparadies-*-import`) kam aus dem
Claude-Konto und wurde bei jedem Sync von claude.ai zurueckgesetzt. Am 2026-09-26
war wieder der ungepatchte Stand vom 2026-08-07 aktiv: Browser statt `curl`,
Lieferant beim Namen. Die gepatchte Fassung samt `skill-patch.py` liegt weiter nur
lokal unter `~/teppich-paradies-analyse/lieferantendaten/domains/shopify/`; ihr
Inhalt steckt bereits in `domains/shopify/produktimport-arbeitsweise.md`.

Seit 2026-09-26 liegt der Ablauf versioniert im Repository:
`.claude/skills/produktimport/SKILL.md`. Den Konto-Skill im Claude-Konto
deaktivieren, damit nicht zwei Anleitungen um denselben Auftrag konkurrieren.
