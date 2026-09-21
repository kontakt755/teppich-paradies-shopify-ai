# Ratgeber-/Wissensbereich – Informationsarchitektur

Stand 2026-09-21. Entwurf, nichts live. Grundlage fuer `sections/tp-ratgeber-artikel.liquid`,
`sections/tp-ratgeber-uebersicht.liquid` und die Menue-Vorlage
`menu-main-menu-ratgeber-vorlage.md`. Keine Artikeltexte, keine fremden Formulierungen –
nur Struktur.

## Struktur

Hub-Seite → Themencluster → Artikel, wie grosse Fach-/Baumarktseiten es loesen: eine
Uebersichtsseite fasst die Cluster mit je einem Kurztext und einer Linkliste zusammen, jeder
Artikel gehoert genau einem Cluster, verlinkt aber quer wo sinnvoll (z. B. „Ausmessen“ verweist
auf „Ausmessen & Bestellen“ und auf „Verlegen“). Die Uebersicht wird ueber `templates/page.
ratgeber-uebersicht.json`, jeder Artikel ueber `templates/page.ratgeber.json` (Suffix `ratgeber`)
gerendert. Der Menuepunkt „Service & Verlegung“ bekommt die Hub-Seite als neuen Unterpunkt;
das Untermenue der Hub-Seite (oder ein Megamenue-Block) fuehrt zu den Clustern.

## Cluster

1. **Auswaehlen** – welcher Belag fuer welchen Raum, Rollenbreite waehlen, Laufrichtung.
2. **Ausmessen & Bestellen** – richtig ausmessen, Transport.
3. **Vorbereiten** – Untergrund pruefen und vorbereiten.
4. **Verlegen** – zuschneiden, verlegen, Bahnen verbinden, fixieren oder kleben.
5. **Abschluss & Zubehoer** – Teppichfussleisten, Unterlagen.
6. **Pflege** – Reinigung, haeufige Fehler.

## Erweiterbarkeit auf weitere Belaege

Belag (Teppichboden, Vinyl, PVC, Laminat, Parkett) ist eine zweite Achse, kein eigener
Cluster-Satz: dieselben sechs Cluster gelten fuer jeden Belag. Umsetzung als Filter/Tag am
Artikel (z. B. Metafeld oder Tag `belag: teppichboden`), nicht als separater Menuebaum – sonst
verdoppelt sich die Struktur bei jedem neuen Belag. Die Hub-Seite bekommt dafuer einen
Belag-Umschalter, der die Linklisten je Cluster filtert; ohne zweiten Belag bleibt er
ausgeblendet (siehe `tp-ratgeber-uebersicht.liquid`, Setting `belaege`).

## Artikel (Arbeitstitel, Handle, Suchintention, Verknuepfung)

| # | Cluster | Arbeitstitel | Handle-Vorschlag | Suchintention | Verknuepfung |
|---|---|---|---|---|---|
| 1 | Ausmessen & Bestellen | Teppichboden richtig ausmessen | `/pages/ratgeber-teppichboden-ausmessen` | „Wie viel Boden brauche ich, ohne zu wenig zu bestellen?“ | Rechner auf der Produktseite, Kollektion Teppichboden |
| 2 | Auswaehlen | Rollenbreite richtig waehlen | `/pages/ratgeber-rollenbreite-waehlen` | „Welche Breite passt zu meinem Raum, ohne Verschnitt?“ | Kollektion Teppichboden, Musterbestellung `/pages/muster` |
| 3 | Verlegen | Bahnen verbinden – Nadelvlies und Velours | `/pages/ratgeber-bahnen-verbinden` | „Sieht man die Naht, wenn zwei Bahnen zusammenkommen?“ | Verlegeservice-Seite, Kollektion Zubehoer |
| 4 | Vorbereiten | Untergrund fuer Teppich- und Vinylboden vorbereiten | `/pages/ratgeber-untergrund-vorbereiten` | „Muss ich vor dem Verlegen etwas am Boden machen?“ | Verlegeservice-Seite, Aufmass-Anfrage |
| 5 | Abschluss & Zubehoer | Teppichfussleisten passend auswaehlen | `/pages/ratgeber-fussleisten-auswaehlen` | „Welche Leiste passt farblich und technisch zu meinem Boden?“ | Kollektion Bodenleisten |

### Priorisierung (Begruendung)

1. **Ausmessen** zuerst – die haeufigste Fehlbestellung ist eine falsche Menge; ein Artikel kurz
   vor dem Kauf senkt Retouren/Nachbestellungen direkt.
2. **Rollenbreite waehlen** – zweithaeufigste Fehlerquelle bei Rollenware, unmittelbar vor der
   Variantenwahl auf der Produktseite relevant.
3. **Bahnen verbinden** – klaert die haeufigste Vorbehalts-Frage vor dem Kauf ohne Verlegeservice.
4. **Untergrund vorbereiten** – verhindert Reklamationen nach der Lieferung, weniger kaufnah als
   1–3, aber vor dem ersten Verlegetermin entscheidend.
5. **Fussleisten** – Cross-Sell nach der Kaufentscheidung, geringster Bezug zur Fehlbestellung,
   daher zuletzt der ersten Welle.

Weitere Artikel je Cluster folgen in spaeteren Wellen, sobald diese fuenf stehen und verlinkt
sind (Ratgeber → Produkt → Muster/Verlegeservice/Aufmass, und zurueck ueber „Weitere Ratgeber“).
