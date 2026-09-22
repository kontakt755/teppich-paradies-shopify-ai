# Fortschritt

Status: ⬜ OFFEN · 🟡 IN ARBEIT · 🟠 BLOCKIERT · 🧪 TEST · ✅ ERLEDIGT · ❌ FEHLER

| Bereich | Aufgabe | Status | Bearbeiter/Modell | Geänderte Dateien | Test | Ergebnis |
|---|---|---|---|---|---|---|
| Navigation | Bildkacheln Teppichfliesen im Megamenü/Drawer | 🧪 TEST | Claude Fable 5.1 | sections/header-group.json | Arbeitstheme 204436144462: Desktop-Megamenü + mobiler Drawer geprüft, MD5 = Theme | PR #454 offen, Live nach Merge + Deploy-Kette |
| Phase 0 | Bestandsaufnahme Repo/Shop (4 parallele Analysen, read-only) | ✅ ERLEDIGT | Claude Fable 5.1 + Explore-Agenten | audit/shop-2-0-prelaunch/01,02,07 | – | 31 Befunde PL-001…031, Commit 676a105 |
| Phase 0 | Projektordner + Masterplan angelegt | ✅ ERLEDIGT | Claude Fable 5.1 | audit/shop-2-0-prelaunch/* | – | – |
| M5 Warenkorb | Pflichtentscheidung Beratung (Ja/Nein, Telefon, Zeitfenster, Thema), Maßprüfung, Verlegeanfrage als Cart-Attribute; Checkout-Sperre; Express-Buttons erst nach Antwort; Buy-now auf PDP deaktiviert | ✅ ERLEDIGT (Arbeitstheme) | Claude Fable 5.1 (Klasse B) | assets/tp-cart-beratung.js, snippets/tp-cart-beratung.liquid, snippets/cart-summary.liquid, templates/product*.json (8), qa/tests/tp-cart-beratung.test.mjs | 7 Unit-Tests grün; Arbeitstheme 204436144462: Cart-Seite, Drawer, Mobil 375 px, Reload, /cart.js-Attribute | offen: Flow-Tags (Admin), Live nach Merge |
| M7 Flow | Flow-Workflows und gespeicherte Ansichten als Vorlage | 🟠 BLOCKIERT (Flow nicht installiert) | Claude Fable 5.1 | domains/shopify/flow/bestell-tags.md | – | Einrichtung im Admin durch Ahmet/Kaya |
| M2 Konsistenz | Telefonnummer auf eine Schreibweise (03301 573 37 20, 18 Stellen), Öffnungszeiten Kontaktformular mit Samstag, Lieferzeit Teppich 3–5 → 5–7 Werktage, Versandschwelle im Rollenrechner aus Theme-Einstellung, Tooltip „Interne Farbnummer" → „Farbnummer" | ✅ ERLEDIGT (Arbeitstheme) | Claude Fable 5.1 | 3 blocks, 5 sections, 9 templates, settings_schema.json | Guards grün, npm test 645/645 | Rechtstexte (Impressum/Datenschutz/AGB) bewusst nicht angefasst |
| M6a Interne Mail | Interne Bestellmail zeigt Bestelltyp (TYP-*), Beratung/Rückruf/Thema, Maßprüfung, Verlegeanfrage farbig hervorgehoben | ✅ ERLEDIGT (Vorlage) | Claude Fable 5.1 | domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid, qa/tests/bestellmail-beratung.test.mjs | LiquidJS 4/4 + bestehende Maßprüfungstests | Einsetzen im Admin (Mitarbeiterbenachrichtigung) offen |
