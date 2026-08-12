# Google-&-YouTube-Ausschlussplan für Rollenware

Stand: 12. August 2026  
Shop: Teppich Paradies  
Scope: sichere Vorbereitung; es wurden keine Vertriebskanal-Einstellungen geändert.

## Ergebnis

Die Ausschlussliste enthält **118 aktive Produkte**, die ausschließlich anhand strukturierter Shopify-Daten sicher als Rollenware erkannt wurden:

- Mindestens eine echte Variante besitzt `custom.rollenbreite > 0`.
- Varianten mit einem Titel, der `opc-*` enthält, werden als technische Calculator-Varianten ignoriert.
- Titel, Tags, Beschreibungen und Produkttypen wurden nicht als Erkennungsgrundlage verwendet.
- Unsichere Produkte stehen nicht in der Liste.

Datei: `GOOGLE_ROLLENWARE_EXCLUSION_LIST.csv`

## Warum EXCLUDE

Bei diesen Produkten ist der Shopify-Variantenpreis der Grundpreis pro Quadratmeter. Der tatsächlich kaufbare Gesamtpreis entsteht erst aus Rollenbreite, gewünschter Länge und Quadratmeterpreis im Options Price Calculator. Der Grundpreis entspricht daher nicht zuverlässig einem direkt kaufbaren Mindestgesamtpreis. Bis eine Google-konforme Feed-Architektur mit tatsächlich kaufbaren Preisen existiert, lautet die Empfehlung für alle gelisteten Produkte: **EXCLUDE aus Google & YouTube**.

Der Verkauf im normalen Onlineshop bleibt davon unberührt.

## Sicherer Bulk-Workflow im Shopify-Admin

Shopifys aktuelle Dokumentation bestätigt, dass einzelne Produkte oder mehrere Produkte per Bulk-Aktion für Google & YouTube verfügbar beziehungsweise nicht verfügbar gemacht werden können. Da sich Bezeichnungen und Anordnung der Admin-Oberfläche ändern können, ist folgender Workflow absichtlich funktionsbezogen formuliert:

1. Im Shopify-Admin die Produktliste öffnen.
2. Die Produkte aus `GOOGLE_ROLLENWARE_EXCLUSION_LIST.csv` anhand Handle oder Shopify-Produkt-ID auswählen. Bei 118 Produkten in überschaubaren Batches arbeiten und die Auswahlzahl kontrollieren.
3. Die Bulk-Aktion zur Änderung der Vertriebskanal-/Publishing-Verfügbarkeit öffnen.
4. **Nur** `Google & YouTube` für die ausgewählten Produkte deaktivieren.
5. Sicherstellen, dass `Online Store` weiterhin aktiviert ist; diesen Kanal nicht abwählen.
6. Änderungen speichern und anschließend stichprobenartig bei einem Teppichboden sowie einem Vinylboden von der Rolle kontrollieren, dass Online Store aktiv und Google & YouTube inaktiv ist.
7. Im Google-&-YouTube-Kanal nach der Synchronisierung prüfen, dass die 118 Produkte nicht mehr synchronisiert werden. Danach im Merchant Center den Rückgang beziehungsweise Ausschluss der entsprechenden Artikel kontrollieren.

Keinen CSV-Import verwenden: Eine normale Produkt-CSV ist kein verlässlicher Mechanismus zum Ändern der Sales-Channel-Verfügbarkeit.

## Kontrollpunkte vor Bestätigung

- Ausgewählte Produktzahl: **118**
- Google & YouTube: deaktiviert
- Online Store: weiterhin aktiviert
- Produkte selbst: weiterhin aktiv
- Preise, Varianten, SKUs und OPC-Konfiguration: unverändert

## Quellen zur Admin-Funktion

- Shopify Help Center: https://help.shopify.com/en/manual/online-sales-channels/marketplaces/google/getting-setup/syncing-products
- Shopify Help Center: https://help.shopify.com/en/manual/online-sales-channels/manage

Die erste Quelle beschreibt ausdrücklich die manuelle Einzeländerung und eine Bulk-Aktion für mehrere Produkte. Die zweite erklärt, dass Produktverfügbarkeit kanalweise entfernt werden kann.
