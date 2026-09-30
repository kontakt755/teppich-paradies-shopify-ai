# Windows Sync Report

Stand: 12. August 2026

## 1. Live-Theme

- Theme-ID: `201829679438`
- Pull erfolgreich: **JA** (bereits vor diesem Diagnoseblock)
- Theme danach verändert: **NEIN**
- Veröffentlicht: **NEIN**
- In diesem Block erfolgten kein weiterer Pull, kein Push, kein Publish und keine Shopify-Resource-Änderung.

## 2. Git

- `git.exe` gefunden: **JA**
- Pfad: `C:\Users\Administrator\AppData\Local\gitkraken\app-12.4.0\resources\app.asar.unpacked\git\cmd\git.exe`
- Version: `git version 2.54.0.windows.1`
- Nur für die untersuchte Shell-Session zum `PATH` ergänzt; keine systemweite PATH-Änderung.
- `git status` möglich: **NEIN**
- Status kurz: Git startet korrekt, aber `C:\Users\Administrator\shopify-theme\shopify-theme` enthält kein `.git`-Verzeichnis und ist daher lokal kein Git-Repository.

## 3. QA

### Inventar

- Lokales QA-System: `qa/run-qa.mjs`, `qa/qa.config.json`, `qa/theme-check-baseline.json`
- Playwright: `playwright-core 1.54.2`
- Prüfumfang: Theme Check plus sechs Live-Seiten auf Desktop 1440 px und Mobile 390 px
- Der Windows-Stand war gegenüber dem beschriebenen Mac-Stand älter/unvollständig: Die vorhandenen ZIPs enthalten nur denselben QA-Stand und keinen SEO-Checker oder die neueren Mac-Reports.

### Analyse der fünf ursprünglichen Fehler

| Nr. | Checkname | URL/Datei | Ansicht | Exakte Fehlermeldung | Echter Live-Fehler | Veralteter/Windows-Checker | Direkter Live-Test |
|---:|---|---|---|---|---|---|---|
| 1 | Shop-Smoke / Preis pro m² | `https://www.teppich-paradies.net/products/marlow-eiche-nordisch-klickvinyl-7mm` | Desktop | `Sichtbarer „€/m²“-Preis im Produkt-Kaufbereich fehlt` | **NEIN** | **JA** – Regex akzeptierte nur `€50,95/m²`, nicht das tatsächlich verwendete deutsche Format `50,95 €/m²` | **JA** – HTTP 200, sichtbarer Preis `50,95 €/m²` |
| 2 | Shop-Smoke / Preis pro m² | dieselbe URL | Mobile 390 px | `Sichtbarer „€/m²“-Preis im Produkt-Kaufbereich fehlt` | **NEIN** | **JA** – identische Regex-Ursache | **JA** – HTTP 200, sichtbarer Preis `50,95 €/m²` |
| 3 | Theme Check / JSONMissingBlock | `templates/product.json` | Theme Check | `Theme block 'blocks/shopify://apps/options-price-calculator/blocks/product_calculator/46eaac1e-1432-4cdd-814e-d2c707255110.liquid' does not exist.` | **NEIN** | **JA** – bekannter Baseline-Fund wurde wegen verschobener Zeile 223 statt 220 als neu behandelt | **JA** – aktueller Theme Check weiterhin 9 Errors/35 Warnings; ohne volatile Position 0 neue Findings |
| 4 | Theme Check / JSONMissingBlock | `templates/product.planken.json` | Theme Check | dieselbe OPC-App-Block-Meldung | **NEIN** | **JA** – verschobene Zeile 216 statt 213 | **JA** – Baseline inhaltlich identisch |
| 5 | Theme Check / JSONMissingBlock | `templates/product.rolle.json` | Theme Check | dieselbe OPC-App-Block-Meldung | **NEIN** | **JA** – verschobene Zeile 206 statt 199 | **JA** – Baseline inhaltlich identisch |

Der vierte bestehende OPC-Baseline-Fund in `product.fixpreis.json` blieb ebenfalls inhaltlich unverändert. Die OPC-App-Blöcke wurden nicht entfernt oder verändert.

### Minimale QA-Korrektur

- `qa/run-qa.mjs`: Preisprüfung erkennt beide üblichen Anordnungen `50,95 €/m²` und `€50,95/m²`.
- `qa/run-qa.mjs`: Baseline-Vergleich ignoriert ausschließlich volatile Zeilen-/Spaltenpositionen. Severity, Checkname, Datei und Meldung müssen weiterhin exakt übereinstimmen; neue echte Findings bleiben FAIL.
- Automatisch neu erzeugt: `QA_REPORT.md`, `qa/results/latest.json`, `qa/results/latest-details.json` und QA-Screenshots/Artefakte.
- Baseline-Datei nicht verändert.

### Finales Ergebnis

- Finaler Exit-Code: **0**
- Status: **WARN**
- ERRORs/relevante Fehler: **0**
- WARNs/Hinweise: **24**
- Davon 12 bekannte `header-menu / overflowMenu`-Hinweise und 12 zusammengefasste Drittanbieter-Hinweise.
- Theme Check: Baseline 9 Errors/35 Warnings, aktuell 9 Errors/35 Warnings, **0 neue Findings**.
- Keine Console-/Asset-Regression, kein Overflow und keine sichtbaren Bildfehler erkannt.

## 4. SEO

- Warum `seo:check` fehlte: Die lokale `package.json` enthält ausschließlich das Script `qa`; ein SEO-Script und der npm-Eintrag fehlen vollständig.
- Script gefunden/wiederhergestellt: **NEIN**
- Durchsucht wurden Projekt, `qa/`, vorhandene Transfer-ZIPs, Desktop, Dokumente, Downloads, übliche Benutzerpfade und PowerShell-Historie. Weder der originale SEO-Checker noch `SEO_REPORT.md` oder eine belastbare lokale Kopie wurden gefunden.
- Eine genaue Rekonstruktion ist aus den vorhandenen Daten nicht möglich: URL-Menge, ERROR-/WARN-Regeln und die bekannte 105-WARN-Baseline fehlen. Deshalb wurde kein neuer angeblich gleichwertiger SEO-Crawler erfunden.
- Geänderte SEO-Dateien: **keine**
- Finaler Exit-Code: **1** (`npm` meldet weiterhin `Missing script: "seo:check"`)
- ERRORs: **nicht ermittelbar**
- WARNs: **nicht ermittelbar**

## 5. Offene Punkte

- Vom Mac müssen der originale SEO-Checker, dessen zugehöriger `package.json`-/`package-lock.json`-Stand und möglichst `SEO_REPORT.md` übernommen werden.
- Falls ein echter Git-Arbeitsstand erwartet wird, fehlt auf Windows außerdem die `.git`-Historie; die Theme-Dateien selbst sind davon nicht betroffen.

## 6. Nächster sicherer Schritt

Den vollständigen, zuletzt erfolgreichen SEO-Tooling-Ordner samt `package.json`, `package-lock.json` und `SEO_REPORT.md` unverändert vom Mac als Archiv auf diesen Windows-Rechner übertragen und erst danach `npm.cmd run seo:check` ausführen.
