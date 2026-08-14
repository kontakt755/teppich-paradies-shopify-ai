# Tracking Readiness

Nur öffentliche Seiten und Theme-Dateien wurden gelesen; Checkout, Bestellungen und Werbekonten blieben unverändert.

- Google Ads Conversion: **UNKLAR** – Kein eindeutiger öffentlicher AW-Identifier. In Google & YouTube/Google Ads den Conversion-Status und enhanced conversions prüfen.
- GA4: **UNKLAR** – Kein eindeutiger GA4-Identifier im öffentlichen DOM. In Shopify Customer Events bzw. Google & YouTube prüfen.
- Merchant Center: **UNKLAR** – Kontoverknüpfung ist öffentlich nicht verlässlich erkennbar. Google & YouTube-App und Merchant Center Diagnosen öffnen.
- Meta: **UNKLAR** – Kein eindeutiges Meta-Pixel-Signal im öffentlichen DOM. Shopify Customer Events/Meta-App prüfen.

## Event-Abdeckung

- Add to cart: ohne Mutation nur Code/DOM prüfbar; keine Testposition in den Warenkorb gelegt.
- Begin checkout: ohne Checkout-Manipulation nicht vollständig verifiziert.
- Purchase: **UNKLAR**, bis ein vollständiger genehmigter Testkauf samt GA4-/Ads-Debug-Ansicht durchgeführt wurde.
- Theme-Dateien mit Tracking-Begriffen: keine eigenen Theme-Hits

## Nächster manueller Schritt

Nach dem genehmigten Testkauf parallel GA4 DebugView, Google Ads Tag-Diagnose und Shopify Customer Events kontrollieren; Transaktions-ID, Wert, Währung und genau ein Purchase-Event abgleichen.
