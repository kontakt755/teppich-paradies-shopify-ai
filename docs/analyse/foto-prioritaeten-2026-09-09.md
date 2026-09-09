# Fotos: Prioritäten und Alt-Text-Schema (Maßnahme 11)

Stand 2026-09-09. Gehört zu `SHOP_ANALYSE_2026-09-09.md`, Maßnahme 11.
Regeln zum Fotografieren stehen in `qa/PHOTO_ROLLOUT_CHECKLIST.md`; hier steht,
**welche Produkte zuerst** und **wie die Bilder danach eingepflegt werden**.

## Was die Daten hergeben

Shopify liefert aus der Remote-Session keine Produktaufrufe, nur Einstiege
(Landingpages) und Warenkorb-Aktionen je Pfad. Über 365 Tage sind das für
Produktseiten insgesamt 473 Einstiege — und die Hälfte davon entfällt auf
Produkte, die es nicht mehr gibt (Softiq, Veluxe, Tavora, Floresta, Aluvia,
Solterra, Ecovella, Comflor-Bahnenware). Eine „Top 20 nach Besuchen" ist damit
nicht seriös. Die Priorität kommt deshalb aus drei Quellen:

1. Produkte mit Warenkorb-Signal oder Einstiegen, die es noch gibt.
2. Der Bildstand: **289 aktive Vinylprodukte haben genau ein Bild** (das Dekor),
   Teppichboden und Linoleum haben 5–19 Bilder je Farbe.
3. Die Kategorie mit dem meisten Traffic ist Teppichboden — dort sind die
   Galerien schon voll, dort fehlen eher Raumbilder als Farbfotos.

## Liste A — Produkte mit Signal (zuerst)

| Produkt | Einstiege 365 d | Warenkorb | Bilder heute | Was fehlt |
|---|---|---|---|---|
| Fortiva Teppichboden 200cm | 5 | 2 | 13 | Raumbild |
| Torvana Teppichboden 400cm 500cm | 7 | 1 | 18 | Raumbild |
| Verano Teppichboden 400cm 500cm | 3 | 1 | 10 | Raumbild |
| Alvora Eiche Bernstein Klebevinyl | 4 | 1 | **1** | Raum, Struktur, Aufbau |
| Piumera Teppichboden 400cm 500cm | 12 | 0 | 14 | Raumbild |
| Vireno Teppichboden 400cm 500cm | 7 | 0 | 14 | Raumbild |
| Sentira Teppichboden 400cm 500cm | 6 | 0 | 15 | Raumbild |
| Solenta Schiefer Grau Klebevinyl | 6 | 0 | **1** | Raum, Struktur, Aufbau |
| Solenta Buche Blond Klebevinyl | 5 | 0 | **1** | Raum, Struktur, Aufbau |
| Solenta Eiche Hell Klebevinyl | 4 | 0 | **1** | Raum, Struktur, Aufbau |
| Alvento Teppichboden 400cm 500cm | 5 | 0 | 16 | Raumbild |
| Zafira Teppichboden 400cm 500cm | 5 | 0 | 9 | Raumbild |
| Marano Eiche Perlgrau Rollenvinyl (Linie Terracora) | 3 | 0 | **1** | Raum, Struktur, Aufbau |
| Marano Eiche Rauchgrau Rollenvinyl (Linie Terracora) | 3 | 0 | **1** | Raum, Struktur, Aufbau |

## Liste B — Vinyl-Linien nach Größe (ein Shooting deckt viele Produkte)

Bei Klick-, Klebe- und Rollenvinyl ist jede Farbe ein eigenes Produkt. Ein
Raum- und ein Strukturfoto **je Linie** (im meistverkauften Dekor) lässt sich
mit passendem Alt-Text auf alle Farben der Linie legen und schließt die
größte Lücke mit dem geringsten Aufwand.

| Linie | Typ | Produkte mit nur 1 Bild |
|---|---|---|
| Dornova | Klebevinyl | 43 |
| Solenta | Klebevinyl | 39 |
| Terracora (Handles `marano-*`) | Vinyl von der Rolle | 28 |
| Alvora | Klebevinyl | 22 |
| Odense | Klickvinyl | 22 |
| Bergen | Klickvinyl | 15 |
| Granitera (Handles `traxano-*`) | Vinyl von der Rolle | 13 |
| Eichwald (Handles `verdano-*`) | Vinyl von der Rolle | 12 |
| Landora (Handles `livano-*`) | Vinyl von der Rolle | 10 |
| Porto, Verona | Klickvinyl | je 10 |
| Amara, Marlow, Turku | Klebe-/Klickvinyl | je 8 |

Reihenfolge nach Hebel: Dornova → Solenta → Terracora → Alvora → Odense →
Bergen. Sechs Shootings decken 169 Produkte.

## Alt-Text-Schema (wird nach dem Upload per API gesetzt)

Muster: `<Linie> <Dekor/Farbe> <Produktart> – <Bildart>`

| Bildart | Beispiel |
|---|---|
| Hauptbild | `Alvora Eiche Bernstein Klebevinyl – Dekor` |
| Raum | `Alvora Eiche Bernstein Klebevinyl – Wohnzimmer` |
| Struktur | `Alvora Eiche Bernstein Klebevinyl – Oberfläche Nahaufnahme` |
| Aufbau | `Alvora Eiche Bernstein Klebevinyl – Aufbau und Rücken` |
| Teppichboden je Farbe | `Piumera Teppichboden Taupe Dunkel – Farbe` (heute: `… Farbe 21`, Nummer raus) |

Keine Lieferantencodes, keine Keyword-Ketten, deutsch, ohne Punkt am Ende.

## Ablauf nach dem Shooting

1. Ahmet lädt die Bilder je Produkt im Admin hoch (Reihenfolge Hauptbild,
   Raum, Struktur, Aufbau). Dateinamen: `linie-dekor-raum.jpg` usw.
2. Der Agent setzt die Alt-Texte per `fileUpdate` nach dem Schema oben und
   kopiert bei Linien-Shootings Raum- und Strukturbild auf alle Farben der
   Linie (`productCreateMedia` mit derselben Datei-URL).
3. Gegenprüfung: `mediaCount` je Produkt ≥ 3, kein Alt-Text leer, Stichprobe
   Desktop und 390-px-Mobile.

## Nebenbefund aus den Einstiegsdaten

Die meistbesuchten Produktseiten des letzten Jahres existieren nicht mehr und
haben keine Weiterleitung (Softiq, Veluxe, Tavora, Floresta, Aluvia, Solterra,
Ecovella, Morvano, Seleno, Lumora, Naturaline, Manda, Banta, elf Comflor-
Bahnenware-Produkte, `muster-teppich`). Die bestehenden `*-kopie`-
Weiterleitungen zeigen ebenfalls auf diese gelöschten Handles. Wird in
derselben Session per Redirect auf die passenden Kollektionen korrigiert.
