# Tracking Readiness

Stand: 12.08.2026. Öffentlicher Live-Test mit frischen Browser-Sessions; kein Kauf und keine Änderung an Shopify-, Google- oder Meta-Konten.

## Kurzstatus

- GA4: **UNKLAR**
- Google Ads Conversion: **UNKLAR**
- Meta Pixel: **UNKLAR**
- Shopify Customer Events / Web Pixels: **TECHNISCH VORHANDEN**
- Add-to-Cart: **BESTÄTIGT**
- Checkout erreichbar: **BESTÄTIGT**
- Purchase: **NICHT GETESTET / NICHT BESTÄTIGT**

## A) Technisch bestätigt

- Shopify lädt seine Storefront-Analytics (`trekkie.storefront`) sowie Monorail-/`/api/collect`-Signale.
- Nach Zustimmung werden Shopify-Web-Pixel-Sandboxes geladen: ein App-Pixel und ein Custom-Pixel waren als isolierte `web-pixels`-Worker/Frames erkennbar.
- Vor Zustimmung beziehungsweise nach Ablehnung wurden keine öffentlich erkennbaren GA4-, Google-Ads- oder Meta-Endpunkte ausgelöst.
- Der Shopify-Consent-Banner bietet **Akzeptieren**, **Ablehnen** und **Einstellungen verwalten**.
- Paketware und Rollenware wurden erfolgreich über `/cart/add.js` in einen frischen Warenkorb gelegt; Warenkorbwerte waren korrekt.
- Shopify Checkout wurde für Paket- und Rollenware erreicht. Es wurde nichts bestellt.
- Im Theme-Code wurden keine eigenen `gtag`, `G-…`, `AW-…`, `fbq`, `begin_checkout`- oder `purchase`-Implementierungen gefunden. Damit wurde kein offensichtlicher doppelter Theme-Tag entdeckt.

## B) Wahrscheinlich vorhanden, aber nicht abschließend bestätigt

- Ein Shopify-App-Pixel und ein Custom-Pixel sind konfiguriert. Aus der öffentlichen Sandbox-Hülle ist nicht seriös ableitbar, ob darin GA4, Google Ads, Meta oder eine andere Integration steckt.
- Shopify-Standard-Analytics erfasst Storefront-Aktivität. Ob die Events vollständig und korrekt an externe Konten weitergeleitet werden, ist öffentlich nicht belegbar.
- Add-to-Cart ist funktional; ein externes `add_to_cart`-Event mit korrektem Produktwert wurde mangels Debug-/Admin-Zugriff nicht bestätigt.

## C) Nur mit Shopify-/Google-/Meta-Admin prüfbar

- **Shopify → Einstellungen → Kundenereignisse**: Namen, Status, Berechtigungen und Verbindungszustand von App-Pixel und Custom-Pixel prüfen.
- **Shopify → Vertriebskanäle → Google & YouTube**: GA4-/Google-Ads-/Merchant-Verknüpfung und Conversion-Status prüfen.
- **GA4 → Verwaltung → Datenstreams**: korrekten Webstream und Enhanced Measurement prüfen.
- **Google Ads → Ziele → Conversions → Zusammenfassung**: primäre Purchase-Conversion, Quelle, Wert und Enhanced Conversions prüfen.
- **Meta Events Manager**: Pixel-/Dataset-Verbindung, Browser-/Server-Events und Deduplizierung prüfen.
- Ob zwei Shopify-Pixel dieselben Zielsysteme bedienen und dadurch doppelte Events erzeugen, lässt sich nur anhand ihrer Admin-Konfiguration entscheiden.

## D) Beim echten Testkauf kontrollieren

1. Consent zunächst ablehnen: keine Marketing-Pixel/Events erwarten.
2. Neue Session starten und Consent akzeptieren.
3. In GA4 DebugView genau ein `view_item` und ein `add_to_cart` mit korrektem Artikelwert prüfen.
4. Checkout starten und genau ein `begin_checkout` mit EUR und Warenkorbwert prüfen.
5. Einen genehmigten Testkauf durchführen; vorher Testprodukt/Zahlungsweg intern festlegen.
6. Genau ein `purchase` mit Transaktions-ID, Gesamtwert und `EUR` in GA4 prüfen.
7. Dieselbe Transaktions-ID und denselben Wert in Google Ads kontrollieren; keine Doppelzählung.
8. Meta `Purchase` nur dann als funktionsfähig werten, wenn Events Manager Browser-/Serverstatus und Deduplizierung bestätigt.
9. Bestellung anschließend nach internem Prozess stornieren/erstatten und Auswirkungen auf Analytics dokumentieren.

## Öffentliche Laufzeit-Hinweise

- Shop-Pay-/Payment-Request-Frames erzeugen in Headless-Chrome erwartbare CSP-, Wallet- und abgebrochene Zahlungsanbieter-Requests. Diese belegen keinen Tracking-Defekt.
- Purchase-Tracking wird ausdrücklich **nicht** als READY bezeichnet, solange kein echter genehmigter Kauf samt Debug-Ansichten geprüft wurde.
