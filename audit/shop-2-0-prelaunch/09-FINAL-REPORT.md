# Abschlussbericht – Zwischenstand 2026-09-22 (Sitzung 1)

Der Masterplan ist nicht abgeschlossen. Dieser Bericht fasst den Stand nach der ersten Sitzung zusammen; er wird am Ende ersetzt.

## A. Was wurde geändert
- Megamenü/Drawer: Bildkacheln Teppichfliesen (PR #454).
- M5: Pflichtentscheidung Beratung + Maßprüfung + Verlegeanfrage im Warenkorb als Cart-Attribute; Checkout-Sperre; Express erst nach Antwort; Buy-now auf PDP aus.
- M2: Telefon (eine Schreibweise), Öffnungszeiten Kontaktformular, Lieferzeit Teppich 5–7 Werktage, Versandschwelle aus Einstellung, Tooltip „Farbnummer".
- M6: Interne Bestellmail mit Bestelltyp/Beratung; Kundenbausteine Bestell- und Versandbestätigung (Vorlagen, getestet).
- M7: Flow-Vorlage Tags + gespeicherte Ansichten (Vorlage).
- M8: Custom-Pixel-Vorlage, Conversion-Aufteilung, UTM.
- M3: Produktseiten-Reihenfolge (Nutzen, Verlegung, Vergleich unter Kaufen) in 4 Templates.
- M9: Feedtitel-Regel und Merchant-Center-Prüfliste (Vorlage).
- M10: Performance-Diagnose und erster Schritt: vier große Section-Stylesheets ausgelagert (globales CSS −8 %), visuell regressionsgeprüft; H1-Block in allen Produkt-Templates vereinheitlicht.
- Shop-Daten: Rapidia-Titelbild korrigiert (Piktogramm entfernt).
- Entscheidungen aus der Doku geholt: Radius-Text 50 km bleibt, Lieferzeit 5–7, Muster-Fallback bleibt, Feedtitel per Regel.
Alle Theme-Änderungen liegen im Arbeitstheme 204436144462 und im PR #454; nichts ist live.

## B. Bewusst nicht geändert
- Rechtstexte (Impressum/Datenschutz/AGB) – Sicherheitsgrenze.
- Radius-Text 15/50 km, Lieferzeit-Zusage, Muster-Altmodell – Inhaberentscheidungen (07-OPEN-ITEMS).
- SKUs (8 Duplikate, 41 fehlend) – Sicherheitsgrenze, Freigabe nötig.
- Produktseiten-Reihenfolge (M3) – erst nach P0-Kommunikation und mit Sichttest; nicht begonnen.
- Live-Deploy – nur nach PR-Merge und Deploy-Kette auf Anweisung.

## C. Gefundene Probleme (nach Priorität)
P0: PL-004 (Tags/Flow), PL-005/007 (erledigt), PL-008…012 (erledigt/entschärft), PL-013 (entschärft), PL-014 (Mapping), PL-015 (Vorlagen fertig), PL-016/017/025 (Tracking), PL-018/019 (Feed), PL-020/021 (Performance/Mobile), PL-022 (PDP), PL-023 (teilweise), PL-024. P1: PL-002/003/006/026/027/028/029/032. P2: PL-030/031. Details `02-ISSUES.md`.

## D. Offen
- **Kritisch:** Merchant Center 0 approved, Versandrichtlinie 404; GA4-ID/Pixel; Flow nicht installiert; mobile Performance (LCP 8–10 s).
- **Hoch:** Vorlagen im Admin einsetzen; internes Lieferanten-Mapping; Feedtitel; Produktbild-Sichtprüfung je Produkt.
- **Mittel:** PDP-Reihenfolge (M3), Cross-Sell im Drawer, Touch-Targets, Wunschmaß-Grenzen aus Metafeld.
- **Niedrig:** Bodenfinder, B2B-Funnel, Newsletter-Segmente (P2).

## E. Tests
Siehe `06-TESTS.md`: Unit 645/645, Modul-Tests 16/16 (Beratung 7, Mails 9), Arbeitstheme-Sichtprüfungen Desktop/Drawer/Mobil, Lighthouse mobil 3 Seiten.

## F. Ads Readiness
Siehe `08-ADS-READINESS.md` – **nicht READY**: Produktfeed ❌, Tracking ⏳, Checkout ❓, Mobile ⏳, Performance ❌, Kommunikation ⏳.

## G. Manuelle Prüfungen für Kaya (10 Klicks)
1. `https://www.teppich-paradies.net/?preview_theme_id=204436144462` → Menü „Teppichfliesen" öffnen: drei Bildkacheln.
2. Dort ein Produkt in den Warenkorb legen → Warenkorb: Frage „Persönliche Beratung gewünscht?" ohne Vorauswahl; „Zur Kasse" ohne Antwort zeigt Hinweis.
3. „Ja, bitte anrufen" → Telefonfeld erscheint; Shop-Pay-Button erst nach Telefonnummer.
4. Handy (oder Fenster schmal): dieselbe Prüfung im Warenkorb-Drawer.
5. Produktseite Piumera: kein „Jetzt kaufen"-Button mehr, nur „In den Warenkorb".
6. Seite `/pages/treppenverlegung` (Preview): Telefonnummer überall „03301 573 37 20".
7. Admin → Benachrichtigungen → Mitarbeiterbenachrichtigungen → Neue Bestellung → Code bearbeiten: alten Block (ab `{%- comment -%} Interner Bestellblock`) durch `domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid` ersetzen → Speichern → Testbenachrichtigung senden. (Der Agent darf im Admin nicht speichern.)
8. Admin → Kundenbenachrichtigungen → Bestellbestätigung: Baustein einsetzen (README), Vorschau prüfen.
9. Admin → Apps → Shopify Flow installieren, Workflows aus `domains/shopify/flow/bestell-tags.md` anlegen.
10. Google & YouTube App → Produktstatus: awaiting_review/abgelehnt prüfen; Versandrichtlinie unter Einstellungen → Richtlinien anlegen.
