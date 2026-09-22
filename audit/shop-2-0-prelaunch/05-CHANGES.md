# Änderungen

## 2026-09-22 · Navigation · Bildkacheln Teppichfliesen

- **Problem vorher:** Menüpunkt Teppichfliesen ohne kuratierte Kacheln. Desktop: quadratisches Kollektionsbild und ein hochkantes Produktfoto (Teppichplanken) im 16:9-Ausschnitt; Drawer: Kollektionsbild.
- **Änderung:** vier `_tp-menu-kachel`-Blöcke (Teppichfliesen, Alle Teppichfliesen, Fliesen 50 × 50 cm, Teppichplanken) mit echten Produktfotos aus der Kollektion.
- **Dateien:** `sections/header-group.json`
- **Auswirkungen:** nur Bilder im Menü; Menüstruktur unverändert (Datei war vor dem Push identisch mit `main`, MD5 705b2682…).
- **Risiken:** Bildkachel zeigt eine Planke (Sigmavia) als Hero für „Alle Teppichfliesen" – Produkt ist Teil der Kollektion, kein KI-Bild.
- **Test:** Guards grün; Push `--only` ins Arbeitstheme, `checksumMd5` 21087b1c… = lokal; Vorschau Desktop + Mobil.
- **Ergebnis:** PR #454.

## 2026-09-22 · Warenkorb · Beratung, Maßprüfung, Verlegeanfrage (M5)

- **Problem vorher:** Keine Beratungs-/Telefonabfrage vor dem Checkout; Bestellungen ohne Zusatzangaben; Express-Checkout und Buy-now auf der Produktseite umgingen den Warenkorb komplett (PL-005, PL-007).
- **Änderung:** Neues Custom Element `tp-cart-beratung` im Cart-Summary (Seite + Drawer): Pflichtfrage „Persönliche Beratung gewünscht?" Ja/Nein ohne Vorauswahl; bei Ja Telefon (Pflicht), Zeitfenster, Freitext; Maßprüfung nur bei berechneten Positionen (Zuschnitt/Raummaß/Maße); Verlegeanfrage nur bei verlegeberechtigten Produkten (`tp-vs-berechtigt`). Speichern per `/cart/update.js` als Cart-Attribute `Beratung`, `Telefon`, `Rückruf`, `Beratungsthema`, `Maßprüfung`, `Verlegung`; zusätzlich Inputs im Cart-Formular. „Zur Kasse" wird bei unvollständiger Antwort abgefangen (Fehltext, Fokus), Express-Buttons bleiben bis dahin verborgen. Buy-now-Block (`accelerated-checkout`) in allen 8 Produkt-Templates auf `disabled` gesetzt. Funnel-Events `tp_beratung_ja/nein`, `tp_masspruefung_ja`, `tp_verlegung_angefragt`.
- **Dateien:** `assets/tp-cart-beratung.js`, `snippets/tp-cart-beratung.liquid`, `snippets/cart-summary.liquid`, `templates/product.*.json` (8), `qa/tests/tp-cart-beratung.test.mjs`, `domains/shopify/flow/bestell-tags.md`
- **Auswirkungen:** Jede Bestellung trägt die Beratungsentscheidung unter „Zusätzliche Details"; Tags erst nach Flow-Einrichtung (offen). Buy-now auf PDP entfällt (Kunde geht immer über den Warenkorb).
- **Risiken:** Ein zusätzlicher Pflichtschritt vor dem Checkout (Conversion); Express-Buttons erscheinen erst nach Antwort. Telefonnummer wird als Cart-Attribut gespeichert (Datenschutz: Zweck Rückruf, Hinweis im Text). Section-Rerender morpht das Markup, Zustand kommt aus `cart.attributes` (geprüft per Reload).
- **Test:** `node --test qa/tests/tp-cart-beratung.test.mjs` 7/7; Arbeitstheme: ohne Antwort → Fehltext, Checkout bleibt auf /cart; Ja + Telefon + Maßprüfung + Verlegung → `/cart.js` Attribute vollständig, Shop-Pay-Button sichtbar; Reload behält Werte; Drawer rendert dasselbe Element; Mobil 375 px ohne Overflow, Touch-Targets 44 px.
- **Ergebnis:** im Arbeitstheme 204436144462; Live nach PR-Merge und Deploy-Kette.
