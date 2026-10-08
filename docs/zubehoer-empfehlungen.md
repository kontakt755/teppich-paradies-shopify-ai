# Passendes Zubehör auf Bodenseiten – Regelwerk

Stand: 2026-10-08. Umsetzung: `blocks/tp-zubehoer-empfehlung.liquid`
(Produkt-Templates `planken`, `rolle`, `fliese`, `einfassung`,
`wunschmass-fertig`, `dekofell`). Der Test
`qa/tests/zubehoer-empfehlung.test.mjs` gleicht Block und diese Tabelle ab:
jede Regel und jeder Zubehör-Handle im Block muss hier stehen und umgekehrt.

## Grundsatz

Eine Empfehlung erscheint nur, wenn **beides** belegt ist:

1. **Bodenart und Verlegeart des Bodens** aus den Produktdaten –
   `product.type`, Metafeld `custom.belagsart`, Tag `art: teppichfliese`,
   `custom.ruckenausstattung`, `custom.trittschallverbesserung`.
2. **Eignung des Zubehörs** für genau diese Bodenart – aus der
   Produktbeschreibung des Zubehörs (Zeile „Eignung“ und „Herstellerangaben“,
   übernommen aus dem Herstellerdatenblatt beim Import).

Trifft keine Regel zu, rendert der Block nichts. Es gibt keinen Fallback und
keine pauschale Liste. Gezeigt werden nur veröffentlichte und lieferbare
Zubehörprodukte aus ihren Smart-Collections (`zubehoer-verlegeunterlagen`,
`zubehoer-kleber-fixierung`, `zubehoer-verlegeband`). Entwürfe fallen still weg.

Die Empfehlung ist ein Link auf die Zubehörseite, kein direkter
Warenkorb-Knopf: Unterlagen und Kleber werden je m², je lfm oder je Gebinde
verkauft, die Menge rechnet dort die Mengenhilfe (`blocks/tp-zubehoer-menge`).
Paketrechner, Rollenrechner und Warenkorblogik des Bodens bleiben unberührt.

## Wie der Boden eingeordnet wird

Daten-Stand 2026-10-08, Admin API, aktive Produkte.

| Regel | Bedingung im Code | Produkte |
|---|---|---|
| `laminat-klick` | Typ `Laminat`, `belagsart` enthält „Klicksystem“, keine belegte Dämmung am Boden | 74 |
| `parkett-2schicht-kleben` | Typ `Parkett`, `belagsart` „Fertigparkett 2-Schicht (zum Verkleben)“ | 55 |
| `parkett-massiv-kleben` | Typ `Parkett`, `belagsart` enthält „massiv“ und „zum Verkleben“ (Massiv-, Mosaik-, Hochkantparkett) | 11 |
| `klickvinyl-ohne-daemmung` | Typ `Klickvinyl`, `belagsart` „Klick-Vinyl …“, **und** `custom.daemmung_integriert` = false, keine belegte Dämmung | 0 (Feld fehlt, siehe unten) |
| `klebevinyl` | Typ `Klebevinyl`, `belagsart` enthält „zum Vollverkleben“ | 179 |
| `vinyl-rolle` | Typ `Vinyl von der Rolle`, Tag `material: pvc` | 118 |
| `teppichboden-rolle-textil` | Typ `Teppichboden`, kein Tag `art: teppichfliese`, Rücken enthält „Textil“ oder „Vlies“, keine belegte Dämmung | 87 |
| `teppichboden-rolle` | Typ `Teppichboden`, kein Tag `art: teppichfliese`, übrige Rücken | 28 |
| `teppichfliese` | Typ `Teppichboden`, Tag `art: teppichfliese` | 62 |
| `teppich-lose` | Typ `Teppich nach Maß`, `Wohnteppich` oder `Teppich` | 201 |

„Belegte Dämmung am Boden“ heißt: `custom.trittschallverbesserung` ist gesetzt
oder die Beschreibung nennt „IXPE“, „Trittschalldämmung“, „Dämmschicht“,
„Dämmunterlage“ oder „Korkrücken“. Dann wird keine zusätzliche Unterlage
empfohlen.

## Was empfohlen wird

| Regel | Gruppe | Zubehör (Handle) | Beleg der Eignung (Zubehörbeschreibung) |
|---|---|---|---|
| `laminat-klick` | Unterlage | `duenne-trittschallunterlage-1-8-mm-mit-alu-kaschierung` | „speziell für die schwimmende Verlegung unter Laminat und Parkett“ |
| `laminat-klick` | Unterlage | `trittschalldaemmung-xps-fuer-laminat-und-parkett` | Eignung „Unter Laminat, Parkett und Klick-Vinyl“ |
| `laminat-klick` | Unterlage | `dampfbremse-pe-folie-0-2-mm` | „bei Fußbodenverlegung auf mineralischem Untergrund (Beton, Estrich), wird unter der Trittschalldämmung verlegt“ – Hinweis nennt die Bedingung |
| `parkett-2schicht-kleben` | Kleber | `uzin-mk-250-stp-parkettklebstoff` | „Mehrschicht- und Fertigparkett“ |
| `parkett-2schicht-kleben` | Kleber | `uzin-mk-200-stp-parkettklebstoff` | „Mehrschicht-/Fertigparkett mit Nut und Feder“ |
| `parkett-2schicht-kleben` | Unterlage | `mineralische-trittschallunterlage-3-mm-platten` | „zur vollflächigen Verklebung unter Mehrschichtparkett“ |
| `parkett-massiv-kleben` | Kleber | `uzin-mk-250-stp-parkettklebstoff` | „Stabparkett, Mosaikparkett (8 mm Massivparkett), Hochkantlamelle, Massivdielen“ |
| `parkett-massiv-kleben` | Kleber | `uzin-mk-92-s-2k-pur-parkettklebstoff` | „Für alle Holz- und Parkettarten, z. B. Stab-, 10-mm-Massiv-…“ |
| `klickvinyl-ohne-daemmung` | Unterlage | `unterlage-fuer-designboeden-1-5-mm-mit-antirutsch-oberflaeche` | Eignung „Unter Designböden und Klick-Vinyl“ |
| `klickvinyl-ohne-daemmung` | Unterlage | `trittschalldaemmung-xps-fuer-laminat-und-parkett` | Eignung „Unter Laminat, Parkett und Klick-Vinyl“ |
| `klebevinyl` | Kleber | `haftfixierung-fuer-designboeden` | „geeignet für maßstabile PVC-Designbeläge“ |
| `klebevinyl` | Kleber | `universal-verlegeband-70-mm` | „Für die Verlegung von PVC-haltigen Bodenbelägen und Designböden in Form von Fliesen und Planken. Zur Randverlegung …“ |
| `vinyl-rolle` | Kleber | `nass-und-haftklebstoff-fuer-elastische-belaege` | „Für homogene und heterogene PVC-, CV-Beläge …“ |
| `vinyl-rolle` | Kleber | `trockenklebstoff-fuer-bahnenware-rolle-75-cm` | „Für neue PVC- und CV-Beläge auf bestehendem Kunststein oder Terrazzo“ – Hinweis nennt die Bedingung |
| `vinyl-rolle` | Kleber | `universal-verlegeband-70-mm` | „PVC-haltige Bodenbeläge … Randverlegung an Wänden und Türen oder auf Trittstufen“ |
| `teppichboden-rolle-textil` | Unterlage | `komfortunterlage-fuer-teppichboden` | „Komfortunterlage für dimensionsstabile Teppichböden“, Eignung „lose oder verklebt“ |
| `teppichboden-rolle-textil` | Kleber | `dispersionsfixierung-wasserabloesbar` | „Wasserablösbare Fixierung für Teppichboden und CV-Beläge“ |
| `teppichboden-rolle-textil` | Kleber | `trockenklebstoff-fuer-bahnenware-rolle-75-cm` | „Für neuen Teppichboden auf bestehendem Parkett, Laminat oder Kunststeinboden“ – Hinweis nennt die Bedingung |
| `teppichboden-rolle` | Kleber | `dispersionsfixierung-wasserabloesbar` | „Wasserablösbare Fixierung für Teppichboden und CV-Beläge“ |
| `teppichboden-rolle` | Kleber | `trockenklebstoff-fuer-bahnenware-rolle-75-cm` | „Für neuen Teppichboden auf bestehendem Parkett, Laminat oder Kunststeinboden“ – Hinweis nennt die Bedingung |
| `teppichfliese` | Kleber | `dispersionsfixierung-wasserabloesbar` | „Fixierung für Teppichboden“ – Teppichfliesen sind Typ `Teppichboden` |
| `teppich-lose` | Unterlage | `antirutsch-unterlage-fuer-teppiche-rollenware` | Eignung „Unter Teppichen und Läufern auf glatten Böden“ |
| `teppich-lose` | Unterlage | `teppichunterlage-elastisch-rollenware` | Eignung „Unter lose verlegten Teppichen auf glatten Böden“ |

Der kurze Hinweis unter jedem Zubehör im Shop gibt diese Eignung bzw.
Bedingung wieder – ohne Werbesprache.

**Dimensionsstabil** (Komfortunterlage): Als belegt gilt nur ein Textil- oder
Vliesrücken ohne eigenen Trittschallwert. Schaum-, Latex-, Bitumen- und
Komfortrücken sowie Rücken mit Markennamen ohne Materialangabe bekommen keine
Unterlage, nur die Fixierung. Der Vergleich ist bewusst groß geschrieben
(„Textil“, „Vlies“): „Polyestervlies“ (drei Sisalböden) und „Stapelfaservlies“
(ein Nadelvlies) fallen damit heraus – Naturfaser-Sisal ist nicht als
dimensionsstabil belegt.

## Leisten

Es gibt **keine belegte Zuordnung** Boden → dekorgleiche Leiste: Die Leisten
tragen nur `material:`/`hoehe:`/`dekor:`-Tags, die Dekornamen der Leisten
kommen in keinem Boden des Shops vor, und kein Boden verweist per Metafeld auf
eine Leiste. Deshalb steht bei Hartböden und elastischen Belägen (`Laminat`,
`Parkett`, `Klickvinyl`, `Klebevinyl`, `Kork`, `Vinyl von der Rolle`,
`Linoleumboden`) nur ein **neutraler Verweis** auf `/collections/bodenleisten`
und `/collections/zubehoer-profile`, ohne „passt zu“-Aussage. Teppichboden,
Teppiche und Sauberlauf bekommen keinen Leistenverweis.

## Bewusst ohne Unterlage/Kleber

| Boden | Warum |
|---|---|
| Parkett 3-Schicht-Landhausdiele / Schiffsboden (161) | Verlegeart (Klick, verleimt, verklebt) steht weder in `belagsart` noch in der Beschreibung. Nur Leistenverweis. |
| Klick-Vinyl (77) | Ob eine Dämmung integriert ist, ist nur bei Bergen/Porto (IXPE) und Turku/Nantes (Trittschallwert) belegt; für Odense, Verona, Lyon, Rovelia fehlt die Angabe. Eine zweite Unterlage unter integrierter Dämmung ist fachlich falsch. Erst mit `custom.daemmung_integriert` = false. |
| Holz-Designboden (Klicksystem, 46) | Trägerplatte aus organischem Rigid Core, kein PVC – die Designboden-Unterlagen nennen nur Klick-Vinyl. |
| Korkboden Klick (6) | Die mineralische Unterlage nennt Kork nur in der Shop-Zeile „Eignung“, nicht in den Herstellerangaben. |
| Klebekork (6) | Der passende Kork-Kontaktkleber ist ein Entwurf. |
| Linoleum (9) | Der Linoleumklebstoff ist ein Entwurf; die PU-Kork-Unterlage setzt ein Klebesystem voraus. Nur Leistenverweis. |
| Laminat mit belegter Dämmung | aktuell keiner; Regel greift automatisch, sobald die Beschreibung sie nennt. |
| Kunstrasen, Sauberlauf, Dekofell | kein belegtes Zubehör. |

Nicht automatisch empfohlen, obwohl für mehrere Beläge belegt: PU-Kork-Unterlage
(setzt Verklebung von Unterlage und Belag voraus), Entkoppelungsplatte und
mineralische Unterlage unter Laminat (Auswahl bewusst auf drei Unterlagen
begrenzt), weitere UZIN-Parkettklebstoffe (MK 91, MK 95, MK 150, MK 200 T –
Spezialfälle).

## Vorgeschlagene Daten (nicht geschrieben)

1. **`custom.daemmung_integriert`** (boolean, Produkt) für Klick-Vinyl je Linie
   aus dem Herstellerdatenblatt: true bei Bergen, Porto, Turku, Nantes (belegt
   über IXPE bzw. Trittschallwert), für Odense, Verona, Lyon, Rovelia erst nach
   Datenblatt. Der Block liest das Feld bereits.
2. **Verlegeart für 3-Schicht-Parkett** in `custom.belagsart` ergänzen
   („… (Klicksystem)“ bzw. „… (zum Verkleben)“), je Linie aus dem Datenblatt.
   Danach greifen die Parkett-Regeln ohne Codeänderung, sobald die passende
   Regel ergänzt ist.
3. Optional: Search & Discovery „Ergänzende Produkte“
   (`shopify--discovery--product_recommendation.complementary_products`) ist
   heute bei 0 Produkten gesetzt und wird hier nicht genutzt.
