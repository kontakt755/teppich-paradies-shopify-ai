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

## Ablauf (Gesamtlauf, alles im Arbeitsordner)

1. **Stand je Farbe** (nur lesend): `python3 medien_holen.py && .venv/bin/python -I farben_stand.py`
   → `farben.tsv` (je aktiver Farbe: eigenes Raumbild / Linienbild / keins). Ein Bild zaehlt als
   Raumbild, wenn Alt oder Dateiname `raum`/`RB_` enthaelt, der Alt die Farbe oder
   `Farbnr. <SKU-Endung>` nennt, oder `bildart.py` es am Inhalt erkennt (Fotos mit „Ansicht 2“).
   „Teppich nach Mass“ ist ausgenommen (dort laufen die Kettelbilder).
2. **Mediendatenbank A komplett indexieren** (einmal je Lauf, ~30 min, im eingeloggten Tab per
   Seitenschnittstelle, Ergebnis als Download) → `mdb_index.tsv`; dann `python3 mdb_abgleich.py`
   → `mdb_treffer.tsv`. Treffer gelten nur im Ordner der passenden Warengruppe (gleiche Nummern
   kommen in Tapeten, Tueren und anderen Bodenlinien wieder vor).
3. **Recherche je Warengruppe parallel** an Agenten geben: Eingaben `gruppen/<gruppe>.tsv`,
   Auftrag `AGENT-AUFTRAG.md`, Ergebnis `ergebnisse/<gruppe>.tsv` (+ `-linien.tsv`).
4. **Plan bauen**: `.venv/bin/python -I plan_aus_ergebnissen.py <gruppe> …` – nur `sicher`,
   max. 3 Raum + 2 Detail je Farbe, ohne `sperre.tsv`, ohne Bilder < 1000 px
   (`zu_klein_*.json`), ohne Sammelbilder (gleiche URL bei mehreren Farben eines Produkts),
   ohne flache Musterflaechen als „Detail“.
5. **Sichtpruefung** jedes Plans: `.venv/bin/python -I blatt_bauen.py plan_….tsv <praefix>` und
   alle Blaetter in `blatt/` ansehen; Fehltreffer in `sperre.tsv`.
6. **Hochladen**: `python3 hochladen_raum.py plan_….tsv` (Trockenlauf) und mit `--ausfuehren`.
   Das Skript laedt jedes Bild lokal, verkleinert auf ≤ 4000 px, prueft per Bildvergleich auf
   Dubletten am Produkt, laedt per Staged Upload, wartet auf READY, sortiert (Farbprodukte:
   Raumbilder vorn in Farbreihenfolge; Einzeldekore: Flaechenbild bleibt Bild 1) und traegt
   `bildrechte.csv` nach. Erst ein Produkt testen, dann den Rest.
7. **Warteschlange fuer den Bilder-Chat**: `.venv/bin/python -I warteschlange_bauen.py` →
   `~/teppich-paradies-analyse/produktbilder/raumbilder-warteschlange/warteschlange.tsv`
   (Auftrag dort in `AUFTRAG.md`). Jede Farbe ohne echtes Raumbild landet dort:
   Prio 1 = Raumbild einer Schwesterfarbe im Shop, Prio 2 = Herstellerbild der Linie in
   anderer Farbe, Prio 3 = ohne Vorlage. Der Bilder-Chat erzeugt daraus per Higgsfield
   umgefaerbte Raumbilder; diese Recherche erzeugt selbst keine KI-Bilder.

## Einzelne Linie von Hand

1. **Lieferantenseite lesen**: `.venv/bin/python lieferant_lesen.py <handle> --pdf`.
   Liefert Marke, Qualitaet, Kollektion, Gewicht, Dokumente und den Text von TTD/DOP.
   PDF ohne Text → mit dem Read-Tool als Bild lesen.
2. **Hersteller finden** – Belegkette, nicht Bauchgefuehl:
   - Der **SKU-Praefix** ist oft der Herstellername in Kurzform (ein Kunstwort wie
     „LIN“+„ART“+„MOON“ → Linie „Lino Art Moon“).
   - Die **Leistungserklaerung** nennt meist Lieferant A selbst → kein Beleg. Die
     Lieferantenkategorie (z. B. „Linoleum <Hersteller>“) und Oberflaechen-Markennamen schon.
   - Suchmerkmale aus dem TTD: Oberflaechenvergütung, Aufbau, Staerke, Flaechengewicht,
     Polmaterial, Farbanzahl. Damit **einmal** suchen, dann auf der Herstellerseite gegenpruefen.
   - Zwei unabhaengige Merkmale muessen passen, sonst `Hersteller: offen`.
3. **Farben zuordnen**: `linien/<PRAEFIX>.tsv` (`name<TAB>musterbild-url`), dann
   `.venv/bin/python farbabgleich.py <handle> linien/<PRAEFIX>.tsv`. `SICHER` nur bei
   dE ≤ 5 **und** Zweitbester mindestens doppelt so weit; Vergleichsblatt ansehen. Endziffern
   der Lieferanten-Farbnummer = Herstellercode ist ein Indiz, kein Beweis.
4. **Raumbild zaehlt nur, wenn erkennbar dieselbe Farbe liegt.** Linienbilder in anderen
   Farben gehen als Vorlage in die Warteschlange.

## Fallen

- Echte Herstellerfotos der exakten Farbe duerfen direkt hoch (Inhaber hat die Freigabe der
  Hersteller, Gedaechtnis `hersteller_bildfreigabe`). KI-Bilder nie aus dieser Recherche.
- Viele Farben haben schon Fotos mit Alt „Ansicht 2“ oder „Raumbeispiel (Farbnr. …)“ –
  ohne Bildvergleich entstehen Dubletten.
- Nummernkollisionen: gleiche Dekornummer in anderer Linie, Tapete oder Tuer. Nur im Ordner
  der passenden Warengruppe suchen und das Blatt ansehen.
- `_mild` ist kein Milieu (`_mil`), `_mus` ist ein Musterbild, `_tep`/`_tap`/`_vog` zeigen
  fremde Produkte.
- Originale der Mediendatenbank haben oft 35–100 MP; Shopify nimmt max. 25 MP/20 MB –
  deshalb immer lokal verkleinern und per Staged Upload laden.

- Herstellerseiten mit Bot-Schutz (403 bei curl): im Browser-Pane oeffnen und die
  Farbseiten per `fetch()` im Seitenkontext lesen; Bild-CDNs sind meist offen.
- Hersteller zeigen Raumbilder oft nur je **Linie**, nicht je Farbe – das ist dann
  „kein farbgenaues Raumbild“, nicht „erledigt“.
- `userErrors: []` ist kein Beleg; Ergebnis immer zuruecklesen.
