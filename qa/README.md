# QA

Die Checks lesen den öffentlichen Shop ohne Preview-Parameter. Sie verändern keine Shopify-Produktdaten; der Sales-Check legt nur einen isolierten Browser-Warenkorb an und schließt niemals einen Kauf ab.

## Befehle

- `npm run qa`: Theme Check plus Desktop-/Mobile-Smoke-Test. `--screenshots` erzeugt alle Screenshots, `--update-baseline` aktualisiert die Theme-Check-Baseline bewusst.
- `npm run qa:evidence:test`: Sanitizer-, Evidence-, X-Frame- und Browser-Infrastruktur-Regressionstests.
- `npm run secret:scan`: prüft commitfähige Dateien einschließlich sensitiver Auth-/Token-Queries in URLs.
- `npm run seo:check`: technischer SEO-, Merchant- und Tracking-Check.
- `npm run sales:check`: Sales-Readiness für Desktop/Mobile und Paketware/Rollenware/Muster.
- `npm run compare:check`: Vergleichsfunktion auf Desktop und Mobile.

Sales lässt sich eng auswählen: `npm run sales:check -- --desktop --package`, entsprechend auch `--mobile`, `--roll` oder `--sample`. Ohne Filter laufen beide Geräte und alle drei Flows. Jeder Flow hat ein Gesamtlimit von 120 Sekunden und wird sofort nach Abschluss persistiert.

## Browser-Auswahl

Alle Browser-Checks verwenden dieselbe Reihenfolge:

1. expliziter Pfad über `TP_BROWSER_EXECUTABLE` (oder vorhandene Script-Config),
2. Playwright-Bundled-Chromium, wenn lokal installiert,
3. geeigneter Chrome-/Chromium-/Edge-Systembrowser als plattformabhängiger Fallback.

Es wird keine Browserinstallation automatisch gestartet.

## Berichte

- Gesamt-QA: `QA_REPORT.md`, maschinell `qa/results/latest.json` und `qa/results/latest-details.json`
- kompakte Fehler-Evidenz: `qa/evidence/latest-failure.json`
- SEO: `SEO_REPORT.md`, `qa/results/seo-latest.json`, `qa/MERCHANT_READINESS_REPORT.md`, `qa/TRACKING_READINESS.md`
- Sales: `qa/results/sales-readiness.json`
- Compare: `qa/results/compare-readiness.json`

`qa/results/`, Browserprofile und Screenshots bleiben gitignored. Sensible Queryparameter werden vor Report-, Evidence- und Fehlerausgabe zentral entfernt. Nur der exakt bekannte Login-with-Shop-X-Frame-Fall wird als Plattformwarnung klassifiziert; andere X-Frame-Fehler bleiben sichtbar.
