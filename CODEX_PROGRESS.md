# Codex Fortschritt

## Gesamtziel
Vollständiger Shop-Audit nach TASK.md: Fehler belegen, priorisieren und mit Implementation Briefs/Fix-Packs übergeben. Phase 1/2 ohne produktive Reparaturen. Ausschließlich sequenziell, keine Subagenten.

## Aktueller Arbeitsbereich
Phase 1, S04: PR-022 lokal abgeschlossen – Haftunterlagen-Datenvertrag, günstigste einzelne Breite, Bahnen/laufende Meter und kombinierter Payload. Grobe Audit-Abdeckung 18 %. Nächster Teil PR-023a: separater Teppich-Wunschmaßpfad.

## Erledigte Aufgaben
S01: historische Runtime/erste Preisfälle, TP-001–003, Audit-Grundstruktur und erstes Fix-Pack. S02: PR-020 Raummaß, TP-004. S03: PR-021 Einfassung, TP-005. S04: 61 Unterlagen-Integrationsfälle und 198.468 unabhängige Auswahl-/Rundungsvergleiche, Preisbox/Properties/Gruppe/Eventmenge bis zum Payload geprüft. Kein neuer bestätigter Fehler, H-008 als offene Produkt-/Verlegefrage dokumentiert. Keine abgeschlossenen Testläufe wiederholt, keine Reparaturen/Agenten.

## Offene Aufgaben
PR-023a separates Teppich-Wunschmaß-Template und PR-023b weitere Produktarten. H-005 aktuelle cmExact-Raummaßprodukte/Mailvorlage, H-006 Kettelservice, H-007 Oval-Toleranz/-Freigaben, H-008 Haftunterlagen-Produktvertrag/Verlegung. Danach Warenkorb, übrige Rechner-/Varianten-/Runtime-Prüfungen, Mobile, Navigation/Suche, SEO, Performance, UX, Cross-Feature-Tests und Regression. Fix-/QA-Phasen nicht begonnen; FINAL_REPORT.md fehlt, Gesamtziel nicht vollständig.

## Geaenderte Dateien
S04: CODEX_PROGRESS.md; audit/MASTER_STATUS.md, SESSION_LOG.md, ISSUES.md, TEST_MATRIX.md, DEPENDENCY_MAP.md, FIX_PACK_INDEX.md, ARCHITECTURE.md und evidence/README.md aktualisiert. Neu: audit/scripts/reproduce-underlay-pricing.mjs, evidence/underlay-pricing-2026-09-20.json, evidence/underlay-pricing-summary-2026-09-20.md und S04-Abschlussprüfprotokolle. Vorherige Belege sowie TASK.md/CONTINUE_PROMPT.md unverändert. Keine Shopdateien geändert.

## Ausgefuehrte Tests
S04: Syntax und Originalcode-/LiquidJS-Audit auf Anhieb bestanden. 61 Integrationsfälle, 54 abgefangene Requests, sieben blockierte Hauptkonfigurationen. 447 Breiten × 148 Metergrenzlängen × drei synthetische Kataloge = 198.468 Vergleiche ohne Abweichung von der festen Bahnenregel. Vier historische Hashvergleiche bestanden. Kombination aus Hauptware, gültiger Fußleiste und Unterlage ergibt im Fixture 752,10 € mit drei gruppierten Positionen. Dokument-/Evidence-Konsistenz und Secret-Scan in S04-Protokollen. S01–S03-Tests nicht wiederholt. Route TASK-B75BBE82CD31: A/STATIC, keine geschützte Aktion/Executor.

## Bekannte Fehler
TP-001 (P2): stille Teilzahlübernahme. TP-002 (P3): nichtendliche/unsichere Paketmengen. TP-003 (P2): gewählte Fußleiste ohne Länge fehlt im Cart. TP-004 (P3): bedingte cmExact-Raummaß-Halbrundung eine Einheit zu niedrig. TP-005 (P3): nicht verfügbarer konfigurierter Kettelservice entfällt, „Gekettelt“ bleibt kaufbar. TP-004/005 lokal bestätigt, aktuelle Live-Betroffenheit offen. Kein zusätzlicher bestätigter Fehler in PR-022, kein P0/P1.

Browser-/DNS-/MCP-Grenzen aus S01 dokumentiert; S02–S04 rein lokal, keine erneuten Infrastrukturversuche oder Live-Bestätigungen. Alle Unterlagenkataloge/-IDs synthetisch. H-008 betrifft fehlende heutige Daten und zulässige alternative Verlegungen, keine bestätigte Fehlabrechnung.

Git-Sicherung blockiert: git add scheiterte in S01 an .git/index.lock (Operation not permitted); .git bleibt laut Berechtigungsprofil schreibgeschützt. Dateien lokal gespeichert, noch uncommitted. Keine Berechtigungsumgehung und kein behaupteter neuer Commit.

## Naechster konkreter Arbeitsschritt
TEST_MATRIX PR-023a: templates/product.teppich.json → blocks/tp-teppich-wunschmass.liquid. Aktive Produktzuordnung/Einheit und Preisregeln belegen, dann Formen/tatsächliche Fläche/Zuschläge/Grenzen bis Original-Payload prüfen. Fehlende Produktdaten als synthetische Fixtures markieren. Nicht mit product.einfassung/PR-021 verwechseln. Danach PR-023b, anschließend Warenkorb. PR-001–011 und lokale PR-020–022 ohne Quellenänderung nicht wiederholen. Offene H-005/006/008 bei verfügbarem Live-Zugriff rein lesend ergänzen. Sequenziell, keine Reparaturen.

Sobald .git regulär beschreibbar ist, den geprüften Audit-Zwischenstand zuerst committen: TASK.md, CODEX_PROGRESS.md und audit/. CONTINUE_PROMPT.md unverändert lassen.

## Letzter erfolgreicher Git-Commit
Übernommener HEAD: d63acaf (chore(dashboard): issues.json aktualisieren [skip ci]). Kein neuer Audit-Commit möglich: Index-Schreibzugriff verweigert, Exit 128 beim Staging in S01. Alle Ergebnisse liegen lokal unter audit/ und in CODEX_PROGRESS.md.

Letzter gelesener Remote-Stand: origin/main mit d4202a8 und 373704b zwei reine Dashboarddaten-Commits voraus; geprüfte Quellen unverändert, kein Pull/Merge ausgeführt.

Status: WORKING
