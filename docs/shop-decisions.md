# Shop: dauerhafte Entscheidungen

| Datum | Entscheidung | Quelle |
|---|---|---|
| 2026-09-20 | Teppiche (fertig/konfigurierbar) zeigen primaer "ab XX EUR"; der Preis muss real kaufbar sein (Pflichtbestandteile eingerechnet, Extras nicht). | Ahmet |
| 2026-09-20 | Teppichboden/Rollenware zeigt weiter "XX EUR/m2". Beide Gruppen technisch getrennt, keine globale Preisaenderung. | Ahmet |
| 2026-09-20 | Aktionspreis ist nicht kombinierbar mit dem kostenlosen Vor-Ort-Liefer-/Verlegeservice; kostenlose Lieferung bis Bordsteinkante bleibt. | Ahmet |
| 2026-09-20 | Keine pauschalen Rabatte, keine kuenstlichen Streichpreise, keine geratenen Einkaufspreise. Vor Preisaenderungen Produkttabelle und Freigabe. | Ahmet |
| 2026-09-20 | Raumansicht "Im Raum" bleibt aus, bis eine bessere Loesung steht. Abschalten per Schalter, nicht loeschen. | Ahmet |
| 2026-09-20 | "So rechnen wir" ist aus der Kundenansicht entfernt (ersetzt die Entscheidung vom 2026-09-13 "eingeklappt"). Sichtbar bleiben die Hinweise Rund/Oval und Mindestpreis, weil sie einen sonst unerwarteten Preis erklaeren. | Ahmet; Hinweise: Vorschlag Fable, bei Einwand entfernen |
| 2026-09-20 | Kettelbilder werden nicht von Fable massenhaft erzeugt; erst Inventar, dann externer Bild-Workflow. Blockiert nichts anderes. | Ahmet |
| 2026-09-20 | Ein aktives Arbeitspaket; parallele Agenten nur fuer Analyse, Schreiben am selben Codebereich seriell. | Ahmet |
| 2026-09-20 | Ab-Preis der Teppiche gilt fuer das Einstiegsmass 80 x 150 cm inkl. Pflicht-Kettelung und Mindestpreis, guenstigste Farbe. Das Mass steht dezent dabei, der Preis je m2 bleibt als Grundpreis sichtbar. 50 x 50 cm verworfen: fast ueberall "ab 99,xx EUR". | Ahmet |
| 2026-09-20 | Teppich-Karten: Hauptaktion "Jetzt konfigurieren", dazu die Zeile "Wunschmass verfuegbar". Muster und Vergleich bleiben als Textlinks (Muster ist laut Audit B-08 vom 2026-09-10 der Verkaufsweg und wird nicht entfernt). Alle anderen Warenarten behalten Muster als Hauptknopf. | Ahmet (Karte), Fable (Textlinks; bei Einwand aendern) |
| 2026-09-20 | Streichpreise ohne Beleg (30-Tage-Tiefstpreis oder nachweisbare UVP) werden entfernt statt stehen gelassen. | Ahmet ("das was sinnvoll ist"), Umsetzung Fable |
| 2026-09-20 | Aktions-Datenmodell: Produkt-Metafelder `aktion.start` (Datum), `aktion.ende` (Datum, leer = offen), `aktion.klasse` (intern: preisanker, aktion, normal, kein-rabatt, premium). Aktiv = Start erreicht und Ende nicht vorbei. Kein eigenes Feld fuer Bordsteinkante/Service-Ausschluss, weil die Regel ausnahmslos gilt. Einzige Quelle im Theme: `snippets/tp-aktion-aktiv.liquid`. | Fable (Architektur), Regel von Ahmet |
| 2026-09-20 | Raumvisualisierung: vorerst sein lassen, keine Kauf-App. Neubewertung, wenn die Teppiche laufen. | Ahmet |
| 2026-09-20 | Teppiche zeigen KEINEN Preis je m2 mehr, weder auf der Karte noch auf der Produktseite (ersetzt "Grundpreis dezent" vom selben Tag). Das Beispielmass 80 x 150 cm bleibt neben dem ab-Preis stehen, damit der Preis nachvollziehbar ist. Hinweis Fable: bei Ware, die nach Flaeche angeboten wird, kann eine Grundpreisangabe Pflicht sein - im Zweifel pruefen lassen. | Ahmet |
| 2026-09-20 | Teppich-Karte Variante A: Qualitaetszeile (Material · Art · Florhoehe), Preis 24 px, Beispielmass "inkl. Kettelung", Wunschmass als Marke mit den groessten Massen, Knopf "Jetzt konfigurieren". | Ahmet |
| 2026-09-20 | Alle Sachangaben zum Teppich (Breite, Material, Art, Florhoehe) kommen vom Teppichboden, aus dem zugeschnitten wird (`service.einfass_basis`) - nie am Teppich doppelt pflegen. Groesste Breite = groesste verfuegbare Rollenbreite, je Farbe. | Ahmet |
