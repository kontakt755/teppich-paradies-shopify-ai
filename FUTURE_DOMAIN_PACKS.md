# Future Domain Packs

Der Core bleibt unverändert. Jede Domain liefert eigene Risiko-, Operations-, Gate-, Prüf- und Routingdateien nach demselben Domain-Pack-Vertrag.

## 1. Shopify (Pilot)

Module: Theme, Produkte, Merchant, SEO, Jordan, QA.

- Risiken: Live-Preise, Bestand, Cart/Checkout, OPC, Offers, Publishing und Sales Channels HIGH
- erlaubte autonome Arbeiten: Reports, Tests, begrenzte Theme-Arbeit auf Dev, unveröffentlichte Draft-Vorbereitung
- Human Gates: Live Push/Publish, bestehende Produktdaten, Merchant-Ausschluss, Apps
- Checks: npm QA, Theme Check, Playwright, curl, JSON-LD, Link-/Bildchecks, Git/Diff/Secrets
- Worker: Codex primär technisch; Claude Code Fallback/Reviewer; ChatGPT Work für Audits/Context Packs

## 2. Lexware

Module: Angebote, Artikel, Kunden-/Belegdaten, Regeln, Prüfungen.

- Standardrisiko zunächst read-only MEDIUM; Buchungs-, Steuer-, Kunden- und Belegschreibvorgänge HIGH
- autonome Arbeiten: Exportanalyse, Plausibilitätsreports, Draft-Angebote ohne Versand
- Human Gates: Buchung, Versand, Storno, Kundenänderung, Artikelpreise
- Checks: Schema-/Summenprüfung, Steuersatzregeln, Dubletten, Belegnummern, Export-Hash
- Worker: ChatGPT Work für Datenaufbereitung; Codex/Claude für Integrationscode

## 3. SumUp

Module: Katalog, Produktvorbereitung, Preislisten, Transaktionsauswertung.

- Risiken: Transaktionen, Live-Katalogpreise, Refunds HIGH
- autonome Arbeiten: read-only Katalogabgleich und Import-Drafts
- Human Gates: Preis-/Katalogpublikation, Erstattung, Zahlungsaktion
- Checks: SKU/EAN-Dubletten, Preislisten-Diff, Summen-/Währungsprüfung

## 4. Suppliers

Module: Jordan, Schär, neue Lieferanten, Produkt-, Bild- und Preisdaten.

- Risiken: Recherche LOW; strukturierte Importvorbereitung MEDIUM; Lieferantenbestellung und Live-Preise HIGH
- autonome Arbeiten: Quelleninventar, Datenmapping, Draft-Produktpakete, Evidenzberichte
- Human Gates: Bestellung, Vertrags-/Preisannahme, Live-Veröffentlichung
- Checks: Quellenherkunft, Feldvollständigkeit, Maße/Einheiten, SKU/EAN, Bildlizenz, Preisplausibilität

## 5. Marketing

Module: Google Ads, Merchant, Social, Landingpages, Auswertungen.

- Risiken: Analyse LOW; Draft-Creatives MEDIUM; Budgets, Kampagnen, Feedregeln und Publishing HIGH
- autonome Arbeiten: Performanceberichte, Keyword-/Landingpage-Drafts, Merchant-Diagnose
- Human Gates: Kampagnenstart, Budget, Conversion-/Trackingänderung, Feedveröffentlichung
- Checks: URL-/UTM-Validator, Policy-Check, Preis-/Landingpage-Konsistenz, Budgetdiff

## 6. Backoffice

Module: Dokumente, E-Mail, Kalender, Mitarbeiterunterlagen, Aufgaben.

- Risiken: allgemeine Vorlagen LOW; Entwürfe MEDIUM; Versand, Personal- und Kundendaten HIGH
- autonome Arbeiten: interne Dokumententwürfe, Task-Extraktion, anonymisierte Reports
- Human Gates: externe E-Mail, Terminabsage/-buchung je Policy, Personalakte, rechtsverbindliche Dokumente
- Checks: Empfänger-/Anhangsprüfung, Datums-/Zeitzonenprüfung, PII-Scanner, Dokumentversion

## 7. Google Merchant als Shared Capability

Merchant gehört fachlich zu Marketing, kann aber Shopify-Produktdaten konsumieren. Ownership bleibt eindeutig:

- Shopify Domain: Quelle, Landingpage, kaufbarer Preis und Schema
- Marketing Domain: Feedstatus, Merchant-Diagnose und Kampagnen
- Cross-Domain-Task benötigt beide Risk Maps; höchste Risikoklasse gewinnt

## 8. Domain-Onboarding-Checkliste

Eine neue Domain wird erst aktiviert, wenn:

1. Daten- und Operationsinventar vollständig ist.
2. Risk Map und Denylist deterministisch validiert sind.
3. Human Gates benannt sind.
4. Read-only und Write-Credentials getrennt sind.
5. deterministische Checks existieren.
6. Restore beziehungsweise Kompensation getestet ist.
7. Worker-Routing und Kontextquellen definiert sind.
8. beaufsichtigter Fehlertest bestanden ist.

## 9. Empfohlene Ausbaufolge

1. Shopify Core-Pilot
2. Suppliers/Jordan als reversible Draft-Pipeline
3. Merchant read-only Monitoring
4. Backoffice Dokumente/Tasks
5. Lexware read-only
6. SumUp read-only
7. Marketing-Drafts

Schreibrechte werden je Domain separat und erst nach erfolgreichen read-only Läufen freigeschaltet.
