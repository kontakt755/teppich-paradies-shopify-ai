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
