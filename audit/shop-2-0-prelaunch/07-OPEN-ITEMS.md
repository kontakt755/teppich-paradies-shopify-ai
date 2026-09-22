# Offene Punkte (nicht in dieser Umgebung lösbar oder Inhaberentscheidung)

| # | Punkt | Wer | Warum offen |
|---|---|---|---|
| 1 | Shopify Flow aktivieren (kostenlos, Shopify-nativ) für Order-Tags TYP-*/BERATUNG-*/MASS-PRUEFUNG-*/VERLEGUNG-* | Ahmet/Kaya (Admin) | App-Installation nur im Admin; Flow-Definitionen liegen nach M7 in `domains/shopify/flow/` |
| 2 | GA4-Mess-ID und Ads-Conversion-Aktionen; Custom-Pixel-Code einsetzen | Inhaber + Admin | keine API |
| 3 | Merchant Center: Prüfstatus, Ablehnungen, Versandrichtlinie anlegen (`/policies/shipping-policy` 404) | Admin | keine API; Vorlage `domains/shopify/versandrichtlinie-vorlage.md` |
| 4 | Benachrichtigungsvorlagen im Admin einsetzen: `bestellbestaetigung-block.liquid`, `versandbestaetigung-block.liquid`, `interne-bestellmail-block.liquid` (Anleitung `domains/shopify/benachrichtigungen/README.md`); danach Testbenachrichtigung + Testbestellung mit Beratung Ja | Ahmet/Kaya (Admin) | kein API-Zugriff auf Vorlagen; Browser-Session nicht im Admin angemeldet |
| 7 | Internes Lieferanten-Mapping (`lieferant.*`) für alle Produkte füllen | Datenlauf lokal (Rohdaten außerhalb Repo) | Lieferantendaten nicht im Repo |
| 8 | Lieferzeit auf 5–7 Werktage vereinheitlicht – nur Einspruch nötig, falls Teppich nach Maß schneller geht | Ahmet | Information |
| 9 | Google-Bewertung/Anzahl als Theme-Einstellung im Live-Theme prüfen und ins Repo (`settings_data.json`) übernehmen | Session mit Theme-Pull | Editor-Stand ≠ Repo |
| 10 | Custom Pixel aus `domains/marketing/tracking-pixel-vorlage.md` anlegen (GA4-ID einsetzen), in Ads genau eine Purchase-Quelle | Ahmet (Admin/Ads) | keine API |
| 11 | Follow-up-Mails nach Zustellung (Ware: Ankunft/Verlegung/Pflege/Bewertung; Muster: „Muster angesehen?") – braucht Flow (Zeitverzögerung) oder Shopify Email; Texte können vorbereitet werden, sobald Werkzeug entschieden ist | Ahmet | Werkzeugentscheidung (docs/shop-decisions.md: Newsletter „erstmal auslassen") |
| 12 | Cookie-Banner-Text auf Sie-Form umstellen (Admin → Einstellungen → Kundendatenschutz → Cookie-Banner → Text) | Ahmet/Kaya | Shopify-nativ, kein Theme-Code |
| 13 | Admin-Klicks „Speichern" (Benachrichtigungsvorlagen) werden dem Agenten vom Freigabe-Filter verweigert – Vorlagen sind eingesetzt/vorbereitet, Speichern bitte selbst | Ahmet/Kaya | Sicherheitsfilter |
