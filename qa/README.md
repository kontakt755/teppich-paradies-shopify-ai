# QA

- Standardlauf: `npm run qa`
- Screenshots für alle Seiten: `npm run qa -- --screenshots` (sonst nur bei Fehlern)
- Kompaktbericht: `QA_REPORT.md`; Details: `qa/results/latest-details.json`
- Seiten ergänzen/ändern: `pages` in `qa/qa.config.json` bearbeiten.
- Theme-Check-Baseline bewusst aktualisieren: `npm run qa -- --update-baseline`

Der Lauf liest ausschließlich den öffentlichen Shop ohne Preview-Parameter und verändert keine Shopify-Daten.
