# Audit-Session-Log

## Übernommener Einstieg – 19.09.2026

Die frühere interaktive Session identifizierte Repository und damaliges MAIN-Theme, verglich 643 Theme-Dateien und speicherte `source-manifest.json`, `runtime.json` und drei Screenshots. `MASTER_STATUS.md` stand auf 5 %, keine bestätigten Issues, nächste Aufgabe „isolierte Live-Tests und Codebelege zusammenführen“. Andere Audit-Steuerdateien und ein befülltes Fortschrittsprotokoll lagen noch nicht vor.

## 20.09.2026 – S01: Preisbelege zusammenführen

**Modus/Phase:** sequenziell, ein aktiver Bereich, keine Subagenten; Phase 1, keine Reparaturen, keine neuen Shopify-/Cart-Writes.

**Übernommener Git-Stand:** Branch `main`, HEAD `d63acaf`, zuvor nur `CODEX_PROGRESS.md`, `CONTINUE_PROMPT.md`, `TASK.md`, `audit/` untracked. Letzte fachliche Änderung: PR #381 / `f819723`, interne Bestellmail-Rundung; gegenüber Evidence-Basis `6672909` keine Änderung der beiden geprüften Theme-Blöcke. Keine fremden Änderungen zurückgesetzt.

**Untersucht:** alle 32 Datensätze der vorhandenen Runtime-Datei; Paketpreis/Reserve/Eingaben, Rollenwarepreis und ausgewählte Fußleiste ohne Länge. Die damaligen Seiten waren Marlow Eiche Nordisch Klickvinyl und Piumera Teppichboden. Keine Wiederholung der vollständigen Repository-/Theme-Kartierung.

**Quellen:** `blocks/paket-auswahl.liquid`, `blocks/tp-rollware-rechner.liquid`, historische Source-Hashes; ergänzend Preis-/Maßkern, Einbindung in Produkt-Templates und Paket-Cart-Snippet. Die beiden Hauptquellen sind weiterhin hashgleich mit dem historischen Live-Snapshot. Architektur/Abhängigkeiten sind bewusst nur als Teilkarte dokumentiert.

**Funktionen:** vollständiges eingebettetes Paket-Script mit minimalem DOM-Adapter; originale `updateExtras`, `fehlendesFeld` und Click-Listener des Rollenrechners mit gültiger Hauptkonfiguration. Netzwerk vollständig abgefangen. 21 lokale Fälle einschließlich positiver Kontrollen und der Defekte. Die lokale Zusatzprodukt-ID ist synthetisch; historische Serverantwort beweist separat die leere Fußleisten-Auslassung.

**Bestätigte Fehler:** TP-001 (P2) stille Umdeutung ungültiger/gemischter Zahlen; TP-002 (P3) nichtendliche/unsichere Mengen, historischer Mobile-Überlauf; TP-003 (P2) gewähltes Extra ohne Länge wird nicht bestellt. Keine neuen P0/P1.

**Verworfene/eingegrenzte Hypothesen:** Leeres Paketfeld kauft bewusst ein Paket; kein Fehler ohne gegenteilige Fachvorgabe. Standardfall 20 m² → 11 Pakete/116.578 Cent korrekt. Standardfall Rollenware 400 × 200 cm → 8 m²/52.720 Cent korrekt. Hohe interne Mengen können 0,01-m²-Einheiten sein. Serverannahme ungültiger Paketmenge wurde nicht behauptet.

**Tests:**

- Workflow geroutet: `TASK-D62D7B286336`, STATIC, keine externen Writes/geschützten Aktionen. Kein Executor/Agent gestartet.
- `router:status`: vorhandene Review-/Manifest-Infrastrukturprobleme, kein offener Agentenlauf laut Ausgabe. Kein Nebeninfrastruktur-Fix.
- `node audit/scripts/reproduce-pricing.mjs`: 21 Fälle und Evidence-/Hash-Kontrollen bestanden. Das Ergebnis bestätigt Istfehler, keine Fix-QA.
- `node --test --test-concurrency=1 qa/tests/rollware-art.test.mjs qa/tests/masstepich-rechnung.test.mjs qa/tests/bestellmail-masspruefung.test.mjs`: 55/55 bestanden, keine Skips/Fehler. Voller Report in `evidence/pricing-unit-tests-2026-09-20.log`.

**Infrastrukturgrenzen:** Browserwerkzeug konnte wegen Kernel-/Sandboxfehler `TIOCSTI` nicht starten; genau ein Retry, keine parallele Ersatzinstanz. Lokaler Shop-Lesezugriff scheiterte an DNS. Kein Shopify-MCP verfügbar. Web-Lesefallback lieferte einen alten Crawl, als Live-Beleg verworfen. Daher MAIN-Theme heute nicht neu bestätigt; ursprüngliche Snapshot-Registry nicht geändert.

**Vorbereitete Fix-Packs:** `FIX_PACK_02_PRICING_INPUTS`, READY zur späteren Übergabe, TP-001/002 in derselben Datei. Keine Ausführungsfreigabe, kein Agent beauftragt. TP-003 besitzt vollständigen Implementation Brief, Rechnerpaket noch NOT READY bis weitere Rollen-/Zubehörprüfung abgeschlossen ist.

**Noch offen:** restliche Preisrechnung und anschließend alle weiteren Bereiche nach Sequenz in MASTER_STATUS.md. Die 55 bestehenden Tests ersetzen keinen Integrations-/Live-Audit. FINAL_REPORT.md nicht erstellt, Gesamtaufgabe nicht vollständig.

**Genauer Fortsetzungspunkt:** TEST_MATRIX **PR-020**. Mit aktuellem Quellstand `blocks/tp-rollware-rechner.liquid` cmExact-Rundung/volle m² und tatsächliche Payloadmenge an Raummaßen prüfen; danach aktiven Einfasspfad `templates/product.einfassung.json` → `blocks/tp-einfass-konfigurator.liquid` → `assets/tp-einfass-konfigurator.js`/`assets/tp-masstepich-rechnung.js` für Form/Kante/Mindestpreis prüfen. `product.teppich.json` nutzt einen anderen Block und darf nicht verwechselt werden. Keine produktiven Reparaturen.

**Was wiederholen?** Keine PR-001–011 ohne geänderte Quelle oder neue Gegenbelege. Bei wieder verfügbarem Browser zuerst Live-Quelle verifizieren; nur noch offene echte Browser-/Cart-Aspekte ergänzen. Vor späterer Fix-Abnahme gezielte Wiederholung erforderlich, dann als QA kennzeichnen.

**Sicherung/Abschlusschecks:** siehe nachfolgenden Abschlussvermerk und CODEX_PROGRESS.md.

### Abschlussvermerk S01

- Dokumentstruktur, genau verlangte Fortschrittsabschnitte/Statuszeile, drei vollständige Issue-Briefs, JSON-Dateien und Whitespace geprüft: PASS (`evidence/audit-integrity-2026-09-20.json`). Keine getrackte Shop-/Quellcodedatei verändert.
- `npm run secret:scan --` für TASK.md, CODEX_PROGRESS.md und die Audit-Text-/Code-/JSON-Belege: PASS, keine Findings (`evidence/secret-scan-2026-09-20.log`).
- Lokale Dateisicherung vollständig. **Git-Commit nicht möglich:** bereits `git add TASK.md CODEX_PROGRESS.md audit` endet mit Exit 128, `.git/index.lock: Operation not permitted`. Die Umgebung erlaubt Lesen, aber keine Index-Schreiboperation. Kein Commit behauptet und keine Umgehung versucht. HEAD bleibt `d63acaf`.
- Nach Wiederherstellung regulären Git-Schreibzugriffs den Audit-Zwischenstand committen (vorgeschlagene Nachricht: `audit: document pricing evidence and validation findings`). `CONTINUE_PROMPT.md` war bereits untracked und blieb unverändert. Danach fachlich bei PR-020 fortsetzen.
- CODEX_PROGRESS.md bleibt **Status: WORKING**; weder Nutzungslimit erreicht noch Gesamtziel abgeschlossen. FINAL_REPORT.md bleibt ausstehend.
- Beim letzten Statuscheck lag `origin/main` einen Commit vor dem unveränderten lokalen HEAD: `d4202a8` aktualisiert ausschließlich `docs/ai-dashboard/issues.json`. Rein lesend abgeglichen; keine Quelle dieses Audit-Schritts betroffen, kein Pull/Merge ausgeführt.

## 20.09.2026 – S02: PR-020 Raummaß-Rundung

**Fortsetzung:** TASK.md/Watchdog und alle sechs Steuerdateien zuerst gelesen, AGENTS.md/Git geprüft. Lokal weiterhin `main` / `d63acaf`, `origin/main` einen Dashboarddaten-Commit voraus, ursprüngliche Audit-Dateien weiter untracked. Keine getrackten Änderungen übernommen oder verworfen. Nur PR-020 bearbeitet, keine Subagenten oder parallelen Bereiche.

**Was / welche Dateien:** `blocks/tp-rollware-rechner.liquid`, `assets/tp-rollware-art.js`, aktuelle `interne-bestellmail-block.liquid` samt README und historischen Produktnotizen für die Unterscheidung Rollenware/Einfassung. Originalfunktionen für Maßnormalisierung, feste Variantenauswahl, Preisbox, Meterware-Tipp und Cart-Submit lokal ausgeführt. Nicht Preisformeln in einem Nachbau nachgerechnet, sondern Source-Ausschnitte ausgeführt und gegen unabhängige Ganzzahlregeln verglichen.

**Seiten / Daten:** keine neuen Seiten geöffnet, keine aktuellen Produktdaten gelesen. Keine neuerlichen Versuche an der unverändert eingeschränkten Browser-/Netzwerkinfrastruktur. Synthetische Varianten-IDs und ausdrücklich hypothetischer cmExact-Datensatz; historische Piumera-Rollenware allein beweist dessen Live-Nutzung nicht. Neuer Shopify-Request und Mailversand: null.

**Befund:** TP-004 (P3), bedingter lokal bestätigter Codefehler. Beispiel 250 × 333 cm → 832 statt 833 Hundertstel-Einheiten; bei 89 Cent Testpreis 740,48 statt 741,37 €. Preisbox und Payload folgen derselben falschen Menge. Originale interne Mail lokal mit diesem Payload gerendert: Mengenwarnung. Bei 350 × 129 nennt auch der originale Meterware-Tipp den zu niedrigen Raummaßbetrag.

**Nachweisumfang / Tests:**

- `node audit/scripts/reproduce-room-pricing.mjs`: 35 Integrationseingaben. 29 erzeugte Requests vollständig abgefangen, sechs Grenz-/Leerfälle ohne Request. Preis-/Payload-Cents konsistent; vorhandener bedingter Rundungsfehler ausdrücklich nicht behoben.
- Quellformel über 2.185.846 Raummaßpaare in beiden Abrechnungsmodi verglichen: volle m² ohne Abweichung; Hundertstel mit 3.310 Abweichungen, alle genau eine Einheit zu wenig an exakten Halbgrenzen. Weitere 19.604 Meterwarepaare, beide Modi ohne Abweichung.
- Normale Mengen-/Preisfälle und Warn-/Nichtwarnfälle aus originalen Payloads mit LiquidJS geprüft. Keine neue Ausführung der 55 bereits abgeschlossenen S01-Tests und kein erneuter PR-001–011-Audit.
- Rollenblock und Rollenart-Asset jeweils SHA-256-identisch zum historischen Live-Snapshot; lokale Mail-Quelle separat gehasht, kein Nachweis ihres Admin-Deployments.
- Syntax-, Dokument-/Evidence-Konsistenz- und Secret-Scan-Abschlussprüfungen sind in `evidence/audit-integrity-s02-2026-09-20.json` bzw. `evidence/secret-scan-s02-2026-09-20.log` protokolliert.

**Eingegrenzte Hypothesen:** H-002 teilweise geschlossen: kaufmännische Rundung im cmExact-Rollenrechner und Aufrundung im Einfasskern sind unterschiedliche dokumentierte Regeln, kein Anlass zur Vereinheitlichung. TP-004 betrifft die fehlerhafte numerische Umsetzung der ersten Regel. Keine allgemeine Abweichung zwischen sichtbarem Gesamtpreis und Menge × Fixturepreis gefunden. Meterwarebreiten im untersuchten Raster nicht betroffen.

**Offen:** H-005 ist die aktuelle Live-Reichweite von TP-004 (Produkt-Template + Flag + Variante/Preis); außerdem tatsächliche eingesetzte Benachrichtigungsvorlage. Codefehler und hypothetischer Produktzustand nicht vermischen. PR-021/022 sowie übrige Auditbereiche offen.

**Fix-Packs:** kein neues Paket erstellt. TP-004 hat vollständigen Brief in ISSUES.md, teilt CORE FILE und Submit mit TP-003. Rechnerpaket NOT READY bis Reichweite und restliche Integration geklärt; erstes Paket unverändert READY zur späteren Übergabe. Keine Implementierung/Fix-QA.

**Workflow:** Route `TASK-61436AD57D6F` wurde wegen der Preis-/Payload-Begriffe als D / PRICE_SKU_VARIANT_WRITE klassifiziert. Tatsächliche Tätigkeit ausschließlich lokale Lesetests und Audit-Dokumentation; keine solche Schreibaktion angefordert oder ausgeführt. `RUN_STATIC_VALIDATION` war der erlaubte lokale Folgeschritt. Keine Executor-/Review-Agenten gestartet, keine Gate-Umgehung und keine unnötige Freigabefrage für die reine Analyse.

**Sicherung:** Dateien lokal gespeichert. `.git` ist laut unverändertem Berechtigungsprofil weiterhin nur lesbar; der in S01 dokumentierte Staging-Fehler wurde nicht durch alternative Git-Verzeichnisse/Berechtigungsänderungen umgangen. Kein neuer Commit behauptet. Bei regulär verfügbarem Git-Schreibzugriff beide Audit-Zwischenstände zuerst committen, `CONTINUE_PROMPT.md` unverändert lassen.

**Exakter nächster Schritt:** **PR-021**. Einfasspfad `product.einfassung.json` → `tp-einfass-konfigurator.liquid` → `tp-einfass-konfigurator.js` + `TPMass` mit Rechteck/rund/oval, Material/Hundertstel-Aufrundung, Kante, Mindestpreis und gemeinsamem Payload prüfen. Produkt-/Formfreigaben quellengebunden behandeln; `product.teppich.json` separat. H-005 bei wieder verfügbarem Live-Zugriff rein lesend ergänzen.

**Wiederholungen:** PR-001–011 und lokales PR-020 inklusive Raster/Preisbox/Mail nicht wiederholen, solange Quellen gleich bleiben. Neue Live-Daten/H-005 oder spätere Fix-Abnahme sind klar getrennte offene Tests.

**Status:** WORKING, Audit grob 14 %. FINAL_REPORT.md nicht erstellt, Gesamtauftrag nicht abgeschlossen.

## 20.09.2026 – S03: PR-021 Einfassrechnung

TASK.md/Override und Audit-Steuerdateien erneut übernommen, AGENTS.md/Git geprüft. HEAD bleibt `d63acaf`; origin/main mit `d4202a8` und `373704b` zwei reine Dashboarddaten-Commits voraus. Kein Pull/Merge, keine geprüfte Quelle geändert. Nur PR-021 aktiv, keine Agenten.

Route `TASK-E15694187EA4`: A / SCRIPT_FIRST / STATIC, keine geschützte Aktion, kein Executor gestartet. Lokale Originalfunktionen und Liquid-Datenvertrag werden mit synthetischen IDs und historisch belegten Referenzpreisen geprüft. Rund/oval sind Fähigkeitskontrollen, keine Behauptung einer aktuellen Piumera-Formfreigabe.


**Untersucht / Ausführung:** `product.einfassung.json`, Einfass-Liquidblock, Einfass-JS, TPMass, Farb-/Bandsnippets, lokale Mailvorlage und historische Piumera-Regeln. Original-Liquid-Datenvertrag gerendert, originale Berechnungs-/Submitfunktionen ausgeführt. Keine neue Vollkartierung und kein S01-/S02-Replay. Layout/Picker/Zeichnung und tatsächlicher Zuschnittabgleich sind ausdrücklich nicht Teil des lokalen Adapters.

**Ergebnisse:** 47 Fälle, 29 abgefangene Requests, 13 blockierte JS-Zustände und fünf Liquid-Gates. 200 × 300 → 724,00 €, 50 × 50 → 99,41 €, Mindestpreis-Properties passend. Rechteck/Rotation/Aufrundung und synthetische Rund-/Oval-/Cover-/Bandfälle geprüft. Doppelclick mit zwischenzeitlicher Neuberechnung bleibt ein Request. 29 aktuelle lokale Mailrenderings ohne Mengenwarnung; sechs Themequellen hashgleich zum historischen Live-Snapshot.

**Neuer Befund:** TP-005/P3, bedingt lokal bestätigt. Bei konfiguriertem nicht verfügbarem Kettelservice macht Liquid `kettel=null`; JS sendet bei 200 × 300 nur 600 Materialeinheiten/534,00 €, weiterhin als „Gekettelt“. 1.000 Kanteinheiten/190,00 € fehlen. Service tatsächlich live nicht verfügbar? Offen H-006; keine Serverannahme/Umsatzauswirkung behauptet. Vollständiger Implementation Brief, kein neues Fix-Pack und keine Reparatur.

**Eingegrenzt:** H-002 lokal geschlossen, unterschiedliche Raummaß-/Einfassrundung korrekt getrennt. Mindestpreisüberschreitung auf 99,41 € durch ganze Abrechnungseinheiten ist korrekt. H-007 dokumentiert die bewusste Oval-Näherung: synthetisch 50 × 600 → 1213 statt geometrisch 1214 Kanteinheiten; gültige Ovalprodukte und fachliche Toleranz fehlen, kein bestätigter Zusatzfehler. Historische Piumera-Freigabe nur Rechteck.

**Tests / Belege:** `node --check audit/scripts/reproduce-einfass-pricing.mjs` und `node audit/scripts/reproduce-einfass-pricing.mjs` erfolgreich. Zweiter Lauf nach Ergänzung der konkreten TP-005-Assertions und Konvergenzprüfung des Oval-Orakels; kein unnötiger Wiederholungslauf. Erstlauf hatte nur eine LiquidJS-Konfigurationswarnung; durch explizites `relativeReference: false` im Audit-Adapter beseitigt, keine Shopquelle geändert. Evidence/lesbare Zusammenfassung unter `einfass-pricing-2026-09-20.json` und `einfass-pricing-summary-2026-09-20.md`. PASS bezeichnet Diagnose, keine Fix-QA.

**Grenzen / Infrastruktur:** rein lokal, keine neuen Browser-/Admin-/DNS-Versuche. Alle IDs synthetisch, heutige Preise/Formfreigaben und aktive MAIN-Quelle nicht geprüft. `TPZuschnitt.abgleichen()` nur als erfolgreicher Aufruf simuliert, reale Cart-Gruppen/Attribute/Checkout weiter offen. Die Mailprüfung ist lokale LiquidJS-Ausführung, kein Versand/Deploymentnachweis.

**Sicherung:** Auditdateien fortlaufend lokal gespeichert. `.git` weiterhin laut Berechtigungsprofil nur lesbar, S01-Stagingfehler nicht durch Umgehung wiederholt. HEAD `d63acaf`, kein neuer Commit behauptet. Bei normalem Git-Schreibzugriff geprüften Gesamtzwischenstand zuerst committen. Dokument-/Evidence-Konsistenz und Secret-Scan stehen in `evidence/audit-integrity-s03-2026-09-20.json` und `evidence/secret-scan-s03-2026-09-20.log`.

**Exakter nächster Schritt:** PR-022 Haftunterlage im Rollenrechner: Datenvertrag, günstigste Breite/Bahnen/laufende Meter, Grenzmaße und Kombination mit gültiger Fußleiste bis Payload. Vorhandene Preisquellen sichern oder Fixtures synthetisch markieren. Danach PR-023. Abgeschlossene lokale PR-001–021 ohne Quellenänderung nicht wiederholen; Live-Nachweise H-005/006 gesondert nachholen, sobald möglich.

**Status:** WORKING, grobe Audit-Abdeckung 16 %. Phase 1, weiterhin keine produktiven Änderungen; FINAL_REPORT.md ausstehend.

## 20.09.2026 – S04: PR-022 Haftunterlage

TASK.md/Override und alle sechs Audit-Steuerdateien zuerst gelesen, AGENTS.md/Git geprüft. HEAD unverändert `d63acaf`, origin/main zwei reine Dashboarddaten-Commits voraus (`d4202a8`, `373704b`). Keine getrackten Änderungen, kein Pull/Merge. Nur PR-022 aktiv, keine Agenten oder Reparaturen.

Route `TASK-B75BBE82CD31`: A / SCRIPT_FIRST / STATIC, keine geschützte Aktion, kein Executor. Untersuchung des ursprünglichen Haftunterlagen-Datenvertrags und der Mengen-/Preiswahl bis zum Payload. Lokale Quellen nennen Preis je laufendem Meter und gleich breite Bahnen in voller Länge; aktuelle Produktvarianten/-preise sind noch nicht belegt und werden nicht geraten.


**Untersucht / Quellen:** `blocks/tp-rollware-rechner.liquid`, `assets/tp-rollware-art.js`, `templates/product.rolle.json`, Farbsnippet, vorhandene Preis-/Produktnotizen und schmaler historischer Unterlagenhinweis. Keine neuen Seiten geöffnet. Frühere Vollkartierung/Preisraster/Issue-Reproduktionen nicht wiederholt.

**Funktionen:** ursprünglicher Liquid-Datenvertrag; JS-Variantenauswahl, effektive Maße, `extrasAllowed`, `updateExtras`, `calculate` und originaler Click-Handler. Netzwerk komplett abgefangen. DOM-Adapter lässt Zeichnung, Section-/Farb-/Art-Lifecycle, Service-UI und Meterware-Tipp aus. Vier Quellenhashes stimmen weiterhin mit dem historischen Live-Snapshot überein.

**Ergebnisse / Tests:** `node --check audit/scripts/reproduce-underlay-pricing.mjs` und `node audit/scripts/reproduce-underlay-pricing.mjs` auf Anhieb bestanden. 61 Integrationsfälle, 54 Requests, sieben blockierte Hauptkonfigurationen; 447 Breiten × 148 Metergrenzlängen × drei synthetische Kataloge = 198.468 Vergleiche gegen unabhängige Integerarithmetik. Keine Abweichung von der implementierten Auswahlregel. Keine erneuten S01–S03-Testläufe, kein Theme-Check/Shop-Volltest ohne Themeänderung.

**Konkrete Kontrollen:** 400 × 200 cm mit 80-cm-/935-Cent-Fixture → 5 Bahnen/10 lfm/93,50 €, Gesamt 620,70 €. Mit gültiger Fußleiste 12 m zu 10,95 € → 752,10 €, drei Positionen mit derselben Gruppe. Anderer Katalog: 200-cm-Variante mit höherem Meterpreis gewinnt korrekt durch weniger Bahnen. Metergrenzen, Rotation als Gegenrechnung, Null-/Negativpreis, Verfügbarkeit, fehlende Breitentitel/Freigabe, abgewählte Extras, individuelle gültige Fußleiste, cmExact-Hauptware und Doppelsubmit enthalten. Events nennen die Summe der tatsächlichen Positionsmengen.

**Befunde / Grenzen:** kein neuer bestätigter Fehler. H-008 ergänzt: aktuelle Haftunterlagen-Breiten-/Preis-/Einheitenzuordnung und fachlich zulässige Dreh-/Mischverlegung noch zu belegen. Historisch sichtbarer Mindestpreis ist kein Variantensnapshot, deshalb alle neuen Unterlagenpreise/-IDs synthetisch. Vollmeter je Bahn ist ausdrücklich Codeabsicht; günstigere hypothetische andere Verlegungen werden nicht ohne Fachgrundlage als Bug gezählt. H-003 (echte Zustandswechsel) bleibt offen.

**Fix-Packs:** keine neuen Packs und keine Umsetzung. Rollenrechnerpaket weiter NOT READY: lokale Unterlagenpreisprüfung erledigt, H-005/H-008 und tatsächliche Cart-/Variantenintegration offen. Neue Kombinationsfälle als spätere gezielte Regression vorgemerkt.

**Sicherung:** Belege und Dokumente fortlaufend lokal gespeichert. `.git` bleibt laut unverändertem Berechtigungsprofil nur lesbar, daher kein neuer Stagingversuch/Commit behauptet und keine Berechtigungsumgehung. HEAD bleibt `d63acaf`. S04-Konsistenz-/Secret-Prüfprotokolle: `evidence/audit-integrity-s04-2026-09-20.json`, `evidence/secret-scan-s04-2026-09-20.log`. Keine getrackte Shopdatei geändert; TASK.md/CONTINUE_PROMPT.md und frühere Evidence unverändert.

**Exakter nächster Schritt:** PR-023a – `product.teppich.json` → `tp-teppich-wunschmass.liquid`: Produktzuordnung/Abrechnungseinheit, echte Fläche/Formzuschläge, Grenzen und Original-Payload. Nicht mit PR-021 vermischen. Danach PR-023b weitere Produktarten, anschließend Warenkorb. Lokale PR-001–011 und PR-020–022 ohne Quellenänderung nicht wiederholen; offene Live-/Fachdaten separat nachholen, wenn verfügbar.

**Status:** WORKING, grob 18 % Abdeckung, Phase 1. Keine Reparatur, kein FINAL_REPORT.md, Gesamtziel nicht abgeschlossen.

## 20.09.2026 – S05: PR-023a separater Teppich-Wunschmaßpfad

**Übernahme / Scope:** TASK.md/Watchdog-Override, Projektregeln und Auditsteuerdateien übernommen. Arbeitsbaum zunächst sauber; neuer übernommener HEAD `840b883` hat den S01–S04-Auditstand zwischenzeitlich gesichert. Frühere Fortschrittsangabe „alles uncommitted / HEAD d63acaf“ korrigiert. Kein Pull/Merge. Ausschließlich PR-023a, keine Agenten/parallel bearbeiteten Auditbereiche, keine Reparaturen.

**Routing / Infrastruktur:** `workflow:route` TASK-BE8F564E5710, B/STATIC, keine geschützte Aktion/Shopify-Writes. Routenvorschlag zum Agentenstart nicht ausgeführt: ausdrücklich sequenzieller Watchdogauftrag. `router:status` Exit 1: bestehende Review-/Manifestprobleme, kein offener Lauf. Kein Infrastrukturfix. `rg` fehlt; Suchfallback über `git grep`. Keine erneuten Browser-/DNS-/MCP-Versuche und keine neuen Livebehauptungen.

**Quellen / Reichweite:** `templates/product.teppich.json`, `blocks/tp-teppich-wunschmass.liquid`, lokale interne Bestellmail, `domains/shopify/rechner-zuordnung.md`, Service-Handoff und historische Reviewtexte. Datierte Produktprüfungen 09./11.09.: kein aktives Produkt auf Teppichtemplate; H-009 für heutige Zuordnung angelegt. Der Standard-Buybutton und Appblock sind im aktuellen Template disabled, älteren CSS-only-Review nicht als aktuellen Fehler übernommen. Keine Seite neu geöffnet; keine Produktdaten geraten.

**Ausführung / Tests:** neues `audit/scripts/reproduce-wunschmass-pricing.mjs` rendert den vollständigen Originalblock (nur Shopify-doc/schema beim Einlesen entfernt), führt die vollständige JS-IIFE in einem minimalen DOM aus und fängt sämtliche Fetches ab. Syntax und erster Diagnoselauf bestanden: 46 Fälle, drei verborgene Liquid-Gates, 13 blockierte Konfigurationen, 31 Requests in 30 Fällen, 28 endliche Einzelpayloads zusätzlich mit lokaler Mail gerendert. Keine S01–S04-Wiederholung. Mengenorakel mit ganzzahligen Hundertstelzentimetern und engem rationalem Pi-Intervall; zwei Hashvergleiche zum historischen Live-Snapshot bestanden. Kein Themecheck/Shop-Volltest ohne Änderung an Themequellen.

**Preisresultate:** Alle Preise/IDs synthetisch. 89 Cent/0,01 m², Rechteck 200×300 → 600/534,00 €, Quadrat 150 → 225, Kreis 200 → 315, Oval 200×300 → 472. 50×50 mit Mindestpreis 99 € → 112/99,68 €. Zuschlag 10 € auf 200×300 → 612/544,68 €; Einheitenrundung absichtlich. Maßgrenzen/Mindestfläche/0-Preis blockieren wie geprüft. Kein Vergleich dieser Formeln mit dem bewusst anderen Einfassvertrag als Fehler ausgegeben.

**Neue Befunde:** TP-006/P3: Dezimalmaße gehen bei ganzzahliger Propertyformatierung verloren; 200.5×300 ergibt 602 Einheiten, aber 201×300 als Bestellmaß → lokale Mail erwartet 603 und warnt. Quadrat150.5 ebenfalls Fehlwarnung; weitere Formen verlieren Maße, in Beispielen ohne Warnung. TP-007/P3: nach erstem Submit entsperrt Input→Render den Button; zweiter Request vor erster Antwort. Nativer unmittelbarer Doppelklick bleibt gesperrt. Beide lokal bestätigt, historisch ruhender Pfad, heutige aktive Betroffenheit nicht belegt. Vollständige Implementation Briefs in ISSUES.md.

**Hypothesen / Grenzen:** H-010 enthält isolierte Proben für fremde globale Formular-ID, Verfügbarkeit und unendliche Werte ohne Höchstgrenzen. Produkt-/DOM-/Native-Input-Nachweise fehlen, deshalb keine zusätzlichen bestätigten Shopissues daraus. Nummerneingabe, Komma/Paste/stepMismatch, echte Picker, Layout, Section-Lifecycle, Reload/Zurück nicht durch den Adapter belegt. Responses und Redirect simuliert; Mail weder versendet noch Admin-Deployment geprüft.

**Dokumente / Pakete:** Master, Matrix, Issues, Architektur, Abhängigkeiten, Fix-Pack-Index, Evidence-README und Progress aktualisiert. JSON und lesbare Zusammenfassung neu. Wunschmaßpaket NOT READY bis H-009/010; TP-006/007 teilen dieselbe Datei und dürfen nicht unabhängig implementiert werden. Kein neues Pack ohne aktive Reichweite; Ready 1, Done/QA 0.

**Sicherung / Abschlussprüfungen:** `git diff --check` erfolgreich. Normaler `git add CODEX_PROGRESS.md audit` scheitert erneut mit Exit 128: `.git/index.lock: Operation not permitted`. Das zuletzt aktualisierte Sandboxprofil führt `.git` nur lesbar; keine Umgehung, kein neuer Commit. Zwischenstand lokal vollständig gespeichert. Dokument-/Evidence-Konsistenz und gezielter Secret-Scan stehen in `evidence/audit-integrity-s05-2026-09-20.json` und `evidence/secret-scan-s05-2026-09-20.log`. Keine getrackte Produktionsquelle, TASK.md oder CONTINUE_PROMPT.md verändert.

**Exakter nächster Schritt:** PR-023b – vorhandene Rechnerzuordnung und Datenquellen für repräsentative Klebevinyl-/Teppichfliesen-/PVC-/Fixpreisprodukte zuerst lesen. Unterschiedliche Preis-/Einheitenverträge bis zum Payload gezielt prüfen; gemeinsame Mathematik PR-001–023a ohne Quellenänderung nicht wiederholen. Danach CART-002. H-005/006/008/009 bei verfügbarem Livezugriff rein lesend ergänzen. Sobald .git regulär beschreibbar: geprüften S05-Zwischenstand zuerst committen.

**Status:** WORKING, grob 20 % Auditabdeckung, Phase 1. FINAL_REPORT.md fehlt, Gesamtziel nicht abgeschlossen.

## 20.09.2026 – S06: PR-023b.1 Paketverträge weiterer Produktarten

**Übernahme:** TASK.md/Watchdog-Override, Auditsteuerdateien, AGENTS.md, Gitstatus und letzte Commits gelesen. HEAD weiterhin 840b883, S05-Dateien vorhanden und uncommitted; keine fremden Produktionsänderungen im Diff. Sequenziell, keine Agenten, kein Pull/Merge. Fortsetzung bei PR-023b, für einen abgeschlossenen Prüfschritt getrennt in Paketverträge (b.1) und anschließend PVC-/Stückpayloads (b.2). Kein abgeschlossener Test wiederholt.

**Route:** TASK-7D4BE41983DD, A/SCRIPT_FIRST/STATIC, keine geschützte Aktion/Shopify-Writes, kein Executor. Bekannte Router-/Browser-/DNS-Grenzen nicht erneut ausprobiert. Git-Schreibsperre im gleichen Berechtigungsprofil unverändert; S05-Indexfehler nicht durch Alternativpfade oder wiederholte Versuche umgangen.

**Quellen / untersuchte Funktionen:** Rechnerzuordnung, Paketinhalt-README, datierter Quadra-Befund vom 13.09., Merchant-Referenzen Alvora/Terracora, Leistenlängenquellen; Paketblock, Verkaufsart-, Produkt-/Kartenpreis-, Inhalts- und Cart-Snippets. Zusätzlich Rollen-/Fixpreis-/Zubehörtemplates sowie Mengenhilfe/Standard-Produktformular zur Kartierung gelesen. Keine Seite neu geöffnet. Vertrauliche ausgelagerte Lieferantenrohdaten nicht ins Repo übernommen; synthetische Preis-/ID-Fixtures klar bezeichnet.

**Abgeschlossener Prüfbereich:** 17 neue Paket-Datenintegrationen: drei unsichtbare Liquid-Gates, 14 abgefangene Requests, 28 Cart-Zeilenrenderings mit ursprünglicher und erhöhter Zeilenmenge. Quadra-Vertrag 5 m²/294,50 €/20 Fliesen trotz Produkttyp Teppichboden, synthetische Klebeverträge, zwei-/dreistellige Flächenpräzision, Stückfelder vorhanden/fehlend, Preisansichten, passendes/fremdes Variantenereignis. Drei zusätzliche Klassifikationskontrollen und fünf Templatezuordnungen, elf historische Hashvergleiche. Vollständige ursprüngliche JS-IIFE und Liquid-Snippets ausgeführt, keine Produktion repariert.

**Tests:** node --check und erster Diagnoselauf erfolgreich. Ein zweiter Lauf nach konsistentem synthetischem Stückfixture (10 × 100×33,4 cm für 3,34 m²) und zusätzlicher Assertion zur tatsächlich gerenderten Stückzeile ebenfalls bestanden. Keine S01–S05-Reproduktion/Mathematikraster erneut ausgeführt. LiquidJS-Geldfilter adaptiert; separates Cart-Rendering verwendet explizit Ganzzahldivision für dessen einzigen divided_by:100, um künstliche Engineabweichung auszuschließen. Originalquelle bleibt unverändert.

**Neuer Befund:** TP-008/P3, lokal bestätigter Cart-Präzisionsverlust. 0,794/1,588/30,272 m² werden im Cart zu 0,79/1,59/30,27 m². Menge und Centpreis korrekt. Daten-/Browserreichweite heute H-011 offen; keine falsche Geldabrechnung behauptet. Root Cause feste Hundertstelformatierung in tp-cart-paketzeile. Vollständiger Implementation Brief, noch kein neues Pack vor Cart-Prüfung.

**Eingegrenzt:** Paket vor Rolle bei Quadra korrekt, fehlender Rollenrechner dort fachlich bestätigt. Karte/PDP/Request folgen der echten Paketpreis-Einheit. Cart berechnet Fläche und Stückzahl korrekt aus aktueller Menge und ignoriert veraltete private Properties als Mengenquelle. Fehlende Stückdaten werden nicht erfunden. Aktueller Alvora-Preis nicht belegt, 3,34/103,37 bleibt synthetisch. Historische Verona-Terrazzokorrektur nicht zurückgenommen; kein Datenwrite.

**Grenzen / offene Aufgaben:** Nur PR-023b.1 abgeschlossen. PVC-/Fixpreis-/Stückpayloads PR-023b.2 noch offen; deren Klassifikation/Dateikartierung ist kein Integrationstest. Adapter beweist keine echte Browsersanitierung, Pickerereignisse, Cart-Ajaxbedienung, Drawer/Checkout, Layout oder heutige Liveprodukte. Keine Serverantwort oder neue Bestellung. S01–S05-Evidence unverändert.

**Sicherung / Prüfprotokolle:** Auditdokumente/Progress aktualisiert, neue Script-/JSON-/Summary-Dateien. Integrität und Secret-Scan in evidence/audit-integrity-s06-2026-09-21.json und secret-scan-s06-2026-09-21.log; git diff --check. Keine Shopquelle oder TASK.md/CONTINUE_PROMPT.md verändert. S05/S06 lokal uncommitted, HEAD 840b883, kein neuer Git-Commit behauptet; unverändert schreibgeschütztes .git, letzter normaler Stagingversuch S05 scheiterte.

**Exakter nächster Schritt:** PR-023b.2: Terracora Eiche Braun (marano-eiche-braun-vinylboden-von-der-rolle, historisch 2/4 m) und Stück-/Sockelleistenreferenz. Vorhandene Hersteller-/Shopdaten zur Einheit verwenden; aktuelle Preise/Varianten ohne Beleg synthetisch. Rollen-Datenvertrag und Mengenhilfe→Standardformular→abgefangener Payload prüfen. Startdateien im Master/S06-Summary. Danach CART-002. Keine b.1-/S01–S05-Replays ohne Quellenänderung. Bei regulär beschreibbarem .git geprüften S05/S06-Auditstand zuerst sichern.

**Status:** WORKING, grob 22 % Auditabdeckung, Phase 1. FINAL_REPORT.md ausstehend, Gesamtauftrag unvollständig.

**S06 – späte externe Änderung und erneuter Sicherungsversuch:** Während der Abschlussprüfung wurde CONTINUE_PROMPT.md von außen um den Hinweis ergänzt, `.git` sei jetzt durch `--add-dir .git` schreibbar. Die erste Integritätsprüfung stoppte korrekt wegen dieser neuen Datei außerhalb des erwarteten Audit-Diffs. Änderung gelesen, erhalten und nicht übernommen/verworfen. Aufgrund dieses neuen Hinweises normaler `git add CODEX_PROGRESS.md audit` erneut versucht: weiterhin Exit 128, `.git/index.lock: Operation not permitted`. Deshalb kein Commit möglich, keine Umgehung. Die abschließende Integritätsprüfung unterscheidet Audit-Dateien und diese eine externe Änderung ausdrücklich; Preis-/Integrationsdiagnosen nicht erneut ausgeführt.

## 21.09.2026 – S06-Abschluss und Übernahme des behobenen Git-Profils

Erneute Nutzerfortsetzung während der Sicherung: .git jetzt ausdrücklich im schreibbaren Profil. Bei Prüfung ist S05/S06 bereits durch Commit 9682ab7 gesichert; einzige externe Änderung CONTINUE_PROMPT.md bleibt erhalten. Der noch fehlende letzte S06-Konsistenz-/Secretlauf wird nachgetragen, keine Preistests erneut ausgeführt. Protokolle tragen das tatsächliche Abschlussdatum 21.09. Die frühere Aussage „Git gesperrt, S05/S06 uncommitted“ ist historisch und wird nicht als heutiger Blocker übernommen. Nächster Fachschritt bleibt PR-023b.2, Phase 1, sequenziell.

## 21.09.2026 – S07 / PR-023b.2 PVC- und Stückpayloads

**Übernahme:** S06-Abschluss regulär mit `git add`/`git commit` als **6b92861** gesichert, .git damit tatsächlich beschreibbar. TASK/Override, Regeln und Auditstand übernommen; keine alten Preisaufgaben neu gestartet. Externe Änderung CONTINUE_PROMPT.md erhalten und nicht gestaged. Routing TASK-677473AF97F6: B/STATIC, keine geschützte Aktion; keine Executor-/Agentenausführung.

**Scope / Quellen:** ausschließlich nächster Preisvertrag PR-023b.2, sequenziell. Historischer Merchant-Report und Rollen-Ausschlussliste (Terracora 2,00/4,00 m), Rechnerzuordnung, belegte Leistenlängen; keine aktuellen Preise aus diesen Quellen ableitbar. Alle Preis-/IDfixtures synthetisch, PVC-Variantenmetafeldzuordnung modelliert. Keine Shopify-Writes/Produktänderung.

**Durchgeführt / Ergebnis:** zehn PVC-Verträge durch Original-Liquid, Rolleninitialisierung, syncArtUi, Rechnen und Submit; acht Requests. Zwanzig Stück-/Zubehörfälle über vollständigen Mengenhilfeblock/JS und Standardform-Klasse mit originalem fetchConfig; 18 Requests. Richtige ganze Mengen und ID in diesen Stückfällen, fehlende/mehrdeutige Reichweite erzeugt bewusst keine Hilfe. Neun Quellhashes historisch gleich.

**Neuer Befund TP-009/P2:** Meteroptionen werden nicht als Breitenoption erkannt. Globaler erster Metafeldfallback liefert auch für gewählte 4-m-Variante 200 cm; 250 cm Länge → fünf statt zehn m², Property 200 cm, bei korrekter ID. Preisbox entspricht dem falschen Payload. Umgekehrte Reihenfolge kann Übermenge erzeugen. Einzelbreitenfallback und cm-Optionen korrekt. Vollständiger Implementation Brief; H-011 aktuelle Datenreichweite offen. Bestätigte Issues jetzt neun (P2=3, P3=6), kein P0/P1. Kein Reparaturauftrag und kein neues READY-Pack.

**Tests:** Syntax/erster Diagnoseversuch erfolgreich, keine fehlgeschlagene Produktroutine. Zweiter Lauf nach Aufnahme originaler syncArtUi und zusätzlicher Propertyassertion ebenfalls PASS: 30 Fälle/26 Requests. `node --test --test-concurrency=1 qa/tests/zubehoer-menge.test.mjs` **7/7 PASS**, 0 fail/skip. S01–S06-Diagnosen nicht erneut ausgeführt. Dokument-/Quellenintegrität, git diff --check und Secret-Scan in S07-Protokollen.

**Grenzen:** nur lokale LiquidJS-/DOM-/FormData-Adapter; originale Formel-/Submitquellen unverändert. Echte Browserzahleneingabe, Picker/Lifecycle, Live-Theme/-Produktdaten und Serverannahme offen. Standardform-Response absichtlich ausstehend, nur erster Request erfasst; Max-Guard als Rückgabewert vorgegeben. Keine Cart-/Checkoutbedienung als bestanden behauptet. S01-Infrastrukturgrenzen nicht erneut getestet.

**Sicherung:** Script, JSON, Summary, Unitlog und Auditkontrollen/Progress aktualisiert. Nur Auditdateien und CODEX_PROGRESS in den Abschlusscommit; CONTINUE_PROMPT bleibt extern. Git-Sperrnotizen S05/S06 sind historische Zustände, heute kein Hindernis.

**Exakter nächster Schritt:** CART-002a – Originalgruppen/Mengensperren/Entfernen/Zuschnittabgleich und vorhandene Tests lesen, sequenziell testen, Lücken bis abgefangene Cartmutationen gezielt ergänzen. `tp-cart-gruppen.js`, `tp-cart-gruppe.liquid`, `tp-zuschnitt-abgleich.js`; Testdateien cart-gruppen/cart-mengensperre/cart-waisen/zuschnitt-abgleich. Echte Drawer-/Cart-/Checkout-Integration gesondert offen halten. Kein erneuter PR-001–023b.2-Lauf ohne Quelländerung.

**Status:** WORKING, grob 24 % Abdeckung, Phase 1. Gesamtauftrag und FINAL_REPORT.md weiterhin offen.

**S07-Abschlusskontrolle:** Erster Integritätslauf stoppte an einer währenddessen extern geänderten docs/ai-dashboard/issues.json. Direkt danach zeigte git status/git diff diese Datei wieder unverändert bei gleichem HEAD 6b92861. Datei nicht angefasst oder gestaged; kein Produkt-/Diagnosetestfehler. Abschließender Integritätslauf prüft erneut den tatsächlichen Diff; CONTINUE_PROMPT.md bleibt die bekannte externe Änderung. Secret-Scan PASS ohne Befunde.

**S07 tatsächlich committed:** `4b8e49d` – audit: PR-023b.2 abschliessen und PVC-Breitenfehler TP-009 belegen. Normaler git add/commit erfolgreich, 15 Audit-/Progressdateien. Commitreferenz anschließend in Master/Progress nachgetragen; keine Produktdiagnose erneut ausgeführt. Nächster Schritt unverändert CART-002a, Status WORKING.

## 21.09.2026 – S08 / CART-002a

**Übernahme:** TASK mit SEQUENTIAL-Override, sechs Auditsteuerdateien, AGENTS/Git gelesen. HEAD 0d887b5, S07 abgeschlossen. Nur externe CONTINUE_PROMPT.md beim Start; docs/ai-dashboard/issues.json während Arbeit zeitweise extern geändert. Beide nicht bearbeitet/gestaged. Keine Agenten/parallel bearbeiteten Auditbereiche. Route TASK-DFF6F29D83E5 B/STATIC, keine geschützte Aktion/Executor.

**Untersucht:** Gruppen, Mengensperren, verwaiste Services, Gruppen-/Stücklöschung und Zuschnittabgleich. Zehn Originalquellen: Gruppenscript/-snippet, Cartklasse, Component-Basis, Zuschnittasset, Quantity-Snippet/-Basisklasse/-Cartklasse, Cartmarkup, Utilities. Alle hashgleich zur historischen Evidence. Keine neue Live-Seite geöffnet oder Shopify-Mutation.

**Tests:** vier vorhandene Suiten cart-gruppen/cart-mengensperre/cart-waisen/zuschnitt-abgleich 47/47 PASS. Neues Script reproduce-cart-core.mjs: Syntax/erster Lauf PASS. Zweiter Lauf nach genauer Fehlercontainer-Zeilenhierarchie und zwei Fällen mit Animation nach Fehlerantwort ebenfalls PASS. 20 Cartzustände/35 Zeilen/28 Mengenklammern, 13 Cartaktionen, zehn Abgleichabläufe: insgesamt 43 Fälle/34 Requests. Keine S01–S07-Wiederholung. Report und Summary neu, Integritäts-/Secretchecks separat.

**Befunde:** TP-010/P2 bestätigt, sechs Fälle ohne Wiederherstellung nach abgelehnter/netzwerkfehlgeschlagener Löschung. Gruppen-/Einzel-/letzte Gruppe; richtige Requestkeys, aber entfernte Zeilen/Leeransicht bleiben trotz modelliert unverändertem Servercart. Inlinefehler abgetrennt oder nur Console. Verzögerte Animation entfernt auch nach Fehlerantwort. Vollständiger Implementation Brief, NOT READY-Vormerkung, kein Fix.

**Positive Kontrollen / eingegrenzt:** JS/Liquid-Klassifikation und Kundeneinheiten stimmen im geprüften Fixtureumfang; normale Stück-/Paketware bleibt editierbar. Original-Quantity min=max sperrt beide Buttons. Gruppen von beiden Seiten vollständig per Key im Request. Reguläre Mengenablehnung setzt Feld und Fehler korrekt. Zuschnittabgleich erhält andere Attribute, prüft zurückgegebenen Zustand, bleibt bei Fehler gesperrt, erholt Queue bei explizitem Retry und verhindert eigene Eventschleife. Kein zusätzliches Issue daraus.

**Grenzen:** LiquidJS/DOM/Refs/Animation/Responses adaptiert, erfolgreiche Morphs und DOMParser modelliert. Echte MutationObserver-/Pointer-/Keyboard-/CSS-Timing-/Formular-/Drawerabläufe offen; keine serverseitige Shopify Validation Function nachgewiesen. Alle Produkte/Antworten synthetisch. H-012 neue Browser-/Cart-Hypothese; aktuelle Live-Betroffenheit TP-010 offen. Zehn bestätigte Issues (P2=4/P3=6), kein P0/P1 behauptet.

**Fortsetzungshinweise während Arbeit:** Wiederholte Nutzerfortsetzungen übernommen, laufenden S08-Abschluss fortgesetzt statt Tests neu zu starten. .git weiterhin beschreibbar, tatsächlicher Abschlusscommit nach Checks; nur Auditdateien und CODEX_PROGRESS stagen. Externe Dateien erhalten.

**Nächster konkreter Schritt:** CART-002b: Mengenereignis vom Originalselektor über Debounce; schnelle Aktionen/Antwortreihenfolge und Section-/Drawerzustand. Quellen component-quantity-selector, component-cart-quantity-selector, component-cart-items, section-renderer, cart-drawer, events. Echte Wiederöffnung/Reload/Checkout danach separat nachholen. Abgeschlossene Preis-/CART-002a-Tests nur bei betroffener Quelländerung wiederholen.

**Status:** WORKING, grob 27 %, Phase 1. Keine Reparaturen, FINAL_REPORT und Gesamtauftrag weiterhin offen.

**S08 tatsächlich committed:** `67ee9bc`, 15 Audit-/Progressdateien nach bestandener Integrität, Secret-Scan und git diff --check. Commit auf `audit/shop-audit`; dieser Branch wurde außerhalb meiner Befehle bereitgestellt, Parent bleibt 0d887b5. Externe CONTINUE_PROMPT.md und docs/ai-dashboard/issues.json weiterhin unverändert belassen. Commitreferenz in Master/Progress nachtragen und sichern; keine erneute Produktdiagnose. Status WORKING, nächster Schritt CART-002b.

## 21.09.2026 – S09 / CART-002b.1

**Übernahme:** TASK/Override, Auditstatus, relevante neue Issues/Matrix/Abhängigkeiten und Git gelesen; TASK/AGENTS seit letztem Abschluss unverändert. HEAD 1bf1d1a, externe CONTINUE_PROMPT.md und Dashboarddatei erhalten. Sequenziell, keine Agenten. Route TASK-401D094F14CB B/STATIC, keine geschützte Aktion/Executor.

**Scope:** nächster Ereignispfad aus CART-002b, als abgeschlossener Teil b.1 abgegrenzt. Originale Selektor-/Cart-/Eventklassen plus debounce/fetchConfig/parseIntOrDefault. SectionRenderer und Drawer zusätzlich gelesen, deren Antwort-/Lifecycleprüfung b.2 bleibt offen. Keine S01–S08-Diagnose erneut ausgeführt.

**Tests / Ergebnis:** Syntax und erster Lauf reproduce-cart-events.mjs PASS. Zwölf Fälle, elf abgefangene Requests, fünf historische Quellhashvergleiche. Native Node Event/EventTarget mit explizitem Bubbling-/DOM-Modell, virtuelle Timer. Gleiche Zeile mehrfach → letzter Wert korrekt; einzelne fremde Events ignoriert. Zwei verschiedene Zeilen bei 0/100 oder 0/299 ms verlieren erste Änderung; nachfolgendes fremdes Ereignis verdrängt geplanten Cartrequest vollständig. Zwei modellierte Cart-Komponenten zeigen denselben Fehler. TP-011/P2 in fünf Fällen bestätigt, vollständiger Implementation Brief.

**Grenzen:** Responses bleiben ausstehend, keine Serverannahme/Morph-/Preis-/Drawerabnahme. Handler direkt aufgerufen; 301-ms-Kontrolle beweist keine Pointerbedienung durch cart-items-disabled. Reale Browser-/PDP-/Cross-Komponenten-Erreichbarkeit H-012. Kein allgemeiner Utility-Debounce-Defekt und keine neue Issue zu bloß gelesenen Response-/Drawerpfaden.

**Dokumente / Sicherung:** neue Script-/JSON-/Summary-Dateien und Auditkontrollen/Progress. Integrität/Secret-Scan vor normalem Git-Commit. Externe Dateien nicht stagen. Elf bestätigte Issues: P2=5, P3=6; kein P0/P1. Cartblock TP-010/011 weiterhin NOT READY, kein Shopfix.

**Nächster konkreter Schritt:** CART-002b.2 – Antwortreihenfolge/Zeilenidentität, SectionRenderer vs. direkter Morph, Drawer-Event-/Dialog-Lifecycle. Quellen component-cart-items, section-renderer, cart-drawer, events, gegebenenfalls dialog. Echte Browser-Wiederöffnung/Reload/Checkout separat, keine fertigen Preis-/Gruppen-/Debouncefälle ohne Quellenänderung wiederholen.

**Status:** WORKING, grob 28 %, Phase 1, FINAL_REPORT/Gesamtauftrag offen.

**S09 tatsächlich committed:** `53ad666`, 14 Audit-/Progressdateien, Branch audit/shop-audit. Integrität, Secret-Scan und git diff --check bestanden. Commitreferenz anschließend nachgetragen; keine Produktdiagnose erneut ausgeführt. Externe CONTINUE_PROMPT.md/Dashboarddatei bleiben außerhalb. Status WORKING, nächster Schritt CART-002b.2.


## S10 – Section-Antworten und Fehler-Retry

S10 / CART-002b.2a lokal abgeschlossen: fünf Original-SectionRenderer-Fälle, zwei Defektfälle TP-012/P2, ein historischer Hashvergleich. Nach Fetch-/Bodyfehler starten drei Retries derselben URL keinen neuen Request. Andere Section funktioniert. Erfolgs-Deduplizierung, Cache/Forced Refresh und Schutz gegen alte Antworten bei beiden Antwortreihenfolgen bestanden. DOM/Parser/Morph adaptiert; kein Browser-/Livebeleg, keine Shopreparatur. Nächster Schritt CART-002b.2b: direkte Cartantworten, Zeilenidentität und Zusammenspiel mit SectionRenderer, danach Drawer/Dialog-Lifecycle. Keine bisherigen Diagnosen ohne Quelländerung wiederholen.

Evidence: `audit/evidence/section-responses-2026-09-21.json`; Script: `audit/scripts/reproduce-section-responses.mjs`. Route TASK-72075157B1A8, B/STATIC, kein Executor gestartet. Renderer ist gemeinsamer Abhängigkeitspunkt: TP-012 separat planen, Cart-Aufruferkonflikte mit TP-010/011 beachten.

S10 gesichert in `3a17b5f`: fünf Diagnosefälle, Syntax-/Integritäts-/Secretcheck PASS. Initiale Integritätsassertion erwartete versehentlich zehn statt neun vorgeschriebener Fortschrittsabschnitte; korrigiert und erfolgreich geprüft. Nächster Schritt CART-002b.2b. Externe Prompt-/Dashboardänderungen nicht committed.


## S11 – Direkte Cartantworten und Zeilenidentität

S11 / CART-002b.2b lokal abgeschlossen: acht Originalcode-Antwortfälle, vier historische SHA-256-Vergleiche, Syntax und Erstlauf PASS. Direkte Erfolgsantworten auf Cartseite/Drawer verwenden full/hydration korrekt; stabiler Fehlerindex setzt Eingabe zurück und zeigt Feedback. Bei zwei programmatisch gestarteten Mutationen entsperrt schon die erste Antwort; verspätete ältere Antwort kann jüngere überschreiben. Ein durch Original-DiscountEvent gestarteter Section-Request kann nach neuer direkter Cartantwort noch morphieren. Bei manuell verschobenen Refs landet Fehlerfeedback am früheren Index und damit anderer Zeile. Diese Überschneidungen sind H-013, keine zusätzlich bestätigten Shopissues: Pointer-/Debounce-Erreichbarkeit, Server-Snapshotreihenfolge, echte MutationObserver-/Morphabläufe fehlen. Keine Shopänderung, keine S01–S10-Replays.

Evidence: `audit/evidence/cart-responses-2026-09-21.json`; Script: `audit/scripts/reproduce-cart-responses.mjs`. Route TASK-6FFC7626F671, B/STATIC; kein Executor/Agent gestartet.

Nächster konkreter Schritt: CART-002b.2c: assets/cart-drawer.js und assets/dialog.js mit events.js auf Eventtypen, Öffnen/Schließen, History-/Disconnect-Lifecycle prüfen. Danach H-012/H-013 im echten Browser bei verfügbarem Runner; keine abgeschlossenen lokalen Response-/Retry-/Debouncefälle ohne Quellenänderung wiederholen.

S11 tatsächlich gesichert in `36a875e` (14 Dateien). Acht Diagnosefälle, Syntax, Integrität, Secret-Scan und git diff --check bestanden. Externe Prompt-/Dashboardänderungen erhalten und nicht committed. Nächster Schritt CART-002b.2c Drawer/Dialog; Status WORKING.


## S12 – Drawer-/Dialog-Lifecycle

S12 / CART-002b.2c lokal abgeschlossen: elf Originalcode-Lifecyclefälle, fünf historische Quellhashvergleiche, Syntax/Erstlauf PASS. Desktop/Mobile öffnen und schließen, Scrollstil/-position, modelliertes Back ohne doppelten Rücksprung, Disconnect/Reconnect der Listener und Sticky-Schwellen funktionieren in den Fixtures. Allgemeines CartUpdateEvent öffnet ebenfalls bei auto-open; die erste Zählansage bleibt leer, weil Öffnen erst im RAF erfolgt. Close/Disconnect vor diesem RAF verhindert dessen spätere Ausführung nicht. Letztere Beobachtungen bleiben H-014: natives Dialog-/Fokus-/Attach-/Historyverhalten und reale Erreichbarkeit nicht belegt. Keine neue bestätigte Issue-ID, keine Reparatur, keine früheren Diagnosen wiederholt.

Evidence: `audit/evidence/drawer-lifecycle-2026-09-21.json`; Script: `audit/scripts/reproduce-drawer-lifecycle.mjs`. Originale Klassen und Utilityfunktionen; modellierte Element-/History-/RAF-Umgebung, leere Animationsliste. Keine Native-Dialog-/Fokusabnahme. Route TASK-EECCC76EC036 B/STATIC; kein Executor.

Nächster konkreter Schritt: CART-003: Browserfähigkeit einmal neu prüfen (S01-Sperre ist historisch). Verfügbaren Browser nach Skill verwenden, öffentlichen Shop ohne Kaufabschluss zunächst rein lesend auf Drawer-Öffnen/Schließen, Fokus/Escape, Mobile Back/Reload und H-014 prüfen; Live-Theme vor livebezogenen Schlussfolgerungen aktuell verifizieren. Falls Browserzugriff weiterhin blockiert, Grenze konkret dokumentieren und sequenziell lokale Checkout-/Express-/Formularverträge prüfen. Keine S08–S12-Replays ohne Quelländerung.

S12 tatsächlich in `6726c3d` gesichert (14 Dateien). Elf Fälle, Syntax-/Integritäts-/Secretcheck und git diff --check PASS. Externe Prompt-/Dashboardänderungen nicht committed. Nächster Schritt CART-003 Browserfähigkeit und native Cartintegration; Status WORKING.


## S13 – Checkoutvertrag und Browserberechtigung (22.09.2026)

S13 / CART-003a: Browserzugang neu geprüft. Chrome-Verbindung verfügbar, Navigation zum öffentlichen Shop jedoch durch Browser-Sicherheitsprüfung wegen verweigerter Zugriffsberechtigung abgelehnt. Kein alternativer Zugriff versucht, keine Live-Theme-Verifikation. Anschließend neun lokale Checkout-Vertragsfälle bestanden (acht Original-CTA-Liquidrenderings, ein statischer Formular-/Header-/CSS-Vertrag), vier historische Quellhashvergleiche. Normale CTA verweist auf cart-form; Pflichtsperrfeld innerhalb POST-Formular; Drawer auf Carttemplate ausgeschlossen. Express erfordert Plattformflag und Themeeinstellung. Sperr-CSS setzt pointer-events:none und opacity:0.4, versteckt/deaktiviert Express nicht semantisch. Tastatur-/Expressumgehung bleibt H-015, kein neuer bestätigter Fehler.

Evidence: `audit/evidence/checkout-contracts-2026-09-22.json`, `browser-access-2026-09-22.json`; Script `audit/scripts/reproduce-checkout-contracts.mjs`. Route TASK-56DE810ED955 B/STATIC; kein Executor. Erster Lauf scheiterte an falscher Diagnoseannahme display:none; nach Lesen des CSS wurde ausschließlich die Auditassertion auf pointer-events/opacity korrigiert, zweiter Lauf PASS. Keine Shopreparatur.

Nächster konkreter Schritt: CART-003b: lokale Rabatt-/Cart-Notiz-Verträge in assets/cart-discount.js und assets/cart-note.js sowie snippets/cart-summary.liquid prüfen (Fehler, mehrfaches Absenden, Persistenz/Sections). Browserprüfung H-012–015 erst nach geänderter Zugriffsberechtigung fortsetzen; keine alternative Browser-/HTTP-/CDP-Umgehung oder wiederholte Zugriffsversuche. Vorhandene S08–S13-Diagnosen ohne Quelländerung nicht wiederholen.

S13 tatsächlich in `d9a0529` gesichert (15 Dateien). Neun Fälle, Syntax-/Integritäts-/Secretcheck PASS. Externe Prompt-/Dashboardänderungen nicht committed. Weiter CART-003b Rabatt/Notiz, Browserberechtigung bleibt Grenze. Status WORKING.


## S14 – Rabattfehler (22.09.2026)

S14 / CART-003b.1: sechs Original-Rabattfälle, drei stille Fehlerfälle TP-013/P3, vier historische Quellhashvergleiche. Erfolgreicher Rabatt dispatcht DiscountUpdateEvent und morphiert; nicht anwendbarer Code und Versandrabatt-Sonderfall zeigen vorhandene Fehlermeldung. Netzwerk-, HTTP-Fehler-JSON ohne discount_codes und ungültiges JSON enden ohne sichtbares Feedback. Eingabe bleibt erhalten, expliziter Retry funktioniert. Originalklassen/Utility, DOM/fetch adaptiert; keine Live-Rabattprüfung oder Shopreparatur.

Evidence: `audit/evidence/discount-errors-2026-09-22.json`; Script: `audit/scripts/reproduce-discount-errors.mjs`. Syntax/Erstlauf PASS; Route TASK-70BD752F5C44 B/STATIC, kein Executor. Kein Replay früherer Tests.

Nächster Schritt: CART-003b.2: cart-discount.js Entfernen und überlappende Requests/#activeFetch prüfen; anschließend cart-note.js Debounce/Abbruch/Fehler-/Persistenzvertrag mit cart-summary.liquid. Browser H-012–015 weiterhin berechtigungsbedingt offen; keine Umgehung oder erneute Anfrage ohne geänderte Berechtigung. S01–S14 ohne Quellenänderung nicht wiederholen.

S14 in `e26c6bd` tatsächlich gesichert: sechs Fälle, Syntax-/Integritäts-/Secretcheck PASS. Externe Prompt-/Dashboardänderungen nicht committed. Weiter CART-003b.2; Status WORKING.


## S15 – Rabattentfernung und Abbruch

S15 / CART-003b.2 lokal abgeschlossen: sechs Originalcodefälle, vier historische Hashvergleiche. Entfernen eines von zwei bzw. des letzten Rabattcodes sendet korrekte verbleibende Codeliste und aktualisiert Event/Section. Netzwerkfehler beim Entfernen erweitert TP-013 (kein Feedback). TP-014/P3: nach Abbruch von Request A durch B löscht A.finally die Referenz auf B; Aktion C bricht B nicht mehr ab. In zwei kontrollierten Folgen (Apply→Apply→Apply und Remove→Apply→Apply) reproduziert. Synthetische Antwortfolge zeigt älteren Morph nach neuem; reale Serverreihenfolge nicht behauptet. Sequentielle Erfolgskontrolle bestanden. Keine Shopreparatur/Liveanfrage.

Evidence: `audit/evidence/discount-concurrency-2026-09-22.json`; Script `audit/scripts/reproduce-discount-concurrency.mjs`. Syntax/Erstlauf PASS, keine S14-Replays. Route TASK-BF056AE4656F B/STATIC; kein Executor. Gemeinsame cart-discount.js für TP-013/014: FILE CONFLICT, kleine abgestimmte Schritte. Native Tastaturaktivierung nicht getestet; Template bindet echten Buttonclick, daher kein Keyboardfehler allein aus KeyboardEvent-Guard behauptet.

Nächster Schritt: CART-003b.3: assets/cart-note.js mit Original-debounce/fetchConfig und snippets/cart-summary.liquid prüfen: Notiz-Debounce, Request-Abbruch/Ownership, HTTP-/Netzfehler, Formular-Persistenz und Disconnect. Rabattfälle S14/S15 ohne Quellenänderung nicht wiederholen. Danach Cart-Audit lokal konsolidieren und offene Browser-/Checkoutabnahme getrennt halten. Browserzugriff bleibt seit S13 berechtigungsbedingt blockiert, keine Umgehung.

S15 in `93f1eef` tatsächlich gesichert. Sechs Fälle, Syntax-/Integritäts-/Secretcheck PASS. Externe Prompt-/Dashboardänderungen erhalten. Weiter CART-003b.3 Cartnotiz; Status WORKING.


## S16 – Warenkorbnotiz

S16 / CART-003b.3: sieben lokale Notizfälle PASS. Original-debounce bündelt Eingaben nach 200 ms; leere und Unicode-Notiz korrekt im Payload. Netzwerk-/HTTP500-Antworten ohne Fehlermeldung, erneute Eingabe startet neuen Request. TP-014 um bedingten Notizpfad erweitert: alter finally löscht neuere Controllerreferenz. Pending Timer läuft nach modelliertem Disconnect weiter; echte DOM-/Serverwirkung offen. Textarea ist name=note mit form=cart-form, daher kein bewiesener Bestellnotizverlust aus Ajaxfehler allein. Lokale Einstellung show_cart_note=false. Vier Code-/Markuphashes historisch identisch; settings_data.json weicht vom historischen Livehash ab, heutige Liveeinstellung nicht verifiziert. Keine Shopänderung.

Evidence: `audit/evidence/cart-note-2026-09-22.json`; Script `audit/scripts/reproduce-cart-note.mjs`. Route TASK-1E9C956DD1CD B/STATIC; kein Executor. Diagnosescript zweimal korrigiert: Konfigurationshash nicht als gleich voraussetzen; Shopify-Kommentar vor JSON-Parsing entfernen. Danach Syntax/Diagnose PASS. Keine alten Diagnosen wiederholt.

Nächster Schritt: CART-004: bisherigen lokalen Cart-Audit konsolidieren, Testmatrix auf offene statt abgeschlossene Fälle reduzieren und passende kleine Cart-/Rabatt-Fix-Packs anhand vollständiger Briefs vorbereiten (weiter Phase 1/2, keine Reparaturen). Browser-/Livegrenzen H-012–015 und Konfigurationsdrift ausdrücklich offen halten. Danach nächsten ungeprüften Rechner-/Variantenvertrag aus TEST_MATRIX auswählen. Keine fertigen Diagnosen wiederholen; Browserberechtigung S13 nicht umgehen.

S16 in `8636ca5` tatsächlich gesichert. Sieben Fälle, Syntax-/Integritäts-/Secretcheck PASS. Externe Prompt-/Dashboardänderungen erhalten. Weiter CART-004 Konsolidierung; Status WORKING.


## S17 – Cart-Konsolidierung (22.09.2026)

S17 / CART-004 abgeschlossen: Cart-Testmatrix S08–S16 konsolidiert, veraltete OFFEN-Einträge korrigiert, Browser-/Livegrenzen separat geführt. FIX_PACK_03_CART_REQUEST_FEEDBACK für TP-013/014 READY zur späteren lokalen Übergabe (inklusive minimaler Ownershipkorrektur der deaktivierten Notiz, keine Aktivierung). Cartkern TP-010/011 und Renderer TP-012 bleiben NOT READY wegen offener Integrations-/Aufrufergrenzen. Keine neuen Issues, Tests nicht erneut ausgeführt, keine Reparatur.

Route TASK-516D83336635 B/STATIC, kein Executor. Reine Dokument-/Link-/Scope-/Secretprüfung, keine alten Produktdiagnosen wiederholt. FILE CONFLICT: Paket 03 bündelt cart-discount.js und begrenzte cart-note.js-Ownership. Keine globale Renderer-/Cartqueueänderung. Paket 02 separat, aber keine Parallelfreigabe.

Nächster Schritt: CALC-001a / H-003: verbleibende Rollenrechner-Zustandswechsel lokal prüfen: Farb-/Artwechsel bei bereits gewählter Fußleiste/Haftunterlage, aktiver Varianten-ID und Preisbasis. Einstieg blocks/tp-rollware-rechner.liquid (change-Handler um 1756/1778), assets/tp-rollware-art.js und anschließender Variantenvertrag. Keine PR-020–023-Mathematik erneut ausführen; echte Picker-/Reload-/Browsernachweise getrennt offen halten.

S17 tatsächlich in `75f66e9` gesichert. Paket-/Link-/Integritätsprüfung und Secret-Scan PASS; keine alten Produktdiagnosen wiederholt. Zwei READY-Pakete, keines umgesetzt. Weiter CALC-001a/H-003; Status WORKING.


## S18 – Farb-/Art-/Zubehörzustand

S18 / CALC-001a.1: neun neue Übergangs-/Ereignisverträge PASS, zwei historische Quellhashvergleiche. Original-baseOptions/findVariant/rateOf/updateExtras über persistenten Feldern: Rot Meter→Rot Raum→Blau ohne Zubehörfreigabe→Blau Meter→Rot zurück. ID/Preis folgt gewählter Farbe/Art, Zubehör bei fehlender Freigabe ohne Items, eigene Leistenlänge 7 bleibt erhalten und wird beim Zurückwechseln wieder verwendet. Formular-ID hat Vorrang vor URL (synthetische Kombination); Farbchange plant 120 ms, Formularchange 100 ms, fremder Change nichts. Kein neuer bestätigter Fehler; H-003 nur teilweise geklärt.

Evidence: `audit/evidence/roll-extra-transitions-2026-09-22.json`; Script `audit/scripts/reproduce-roll-extra-transitions.mjs`. Originalfunktionen und document-change-Handler, synthetische Varianten/DOM, artMode gesteuert; Timerplanung erfasst, calculate nicht aus diesem Event ausgeführt. Kein vollständiger Picker-/Morph-/Submitnachweis. Syntax/Erstlauf PASS. Route TASK-E36D4BE4A434 B/STATIC; kein Executor/alte Diagnosen.

Nächster Schritt: CALC-001a.2: syncArtUi + calculate + Submit als zusammenhängende lokale Zustandsfolge prüfen: Wechsel zu Farbe ohne gewählte Rollenbreite bzw. ohne kaufbare Wunschmaßvariante, Art-Rückschaltung und Zubehör/ID im nachfolgenden Payload. Reale Farb-Picker-/Formular-/URL-Synchronisation anschließend VAR-001; keine Browserumgehung, keine fertigen Preisraster erneut ausführen.

S18 in `b4f010d` tatsächlich gesichert. Neun Fälle, Syntax-/Integritäts-/Secretcheck PASS. Externe Prompt-/Dashboardänderungen erhalten. Weiter CALC-001a.2; Status WORKING.


## S19 – Rollen-Zustand bis Submit

S19 / CALC-001a.2 lokal abgeschlossen: vier aufeinanderfolgende Wechsel mit vier abgefangenen Submits, zwei historische Hashvergleiche. Original-syncArtUi/calculate/Extras/Submit: initial Raummaß, Farbe ohne Wunschmaß/500er-Breite, Rückkehr und Farbe mit nicht kaufbarer Wunschmaßvariante. Rückschaltung auf Meter/400 cm korrekt, ID/Art/Gruppe/Zubehör im Payload passend; eigene Leistenlänge 7 erhalten. Angezeigte Summe entspricht jeweils Variantenpreis × Payloadmenge einschließlich Zubehör. Kein neuer bestätigter Fehler. Native Radioexklusivität modelliert, Picker/URL/Morph und Serviceanzeige nicht vollständig ausgeführt.

Evidence: `audit/evidence/roll-state-submit-2026-09-22.json`; Script `audit/scripts/reproduce-roll-state-submit.mjs`. Baseline aus Original-Liquid, synthetische Zusatzfarben; Darstellungs-/Service-/Einfasschip-Helfer adaptiert. Erster Lauf PASS, nach ergänzter Gesamtpreis-/Breitenassertion zweiter Lauf PASS. Keine alten Diagnosen ausgeführt. Route TASK-67D370DD36E8 B/STATIC; kein Executor.

Nächster Schritt: VAR-001a / H-003: blocks/color-swatch-picker.liquid, assets/variant-picker.js und relevante tp-farbe-Schnittstelle lesen; tatsächlichen Vertrag Farbchange→Formular-ID/URL→Rechnernachlauf lokal prüfen. Schnelle Auswahl/fehlende Variante/Verfügbarkeit und mehrere Formulare abgrenzen. Keine Wiederholung fertiger Preis-/Extras-/Submitfälle. Browserzugriff bleibt seit S13 berechtigungsbedingt blockiert; keine Umgehung.

S19 in `9324ec8` tatsächlich gesichert. Vier Übergänge/Submits, Syntax-/Integritäts-/Secretcheck PASS. Externe Prompt-/Dashboardänderungen erhalten. Weiter VAR-001a; Status WORKING.


## S20 – Farbpicker-Kombinationsvertrag

S20 / VAR-001a.1: sechs Fälle am vollständigen ersten Original-Farbpicker-IIFE, zwei historische Hashvergleiche. Gemeinsame Breite funktioniert mit initialem Zustand und Formular. Drei fehlende Kombinationsfälle (500 cm initial/Formular, Wunschmaß aus URL) bestätigen TP-015/P2: Radio zeigt neue Farbe, Label/ID/URL bleiben alt, kein tp:farbe-wechsel. Globale Formular-ID-Schreibweise verändert auch zweites synthetisches Formular; reale Fremdformularreichweite H-016 offen. Keine Shopänderung oder Liveabnahme.

Evidence: `audit/evidence/color-picker-2026-09-22.json`; Script `audit/scripts/reproduce-color-picker.mjs`. Erstlauf scheiterte am Zahlenwert im Formmock; natives String-Coercion-Verhalten im Adapter ergänzt, danach Syntax/Diagnose PASS. Keine Produktquelle geändert. Route TASK-A6785D897266 B/STATIC; kein Executor/alte Diagnosen.

Nächster Schritt: VAR-001a.2: native Optionsfelder/variant-picker.js Antwortvertrag und tp-farbe.js Verbraucher prüfen: Farbänderung→native Events→Formular-/URL-/Sectionzustand, Verfügbarkeit und mehrere Produktbereiche (H-016). TP-015 nicht durch frei geratene Breitenwahl reparieren. Keine fertigen Picker-/Rechnerfälle wiederholen; Browserberechtigung seit S13 nicht umgehen.

S20 in `79d438e` tatsächlich gesichert. Sechs Fälle, Syntax-/Integritäts-/Secretcheck PASS. Externe Prompt-/Dashboardänderungen erhalten. Weiter VAR-001a.2; Status WORKING.


## S21 – Farbverbraucher und Reconnect

S21 / VAR-001a.2a: acht Original-Farbverbraucherfälle PASS, vier Reconnect-Defektfälle TP-016/P3, drei historische Hashvergleiche. Native VariantUpdateEvent-Produktprüfung funktioniert, Farbnummern werden getrimmt. Globales fremdes tp:farbe-wechsel leert Properties bei fehlender ID, Anzeige behält alten Namen (H-016, reale Mehrproduktreichweite offen). Nach Disconnect/Connect derselben Instanz reagieren beide Klassen auf keinen der beiden Eventtypen; abgebrochener Controller wird wiederverwendet. Keine heutige Browser-/Morphreichweite oder Bestellfolge behauptet.

Evidence: `audit/evidence/color-consumers-2026-09-22.json`; Script `audit/scripts/reproduce-color-consumers.mjs`. Syntax/Erstlauf PASS, keine alten Replays. Route TASK-02EB9023E44A B/STATIC; kein Executor. FILE CONFLICT: beide Verbraucher in tp-farbe.js, keine parallelen Fixes.

Nächster Schritt: VAR-001a.2b: assets/variant-picker.js vollständig auf native Optionswahl, buildRequestUrl/fetchUpdatedSection, Abbruch/Antwortreihenfolge und VariantUpdateEvent prüfen. Anschließend product-form-/tp-farbe-Verbraucherbindung sowie H-016 Mehrproduktbereiche abgrenzen. S20/S21 nicht wiederholen; Browserberechtigung S13 nicht umgehen.

S21 in `467021f` tatsächlich gesichert. Acht Fälle, Syntax-/Integritäts-/Secretcheck PASS. Externe Prompt-/Dashboardänderungen erhalten. Weiter VAR-001a.2b; Status WORKING.


## S22 – Nativer Picker-Antwortvertrag

S22 / VAR-001a.2b.1: sechs lokale Original-Picker-Requestfälle PASS, drei historische Quellhashes gleich. Erfolg sendet variant:selected und variant:update; fehlende Metadaten, ungültiges JSON und Netzwerkfehler senden nur variant:selected. Bei ungültigem JSON erfolgt der adaptierte Picker-Morph vor dem Parsefehler. Überholter Request wird abgebrochen; nächste erfolgreiche Auswahl liefert wieder variant:update. DOM-Auswahl und Morph sind adaptiert, keine Liveprüfung. Product-Form-Verbraucher nur gelesen; mögliche hängenbleibende Submit-Queue ist H-017, kein bestätigtes Issue.

Evidence: audit/evidence/variant-responses-2026-09-22.json; Script: audit/scripts/reproduce-variant-responses.mjs. Syntax und Erstlauf PASS. Route TASK-02650F0E1B12 klassifizierte den lokalen Audit fälschlich als D/SHOPIFY_WRITE/HUMAN_GATE; keine externe Aktion, kein Executor und keine Reparatur ausgeführt.

Nächster Schritt: VAR-001a.2b.2: Original-Product-Form-Verbraucher an Picker-Fehlervertrag anbinden und Auswahl→Submit-Queue→Recovery lokal ausführen (H-017). Danach native DOM-/Lifecycle- und Mehrproduktabgrenzung H-016 fortsetzen. Fertige S20–S22-Fälle nicht wiederholen; Browserberechtigung S13 nicht umgehen.

S22 tatsächlich in `f0020fe` gesichert. Sechs Fälle, Syntax-/Integritäts-/Secretcheck und git diff --check PASS. Keine Shopänderung. Weiter VAR-001a.2b.2 / H-017; Status WORKING.


## S23 – Product-Form-Queue nach Variantenfehler (22.09.2026)

S23 / VAR-001a.2b.2: vier Original-Product-Form-Verbraucherfälle PASS, drei Quellhashes gegen S22 unverändert. S22-Ereignisspuren am Section-EventTarget wiedergegeben, keine Pickerdiagnose wiederholt. Erfolg gibt einen wartenden Kaufklick frei. Nach fehlenden Metadaten, ungültigem JSON oder Netzwerkfehler bleiben zwei Kaufklicks ohne Cart-Request in der Queue. Späteres Variantenupdate für ID 3 sendet beide gespeicherten Klicks für ID 2. H-017 damit lokal als TP-017/P2 bestätigt; echte Browser-/Shopreichweite offen.

Evidence: audit/evidence/variant-form-queue-2026-09-22.json; Script: audit/scripts/reproduce-variant-form-queue.mjs. Vollständige Original-ProductFormComponent und Originalevents, DOM/Refs adaptiert; nur abgefangene Requests, keine Browser-/Shopaktionen. Erstlauf und nach präzisierter Recovery-ID erneut Syntax/Diagnose PASS. Route TASK-CF85944395D0 B/STATIC, kein Executor.

CORE/SHARED FILE, HIGH RISK: variant-picker.js → events.js → product-form.js → Cart. Fehlender Abschluss und Queue-Recovery gemeinsam behandeln; kein globaler Eventumbau.

Nächster Schritt: VAR-001a.2c: native Picker-/Product-Form-Lifecycle-Aufrufer und Reconnect/Morphgrenzen lokal abgrenzen, danach Mehrprodukt-Ereigniszuordnung H-016. S20–S23 nicht wiederholen. Browserberechtigung S13 nicht umgehen.

S23 in `b49b709` tatsächlich gesichert. Vier Verbraucherfälle, Syntax-/Integritäts-/Secret-/Diffcheck PASS. Weiter VAR-001a.2c, keine Shopänderung, Status WORKING.


## S24 – Formular-Reconnect (22.09.2026)

S24 / VAR-001a.2c.1: vier Lifecycle-Beobachtungen am vollständigen Original-ProductFormComponent PASS. Erstverbindung aktualisiert ID, Disconnect ignoriert Update wie erwartet; dieselbe Instanz bleibt nach Reconnect auf alter ID, frische Instanz verarbeitet Update korrekt. Wiederverwendeter abgebrochener Controller bestätigt dieselbe Fehlerklasse wie TP-016; dessen Scope erweitert, keine neue Issue-ID. Sechs aktuelle Quellhashes gespeichert, keine historische Livegleichheit daraus behauptet.

Originalevents und native EventTarget/AbortController; Component-Basisklasse/Refs adaptiert, Lifecycle manuell. Kein tatsächlicher DOM-Morph, Submit oder Browserlauf. component.js erneuert nur eigene Refs/Observer, nicht privaten Formularcontroller. morph.js:523 verschiebt passende alte Knoten mit insertBefore; konkrete betroffene Produktstruktur offen. quick-add.js:228–237 ordnet geparste Quellknoten vor dem Morph um und beweist keinen Reconnect einer bereits verbundenen Instanz.

Script audit/scripts/reproduce-form-reconnect.mjs; Evidence audit/evidence/form-reconnect-2026-09-22.json. Syntax und Erstlauf PASS. Route TASK-B005090B4D3F B/STATIC, kein Executor.

CORE/SHARED FILE, HIGH RISK: product-form.js gemeinsam mit TP-017 koordinieren; kein pauschaler Morphumbau.

Nächster Schritt: VAR-001a.2c.2: native VariantPicker-Lifecycle (change-Listener, Radiozustand, Request nach Disconnect) isoliert prüfen; anschließend konkrete Morph-/Mehrproduktzuordnung H-016 abgrenzen. S20–S24 nicht wiederholen; Browserberechtigung S13 nicht umgehen.

S24 in `e381aac` tatsächlich gesichert. Vier Lifecycle-Beobachtungen, Syntax-/Integritäts-/Secret-/Diffcheck PASS. Weiter VAR-001a.2c.2. Keine Shopänderung, Status WORKING.

## S25 – VariantPicker-Reconnect (22.09.2026)

S25 / VAR-001a.2c.2: vier Lifecycle-Beobachtungen am vollständigen Original-VariantPicker PASS. Erstverbindung verarbeitet einen Change einmal. Nach Disconnect/Connect derselben Instanz bleiben zwei gebundene Change-Listener aktiv: ein Change sendet zweimal `variant:selected` und startet zwei Requests; der zweite bricht den ersten ab. Disconnect beendet einen bereits laufenden Request nicht. Eine frische Instanz verarbeitet genau einmal. TP-016 um den nativen Picker erweitert, keine neue Issue-ID.

Script `audit/scripts/reproduce-picker-reconnect.mjs`; Evidence `audit/evidence/picker-reconnect-2026-09-22.json`. Originalklasse und Originalevents, native EventTarget/AbortController; DOM/Refs, Optionsupdate und Antwort-Morph adaptiert. Erster Lauf scheiterte ausschließlich an fehlenden neutralen Component-Lifecycle-Methoden im Adapter; ergänzt, danach Syntax/Diagnose PASS. Route TASK-91B1228B1311 B/STATIC, kein Executor.

Grenze: kein echter DOM-Morph, keine Response-Fertigstellung und keine Browser-/Liveanfrage. Die Quellarrays `#radios`/`#checkedIndices` werden beim Reconnect nicht geleert; mögliche Darstellungsfolge nicht separat behauptet. Reale Morph-/Quick-add-Reichweite bleibt offen.

Nächster Schritt: VAR-001a.2c.3: konkrete Morph-/Quick-add-Aufrufer und Mehrprodukt-Ereigniszuordnung H-016 abgrenzen. Picker-/Formular-Reconnectfälle S21–S25 nicht wiederholen; Browserberechtigung S13 nicht umgehen.

S25 in `b8e16c5` tatsächlich gesichert. Vier Picker-Lifecycle-Beobachtungen, Syntax-/Integritäts-/Secret-/Diffcheck PASS. Keine Shopänderung. Weiter VAR-001a.2c.3, Status WORKING.

## S26 – Morph-/Mehrprodukt-Reichweite (22.09.2026)

S26 / VAR-001a.2c.3 lokal abgeschlossen: acht Produkt-Templates und sechs verbundene Quellen statisch geprüft. `tp:farbe-wechsel` wird dokumentweit gesendet und von beiden Farbverbrauchern dokumentweit ohne Produktprüfung verarbeitet; native `variant:update`-Events bleiben dagegen auf Section/Dialog/Product-Card und Produkt-ID begrenzt. Drei Templates (`product.einfassung`, `product.rolle`, `product.teppich`) haben aktiven Custom-Farbpicker plus Farbanzeige, aber deaktivierte normale Buy-Buttons. Alle acht Produkttemplates enthalten Empfehlungen. Das Quick-add-Snippet kann fremde Farbproperties rendern, lokale `settings_data.json` setzt `quick_add: false`.

H-016 bleibt bedingt: Bei aktiviertem Quick Add oder einem weiteren gleichzeitigen Farbverbraucher kann das globale Event fremde Properties leeren, doch der aktuelle lokale Konfigurationsstand belegt diesen Kundenpfad nicht; `settings_data.json` ist außerdem nicht historisch live-hashgleich. Kein neues bestätigtes Issue. Morph kann alte Knoten erhalten/verschieben und Quick-add-Inhalt morphen; reine Quellen belegen keine konkrete Browser-Callbackfolge. TP-016 bleibt lokal bestätigt, Live-Reichweite offen.

Script `audit/scripts/audit-variant-morph-reach.mjs`; Evidence `audit/evidence/variant-morph-reach-2026-09-22.json`. Erster und zweiter Versuch stoppten vor Auswertung an Shopify-Kommentarvorspannen in Template- beziehungsweise Settings-JSON; Parser jeweils ab erster JSON-Klammer korrigiert. Danach Syntax/Matrix PASS. Keine alten Lifecycle-Diagnosen, kein Browser und keine Liveanfrage. Route TASK-07C162F822FA B/STATIC, kein Executor.

Nächster Schritt: JS-001a: JavaScript-Runtime-Inventar ab aktuellem Quellstand erstellen und ungeprüfte globale Listener, Controller-/Reconnect- und Promise-Fehlerpfade priorisieren. S20–S26 nicht wiederholen; Browserberechtigung S13 nicht umgehen.

S26 in `98906eb` tatsächlich gesichert. Matrix-, Integritäts-, Secret- und Diffcheck PASS. Keine Shopänderung. Weiter JS-001a, Status WORKING.

## S27 – JavaScript-Runtime-Inventar (22.09.2026)

JS-001a abgeschlossen: 96 lokale JavaScript-Assets mit zusammen 25.206 Zeilen und aktuellen SHA-256-Werten inventarisiert. Gefunden wurden 77 Custom-Element-Definitionen, 56 Dateien mit `connectedCallback`, 47 mit globalen Document-/Window-Listenern und 16 mit `fetch`. Eine konservative Regex-Heuristik markiert 37 Dateien wegen einmalig erzeugter/abgebrochener Controller, gebundener Listener, globaler Listenerhäufung oder Fetch ohne lokalen Catch. Diese Flags priorisieren nur; sie sind ausdrücklich keine bestätigten Fehler.

Bereits in S08–S26 geprüfte Kernquellen sind im Report markiert, damit sie nicht blind wiederholt werden. Nächster neuer Ausführungskandidat ist `assets/quick-add.js`: `#cartUpdateAbortController` wird als Feld einmal erzeugt und bei Disconnect abgebrochen, während VariantSelected mit jeweils neuem `bind(this)` registriert/entfernt wird. S26 las bereits Modal-/Morphgrenzen, führte den Lifecycle aber nicht aus. Lokales Quick Add ist deaktiviert und Live-Reichweite unbekannt.

Script `audit/scripts/audit-js-runtime-inventory.mjs`; Evidence `audit/evidence/js-runtime-inventory-2026-09-22.json`. Erster Lauf stoppte an einer zu groben Controller-Gesamtzählung, die den erneuerten Fetch-Controller mit dem einmaligen Event-Controller vermischte. Feldbezogene Erkennung ergänzt; danach Syntax/Inventar PASS. Route TASK-6E453FC0AD72 B/STATIC, kein Executor, kein Browser/Netzwerk.

Nächster Schritt: JS-001b vollständigen Original-QuickAddComponent-Lifecycle Connect→Disconnect→Reconnect für CartUpdate/VariantSelected lokal ausführen. Modal-/Morphprüfung S26 nicht wiederholen.

S27 in `2242374` tatsächlich gesichert. Inventar-, Integritäts-, Secret- und Diffcheck PASS. Keine Shopänderung. Weiter JS-001b, Status WORKING.

## S28 – QuickAddComponent-Reconnect (22.09.2026)

JS-001b: vier Lifecycle-Beobachtungen am vollständigen Original-QuickAddComponent PASS. Initial reagieren VariantSelected und CartUpdate je einmal. Nach Disconnect reagiert der VariantSelected-Listener weiterhin, während CartUpdate korrekt nicht mehr reagiert. Nach Reconnect reagiert VariantSelected doppelt und CartUpdate gar nicht. Eine frische Instanz verarbeitet beide Ereignisse einmal.

Ursachen: `this.#updateQuickAddButtonState.bind(this)` erzeugt bei add/remove verschiedene Funktionsobjekte, sodass der dokumentweite Listener nicht entfernt wird. `#cartUpdateAbortController` wird als Feld einmal erzeugt, beim Disconnect abgebrochen und beim Reconnect mit bereits abgebrochenem Signal wiederverwendet. TP-016 um QuickAddComponent erweitert, keine neue Issue-ID. Lokale Repository-Einstellung Quick Add aus; Live-/Browserreichweite unbekannt.

Script `audit/scripts/reproduce-quick-add-reconnect.mjs`; Evidence `audit/evidence/quick-add-reconnect-2026-09-22.json`. Vollständige Originalklasse/Events, native EventTarget/AbortController; Component, DOM, Dialog und Media adaptiert, Eventtarget wegen fehlendem Node-DOM-Bubbling per Proxy. Erster Lauf stoppte vor Beobachtung an lexikalem VM-Zugriff auf ThemeEvents; Original-Ereignisnamen verwendet, danach Syntax/Diagnose PASS. Kein Modal/Morph/Fetch/Browser/Livezugriff. Route TASK-46ED4B67391A B/STATIC, kein Executor.

Nächster Schritt: JS-001c QuickAddDialog derselben Datei separat auf CartUpdate/VariantUpdate/DialogClose-Reconnect prüfen. Fertigen Component-/Morphpfad nicht wiederholen.

S28 in `7f3274c` tatsächlich gesichert. Vier Lifecycle-Beobachtungen, Integritäts-, Secret- und Diffcheck PASS. Keine Shopänderung. Weiter JS-001c, Status WORKING.

## S29 – QuickAddDialog-Reconnect (22.09.2026)

JS-001c: vier Lifecycle-Beobachtungen am vollständigen Original-QuickAddDialog PASS. Initial schließen CartUpdate, VariantUpdate-Linkabgleich und DialogClose-iOS-Nachlauf jeweils einmal korrekt an. Nach Disconnect ist CartUpdate entfernt und DialogClose entfernt, VariantUpdate bleibt jedoch aktiv. Nach Reconnect bleibt CartUpdate ausgefallen, VariantUpdate läuft einmal und DialogClose wieder einmal. Frische Instanz funktioniert vollständig.

Ursachen: Der einmal erzeugte `#abortController` wird beim Disconnect abgebrochen und für CartUpdate nicht erneuert. VariantUpdate wird ohne Signal registriert und nie entfernt; da die private Pfeilfunktion identisch bleibt, ignoriert EventTarget die erneute Doppelregistrierung, sodass ein Geisterlistener, aber kein Doppelaufruf entsteht. DialogClose verwendet eine stabile Referenz und wird korrekt entfernt. TP-016 erweitert, keine neue Issue-ID. Quick Add lokal deaktiviert, Livezustand unbekannt.

Script `audit/scripts/reproduce-quick-add-dialog-reconnect.mjs`; Evidence `audit/evidence/quick-add-dialog-reconnect-2026-09-22.json`. Vollständige Originalklasse/Events, native EventTarget/AbortController; Dialog-/DOM-/iOS-Layout adaptiert. Erster Lauf erwartete fälschlich eine Verdopplung identischer Listener; anhand des echten EventTarget-Verhaltens auf einen Aufruf korrigiert, danach Syntax/Diagnose PASS. Kein Modal/Morph/Fetch/Browser/Livezugriff. Route TASK-DB4E130DA403 B/STATIC, kein Executor.

Nächster Schritt: JS-001d `sticky-add-to-cart.js` als kaufnahen ungeprüften Runtime-Kandidaten lesen und Lifecycle ausführen. Quick-add-/Variantenfälle nicht wiederholen.

S29 in `0e710dd` tatsächlich gesichert. Vier Lifecycle-Beobachtungen, Integritäts-, Secret- und Diffcheck PASS. Keine Shopänderung. Weiter JS-001d, Status WORKING.
