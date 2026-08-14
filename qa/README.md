# QA

- Standardlauf: `npm run qa`
- Screenshots für alle Seiten: `npm run qa -- --screenshots` (sonst nur bei Fehlern)
- Kompaktbericht: `QA_REPORT.md`; Details: `qa/results/latest-details.json`
- Seiten ergänzen/ändern: `pages` in `qa/qa.config.json` bearbeiten.
- Theme-Check-Baseline bewusst aktualisieren: `npm run qa -- --update-baseline`

Falls Chrome oder Edge nicht automatisch gefunden wird, kann der Browser pro
Rechner gesetzt werden, ohne einen lokalen Pfad einzuchecken:

```powershell
$env:TP_BROWSER_EXECUTABLE = 'C:\Pfad\zu\chrome.exe'
npm run qa
```

Der Lauf liest ausschließlich den öffentlichen Shop ohne Preview-Parameter und verändert keine Shopify-Daten.
