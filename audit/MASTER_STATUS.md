# Teppich-Paradies – Auditstatus

AUDIT FORTSCHRITT: 22 %

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

- [x] PR-023a lokal abgeschlossen: 46 Fälle am vollständigen Wunschmaß-Liquid/JS, 31 abgefangene Requests. Echte Formflächen/Mindestpreis/Zuschlag korrekt; TP-006/007 bedingt lokal bestätigt. Historisch keine aktiven Produkte auf diesem Template, heute H-009 offen.

- [x] PR-023b.1 lokal abgeschlossen: Klebevinyl-/Teppichfliesen-Paketvertrag über Original-Liquid, Preisansichten und JS bis Payload/Cartzeile; 17 Fälle, 14 Requests, 28 Cart-Renderings. TP-008/P3: dritte Flächennachkommastelle wird nur im Cart verkürzt.

In Arbeit:
- [~] Preisberechnung: nächster Teil sind PVC- und Stück-/Fixpreis-Payloads (PR-023b.2); nur dieser Bereich wird als Nächstes bearbeitet.

Noch offen:
- [ ] Restliche Preisfälle: PVC-/Stück-/Fixpreisverträge (PR-023b.2); offene Live-Reichweite/-Produktfreigaben H-005–011 klären.
- [ ] Warenkorb bearbeiten, Gruppen, Kombinationen, Checkout vertiefen.
- [ ] Vollständige Rechner-/Grenzfall-, Varianten- und Runtime-Prüfung.
- [ ] Mobile, Suche/Navigation, Performance, SEO, UX, Cross-Feature-Tests und finaler Regressionstest.
- [ ] Architekturkarte vervollständigen; Phase 2 abschließen; spätere freigegebene Fixes und QA.
- [ ] FINAL_REPORT.md und belegte Abschlussbewertungen.

Anzahl bestätigter Issues: P0: 0 · P1: 0 · P2: 2 · P3: 6 · P4: 0. Davon TP-004–007 ausschließlich lokal bestätigte bedingte Codefehler; TP-006/007 historisch ruhender Pfad, aktuelle Live-Betroffenheit nicht belegt. TP-008 lokal bestätigter Cart-Anzeigeverlust, keine falsche Menge/Geldabrechnung.

Aktuell untersuchter Bereich: Preisberechnung, Phase 1.
Letzte abgeschlossene Aufgabe: PR-023b.1. 17 neue Paket-Datenintegrationen, 14 Requests abgefangen, 28 Cart-Renderings. Quadra-Paketvorrang, zwei-/dreistellige Paketflächen, Stückdaten, €/m² und Cent-Summen; elf Quellenhashes historisch gleich. TP-008: Rechner 30,272 m², Cart 30,27 m²; Menge und Preis korrekt. PVC/Fixpreis nur kartiert, deren Payloads noch nicht abgeschlossen. Keine produktiven Änderungen.
Nächste Aufgabe: **PR-023b.2**: PVC Terracora Eiche Braun (`marano-eiche-braun-vinylboden-von-der-rolle`, dokumentierte 2-/4-m-Breiten) sowie Fixpreis-/Sockelleisten-/Stückreferenz. Zuerst verlässliche vorhandene Einheit-/Preisdaten lesen; fehlende aktuelle Werte synthetisch kennzeichnen. Original-Rollen-Datenvertrag und Standardformular-/Mengenhilfeübergang bis abgefangenen Payload prüfen. Einstieg: `qa/MERCHANT_READINESS_REPORT.md`, `domains/shopify/rechner-zuordnung.md`, `domains/shopify/leisten-stangenlaenge/stangenlaenge.json`, Rollenblock, `tp-zubehoer-menge` und `assets/product-form.js`. Danach CART-002. Abgeschlossene S01–S06-Paket-/Mathematiktests ohne Quellenänderung nicht wiederholen. Live-Hypothesen H-005/006/008/009/011 getrennt nachholen, wenn verfügbar.
Wichtige offene Hypothesen: siehe ISSUES.md H-001, H-003–H-011. H-002 (unterschiedliche Rundungsregeln) lokal geschlossen. H-007 betrifft Oval-Näherung; H-008 heutige Haftunterlagendaten und zulässige Alternativverlegung. Keine dieser offenen Fach-/Datenfragen als zusätzlicher Fehler gezählt.
Fix-Packs Ready: 1 · Done: 0 · QA Passed: 0 · QA Failed: 0

Live-Testgrenze: Browser-/DNS-Zugriff war in S01 blockiert; S02–S06 ausschließlich lokale Schritte, keine erneuten Infrastrukturversuche. Live-Theme seit dem 19.09. nicht neu verifiziert; maßgebliche Registry: `domains/shopify/live-theme.json`. Kein aktueller Live-Beleg für cmExact im Rollenrechner, einen ausgefallenen Kettelservice, aktuelle Form-/Unterlagenfreigaben oder die eingesetzte Mail-Vorlage. Lokale Reproduktion ersetzt keine neue Live-Freigabe. Details in SESSION_LOG.md und evidence/README.md.

Historische Evidence-Basis: `66729099c4122385e19172a1f5ba14a7524c3bfb`. Aktueller übernommener Repository-HEAD: `9682ab7` (S01–S06-Audit zwischenzeitlich gesichert). Geprüfte Rechnerquellen sind SHA-256-identisch zum historischen Live-Snapshot; S03 ergänzt sechs Hashvergleiche für Einfassung, S05 Block und Template des separaten Wunschmaßpfads. S06 ergänzt elf Paket-/Preissnippet-/Templatevergleiche. Remote nicht erneut gelesen, kein Pull/Merge; ältere Remoteangaben im Sessionlog sind historisch. Das Audit liegt tatsächlich in `audit/` im Repository; alte Verweise auf `outputs/audit/` sind überholt.

Git-Sicherung: S01–S06 liegen inzwischen im übernommenen Commit `9682ab7`. Das neue Berechtigungsprofil vom 21.09. enthält `.git` als schreibbar; der frühere Indexfehler bleibt nur historische Sessioninformation. Abschlussprotokolle S06 werden jetzt nachgetragen und normal committed. `CONTINUE_PROMPT.md` wurde extern ergänzt und bleibt außerhalb des Audit-Commits.
