---
name: raumbilder-recherche
description: Fuer Shop-Produkte ohne Raumbild den echten Hersteller hinter dem Lieferantenprodukt finden und dort (oder in der Mediendatenbank von Lieferant A bzw. bei einem Grosshaendler ohne Endkundenshop) farbgenaue Raumbilder suchen. Verwenden bei "Produkte ohne Raumbilder", "Hersteller rausfinden", "Raumbilder beim Hersteller suchen" und bevor fremde Raumbilder an ein Produkt gehaengt werden.
---

# Raumbilder-Recherche: Produkt → Hersteller → Raumbild

Ziel: je **Linie** (nicht je Produkt) belegt klaeren, wer den Boden herstellt, welche
Herstellerfarbe jede Shop-Farbe ist und ob es dafuer ein Raumbild aus einer erlaubten
Quelle gibt. Ergebnis ist eine Zeile in `stand.tsv`, kein Upload.

## Vorher

- `AGENTS.md` Punkt 7 und 8. **Klarnamen von Lieferanten und Herstellern und echte Domains
  nie ins Repository**, nie in Commits, PRs, Issues oder `npm run task`-Notizen.
- Arbeitsordner (lokal, nicht im Repo): `~/teppich-paradies-analyse/raumbilder-recherche/`.
  Dort stehen die Skripte, `QUELLEN.md` (echte Hosts, Ordner-IDs, Herstellertricks) und
  `stand.tsv` (Ergebnis je Linie). **Erst `QUELLEN.md` und `stand.tsv` lesen** – vielleicht
  ist die Linie schon geklaert.
- Python mit `pypdf`, `numpy`, `pillow`: `.venv/bin/python` im Arbeitsordner.

## Erlaubte Bildquellen (in dieser Reihenfolge)

1. **Mediendatenbank von Lieferant A** (Login im Chrome des Inhabers, Claude in Chrome).
   Ordner je Kollektion: `Flaechenbilder` und, falls vorhanden, `Raumbilder`. Technik und
   Auswahlregeln: der Raumbilder-Skill fuer die Mediendatenbank im Claude-Konto.
2. **Hersteller direkt**: Produkt- und Farbseiten, Mediathek, Pressebereich, Bild-CDN.
3. **Herstellerportale und Grosshandel ohne Endkundenshop** (Planer-Datenbanken,
   Haendlerportale).

**Nie**: andere Online-Shops, Marktplaetze, Bildersuche. Rechtlich heikel – auch dann nicht,
wenn dort genau das passende Bild liegt.

## Ablauf

1. **Liste aktualisieren** (nur lesend, ~1 min):
   `python3 medien_holen.py && python3 liste_bauen.py` → `liste.tsv` (aktive Produkte
   ohne Raumbild; Raumbild = Alt oder Dateiname enthaelt `raum`, oder Datei `RB_*`).
   Zubehoer (Leisten, Kleber, Reinigung, Profile, Werkzeug, Unterlagen) zuletzt.
2. **Nach Linie gruppieren**: SKU-Praefix vor dem `_` (z. B. `ABCDEF_4129` → `ABCDEF`).
   Eine Linie = ein Rechercheschritt, auch wenn sie an mehreren Produkten haengt
   (Teppichboden, nach Mass, Muster).
3. **Lieferantenseite lesen**: `.venv/bin/python lieferant_lesen.py <handle> --pdf`.
   Liefert Marke, Qualitaet, Kollektion, Gewicht, Dokumente und den Text von TTD/DOP.
   PDF ohne Text → mit dem Read-Tool als Bild lesen.
4. **Hersteller finden** – Belegkette, nicht Bauchgefuehl:
   - Der **SKU-Praefix** ist oft der Herstellername in Kurzform (ein Kunstwort wie
     „LIN“+„ART“+„MOON“ → Linie „Lino Art Moon“).
   - Die **Leistungserklaerung** nennt meist Lieferant A selbst → kein Beleg.
   - Suchmerkmale aus dem TTD: Oberflaechenvergütung (Markenname!), Aufbau, Staerke,
     Flaechengewicht, Polmaterial, Farbanzahl. Damit **einmal** googeln
     (`WebSearch`, z. B. `"<Vergütung>" Linoleum Jute 2,5 mm`), dann den Treffer auf der
     Herstellerseite gegenpruefen: gleiche Staerke, gleiches Gewicht, gleiche Optik.
   - Zwei unabhaengige Merkmale muessen passen, sonst `Hersteller: offen`.
5. **Farben zuordnen**: Musterbild-URL je Herstellerfarbe in `linien/<PRAEFIX>.tsv`
   (`name<TAB>url`), dann
   `.venv/bin/python farbabgleich.py <handle> linien/<PRAEFIX>.tsv`.
   `SICHER` nur bei dE ≤ 5 **und** zweitbester Treffer mindestens doppelt so weit; das
   Vergleichsblatt `roh/<handle>/vergleich.jpg` immer ansehen. Farbnummern des Lieferanten
   sind oft eigene Nummern – nie fortzaehlen oder umrechnen. Grobe Farbattribute des
   Lieferanten („Blau“, „Gelb Hell“) helfen nur als Gegenprobe.
6. **Raumbilder suchen** fuer jede sichere Farbe – erst Quelle 1, dann 2, dann 3.
   Ein Raumbild zaehlt nur, wenn **erkennbar dieselbe Farbe** liegt. Linienbilder in
   anderen Farben sind kein Raumbild fuer unsere Farbe (die Galerie zeigt ein Bild nur
   bei der Farbe, deren Name im Alt-Text steht).
7. **`stand.tsv` fortschreiben**: Linie, Handles, Hersteller, Herstellerprodukt, Beleg,
   Farbzuordnung, Raumbildquelle (URL), Status, Notiz. Neue Hersteller-Tricks in
   `QUELLEN.md`.

## Danach (eigener Schritt, nicht Teil dieser Recherche)

- Hochladen erst nach Sichtfreigabe des Inhabers an 2–3 Farben (Gedaechtnis:
  „Raumbilder 1:1, nie ohne Sichtfreigabe“). Upload mit
  `~/teppich-paradies-analyse/produktbilder/bilder_hochladen.py`, Alt-Format
  `<Titel> | Farbe: <Option> | Raumbild N (Beispielbild, Farbe kann abweichen)`.
- Bildquelle in `~/teppich-paradies-analyse/bildrechte/bildrechte.csv` eintragen; verlangt
  die Lizenz eine Herstellerangabe am Bild, diese sichtbar machen (`AGENTS.md`, Bilder).
- Medienstatus per `node(id){... on MediaImage{status}}` pruefen, nie am Galerie-Eintrag.

## Fallen

- Herstellerseiten mit Bot-Schutz (403 bei curl): im Browser-Pane oeffnen und die
  Farbseiten per `fetch()` im Seitenkontext lesen; Bild-CDNs sind meist offen.
- Hersteller zeigen Raumbilder oft nur je **Linie**, nicht je Farbe – das ist dann
  „kein farbgenaues Raumbild“, nicht „erledigt“.
- `userErrors: []` ist kein Beleg; Ergebnis immer zuruecklesen.
