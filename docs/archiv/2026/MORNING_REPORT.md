# Teppich Paradies – Morgenbericht

Stand: 12.08.2026. Kein Kauf abgeschlossen, keine Produkt-, Preis-, Varianten-, Bestands- oder Tracking-Admin-Daten verändert.

## 1. SEO

- Ursache der letzten 2 Errors: Die Meta-Descriptions von **Teppichboden Schlinge** und **Versand & Lieferung** sind im Live-HTML korrekt vorhanden. Shopify lieferte bei einzelnen Edge-/Cache-Antworten kurzzeitig eine ältere Head-Variante ohne Description; der bisherige Checker behandelte diese als endgültige Wahrheit.
- Fix: `seo:check` liest den serverseitigen HTML-Head, erkennt doppelte Tags und wiederholt ausschließlich fehlende Meta-Descriptions mit frischen Cache-Bustern. Wird dabei die aktuelle Description gefunden, entsteht nur ein Stale-Response-WARN. Eine transiente Shopify-`X-Frame-Options`-Browserwarnung wird nicht mehr als On-Page-SEO-ERROR gezählt.
- Geprüfter Live-Stand: Beide URLs HTTP 200, genau ein nicht leeres Description-Tag, Canonical/Title/H1 unverändert.
- `npm run seo:check`: **Exit-Code 0** – **0 ERROR**, 105 WARN.
- Verbleibende ERRORs: **0**. Die WARNs wurden nicht blind abgearbeitet.

## 2. Vergleich

- Geändert: **JA**, bestehende Compare-Komponente erweitert; keine neue Vergleichslogik/App.
- Die geöffnete Leiste besitzt einen klar beschrifteten 44×44-px-Schließen-Button. Danach bleibt nur der kompakte Chip **„Vergleich (n)“** sichtbar.
- Manuelles Schließen/Wiederöffnen: **PASS**.
- Auswahl bleibt in `localStorage` vollständig erhalten: **PASS**.
- Neue Auswahl öffnet die Leiste wieder kurz; max. 3, Entfernen und Dialog bleiben intakt.
- Live-Test 0/1/2/3 Produkte, Schließen, Wiederöffnen, Entfernen und Reload: **Desktop 1440 PASS / Mobile 390 PASS** (`npm run compare:check`).

## 3. Sisal & Natur

- Analyse/Benchmark abgeschlossen: **JA**.
- Sicher belegte Produkte: **3** – Sisara, Sisola und Fibrella, jeweils öffentlich als **100 % Sisal** belegt.
- Nordica und Wovena bleiben wegen fehlender exakter Faserzusammensetzung ungeklärt. Wollprodukte bleiben fachlich in Wolle; belegte Schlingen-/Velours-Zuordnungen bleiben bestehen.
- Collection umgesetzt: **NEIN**. Es ist kein offiziell authentifizierter Shopify-Admin-Resource-Schreibzugriff vorhanden; deshalb keine Auth-Umgehung und keine unsichere Datenänderung.
- Vollständiger Dry-Run und Admin-Plan: `SISAL_NATUR_ADMIN_PLAN.md`.

## 4. Kaufweg

- Klickvinyl/Paketware: **PASS** Desktop/Mobile. Marlow: 10 m² Bedarf → 5 Pakete à 2,08 m² → 529,90 EUR; Warenkorb plausibel.
- Rollenware: **PASS** Desktop/Mobile. Terracora: 400 cm × 250 cm × 25,90 EUR/m² → 259,00 EUR; Breite 4 m und Länge 250 cm korrekt im Warenkorb.
- Muster: **PASS** Desktop/Mobile. Produktname, Bild, Produktbezug und Pflichtfelder vorhanden; Formular nicht abgesendet.
- Checkout erreichbar: **JA** für Paket- und Rollenware.
- Bestellung ausgeführt: **NEIN**.
- Behobener reproduzierbarer Fehler: Nach erfolgreichem OPC-Add konnte `product-form.js` dieselbe Response nochmals als JSON lesen. Die eng begrenzte Recovery bestätigt nun zuerst den angeforderten Varianteneintrag im Warenkorb und sendet nur dann das normale Cart-Event. Rechner/OPC-Daten blieben unverändert.

## 5. Tracking

- GA4: **UNKLAR** – öffentlich keine eindeutige ID/Eventweiterleitung nachweisbar.
- Google Ads: **UNKLAR** – Purchase-Conversion nicht ohne Admin und echten Kauf bestätigbar.
- Meta: **UNKLAR** – öffentlich keine eindeutige Pixel-ID/Eventweiterleitung nachweisbar.
- Shopify Customer Events: **TECHNISCH VORHANDEN** – App-Pixel- und Custom-Pixel-Sandboxes werden nach Consent geladen.
- Add-to-Cart und Checkout: technisch bestätigt. Kein offensichtlicher doppelter Theme-Tag gefunden.
- Beim echten Testkauf zu prüfen: genau ein `view_item`, `add_to_cart`, `begin_checkout` und `purchase`, korrekte Transaktions-ID/EUR-Werte sowie Google-/Meta-Deduplizierung.
- Details und 9-Punkte-Testkaufcheckliste: `TRACKING_REPORT.md`.

## 6. Merchant Center

- Echte Blocker: **Rollenware vorerst nicht für Shopping freigeben**, bis Merchant die Preis-/Maßeinheitenlogik korrekt abbildet. Schema zeigt z. B. 25,90 EUR/m², der minimal tatsächlich kaufbare Terracora-Warenkorb liegt wegen Breite/Mindestlänge höher.
- Paketware: öffentlich plausibel. Schema-/Shopify-Preis ist der echte Paketpreis; €/m² wird zusätzlich sichtbar erklärt. Vor Ads in der Merchant-Produktvorschau bestätigen.
- Product-/Offer-Schema: Stichprobe **PASS** (Name, URL, Bild, Preis, EUR, Verfügbarkeit, Brand, Offer).
- GTIN/EAN: in der Stichprobe lückenhaft/fehlend; **nie erfinden**.
- SKU: teilweise vorhanden. Produkttyp bei einzelnen Produkten ebenfalls lückenhaft.
- Preis-/Feed-Risiko: Paketpreis darf nicht mit sichtbarem €/m² verwechselt werden; OPC-/`opc-*`-Varianten dürfen nicht als normale Feedvarianten behandelt werden.
- Nächster Admin-Schritt: **Shopify Admin → Vertriebskanäle → Google & YouTube → Produkte**, zunächst 3–5 Paketprodukte prüfen; danach **Merchant Center → Produkte → Diagnose**. Rollenware bis zur Klärung ausschließen.
- Details: `MERCHANT_READINESS_REPORT.md`.

## 7. QA

- `npm run qa`: **Exit-Code 0** – 0 relevante Fehler, 60 Hinweise.
- `npm run qa -- --screenshots`: ausgeführt; zwei vermeintliche Schlinge-Bildfehler erwiesen sich als vollständig geclippte, lazy-loaded Offscreen-Carousel-Bilder. Checker nutzt nun die native Browser-Intersection statt nur Koordinaten.
- `npm run seo:check`: **Exit-Code 0** – 0 ERROR, 105 WARN.
- Neue Theme-Check-Fehler: **0**; neue Theme-Check-Warnungen: **0**.
- Bekannte Theme-Check-Baseline unverändert: **9 Errors / 35 Warnings**.
- Live-Matrix einschließlich Schlinge, Warenkorb und Versand: Desktop/Mobile ohne horizontalen Overflow, ohne kritische Console-/Assetfehler und ohne sichtbare defekte Bilder.

## 8. Geänderte Dateien

Live-Theme-Dateien:

- `assets/product-form.js`
- `assets/tp-compare.js`
- `snippets/tp-compare-bar.liquid`

Lokale QA-/Audit-Infrastruktur und Berichte:

- `qa/run-seo-check.mjs`
- `qa/run-sales-readiness.mjs`
- `qa/run-compare-check.mjs`
- `qa/run-qa.mjs`
- `qa/qa.config.json`
- `package.json`
- `SISAL_NATUR_ADMIN_PLAN.md`
- `TRACKING_REPORT.md`
- `MERCHANT_READINESS_REPORT.md`
- `MORNING_REPORT.md`
- generierte `QA_REPORT.md`, `SEO_REPORT.md` und JSON-/Screenshot-Artefakte unter `qa/`.

## 9. Live veröffentlicht

- **JA**, ausschließlich die drei kleinen Theme-Fixes für Vergleich und Cart-Event-Recovery.
- Von Shopify abschließend bestätigtes Live-Theme: **201829679438** (`theme-productpage-v2-night (2026-08-10)`).
- Fallback **196301750606** bleibt unverändert und unveröffentlicht.
- Keine Theme-Vorschau-URLs für die Abschlussprüfung verwendet.

## 10. MANUELL FÜR AHMET

1. **Produkte → Kategorien → Kategorie erstellen**: „Sisal & Natur“ als manuelle Kategorie mit Handle `sisal-natur` anlegen; Sisara, Sisola und Fibrella hinzufügen und bei diesen drei „Teppichboden Schlinge“ entfernen. Exakte Texte stehen in `SISAL_NATUR_ADMIN_PLAN.md`.
2. Nordica und Wovena anhand Hersteller-/Stammdaten auf die genaue Faserzusammensetzung prüfen; bis dahin keiner Naturkategorie zuordnen.
3. **Einstellungen → Kundenereignisse**: App-Pixel und Custom-Pixel öffnen und Zielsysteme/Status prüfen; sicherstellen, dass nicht beide dieselbe Conversion doppelt senden.
4. **Vertriebskanäle → Google & YouTube → Produkte**: zunächst 3–5 Paketprodukte prüfen; Rollenware noch nicht für die erste Kampagne freigeben.
5. **Merchant Center → Produkte → Diagnose**: Paketpreis, Verfügbarkeit, Bilder, GTIN-Warnungen und Landingpage-Preisabgleich prüfen.
6. **Merchant Center → Versand und Rückgaben**: Shoprichtlinien mit öffentlichem Versand-/Widerrufstext abgleichen.
7. Für die ersten Werbeprodukte belegte Hersteller-GTIN, SKU und Produkttyp ergänzen; fehlende GTIN niemals erfinden.
8. Einen intern genehmigten echten Testkauf anhand der Checkliste in `TRACKING_REPORT.md` durchführen und GA4/Google Ads/Meta auf genau ein Purchase-Event prüfen.
