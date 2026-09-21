# Teppich-Paradies – Auditstatus

AUDIT FORTSCHRITT: 28 %

Stand: 21.09.2026. Phase 1 – ausschließlich Analyse. Sequenziell; keine Subagenten. Keine Shopdateien oder Produktdaten geändert. Prozentwert ist eine grobe Abdeckungsschätzung, kein Anteil bestandener Tests.

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

- [x] PR-023b.2 lokal abgeschlossen: 10 PVC- und 20 Stück-/Zubehörfälle, 26 Requests abgefangen, sieben bestehende Mengenhilfe-Tests bestanden. TP-009/P2: bei mehreren Meteroptionen bleibt die berechnete Breite auf der ersten Variante; aktuelle Produktreichweite H-011.

- [x] CART-002a lokal abgeschlossen: 43 Fälle, 35 Zeilenrenderings, 28 Mengenklammern, 34 Requests; 47 bestehende Tests bestanden. TP-010/P2: fehlgeschlagene Löschung stellt optimistisch entfernte Zeilen nicht wieder her.

- [x] CART-002b.1 lokal abgeschlossen: zwölf Originalereignis-/Debouncefälle, elf Requests, fünf Quellhashvergleiche. TP-011/P2: verschiedene Mengenänderungen verdrängen sich im gemeinsamen Timer.

In Arbeit:
- [~] Warenkorb: nächster Teil CART-002b.2 (Antwortreihenfolge, Zeilenidentität, Sections/Drawer). Nur dieser Bereich wird als Nächstes bearbeitet.

Noch offen:
- [ ] Preisbereich lokal bis PR-023b.2 abgeschlossen; offene Live-Reichweite/-Produktfreigaben H-005–011 und echte Browserabläufe klären.
- [ ] Warenkorb bearbeiten, Gruppen, Kombinationen, Checkout vertiefen.
- [ ] Vollständige Rechner-/Grenzfall-, Varianten- und Runtime-Prüfung.
- [ ] Mobile, Suche/Navigation, Performance, SEO, UX, Cross-Feature-Tests und finaler Regressionstest.
- [ ] Architekturkarte vervollständigen; Phase 2 abschließen; spätere freigegebene Fixes und QA.
- [ ] FINAL_REPORT.md und belegte Abschlussbewertungen.

Anzahl bestätigter Issues: P0: 0 · P1: 0 · P2: 6 · P3: 6 · P4: 0. Davon TP-004–007 ausschließlich lokal bestätigte bedingte Codefehler; TP-006/007 historisch ruhender Pfad, aktuelle Live-Betroffenheit nicht belegt. TP-008 lokal bestätigter Cart-Anzeigeverlust, keine falsche Menge/Geldabrechnung. TP-009 lokal bedingter Rollenbreiten-/Mengenfehler, heutige PVC-Konfiguration offen. TP-010 lokal bestätigte fehlende Wiederherstellung nach abgelehnter Cartlöschung, Browser-/Live-Reichweite H-012. TP-011 lokal verlorene Mengenereignisse, reale Browserreichweite ebenfalls H-012.

Aktuell untersuchter Bereich: Warenkorb, Phase 1.
Letzte abgeschlossene Aufgabe: CART-002b.2a. S10 / CART-002b.2a lokal abgeschlossen: fünf Original-SectionRenderer-Fälle, zwei Defektfälle TP-012/P2, ein historischer Hashvergleich. Nach Fetch-/Bodyfehler starten drei Retries derselben URL keinen neuen Request. Andere Section funktioniert. Erfolgs-Deduplizierung, Cache/Forced Refresh und Schutz gegen alte Antworten bei beiden Antwortreihenfolgen bestanden. DOM/Parser/Morph adaptiert; kein Browser-/Livebeleg, keine Shopreparatur. Nächster Schritt CART-002b.2b: direkte Cartantworten, Zeilenidentität und Zusammenspiel mit SectionRenderer, danach Drawer/Dialog-Lifecycle. Keine bisherigen Diagnosen ohne Quelländerung wiederholen.
Nächste Aufgabe: **CART-002b.2b** direkte Cartantworten/Zeilenidentität, anschließend Drawer/Dialog.
Wichtige offene Hypothesen: siehe ISSUES.md H-001, H-003–H-012. H-002 (unterschiedliche Rundungsregeln) lokal geschlossen. H-007 betrifft Oval-Näherung; H-008 heutige Haftunterlagendaten und zulässige Alternativverlegung. Keine dieser offenen Fach-/Datenfragen als zusätzlicher Fehler gezählt.
Fix-Packs Ready: 1 · Done: 0 · QA Passed: 0 · QA Failed: 0

Live-Testgrenze: Browser-/DNS-Zugriff war in S01 blockiert; S02–S09 ausschließlich lokale Schritte, keine erneuten Infrastrukturversuche. Live-Theme seit dem 19.09. nicht neu verifiziert; maßgebliche Registry: `domains/shopify/live-theme.json`. Kein aktueller Live-Beleg für cmExact im Rollenrechner, einen ausgefallenen Kettelservice, aktuelle Form-/Unterlagenfreigaben oder die eingesetzte Mail-Vorlage. Lokale Reproduktion ersetzt keine neue Live-Freigabe. Details in SESSION_LOG.md und evidence/README.md.

Historische Evidence-Basis: `66729099c4122385e19172a1f5ba14a7524c3bfb`. HEAD vor S09: `1bf1d1a` (S08-Fachcommit `67ee9bc`, Übergabedokumentation `1bf1d1a`). Geprüfte Rechnerquellen sind SHA-256-identisch zum historischen Live-Snapshot; S03 ergänzt sechs Hashvergleiche für Einfassung, S05 Block und Template des separaten Wunschmaßpfads. S06 ergänzt elf Paket-/Preissnippet-/Templatevergleiche; S07 neun Rollen-/Mengenhilfe-/Formularquellen; S08 zehn Cart-/Gruppen-/Selektor-/Abgleichquellen; S09 fünf Event-/Debounce-/Selektor-/Cartquellen. Remote nicht erneut gelesen, kein Pull/Merge; ältere Remoteangaben im Sessionlog sind historisch. Das Audit liegt tatsächlich in `audit/` im Repository; alte Verweise auf `outputs/audit/` sind überholt.

Git-Sicherung: `.git` am 21.09. regulär beschreibbar; `git add`/`git commit` für S06 mit `6b92861` erfolgreich. Frühere Sperrnotizen sind historische Sessioninformation. S07 nach bestandener Abschlussprüfung tatsächlich in `4b8e49d` committed (15 Audit-/Progressdateien). S08 nach bestandener Integrität/Secret-Scan tatsächlich in `67ee9bc` gesichert, aktueller Branch `audit/shop-audit`. `CONTINUE_PROMPT.md` und zeitweise `docs/ai-dashboard/issues.json` sind externe Änderungen und bleiben außerhalb des Audit-Commits. Kein Pull/Merge/Push.

S09 nach bestandener Integritäts-/Secretprüfung tatsächlich in `53ad666` committed (14 Audit-/Progressdateien). Externe CONTINUE_PROMPT.md und Dashboardänderung weiterhin nicht Teil des Audit-Commits.

S10: insgesamt zwölf bestätigte Issues, P0=0/P1=0/P2=6/P3=6/P4=0. Auditabdeckung weiterhin grob 28 %, Phase 1.
