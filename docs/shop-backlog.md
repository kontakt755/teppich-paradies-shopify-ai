# Shop-Backlog

Zentrale Liste der Orchestrator-Session. Immer nur **ein** aktives Arbeitspaket.
Status: `offen` · `aktiv` · `review` (PR offen) · `erledigt` · `blockiert`.
GitHub-Issues bleiben die Aufgabenquelle des Dashboards; hier steht die Reihenfolge.

| ID | Aufgabe | Prio | Status | Abhaengig von | Codebereich | Agent | Test |
|---|---|---|---|---|---|---|---|
| S-01 | Raumansicht "Im Raum" aus Kundenansicht nehmen (Schalter, Standard aus) | P0 | erledigt (live 2026-09-20) | - | `blocks/tp-einfass-konfigurator.liquid` | Fable | Scratch, Preview, Live ok |
| S-02 | "So rechnen wir" aus Kundenansicht entfernen | P0 | erledigt (live 2026-09-20) | - | `blocks/tp-einfass-konfigurator.liquid`, `assets/tp-einfass-konfigurator.js` | Fable | Scratch, Preview, Live ok |
| S-03 | Alt-Arbeiten pruefen: Issues #339, #188, #199, #282, #162 gegen Ist-Stand abgleichen, schliessen oder aktualisieren | P0 | erledigt (Abgleich), Issue-Pflege siehe unten | S-01, S-02 | nur Issues/Doku | Haiku-Worker | Ergebnis unten |
| S-04 | Teppich-Ab-Preis: Rechenregel (kleinstes kaufbares Mass + Pflicht-Kettelung + Mindestpreis) festlegen, eine Quelle bauen | P1 | erledigt, live 2026-09-20 | S-02 | `snippets/tp-teppich-ab-preis.liquid`, `blocks/price.liquid` | Fable | 12 Unit-Tests, Scratch Desktop+Mobil ok |
| S-05 | Trennung Teppich vs. Teppichboden in der Preisanzeige (Karte + PDP), keine globale Aenderung | P1 | erledigt, live 2026-09-20 (in PR #391: Erkennung preis_pro_001_qm + service.einfassung) | S-04 | Produktkarten-Snippets, `templates/collection.teppiche.json`, `templates/product.einfassung.json` | mittleres Modell | - |
| S-06 | Collection-Karte Teppiche: Name / ab XX EUR / Wunschmass verfuegbar / Jetzt konfigurieren | P1 | erledigt, live 2026-09-20 | S-05 | Produktkarte (gleicher Bereich wie S-05: seriell) | mittleres Modell | - |
| S-07 | PDP-Hierarchie Teppich: ab-Preis, Grundpreis dezent, Masse, Optionen, Endpreis | P1 | erledigt, live 2026-09-20 (PR #391; Reihenfolge Masse/Optionen/Endpreis stand schon) | S-05 | `templates/product.einfassung.json`, Preisblock | mittleres Modell | - |
| S-17 | Live-Fehler: PAngV-Hinweis "Alle Preise inkl. MwSt." mobil 16 px breit neben dem Titel, alle Produktseiten (seit 2026-09-16) | P0 | erledigt, live 2026-09-20 (PR #391) | - | `sections/product-information.liquid`, `blocks/_product-details.liquid` | Fable | Scratch Desktop+Mobil ok |
| S-08 | Rabatt-Datenmodell: bestehende Metafelder inventarisieren, Vorschlag fuer Aktions-Felder | P1 | erledigt: Datenmodell `aktion.start/ende/klasse` angelegt (Definitionen in Shopify, kein Produkt befuellt) | - | Metafelder (nur Analyse) | Worker + Fable-Entscheid | - |
| S-09 | Verlegeservice-Logik verstehen, Aktionspreis-Hinweis daran anbinden (keine zweite Logik) | P1 | erledigt, geht mit S-21 live | S-08 | Service-Bloecke | Fable plant | - |
| S-10 | Produkttabelle VK/EK/Marge/Rabattklasse (EK nur aus belegter Quelle, nie geraten) | P1 | offen - wartet auf EK-Liste von Ahmet (reicht er nach, kein Termin). Bis dahin keine Margen-/Rabatttabelle, nichts raten | S-08 | Daten, lokal ausserhalb des Repos | Worker | - |
| S-11 | Collection-Sortierung/Merchandising Teppichboden analysieren (Einstieg nicht ueber 200 EUR/m2) | P1 | erledigt 2026-09-20: 5 Unterkollektionen manuell kuratiert (unten) | - | Collections, Sortierung (Analyse) | Worker | - |
| S-12 | Streichpreis-Struktur: belegbare Referenzpreise (30-Tage-Tiefstpreis), keine Fantasiepreise | P1 | Bestand bereinigt 2026-09-20 (unten); Struktur fuer kuenftige Aktionen offen, haengt an S-08 | S-08 | Preis-Snippets | Fable | - |
| S-13 | Kettelungsbilder inventarisieren (Produkt, Bild, Zweck, Problem, Wunsch) | P2 | Zahlen erledigt (unten); Qualitaetsurteil per Stichprobe in `docs/shop-bildworkflow.md` | - | nur Daten | Worker | - |
| S-14 | Externer Bild-Workflow fuer Kettelbilder vorbereiten | P2 | Konzept fertig (`docs/shop-bildworkflow.md`), Typ A (Struktur-Foto) im Theme; wartet auf 10 Kantenfotos vom Inhaber ODER Freigabe der KI-Testreihe | S-13 | - | Fable plant | - |
| S-15 | Rabattaktionen ausrollen | P2 | offen | S-08 bis S-12, Freigabe Ahmet | Preise | - | - |
| S-16 | Bessere Raumvisualisierung (Ersatz fuer S-01) | P3 | zurueckgestellt (Ahmet 2026-09-20: erstmal sein lassen; #339 geschlossen) | S-14 | Einfass-Konfigurator | - | - |
| S-18 | Sales-Check mobil wackelt: Cookie-Banner faengt den Klick auf "In den Warenkorb" ab (1 von 3 Laeufen am 2026-09-20), kostet einen ganzen Preview-Lauf | P2 | erledigt 2026-09-20 (CSS-Regel statt nur Beobachter, nach dem zweiten Fehlschlag am selben Tag) | - | `qa/run-sales-readiness.mjs` | mittleres Modell | - |
| S-19 | Seite /pages/liefer-verlegeservice um den Satz zur Aktionspreis-Regel ergaenzen (liegt doch im Theme: `sections/tp-verlegeservice.liquid`) | P2 | erledigt, live 2026-09-20 | S-09 | Shopify-Seite | - | - |
| S-20 | Sale-Badge/Streichpreis auf Karten nur zeigen, wenn `tp-aktion-aktiv` ja sagt (verhindert unbelegte Streichpreise technisch) | P2 | erledigt, live 2026-09-20 | S-09 | `_product-card-gallery.liquid`, `snippets/price.liquid` | mittleres Modell | - |
| S-21 | Teppiche: m2-Preis komplett raus (Karte + PDP) | P1 | erledigt, live 2026-09-20 | S-04 | `snippets/tp-teppich-ab-preis.liquid` | Fable | Scratch ok |
| S-22 | 49 Teppich-Beschreibungen: Abschnitt "So funktioniert der Rechner" nennt Material-EUR/m2 und Kettelung je lfm; ebenso die Meta-Descriptions ("117 EUR/m2 plus Kettelung"). Textvorschlag an Ahmet, dann Bulk-Update mit Sicherung der Originale | P1 | erledigt 2026-09-20: 49/49 Beschreibungen + Meta-Descriptions, Originale gesichert | S-21 | Produktdaten (descriptionHtml, global.description_tag) | guenstiger Worker nach Freigabe | - |
| S-23 | Teppich-Karte aufwerten: Preis groesser, Qualitaetszeile (Material/Art/Flor aus `service.einfass_basis`), Wunschmass sichtbarer - Variante A/B/C von Ahmet waehlen lassen | P1 | erledigt, live 2026-09-20 | S-21 | `blocks/tp-card-actions.liquid`, `snippets/tp-teppich-ab-preis.liquid`, `blocks/price.liquid` | Fable | - |
| S-24 | Groesste Teppichbreite vom Teppichboden ableiten (500er Rollen), je Farbe, Karte + Konfigurator | P1 | erledigt, live 2026-09-20 | - | `snippets/tp-teppich-max-breite.liquid`, Konfigurator | Fable | 6 Unit-Tests, Scratch ok |
| S-25 | Datenpflege: `service.max_breite_cm` an den Teppichen ist jetzt nur noch Rueckfall; Wovena-Teppichboden hat kein Fasermaterial gepflegt | P3 | offen | - | Produktdaten | Worker | - |
| S-26 | Kollektion `teppiche` (50 Produkte, BEST_SELLING) nach derselben Regel kuratieren - jetzt mit ab-Preisen sinnvoll | P2 | erledigt 2026-09-20 | S-11 | Shopify-Kollektion | Fable | - |
| S-27 | Konfigurator: Preis stand doppelt ("Ihr Preis" + "In den Warenkorb – 724 EUR"), Gedankenstrich im Knopf | P1 | review | - | `assets/tp-einfass-konfigurator.js` | Fable | Scratch ok |
| S-28 | Teppich-PDP mobil: Farbwahl und Galerie zu weit auseinander - grosses Farbbild direkt unter der Farbwahl, Strukturfoto als Lupe | P1 | review | S-14 | `blocks/tp-teppich-struktur.liquid` | Fable | 5 Unit-Tests, Scratch ok |
| S-29 | Link "Lieber als Meterware von der Rolle" unverstaendlich -> Frage + klarer Link | P1 | review | - | `blocks/tp-einfass-wechsel.liquid` | Fable | Scratch ok |

## S-03 Ergebnis (2026-09-20)
| Issue | Befund | Empfehlung |
|---|---|---|
| #199 Teppiche-Bereich | komplett live (ueber PR #281) | schliessen |
| #339 Visualisierer | gebaut (PR #338), seit PR #388 abgeschaltet | offen: Entscheidung Ahmet Kauf-Tool vs. Eigenbau, gehoert zu S-16 |
| #188 Massteppich/Raummass | gemergt (PRs #195, #276, #281, Fixes #384/#385) | Abnahme durch Ahmet, dann schliessen |
| #282 Piumera | Basis da, Rechner/Warenkorb/Structured Data unvollstaendig | offen lassen |
| #162 Kaufbox Rollenware | Live-Gesamtpreis da; Rechenbeispiel und Eingabegrenzen-Text nicht belegbar | offen mit diesen zwei Resten |
| #164 Verschnitt-Option | nicht gebaut | offen |
| #264 Kettelservice-Zweig | Issue ohne Inhalt | zurueck in Triage |

## S-08 Inventar (2026-09-20)
- Keine Metafelder fuer Aktion/Rabatt/Verlegung an Produkt oder Variante. Vorhanden: `custom.qm_pro_paket`, `custom.preis_pro_001_qm`, `service.*` (Einfassung, Masse, `mindestpreis`).
- Einkaufspreise: `InventoryItem.unitCost` bei 10 Stichproben leer -> S-10 braucht eine EK-Quelle ausserhalb von Shopify.
- 5 Produkte tragen bereits `compareAtPrice`; Sale-Badge in `_product-card-gallery.liquid`, Streichpreis in `price_custom.liquid`/`snippets/price.liquid`. Herkunft der Streichpreise in S-12 pruefen.
- Verlegeservice: `blocks/tp-verlegen-lassen.liquid` (nur Template `rolle`; kostenlos Oranienburg + 15 km ab 649 EUR), `blocks/tp-verlegeservice-hinweis.liquid` (Produkttypen aus Theme-Einstellung `tp_vs_produkttypen`), Einstellungen "TP Verlegeservice" in `config/settings_schema.json`. Keine Kopplung an Aktionspreise -> S-09 haengt den Hinweis an diese zwei Bloecke.

## S-11 Teilergebnis (2026-09-20)
- `teppichboden` (113 Produkte) ist MANUAL sortiert -> direkt kuratierbar. Unterkollektionen (hochflor, schlinge, velours, wolle, nadelvlies) und `teppiche` stehen auf BEST_SELLING; bei fast keinen Verkaeufen ist das faktisch zufaellig.
- Erste 12 in `teppichboden`: 32,90 bis 82,90 EUR/m2, kein Produkt ueber 200 im Einstieg. Storefront-Reihenfolge = Admin-Reihenfolge.
- Luecke: der Worker konnte EUR/m2 fuer Rollenware nicht sicher ableiten, die Preisbaender gelten nur fuer Paketware. Vor einer Kuratierung mit korrekter Preislogik wiederholen. Handle `vinylboden` wurde nicht gefunden (pruefen).

## S-13 Inventar Kettelbilder (2026-09-20)
- 49 Teppiche nach Mass, 477 Bilder fuer 477 Farbvarianten (1:1, keine Variante ohne Bild), alle 1400 px breit, Dateiname `<handle>-<Farbcode>.jpg`.
- Es gibt genau EINEN Bildtyp: Draufsicht auf ein gekettetes Rechteck vor hellem Hintergrund (erzeugte Darstellung). Es fehlen komplett: Nahaufnahme der Kettelkante, Struktur-Zoom, Raum-/Groessenwirkung.
- Groesste Farbpaletten: vallora 20, kontura 19, vantana 18, torvana 18, alvento 16 (zusammen 91 Bilder).
- Das Qualitaetsurteil des Haiku-Workers ("professionell fotografiert") ist verworfen - unbelegt und im Widerspruch zur Aussage des Inhabers. Bewertung je Bild (Materialtreue, Farbe, Struktur, Kettelung) macht S-14 mit staerkerem Modell oder Ahmet an 10 Stichproben.
- Hebel fuer S-14: nicht 477 Bilder neu, sondern je Produkt 1 echte Kanten-Nahaufnahme + 1 Struktur-Zoom (49 x 2), Farbbilder spaeter.

## S-12 Befund Streichpreise (2026-09-20)
- 4 aktive, oeffentlich erreichbare Produkte zeigen einen Streichpreis: sylvara-655-design-klebevinyl-als-einzelplanken, ...-klickvinyl-ohne-integrierte-trittschalldammung, ...-klickvinyl-mit-integrierter-trittschalldammung (je 24,95 statt 29,95, Varianten zuletzt geaendert 2026-08-09) und ...-klebevinyl-als-einzelplanken-kopie (26,95 statt 29,95, geaendert 2026-09-09).
- Risiko: Bei einer Preisermaessigung muss der Referenzpreis der niedrigste Preis der letzten 30 Tage sein. Drei der vier Preise stehen seit ueber 30 Tagen unveraendert - der niedrigste 30-Tage-Preis ist dann der aktuelle Preis, der Streichpreis 29,95 ist so nicht mehr belegbar. Keine Rechtsberatung; im Zweifel pruefen lassen.
- Ein Entwurfsprodukt (aw-ganges-teppichboden) hat compareAtPrice UNTER dem Preis - wird nicht angezeigt, Datenmuell.
- Das Handle "...-kopie" deutet auf ein Duplikat hin (eigenes Thema, nicht angefasst).
- Optionen: (a) compareAtPrice bei den 4 Produkten entfernen, (b) als "UVP" kennzeichnen, falls 29,95 eine belegte Herstellerempfehlung ist, (c) lassen. Keine Aenderung ohne Freigabe (Preisdaten).
- Technische Struktur fuer kuenftige Aktionen ist noch nicht entworfen; sie haengt am Datenmodell aus S-08 (Aktionsstart/-ende als Metafeld, Referenzpreis = niedrigster Preis der 30 Tage vor Aktionsstart).

- ERLEDIGT 2026-09-20 (Freigabe Ahmet: "das was sinnvoll ist machen"): compareAtPrice bei den 4 aktiven Sylvara-Produkten (9 Varianten) per `productVariantsBulkUpdate` auf null gesetzt, Verkaufspreise unveraendert (24,95 / 26,95). Gegenprobe per direktem Varianten-Read ok. Begruendung: 29,95 ist weder als 30-Tage-Tiefstpreis noch als UVP belegt; ohne Beleg ist kein Streichpreis die sichere Variante. Rueckweg: compareAtPrice 29.95 wieder setzen. Das Entwurfsprodukt aw-ganges-teppichboden wurde nicht angefasst.

## S-11 Umsetzung (2026-09-20)
- Messung ueber die angezeigten EUR/m2-Preise der Kollektionsseiten (das, was der Kunde sieht). `teppichboden` (113, manuell): erste 8 bei 33-73 EUR/m2, 219-EUR-Produkte erst auf Platz 17/18 -> NICHT angefasst.
- Problem lag in den Unterkollektionen: Sortierung BEST_SELLING ist ohne Verkaeufe faktisch zufaellig. Hochflor: 219 EUR auf Platz 2 von 9. Schlinge: erst 11 Fliesen/Planken zu 65-110 EUR, alle Rollenware-Anker (19-33 EUR) auf Platz 32-42.
- Regel (deterministisch, wiederholbar): Baender G < 40, M 40-75, O 75-150, P >= 150 EUR/m2; innerhalb aufsteigend; Reihenfolge im Wechsel M, G, M, O; Piumera (Referenzprodukt) bleibt vorn; Premium fruehestens ab Platz 9-12.
- Umgestellt auf MANUAL + neu geordnet: hochflor (9), wolle (11), velours (25), schlinge (42), nadelvlies (6). kurzflor (1 Produkt) unveraendert.
- Rueckweg: alte Reihenfolgen in `~/teppich-paradies-analyse/sicherungen/kollektions-reihenfolge-2026-09-20.json`; oder Sortierung im Admin wieder auf "Meistverkauft".
- Folge von MANUAL: neue Produkte ordnet Shopify nicht mehr automatisch ein - nach einem Import die Regel neu anwenden. Sobald echte Verkaufszahlen da sind, Bestseller auf die ersten Plaetze ziehen.

## S-26 Umsetzung (2026-09-20)
- `teppiche` (49 sichtbar, 50 im Admin - eines nicht veroeffentlicht) war BEST_SELLING und faktisch rueckwaerts-alphabetisch (wovena, woolara, vivera ...).
- Gleiche Regel wie S-11, Baender aus der Verteilung der ab-Preise (80 x 150 cm): G < 140, M 140-160, O 160-300, P >= 300 EUR. Piumera vorn.
- Neu erste 8: piumera 194, amara 140, altessa 119, kalvea 140, vantana 168, kerova 140, solvana 120, nuvara 140. Premium (boucella, regalia je 443) auf Platz 12 und 16.
- Rueckweg: Sicherung in `~/teppich-paradies-analyse/sicherungen/kollektions-reihenfolge-2026-09-20.json` (Schluessel `teppiche`).
