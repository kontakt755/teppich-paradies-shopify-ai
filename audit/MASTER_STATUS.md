# Teppich-Paradies – Auditstatus

AUDIT FORTSCHRITT: 18 %

Stand: 20.09.2026. Phase 1 – ausschließlich Analyse. Sequenziell; keine Subagenten. Keine Shopdateien oder Produktdaten geändert. Prozentwert ist eine grobe Abdeckungsschätzung, kein Anteil bestandener Tests.

Abgeschlossen:
- [x] Historischer Einstieg übernommen: Repository und Live-Theme am 19.09. identifiziert; Source-Manifest vorhanden. Keine erneute Vollkartierung.
- [x] Alle 32 Einträge in der übernommenen Runtime-Evidence ausgewertet; Desktop 1440 und Mobile 390.
- [x] Paket-Referenzpreis und Rollenware-Referenzpreis gegen historische Warenkorbantworten geprüft.
- [x] Paket-Eingabevalidierung und leere ausgewählte Fußleiste lokal am Originalcode reproduziert; drei Issues dokumentiert.
- [x] Audit-Grundstruktur und ein zusammenhängendes Übergabepaket erstellt.
- [x] PR-020 lokal abgeschlossen: Raummaß-Rundung, Preisbox/Cart-Payload und interne Maßprüfung; 35 Integrationsfälle und vollständiges Ganzzahlraster. TP-004 als bedingter Codefehler, aktuelle Live-Reichweite offen.
- [x] PR-021 lokal abgeschlossen: Liquid-Datenvertrag und Einfass-Originalfunktionen in 47 Fällen geprüft, 29 Requests abgefangen. Material/Kante/Mindestpreis/Properties stimmen im gültigen Referenzpfad; TP-005 als bedingter Service-Ausfallfehler, Live-Reichweite offen.
- [x] PR-022 lokal abgeschlossen: 61 Haftunterlagen-Integrationsfälle und 198.468 Auswahl-/Rundungsvergleiche. Günstigste einzelne Variante für gleich breite Bahnen in fester Richtung, Preis/Properties/Gruppe bis Payload korrekt. Kein neuer bestätigter Fehler; Live-Produktvertrag/andere Verlegeweisen H-008 offen.

In Arbeit:
- [~] Preisberechnung: nächster Teil ist der separate Teppich-Wunschmaßpfad (PR-023a); nur dieser Bereich wird als Nächstes bearbeitet.

Noch offen:
- [ ] Restliche Preisfälle: separater Teppich-Wunschmaßpfad und weitere Produktarten; offene Live-Reichweite/-Produktfreigaben H-005–008 klären.
- [ ] Warenkorb bearbeiten, Gruppen, Kombinationen, Checkout vertiefen.
- [ ] Vollständige Rechner-/Grenzfall-, Varianten- und Runtime-Prüfung.
- [ ] Mobile, Suche/Navigation, Performance, SEO, UX, Cross-Feature-Tests und finaler Regressionstest.
- [ ] Architekturkarte vervollständigen; Phase 2 abschließen; spätere freigegebene Fixes und QA.
- [ ] FINAL_REPORT.md und belegte Abschlussbewertungen.

Anzahl bestätigter Issues: P0: 0 · P1: 0 · P2: 2 · P3: 3 · P4: 0. Davon TP-004/005 ausschließlich lokal bestätigte bedingte Codefehler, Live-Betroffenheit nicht belegt.

Aktuell untersuchter Bereich: Preisberechnung, Phase 1.
Letzte abgeschlossene Aufgabe: PR-022. 61 Fälle mit originalem Liquid-Datenvertrag und JS; 54 Requests abgefangen, sieben ungültige Hauptkonfigurationen blockiert. 198.468 unabhängige Grenzvergleiche ohne Abweichung von der implementierten Auswahlregel. Kombination Material + Fußleiste + Unterlage im Referenz-Fixture 752,10 €, drei Positionen mit gemeinsamer Gruppe. Preise/IDs der Unterlagenkataloge ausdrücklich synthetisch. Keine Reparatur.
Nächste Aufgabe: **PR-023a** aus TEST_MATRIX.md. `templates/product.teppich.json` → `blocks/tp-teppich-wunschmass.liquid`: separaten Wunschmaß-/Formpreisweg, Flächenregel, Formzuschläge, Grenzmaße und Original-Payload prüfen. Aktive Produktzuordnung und Einheiten aus verlässlichen vorhandenen Daten belegen, ansonsten Fixtures synthetisch markieren. Nicht mit dem abgeschlossenen Einfasspfad verwechseln. Anschließend PR-023b (weitere Produktarten), danach Warenkorb. PR-001–011 und lokale PR-020–022 ohne Quellenänderung nicht wiederholen. H-005/006/008 nur bei verfügbarem Live-Zugriff ergänzen.
Wichtige offene Hypothesen: siehe ISSUES.md H-001, H-003–H-008. H-002 (unterschiedliche Rundungsregeln) lokal geschlossen. H-007 betrifft Oval-Näherung; H-008 heutige Haftunterlagendaten und zulässige Alternativverlegung. Keine dieser offenen Fach-/Datenfragen als zusätzlicher Fehler gezählt.
Fix-Packs Ready: 1 · Done: 0 · QA Passed: 0 · QA Failed: 0

Live-Testgrenze: Browser-/DNS-Zugriff war in S01 blockiert; S02–S04 ausschließlich lokale Schritte, keine erneuten Infrastrukturversuche. Live-Theme seit dem 19.09. nicht neu verifiziert; maßgebliche Registry: `domains/shopify/live-theme.json`. Kein aktueller Live-Beleg für cmExact im Rollenrechner, einen ausgefallenen Kettelservice, aktuelle Form-/Unterlagenfreigaben oder die eingesetzte Mail-Vorlage. Lokale Reproduktion ersetzt keine neue Live-Freigabe. Details in SESSION_LOG.md und evidence/README.md.

Historische Evidence-Basis: `66729099c4122385e19172a1f5ba14a7524c3bfb`. Aktueller übernommener Repository-HEAD: `d63acaf`. Geprüfte Rechnerquellen sind SHA-256-identisch zum historischen Live-Snapshot; S03 ergänzt sechs Hashvergleiche für Einfassung. `origin/main` zuletzt zwei reine Dashboarddaten-Commits voraus, kein Pull/Merge. Das Audit liegt tatsächlich in `audit/` im Repository; alte Verweise auf `outputs/audit/` sind überholt.

Git-Sicherung: Audit-Dateien lokal gespeichert, noch **uncommitted**. `git add TASK.md CODEX_PROGRESS.md audit` scheiterte am schreibgeschützten `.git/index.lock` (Operation not permitted). Keine Berechtigungsumgehung. Bei später verfügbarem Git-Schreibzugriff den geprüften Audit-Stand zuerst sichern; `CONTINUE_PROMPT.md` unverändert lassen.
