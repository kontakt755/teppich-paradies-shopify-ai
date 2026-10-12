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
| `parkett-3schicht-klick` | Typ `Parkett`, `belagsart` enthält „3-Schicht“, „schwimmend“ und „vollflächig verklebt“, nicht „Nut und Feder“ (Landhausdiele/Schiffsboden mit leimfreiem Verlegesystem) | 123 |
| `parkett-3schicht-nutfeder` | Typ `Parkett`, `belagsart` enthält „3-Schicht“, „Nut und Feder“ und „vollflächig verklebt“ | 38 |
| `klickvinyl-ohne-daemmung` | Typ `Klickvinyl`, `belagsart` „Klick-Vinyl …“, **und** `custom.daemmung_integriert` = false, keine belegte Dämmung | 0 (alle Klick-Vinyl-Linien haben laut Datenblatt eine integrierte Dämmung, `custom.daemmung_integriert` = true) |
| `klebevinyl` | Typ `Klebevinyl`, `belagsart` enthält „zum Vollverkleben“ | 179 |
| `vinyl-rolle` | Typ `Vinyl von der Rolle`, Tag `material: pvc` | 118 |
| `kautschuk-bis-2-5mm` | Typ `Kautschukboden`, `custom.gesamtstarke` höchstens 2,5 mm | 1 (Gommara, 2 mm; seit 2026-10-10) |
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
| `parkett-3schicht-klick` | Unterlage | `duenne-trittschallunterlage-1-8-mm-mit-alu-kaschierung` | „speziell für die schwimmende Verlegung unter Laminat und Parkett“; Verlegeanleitung des Bodens (Lieferant A): bei schwimmender Verlegung „eine geeignete … Unterlage inkl. Alu-Kaschierung“ |
| `parkett-3schicht-klick` | Unterlage | `trittschalldaemmung-xps-fuer-laminat-und-parkett` | Eignung „Unter Laminat, Parkett und Klick-Vinyl“; Verlegeanleitung: Unterlage bei schwimmender Verlegung |
| `parkett-3schicht-klick` | Unterlage | `dampfbremse-pe-folie-0-2-mm` | Verlegeanleitung: ohne Alu-Kaschierung „muss unbedingt eine mindestens 0,2 mm starke PE-Folie darunter verlegt werden“; Zubehör: „auf mineralischem Untergrund (Beton, Estrich)“ |
| `parkett-3schicht-klick` | Kleber | `uzin-mk-250-stp-parkettklebstoff` | „Mehrschicht- und Fertigparkett“; Datenblatt des Bodens: „vollflächige Verklebung“ zulässig |
| `parkett-3schicht-nutfeder` | Unterlage | `duenne-trittschallunterlage-1-8-mm-mit-alu-kaschierung` | wie oben; Datenblatt: „schwimmende Verlegung mit H-Verleimung“ |
| `parkett-3schicht-nutfeder` | Unterlage | `trittschalldaemmung-xps-fuer-laminat-und-parkett` | Eignung „Unter Laminat, Parkett und Klick-Vinyl“; Unterlage bei schwimmender Verlegung |
| `parkett-3schicht-nutfeder` | Unterlage | `dampfbremse-pe-folie-0-2-mm` | Verlegeanleitung: ohne Alu-Kaschierung PE-Folie ≥ 0,2 mm; Zubehör: „auf mineralischem Untergrund (Beton, Estrich)“ |
| `parkett-3schicht-nutfeder` | Kleber | `uzin-mk-250-stp-parkettklebstoff` | „Mehrschicht- und Fertigparkett“; Datenblatt: „vollflächige Verklebung“ |
| `parkett-3schicht-nutfeder` | Kleber | `uzin-mk-200-stp-parkettklebstoff` | „Mehrschicht-/Fertigparkett mit Nut und Feder“ |
| `klickvinyl-ohne-daemmung` | Unterlage | `unterlage-fuer-designboeden-1-5-mm-mit-antirutsch-oberflaeche` | Eignung „Unter Designböden und Klick-Vinyl“ |
| `klickvinyl-ohne-daemmung` | Unterlage | `trittschalldaemmung-xps-fuer-laminat-und-parkett` | Eignung „Unter Laminat, Parkett und Klick-Vinyl“ |
| `klebevinyl` | Kleber | `haftfixierung-fuer-designboeden` | „geeignet für maßstabile PVC-Designbeläge“ |
| `klebevinyl` | Kleber | `universal-verlegeband-70-mm` | „Für die Verlegung von PVC-haltigen Bodenbelägen und Designböden in Form von Fliesen und Planken. Zur Randverlegung …“ |
| `vinyl-rolle` | Kleber | `nass-und-haftklebstoff-fuer-elastische-belaege` | „Für homogene und heterogene PVC-, CV-Beläge …“ |
| `vinyl-rolle` | Kleber | `trockenklebstoff-fuer-bahnenware-rolle-75-cm` | „Für neue PVC- und CV-Beläge auf bestehendem Kunststein oder Terrazzo“ – Hinweis nennt die Bedingung |
| `kautschuk-bis-2-5mm` | Kleber | `nass-und-haftklebstoff-fuer-elastische-belaege` | „Kautschuk-Beläge bis 2,5 mm Dicke … bei Stuhlrollenbelastung“ |
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
`Linoleumboden`, `Kautschukboden`) nur ein **neutraler Verweis** auf `/collections/bodenleisten`
und `/collections/zubehoer-profile`, ohne „passt zu“-Aussage. Teppichboden,
Teppiche und Sauberlauf bekommen keinen Leistenverweis.

## Bewusst ohne Unterlage/Kleber

| Boden | Warum |
|---|---|
| Klick-Vinyl (77 aktiv) | Alle Linien haben laut Datenblatt von Lieferant A eine integrierte Trittschalldämmung: IXPE 1,0 mm, ca. 21 dB (Bergen, Porto, Turku, Nantes, Odense, Verona, Lyon) bzw. Presskork-Gegenzug, ca. 16 dB (Rovelia). Gesetzt als `custom.daemmung_integriert` = true (2026-10-08). Eine zweite Unterlage wäre fachlich falsch. |
| Holz-Designboden (Klicksystem, 46) | Trägerplatte aus organischem Rigid Core, kein PVC – die Designboden-Unterlagen nennen nur Klick-Vinyl. `custom.daemmung_integriert` = false (Finvara, Ostara, Velorra, Solvera, Pellara): laut Datenblatt kein Dämmrücken; die Verlegeanleitung verlangt bei schwimmender Verlegung die Systemunterlage des Lieferanten, die der Shop nicht führt. |
| Korkboden Klick (6) | Die mineralische Unterlage nennt Kork nur in der Shop-Zeile „Eignung“, nicht in den Herstellerangaben. |
| Klebekork (6) | Der passende Kork-Kontaktkleber ist ein Entwurf. |
| Linoleum (9) | Der Linoleumklebstoff ist ein Entwurf; die PU-Kork-Unterlage setzt ein Klebesystem voraus. Nur Leistenverweis. |
| Kautschukfliesen über 2,5 mm (Rondaro 3 mm, Tondara 3,5 mm) | Der Nass- und Haftklebstoff ist laut Herstellerangabe nur bis 2,5 mm freigegeben; ein anderer Kautschukkleber ist nicht im Sortiment. Nur Leistenverweis. |
| Laminat mit belegter Dämmung | aktuell keiner; Regel greift automatisch, sobald die Beschreibung sie nennt. |
| Kunstrasen, Sauberlauf, Dekofell | kein belegtes Zubehör. |

Bei 3-Schicht-Parkett bewusst nicht empfohlen: die mineralische Unterlage (die
Verlegeanleitungen sagen, beim Verkleben ist keine Dämmunterlage nötig), MK 150
(laut Beschreibung nur bis 2200 × 200 mm, mehrere Linien sind breiter/länger) und
Parkett-Kaltleim (Anleitung verlangt D3-Weißleim, D3 im Zubehör nicht belegt).

Nicht automatisch empfohlen, obwohl für mehrere Beläge belegt: PU-Kork-Unterlage
(setzt Verklebung von Unterlage und Belag voraus), Entkoppelungsplatte und
mineralische Unterlage unter Laminat (Auswahl bewusst auf drei Unterlagen
begrenzt), weitere UZIN-Parkettklebstoffe (MK 91, MK 95, MK 150, MK 200 T –
Spezialfälle).

## Daten (Stand 2026-10-08)

1. **`custom.daemmung_integriert`** (boolean, Produkt): erledigt 2026-10-08 –
   Definition angelegt, 131 Produkte gesetzt (85 × true Klick-Vinyl, 46 × false
   Holz-Designboden), Beleg je Linie aus Datenblatt und Verlegeanleitung von
   Lieferant A. Rollback lokal unter `~/teppich-paradies-analyse/klickvinyl-daemmung/`.
2. **Verlegeart für 3-Schicht-Parkett** in `custom.belagsart`: erledigt
   2026-10-08 – 163 Produkte (13 Linien, alle „schwimmend oder vollflächig
   verklebt“, drei Linien mit Nut und Feder), Beleg je Linie aus Datenblatt bzw.
   Lieferantenseite. Kein Filter und keine Kollektionsregel liest das Feld.
   Rollback lokal unter `~/teppich-paradies-analyse/parkett-verlegeart/`.
3. Offen: `custom.trittschallverbesserung` laut Datenblatt für Bergen, Porto,
   Odense, Verona, Lyon (21 dB) und Rovelia (16 dB) nachtragen.
4. Optional: Search & Discovery „Ergänzende Produkte“
   (`shopify--discovery--product_recommendation.complementary_products`) ist
   heute bei 0 Produkten gesetzt und wird hier nicht genutzt.
