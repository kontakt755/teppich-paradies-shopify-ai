# Offene Punkte (nicht in dieser Umgebung lösbar oder Inhaberentscheidung)

| # | Punkt | Wer | Warum offen |
|---|---|---|---|
| 1 | Shopify Flow aktivieren (kostenlos, Shopify-nativ) für Order-Tags TYP-*/BERATUNG-*/MASS-PRUEFUNG-*/VERLEGUNG-* | Ahmet/Kaya (Admin) | App-Installation nur im Admin; Flow-Definitionen liegen nach M7 in `domains/shopify/flow/` |
| 2 | GA4-Mess-ID und Ads-Conversion-Aktionen; Custom-Pixel-Code einsetzen | Inhaber + Admin | keine API |
| 3 | Merchant Center: Prüfstatus, Ablehnungen, Versandrichtlinie anlegen (`/policies/shipping-policy` 404) | Admin | keine API; Vorlage `domains/shopify/versandrichtlinie-vorlage.md` |
| 4 | Benachrichtigungsvorlagen (Bestell-, Muster-, Versandbestätigung) im Admin einsetzen | Admin (per Browser möglich, s. memory CodeMirror) | Vorlagen entstehen in M6 |
| 5 | Verlegeradius-Text: 50 km Einsatzgebiet vs. 15 km kostenlose Lieferung – welche Aussage soll kundensichtbar sein? | Ahmet | Inhaltsentscheidung |
| 6 | Muster-Altmodell `TP-MUSTER-000` stilllegen? | Ahmet | Bestellhistorie |
| 7 | Internes Lieferanten-Mapping (`lieferant.*`) für alle Produkte füllen | Datenlauf lokal (Rohdaten außerhalb Repo) | Lieferantendaten nicht im Repo |
| 8 | Lieferzeit: 5–7 oder 3–5 Werktage für Teppiche nach Maß? | Ahmet | Inhaltsentscheidung |
| 9 | Google-Bewertung/Anzahl als Theme-Einstellung im Live-Theme prüfen und ins Repo (`settings_data.json`) übernehmen | Session mit Theme-Pull | Editor-Stand ≠ Repo |
