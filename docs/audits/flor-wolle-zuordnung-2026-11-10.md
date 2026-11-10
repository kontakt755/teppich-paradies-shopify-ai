# Hochflor/Mittelflor und Wolle: Zuordnung im Sortiment (2026-11-10)

Nur gelesen. In Shopify wurde nichts geschrieben, am Theme nichts geändert.
Dieser Bericht ist ein Vorschlag; über das Schreiben entscheidet der Inhaber.

- **Stand:** Shopify Admin API am 2026-11-10, 09:30 UTC, nur Abfragen
  (Shopify CLI und MCP). `productsCount(query:"product_type:Teppichboden")` = 392,
  geladen 392 (374 aktiv, 12 archiviert, 6 Entwurf).
- **Bewertet:** 305 aktive Rollenwaren (Typ Teppichboden, Titel ohne
  „fliese/planke“). Die 69 aktiven Fliesen und Planken schließt jede der
  Kategorien per Regel aus.
- **Belege:** Abgleiche vom 08.10., 26.10. und 06.11. (technische Datenblätter und
  Herstellerkataloge, lokal im Privatordner). Für Lieferant D wurde nicht erneut
  nach mm gesucht (dreimal ohne Ergebnis geprüft, zuletzt 09.11.).
- **Liste je Produkt:** `flor-wolle-stand-2026-11-10.csv` im Privatordner
  `flor-wolle-2026-11-10/` (359 Zeilen: 305 Flor, 54 Wolle; nicht im Repository,
  weil sie Lieferantennamen enthält).

## 1. Kurzfassung

| | Flor (305) | Wolle (54 mit Wollhinweis) |
|---|---|---|
| passt | 184 | 47 in der Kategorie, 5 zu Recht nicht |
| falsch zugeordnet | 0 | 0 |
| doppelt zugeordnet | 0 | – |
| nicht zugeordnet, aber belegt | **65** (Lieferant D) | 0 |
| ohne Beleg | **12** | 2 (Ziegenhaar, Entscheidung) |
| zu Recht ohne Kategorie | 44 (kein Flor) | – |

- Die Regel für Kurz-/Mittel-/Hochflor ist stimmig und wird eingehalten. Kein
  Produkt steht in der falschen oder in zwei Höhenkategorien.
- Das Loch sind weiter die **65 Teppichböden von Lieferant D**: Der Hersteller
  nennt nur „flacher / mittlerer / hoher Flor“, keine mm. Die Klasse steht seit
  04.11. im Feld `custom.florklasse`, die Kategorien filtern aber noch auf mm.
  Deshalb stehen die 65 in keiner Höhenkategorie. Die Umstellung hat der Inhaber
  am 28.10. entschieden (Werkbank w-178); sie ist vorbereitet und nicht ausgeführt.
- **Wolle ist sauber.** Alle 47 Produkte der Kategorie haben laut Lieferant
  mindestens 55 % Wolle im Flor.
- **ecoVella gibt es im Shop nicht** (0 Produkte, keine Kollektion). Der
  Backlog-Punkt hat keinen Gegenstand.

## 2. Woran die Kategorien heute hängen

Alle Kategorien sind automatische Kollektionen (alle Bedingungen müssen gelten),
jeweils mit „Produkttyp = Teppichboden“ und „Titel enthält nicht fliese, planke“.

| Kollektion | Bedingung | Produkte (davon aktiv) |
|---|---|---|
| `teppichboden-kurzflor` | `custom.florhoehe_mm` < 5,01 | 82 (80) |
| `teppichboden-mittelflor` | `custom.florhoehe_mm` > 5,0 und < 10,0 | 85 (80) |
| `teppichboden-hochflor` | `custom.florhoehe_mm` > 9,99 | 34 (34) |
| `teppichboden-wolle` | `custom.arten` enthält „Wolle“ | 47 (47) |
| `teppichboden-sisal` | `custom.fasermaterial` enthält „Sisal“ | 27 (27) |

Nicht aktiv, aber in den Zählungen enthalten: 6 archivierte Produkte (2 Kurzflor,
4 Mittelflor) und 1 Restrolle im Entwurf (Mittelflor). Im Shop sind sie unsichtbar.

Daten je Produkt (aktive Rollenware):

| Feld | gefüllt | Bemerkung |
|---|---|---|
| `custom.florhoehe_mm` (Zahl) | 194 | Polhöhe laut Datenblatt; steuert Kategorien, Florhöhen-Filter und Kartenzusatz |
| `custom.florklasse` (Text) | 249 | 111 Kurzflor, 93 Mittelflor, 45 Hochflor; **ohne Metafeld-Definition**, von keiner Regel und keiner Theme-Datei gelesen |
| `custom.florhohe` (Text, Anzeige) | – | Anzeige „5 mm“; folgt dem mm-Feld |
| `custom.florhohe_klasse` (Auswahl „bis 4 mm …“) | – | Altfeld, liest niemand |
| `custom.arten` | – | steuert die Woll-Kategorie |
| `custom.fasermaterial`, Tags `material: …` | – | Materialfilter; an den Tags hängt keine Kollektion |

## 3. Vorgeschlagene Regel

### Kurzflor / Mittelflor / Hochflor

| Kategorie | Grenze (Florhöhe = Polhöhe, nicht Gesamthöhe) | Herstellerklasse ohne mm |
|---|---|---|
| Kurzflor | bis einschließlich 5,0 mm | „flacher Flor“ |
| Mittelflor | über 5,0 bis unter 10,0 mm | „mittlerer Flor“ |
| Hochflor | ab 10,0 mm | „hoher Flor“ |

- **Quelle der Grenzen:** 5 mm ist die Inhaberentscheidung vom 07.10.2026
  („Mittelflor 5 bis 10 mm“). 10 mm als Hochflor-Schwelle ist bei Teppichboden
  üblich (Baunetzwissen, Glossar „Saxony“: „Florhöhe ab 10 mm“). Eine Norm mit
  mm-Grenzen gibt es nicht.
- **Regel bleibt, das Feld wechselt:** Die Kategorien sollen auf
  `custom.florklasse` filtern. Die Klasse wird aus den mm gerechnet, wo mm belegt
  sind, und sonst aus der Herstellerangabe übernommen (Inhaber 28.10., w-178).
  Bei allen 184 Produkten mit beiden Angaben stimmen mm-Regel und Klasse überein.
- **Grenzwerte:** 14 Produkte haben genau 5,0 mm (Kurzflor), 5 genau 10,0 mm
  (Hochflor). Beides wie heute.
- **Ohne Flor keine Kategorie:** Nadelvlies, Flachgewebe (Sisal, Kokos, Webware)
  und Schlingen ohne Polhöhe im Datenblatt bleiben draußen.

### Wolle

In „Teppichboden Wolle“ gehört ein Teppichboden, dessen Flor laut Lieferant
**mindestens 50 % Wolle** enthält. Quelle der Grenze: Woolmark-Blend-Siegel für
Bodenbeläge (Spezifikation F-5, ab 50 % Schurwolle). Technisch bleibt es bei
`custom.arten` = Wolle.

## 4. Ergebnis je Fall

### Flor (305 aktive Rollenwaren)

| Fall | Anzahl | Wer |
|---|---|---|
| passt (in der Kategorie, die mm und Klasse verlangen) | 184 | 78 Kurz, 76 Mittel, 30 Hoch; 183 mit Datenblatt, 1 über den Namen zugeordnet (Sonderposten von Lieferant E, 9 mm) |
| nicht zugeordnet, Herstellerklasse belegt | 65 | Lieferant D: 33 Kurz, 17 Mittel, 15 Hoch |
| ohne Beleg, heute über Shop-mm in einer Kategorie | 10 | 9 Restrollen (eigene Zollstock-Messung vom 28.10.) und Rubira (Datenblatt nennt zwei Höhen, 5,0 / 8,5 mm) |
| ohne Beleg, in keiner Kategorie | 2 | zwei Qualitäten von Lieferant D (Hersteller nennt keine Florklasse) |
| zu Recht ohne Kategorie | 44 | 13 Nadelvlies, 25 Schlinge/Flachgewebe (Sisal, Kokos, Webware, drei Schlingen von Lieferant A), 6 ohne Konstruktionsangabe |
| falsch oder doppelt zugeordnet | 0 | – |

Wirkung der Umstellung auf `custom.florklasse`:

| Kategorie | aktiv heute | nach Umstellung | mit den 10 unbelegten |
|---|---|---|---|
| Kurzflor | 80 | 111 | 113 |
| Mittelflor | 80 | 93 | 97 |
| Hochflor | 34 | 45 | 49 |

Ohne Entscheidung zu den 10 unbelegten fallen sie bei der Umstellung aus ihrer
Kategorie (2 Kurz, 4 Mittel, 4 Hoch), weil sie keine Klasse tragen.

### Wolle (54 aktive Teppichböden mit Wollhinweis in Art, Faser oder Tag)

| Fall | Anzahl | Wer |
|---|---|---|
| in der Kategorie, Wolle belegt | 47 | 43 × 100 % Wolle, 1 × 70 % Schurwolle + 30 % Ziegenhaar, 2 × 80 %, 1 × 55 % |
| zu Recht nicht in der Kategorie (unter 50 %) | 5 | Sisal-Woll-Mischungen mit 20–40 % Wolle (1 von Lieferant D, 4 von Lieferant H); alle stehen in „Sisal“ |
| unklar, Entscheidung | 2 | Ziegenhaar-Ware: 80 % Kaschmir-Ziegenhaar + 20 % Schurwolle bzw. 70 % Ziegenhaar + 30 % Polyamid |
| in der Kategorie ohne Beleg / falsch / fehlend | 0 | – |

Materialangabe und Zuordnung passen zusammen: Alle 47 tragen Schurwolle oder
Wolle im Fasermaterial und einen Woll-Tag. Kleine Uneinheitlichkeiten ohne
Wirkung auf die Kategorie:

- 3 Produkte führen das Fasermaterial „Wolle“, 44 „Schurwolle“ (Datenblatt sagt
  „WO“, also richtig). Im Materialfilter sind das zwei Werte.
- 2 Produkte tragen nur `material: schurwolle`, nicht `material: wolle`.

Seit dem Abgleich vom 26.10. erledigt: die 40-%-Mischung ist aus der Kategorie
genommen, die vier fehlenden Tags sind gesetzt.

### ecoVella

`productsCount(query:"ecovella")` = 0, kein Treffer in Titel, Tags oder
Metafeldern der 392 Teppichböden, keine Kollektion. Ein früheres Produkt dieses
Namens wurde gelöscht.

## 5. Änderungen aus belegten Daten (nicht ausgeführt)

Schreibplan mit Rückweg und Gegenprobe liegt seit 06.11. im Privatordner
(`florklasse-2026-11-04/stand-2026-11-06/schreibplan/`). Vor dem Schreiben neu
lesen; die Mutationen sind nur gegen das Schema geprüft, nicht am Server erprobt.

1. **Metafeld-Definition `custom.florklasse` anlegen** (Auswahl
   Kurzflor/Mittelflor/Hochflor, als Kollektionsbedingung nutzbar). Alle 249
   vorhandenen Werte passen in die Auswahl.
2. **Drei Kategorieregeln umstellen** von `florhoehe_mm` auf `florklasse`.
   Wirkung: 65 Produkte von Lieferant D kommen in die Kategorien (33/17/15),
   6 archivierte und 1 Entwurf fallen heraus. Erst Hochflor, zählen, dann die beiden anderen.
3. **Produkttexte angleichen:** Torvana nennt im Text 5,6 mm (Feld und
   Datenblatt 5,0), Aurelis 18,5 mm (Feld und Datenblatt 18,0). Vier Produkte
   (je Teppichboden und Teppich nach Maß), sieben Textstellen.
4. **Im Repository vor Schritt 2:** `operations/lib/restrolle-neu.mjs` und der
   Skill `produktimport` setzen heute nur `florhoehe_mm`. Ohne Nachzug fehlt
   jedes neue Produkt nach der Umstellung in den Kategorien. Eigener PR.

Bewusst nicht Teil davon: Der Florhöhen-Filter und der Kartenzusatz
„Kurzflor/Hochflor“ lesen weiter mm (`snippets/tp-flor-navigation.liquid`,
`tp-card-roll-widths.liquid`, `tp-filter-wertgruppen.liquid`,
`sections/tp-boden-finder.liquid`). Die 65 Produkte stehen dann in den
Kategorien, aber nicht im Filter. mm werden nicht geschätzt.

## 6. Unklare Fälle (nichts vorgeschlagen ohne Entscheidung)

| Fall | Warum unklar |
|---|---|
| 9 Restrollen | Florhöhe nur aus eigener Messung (±1 mm); vorhandene Datenblätter passen nicht sicher zur Charge |
| Rubira | Struktur-Schlinge mit zwei Polhöhen (5,0 / 8,5 mm); Shop führt 5,0 → Kurzflor |
| zwei Qualitäten von Lieferant D | Hersteller nennt weder mm noch Florklasse |
| 67 Teppichböden von Lieferant D ohne mm | Datenblätter mit Polhöhe fordert der Inhaber an; bis dahin kein Florhöhen-Filter |
| 2 Ziegenhaar-Teppichböden | Naturhaar, aber höchstens 20 % Schurwolle |

## 7. Entscheidungen für den Inhaber

1. **Belegte Änderungen schreiben** (Abschnitt 5, Schritte 1–3)? Empfehlung: ja,
   aber erst ab 01.12.2026 nach der Black Week, mit Schritt 4 vorab.
2. **Restrollen und Rubira:** Klasse aus der eigenen Messung bzw. dem Shopwert
   setzen (2 Kurz, 4 Mittel, 4 Hoch)? Empfehlung: ja, sonst verschwinden zehn
   aktive Produkte bei der Umstellung aus den Höhenkategorien. Im Protokoll
   stehen sie als „eigene Messung“, nicht als Herstellerbeleg.
3. **Ziegenhaar in „Wolle“?** Empfehlung: nein, die Regel bleibt „mindestens
   50 % Wolle“. Beide Produkte sind über die Marke und den Materialfilter
   auffindbar.
4. **Backlog:** „ecoVella-/Wolle-Zuordnung sauber prüfen“ aus `AGENTS.md`
   streichen (geprüft, kein Gegenstand) und „Hochflor-/Mittelflor-Zuordnung“ auf
   „Umstellung auf Florklasse ausführen“ kürzen? Empfehlung: ja, mit der
   Umsetzung von Punkt 1.

## 8. Nicht geprüft

- Teppich nach Maß und Wohnteppiche: Für sie gibt es keine Höhen- oder
  Woll-Kategorie. Stand vom 26.10. und 09.11. unverändert übernommen.
- Die Belege wurden nicht neu beim Lieferanten abgerufen, sondern aus den
  Abgleichen vom 08.10., 26.10. und 06.11. übernommen. Vier seit dem 07.11. neue
  Sisal-Woll-Böden wurden gegen die lokalen Importdaten geprüft.
- Die Storefront wurde nicht aufgerufen; die Zahlen stammen aus der Admin API.
