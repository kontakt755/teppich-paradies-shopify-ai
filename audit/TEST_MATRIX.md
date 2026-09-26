# Audit-Testmatrix

Stand: 22.09.2026. Ein Bereich gleichzeitig. Keine Produkt-/Theme-Reparatur.

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
| CART-002 | Menge ändern, entfernen, erneut öffnen; gemischte/gruppierte Positionen | CART-002a/b und CART-003 lokal abgeschlossen; echte Browser-/Checkoutabnahme H-012–015 bleibt offen | TEILWEISE; echte Browser-/Checkoutabnahme offen |
| CART-002a | Gruppen, Mengensperren, Entfernen, Zuschnittabgleich | 43 Fälle, 35 Zeilenrenderings, 28 Mengenklammern, 34 Requests; zehn Quellhashvergleiche | Lokal abgeschlossen; `cart-core-2026-09-21.json`, TP-010 FAIL |
| CART-002a.1 | Original-Liquid vs. JS, Kundeneinheit und Mengenfeld | 20 Cartzustände; 35 Zeilen und 28 berechnete Mengen via Original-Selector min=max gesperrt; Stück/Paket änderbar | PASS lokal, keine native Browser-/Serversperre |
| CART-002a.2 | Gruppen-/Einzellöschung bis Request | Originalklasse nutzt alle Gruppenkeys für update, Einzelzeile/Änderung für change; Drawerpfad/Checkoutmarker kontrolliert | PASS lokal im Erfolgsvertrag, Morph/DOMParser modelliert |
| CART-002a.3 | Fehler bei Entfernen | Sechs Fehlerfälle: Gruppen-/Stück-/letzte Gruppe, JSON-errors/Netzwerk, reduzierte Bewegung/Animation nach Antwort; keine Wiederherstellung, Fehler unsichtbar | FAIL lokal TP-010, Browserreichweite H-012 |
| CART-002a.4 | Zuschnittattribute, HTTP-Fehler, Gegenprobe, Queue | Zehn Abläufe: schreiben/löschen/erhalten, fehlende Übernahme abgelehnt, Retry erholt Queue, eigene Events ohne Schleife | PASS lokal, Requests/Responses synthetisch; UI-Liquid kein Shopify-Validation-Nachweis |
| CART-002b | Mengenereignisse/Antwortreihenfolge/Section-/Drawerzustand | Ereignisse, Antworten, SectionRenderer und Drawer lokal S09–S12 abgeschlossen | TEILWEISE |
| CART-002b.1 | Originalselektor → Event → Debounce → Request | Zwölf Fälle/elf Requests/fünf Hashvergleiche. Gleiche Zeile korrekt zusammengefasst, verschiedene Ziele gehen verloren | Lokal abgeschlossen; `cart-events-2026-09-21.json`, TP-011 FAIL |
| CART-002b.1a | Zwei Zeilen bei 0/100 bzw. 0/299 ms | Nur letztes Ziel im Request, beide Eingabefelder lokal geändert; Reihenfolge umgedreht gleicher Verlust | FAIL lokal TP-011 |
| CART-002b.1b | Fremdes Ereignis während eigener Wartezeit | Vorheriger Cartrequest ganz verworfen; auch zwei modellierte Cart-Komponenten betroffen | FAIL lokal TP-011; konkrete DOM-Reichweite H-012 |
| CART-002b.1c | Gleiche Zeile / einzelnes fremdes Ereignis / 301 ms | Letzter Wert derselben Zeile erhalten; fremdes isoliert ignoriert; Timerkontrolle über 301 ms beide Requests | PASS lokal; ausstehende Responses und direkte Methodenaufrufe sind kein Browsernachweis |
| CART-002b.2 | Antworten/Zeilenidentität/Sections/Drawer | S10 fünf, S11 acht, S12 elf lokale Fälle; TP-012 sowie H-013/014 | LOKAL ABGESCHLOSSEN; Browser offen |
| CART-003 | Checkout, Rabatt, Notiz | S13 neun, S14 sechs, S15 sechs, S16 sieben lokale Fälle; TP-013/014 | LOKAL ABGESCHLOSSEN; native Validierung/Express/Persistenz offen |
| CART-004 | Konsolidierung/Übergabe | S17 kleines Rabattpaket erstellt, keine Implementierung | ABGESCHLOSSEN |
| CART-LIVE | Native DOM-/History-/Fokus-/Express-/Serverprüfung | H-012–015; S13 Browserberechtigungsablehnung | BLOCKIERT, erst nach geänderter Berechtigung |
| CALC-001 | Sämtliche Maßgrenzen, Komma/Punkt, leer, 0, negativ, Maxima | PR-020–023 und Eingabe-Mathematik lokal fertig; verbleibende Zustands-/Auswahlwechsel CALC-001a | OFFEN: CALC-001a nächster Schritt |
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


## S11 – Direkte Cartantworten und Zeilenidentität

S11 / CART-002b.2b lokal abgeschlossen: acht Originalcode-Antwortfälle, vier historische SHA-256-Vergleiche, Syntax und Erstlauf PASS. Direkte Erfolgsantworten auf Cartseite/Drawer verwenden full/hydration korrekt; stabiler Fehlerindex setzt Eingabe zurück und zeigt Feedback. Bei zwei programmatisch gestarteten Mutationen entsperrt schon die erste Antwort; verspätete ältere Antwort kann jüngere überschreiben. Ein durch Original-DiscountEvent gestarteter Section-Request kann nach neuer direkter Cartantwort noch morphieren. Bei manuell verschobenen Refs landet Fehlerfeedback am früheren Index und damit anderer Zeile. Diese Überschneidungen sind H-013, keine zusätzlich bestätigten Shopissues: Pointer-/Debounce-Erreichbarkeit, Server-Snapshotreihenfolge, echte MutationObserver-/Morphabläufe fehlen. Keine Shopänderung, keine S01–S10-Replays.

Evidence: `audit/evidence/cart-responses-2026-09-21.json`; Script: `audit/scripts/reproduce-cart-responses.mjs`. Route TASK-6FFC7626F671, B/STATIC; kein Executor/Agent gestartet.

Nächster konkreter Schritt: CART-002b.2c: assets/cart-drawer.js und assets/dialog.js mit events.js auf Eventtypen, Öffnen/Schließen, History-/Disconnect-Lifecycle prüfen. Danach H-012/H-013 im echten Browser bei verfügbarem Runner; keine abgeschlossenen lokalen Response-/Retry-/Debouncefälle ohne Quellenänderung wiederholen.


## S12 – Drawer-/Dialog-Lifecycle

S12 / CART-002b.2c lokal abgeschlossen: elf Originalcode-Lifecyclefälle, fünf historische Quellhashvergleiche, Syntax/Erstlauf PASS. Desktop/Mobile öffnen und schließen, Scrollstil/-position, modelliertes Back ohne doppelten Rücksprung, Disconnect/Reconnect der Listener und Sticky-Schwellen funktionieren in den Fixtures. Allgemeines CartUpdateEvent öffnet ebenfalls bei auto-open; die erste Zählansage bleibt leer, weil Öffnen erst im RAF erfolgt. Close/Disconnect vor diesem RAF verhindert dessen spätere Ausführung nicht. Letztere Beobachtungen bleiben H-014: natives Dialog-/Fokus-/Attach-/Historyverhalten und reale Erreichbarkeit nicht belegt. Keine neue bestätigte Issue-ID, keine Reparatur, keine früheren Diagnosen wiederholt.

Evidence: `audit/evidence/drawer-lifecycle-2026-09-21.json`; Script: `audit/scripts/reproduce-drawer-lifecycle.mjs`. Originale Klassen und Utilityfunktionen; modellierte Element-/History-/RAF-Umgebung, leere Animationsliste. Keine Native-Dialog-/Fokusabnahme. Route TASK-EECCC76EC036 B/STATIC; kein Executor.

Nächster konkreter Schritt: CART-003: Browserfähigkeit einmal neu prüfen (S01-Sperre ist historisch). Verfügbaren Browser nach Skill verwenden, öffentlichen Shop ohne Kaufabschluss zunächst rein lesend auf Drawer-Öffnen/Schließen, Fokus/Escape, Mobile Back/Reload und H-014 prüfen; Live-Theme vor livebezogenen Schlussfolgerungen aktuell verifizieren. Falls Browserzugriff weiterhin blockiert, Grenze konkret dokumentieren und sequenziell lokale Checkout-/Express-/Formularverträge prüfen. Keine S08–S12-Replays ohne Quelländerung.


## S13 – Checkoutvertrag und Browserberechtigung (22.09.2026)

S13 / CART-003a: Browserzugang neu geprüft. Chrome-Verbindung verfügbar, Navigation zum öffentlichen Shop jedoch durch Browser-Sicherheitsprüfung wegen verweigerter Zugriffsberechtigung abgelehnt. Kein alternativer Zugriff versucht, keine Live-Theme-Verifikation. Anschließend neun lokale Checkout-Vertragsfälle bestanden (acht Original-CTA-Liquidrenderings, ein statischer Formular-/Header-/CSS-Vertrag), vier historische Quellhashvergleiche. Normale CTA verweist auf cart-form; Pflichtsperrfeld innerhalb POST-Formular; Drawer auf Carttemplate ausgeschlossen. Express erfordert Plattformflag und Themeeinstellung. Sperr-CSS setzt pointer-events:none und opacity:0.4, versteckt/deaktiviert Express nicht semantisch. Tastatur-/Expressumgehung bleibt H-015, kein neuer bestätigter Fehler.

Evidence: `audit/evidence/checkout-contracts-2026-09-22.json`, `browser-access-2026-09-22.json`; Script `audit/scripts/reproduce-checkout-contracts.mjs`. Route TASK-56DE810ED955 B/STATIC; kein Executor. Erster Lauf scheiterte an falscher Diagnoseannahme display:none; nach Lesen des CSS wurde ausschließlich die Auditassertion auf pointer-events/opacity korrigiert, zweiter Lauf PASS. Keine Shopreparatur.

Nächster konkreter Schritt: CART-003b: lokale Rabatt-/Cart-Notiz-Verträge in assets/cart-discount.js und assets/cart-note.js sowie snippets/cart-summary.liquid prüfen (Fehler, mehrfaches Absenden, Persistenz/Sections). Browserprüfung H-012–015 erst nach geänderter Zugriffsberechtigung fortsetzen; keine alternative Browser-/HTTP-/CDP-Umgehung oder wiederholte Zugriffsversuche. Vorhandene S08–S13-Diagnosen ohne Quelländerung nicht wiederholen.


## S14 – Rabattfehler (22.09.2026)

S14 / CART-003b.1: sechs Original-Rabattfälle, drei stille Fehlerfälle TP-013/P3, vier historische Quellhashvergleiche. Erfolgreicher Rabatt dispatcht DiscountUpdateEvent und morphiert; nicht anwendbarer Code und Versandrabatt-Sonderfall zeigen vorhandene Fehlermeldung. Netzwerk-, HTTP-Fehler-JSON ohne discount_codes und ungültiges JSON enden ohne sichtbares Feedback. Eingabe bleibt erhalten, expliziter Retry funktioniert. Originalklassen/Utility, DOM/fetch adaptiert; keine Live-Rabattprüfung oder Shopreparatur.

Evidence: `audit/evidence/discount-errors-2026-09-22.json`; Script: `audit/scripts/reproduce-discount-errors.mjs`. Syntax/Erstlauf PASS; Route TASK-70BD752F5C44 B/STATIC, kein Executor. Kein Replay früherer Tests.

Nächster Schritt: CART-003b.2: cart-discount.js Entfernen und überlappende Requests/#activeFetch prüfen; anschließend cart-note.js Debounce/Abbruch/Fehler-/Persistenzvertrag mit cart-summary.liquid. Browser H-012–015 weiterhin berechtigungsbedingt offen; keine Umgehung oder erneute Anfrage ohne geänderte Berechtigung. S01–S14 ohne Quellenänderung nicht wiederholen.


## S15 – Rabattentfernung und Abbruch

S15 / CART-003b.2 lokal abgeschlossen: sechs Originalcodefälle, vier historische Hashvergleiche. Entfernen eines von zwei bzw. des letzten Rabattcodes sendet korrekte verbleibende Codeliste und aktualisiert Event/Section. Netzwerkfehler beim Entfernen erweitert TP-013 (kein Feedback). TP-014/P3: nach Abbruch von Request A durch B löscht A.finally die Referenz auf B; Aktion C bricht B nicht mehr ab. In zwei kontrollierten Folgen (Apply→Apply→Apply und Remove→Apply→Apply) reproduziert. Synthetische Antwortfolge zeigt älteren Morph nach neuem; reale Serverreihenfolge nicht behauptet. Sequentielle Erfolgskontrolle bestanden. Keine Shopreparatur/Liveanfrage.

Evidence: `audit/evidence/discount-concurrency-2026-09-22.json`; Script `audit/scripts/reproduce-discount-concurrency.mjs`. Syntax/Erstlauf PASS, keine S14-Replays. Route TASK-BF056AE4656F B/STATIC; kein Executor. Gemeinsame cart-discount.js für TP-013/014: FILE CONFLICT, kleine abgestimmte Schritte. Native Tastaturaktivierung nicht getestet; Template bindet echten Buttonclick, daher kein Keyboardfehler allein aus KeyboardEvent-Guard behauptet.

Nächster Schritt: CART-003b.3: assets/cart-note.js mit Original-debounce/fetchConfig und snippets/cart-summary.liquid prüfen: Notiz-Debounce, Request-Abbruch/Ownership, HTTP-/Netzfehler, Formular-Persistenz und Disconnect. Rabattfälle S14/S15 ohne Quellenänderung nicht wiederholen. Danach Cart-Audit lokal konsolidieren und offene Browser-/Checkoutabnahme getrennt halten. Browserzugriff bleibt seit S13 berechtigungsbedingt blockiert, keine Umgehung.


## S16 – Warenkorbnotiz

S16 / CART-003b.3: sieben lokale Notizfälle PASS. Original-debounce bündelt Eingaben nach 200 ms; leere und Unicode-Notiz korrekt im Payload. Netzwerk-/HTTP500-Antworten ohne Fehlermeldung, erneute Eingabe startet neuen Request. TP-014 um bedingten Notizpfad erweitert: alter finally löscht neuere Controllerreferenz. Pending Timer läuft nach modelliertem Disconnect weiter; echte DOM-/Serverwirkung offen. Textarea ist name=note mit form=cart-form, daher kein bewiesener Bestellnotizverlust aus Ajaxfehler allein. Lokale Einstellung show_cart_note=false. Vier Code-/Markuphashes historisch identisch; settings_data.json weicht vom historischen Livehash ab, heutige Liveeinstellung nicht verifiziert. Keine Shopänderung.

Evidence: `audit/evidence/cart-note-2026-09-22.json`; Script `audit/scripts/reproduce-cart-note.mjs`. Route TASK-1E9C956DD1CD B/STATIC; kein Executor. Diagnosescript zweimal korrigiert: Konfigurationshash nicht als gleich voraussetzen; Shopify-Kommentar vor JSON-Parsing entfernen. Danach Syntax/Diagnose PASS. Keine alten Diagnosen wiederholt.

Nächster Schritt: CART-004: bisherigen lokalen Cart-Audit konsolidieren, Testmatrix auf offene statt abgeschlossene Fälle reduzieren und passende kleine Cart-/Rabatt-Fix-Packs anhand vollständiger Briefs vorbereiten (weiter Phase 1/2, keine Reparaturen). Browser-/Livegrenzen H-012–015 und Konfigurationsdrift ausdrücklich offen halten. Danach nächsten ungeprüften Rechner-/Variantenvertrag aus TEST_MATRIX auswählen. Keine fertigen Diagnosen wiederholen; Browserberechtigung S13 nicht umgehen.


## S17 – Aktuelle Fortsetzungsreihenfolge

S17 / CART-004 abgeschlossen: Cart-Testmatrix S08–S16 konsolidiert, veraltete OFFEN-Einträge korrigiert, Browser-/Livegrenzen separat geführt. FIX_PACK_03_CART_REQUEST_FEEDBACK für TP-013/014 READY zur späteren lokalen Übergabe (inklusive minimaler Ownershipkorrektur der deaktivierten Notiz, keine Aktivierung). Cartkern TP-010/011 und Renderer TP-012 bleiben NOT READY wegen offener Integrations-/Aufrufergrenzen. Keine neuen Issues, Tests nicht erneut ausgeführt, keine Reparatur.

CALC-001a / H-003: verbleibende Rollenrechner-Zustandswechsel lokal prüfen: Farb-/Artwechsel bei bereits gewählter Fußleiste/Haftunterlage, aktiver Varianten-ID und Preisbasis. Einstieg blocks/tp-rollware-rechner.liquid (change-Handler um 1756/1778), assets/tp-rollware-art.js und anschließender Variantenvertrag. Keine PR-020–023-Mathematik erneut ausführen; echte Picker-/Reload-/Browsernachweise getrennt offen halten.

Frühere Sessionabschnitte unten/oben dokumentieren historische Arbeitsstände; maßgeblich sind aktuelle Matrix und MASTER_STATUS. Abgeschlossene Evidence bleibt erhalten.


## S18 – Farb-/Art-/Zubehörzustand

S18 / CALC-001a.1: neun neue Übergangs-/Ereignisverträge PASS, zwei historische Quellhashvergleiche. Original-baseOptions/findVariant/rateOf/updateExtras über persistenten Feldern: Rot Meter→Rot Raum→Blau ohne Zubehörfreigabe→Blau Meter→Rot zurück. ID/Preis folgt gewählter Farbe/Art, Zubehör bei fehlender Freigabe ohne Items, eigene Leistenlänge 7 bleibt erhalten und wird beim Zurückwechseln wieder verwendet. Formular-ID hat Vorrang vor URL (synthetische Kombination); Farbchange plant 120 ms, Formularchange 100 ms, fremder Change nichts. Kein neuer bestätigter Fehler; H-003 nur teilweise geklärt.

Evidence: `audit/evidence/roll-extra-transitions-2026-09-22.json`; Script `audit/scripts/reproduce-roll-extra-transitions.mjs`. Originalfunktionen und document-change-Handler, synthetische Varianten/DOM, artMode gesteuert; Timerplanung erfasst, calculate nicht aus diesem Event ausgeführt. Kein vollständiger Picker-/Morph-/Submitnachweis. Syntax/Erstlauf PASS. Route TASK-E36D4BE4A434 B/STATIC; kein Executor/alte Diagnosen.

Nächster Schritt: CALC-001a.2: syncArtUi + calculate + Submit als zusammenhängende lokale Zustandsfolge prüfen: Wechsel zu Farbe ohne gewählte Rollenbreite bzw. ohne kaufbare Wunschmaßvariante, Art-Rückschaltung und Zubehör/ID im nachfolgenden Payload. Reale Farb-Picker-/Formular-/URL-Synchronisation anschließend VAR-001; keine Browserumgehung, keine fertigen Preisraster erneut ausführen.


## S19 – Rollen-Zustand bis Submit

S19 / CALC-001a.2 lokal abgeschlossen: vier aufeinanderfolgende Wechsel mit vier abgefangenen Submits, zwei historische Hashvergleiche. Original-syncArtUi/calculate/Extras/Submit: initial Raummaß, Farbe ohne Wunschmaß/500er-Breite, Rückkehr und Farbe mit nicht kaufbarer Wunschmaßvariante. Rückschaltung auf Meter/400 cm korrekt, ID/Art/Gruppe/Zubehör im Payload passend; eigene Leistenlänge 7 erhalten. Angezeigte Summe entspricht jeweils Variantenpreis × Payloadmenge einschließlich Zubehör. Kein neuer bestätigter Fehler. Native Radioexklusivität modelliert, Picker/URL/Morph und Serviceanzeige nicht vollständig ausgeführt.

Evidence: `audit/evidence/roll-state-submit-2026-09-22.json`; Script `audit/scripts/reproduce-roll-state-submit.mjs`. Baseline aus Original-Liquid, synthetische Zusatzfarben; Darstellungs-/Service-/Einfasschip-Helfer adaptiert. Erster Lauf PASS, nach ergänzter Gesamtpreis-/Breitenassertion zweiter Lauf PASS. Keine alten Diagnosen ausgeführt. Route TASK-67D370DD36E8 B/STATIC; kein Executor.

Nächster Schritt: VAR-001a / H-003: blocks/color-swatch-picker.liquid, assets/variant-picker.js und relevante tp-farbe-Schnittstelle lesen; tatsächlichen Vertrag Farbchange→Formular-ID/URL→Rechnernachlauf lokal prüfen. Schnelle Auswahl/fehlende Variante/Verfügbarkeit und mehrere Formulare abgrenzen. Keine Wiederholung fertiger Preis-/Extras-/Submitfälle. Browserzugriff bleibt seit S13 berechtigungsbedingt blockiert; keine Umgehung.


## S20 – Farbpicker-Kombinationsvertrag

S20 / VAR-001a.1: sechs Fälle am vollständigen ersten Original-Farbpicker-IIFE, zwei historische Hashvergleiche. Gemeinsame Breite funktioniert mit initialem Zustand und Formular. Drei fehlende Kombinationsfälle (500 cm initial/Formular, Wunschmaß aus URL) bestätigen TP-015/P2: Radio zeigt neue Farbe, Label/ID/URL bleiben alt, kein tp:farbe-wechsel. Globale Formular-ID-Schreibweise verändert auch zweites synthetisches Formular; reale Fremdformularreichweite H-016 offen. Keine Shopänderung oder Liveabnahme.

Evidence: `audit/evidence/color-picker-2026-09-22.json`; Script `audit/scripts/reproduce-color-picker.mjs`. Erstlauf scheiterte am Zahlenwert im Formmock; natives String-Coercion-Verhalten im Adapter ergänzt, danach Syntax/Diagnose PASS. Keine Produktquelle geändert. Route TASK-A6785D897266 B/STATIC; kein Executor/alte Diagnosen.

Nächster Schritt: VAR-001a.2: native Optionsfelder/variant-picker.js Antwortvertrag und tp-farbe.js Verbraucher prüfen: Farbänderung→native Events→Formular-/URL-/Sectionzustand, Verfügbarkeit und mehrere Produktbereiche (H-016). TP-015 nicht durch frei geratene Breitenwahl reparieren. Keine fertigen Picker-/Rechnerfälle wiederholen; Browserberechtigung seit S13 nicht umgehen.


## S21 – Farbverbraucher und Reconnect

S21 / VAR-001a.2a: acht Original-Farbverbraucherfälle PASS, vier Reconnect-Defektfälle TP-016/P3, drei historische Hashvergleiche. Native VariantUpdateEvent-Produktprüfung funktioniert, Farbnummern werden getrimmt. Globales fremdes tp:farbe-wechsel leert Properties bei fehlender ID, Anzeige behält alten Namen (H-016, reale Mehrproduktreichweite offen). Nach Disconnect/Connect derselben Instanz reagieren beide Klassen auf keinen der beiden Eventtypen; abgebrochener Controller wird wiederverwendet. Keine heutige Browser-/Morphreichweite oder Bestellfolge behauptet.

Evidence: `audit/evidence/color-consumers-2026-09-22.json`; Script `audit/scripts/reproduce-color-consumers.mjs`. Syntax/Erstlauf PASS, keine alten Replays. Route TASK-02EB9023E44A B/STATIC; kein Executor. FILE CONFLICT: beide Verbraucher in tp-farbe.js, keine parallelen Fixes.

Nächster Schritt: VAR-001a.2b: assets/variant-picker.js vollständig auf native Optionswahl, buildRequestUrl/fetchUpdatedSection, Abbruch/Antwortreihenfolge und VariantUpdateEvent prüfen. Anschließend product-form-/tp-farbe-Verbraucherbindung sowie H-016 Mehrproduktbereiche abgrenzen. S20/S21 nicht wiederholen; Browserberechtigung S13 nicht umgehen.


## S22 – Nativer Picker-Antwortvertrag

S22 / VAR-001a.2b.1: sechs lokale Original-Picker-Requestfälle PASS, drei historische Quellhashes gleich. Erfolg sendet variant:selected und variant:update; fehlende Metadaten, ungültiges JSON und Netzwerkfehler senden nur variant:selected. Bei ungültigem JSON erfolgt der adaptierte Picker-Morph vor dem Parsefehler. Überholter Request wird abgebrochen; nächste erfolgreiche Auswahl liefert wieder variant:update. DOM-Auswahl und Morph sind adaptiert, keine Liveprüfung. Product-Form-Verbraucher nur gelesen; mögliche hängenbleibende Submit-Queue ist H-017, kein bestätigtes Issue.

Evidence: audit/evidence/variant-responses-2026-09-22.json; Script: audit/scripts/reproduce-variant-responses.mjs. Syntax und Erstlauf PASS. Route TASK-02650F0E1B12 klassifizierte den lokalen Audit fälschlich als D/SHOPIFY_WRITE/HUMAN_GATE; keine externe Aktion, kein Executor und keine Reparatur ausgeführt.

Nächster Schritt: VAR-001a.2b.2: Original-Product-Form-Verbraucher an Picker-Fehlervertrag anbinden und Auswahl→Submit-Queue→Recovery lokal ausführen (H-017). Danach native DOM-/Lifecycle- und Mehrproduktabgrenzung H-016 fortsetzen. Fertige S20–S22-Fälle nicht wiederholen; Browserberechtigung S13 nicht umgehen.


## S23 – Product-Form-Queue nach Variantenfehler (22.09.2026)

S23 / VAR-001a.2b.2: vier Original-Product-Form-Verbraucherfälle PASS, drei Quellhashes gegen S22 unverändert. S22-Ereignisspuren am Section-EventTarget wiedergegeben, keine Pickerdiagnose wiederholt. Erfolg gibt einen wartenden Kaufklick frei. Nach fehlenden Metadaten, ungültigem JSON oder Netzwerkfehler bleiben zwei Kaufklicks ohne Cart-Request in der Queue. Späteres Variantenupdate für ID 3 sendet beide gespeicherten Klicks für ID 2. H-017 damit lokal als TP-017/P2 bestätigt; echte Browser-/Shopreichweite offen.

Evidence: audit/evidence/variant-form-queue-2026-09-22.json; Script: audit/scripts/reproduce-variant-form-queue.mjs. Vollständige Original-ProductFormComponent und Originalevents, DOM/Refs adaptiert; nur abgefangene Requests, keine Browser-/Shopaktionen. Erstlauf und nach präzisierter Recovery-ID erneut Syntax/Diagnose PASS. Route TASK-CF85944395D0 B/STATIC, kein Executor.

CORE/SHARED FILE, HIGH RISK: variant-picker.js → events.js → product-form.js → Cart. Fehlender Abschluss und Queue-Recovery gemeinsam behandeln; kein globaler Eventumbau.

Nächster Schritt: VAR-001a.2c: native Picker-/Product-Form-Lifecycle-Aufrufer und Reconnect/Morphgrenzen lokal abgrenzen, danach Mehrprodukt-Ereigniszuordnung H-016. S20–S23 nicht wiederholen. Browserberechtigung S13 nicht umgehen.


## S24 – Formular-Reconnect (22.09.2026)

S24 / VAR-001a.2c.1: vier Lifecycle-Beobachtungen am vollständigen Original-ProductFormComponent PASS. Erstverbindung aktualisiert ID, Disconnect ignoriert Update wie erwartet; dieselbe Instanz bleibt nach Reconnect auf alter ID, frische Instanz verarbeitet Update korrekt. Wiederverwendeter abgebrochener Controller bestätigt dieselbe Fehlerklasse wie TP-016; dessen Scope erweitert, keine neue Issue-ID. Sechs aktuelle Quellhashes gespeichert, keine historische Livegleichheit daraus behauptet.

Originalevents und native EventTarget/AbortController; Component-Basisklasse/Refs adaptiert, Lifecycle manuell. Kein tatsächlicher DOM-Morph, Submit oder Browserlauf. component.js erneuert nur eigene Refs/Observer, nicht privaten Formularcontroller. morph.js:523 verschiebt passende alte Knoten mit insertBefore; konkrete betroffene Produktstruktur offen. quick-add.js:228–237 ordnet geparste Quellknoten vor dem Morph um und beweist keinen Reconnect einer bereits verbundenen Instanz.

Script audit/scripts/reproduce-form-reconnect.mjs; Evidence audit/evidence/form-reconnect-2026-09-22.json. Syntax und Erstlauf PASS. Route TASK-B005090B4D3F B/STATIC, kein Executor.

CORE/SHARED FILE, HIGH RISK: product-form.js gemeinsam mit TP-017 koordinieren; kein pauschaler Morphumbau.

Nächster Schritt: VAR-001a.2c.2: native VariantPicker-Lifecycle (change-Listener, Radiozustand, Request nach Disconnect) isoliert prüfen; anschließend konkrete Morph-/Mehrproduktzuordnung H-016 abgrenzen. S20–S24 nicht wiederholen; Browserberechtigung S13 nicht umgehen.

## S25 – VariantPicker-Reconnect

Vier neue Lifecycle-Beobachtungen PASS: Erstverbindung und frische Instanz je ein Change/ein Request; Reconnect derselben Instanz zwei Events/zwei Requests mit Abbruch des ersten; Disconnect allein bricht laufenden Request nicht ab. Original-VariantPicker und Events, Lifecycle manuell, DOM/Morph adaptiert. Kein alter Antwort-/Formulartest wiederholt.

Evidence: `audit/evidence/picker-reconnect-2026-09-22.json`; Script: `audit/scripts/reproduce-picker-reconnect.mjs`. Syntax/Diagnose PASS nach Korrektur des neutralen Component-Adapters. Keine Browser-/Liveprüfung.

Nächster Schritt: VAR-001a.2c.3 Morph-/Quick-add-Aufrufer und Mehrproduktzuordnung H-016.

## S26 – Morph-/Mehrprodukt-Reichweite

Statische Matrix PASS: acht Produkt-Templates, davon drei mit aktivem Custom-Farbpicker; sechs Quellverträge zu Eventscope, Quick-add-Properties und Morph geprüft. Repository-Einstellung `quick_add: false`; Livegleichheit ausdrücklich unbekannt. H-016 bleibt bedingt, kein neues Issue. Kein Lifecycle-Replay oder Browsertest.

Evidence: `audit/evidence/variant-morph-reach-2026-09-22.json`; Script: `audit/scripts/audit-variant-morph-reach.mjs`. Zwei Parseranläufe stoppten vor Auswertung an Shopify-Kommentarvorspannen; korrigierter Matrixlauf PASS.

Nächster Schritt: JS-001a Runtime-Inventar und Priorisierung noch ungeprüfter Fehlerpfade.

## S27 – JavaScript-Runtime-Inventar

Statisches Inventar PASS: 96 Dateien/25.206 Zeilen, 77 Custom Elements, 56 Dateien mit Connect-Lifecycle, 47 mit globalen Listenern, 16 mit Fetch und 37 heuristische Kandidaten. Prüfflags sind keine Defektassertionen. Bereits auditierte Kernquellen separat markiert.

Evidence: `audit/evidence/js-runtime-inventory-2026-09-22.json`; Script: `audit/scripts/audit-js-runtime-inventory.mjs`. Nach einer feldbezogenen Controller-Erkennung Syntax/Inventar PASS. Nächster ausführbarer Kandidat: QuickAddComponent-Lifecycle.

## S28 – QuickAddComponent-Reconnect

Vier Lifecycle-Beobachtungen PASS: initial Variant/Cart je einmal; getrennte Instanz verarbeitet weiterhin Variant, aber nicht Cart; wiederverbundene Instanz Variant doppelt/Cart null; frische Instanz je einmal. TP-016 erweitert. Vollständige Originalklasse und Events, UI-/DOM-Abhängigkeiten adaptiert; kein Morph/Fetch/Browser.

Evidence: `audit/evidence/quick-add-reconnect-2026-09-22.json`; Script: `audit/scripts/reproduce-quick-add-reconnect.mjs`. Nach VM-Ereignisnamen-Korrektur Syntax/Diagnose PASS. Nächster Schritt QuickAddDialog separat.

## S29 – QuickAddDialog-Reconnect

Vier Lifecycle-Beobachtungen PASS: initial Cart/Variant/Close aktiv; nach Disconnect Cart/Close inaktiv, Variant als Geisterlistener aktiv; Reconnect Cart weiter inaktiv, Variant einmal, Close einmal; frische Instanz vollständig. Identische Variant-Listenerfunktion wird nicht doppelt registriert. TP-016 erweitert.

Evidence: `audit/evidence/quick-add-dialog-reconnect-2026-09-22.json`; Script: `audit/scripts/reproduce-quick-add-dialog-reconnect.mjs`. Nach korrigierter Doppelregistrierungsassertion Syntax/Diagnose PASS. Kein UI-/Browserlauf.

## S30 – Sticky-Add-to-Cart-Reconnect

Vier Lifecycle-Beobachtungen PASS: Initial Variant/Menge aktualisiert; getrennt beide inaktiv; Reconnect derselben Instanz beide weiter inaktiv; frische Instanz aktiv. Acht Produkt-Templates aktivieren den Balken. TP-016 erweitert. Originalklasse/Events mit adaptierten DOM-/Observergrenzen; kein Klick/Cart/Morph/Browser.

Evidence: `audit/evidence/sticky-cart-reconnect-2026-09-22.json`; Script: `audit/scripts/reproduce-sticky-cart-reconnect.mjs`. Syntax/Erstlauf PASS.

## S31 – PricePerItem-Reconnect

Vier Lifecycle-Beobachtungen PASS: initial Staffelsprung 10→8 Euro; getrennt kein Update; Reconnect derselben Instanz kein Update; frische Instanz korrekt. Sechs von acht Templates mit aktivem Mengenblock, konkrete Staffelpreisprodukte offen. TP-016 erweitert.

Evidence: `audit/evidence/price-per-item-reconnect-2026-09-22.json`; Script: `audit/scripts/reproduce-price-per-item-reconnect.mjs`. Syntax/Erstlauf PASS; kein Browser-/Livepfad.

## S32 – MediaGallery-Lifecycle

| Test | Ergebnis | Grenze |
|---|---|---|
| Initial Connect: VariantUpdate + ZoomMediaSelected | PASS: 1 Ersetzung, Auswahl Index 3 | DOM/Slideshow adaptiert |
| Nach Disconnect | PASS: 0 Ersetzungen, 0 Auswahlen | native EventTarget/AbortController |
| Reconnect derselben Instanz | TP-016 bestätigt: beide Listener bleiben aus | kein echter DOM-Morph |
| Frische Instanz | PASS: beide Ereignisse je einmal | kein Browser/Live |
| Produkttemplate-Reichweite | PASS: 8/8 mit aktivem Galerieblock | statische Quelle |

Evidence: `audit/evidence/media-gallery-reconnect-2026-09-22.json`. Weiter JS-001g `media.js`; fertige Lifecyclefälle nicht erneut ausführen.

## S33 – DeferredMedia / ProductModel

| Test | Ergebnis | Grenze |
|---|---|---|
| DeferredMedia initial | PASS: Medien- und Dialogevent pausieren | Video/DOM adaptiert |
| DeferredMedia getrennt / Reconnect / frisch | PASS: 0 / 0 / 2 Pausen | kein Browser/Live |
| ProductModel initial | PASS: Tap pausiert UI und Video einmal | ModelViewerUI adaptiert |
| ProductModel getrennt / Reconnect / frisch | PASS: 0 / 0 / 1 Pointerpause | Laden/Autoplay nicht geprüft |
| Statische Reichweite | globales Script; Produktmedien + Video-Snippet; 8 Galerietemplates | reale Medienzuweisung offen |

Evidence: `audit/evidence/media-runtime-reconnect-2026-09-22.json`. Weiter JS-001h `layered-slideshow.js`.

## S34 – LayeredSlideshow-Lifecycle

| Test | Ergebnis | Grenze |
|---|---|---|
| Initial / getrennt / Reconnect / frisch | PASS: Tab 1 / 0 / 1 / 1 | DOM/Layout adaptiert |
| Observer bei Disconnect | PASS: beendet | Callback-Layout nicht ausgeführt |
| Disconnect während Desktop-Drag | TP-016: Pointermove mutiert getrennten Container | kein Browser/Touch |
| Pointerup nach Disconnect | PASS: räumt Dragzustand/Listener auf | fehlendes Pointerup nicht simuliert |
| Reichweite | globales Script, optionale Section, 0 Templatezuweisungen | Livezustand offen |

Evidence: `audit/evidence/layered-slideshow-lifecycle-2026-09-22.json`. Weiter JS-001i `accordion-custom.js`.

## S35 – AccordionCustom-Reconnect

| Test | Ergebnis | Grenze |
|---|---|---|
| Initial | PASS: Default, Klicksperre, Escape, Breakpoint | Details/MediaQuery adaptiert |
| Getrennt | PASS: Ereignisse wirkungslos | native AbortController |
| Reconnect derselben Instanz | TP-016: Default direkt, drei Listenerpfade ausgefallen | kein Browser |
| Frische Instanz | PASS: alle Pfade korrekt | keine Liveaussage |
| Reichweite | globales Script, 6 Aufrufer + Header Drawer | statische Quelle |

Evidence: `audit/evidence/accordion-reconnect-2026-09-22.json`. Weiter JS-001j `predictive-search.js`.

## S36 – PredictiveSearch-Reconnect

| Test | Ergebnis | Grenze |
|---|---|---|
| Initial CMD+K / Modalflächenklick | PASS: Dialog 1, Fokus 1 | Dialog/DOM adaptiert |
| Getrennt | PASS: beide 0 | native AbortController |
| Reconnect derselben Instanz | TP-016: beide 0 | kein Browser |
| Frische Instanz | PASS: beide 1 | kein Livezugriff |
| Reichweite | Header, Search Modal, Custom Results statisch belegt | Fetch/Morph nicht geprüft |

Evidence: `audit/evidence/predictive-search-reconnect-2026-09-22.json`. Weiter JS-001k `drag-zoom-wrapper.js`.

## S37 – DragZoomWrapper-Reconnect

| Test | Ergebnis | Grenze |
|---|---|---|
| Initial | PASS: Touch, Dialogreset, Observer aktiv | DOM/Layout adaptiert |
| Getrennt | PASS: alle inaktiv | native AbortController |
| Reconnect derselben Instanz | TP-016: Touch aus; Reset/Observer aktiv | keine Gestenmathematik |
| Frische Instanz | PASS: alle aktiv | kein Browser/Live |
| Reichweite | 8 Galerietemplates; Wrapper bildbedingt | Produktmedien offen |

Evidence: `audit/evidence/drag-zoom-reconnect-2026-09-22.json`. Weiter JS-001l `product-card.js`.

## S38 – ProductCard / Swatches

| Test | Ergebnis | Grenze |
|---|---|---|
| Card initial / getrennt / Reconnect / frisch | PASS: Quick-add-Preload jeweils 1; getrennt ist Defekt | Fetch adaptiert |
| Reconnect identischer Card-Handler | keine Verdopplung | EventTarget-Deduplizierung |
| Swatches getrennt | TP-016: Karten-URL wird weiter aktualisiert | Pickerbasis adaptiert |
| Swatches Reconnect | neue gebundene Listenerregistrierung | nur erste Wirkung sichtbar |
| Reichweite | globales Script, 31 Templates | statische Quelle |

Evidence: `audit/evidence/product-card-lifecycle-2026-09-22.json`. Weiter JS-001m.

## S39 – ProductTitle-Truncation-Lifecycle

| Test | Ergebnis | Grenze |
|---|---|---|
| ResizeObserver Connect→Disconnect→Reconnect | PASS: erster Observer getrennt, zweiter beobachtet | Observer/Geometrie adaptiert |
| Fallback initial / frisch | PASS: je eine Berechnung pro Resize | Browser ohne ResizeObserver simuliert |
| Fallback nach Disconnect | TP-016 bedingt: eine Berechnung durch Geisterlistener | reale Browserpopulation offen |
| Fallback Reconnect | TP-016 bedingt: zwei Berechnungen pro Resize | kein echtes Layout/Live |
| Quellreichweite | PASS: globales Script, ein bedingtes Markup in Card Gallery | Katalogprodukte ohne Medien offen |

Evidence: `audit/evidence/product-title-truncation-lifecycle-2026-09-22.json`. Weiter JS-001n `gift-card-recipient-form.js`; fertige Lifecyclefälle nicht erneut ausführen.

## S40 – GiftCardRecipientForm-Reconnect

| Test | Ergebnis | Grenze |
|---|---|---|
| Initial Connect mit Liquid-Prefill | bedingt fehlerhaft: vier Empfängerwerte geleert | Server-Rerender nicht ausgeführt |
| Empfängermodus + Input | PASS: sichtbar, aktiv, Fokus/Zeichenzähler | DOM adaptiert |
| Nach Disconnect | PASS: Input-Listener inaktiv | CartEvents quellseitig symmetrisch |
| Reconnect derselben Instanz | TP-016: UI Selbstversand, privater Modus Empfänger; Empfänger-Toggle wirkungslos | kein Browser/Morph |
| Frische Instanz | PASS: Empfänger-Toggle öffnet/aktiviert | kein Shopify-Submit |
| Reichweite | 7 Templates aktivieren Form; Render nur bei Gift Card | Produkt-/Livezuweisung offen |

Evidence: `audit/evidence/gift-card-recipient-reconnect-2026-09-22.json`. Weiter JS-001o `cart-icon.js`; fertige Lifecyclefälle nicht erneut ausführen.

## S41 – CartIcon-Ereignisvertrag

| Test | Ergebnis | Grenze |
|---|---|---|
| ProductForm Erfolg | PASS: Start 2 + Add 3 = 5 | Event/DOM adaptiert |
| CartItems absolut | PASS: Start 7 → Gesamt 4 | kein echter Cartrequest |
| ProductForm `didError` | TP-018: Start 2 + angefordert 9 = sichtbare/gespeicherte 11 | echte Teiladdmenge offen |
| Disconnect / Reconnect | PASS: getrennt keine, reconnectet eine Wirkung | native EventTarget |
| aktuelle Sessionzahl | PASS: 1 → gespeicherte 6 | bfcache nicht nativ |
| Senderreichweite | 2 ProductForm-Fehlerpfade; globaler Header | statische Quelle |

Evidence: `audit/evidence/cart-icon-events-2026-09-22.json`. Weiter JS-001p `facets.js`; fertige Cart-/Lifecyclefälle nicht erneut ausführen.

## S42 – FacetClear-Lifecycle

| Test | Ergebnis | Grenze |
|---|---|---|
| Initial Enter | PASS: genau ein Clear/Filterupdate | DOM/Form adaptiert |
| Nach Disconnect | TP-016: Enter löst weiter Update aus | kein Section-Fetch |
| Reconnect derselben Instanz | PASS: eine, keine doppelte Wirkung | EventTarget-Deduplizierung |
| Dokumentweites FilterUpdate nach Disconnect | PASS: keine Clearbutton-Aktualisierung | nativer EventTarget |
| Frische Instanz | PASS: genau ein Update | kein Browser/Live |
| Reichweite | 20 Collection-/Search-Templates | statische Quelle |

Evidence: `audit/evidence/facet-clear-lifecycle-2026-09-22.json`. Weiter JS-001q `slideshow.js`; fertige Runtimefälle nicht erneut ausführen.

## S43 – Standard-Slideshow aktiver Drag

| Test | Ergebnis | Grenze |
|---|---|---|
| Aktiver Drag | PASS: Pointermove setzt Dragzustand | Scroller/Layout adaptiert |
| Disconnect während Drag | TP-016: Dokument-Pointermove bleibt aktiv | echter Pointercapture offen |
| Pointerup nach Disconnect | PASS: alter Controller räumt auf | native AbortController |
| Normaler Disconnect | PASS: neuer Mousedown wirkungslos | Observer/Scroller adaptiert |
| Normaler Reconnect | PASS: Drag wieder aktiv | kein Browser/Live |
| Reconnect während altem Drag | TP-016: alter Controller behält Ownership | keine Auswahlgeometrie |
| Reichweite | globales Script, 31 Templates | statische Quelle |

Evidence: `audit/evidence/slideshow-drag-lifecycle-2026-09-22.json`. Weiter JS-001r `tp-leisten-farbwahl.js`; fertige Runtimefälle nicht erneut ausführen.

## S44 – Leisten-Farbwahl-Lifecycle

| Test | Ergebnis | Grenze |
|---|---|---|
| Initial Connect | PASS: sichtbar, aktive Kachel synchron, Observer aktiv | DOM/Layout adaptiert |
| Verbundener Klick | PASS: passendes Variantenradio einmal gewählt | echtes Bubbling/Morph offen |
| Nach Disconnect | TP-016 bedingt: Klick wählt Radio weiter | getrennte Baumreferenzen adaptiert |
| Reconnect | PASS: neuer Observer, keine Klickverdopplung | kein Browser/Live |
| Global-Sync nach Disconnect | PASS: getrennte Instanz bleibt unverändert | native EventTarget |
| Reichweite | ein Template `product.fixpreis.json` | aktuelle Produktzuweisung offen |

Evidence: `audit/evidence/leisten-farbwahl-lifecycle-2026-09-22.json`. Weiter JS-001s `tp-suche.js`; fertige Runtimefälle nicht erneut ausführen.

## S45 – TP-Suche-Lifecycle

| Test | Ergebnis | Grenze |
|---|---|---|
| Initial Fokus | PASS: Panel offen, `aria-expanded=true` | DOM/Layout adaptiert |
| Disconnect offen | TP-016 bedingt: Panel bleibt sichtbar | echter Section-Morph offen |
| Reconnect + Escape | TP-016 bedingt: stale Panel bleibt sichtbar | native Fokusfolge offen |
| Reconnect + Außenklick | TP-016 bedingt: stale Panel bleibt sichtbar | Eventziel adaptiert |
| Frische Instanz + Escape | PASS: Panel geschlossen, ARIA synchron | kein Browser/Live |
| Reichweite | eine Header-Gruppen-Zuweisung | aktuelle Live-Einstellungen offen |

Evidence: `audit/evidence/tp-search-lifecycle-2026-09-22.json`. Weiter JS-001t `tp-unterkategorien-leiste.js`; fertige Runtimefälle nicht erneut ausführen.

## S46 – Unterkategorienleisten-Lifecycle

| Test | Ergebnis | Grenze |
|---|---|---|
| Initial Section Load | PASS: rechter Hinweis, ein Observer | DOM/Layout adaptiert |
| Verbundener Scroll | PASS: linker Zustand aktualisiert | kein echtes Scroll-Snap |
| Section Replacement | TP-016 bedingt: zweiter Observer, alter bleibt | Browser-GC offen |
| Alter ResizeObserver | TP-016 bedingt: mutiert getrennte Leiste | nativer Observer adaptiert |
| Alter Scrolllistener | TP-016 bedingt: mutiert getrennte Leiste | gehaltene Referenz im Harness |
| Resize-Fallback | TP-016 bedingt: Window-Listener bleibt aktiv | Browser ohne ResizeObserver simuliert |
| Reichweite | zwölf Templatezuweisungen | Menübedingung/Live offen |

Evidence: `audit/evidence/subcategory-bar-lifecycle-2026-09-22.json`. Weiter JS-001u `tp-verlegegebiet.js`; fertige Runtimefälle nicht erneut ausführen.

## S47 – Verlegegebiets-Lifecycle

| Test | Ergebnis | Grenze |
|---|---|---|
| Initiale Verdrahtung | PASS: sichtbar, ein Submitlistener | DOM adaptiert |
| Doppelte Scriptausführung | PASS: ein globaler/ein lokaler Listener | Window-Wache ausgeführt |
| Initialer Submit | PASS: genau ein Fetch | Netzwerk adaptiert |
| Section Replacement | PASS: neues Formular einmal verdrahtet | Eventwurzel adaptiert |
| Alte Fetchantwort | TP-016 bedingt: rendert in getrennten Baum | nativer Abort/GC offen |
| Alter Inputlistener | TP-016 bedingt: mutiert getrennten Baum | gehaltene Referenz im Harness |
| Bestehende Regression | PASS: 66/66 | vier lokale Testsuites |
| Reichweite | fünf Templatezuweisungen | Liveeinstellungen offen |

Evidence: `audit/evidence/installation-area-lifecycle-2026-09-22.json`. Weiter JS-001v `tp-zuschnitt-abgleich.js`; fertige Runtimefälle nicht erneut ausführen.

## S48 – Zuschnitt-Abgleich-Runtime

| Test | Ergebnis | Grenze |
|---|---|---|
| Start + globale Listener | PASS: ein GET, je ein App-Listener | Dokument adaptiert |
| Doppelte Scriptausführung | PASS: kein weiterer Listener/Request | Window-Wache ausgeführt |
| Externes CartUpdate während Start | PASS: wartet seriell | Promise-Taktung lokal |
| Write + Gegenprobe + Selbstevent | PASS: ein POST, ein Redraw, kein Loop | Fetch/Event adaptiert |
| Konsistenter Cart | PASS: kein Write/Redraw | lokales Fixture |
| Fehlererholung | PASS: nächster Queue-Aufruf läuft | UI-Fehlerfeld nicht gerendert |
| Bestehende Regression | PASS: 10/10 | lokale Testsuite |
| Reichweite | globaler Cart-Pfad + ein Konfigurator-Template | Livequelle offen |

Evidence: `audit/evidence/cut-sync-runtime-2026-09-22.json`. Weiter JS-001w `dialog.js`; fertige Runtimefälle nicht erneut ausführen.

## S49 – Dialog-Lifecycle

| Test | Ergebnis | Grenze |
|---|---|---|
| Verbunden öffnen | PASS: Dialog offen, Body fixiert, lokale Listener aktiv | Dialog/Animation adaptiert |
| Offen disconnecten | TP-016: Dialog/Body/Listener bleiben aktiv | native Top-Layer-Entfernung offen |
| Offen reconnecten | TP-016: erneutes Show ist No-op, Zustand bleibt | kein Morph/Browser |
| Normal schließen | PASS: Listener/Body/Dialog/Scroll bereinigt | Fokus nicht simuliert |
| Reichweite | fünf direkte Markupquellen, zwei Unterklassen | Livegleichheit offen |

Evidence: `audit/evidence/dialog-lifecycle-2026-09-22.json`. Weiter JS-001x `focus.js`; fertige Runtimefälle nicht erneut ausführen.

## S50 – Fokusfang-Lifecycle

| Test | Ergebnis | Grenze |
|---|---|---|
| Erster Trap | PASS: ein globales Handler-Paar | Fokus-DOM adaptiert |
| Tab + Außenfokus | PASS: Zyklus und Rücklenkung | native Propagation offen |
| Zweiter Trap | PASS: ersetzt erstes Paar | Singletonvertrag |
| Explizites Remove | PASS: null globale Handler | lokale Registry |
| Offener Drawer disconnectet | TP-016: Trap lenkt in getrennten Baum | Animation/Browser offen |
| Collection `cycleFocus` | PASS: nächstes Element fokussiert | Layout irrelevant |
| Reichweite | HeaderDrawer + CollectionLinks | Live-Markup offen |

Evidence: `audit/evidence/focus-trap-lifecycle-2026-09-22.json`. Weiter JS-001y `header-drawer.js`; fertige Fokus-API-Fälle nicht erneut ausführen.

## S51 – HeaderDrawer-Lifecycle

| Test | Ergebnis | Grenze |
|---|---|---|
| Connect | PASS: Keyup und zwei Descendant-Handler aktiv | DOM adaptiert |
| Open, dann Disconnect vor Animationsende | TP-016: alter Callback setzt Trap auf getrennten Drawer | CSS-Animation adaptiert |
| Ausstehender Klassentimer | TP-016: mutiert getrennten Accordion-Inhalt | Timer lokal kontrolliert |
| Reconnect derselben Kinder | PASS: stabiler Handler bleibt einmal aktiv | neue Kindknoten nicht simuliert |
| Normaler Root-Close | PASS: Details/ARIA/Trap bereinigt | native Toggle-Reihenfolge offen |
| Alter Root-Close nach neuem Trap | TP-016: alter Callback entfernt globalen späteren Trap | Fokus-API protokolliert |
| Reichweite | Header-Drawer-Snippet und Header-Menüblock | Livegleichheit offen |

Evidence: `audit/evidence/header-drawer-lifecycle-2026-09-22.json`. Weiter JS-001z `collection-links.js`; fertige Fokus-/HeaderDrawer-Fälle nicht erneut ausführen.
