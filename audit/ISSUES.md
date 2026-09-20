# Bestätigte Issues und offene Hypothesen

Stand: 20.09.2026, Phase 1. Keine Reparatur ausgeführt. TP-001–003 wurden historisch live am 19.09. beobachtet und am identischen Repository-Code am 20.09. reproduziert. TP-004/005 sind ausschließlich lokal bestätigte bedingte Codefehler; aktuell betroffene Live-Produkte/-Zustände sind nicht nachgewiesen. Der heutige Live-Stand wurde nicht neu verifiziert. Die genauen Grenzen stehen je Issue.

| ID | Priorität | Titel | Diagnose | Fix-Status |
| --- | --- | --- | --- | --- |
| TP-001 | P2 | Paketrechner deutet ungültige/gemischte Zahlen still um | BESTÄTIGT | Offen |
| TP-002 | P3 | Paketrechner lässt unendliche und unsichere Mengen zu | BESTÄTIGT | Offen |
| TP-003 | P2 | Ausgewählte Fußleiste ohne Länge wird bei Bestellung ausgelassen | BESTÄTIGT | Offen |
| TP-004 | P3 | Raummaß im Hundertstel-Modus rundet einzelne Halbwerte zu niedrig | BESTÄTIGT lokal; Live-Betroffenheit offen | Offen |
| TP-005 | P3 | Nicht verfügbarer konfigurierter Kettelservice entfällt ohne Kaufsperre | BESTÄTIGT lokal; Live-Betroffenheit offen | Offen |

## TP-001 – Paketrechner deutet ungültige/gemischte Zahlen still um

- **Bereich:** Preis-/Mengenberechnung, Eingabevalidierung.
- **URL / Template:** `/products/marlow-eiche-nordisch-klickvinyl-7mm`; Block in `templates/product.json`, `product.planken.json`, `product.fliese.json`. Weitere Produkte mit diesem Block potenziell betroffen, nicht einzeln live getestet.
- **Geräte / Browser:** historischer Desktop 1440 × 1000 und Mobile 390 × 844, Browser-Version `153.0.8010.48` laut Runtime-Datei; Browserfamilie/OS dort nicht separat festgehalten. Keine Aussage zu Safari/Firefox.
- **Beschreibung:** Deutsches Zahlenformat mit Tausenderpunkt und Dezimalkomma wird als kleine Teilzahl interpretiert. Buchstaben nach einer Zahl werden ebenfalls still verworfen.
- **Reproduktion:** Marlow öffnen → Fläche `1.234,56` eingeben/einfügen → Feld verlassen. Alternativ `20abc` eingeben. Für Payload-Nachweis lokal `node audit/scripts/reproduce-pricing.mjs` verwenden; heute keine echte Bestellung/kein Live-Cart-Test ausgeführt.
- **Erwartet:** vollständige Eingabe sinnvoll interpretieren oder mit verständlicher Fehlermeldung zurückweisen. Niemals still nur einen Zahlenanfang übernehmen. Für akzeptierte 1.234,56 m² mit 5 % Verschnitt und 2,08 m²/Paket wären 624 Pakete nötig; eine klare Ablehnung ist ebenfalls korrekt.
- **Tatsächlich:** `1.234,56` → intern `1.234`, sichtbares Feld nach Blur `1,23`, Bedarf `1,30 m²`, 1 Paket, 105,98 €. `20abc` → 20 m², 11 Pakete, 1.165,78 €, keine Validierungsmeldung. Der lokale abgefangene Payload enthält die umgedeutete Menge.
- **Ursache / Dateien / Zeilen:** `blocks/paket-auswahl.liquid:773`–`799`: `replace(',', '.')` macht aus `1.234,56` den Text `1.234.56`; `parseFloat` akzeptiert den ersten Zahlenabschnitt. `setDesiredSqm`/`syncInputValue` (674–686) normalisieren die Anzeige ohne Fehlermeldung. `addToCart` (689–728) prüft nur die Varianten-ID, nicht den vollständigen Eingabewert.
- **Risiko:** falsche Bedarfsübernahme und erhebliche Unterbestellung bei dieser Eingabe. P2, weil ein bedingter Eingabefehler vorliegt, kein belegter genereller Preis- oder Kaufblocker. Keine belegte falsche Shopify-Preisabrechnung: Shopify bekommt eine falsche Bedarfsmenge, keinen veränderten Variantenpreis.
- **Empfohlene Lösung:** ein vollständiger, expliziter Zahlenparser plus ein gemeinsamer Validitätszustand für Anzeige und Absenden. `1,5` und `1.5` erhalten. Gemischte/gruppierte Formate eindeutig unterstützen oder erklärend ablehnen; Buchstabenreste ablehnen. Keine stille Korrektur während des Tippens.
- **Aufwand:** S–M. **Sicherheit:** BESTÄTIGT, soweit oben beschrieben.
- **Belege:** `evidence/runtime.json`, Labels `package input "1.234,56"` (Indizes 6/22) und `package input "20abc"` (5/21); `evidence/pricing-reproduction-2026-09-20.json`, zugehörige `observations` und `sourceIntegrity`. Ungültige Eingaben wurden historisch nicht bis zu einer Shopify-Antwort abgesendet; die Übermittlung ist lokal abgefangen, keine Serverannahme behauptet.

### IMPLEMENTATION BRIEF – TP-001

- **Issue-ID / Priorität:** TP-001 / P2.
- **Ziel / Problem:** keine vom Eingabetext abweichende Bestellung durch Teilzahlparsing.
- **Root Cause:** permissives `parseFloat` nach einmaliger Kommaersetzung; kein Validierungsgate vor dem Payload.
- **Betroffene Dateien:** primär `blocks/paket-auswahl.liquid`; gezielte Verhaltenstests in `qa/tests/` ergänzen. Keine Templateänderung nötig, sofern Integration erhalten bleibt.
- **Funktionen / Codebereiche:** `parseSqm`, Input-/Blur-Listener, `setDesiredSqm`, `renderResults`, `addToCart`, Zeilen 674–799.
- **Zu ändernde Logik:** vollständig validierte endliche Zahl oder ausdrücklicher Fehlerzustand; gültige Anzeige und abgesendete Menge aus derselben validierten Eingabe. TP-002 im selben Codebereich berücksichtigen.
- **Nicht verändern:** 5-%-Verschnitt, auf ganze Pakete gerundete Menge, Shopify-Paketpreis, €/m²-Darstellung, Variantenwechsel, `_bedarf_qm`/`_pakete`/`_qm_*`-Properties, bewusst kaufbarer Ruhezustand mit einem Paket.
- **Abhängigkeiten:** `variant:update` liefert Preis/ID; `snippets/tp-cart-paketzeile.liquid` berechnet Warenkorbangaben aus echter Menge. Siehe DEPENDENCY_MAP.md.
- **Mögliche Seiteneffekte:** Cursor springt bei Normalisierung; Dezimalkomma wird abgewiesen; Plus/Minus-Paketsteuerung oder Ruhezustand verlieren Kaufbarkeit.
- **Akzeptanzkriterien:** `1.234,56` führt nie still zu 1 Paket; `20abc` löst keinen Cart-Request aus; korrigierte Eingabe wird wieder kaufbar; `1,5` und `1.5` verhalten sich identisch.
- **Testfälle:** `20`, `1,5`, `1.5`, `1.234,56`, `20abc`, leer, `0`, `-1`; Tippen/Paste, Blur und unmittelbarer Buttonklick. Werte vor und nach Blur mit Payload vergleichen.
- **Regressionstests:** 20 m² + 5 % → 11 Pakete/22,88 m²/116.578 Cent; ohne Verschnitt → 10 Pakete; Start → 1 Paket; manuell +1 → genau 2 Pakete; Farbwechsel übernimmt neue ID/Preis. Mobile 390 und Desktop.
- **Rollback-Risiko:** klein bei auf diesen Block begrenztem Commit; Datenmigration nicht erforderlich. Deployment ausschließlich nach konkreter Freigabe.
- **Geschätzter Aufwand / Reihenfolge:** S–M; zusammen mit TP-002 in FIX_PACK_02_PRICING_INPUTS.

## TP-002 – Paketrechner lässt unendliche und unsichere Mengen zu

- **Bereich:** Eingabevalidierung, Preis-/Mengenanzeige, mobile Darstellung als Folgefehler.
- **URL / Template / Geräte / Browser:** wie TP-001; beide historischen Viewports zeigen `Infinity`. Überlauf bei extrem großer Zahl nur bei 390 px belegt.
- **Reproduktion:** Marlow → Fläche `Infinity` oder `999999999999999999999` einfügen → Feld verlassen. Lokal zusätzlich Cart-Payload abfangen.
- **Erwartet:** keine nichtendlichen Zahlen oder unsicher darstellbaren Mengen/Preise als bestellbare Berechnung zeigen oder übermitteln; verständliche Korrekturaufforderung.
- **Tatsächlich:** `Infinity` führt zu `Infinity m²`, `Infinity` Paketen und `∞ €`; Button bleibt im lokalen Adapter aktiv. `JSON.stringify` serialisiert die Menge als `null`. Extrem große Zahl erzeugt 504807692307692300000 Pakete, Exponentialschreibweise und im historischen Mobile-Lauf horizontalen Überlauf.
- **Ursache / Dateien / Zeilen:** `blocks/paket-auswahl.liquid:773`–`778` prüft `isNaN`, nicht `Number.isFinite`. `computePackages` (588–591), `renderResults` (607–612) und `addToCart` (689–728) haben keine Grenze für sichere ganzzahlige Mengen/Preisbeträge.
- **Risiko:** beschädigte Anzeige und ungültiger Kaufversuch nach ungewöhnlicher Eingabe. **P3**, kein nachgewiesener Kauf zu einem falschen Betrag und kein genereller Ausfall. Shopify-Verhalten bei `quantity: null` ist offen.
- **Empfohlene Lösung:** endliche Eingabe, endliche Ergebnisse und sichere positive ganze Paketmenge sowie sichere Cent-Gesamtsumme vor Anzeigen/Absenden prüfen. Keine frei erfundene kaufmännische Maximalfläche einführen. Mobile-Überlauf vorrangig an der ungültigen Datenquelle verhindern.
- **Aufwand:** S. **Sicherheit:** BESTÄTIGT für Anzeige, Quellcode und lokal erzeugten Payload; keine bestätigte Serverantwort auf ungültige Menge.
- **Belege:** `runtime.json`, Labels `package input "Infinity"` (8/24), `package input "999999999999999999999"` (7/23; `overflow:true` bei 390 px). Lokale `observations` enthalten den exakten abgefangenen JSON-Body.

### IMPLEMENTATION BRIEF – TP-002

- **Issue-ID / Priorität:** TP-002 / P3.
- **Ziel / Problem:** ungültige numerische Zustände erreichen weder Ergebnisanzeige noch Cart-Request.
- **Root Cause:** nur NaN-Prüfung und fehlende Ergebnis-/Integer-Prüfung.
- **Betroffene Dateien / Funktionen / Codebereiche:** `blocks/paket-auswahl.liquid`; Parser und Eingabehandler 773–799, `computePackages` 588–591, `renderResults` 607–612, `addToCart` 689–728; gezielte Tests.
- **Zu ändernde Logik:** gemeinsamer Fehlerzustand mit TP-001, `Number.isFinite` und positive sichere Ganzzahlen für Pakete/Cent-Ergebnisse. Vor Absenden erneut prüfen, auch wenn die Anzeige bereits geprüft wurde.
- **Nicht verändern:** gültige Großaufträge ohne fachliche Grundlage begrenzen; Paketpreise/SKUs/Varianten ändern; globales CSS umschreiben; Verschnittlogik ersetzen.
- **Abhängigkeiten:** TP-001 zwingend koordinieren; gemeinsame Datei und Handler.
- **Mögliche Seiteneffekte:** mathematisch gültige Eingaben werden zu streng blockiert; Fehlermeldung bleibt nach Korrektur stehen; +/- erzeugt nicht mehr dieselbe Paketmenge.
- **Akzeptanzkriterien:** `Infinity`, `1e309` und unsichere Ergebniswerte zeigen keine bestellbare Berechnung und lösen keinen Cart-Request aus; `20` danach stellt korrekte Kaufbarkeit her; 390 px ohne durch diese Werte ausgelösten Überlauf.
- **Testfälle:** nichtendliche/überlaufende Eingaben, `NaN`, lange Ziffernfolge, gültige Korrektur, Paste und Blur; vor/nach Blur absenden; prüfen, dass gar kein Request stattfindet, nicht nur eine Fehlermeldung.
- **Regressionstests:** sämtliche gültigen Kontrollen aus TP-001; Summe in Cent aus tatsächlicher Ganzzahlmenge und Variantenpreis prüfen.
- **Rollback-Risiko / Aufwand / Reihenfolge:** klein / S / nach Parserarbeit TP-001 im selben Paket. Keine produktiven Writes im Audit.

## TP-003 – Ausgewählte Fußleiste ohne Länge wird bei Bestellung ausgelassen

- **Bereich:** Rollenware-Zubehör, Warenkorbzusammenstellung, Pflichtfeldvalidierung.
- **URL / Template:** `/products/piumera-teppichboden-400cm-500cm`; `templates/product.rolle.json`, Block `tp-rollware-rechner`.
- **Geräte / Browser:** historisch Desktop 1440 × 1000 und Mobile 390 × 844; Version `153.0.8010.48`, keine weitere Browserabdeckung.
- **Reproduktion:** Piumera Sand Hell/400 cm → Länge 200 cm → „Gekettelte Fußleiste aus Ihrem Teppich“ auswählen → vorgeschlagene Fußleistenlänge löschen → Warenkorbbutton drücken.
- **Erwartet:** markiertes Zusatzprodukt mit unvollständigen Daten blockiert das Absenden mit konkretem Hinweis am Feld. Nach Deaktivieren der Fußleiste ist der reine Teppichkauf wieder möglich.
- **Tatsächlich:** Hinweis „Bitte Höhe und Länge angeben …“ erscheint, Kauf bleibt aber möglich. Shopify antwortete historisch mit HTTP 200 und nur einer Teppichzeile (Menge 8 × 6.590 Cent = 52.720 Cent); keine Fußleiste, keine Zubehörgruppe. Lokaler Lauf reproduziert die Auslassung auch bei `0` und `-1`.
- **Ursache / Dateien / Zeilen:** `blocks/tp-rollware-rechner.liquid:1455`–`1483`: leere/ungültige Länge → `m=0`; `updateExtras` liefert keine Position, nur Hinweis. `fehlendesFeld` (1104–1119) prüft Hauptmaße, keine aktiven Extras. `calculate` setzt Kaufbereitschaft nur anhand Hauptmaße/Variante (1709–1717); Klickhandler 1791–1878 akzeptiert leere `extras.items` als „kein Zubehör gewählt“.
- **Risiko:** Bestellung entspricht nicht der ausdrücklich gewählten Ausstattung; Nachbestellung, Rückfragen und entgangener Zubehörumsatz. **P2**, da Hauptprodukt korrekt bestellt wird und keine falsche Zubehörberechnung nachgewiesen ist.
- **Empfohlene Lösung:** Zustand „nicht gewählt“ von „gewählt, ungültig“ unterscheiden. Gemeinsame Validitätsprüfung beim Rechnen und vor Cart-Request, Feldhinweis und Fokus. Vorhandenen Vorschlag und `data-touched` respektieren, Eingabe nicht still neu befüllen.
- **Aufwand:** S–M. **Sicherheit:** BESTÄTIGT, einschließlich historischer realer Warenkorbantwort bei leerer Länge. `0`/`-1` nur lokal reproduziert.
- **Belege:** `runtime.json`, `leiste checked empty` (13/29), `leiste checked empty submitted` (14/30), enthält Payload, HTTP-Status und Warenkorbzeile. Lokale Evidence `kind: roll-extra`.

### IMPLEMENTATION BRIEF – TP-003

- **Issue-ID / Priorität:** TP-003 / P2.
- **Ziel / Problem:** keine Bestellung, die ein ausgewähltes, unvollständig konfiguriertes Extra still weglässt.
- **Root Cause:** fehlende Extra-Validität in `fehlendesFeld`, `calculate` und im finalen Submit-Gate.
- **Betroffene Dateien / Funktionen / Codebereiche:** `blocks/tp-rollware-rechner.liquid`, oben genannte Bereiche; bei Bedarf gezielte Tests in `qa/tests/`. Keine neue Rechnerarchitektur.
- **Zu ändernde Logik:** aktives Extra ohne gültige Höhe/Länge blockiert Hauptsubmit; Kaufbereitschaft, Hinweis und finale Prüfung stimmen überein. Deaktivierte/wegen Service-Freigabe verborgene Extras blockieren nicht. `data-touched`-Vorschlagslogik erhalten.
- **Nicht verändern:** Meterware-/Raummaß-Preis, volle m² versus `preis_pro_001_qm`, Farb-/Lieferantenfreigaben, Kettelservice-Zuordnung, Maße des Teppichs, Gruppen-Properties, Haftunterlagen-Bahnenoptimierung, Variante/Preis/SKU.
- **Abhängigkeiten:** `tp-rollware-art.js` steuert Rollen-/Serviceauswahl; `_Gruppe` verbindet Hauptware/Zubehör; `tp-cart-gruppen.js` und `tp-cart-gruppe.liquid` behandeln Menge/Entfernen. Gleichzeitige andere Arbeit am Rollenrechner vermeiden.
- **Mögliche Seiteneffekte:** verstecktes Extra blockiert nach Farbwechsel; Eingabe wird überschrieben; Doppelklickschutz (`inFlight`) wird aufgehoben; Zubehörpreis doppelt gezählt.
- **Akzeptanzkriterien:** Checkbox an + leere/0/negative Länge → kein Request, sichtbarer Hinweis/Fokus. Checkbox aus → nur Hauptware. Länge `2,5` → weiterhin 3 volle Meter mit Hinweis. Gültige Länge → Hauptware und Extra im selben Request mit derselben `_Gruppe`.
- **Testfälle:** Erstvorschlag bei 400 × 200 cm = 12 m; löschen; 0; -1; `2,5`; `2.5`; Höhe wechseln; deaktivieren/aktivieren; Farbe mit/ohne Extra-Freigabe. Hauptmaße unverändert lassen und ändern. Doppelklick separat regressionsprüfen.
- **Regressionstests:** 400 × 200 cm → 8 × 6.590 Cent; 12 m Fußleiste bei 1.095 Cent/m → 13.140 Cent Zusatz und zwei Positionen; Haftunterlage mit/ohne Fußleiste; Desktop/Mobile; gemeinsame Entfernung nach späterem Cart-Test.
- **Rollback-Risiko / Aufwand / Reihenfolge:** überschaubar, aber CORE FILE / S–M / nach weiterer Rollenrechner-Preisprüfung in ein eigenes passendes Rechnerpaket aufnehmen. Noch kein freigegebenes Fix-Pack.

## TP-004 – Raummaß im Hundertstel-Modus rundet einzelne Halbwerte zu niedrig

- **Priorität / Bereich:** P3, bedingter Preis-/Mengenfehler mit nachgelagerter falscher Warnung bei einer regulären Rechnereingabe. Keine neue P0/P1-Einstufung ohne belegte Live-Nutzung/Folgen.
- **URL / Template / Bedingung:** `templates/product.rolle.json` → `blocks/tp-rollware-rechner.liquid`; Art „Raummaß“ und Produktmetafeld `custom.preis_pro_001_qm.value == true`. **Kein konkretes aktuelles Live-Produkt mit dieser Kombination bestätigt.** Das bisherige Piumera-Live-Fixture rechnete volle m² und belegt diese Bedingung gerade nicht. Das separate Piumera-Einfassprodukt ist kein Beleg für cmExact im Rollenrechner.
- **Betroffene Geräte / Browser:** geräteunabhängiger Rechenpfad, lokal mit Node/V8 ausgeführt. Keine neue Desktop-/Mobile-/Safari-/Firefox-Reproduktion; keine tatsächliche Bestellmail gesendet.
- **Beschreibung:** Die vorhandene Regel verlangt kaufmännische Rundung auf 0,01 m². Zweifache Skalierung über einen binären Dezimalwert erzeugt an manchen exakten Halbschwellen einen minimal zu kleinen Wert. `Math.round` rundet dann ab.
- **Reproduktion:** `node audit/scripts/reproduce-room-pricing.mjs`. Das Script führt originale Auswahl-/Berechnungs-/Submit-Funktionen mit synthetischem cmExact-Variantensatz aus. Raummaß 250 cm × 333 cm, 89 Cent je 0,01 m²; Request vor Netzwerk abfangen. Dessen Menge/Properties anschließend unverändert durch die aktuelle interne Bestellmail-Vorlage mit LiquidJS rendern.
- **Erwartet:** 83.250 cm² / 100 = 832,5 Einheiten → 833 Einheiten = 8,33 m². Bei Testpreis 89 Cent: 74.137 Cent. Preisbox, Payload und Maßprüfung folgen derselben bestehenden Rundungsregel; keine Warnung wegen regulärer Eingabe.
- **Tatsächlich:** `(250 * 333 / 10000) * 100` ergibt `832.4999999999999`; Payload-Menge 832, `Fläche: 8,32 m²`, Preisbox 740,48 €. Die geometrische Formel zeigt gleichzeitig 8,33 m². Die lokale Bestellmail erwartet 833 und meldet `MENGE ZU KLEIN` / `NICHT ZUSCHNEIDEN`.
- **Technische Ursache / Dateien / Zeilen:** `blocks/tp-rollware-rechner.liquid:1654`–`1663` und `1843`–`1845`: `Math.round(area * 100)` nach Division der cm² durch 10.000. Derselbe Ansatz steckt im Preisvergleich bei Zeile 1265. `domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid:188`–`202` rechnet dagegen ganzzahlig `(cm² + 50) / 100`, abgerundet, entsprechend der dokumentierten Regel. Die Mail ist nicht die Quelle des Rundungsfehlers.
- **Umfang des Nachweises:** alle 2.185.846 ganzzahligen Maßpaare mit Breite 50–495 cm und Länge 100–5.000 cm für ein Fixture mit 400-/500-cm-Rollen geprüft. 3.310 Abweichungen, sämtlich genau eine Hundertstel-Einheit zu niedrig an exakten Halbgrenzen. Volle-m²-Modus: keine Abweichung. 19.604 weitere Maßpaare mit Rollenbreiten 200/300/400/500 cm: in beiden Abrechnungsmodi keine Abweichung. 35 Integrationsfälle am Originalcode inkl. Grenzen, Preisbox/Payload und lokalem Mail-Rendering. Auch der originale Meterware-Tipp nennt bei 350 × 129 cm den fehlerhaft zu niedrigen Raummaßbetrag (401,39 statt regelkonformer 402,28 € im Fixture).
- **Risiko:** in diesem Modus Unterberechnung um genau einen Varianten-Einheitspreis; bei eingesetzter Mail-Vorlage unnötige interne Prüfung vor Zuschnitt. **Kein Beleg für tatsächlich unterberechnete Live-Aufträge.** Angezeigter Gesamtpreis und rechnerischer Payload-Zeilenpreis stimmen untereinander; beide folgen aber der falschen Menge. Die Mail-Warnung ist keine Checkout-Sperre.
- **Empfohlene Lösung:** kaufmännische Hundertstel-Rundung auf Basis der bereits auf ganze cm normalisierten Maße numerisch stabil berechnen; Berechnung, Submit und Meterware-Tipp zusammen absichern. Einfass-Konfigurator weiterhin aufrunden lassen. Keine Preis-/Metafeldumstellung und keine Abschwächung der Mail-Warnung.
- **Aufwand / Sicherheit:** S–M / **BESTÄTIGT lokal für Code und Payload; Live-Betroffenheit offen**. Alle Varianten-IDs dieser neuen Reproduktion sind synthetisch. 89 Cent ist ein Rechenfixture, keine aktuelle Preisbehauptung für Rollenware.
- **Belege:** `evidence/room-pricing-2026-09-20.json` (`grid`, `observations`, `sourceIntegrity`, `limitations`), `scripts/reproduce-room-pricing.mjs`. Quellenregel zusätzlich `domains/shopify/benachrichtigungen/README.md`, Abschnitt Maßprüfung, und letzter fachlicher Commit `f819723`. Rollenblock und Rollenart-Asset sind hashgleich mit dem historischen Live-Snapshot; die aktuelle Mail-Vorlage ist nur lokal belegt.

### IMPLEMENTATION BRIEF – TP-004

- **Issue-ID / Priorität:** TP-004 / P3, bedingter Modus; Live-Reichweite vor Implementierung/Veröffentlichung ermitteln.
- **Ziel:** Hundertstel-Menge im Raummaß folgt an allen zulässigen ganzzahligen cm-Maßen der bestehenden kaufmännischen Rundungsregel.
- **Problem / Root Cause:** Gleitkomma-Unterschreitung einer Halbgrenze durch `area = cm² / 10000`, dann `round(area * 100)`. Kein Defekt der Shopify-Multiplikation und kein Anlass, den Aufrundungsmodus von Einfassprodukten zu ändern.
- **Betroffene Dateien:** primär `blocks/tp-rollware-rechner.liquid`. `assets/tp-rollware-art.js` nur falls für den Preisvergleich wirklich eine kleine Schnittstellenänderung nötig ist. Mail-Vorlage nur als Regressionstestquelle, unverändert lassen, sofern keine separate Ursache belegt wird.
- **Betroffene Funktionen / relevante Bereiche:** `calculate` 1654–1663; Click-Handler 1843–1845; `updateMeterTipp` 1259–1265. Effektive cm-Maße kommen aus `selectedWidth` und `getEffectiveLengthCm`.
- **Zu ändernde Logik:** stabile Ganzzahl-Halbaufrundung für positive cm-Maße, beispielsweise `floor((w * len + 50) / 100)` innerhalb nachweislich sicherer Integergrenzen. Derselbe fachliche Wert muss in Anzeige/Submit/Preisvergleich gelten. Im Vergleich liegen derzeit nur Flächenwerte am Rundungs-Callback an; deshalb Originalmaße berücksichtigen oder numerische Toleranz ausdrücklich aus den erlaubten Grenzen herleiten. Keine globale Ersetzung aller `ceil`/`round`-Aufrufe.
- **Nicht verändern:** vorhandene Preise/Varianten/SKUs/Metafelder, volle-m²-Aufrundung, Maßgrenzen, 5-cm-Zugabe nur für Rollenauswahl, Einfass-Aufrundung, Zusatzleistungen/Gruppe, echte Maß-Properties und Schutzfunktion der internen Mail.
- **Abhängigkeiten:** TP-003 teilt Rollenrechner und Submit; gemeinsame Arbeit sequenziell planen. Einfass-Konfigurator hat eine andere fachliche Rundungsregel. Mail-Mengenprüfung basiert auf Maßen/Produktmetafeld und darf nicht aus der manipulierbaren Flächen-Property rechnen.
- **Mögliche Seiteneffekte:** Tipp nennt einen anderen Betrag als der Rechner; versehentliches Aufrunden statt kaufmännischer Rundung bei 365 × 302 cm; Hauptmaße/Extras falsch gekoppelt; cmExact-Flag auf nicht umgestellte Preise angewandt.
- **Akzeptanzkriterien:** 250 × 333 → 833; 250 × 169 → 423; 50 × 203 → 102. 365 × 302 bleibt 1102; 250 × 201 bleibt 503; 333 × 200 bleibt 666. Im vollen-m²-Modus bleiben dieselben Fälle bei der bisherigen Aufrundung. Keine Rundungsabweichung im vorhandenen vollständigen Ganzzahlraster.
- **Testfälle:** exakte Halbwerte sowie benachbarte cm-Maße, unter/über Halbgrenze, Meterware 200/300/400/500 cm, Raummaß 395/396 cm beim Rollenwechsel, Mindest-/Maximalmaße, abgewiesene Randwerte, Preisbox/Properties/Payload aus Originalhandlern. Synthetische und echte Produktdaten in Ergebnissen deutlich unterscheiden.
- **Regressionstests:** Original-Payload in unveränderte Mail-Vorlage rendern: regulär kein Warnbanner, künstlich um eine Einheit reduzierte Menge weiterhin Warnung. Einfass-Rundung darf nicht angeglichen werden. Extras und Doppelklickschutz nach Änderungen am Submit gezielt prüfen.
- **Rollback-Risiko:** klein bei isolierter Rundungsänderung ohne Datenmigration; gemeinsamer CORE FILE mit TP-003 erfordert einen kontrollierten Diff.
- **Geschätzter Aufwand / empfohlene Reihenfolge:** S–M; vor Aufnahme in freigegebenen Fix-Auftrag Live-Verwendung feststellen (H-005), restliche Rechnerprüfung fortsetzen. Kein neues eigenes Fix-Pack, solange dieser Kontext fehlt.

## TP-005 – Nicht verfügbarer konfigurierter Kettelservice entfällt ohne Kaufsperre

- **Priorität / Bereich:** P3, bedingter Fehler der Service-Verfügbarkeit und Preis-/Payload-Zusammensetzung. Bei belegter Live-Betroffenheit Priorität anhand der tatsächlich betroffenen Produkte neu bewerten; keine aktuelle Unterberechnung von Kundenaufträgen behauptet.
- **URL / Template:** `templates/product.einfassung.json` → `blocks/tp-einfass-konfigurator.liquid` → `assets/tp-einfass-konfigurator.js`. Historische Preis-/Zuordnungsvorlage: `/products/piumera-teppich-nach-mass`, Rechteck, separate Kettelung. Aktuell nicht neu geöffnet. Das lokale Template hat `kettelservice_produkt: kettelservice`; aktuelle Verfügbarkeit dieses Produkts unbekannt.
- **Geräte / Browser:** originaler JavaScript-Rechen-/Submitpfad in Node/V8 mit minimalem DOM-Adapter; ursprünglicher Liquid-Datenvertrag lokal mit LiquidJS. Keine neue Desktop-/Mobile-/Safari-/Firefox-Beobachtung, kein echter Shopify-Cart.
- **Beschreibung / Bedingung:** Die Einfassart ist Ketteln, ein separat zu berechnendes Serviceprodukt ist im Block konfiguriert, die ausgewählte Servicevariante aber nicht verfügbar. Der Code behandelt diesen Ausfall wie das absichtliche Fehlen einer separaten Kettelposition. Die Materialvariante bleibt verfügbar.
- **Reproduktion:** `node audit/scripts/reproduce-einfass-pricing.mjs`; Referenzfall `reference rectangle 200x300` mit Fall `service unavailable` vergleichen. Beide haben dieselben 200 × 300 cm, Materialpreis 89 Cent/0,01 m² und konfigurierten Kettelservice zu 19 Cent/0,01 lfm. Im zweiten Fixture ausschließlich dessen `available` auf `false` setzen; alle IDs synthetisch. Gerendertes JSON in Originalfunktionen einspeisen und Request vor Netzwerk abfangen.
- **Erwartet:** Fällt der ausdrücklich konfigurierte, separat bepreiste Service aus, darf keine vermeintlich vollständig gekettelte Konfiguration ohne diesen Preisanteil angeboten/abgesendet werden. Kauf verständlich sperren, bis der Service wieder verfügbar ist; kein stiller Wechsel zu einem Inklusivpreismodell.
- **Tatsächlich:** Liquid setzt `kettel` auf `null`. Preisbox 534,00 € statt der Referenz 724,00 €; aktiver CTA, keine Fehlermeldung. Request enthält nur 600 Materialeinheiten, weiterhin `Einfassung: Gekettelt`, `Garn: Ton in Ton`, `Kante umlaufend: 10,00 m` und entsprechend `_Zuschnitt`. Die 1.000 Kanteinheiten/190,00 € entfallen. Lokale Mengenprüfung der Mail warnt dabei nicht: Materialmenge stimmt, die fehlende Servicezeile wird dadurch nicht erkannt.
- **Ursache / Dateien / Zeilen:** `blocks/tp-einfass-konfigurator.liquid:78`–`84` verwirft die nicht verfügbare oder nicht positiv bepreiste Servicevariante, ohne den Unterschied „kein separates Produkt gewünscht“ vs. „konfiguriertes Produkt ausgefallen“ im Datenvertrag zu erhalten; JSON bei 282 enthält nur `null`. JS übernimmt diesen Zustand bei 80, setzt Kantenmenge/Preis bei 606–607 auf null/0, lässt die Konfiguration bei 583–596 und 644–646 kaufen und erzeugt bei 707–727 einen einzelnen Material-Request. Submit-Gate 673–675 prüft Hauptvariante/Band, nicht den ausgefallenen Pflichtservice.
- **Risiko:** in diesem Zustand falsches Leistungsversprechen bzw. fehlender Servicepreis und unvollständige Gruppierung. Der Test belegt die erzeugte Anfrage, nicht Serverannahme, Auslieferung oder tatsächlichen Umsatzverlust. Bei Serviceausfall nach einem bereits gültigen Seitenladen kann Shopify den Mehrzeilenrequest anders behandeln; dieser Ablauf wurde nicht getestet.
- **Empfohlene Lösung:** Gültigen Inklusivpreisfall von fehlgeschlagenem konfiguriertem Zusatzservice unterscheiden. Einen expliziten Service-Validitätszustand aus Liquid bis Berechnung/Submit führen; bei Ausfall verständliche Kaufblockade. Nicht pauschal jede Ketteln-Art ohne separates Produkt sperren, solange deren Produktvertrag nicht geprüft ist.
- **Aufwand / Diagnose:** S–M / **BESTÄTIGT lokal unter der genannten Bedingung**; Live-Reichweite H-006 offen. Fehlendes optionales Serviceprodukt und Preis 0 wurden als weitere Codekontrollen ausgeführt, sind ohne Produktvertrag keine eigenständigen bestätigten Issues.
- **Belege:** `evidence/einfass-pricing-2026-09-20.json`, `conditionalServiceFailure` und benannte `observations`; `scripts/reproduce-einfass-pricing.mjs`. Block, JS, Rechenkern, Template und Farb-/Bandsnippets sind hashgleich mit dem historischen Live-Snapshot. Preisquelle: `docs/produktseiten/piumera-referenzprodukt-inhalte.md`, Abschnitt 9, historischer Stand 14.09.; keine heutige Produkt-/Preisverifikation.

### IMPLEMENTATION BRIEF – TP-005

- **Issue-ID / Priorität:** TP-005 / P3, bedingter lokaler Nachweis; H-006 vor Fix-Freigabe ergänzen.
- **Ziel / Problem:** Ein ausgefallener konfigurierter Kettelservice darf keine kaufbare Materialbestellung mit weiterhin versprochener Kettelung erzeugen.
- **Root Cause:** Liquid reduziert absichtlich fehlenden und nicht verfügbaren Zusatzservice auf denselben `null`-Wert. JS interpretiert beide als reine Materialabrechnung und prüft die Servicebereitschaft nicht.
- **Betroffene Dateien / Funktionen / Bereiche:** `blocks/tp-einfass-konfigurator.liquid`, Serviceauswahl 78–84 und JSON-Datenvertrag; `assets/tp-einfass-konfigurator.js`, Initialisierung, `rechnen`, `hinzufuegen`. `assets/tp-masstepich-rechnung.js` benötigt für diesen Fehler keine neue Formel. Gezielte Integrationsprüfung des Datenvertrags ergänzen.
- **Zu ändernde Logik:** Konfigurierten separaten Service und dessen Kaufbarkeit ausdrücklich unterscheiden; fehlende ID, nicht verfügbare Variante und ungültigen Preis im vereinbarten Pflichtservicepfad geschlossen behandeln. Rechnen/CTA und finaler Submit müssen denselben Status nutzen. Sichtbare verständliche Meldung statt preislich reduziertem Kaufangebot.
- **Nicht verändern:** echte Produkt-/Variantenpreise, SKUs, Verfügbarkeit/Bestände, Servicezuordnungen, zulässige Formen, Material-Aufrundung, Kantenrundung, Mindestpreis über beide Zeilen, Gruppe/Zuschnittattribute. Cover-/Bandarten und nachgewiesene Inklusivpreiskonfigurationen erhalten. Keinen Ersatzservice erfinden.
- **Abhängigkeiten:** lokales `product.einfassung.json` konfiguriert den Kettelservice; tatsächliche Produktauswahl/Verfügbarkeit kommt von Shopify. `TPMass`, Gruppen-Cart und `TPZuschnitt` bleiben bestehende Schnittstellen. Abgleich- oder Mailwarnung ersetzt keine Kaufvalidierung.
- **Mögliche Seiteneffekte:** versehentlich gesperrte Band-/Coverprodukte oder legitime Inklusivpreise, unerklärlich fehlender Kaufbutton, veralteter Zustand nach Farbwechsel, Durchbruch bei Doppelklick oder nach dynamischem Section-Laden.
- **Akzeptanzkriterien:** konfigurierter Service nicht verfügbar → verständlicher Hinweis, keine kaufbare reduzierte Summe, kein Cart-Request. Verfügbarer positiver Service → zwei Zeilen mit gemeinsamer Gruppe und vollständiger Summe. Gültiger expliziter Inklusivpreisfall bleibt wie vorgesehen kaufbar.
- **Testfälle:** verfügbar → nicht verfügbar → verfügbar in getrennt gerenderten Datenzuständen; konfiguriert aber ungültig; absichtlich nicht konfiguriert nach geprüftem Produktvertrag; Hauptvariante nicht verfügbar; Form-/Farbwechsel; Doppelclick nach Neuberechnung. Shopify-seitige Ablehnung nach späterem Lagerwechsel separat testen, nicht durch Umgehung lösen.
- **Regressionstests:** 200 × 300 → Material 600 × 89 + Kante 1.000 × 19 = 72.400 Cent; 50 × 50 → 69 × 89 + 200 × 19 = 9.941 Cent; korrekte Mindestpreis-Property; Rotation 350 × 420/420 × 350 unverändert. Mobile/Desktop, Gruppenentfernung und Zuschnittabgleich bei späterer Browser-QA.
- **Rollback-Risiko / Aufwand / Reihenfolge:** S–M, begrenzter Datenvertrags-/Gate-Fix ohne Datenmigration; beide Dateien gemeinsam versionieren. Erst H-006 und verbleibende Einfass-/Cart-Schnittstellen prüfen, danach passendes kleines Übergabepaket. Keine Reparatur während Phase 1/2.

## Offene Hypothesen – nicht als zusätzliche Issues gezählt

| ID | Untersuchung | Aktueller Beleg / Grenze | Nächster Nachweis |
| --- | --- | --- | --- |
| H-001 | Shopify-Reaktion auf `quantity:null`/extrem große Paketmenge | Nur lokal abgefangener Payload, keine historische ungültige Serverantwort | Isolierter anonymer Browser-Cart bei wieder verfügbarem Runner; keine Belastung durch große Bestellversuche nötig, ungültige Requests möglichst vor Versand abfangen |
| H-002 | Unterschiedliche Rundungsregeln | **Lokal geschlossen:** Regeln ausdrücklich dokumentiert und Einfass-Integration geprüft. 250 × 333 → 833, 365 × 302 → 1103 im Einfasspfad, letzteres im Raummaß absichtlich 1102 | Kein zusätzliches Issue; Regeln nicht vereinheitlichen |
| H-003 | Zubehörzustand nach Farb-/Artwechsel | Noch nicht interaktiv geprüft | Nach Preisprüfung sequenziell Rechner-/Variantenbereich |
| H-004 | Aktueller Shop entspricht noch historischem Live-Snapshot | Bisher geprüfte Rechnerquellen hashgleich; S03 ergänzt sechs Einfassquellen, heutige Admin-/Browserverifikation fehlt | MAIN-Theme und betroffene Assets bei verfügbarer Verbindung neu prüfen; ältere Web-Crawls nicht als Nachweis verwenden |
| H-005 | Aktive Live-Reichweite von TP-004 | Rechenfehler lokal sicher; keine aktuelle Rollenware mit `preis_pro_001_qm=true` nachgewiesen. Vorhandene Piumera-Belege zeigen volle m²; cmExact beim separaten Einfassprodukt beweist keine Nutzung im Rollenblock | Rein lesend Produkt-Template + Flag + aktive Variante/Preis und ggf. gerendertes `cm_exact` erfassen. Benachrichtigungsvorlage im Admin separat abgleichen; keine Testmail ohne Auftrag versenden |
| H-006 | Aktueller Pflichtservice-/Verfügbarkeitszustand zu TP-005 | Lokaler Ausfallpfad bestätigt, Template konfiguriert `kettelservice`, historische Piumera-Regel verlangt separate Kettelung; heutige Daten/Bestände unbekannt | Rein lesend MAIN-Template, zugeordnete Servicevariante und Kaufbarkeit/Preis-/Bestandspolicy prüfen. Absichtliche Inklusivpreise von ausgefallenen separaten Services unterscheiden; keine Bestände verändern |
| H-007 | Toleranz der Oval-Umfangsnäherung und aktive Formfreigaben | Code nutzt ausdrücklich Ramanujan-Näherung. Synthetisch 50 × 600 cm → 1.213 Kanteinheiten; numerische geometrische Integration → 1.214. Bei 200 × 300 beide 793. Kein belegtes aktuelles ovales Piumera-Produkt | Aktive Ovalprodukte/Grenzen und akzeptierte Abrechnungstoleranz belegen. Rechendifferenz dokumentiert, aber ohne diese Fachregel keine bestätigte Fehlabrechnung und kein pauschaler Formelumbau |
| H-008 | Haftunterlagen-Produktvertrag und zulässige Alternativverlegung | PR-022 lokal korrekt für einzelne Breite, gleich breite Bahnen in Teppichlängsrichtung und Aufrundung je Bahn. Aktuelle Varianten-/Preiszuordnung fehlt. Synthetische Dreh-/Mischlayouts können günstiger sein; Code verspricht nur günstigste Variante innerhalb seiner festen Bahnenregel | Aktuelle Variantentitel/Breiten, Preis je Einheit und Liefer-/Zuschnittregel rein lesend belegen. Vor einer Optimierung Materialrichtung, Bahnenmischung und Zusammenfassung laufender Meter fachlich prüfen; keine alternative Bestellung aus unbestätigten Annahmen erzeugen |

## Verworfen / eingegrenzt

- „Leeres Paketfeld kauft ein Paket“ ist ein ausdrücklich implementierter Ruhezustand, kein bestätigter Fehler.
- Bei `0`/negativer Paketfläche normalisiert Blur ebenfalls zum Ein-Paket-Ruhezustand; ohne gegenteilige fachliche Vorgabe kein eigenes Issue.
- Historische Standard-Paket- und Rollenwarepreise stimmen mit den realen Cart-Cents überein.
- Größere Shopify-Mengen bei `preis_pro_001_qm` sind beabsichtigte Abrechnungseinheiten, nicht automatisch ein Bug.
- Keine neuen Liquid-, Runtime-, Checkout- oder SEO-Fehler aus alten Textcrawls abgeleitet.
- Raummaß darf kaufmännisch auf Hundertstel runden, während das Einfassprodukt Hundertstel aufrundet; README und Mail-Code belegen diese Trennung. TP-004 betrifft nur die numerisch instabile Umsetzung der ersten Regel.
- Bei den 35 neuen lokalen Fällen war keine zusätzliche Abweichung zwischen sichtbarem Gesamtpreis und dem aus Payload-Menge × Fixturepreis folgenden Betrag nachweisbar. Das schließt die falsche Rundungsmenge aus TP-004 nicht aus.
- PR-021: Mindestpreis 99 € darf durch ganze Shopify-Einheiten zu 99,41 € führen. Bei 50 × 50 cm ist die Erhöhung auf 69 Materialeinheiten korrekt; Warenkorb-Property nennt 0,69 m² und gewünschte 0,25 m². Kein Mindestpreisfehler.
- Rund/oval werden in diesem Einfasspfad nach umschließendem Rechteck berechnet. Der andere Teppich-Wunschmaßpfad bleibt separat zu prüfen. Dezimalpunktmaße werden im geprüften Einfasshandler bewusst auf ganze cm aufgerundet; echte Browserbehandlung von Komma/Paste bleibt offen.
- PR-022: Haftunterlage wird nicht bloß nach niedrigstem Meterpreis gewählt. Originalcode minimiert Bahnen × volle Meter je Bahn × Variantenpreis; 198.468 Grenzvergleiche in drei synthetischen Katalogen ohne Abweichung. Gültige Fußleiste + Unterlage bleiben eigenständige Positionen mit gemeinsamer Gruppe. Kein zusätzlicher bestätigter Preis-/Mengenfehler in diesen Prüfungen.
- Historischer Hinweis „80 cm breit · 5 Bahnen = 10 lfm“ und „ab 9,35 € / m“ beweist keine konkrete Varianten-/Preiszuordnung. Der PR-022-Referenzpreis 93,50 € Unterlage und 752,10 € Gesamtkombination ist deshalb ausdrücklich ein lokaler Rechenfixture, keine aktuelle Shop-Preisbestätigung.
- Aufrundung jeder einzelnen Bahn ist die dokumentierte Codeabsicht; nur die Summe aller Teilmeter aufzurunden, Breiten zu mischen oder die Verlegerichtung zu drehen wäre eine andere Zuschnittregel. Mögliche Einsparung allein belegt ohne Produktvertrag keinen Fehler (H-008).
