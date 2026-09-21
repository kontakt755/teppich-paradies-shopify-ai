# Fix-Pack-Index

Stand: 21.09.2026. Phase 1 läuft; nur ausreichend belegte Teilpakete werden vorbereitet. **READY ist Übergabereife, keine Umsetzungs-, Merge- oder Live-Freigabe.** Kein Paket umgesetzt.

| FIX_PACK | STATUS | PRIORITÄT | ISSUES | PARALLEL SAFE | ABHÄNGIGKEITEN | ZUSTÄNDIGER AGENT |
| --- | --- | --- | --- | --- | --- | --- |
| [FIX_PACK_02_PRICING_INPUTS](fix-packs/FIX_PACK_02_PRICING_INPUTS.md) | READY | P2/P3 | TP-001, TP-002 | NO | ein gemeinsamer Paketparser/Submit; aktuelle Live-Quelle vor Fix verifizieren | Später Claude Code, noch nicht beauftragt |
| Rollenrechnerpaket, Dateiname noch offen | NOT READY | P2/P3 | TP-003, TP-004, TP-009 | NO | PR-020/022/023b.2 lokal abgeschlossen; H-011 PVC-Breitenvertrag; H-005/H-008, echte Cart-/Variantenabläufe und gemeinsame Kern-Datei beachten | Nicht zugewiesen |
| Wunschmaßpaket, Dateiname noch offen | NOT READY | P3 | TP-006, TP-007 | NO | H-009 aktive Nutzung/Maßvertrag, H-010/Browserintegration; gemeinsame Blockdatei | Nicht zugewiesen |
| Paket-Cartdarstellung, Dateiname noch offen | NOT READY | P3 | TP-008 | NO | H-011 aktuelle dreistellige Paketgrößen, CART-002 und gemeinsame Cartdatei | Nicht zugewiesen |
| Cart-Fehlerwiederherstellung, Dateiname noch offen | NOT READY | P2 | TP-010, TP-011 | NO | CART-002b.2, H-012, gemeinsame Cartklasse/Refs/Animation | Nicht zugewiesen |
| Einfass-Servicepaket, Dateiname noch offen | NOT READY | P3 | TP-005 | NO | PR-021 lokal abgeschlossen; H-006, Datenvertrag und verbleibende Cart-/Abgleichprüfung | Nicht zugewiesen |

Ready: 1 · Done: 0 · QA Passed: 0 · QA Failed: 0.

Das erste Paket enthält bewusst nur zwei eng zusammenhängende Issues: beide betreffen dieselben Zahlenparser-/Submit-Grenzen und sollten gemeinsam gelöst werden. Keine unabhängigen UX-/Cart-/Architekturaufgaben angehängt, um eine Mindestzahl zu erreichen. Kein P0-Blockerpaket ohne bestätigten Blocker.

Dateikonflikte und Reihenfolge stehen in DEPENDENCY_MAP.md. Während des Watchdog-Laufs ist keinerlei parallele Ausführung zulässig. `fix-results/` enthält noch kein Umsetzungsergebnis.

S02: TP-004 besitzt einen vollständigen Implementation Brief. Noch kein weiteres Fix-Pack erzeugt: der Codefehler ist lokal belegt, seine aktuelle Live-Reichweite und die restlichen eng verbundenen Rechnerpfade sind noch offen. Kein bestehendes Paket erneut implementiert/getestet; READY weiterhin nur Übergabereife.

S03: TP-005 besitzt einen vollständigen Implementation Brief. Kein neues Pack vorschnell erstellt: Pflichtservicevertrag/Live-Reichweite und Cart-Schnittstellen sind offen. TP-005 betrifft andere Dateien als TP-003/004 und bleibt als eigener möglicher Arbeitsblock vorgemerkt. H-007 ist kein bestätigtes Issue und kein Fix-Auftrag. Ready/Done/QA unverändert.

S04: PR-022 lokal bestanden, kein zusätzliches Issue oder Fix-Pack. 61 Integrationsfälle und die Unterlagen-Auswahlprüfung stehen später als gezielte Regression für den gemeinsamen Rollenrechner bereit. H-008 ist eine offene Daten-/Fachfrage, keine Anweisung, Preis-, Mengen- oder Verlegeregeln zu ändern. Ready/Done/QA unverändert.

S05: TP-006/007 besitzen vollständige Implementation Briefs. Kein sofortiges Pack für den historisch ruhenden Pfad: heutige Produktnutzung und Maßvertrag H-009 zuerst belegen, dann gemeinsam planen. 46 Diagnosefälle bieten gezielte Preis-/Payloadregression; bestehende Defektassertions sind vor Fix-QA auf Sollverhalten umzustellen. Kein bestehendes Pack ausgeführt, Ready/Done/QA unverändert.

S06: TP-008 mit vollständigem Brief, noch kein zusätzliches Fix-Pack. Der einzelne Präzisionsverlust gehört nach der anstehenden Cart-Prüfung in einen kleinen passenden Darstellungsblock; nicht künstlich mit Parser-/Preisreparaturen vermischen. 17 Datenintegrationen/28 Cart-Renderings ergänzen die Übergabeevidence. Keine Freigabe/Umsetzung, Ready/Done/QA unverändert.

S07: TP-009/P2 mit vollständigem Implementation Brief. Bestehenden vorgemerkten Rollenblock um Breitenvertrag/Art-Asset ergänzen; weiterhin NOT READY wegen aktueller Daten-/Cart-/Variantenabhängigkeiten. Keine Packdatei angelegt oder umgesetzt. Stück-/Zubehörvertrag lokal ohne weiteren bestätigten Fehler; vorbereitete Metafelder bleiben unangetastet. Ready/Done/QA unverändert.

S08: TP-010 mit vollständigem Implementation Brief. Eigenen möglichen Fehlerwiederherstellungsblock vorgemerkt, NOT READY bis CART-002b/H-012; keine Packdatei vorschnell erstellt. Kein bestehendes Pack ausgeführt, keine Freigabe/Shopreparatur. 43 lokale Cartfälle und 47 bestehende Tests als spätere gezielte Regression dokumentiert. Ready=1, Done/QA=0.

S09: TP-011 mit vollständigem Implementation Brief. Mit TP-010 an derselben Cartklasse koordinieren; vorgemerkter Cartblock weiterhin NOT READY bis CART-002b.2/H-012. Zwölf Ereignisdiagnosen ergänzen die Evidence, keine Packumsetzung/Shopänderung. Ready=1, Done/QA=0.


S10: TP-012/P2 mit vollständigem Implementation Brief. SectionRenderer-Retry als separater Kandidat NOT READY bis CART-002b.2b/H-012 und Prüfung weiterer Aufrufer. Keine Packdatei/Umsetzung. Ready=1, Done/QA=0.

S11: H-013 konkretisiert Antwort-/Identitätsrisiken ohne neues bestätigtes Issue. Cartblock und Section-Retry weiterhin NOT READY; TP-010/011/012 anhand realer Ablaufgrenzen koordinieren. Ready=1, Done/QA=0. Keine Packumsetzung.

S12: keine neuen bestätigten Issues/Packdateien. H-014 ist Browsernachweisbedarf, keine Freigabe zum globalen Event-/Dialogumbau. Cartblock/Section-Retry weiterhin NOT READY; Ready=1, Done/QA=0.

S13: keine neue bestätigte Issue-ID oder Packfreigabe. H-015 ist offener Express-/Keyboardnachweis; Browserberechtigung blockiert Liveabnahme. Ready=1, Done/QA=0.

S14: TP-013/P3 mit vollständigem Brief. Rabattfeedback-Kandidat NOT READY bis CART-003b.2; gemeinsame cart-discount.js zuerst vollständig prüfen. Keine Packdatei/Umsetzung. Ready=1, Done/QA=0.
