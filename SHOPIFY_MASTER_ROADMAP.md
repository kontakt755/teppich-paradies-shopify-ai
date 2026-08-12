# Shopify Master Roadmap

Version: 1.0  
Pilot-Shop: Teppich Paradies  
Bekannter Live-Stand: Theme `201829679438`; Fallback `196301750606` ist dauerhaft geschützt.

## 1. Planungsbasis

- lokales `npm run qa` zuletzt Exit 0
- SEO zuletzt 0 ERRORs; Windows-SEO-Tooling ist noch nicht vollständig vorhanden
- Klickvinyl-, Rollenware-, Muster- und Checkout-Smokes waren erfolgreich; keine Bestellung
- Paketware grundsätzlich Shopping-ready
- Rollenware nicht Shopping-ready; 118 sichere Ausschlusskandidaten
- `opc-*` darf nicht als Google Offer erscheinen; Rollenware-Structured-Data ist bereits geschützt
- strukturierte Quellen: `custom.rollenbreite` und `custom.qm_pro_paket`
- Universal-OPC für Rollenware vorhanden
- Sisal & Natur geplant; Jordan-Pipeline separat vorhanden
- Produktfotos folgen später

Die Sortierung priorisiert Geschäftswirkung bei geringem Risiko. HIGH-Tasks sind sichtbar, aber nicht Bestandteil autonomer Startblöcke.

## 2. Ausführbare Roadmap

| ID | Titel | Ziel | Risk | Worker | Abhängigkeiten | Allowlist | Akzeptanzkriterien | Automatische Tests | Gate | Größe |
|---|---|---|---|---|---|---|---|---|---|---|
| SHP-001 | Repository-Portabilität | Privates, Windows/Mac-stabiles Git-Fundament spezifizieren und lokal vorbereiten | MEDIUM | Codex | – | `.gitattributes`, `.gitignore`, Tooling-Doku | LF-Regel aktiv; Secrets/Artefakte ignoriert; keine Theme-Inhalte verändert | `git diff --check`, Ignore-Test, JSON-Checks | NEIN | S |
| SHP-002 | Backup-/Restore-Drill | Live-Backup, Tag, Dev Theme und Restore-Probe verifizieren | MEDIUM | Codex | SHP-001 | `automation/**`, Reports | Restore auf Dev ergibt erwartete Hashes; Live/Fallback unberührt | Theme-Liste, Hashvergleich, read-only Live-Smoke | NEIN | M |
| SHP-003 | QA-Logfilter | QA-Ausgaben auf erste relevante Assertion und kleine Evidenzpakete reduzieren | LOW | Codex | SHP-001 | `qa/**`, `package.json` | Rohartefakte lokal; Worker-Auszug ≤30 relevante Zeilen | Fixture PASS/FAIL, JSON-Validierung | NEIN | S |
| SHP-004 | Manifest-/State-Runner | Minimalen domainneutralen Runner für Status, Lock und Abbruch bauen | MEDIUM | Codex | SHP-001, SHP-003 | `automation/core/**`, Tests | atomare States; keine dynamische Taskaufnahme; Resume möglich | Unit-/Fixture-Tests | NEIN | M |
| SHP-005 | Deterministischer Risk Guard | Risk Map, Allowlist, Operation Journal und Hard Stop implementieren | MEDIUM | Codex | SHP-004 | `automation/core/**`, `domains/shopify/**`, Tests | höchste Regel gewinnt; höhere Ist-Risiken stoppen | Pfad-/Operation-/Daten-Fixtures | NEIN | M |
| SHP-006 | Diff-Budget Guard | MAX_FILES/MAX_CHANGED_LINES und unbekannte Dateien prüfen | LOW | Codex | SHP-004 | `automation/core/**`, Tests | Allowlist-Verstoß immer Hard Stop; Budgettrigger korrekt | Diff-Fixtures | NEIN | S |
| SHP-007 | Secret-Scan-Gate | gitleaks oder gleichwertigen lokalen Scan integrieren | LOW | Codex | SHP-001 | Tooling-/CI-Dateien, keine Secrets | Testsecret wird erkannt; echte Secrets nie geloggt | kontrollierte Secret-Fixture | NEIN | S |
| SHP-008 | Notification Policy | ntfy/Sound nur an definierte Orchestrator-Events binden | LOW | Codex | SHP-004 | `automation/core/**`, Tests; User-Notifier nur mit separater Freigabe | PASS still; Laufende/Hard Stop/Wechsel melden | Event-Fixtures, Dry-run Adapter | NEIN | S |
| SHP-009 | 45-Minuten-Sicherheitstest | Fünf vorgeschriebene Fehler-/Erfolgsszenarien beaufsichtigt bestehen | MEDIUM | Codex + Claude Code | SHP-002–008 | Test-Fixtures, Dev Theme | alle Zeilen im Testplan PASS | kompletter Testplan | JA | M |
| SHP-010 | Windows-SEO-Tooling angleichen | Originalen Mac-SEO-Checker belegbar wiederherstellen | MEDIUM | Codex | SHP-001 | `scripts/**`, `qa/**`, `package*.json`, SEO-Reports | `npm run seo:check` Exit 0; 0 ERRORs; keine erfundene Gleichwertigkeit | SEO-Check, Report-Schema | NEIN | M |
| SHP-011 | Kategoriebild-Regressionssuite | Graue/fehlende Teppichbodenbilder deterministisch auf Mobile/Desktop prüfen | MEDIUM | Codex | SHP-003 | `qa/**`, Tests, Screenshots | sechs definierte Collections ohne leeren Placeholder | Playwright 390/1440, Bildquelle/naturalWidth | NEIN | M |
| SHP-012 | Teppichboden-Menü-Audit | Live-/Admin-Struktur read-only gegen Zielnavigation prüfen | LOW | ChatGPT Work | SHP-003 | Reports | Globo/Shopify Ownership, Links und Lücken belegt | Linkcheck, Mobile DOM-Audit | NEIN | S |
| SHP-013 | Teppichboden-Menü korrigieren | Hauptlink und „Alle Teppichböden“ minimal umsetzen | HIGH | Codex | SHP-012 | separat genehmigte Menüressourcen | Mobile Zielpfade korrekt; Desktop unverändert | Playwright, Linkcheck, QA | JA | M |
| SHP-014 | Florhöhen-/ecoVella-Evidenzaudit | Sortiment anhand strukturierter Daten fachlich klassifizieren | LOW | ChatGPT Work | – | Reports, read-only Exporte | Verteilung, Quellen, unklare Fälle; keine Bildableitung | Schema-/Vollständigkeitscheck | NEIN | M |
| SHP-015 | Live-Collection-Zuordnungen | Freigegebene Hoch-/Mittelflor- und ecoVella-Korrekturen anwenden | HIGH | Codex | SHP-014 | explizite Produkt-/Collection-IDs | nur belegte, freigegebene Zuordnungen; Preise/SKUs unverändert | Before/after Export, Collection-Smokes | JA | M |
| SHP-016 | Sisal-&-Natur-Spezifikation | Taxonomie, Eligibility und Inhalte ohne Live-Schreibzugriff finalisieren | LOW | ChatGPT Work | SHP-014 | `SISAL_NATUR_*.md/csv` | eindeutige Regeln, Restliste, keine erfundenen Merkmale | Tabellenvalidator | NEIN | S |
| SHP-017 | Sisal Dev-Theme-Prototyp | Collection-UX ausschließlich im Dev Theme vorbereiten | MEDIUM | Codex | SHP-016, SHP-002 | definierte Sections/Templates/Snippets | keine Live-Ressource; Mobile/Desktop konsistent | QA gegen Dev, Links/Bilder | NEIN | M |
| SHP-018 | Jordan-Pipeline-Validator | Eingabedaten, Quellen, Pflichtfelder und Fehlerklassen deterministisch validieren | LOW | Codex | SHP-001 | Jordan-Tooling/Fixtures/Reports | keine erfundenen Daten; unklare Fälle separat | Fixture-Suite, JSON/CSV-Schema | NEIN | M |
| SHP-019 | Jordan Draft Dry Run | Unveröffentlichte Draft-Produkte reversibel in Sandbox/Fixture vorbereiten | MEDIUM | Codex | SHP-018, SHP-005 | Pipeline, Draft-Fixtures; keine Liveprodukte | nur DRAFT/unpublished; keine endgültige Preisfreigabe | Dry-run Diff, read-back, rollback | JA | M |
| SHP-020 | Bildinventar & Lizenzstatus | Vorhandene Hersteller-/Produktfotos katalogisieren und Lücken markieren | LOW | ChatGPT Work | – | Reports/CSV, read-only Assets | Quelle, Produktbezug, Lizenzstatus, Format; keine Generierung | Dateihash-/Dublettencheck | NEIN | M |
| SHP-021 | Accessibility-Baseline | WCAG-nahe mechanische Fehler priorisieren | LOW | Codex | SHP-003 | `qa/**`, Reports | reproduzierbare Liste mit Severity und Selector | axe-ähnliche Regeln, Keyboard-Smoke | NEIN | S |
| SHP-022 | Kleine Accessibility-Fixes | belegte isolierte LOW-Fixes im Dev Theme umsetzen | MEDIUM | Codex | SHP-021, SHP-002 | explizit benannte Locale/Snippet/CSS-Dateien | keine UX-/Kauflogikänderung; Mobile/Desktop PASS | scoped Playwright, QA | NEIN | M |
| SHP-023 | Google-Kanalausschluss Rollenware | 118 Produkte nur aus Google & YouTube entfernen | HIGH | Ahmet + beaufsichtigter Worker | bestehende Exclusion List | Shopify Sales-Channel-Verfügbarkeit | Online Store aktiv; Google & YouTube aus; 118 bestätigt | read-back Audit, Merchant Sync Check | JA | M |
| SHP-024 | Merchant-Zielarchitektur Rollenware | kaufbare Standardmaße/separaten Feed wirtschaftlich und technisch bewerten | MEDIUM | ChatGPT Work | SHP-023 | Reports, read-only Daten | Empfehlung mit Preisgenauigkeit, Aufwand, Risiken und Pilotset | Daten-/Schema-Simulation | JA | M |
| SHP-025 | OPC-/Softiq-Datenbereinigung | bestehende technische Varianten/Template-Sonderfälle korrigieren | HIGH | Codex | separate Datenfreigabe | explizite Produkt-/OPC-Ressourcen | keine fremden Varianten; Kaufpreis korrekt; Rollenkaufweg PASS | Cart/Checkout ohne Bestellung, Schema, QA | JA | L |
| SHP-026 | Human-gated Live Release | geprüften Dev-Stand nach Review veröffentlichen | HIGH | Ahmet + Codex | abgeschlossener Roadmap Block | genehmigte Theme-Dateiliste; Live-ID | Backup/Tag, QA 0, Review, öffentliche Smokes; Fallback unberührt | QA, diff, Live Playwright | JA | S |
| SHP-027 | Performance-Budget | Core Web Vitals-nahe Lab-Baseline und Budgets für Theme-Tasks etablieren | MEDIUM | Codex | SHP-003 | `qa/**`, Reports, keine Theme-Edits | Mobile/Desktop-Metriken reproduzierbar; Budgets versioniert | Lighthouse-/Playwright-Labcheck | NEIN | M |

## 3. Zählung

- Gesamt: **27**
- LOW: **10**
- MEDIUM: **12**
- HIGH: **5**
- autonom grundsätzlich zulässig (LOW/MEDIUM): **22**
- `NEEDS_AHMET`/Human Gate HIGH: **5**

Auch MEDIUM mit `Gate JA` darf analysiert oder im Dev/Dry-run vorbereitet werden, aber der definierte menschliche Entscheidungspunkt darf nicht automatisch überschritten werden.

## 4. Empfohlener erster autonomer Startblock

Erst nach SHP-009 als beaufsichtigtem Gate:

```text
SHP-003 QA-Logfilter
SHP-006 Diff-Budget Guard
SHP-007 Secret-Scan-Gate
SHP-010 Windows-SEO-Tooling angleichen
SHP-011 Kategoriebild-Regressionssuite
SHP-012 Teppichboden-Menü-Audit
SHP-014 Florhöhen-/ecoVella-Evidenzaudit
SHP-016 Sisal-&-Natur-Spezifikation
SHP-018 Jordan-Pipeline-Validator
SHP-020 Bildinventar & Lizenzstatus
SHP-021 Accessibility-Baseline
```

Dieser Block enthält keine Veröffentlichung und keine Shopify-Admin-Schreiboperation. Vor seiner Ausführung müssen die Core-Abhängigkeiten erfüllt sein; die Liste ist kein sofort ausführbares Manifest.

## 5. Human-Gate-Backlog

Folgende Tasks werden automatisch nur nach `needs-ahmet.md` geschrieben:

- SHP-013 Menüänderung
- SHP-015 bestehende Live-Collection-/Produktzuordnungen
- SHP-023 Google-&-YouTube-Verfügbarkeit
- SHP-025 OPC-/Live-Produktbereinigung
- SHP-026 Live Release

## 6. Roadmap-Block-Abnahme

Ein Startblock ist `ROADMAP BLOCK COMPLETE`, wenn alle enthaltenen LOW/MEDIUM-Tasks `PASS`, `PARKED`, `SKIPPED_DEPENDENCY` oder `NEEDS_AHMET` sind und kein `PENDING`/`RUNNING` verbleibt. Nicht manifestierte Roadmap-Tasks bleiben Backlog und verhindern den Blockabschluss nicht.
