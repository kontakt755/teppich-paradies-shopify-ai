# Audit-Testmatrix

Stand: 21.09.2026. Ein Bereich gleichzeitig. Keine Produkt-/Theme-Reparatur.

**PASS (historisch)** = gespeicherte Browser-/API-Beobachtung vom 19.09.; **PASS (lokal)** = aktuelle deterministische Prüfung. **FAIL bestätigt** = Issue beobachtet, nicht behoben. **OFFEN** = keine Aussage zur Funktion. Ein bestandener Reproduktionslauf bedeutet nicht, dass die darin nachgewiesenen Fehler behoben sind.

| ID | Fall / Soll | Ebene / tatsächliches Ergebnis | Status / Evidence |
| --- | --- | --- | --- |
| PR-001 | Marlow, 20 m², 5 %, Paket 2,08 m², Paketpreis 10.598 Cent | 11 Pakete, 22,88 m², 116.578 Cent; historische Anzeige, Payload, Cart und lokale Ausführung stimmen überein | PASS historisch 1440/390 + lokal; runtime `package add 20` |
| PR-002 | `1,5` und `1.5` | Lokal identisch: Bedarf 1,50, 1 Paket. Komma historisch an beiden Viewports | PASS lokal; Komma auch historisch |
| PR-003 | Leer/0/negativ, Blur | Ein Paket bleibt kaufbar, Feld leer. Bewusster Ruhezustand | PASS historisch + lokal; keine unerwünschte Änderung vorschlagen |
| PR-004 | `1.234,56`, `20abc` vollständig validieren | Teilzahl/Rest wird still übernommen | FAIL bestätigt TP-001, historisch beide Viewports + lokal |
| PR-005 | Infinity / große Zahl nicht bestellbar berechnen | Infinity-Anzeige; lokal JSON-Menge null bzw. unsichere Ganzzahl; historisch Mobile-Überlauf bei großer Zahl | FAIL bestätigt TP-002; Serverantwort auf ungültige Menge OFFEN |
| PR-006 | 20 m² ohne Reserve / exakt 20,8 m² | Ohne Reserve jeweils 10 Pakete, 20,8 mit 5 % → 11 | PASS lokal; neue Live-Prüfung OFFEN |
| PR-007 | Start und manuell ein Paket erhöhen | Start 1 Paket, +1 → 2; Originalcode ausgeführt | PASS lokal; DOM-Adapter beweist keine echten Pointer-/Browserereignisse |
| PR-008 | Piumera 400 × 200 cm, 65,90 €/m² | Hauptware Menge 8, 52.720 Cent; Anzeige und historische Cart-Antwort stimmen | PASS historisch 1440/390 + lokale Hauptmenge |
| PR-009 | Ausgewählte Fußleiste, Länge löschen | HTTP 200, nur Hauptware, Fußleiste fehlt | FAIL bestätigt TP-003, historisch 1440/390 + lokal |
| PR-010 | Fußleiste 12 m / 2,5 m / abgewählt | Lokal 12 × 1.095 = 13.140 Cent; 2,5 → 3 m; abgewählt nur Hauptware; gültige Extras mit Gruppe | PASS lokal, Service-ID im Adapter synthetisch; neue Live-Prüfung OFFEN |
| PR-011 | Fußleiste ausgewählt, Länge 0/-1 | Ebenfalls Hauptsubmit ohne Fußleiste | FAIL TP-003 lokal; historischer Live-Nachweis beschränkt auf leer |
| PR-020 | Raummaß-Rundung, volle m² vs. Hundertstel | Lokal abgeschlossen: 2.185.846 ganzzahlige Maße je Modus; volle m² korrekt, 3.310 exakte Halbgrenzen im cmExact-Modus um eine Einheit zu niedrig | FAIL lokal TP-004; Live-Verwendung offen H-005; `room-pricing-2026-09-20.json` |
| PR-020a | Preisbox, Maß-/Flächen-Properties und tatsächlich erzeugter Request | 35 lokale Integrationsfälle: 29 erzeugen erwarteten einzelnen Request, 6 ungültige Grenzen/Leerwerte keinen; Gesamtpreis entspricht Payload-Cents, TP-004-Menge trotzdem falsch | PASS für Konsistenz/Grenzen; FAIL für bedingte Rundungsregel, kein realer Shopify-Request |
| PR-020b | Regeltreue der internen Bestellmail am originalen Raummaß-Payload | Bei 250 × 333 cm / cmExact meldet LiquidJS „MENGE ZU KLEIN“ / „NICHT ZUSCHNEIDEN“; 832 statt 833 Einheiten. Gültige Nichtfehlerfälle ohne Mengenwarnung | Bestätigte lokale Folge von TP-004; Shopify-Rendering/Versand/Deployment nicht geprüft |
| PR-020c | Volle Rollenbreiten und 5-cm-Zugabe | 19.604 Maßpaare für 200/300/400/500 cm in beiden Mengenmodi korrekt; Raummaß 395/396 cm wählt 400-/500-cm-Rolle ohne Zugabe zur berechneten Fläche | PASS lokal, keine Preis-/Metafeldänderung |
| PR-020d | Meterware-Preisvergleich | Originaler Tipp folgt derselben Rundung; bei 350 × 129 cm nennt er 401,39 € Raummaß statt regelkonformer 402,28 € im cmExact-Fixture | Lokale Folge von TP-004; kein zusätzliches Issue |
| PR-021 | Einfass-Konfigurator Material, Kante, Mindestpreis bis Payload | 47 lokale Fälle abgeschlossen; 29 Requests abgefangen, 13 JS-Zustände blockiert, fünf Liquid-Gates. Historische Rechteck-Preisreferenz und synthetische andere Formen/Arten klar getrennt | PASS lokal im gültigen Servicepfad; FAIL bedingt TP-005; `einfass-pricing-2026-09-20.json` |
| PR-021a | Referenz/Mindestpreis/Aufrundung | 200 × 300 → 600 Material + 1.000 Kante = 724,00 €; 50 × 50 → 69 + 200 = 99,41 €. Mindestpreis als Zahl/Geldobjekt, knapp darüber/darunter; 201 × 301 → 606 und 365 × 302 → 1103 Materialeinheiten | PASS lokal; keine neuen realen Cart-/Preisbelege |
| PR-021b | Formen/Rotation/Grenzen/Bandwahl | Rechteck 350 × 420 und 420 × 350 gleich; Rund/Oval nach umschließendem Rechteck; Cover mit vorbereiteter maxW=390; Band fehlt → kein Request; ungültige Maße/Variante/Anfrage blockiert | PASS lokal; SVG, echte Browserfelder/Picker und reale Formfreigaben offen |
| PR-021c | Konfigurierter separater Kettelservice nicht verfügbar | Original-Liquid erzeugt kettel=null, JS lässt Material ohne Kettelzeile für 534,00 € mit „Gekettelt“ zu | FAIL lokal TP-005; heutiger Shopzustand offen H-006 |
| PR-021d | Properties, Gruppe, Mail und direkter Doppelsubmit | Mengen/Flächen-/Mindestpreis-Properties passend, zwei Zeilen gleiche Gruppe; 29 lokale Mailrenderings ohne Mengenwarnung; Doppelsubmit mit zwischenzeitlicher Neuberechnung bleibt ein Request | PASS lokal; Zuschnittabgleich als erfolgreich simuliert, echter Cart/Drawer/Checkout offen |
| PR-021e | Oval-Näherung | 200 × 300 → 793 Einheiten; synthetisch 50 × 600 → 1213 statt geometrisch 1214 durch dokumentierte Ramanujan-Näherung | H-007 fachlich offen, kein weiterer bestätigter Fehler |
| PR-022 | Haftunterlage: Datenvertrag, Breite, Bahnen, laufende Meter, Kombination | Lokal abgeschlossen: 61 Integrationsfälle, 54 abgefangene Requests, sieben blockierte Hauptkonfigurationen; 198.468 unabhängige Auswahl-/Grenzvergleiche | PASS lokal für festgelegte Bahnenregel; Live-Produktvertrag H-008 offen; `underlay-pricing-2026-09-20.json` |
| PR-022a | Günstigste einzelne Variante | Vierbreitenkatalog und Gegenbeispiel niedrigster Meterpreis ≠ niedrigster Gesamtpreis. 400 × 200 mit Testpreisen 80 cm/10 € und 200 cm/21 € wählt korrekt 4 m der 200er-Breite für 84 € | PASS lokal, Preise synthetisch |
| PR-022b | Maß-/Meterränder und echte Unterlagenmenge | 447 Breiten × 148 Längen an vollen Metergrenzen × drei Kataloge; keine Mengen-/Centabweichung. 400 × 201 im Basisfixture → 5 Bahnen/15 lfm; jeder Streifen auf volle Meter | PASS lokal; keine Behauptung einer frei optimierten Verlegung |
| PR-022c | Liquid-Verfügbarkeit, Freigabe und Titelbreite | Nicht verfügbare/0-/negativ bepreiste Varianten fallen vor JS weg; Titel ohne erkannte cm-Breite fallen im JS weg; nur exakte Hauptvariantenfreigabe „Verfügbar“ erlaubt Zubehör | PASS lokal; isolierte Zustände, keine echten Farb-/Artwechsel getestet |
| PR-022d | Gemeinsame Preisbox/Properties/Gruppe | Hauptware 527,20 € + gültige Fußleiste 131,40 € + Unterlage 93,50 € = 752,10 € im Fixture, drei Positionen gleiche Gruppe. Eigenlänge/abgewählte Extras/hohe Mengen und Doppelsubmit geprüft | PASS lokal; Eventmenge entspricht Summe aller Payloadmengen; realer Cart bleibt offen |
| PR-022e | Rotation und gemischte Breiten | Alternative synthetische Verlegungen rechnerisch günstiger; aktuelle Materialien/Zuschnittfreigabe nicht belegt | H-008 offen, kein zusätzliches Issue und kein Fix-Auftrag |
| PR-023a | Separater Teppich-Wunschmaßpfad | 46 lokale Fälle, 31 abgefangene Requests; vollständiger Liquidblock/JS-IIFE. Historisch kein aktives Produkt, heutige Nutzung H-009 | Lokal abgeschlossen; Preisreferenzen PASS, TP-006/007 bedingt FAIL; `wunschmass-pricing-2026-09-20.json` |
| PR-023a.1 | Echte Formfläche, Hundertstel, Mindestpreis/Zuschlag | Rechteck 200×300 → 600; Quadrat 150 → 225; Kreis 200 → 315; Oval 200×300 → 472. Mindestpreis 99 € bei 89 Cent → 112 Einheiten; Zuschlag 10 € → 12 Extraeinheiten | PASS lokal gegen unabhängige Ganzzahl-/Pi-Schrankenrechnung, alle Produktwerte synthetisch |
| PR-023a.2 | Liquid-Gate, Maßgrenzen, Mindestfläche, Preis 0 | Drei Gatefälle unsichtbar; 13 ungültige Konfigurationen ohne Request. 28 endliche Einzelpayloads lokal mit Mail geprüft | PASS für Gültigkeitskontrollen; native Browserzahleneingabe offen |
| PR-023a.3 | Dezimalmaße bleiben in Bestellung konsistent | 200.5×300 → 602 Einheiten, aber Properties 201×300 → Mail erwartet 603. Auch 150.5 Quadrat warnt. 200.4/Kreis/Oval verlieren ebenfalls Dezimalmaß | FAIL lokal TP-006; tatsächliche Browser-/Live-Reichweite H-009 |
| PR-023a.4 | Submit während laufendem Request | Direkter zweiter Klick gesperrt; nach Input 200→201 Button wieder aktiv, zwei abgefangene Requests 600/603 | FAIL lokal TP-007; keine Serverannahme behauptet |
| PR-023a.5 | Formular-/Verfügbarkeits-/Grenzdaten | Bekanntes Formularfixture aktualisiert Preis/ID; fremde ID, unverfügbare Variante und fehlende Maxima isoliert geprüft | H-010, keine neuen bestätigten Shopissues ohne Produkt-/DOM-Nachweis |
| PR-023b | Weitere Produktarten: Klebevinyl/Teppichfliesen/PVC/Fixpreis | Paketverträge PR-023b.1 und PVC-/Stückpayloads PR-023b.2 lokal abgeschlossen | Lokale Vertragsprüfung abgeschlossen; TP-008/009, aktuelle Daten und Browserintegration H-011 |
| PR-023b.1 | Klebe-/Teppichfliesenvertrag Liquid → JS → Payload → Preis-/Cartansichten | 17 Fälle, drei unsichtbare Gates, 14 Requests abgefangen, 28 Cart-Renderings. Quadra 4 Pakete/80 Fliesen/20,00 m²/1.178,00 €, Klebe-Fixture 6/20,04/620,22 € | PASS lokal für Geld-/Mengenvertrag; TP-008 für dreistellige Cart-Fläche; `package-contracts-2026-09-20.json` |
| PR-023b.1a | Paketvorrang und Stückdaten | Paketmetafeld dominiert widersprüchliche Rollenbreite/Produkttyp; fehlende Stückdaten fehlen auch im HTML, kein Fallback | PASS lokal, keine Produktdatenänderung |
| PR-023b.1b | Varianten- und Cartmengenübergang | Passendes Ereignis aktualisiert ID/Preis, fremdes ignoriert; Cart berechnet aus aktueller Zeilenmenge trotz alter Properties | PASS im Adapter/Original-Liquid; kein echter Picker-/Cart-Ajax-Nachweis |
| PR-023b.1c | Drei Stellen in Flächenanzeige erhalten | 1×0,794 → 0,79 statt 0,794; 2×0,794 → 1,59 statt 1,588; 16×1,892 → 30,27 statt 30,272 m² | FAIL lokal TP-008, Paketanzahl/Cent-Summe korrekt; aktuelle Produktreichweite H-011 |
| PR-023b.2 | PVC-/Fixpreis-/Stückpayloads | 30 lokale Integrationen, 26 Requests; Liquid → Originalrollenfunktionen bzw. Mengenhilfe → Standardform und fetchConfig | Lokal abgeschlossen; `roll-fixed-contracts-2026-09-21.json`, TP-009 FAIL |
| PR-023b.2a | Meteroptionen mehrerer Rollenbreiten | 4,00 m × 250 cm sendet fünf statt zehn m² und Property 200 cm; richtige Varianten-ID. Umgekehrte Reihenfolge zehn statt fünf | FAIL lokal TP-009, aktuelle PVC-Daten H-011 |
| PR-023b.2b | cm-Optionen / Einzelbreite / ungültiger Zustand | 200/400 cm richtig; einzelner 4-m-Fallback richtig; nicht verfügbare Variante und leere Länge ohne Request | PASS lokal; kein echter Picker-/Browsernachweis |
| PR-023b.2c | Leisten/Profile/Band/Unterlage/Gebinde bis Standardform | 20 Fälle/18 Requests; ganze Mengen, ID, unverändertes manuelles Feld ohne belegte Einheit; Button-/vorgegebener Max-Guard blockieren | PASS lokal; tatsächliche Max-Regel/Bestände, native FormData/DOM und Antwortverarbeitung nicht geprüft |
| CART-001 | Paket-Cartdarstellung und Checkout erreichbar | Historisch 11 Pakete/22,88 m²/1.165,78 €, Checkoutseite mit Kontaktfeld erreichbar | PASS historisch, kein Kaufabschluss, keine vollständige Checkout-QA |
| CART-002 | Menge ändern, entfernen, erneut öffnen; gemischte/gruppierte Positionen | CART-002a lokal abgeschlossen; Mengenereignisse/Antwortreihenfolge/Sectionabläufe CART-002b folgen | TEILWEISE; echte Browser-/Checkoutabnahme offen |
| CART-002a | Gruppen, Mengensperren, Entfernen, Zuschnittabgleich | 43 Fälle, 35 Zeilenrenderings, 28 Mengenklammern, 34 Requests; zehn Quellhashvergleiche | Lokal abgeschlossen; `cart-core-2026-09-21.json`, TP-010 FAIL |
| CART-002a.1 | Original-Liquid vs. JS, Kundeneinheit und Mengenfeld | 20 Cartzustände; 35 Zeilen und 28 berechnete Mengen via Original-Selector min=max gesperrt; Stück/Paket änderbar | PASS lokal, keine native Browser-/Serversperre |
| CART-002a.2 | Gruppen-/Einzellöschung bis Request | Originalklasse nutzt alle Gruppenkeys für update, Einzelzeile/Änderung für change; Drawerpfad/Checkoutmarker kontrolliert | PASS lokal im Erfolgsvertrag, Morph/DOMParser modelliert |
| CART-002a.3 | Fehler bei Entfernen | Sechs Fehlerfälle: Gruppen-/Stück-/letzte Gruppe, JSON-errors/Netzwerk, reduzierte Bewegung/Animation nach Antwort; keine Wiederherstellung, Fehler unsichtbar | FAIL lokal TP-010, Browserreichweite H-012 |
| CART-002a.4 | Zuschnittattribute, HTTP-Fehler, Gegenprobe, Queue | Zehn Abläufe: schreiben/löschen/erhalten, fehlende Übernahme abgelehnt, Retry erholt Queue, eigene Events ohne Schleife | PASS lokal, Requests/Responses synthetisch; UI-Liquid kein Shopify-Validation-Nachweis |
| CART-002b | Mengenereignisse/Antwortreihenfolge/Section-/Drawerzustand | Ereignisse lokal b.1 abgeschlossen; Antwort-/Section-/Drawerabläufe b.2 offen | TEILWEISE |
| CART-002b.1 | Originalselektor → Event → Debounce → Request | Zwölf Fälle/elf Requests/fünf Hashvergleiche. Gleiche Zeile korrekt zusammengefasst, verschiedene Ziele gehen verloren | Lokal abgeschlossen; `cart-events-2026-09-21.json`, TP-011 FAIL |
| CART-002b.1a | Zwei Zeilen bei 0/100 bzw. 0/299 ms | Nur letztes Ziel im Request, beide Eingabefelder lokal geändert; Reihenfolge umgedreht gleicher Verlust | FAIL lokal TP-011 |
| CART-002b.1b | Fremdes Ereignis während eigener Wartezeit | Vorheriger Cartrequest ganz verworfen; auch zwei modellierte Cart-Komponenten betroffen | FAIL lokal TP-011; konkrete DOM-Reichweite H-012 |
| CART-002b.1c | Gleiche Zeile / einzelnes fremdes Ereignis / 301 ms | Letzter Wert derselben Zeile erhalten; fremdes isoliert ignoriert; Timerkontrolle über 301 ms beide Requests | PASS lokal; ausstehende Responses und direkte Methodenaufrufe sind kein Browsernachweis |
| CART-002b.2 | **NÄCHSTER SCHRITT:** Antwortreihenfolge/Zeilenidentität/Sections/Drawer | SectionRenderer und Drawer gelesen, noch nicht ausgeführt | OFFEN |
| CALC-001 | Sämtliche Maßgrenzen, Komma/Punkt, leer, 0, negativ, Maxima | Teilprüfungen PR-008–011 sind kein vollständiger Rechnertest | OFFEN nach Warenkorb |
| VAR-001 | Schneller Farb-/Artwechsel, Verfügbarkeit, Preis/ID, Zurück/Reload | Noch keine vollständigen Ablaufprüfungen | OFFEN |
| RUN-001 | JavaScript-Konsole / Exceptions / Netzwerk | Historische `exceptions`-Einträge leer; keine vollständige Netzwerk-/Console-Abdeckung | TEILBELEG, übriges OFFEN |
| MOB-001 | Mobile ca. 390 px, Menü, Galerie, Rechner, Cart | Historische Referenzseiten ohne Überlauf außer TP-002; kein umfassender Mobile-Audit | OFFEN |
| NAV-001 | Suche/Autosuggest, Desktop-/Mobile-Menü, Links/404 | Nicht bearbeitet | OFFEN |
| SEO-001 | Canonical/Metadaten/strukturierte Daten/Google/Merchant | Nicht bearbeitet | OFFEN |
| PERF-001 | Ladeverhalten, JS-Dopplung, Bilder, langsame Verbindung | Nicht bearbeitet | OFFEN |
| UX-001 | Verlegeservice, Visualisierer, Muster/Galerie, Kaufhilfen/A11y | Nicht bearbeitet | OFFEN |
| CROSS-001 | Featurekombinationen, Reload/Zurück/Sessionzustand | Nicht bearbeitet | OFFEN |
| REG-001 | Finaler Regressionstest inkl. aller P0/P1 und Bereiche | Erst nach restlichem Audit/Fix-/QA-Phasen | OFFEN |

## Ausgeführte lokale Checks

- `node audit/scripts/reproduce-pricing.mjs`: 21 Originalcode-Ausführungen, historische Kontrollbelege und zwei SHA-256-Abgleiche bestanden. Ausgabe: `evidence/pricing-reproduction-2026-09-20.json`.
- `node --test --test-concurrency=1 qa/tests/rollware-art.test.mjs qa/tests/masstepich-rechnung.test.mjs qa/tests/bestellmail-masspruefung.test.mjs`: **55/55 PASS**, 0 fail/skip. Ausgabe: `evidence/pricing-unit-tests-2026-09-20.log`.
- Keine neue Theme-Änderung; ein vollständiger `npm run qa`-/Theme-Check-Lauf ist für diese reine Dokumentation nicht erforderlich. Neue Browsernachweise konnten wegen Infrastruktur nicht erstellt werden.
- S02: `node audit/scripts/reproduce-room-pricing.mjs` – 35 Originalcode-Integrationsfälle mit lokalem LiquidJS-Rendering, Ganzzahlraster und zwei historischen Hashvergleichen bestanden; TP-004 reproduziert. Ausgabe: `evidence/room-pricing-2026-09-20.json`. Die 55 S01-Tests und PR-001–011 nicht erneut ausgeführt.
- S03: `node audit/scripts/reproduce-einfass-pricing.mjs` – 47 Fälle, Original-Liquid-Datenvertrag mit originalen Farb-/Bandsnippets, originale Auswahl-/Rechnen-/Submit-Funktionen und TPMass. Sechs historische Hashvergleiche; 29 Requests abgefangen und lokal in die Mail gegeben; TP-005 reproduziert. Ausgabe: `evidence/einfass-pricing-2026-09-20.json`. Syntax, Dokumentkonsistenz und gezielter Secret-Scan in S03-Protokollen. Kein erneuter S01-/S02-Testlauf.
- S04: `node --check audit/scripts/reproduce-underlay-pricing.mjs` und `node audit/scripts/reproduce-underlay-pricing.mjs` bestanden. 61 Fälle mit originalem Liquid-Datenvertrag/JS inkl. Kombination, 198.468 unabhängige Grenzvergleiche, vier historische Hashvergleiche. Ausgabe: `evidence/underlay-pricing-2026-09-20.json`. Kein neuer bestätigter Fehler, kein Replay von S01–S03. S04-Dokument-/Evidence-Konsistenz und Secret-Scan separat protokolliert.

- S05: `node --check audit/scripts/reproduce-wunschmass-pricing.mjs` und Originalblock-Ausführung auf Anhieb bestanden: 46 Fälle, 31 Requests abgefangen, 28 lokale Mailrenderings, zwei historische Hashvergleiche. TP-006/007 reproduziert, keine Produkt-/Shopänderung und kein S01–S04-Replay. Integritäts- und Secret-Scan-Protokolle separat.

- S06: `node --check audit/scripts/reproduce-package-contracts.mjs` und Diagnoselauf bestanden; 17 Fälle, 14 Requests abgefangen, 28 Cart-Renderings, drei ergänzende Klassifikationen, fünf Templatezuordnungen, elf historische Hashvergleiche. Zweiter Lauf nach konsistentem Stückfixture und zusätzlicher HTML-Gateassertion ebenfalls bestanden; keine S01–S05-Replays. TP-008 reproduziert.

- S07: `node --check audit/scripts/reproduce-roll-fixed-contracts.mjs` und Diagnoselauf PASS (30 Fälle/26 Requests/neun Hashvergleiche). Erneuter Lauf nach originaler syncArtUi und Propertyassertion ebenfalls PASS; TP-009 reproduziert. `node --test --test-concurrency=1 qa/tests/zubehoer-menge.test.mjs`: **7/7 PASS**. Keine S01–S06-Replays. Keine Produktänderung oder echter Request. S07-Dokument-/Secretprotokolle separat.

- S08: vier vorhandene Cart-Suiten (cart-gruppen/cart-mengensperre/cart-waisen/zuschnitt-abgleich) **47/47 PASS**. Syntax/erster Originalcode-Diagnoselauf bestanden; nach Fehlercontainer-Hierarchie und verzögerten Animationen zweiter Lauf bestanden: 43 Fälle/34 Requests, TP-010 bestätigt. Keine S01–S07-Replays. Dokument-/Secretchecks in S08-Protokollen.

- S09: `node --check audit/scripts/reproduce-cart-events.mjs` und erster Diagnoselauf PASS: zwölf Fälle, elf Requests, fünf Defektfälle TP-011 und fünf historische Hashvergleiche. Kein Replay der 47 S08-Tests oder älterer Preisdiagnosen. Integritäts-/Secretprotokolle separat.

## Wiederholungsregeln

Abgeschlossene PR-001–011 und lokale PR-020–023a sowie PR-023b.1/b.2 und CART-002a/b.1 nicht erneut auditieren, solange relevante Quellen unverändert sind. H-005/006/008 sind fehlende Live-/Fachdatenprüfungen, kein Anlass, reine Mathematik erneut laufen zu lassen. Vor späterer Fix-Abnahme Live-Theme frisch identifizieren, Quellen abgleichen und betroffene Fälle dann gezielt wiederholen. Die 55 Unit-Tests belegen nur ihren Codeumfang, nicht alle Shop-Szenarien. Ungültige Mengen vor echten Requests abfangen; keinen Checkout abschließen.


## S10 / CART-002b.2a

S10 / CART-002b.2a lokal abgeschlossen: fünf Original-SectionRenderer-Fälle, zwei Defektfälle TP-012/P2, ein historischer Hashvergleich. Nach Fetch-/Bodyfehler starten drei Retries derselben URL keinen neuen Request. Andere Section funktioniert. Erfolgs-Deduplizierung, Cache/Forced Refresh und Schutz gegen alte Antworten bei beiden Antwortreihenfolgen bestanden. DOM/Parser/Morph adaptiert; kein Browser-/Livebeleg, keine Shopreparatur. Nächster Schritt CART-002b.2b: direkte Cartantworten, Zeilenidentität und Zusammenspiel mit SectionRenderer, danach Drawer/Dialog-Lifecycle. Keine bisherigen Diagnosen ohne Quelländerung wiederholen.

Syntaxcheck und erster Diagnoselauf PASS. Fünf Fälle: Fetchfehler mit drei Retries, Bodyfehler mit drei Retries, Deduplizierung/Cache/Refresh, neue Antwort zuerst, alte Antwort zuerst. Keine vorhandene SectionRenderer-Testsuite in git ls-files gefunden. Ältere Tests nicht erneut ausgeführt.
