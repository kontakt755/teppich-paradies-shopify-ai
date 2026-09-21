# Florhoehen-/Arten-Evidenzaudit Teppichboden (SHP-014, Issue #40)

Stand: 2026-09-21. Rein lesend ueber die Shopify Admin API, keine Daten veraendert.
Grundlage: alle 113 Produkte der Kollektion `teppichboden` mit den Metafeldern
`custom.florhohe`, `custom.florhohe_klasse`, `custom.arten`, `custom.fasermaterial`
sowie die Regeln der Unterkollektionen `teppichboden-hochflor`, `-kurzflor`, `-wolle`.

Quelle jeder Zahl ist das gepflegte Metafeld am Produkt. Nichts ist aus Bildern oder
Titeln abgeleitet. Wo ein Feld fehlt, steht "nicht gepflegt" - es wurde nichts ergaenzt.

## 1. Verteilung

| Gruppe | Produkte | `florhohe` gepflegt | `florhohe_klasse` gepflegt |
|---|---|---|---|
| Rollenware (Meterware) | 50 | 50 | 50 |
| Teppichfliesen und -planken | 63 | 48 | **0** |
| Summe | 113 | 98 | 50 |

Florhoehen-Klassen der 50 Rollenwaren:

| Klasse | Produkte | Spanne der gepflegten Florhoehe |
|---|---|---|
| bis 4 mm | 17 | 2,2 - 4 mm |
| 5 - 8 mm | 22 | 4,5 - 8 mm |
| 9 - 12 mm | 8 | 9 - 12 mm |
| ueber 12 mm | 3 | 15 - 19 mm |

Arten (`custom.arten`, Mehrfachnennung moeglich), Rollenware: Schlinge 27, Velours 21,
Wolle 11, Hochflor 9, Kurzflor 1, Nadelvlies 1. Jede Rollenware traegt genau eine
Konstruktionsart (Schlinge, Velours, Kurzflor oder Nadelvlies: 27 + 21 + 1 + 1 = 50);
Wolle und Hochflor kommen zusaetzlich dazu. Die Unterkollektionen sind automatisch
ueber genau dieses Metafeld gebaut; ihre Produktzahlen stimmen damit ueberein
(hochflor 9, wolle 11, kurzflor 1).

## 2. Befunde

**B1 - Die Klassen haben Luecken.** Die vier Klassen heissen "bis 4", "5 - 8", "9 - 12",
"ueber 12". Werte zwischen 4 und 5 mm sowie zwischen 8 und 9 mm haben keine Klasse.
Betroffen ist heute ein Produkt: `ombra-teppichboden-400cm-500cm` mit 4,5 mm, einsortiert
in "5 - 8 mm". Das ist vertretbar, aber nirgends als Regel festgehalten. Vorschlag: Regel
aufschreiben ("ab 4,1 mm zaehlt zur naechsten Klasse") oder die Klassen lueckenlos
benennen ("bis 4", "ueber 4 bis 8", ...). Entscheidung Inhaber, weil es die sichtbaren
Filterwerte aendert.

**B2 - Hochflor ist konsistent, "Mittelflor" gibt es nicht.** Alle 9 Hochflor-Produkte
haben 10 mm Florhoehe oder mehr (10 / 11,5 / 11,5 / 12 / 12 / 12 / 15 / 18 / 19 mm). Die
zwei Produkte mit 9 mm (`vireno`, `kerova`) tragen Hochflor nicht. Die gelebte Schwelle ist
also 10 mm und wird ausnahmslos eingehalten. Eine Art "Mittelflor" existiert im Datenmodell
nicht; der Backlog-Punkt "Hochflor-/Mittelflor-Zuordnung" laesst sich erst bearbeiten, wenn
der Inhaber festlegt, ob es diese Art geben soll (naheliegend waere 5 - 9 mm).

**B3 - Kurzflor ist als Art praktisch unbenutzt.** Nur `kontura-teppichboden` (3,4 mm)
traegt die Art Kurzflor; die Unterkollektion `teppichboden-kurzflor` hat deshalb genau ein
Produkt. Gleichzeitig haben 17 Rollenwaren eine Florhoehe bis 4 mm. Entweder ist Kurzflor
eine Konstruktionsart (dann stimmt der eine Eintrag und die Kollektion ist zu duenn fuer
einen Menuepunkt) oder eine Hoehenangabe (dann fehlen bis zu 16 Zuordnungen). Nicht
geraten, nicht geaendert - Fachfrage an den Inhaber.

**B4 - Fliesen und Planken fehlen im Florhoehen-Filter.** Keine der 63 Fliesen/Planken
hat `florhohe_klasse`. Auf `/collections/teppichboden` gibt es einen Florhoehen-Filter;
wer ihn benutzt, blendet damit alle Fliesen aus, obwohl 48 davon eine Florhoehe gepflegt
haben. Die Klasse liesse sich fuer diese 48 rein rechnerisch aus dem vorhandenen Wert
ableiten (keine neue Produkteigenschaft, nur die Einordnung eines belegten Werts) - das
ist ein Shopify-Schreibvorgang ueber 48 Produkte und braucht die Freigabe des Inhabers.

**B5 - 15 Fliesen ohne Florhoehe.** `quadra`, `basalta`, `granova`, `karvena`, `titarno`,
`titanea`, `cosvena`, `lanvira`, `levora`, `melbara`, `optivia`, `rapidia`, `elevara`,
`interlana`, `intervana`. Fuenf davon sind Nadelvlies (`quadra`, `granova`, `karvena`,
`titarno`, `titanea`) - dort gibt es konstruktionsbedingt keinen Flor, das Feld ist zu
Recht leer. Bei den uebrigen zehn ist offen, ob der Wert fehlt oder nicht existiert:
nur aus dem Datenblatt des Lieferanten zu klaeren.

**B6 - Wolle: vier statt drei Produkte ohne Fasermaterial.** Die Art "Wolle" tragen 11
Produkte. `custom.fasermaterial` fehlt bei `wovena`, `callista`, `rubira` (bekannt, steht
in `docs/shop-offene-fragen.md`) **und bei `nordica`** (neu). Die Anzeige faellt dort auf
die Art zurueck, falsch ist nichts - aber die Liste fuer den Inhaber ist um ein Produkt
zu kurz.

**B7 - "ecoVella" kommt im Shop nicht vor.** Die Produktsuche ueber die Admin API findet
zu "ecovella" kein einziges Produkt. Der Backlog-Punkt "ecoVella-/Wolle-Zuordnung pruefen"
hat damit heute keinen Gegenstand. Verwandt und geprueft: 18 Fliesen/Planken nennen eine
regenerierte Polyamid-Markenfaser (Suchbegriff "econyl"); keine davon traegt die Art
"Wolle". Eine Verwechslung Kunstfaser/Wolle liegt in den Daten nicht vor.

## 3. Unklare Faelle (nicht veraendert)

| Fall | Warum unklar | Wer klaert |
|---|---|---|
| Klassenluecken 4-5 mm und 8-9 mm (B1) | Regel nicht festgehalten | Inhaber |
| Kurzflor: Art oder Hoehe? (B3) | Fachbegriff, zwei Lesarten | Inhaber |
| Art "Mittelflor" einfuehren? (B2) | existiert nicht im Datenmodell | Inhaber |
| 10 Fliesen ohne Florhoehe (B5) | Wert nur im Lieferantendatenblatt | Inhaber / Datenblatt |
| Fasermaterial wovena, callista, rubira, nordica (B6) | Faser nicht belegt | Inhaber / Datenblatt |

## 4. Was ohne Entscheidung moeglich waere

Nur B4 (Klasse fuer 48 Fliesen aus dem gepflegten Wert ableiten). Alles andere braucht
eine fachliche Festlegung. Auch B4 wurde nicht ausgefuehrt: Massenaenderung an
Produktdaten nur nach Freigabe.
