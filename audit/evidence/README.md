# Herkunft und Grenzen der Belege

## Übernommen, unverändert

- `source-manifest.json`: Snapshot-Vergleich des früheren Audits, Basiscommit im Dokument. Keine Quellen neu vom Shop geladen.
- `runtime.json`: Erfassung `2026-09-19T13:27:30.912Z`, Browser-Version `153.0.8010.48`; 32 Datensätze mit 1440 × 1000 und 390 × 844. Enthält sichtbaren Text, einzelne Requests/Cart-Antworten und schmale Runtime-Kontrolle; kein vollständiges Browserprotokoll/Video. Label ist die Fallkennung; Index in neuen Reports nullbasiert.
- `piumera-desktop.png`, `package-cart-1440.png`, `package-cart-390.png`: übernommene Bilder, keine neuen Screenshots dieser Session.

## Neu, lokal

- `pricing-reproduction-2026-09-20.json`: erzeugt durch `node audit/scripts/reproduce-pricing.mjs`. Das Script liest den Originalcode, führt das vollständige eingebettete Paket-Script und die Originalfunktionen/-Listener für Rollenware-Zubehör in einem minimalen DOM-Adapter aus. Es ersetzt keine Preis-/Validierungsfunktion durch eine Kopie. Alle Requests werden abgefangen; **kein Netzwerk, kein echter Cart**, keine Shopify-Schreiboperation.
- 21 Ausführungsfälle; historische Preis-/Mengenfixtures für Hauptware und Paketware. Die Zusatzprodukt-ID im lokalen Rollenmodell ist synthetisch. Der Testpreis 1.095 Cent stammt aus dem angezeigten Mindestpreis; seine konkrete Zuordnung zur 5-cm-Option ist nicht per API belegt. Die positiven Zubehörfälle sind mathematische Kontrollen mit diesem Fixture, keine Bestätigung eines aktuellen Produktpreises. Das ändert nichts am belegten Auslassen des leeren Extras. Synthetische Gruppenkennungen sind vereinheitlicht.
- `sourceIntegrity` belegt für beide geprüften Blöcke Gleichheit mit dem historischen Live-Hash. Dadurch können die alten Live-Belege gezielt mit aktueller lokaler Ursache zusammengeführt werden; eine heutige Live-Verifikation ist damit nicht ersetzt.
- `pricing-unit-tests-2026-09-20.log`: vorhandene Tests zu Rollenart, Maß-Rechenkern und interner Bestellmail, seriell mit `--test-concurrency=1`; 55 bestanden. Dateiformat ist Node-Testreport, kein Browserreport.

## Infrastruktur / fehlende Live-Nachweise

Am 20.09. startete das verfügbare Browserwerkzeug nicht: zunächst Kernel-Abbruch, nach genau einem Retry `sandbox-exec: unbound variable: TIOCSTI`, Exit 65. Setup kam nicht bis zu einer Browserbindung. Der lokale lesende `curl -I --max-time 20` zum Shop endete mit Exit 6 (Hostname nicht auflösbar). In den verfügbaren/deferred Tools wurde kein Shopify-MCP gefunden. `web.open` lieferte zur öffentlichen Piumera-URL einen „Crawled: last month“-Text, der sichtbar vom historischen September-Stand abwich; deshalb verworfen.

Keine Authentifizierungs-/Shopify-Änderung, kein neuer Test-Cart und kein Kauf. Rohdaten mit Cookies, Kundendaten oder Checkout-Tokens wurden nicht neu gesammelt. Die alten Checkout-Pfade sind bereits redigiert.

## Interpretation

`reproductionStatus: PASS` heißt: Beobachtungen/Defekte reproduziert und Kontrollen erfüllt. Es ist **keine Fix-QA**. Die behaupteten Fehlergrenzen stehen in ISSUES.md. Für einen späteren Fix braucht es zusätzliche Akzeptanztests, die das korrekte Sollverhalten prüfen; dieses Diagnose-Script darf nicht blind als „grün = behoben“ verwendet werden.

## S02 – PR-020 Raummaß

`room-pricing-2026-09-20.json`, erzeugt durch `node audit/scripts/reproduce-room-pricing.mjs`, enthält:

- Quellcode-Rundung gegen unabhängige Ganzzahlregel: 2.185.846 Maßpaare mit Breite 50–495 und Länge 100–5.000 cm, jeweils volle m² und Hundertstel. Im bedingten Hundertstelmodus 3.310 Abweichungen, jeweils eine Einheit zu wenig. 19.604 Meterwarepaare für Breiten 200/300/400/500 cm zusätzlich ohne Mengenabweichung.
- 35 Fälle mit originalem `calculate`, `selectedWidth`, Längenfunktion, Varianten-Lookup, `fehlendesFeld`, Meterware-Tipp und Submit-Listener in einem DOM-Adapter. Die darin 29 erzeugten Requests werden komplett abgefangen; sechs Grenz-/Leerfälle erzeugen keinen Request. Keine reale Shopify-Antwort.
- Die erzeugten Mengen/Properties gehen unverändert in die aktuelle lokale interne Mail-Vorlage, gerendert mit LiquidJS. Eine Warnung beweist keinen tatsächlichen Mailversand und kein Shopify-Liquid-Verhalten. Vorlage im Admin nicht neu abgeglichen.
- Alle Varianten-IDs sind synthetisch. 400/500 cm sowie 65,90/89,00 €/m² im Voll-m²-Fixture orientieren sich an historischen Piumera-Textbelegen. Das cmExact-Fixture (66/89 Cent je 0,01 m²) beschreibt eine Testkonfiguration, **kein bestätigtes Live-Produkt**. Insbesondere wird nicht behauptet, der Piumera-Rollenrechner sei auf Hundertstel umgestellt.
- Geometriezeichnung, Service-Freigaben, echte Input-Normalisierung im Browser, schnelle Variantenwechsel, Extras und Section-/Browser-Lifecycle sind hier nicht getestet. Diese UI-Routinen werden im Adapter ausgeblendet; Preis-/Mengenfunktionen nicht durch eigene Berechnungen ersetzt.
- Produkt-Mindest-/Höchstmaße gelten nur für das belegte Code-/Rollen-Fixture; die vollständige Menge aller Shop-Produkte wurde nicht ermittelt. Die Rasterzahl ist keine Schätzung eines Kunden-/Bestellanteils.

Bei 250 × 333 cm zeigt die aktuelle Codeausführung 8,33 m² geometrische Fläche, rechnet aber 8,32 m² und sendet 832 statt 833 Einheiten. 35-Fall-Prüfung und Ganzzahlraster reproduzieren TP-004; ihr PASS-Status ist kein erfolgreich behobener Fehler.

## S03 – PR-021 Einfassrechnung

`einfass-pricing-2026-09-20.json`, erzeugt durch `node audit/scripts/reproduce-einfass-pricing.mjs`:

- 47 Fälle. Originale Liquid-Zuweisungen/Gates und JSON-Ausgabe mit LiquidJS gerendert; die realen lokalen Farb-/Bandsnippets werden eingebunden. Shopify-`doc`-Blöcke sind nur beim lokalen Einlesen entfernt, das JSON-Filter ist als JSON.stringify adaptiert. Layout/Schema/Shopify-Formularmarkup nicht gerendert. Keine Produktionsdatei verändert.
- Originale JS-Initialisierung bis zur Funktionsdefinition, `form`, `aktuelleVariante`, `lesen`, `anfrageZeigen`, `rechnen`, Zuschnitttext und `hinzufuegen` laufen mit vollständigem TPMass-Asset. Zeichnung, Presets und Nummerierung sind ausdrücklich ausgelassen. Die synthetische Bandwahl kommt aus den gerenderten Banddaten; reale Picker-/Browserereignisse sind nicht geprüft.
- 29 Requests vor dem Netzwerk abgefangen; 13 JS-Zustände und fünf Liquid-Gates ohne Request. Gruppenrelation geprüft, Zufallskennung im gespeicherten Report auf `K-AUDIT` normalisiert. Zuschnittabgleich als erfolgreich simuliert, Cart-Event erfasst, Drawer/Checkout nicht getestet. Kein neuer echter Test-Cart.
- Alle IDs synthetisch. Referenzpreise 89 Cent je 0,01 m², 19 Cent je 0,01 lfm, Mindestpreis 99 € und Grenzen 400 × 600 stammen aus den historischen Piumera-Notizen vom 14.09. Historisch nur Rechteck freigegeben. Rund/oval/Cover/Band, Serviceausfälle und Alternativgrenzen sind ausdrückliche Testkonfigurationen, keine heutigen Produktbehauptungen.
- Unabhängige ganzzahlige Flächen-/Mindestpreisrechnung prüft tatsächliche Payloadmengen, Anzeige und Properties. Ovalumfang zusätzlich per numerischer Quadratur (4.096/8.192 Schritte, Übereinstimmung < 0,0000001 cm) gegen die dokumentierte Ramanujan-Näherung verglichen. Die messbare Abweichung bei 50 × 600 cm ist H-007, kein ohne Fachregel bestätigtes Preisissue.
- 29 Payloads lokal mit der aktuellen internen Mail-Vorlage gerendert: keine Mengenwarnung. Das prüft weder ein vollständiges Shopify-Orderobjekt noch Admin-Deployment oder Versand. Eine fehlende Servicezeile wie in TP-005 wird durch die Materialmengenprüfung nicht erkannt.
- Sechs Themequellen hashgleich zum historischen Live-Snapshot; Mail außerhalb des Theme-Manifests separat gehasht. Kein aktuelles MAIN-/Produkt-/Bestandslesen, keine Wiederholung bereits abgeschlossener PR-001–020.

`reproductionStatus: PASS` bedeutet die erfolgreiche Diagnoseausführung, einschließlich des bedingten TP-005-Ausfalls. Kein Fix und keine Live-Abnahme. Lesbare Zusammenfassung: `einfass-pricing-summary-2026-09-20.md`.

## S04 – PR-022 Haftunterlage

`underlay-pricing-2026-09-20.json`, erzeugt durch `node audit/scripts/reproduce-underlay-pricing.mjs`, enthält 61 lokale Integrationsfälle und 198.468 unabhängige Grenzvergleiche. 54 Requests abgefangen, sieben ungültige Hauptkonfigurationen ohne Request. Keine neue Serverantwort/Cartmutation und kein Mailrendering in diesem Schritt.

- Originale Liquid-Zuweisungen und vollständiger JSON-Datenvertrag des Rollenblocks mit LiquidJS ausgeführt; echtes lokales Farbsnippet, `json`-Filter adaptiert, `doc` nur beim Einlesen entfernt. Das ist kein Shopify-Liquid-Livetest.
- Originale Auswahl-/Eingabe-/Extras-/Berechnungs-/Submitfunktionen plus Rollenart-Asset in minimalem DOM-Adapter. Layout, Zeichnung, Section-Lifecycle, Service-UI, echte Farb-/Art-/Breitenereignisse und Meterware-Tipp sind ausgeblendet. Hauptvariantenkonfiguration isoliert vorgegeben. Gültige Kombinationsfälle ergänzen frühere Tests; abgeschlossene S01–S03-Scripts nicht erneut ausgeführt.
- Alle IDs synthetisch. Basis-Unterlagenkatalog 80/120/180/200 cm zu 935/1400/1900/2400 Cent je lfm ausschließlich ein Rechenfixture. Historischer 80-cm-/5-Bahnen-/10-lfm-Hinweis und Mindestpreis 935 Cent erlauben keine konkrete Preis-/Variantenzuordnung. Andere Kataloge sind ausdrücklich hypothetische Kontrollen.
- Grenzprüfung: 447 Breiten (50–495 cm plus 500 cm), 148 Längen um volle Metergrenzen zwischen 100–5.000 cm, drei Kataloge. Originale Kandidatenschleife gegen eigenständige ganzzahlige Breiten-/Längen-/Cent-Rechnung verglichen. Null Abweichungen von der Regel „einzelne Variante, gleiche Bahnen, feste Richtung, volle Meter je Bahn“. Kein Flächen-/Raummaß-Raster aus S02 wiederholt.
- Preisbox/ausgewählte Zusatzpositionen/Gruppenrelation/Eventmenge geprüft. Gruppentoken im gespeicherten Report auf `T-AUDIT` normalisiert. Reale Cart-Gruppenoperationen, Serverbestand und Checkout bleiben offen.
- Vier SHA-256-Vergleiche gegen historische Themequellen bestanden. Keine aktuelle MAIN- oder Produktdatenverifikation. Keine Quelle oder alte Evidence verändert.

`status: PASS` gilt nur für diesen lokalen Prüfbereich. Keine Aussage über bereits dokumentierte offene Issues oder den Gesamtshop. Dreh-/Mischlayoutbeispiele sind H-008 mit fehlendem Produktvertrag, keine als Fehler verkleideten Optimierungsvorschläge. Lesbare Zusammenfassung: `underlay-pricing-summary-2026-09-20.md`.

## S05 – PR-023a separater Wunschmaßpfad

`wunschmass-pricing-2026-09-20.json` und lesbare `wunschmass-pricing-summary-2026-09-20.md`, erzeugt durch `node audit/scripts/reproduce-wunschmass-pricing.mjs`: 46 Fälle, 31 abgefangene Requests, 28 lokale Mailrenderings, zwei historische Hashvergleiche. Vollständiger ursprünglicher Liquidblock und JS-IIFE, ausschließlich `doc`/`schema` beim Lesen entfernt. Alle Daten/IDs/Preise synthetisch; minimaler DOM ohne native Eingabesanitierung, Layout und echte Variantenereignisse. Unabhängige Ganzzahl- und rationale Pi-Intervallrechnung für die Preisreferenzen.

TP-006 belegt auseinanderfallende Dezimalrechnung/Ganzzentimeterproperties und zwei daraus entstehende lokale Mailwarnungen; TP-007 einen zweiten Request nach Input während ausstehender Antwort. Responses/Redirect simuliert, keine echte Shopify-Annahme oder tatsächlicher Versand. Historische Produktprüfungen vom 09./11.09. berichten keine aktive Nutzung; aktuelle Reichweite H-009 offen. Isolierte nichtendliche/Form-ID-/Verfügbarkeitsproben bleiben H-010, kein zusätzlicher bestätigter Livefehler. Quellen/alte Evidence und frühere S01–S04-Läufe unverändert. PASS ist Diagnose, keine Fixabnahme.

## S06 – PR-023b.1 Paketverträge weiterer Produktarten

`package-contracts-2026-09-20.json`, Script `reproduce-package-contracts.mjs`, lesbare `package-contracts-summary-2026-09-20.md`. 17 Fälle, drei Liquid-Gates, 14 abgefangene Requests, 28 Cart-Renderings; zusätzlich drei Klassifikationskontrollen/fünf Templatezuordnungen. Elf Quellhashes stimmen mit historischem Live-Snapshot überein. Vollständiger Paketblock und seine JS-IIFE, ursprüngliche Verkaufsart-/Preis-/Inhalts-/Cart-Snippets. Alle IDs synthetisch; Quadra-Referenz aus historischen Repositorybelegen, Klebe- und Präzisionspreise ausdrücklich lokale Rechenfixtures.

LiquidJS-Geldfilter adaptiert, CSS/doc/schema nur beim Lesen entfernt. Separate Cart-Engine bildet ausschließlich `divided_by:100` als Ganzzahldivision ab; das verhindert einen sonst künstlichen LiquidJS-Formatfehler. TP-008 ist dagegen die echte vorangehende feste Hundertstelrundung: 30,272 → 30,27 m². Menge/Preis unverändert. Responses/Events/Redirect lokal; keine Liveannahme, echtes Layout oder Shopify-Liquid-Abnahme. PVC-/Fixpreiswege nur kartiert, PR-023b.2 weiterhin offen. S01–S05 und deren Evidence unverändert; keine alten Diagnosen erneut ausgeführt.
