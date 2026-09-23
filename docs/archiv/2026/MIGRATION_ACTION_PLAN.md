# Migration in Stufen

## 1. Lokal

- Python- und Router-Tests ausführen.
- Preflight ohne Key prüfen: fehlender Key muss klar melden, aber keine Informationen ausgeben.
- Klasse A/B/C/D mit Fake-Client testen.
- Fehler, Cache Write→Read und Hard-Limit testen.

## 2. Staging

- API-Key über Secret Store bereitstellen.
- Niedriges, konfiguriertes Spend-Limit in der Anthropic Console setzen.
- Erst B, danach C und D mit wenigen kontrollierten Requests aktivieren.
- Tatsächliche Usage, Cache-Rate, Retry-Rate und Kosten aus der SQLite-Datenbank und der Console vergleichen.

## 3. Go/No-Go

Freigabe erst, wenn Modellmapping, Tracking, Budgetstop und Fehlerszenarien nachweislich funktionieren. Bei Abweichung: API-Adapter deaktivieren und beim unveränderten `workflow/router.mjs` bleiben.

## Rollback

Es werden keine Shopify-Dateien, Produkte oder Themes verändert. Rollback bedeutet ausschließlich, keinen API-Adapter aufzurufen und den bisherigen lokalen Routerpfad zu verwenden.
