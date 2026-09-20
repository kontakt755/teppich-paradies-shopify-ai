# Codex Fortschritt

## Gesamtziel
Vollständiger Shop-Audit nach TASK.md: Fehler belegen, priorisieren und mit Implementation Briefs/Fix-Packs übergeben. Phase 1/2 ohne produktive Reparaturen. Ausschließlich sequenziell, keine Subagenten. COMPLETE erst nach vollständiger Aufgabe und geprüftem FINAL_REPORT.md.

## Aktueller Arbeitsbereich
Phase 1, S06: PR-023b.1 lokal abgeschlossen – Paketverträge für Klebevinyl/Teppichfliesen bis Preisansichten, Originalpayload und Cart-Flächenzeile. Grobe Auditabdeckung 22 %. Nächster Teil PR-023b.2: PVC-/Fixpreis-/Stückpayloads. S05-Ergebnisse erhalten; HEAD 840b883.

## Erledigte Aufgaben
S01: historische Runtime/erste Preisfälle, TP-001–003, Auditgrundstruktur/erstes Fix-Pack. S02 Raummaß/TP-004; S03 Einfassung/TP-005; S04 Haftunterlage; S05 separater Wunschmaßpfad/TP-006/007. S06: 17 Paket-Datenintegrationen, 14 abgefangene Requests, 28 lokale Cart-Renderings, elf historische Hashvergleiche; TP-008 mit vollständigem Implementation Brief. Klassifikation/Dateiwege für anschließende PVC-/Stückprüfung kartiert. Keine S01–S05-Testwiederholung, keine Reparaturen/Agenten.

## Offene Aufgaben
PR-023b.2 PVC-/Fixpreis-/Stückpayloads; danach CART-002, übrige Rechner-/Varianten-/Runtimeprüfungen, Mobile, Navigation/Suche, SEO, Performance, UX, Cross-Feature und Regression. H-005–011 behalten ihre belegten Live-/Daten-/Browsergrenzen. Insbesondere H-011: heutige Paketgrößen/Preise und Produktreichweite TP-008. Fix-/QA-Phasen nicht begonnen; FINAL_REPORT.md fehlt.

## Geaenderte Dateien
S06: CODEX_PROGRESS.md; audit/MASTER_STATUS.md, SESSION_LOG.md, ISSUES.md, TEST_MATRIX.md, DEPENDENCY_MAP.md, FIX_PACK_INDEX.md, ARCHITECTURE.md, evidence/README.md. Neu: audit/scripts/reproduce-package-contracts.mjs, evidence/package-contracts-2026-09-20.json, evidence/package-contracts-summary-2026-09-20.md, S06-Integritäts-/Secretprotokolle. S05-Dateien weiter vorhanden/uncommitted. TASK.md und Shopdateien unverändert; CONTINUE_PROMPT.md während S06 von außen ergänzt und von mir unverändert belassen; alte Evidence nicht überschrieben.

## Ausgefuehrte Tests
S06 Syntax und Originalcode-Diagnose bestanden: 17 Fälle (drei Liquid-Gates, 14 Requests), 28 Cart-Renderings; drei zusätzliche Verkaufsartkontrollen, fünf Templatezuordnungen, elf historische Hashvergleiche. Zweiter Lauf nach konsistentem Stückfixture und HTML-Gateassertion ebenfalls bestanden. Preise/Mengen korrekt, TP-008 lokal reproduziert. Dokument-/Evidence-Konsistenz, git diff --check und gezielter Secret-Scan in S06-Protokollen. Keine S01–S05-Replays. Route TASK-7D4BE41983DD: A/SCRIPT_FIRST/STATIC, keine geschützte Aktion oder Executor.

## Bekannte Fehler
TP-001/P2: Teilzahlübernahme. TP-002/P3: nichtendliche/unsichere Paketmengen. TP-003/P2: gewählte Fußleiste ohne Länge fehlt. TP-004/P3: bedingte cmExact-Halbrundung zu niedrig. TP-005/P3: ausgefallener konfigurierter Kettelservice entfällt ohne Sperre. TP-006/P3: Dezimalmaßrechnung vs. ganzzahlige Bestellmaße. TP-007/P3: Neuberechnung entsperrt laufenden Wunschmaßsubmit. Neu TP-008/P3: Cart zeigt dreistellige Paketfläche nur zweistellig (30,272→30,27 m²); Preis/Paketmenge korrekt. TP-004–008 nur lokal bestätigt; TP-006/007 historisch ruhender Pfad. Kein P0/P1, keine aktuelle Live-Fehlabrechnung behauptet.

S01-Infrastrukturgrenzen weiter dokumentiert; S02–S06 lokal. S06-Synthetic-Daten und LiquidJS-/DOM-Grenzen in Evidence beschrieben. PVC-/Stückwege nur kartiert, noch kein Payloadtest. Kein aktueller Live-Theme-/Produktnachweis.

Git: S01–S04 in 840b883 gesichert. S05/S06: git add scheiterte an .git/index.lock (Exit 128) - Ursache war, dass die Watchdog-Sandbox-Freigabe fuer .git (--add-dir) nur beim allerersten `codex exec`-Aufruf eines Threads gilt, NICHT bei `codex exec resume` (jeder resume bekam bis dahin wieder die Standard-Sandbox ohne .git-Schreibrecht). Root Cause vom Watchdog-Betreiber ausserhalb dieser Session bestaetigt und behoben: ab sofort wird bei JEDEM Aufruf (auch resume) zusaetzlich `-c sandbox_workspace_write.writable_roots=[".git-Pfad"]` gesetzt. Ab dieser Session sollte `git add`/`git commit` also tatsaechlich funktionieren - aktiv ausprobieren, nicht auf aeltere Eintraege in dieser Datei verlassen. S05/S06-Inhalte liegen weiterhin lokal vor (uncommitted), zuerst committen, dann weiterarbeiten.

## Naechster konkreter Arbeitsschritt
PR-023b.2: PVC-Referenz Terracora Eiche Braun (marano-eiche-braun-vinylboden-von-der-rolle, historisch 2-/4-m-Breiten) und Stück-/Sockelleistenreferenz. Vorhandene Einheit-/Preisdaten aus Merchant-Report, Rechnerzuordnung und Leistenlängenquelle zuerst lesen; fehlende aktuelle Werte synthetisch kennzeichnen. Original-Rollen-Datenvertrag und Mengenhilfe→Standardformular→abgefangenen Payload prüfen. Danach CART-002. Abgeschlossene Paket-/Mathematiktests S01–S06 nicht ohne Quellenänderung wiederholen. Bei regulär beschreibbarem .git S05/S06-Stand (CODEX_PROGRESS.md und audit/) zuerst committen; TASK.md/CONTINUE_PROMPT.md unverändert lassen.

## Letzter erfolgreicher Git-Commit
840b883 – audit: Zwischenstand des Shop-Audits sichern (18%, Watchdog-Setup). Kein neuer Commit; letzter normaler Stagingversuch S06 trotz neuem externen Freigabehinweis durch Sandbox-Schreibschutz abgelehnt. Kein Pull/Merge oder Push.

Status: WORKING
