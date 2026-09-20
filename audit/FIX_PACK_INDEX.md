# Fix-Pack-Index

Stand: 20.09.2026. Phase 1 läuft; nur ausreichend belegte Teilpakete werden vorbereitet. **READY ist Übergabereife, keine Umsetzungs-, Merge- oder Live-Freigabe.** Kein Paket umgesetzt.

| FIX_PACK | STATUS | PRIORITÄT | ISSUES | PARALLEL SAFE | ABHÄNGIGKEITEN | ZUSTÄNDIGER AGENT |
| --- | --- | --- | --- | --- | --- | --- |
| [FIX_PACK_02_PRICING_INPUTS](fix-packs/FIX_PACK_02_PRICING_INPUTS.md) | READY | P2/P3 | TP-001, TP-002 | NO | ein gemeinsamer Paketparser/Submit; aktuelle Live-Quelle vor Fix verifizieren | Später Claude Code, noch nicht beauftragt |
| Rollenrechnerpaket, Dateiname noch offen | NOT READY | P2/P3 | TP-003, TP-004 | NO | PR-020/022 lokal abgeschlossen; H-005/H-008, echte Cart-/Variantenabläufe und gemeinsame Kern-Datei beachten | Nicht zugewiesen |
| Einfass-Servicepaket, Dateiname noch offen | NOT READY | P3 | TP-005 | NO | PR-021 lokal abgeschlossen; H-006, Datenvertrag und verbleibende Cart-/Abgleichprüfung | Nicht zugewiesen |

Ready: 1 · Done: 0 · QA Passed: 0 · QA Failed: 0.

Das erste Paket enthält bewusst nur zwei eng zusammenhängende Issues: beide betreffen dieselben Zahlenparser-/Submit-Grenzen und sollten gemeinsam gelöst werden. Keine unabhängigen UX-/Cart-/Architekturaufgaben angehängt, um eine Mindestzahl zu erreichen. Kein P0-Blockerpaket ohne bestätigten Blocker.

Dateikonflikte und Reihenfolge stehen in DEPENDENCY_MAP.md. Während des Watchdog-Laufs ist keinerlei parallele Ausführung zulässig. `fix-results/` enthält noch kein Umsetzungsergebnis.

S02: TP-004 besitzt einen vollständigen Implementation Brief. Noch kein weiteres Fix-Pack erzeugt: der Codefehler ist lokal belegt, seine aktuelle Live-Reichweite und die restlichen eng verbundenen Rechnerpfade sind noch offen. Kein bestehendes Paket erneut implementiert/getestet; READY weiterhin nur Übergabereife.

S03: TP-005 besitzt einen vollständigen Implementation Brief. Kein neues Pack vorschnell erstellt: Pflichtservicevertrag/Live-Reichweite und Cart-Schnittstellen sind offen. TP-005 betrifft andere Dateien als TP-003/004 und bleibt als eigener möglicher Arbeitsblock vorgemerkt. H-007 ist kein bestätigtes Issue und kein Fix-Auftrag. Ready/Done/QA unverändert.

S04: PR-022 lokal bestanden, kein zusätzliches Issue oder Fix-Pack. 61 Integrationsfälle und die Unterlagen-Auswahlprüfung stehen später als gezielte Regression für den gemeinsamen Rollenrechner bereit. H-008 ist eine offene Daten-/Fachfrage, keine Anweisung, Preis-, Mengen- oder Verlegeregeln zu ändern. Ready/Done/QA unverändert.
