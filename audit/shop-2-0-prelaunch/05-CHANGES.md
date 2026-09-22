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

## 2026-09-22 · Konsistenz · Telefon, Öffnungszeiten, Lieferzeit, Versandschwelle, interner Tooltip (M2)

- **Problem vorher:** Telefonnummer in vier Schreibweisen (PL-010), Kontaktformular ohne Samstag, Lieferzeit 3–5 vs. 5–7 Werktage (PL-008), „50 €" hart im Rollenrechner neben Theme-Einstellung (PL-011), Tooltip „Interne Farbnummer" im Kunden-DOM (PL-023).
- **Änderung:** Alle Vorkommen `03301 / 573 37 20`, `03301 / 5733720`, `03301 5733720` → `03301 573 37 20` (inkl. Default `tp_vs_telefon`); Kontaktformular „Mo–Fr 8:30–18:00, Sa 8:30–14:30 Uhr"; `product.teppich.json` 5–7 Werktage; Rollenrechner liest `settings.tp_versand_frei_ab`; Tooltip „Farbnummer".
- **Dateien:** `blocks/tp-farbanzeige.liquid`, `blocks/tp-rollware-rechner.liquid`, `blocks/tp-verlegen-lassen.liquid`, `config/settings_schema.json`, `sections/contact-form.liquid`, `sections/final-cta.liquid`, `sections/tp-service-einstieg.liquid`, `sections/treppenverlegun.liquid`, `sections/vinylboden-verlegen.liquid`, `templates/page.{boden-malerarbeiten,karriere,teppichboden-verlegen,treppenverlegung,vinylboden-verlegen}.json`, `templates/product.{json,planken,rolle,teppich}.json`
- **Bewusst nicht geändert:** Impressum, Datenschutz, AGB (Rechtstexte, Sicherheitsgrenze); Radius-Text 15/50 km (Inhaberentscheidung, 07-OPEN-ITEMS #5); Wunschmaß-Grenzen in FAQ (PL-028, braucht Metafeld-Anbindung).
- **Risiken:** gering, reine Textwerte; Lieferzeit-Änderung ist eine inhaltliche Zusage (5–7 statt 3–5) → Inhaber informieren.
- **Test:** Guards grün, `npm test` 645/645; Arbeitstheme Sichtprüfung.

## 2026-09-22 · Interne Bestellmail · Beratung/Bestelltyp (M6a)

- **Problem vorher:** Rückrufwunsch, Telefon, Maßprüfung, Verlegeanfrage waren an der Bestellung nur unter „Zusätzliche Details" sichtbar; kein Bestelltyp.
- **Änderung:** Block „Beratung und Rückruf" (orange hervorgehoben, wenn etwas zu tun ist) und Zeile „Bestelltyp: TYP-MUSTER/-WARE/-MISCHBESTELLUNG" in `interne-bestellmail-block.liquid`; alle Werte escaped.
- **Dateien:** `domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid`, `qa/tests/bestellmail-beratung.test.mjs`
- **Auswirkungen:** erst nach Einsetzen der Vorlage im Admin (Mitarbeiterbenachrichtigung „Neue Bestellung").
- **Test:** LiquidJS 4/4, bestehende Maßprüfungs-Tests weiter grün.

## 2026-09-22 · E-Mail · Kundenbausteine Bestell- und Versandbestätigung (M6b)

- **Problem vorher:** Nur Shopify-Standardtexte („du"-Form, kein Musterbezug, keine Bestätigung von Beratung/Maßprüfung/Verlegung, kein Speditionshinweis) (PL-015).
- **Änderung:** Zwei Liquid-Bausteine zum Einsetzen in die Admin-Vorlagen: Bestellbestätigung mit drei Varianten (Muster: Lichthinweis, Musterliste mit Rücklink; Ware; Misch) und „So geht es weiter"-Kasten aus den Bestellattributen; Versandbestätigung mit Versanddienstleister, Trackingnummer/-button je Sendung, Speditionshinweis bei Meterware/Raummaß, ehrlicher Hinweis ohne Tracking.
- **Dateien:** `domains/shopify/benachrichtigungen/{bestellbestaetigung-block,versandbestaetigung-block}.liquid`, `README.md`, `qa/tests/kundenmail-bloecke.test.mjs`
- **Auswirkungen:** keine, bis im Admin eingesetzt. Follow-up-Mails nach Zustellung (§ 22) brauchen Flow oder ein E-Mail-Tool → 07-OPEN-ITEMS.
- **Risiken:** LiquidJS ≠ Shopify-Liquid; im Admin per Testbenachrichtigung gegenprüfen.
- **Test:** LiquidJS 5/5.

## 2026-09-22 · Tracking · Pixel-Vorlage und Conversion-Aufteilung (M8)

- **Problem vorher:** Custom Pixel mit Platzhalter, keine Muster/Ware-Trennung, Doppelzählungsrisiko (PL-016, PL-017, PL-025).
- **Änderung:** `domains/marketing/tracking-pixel-vorlage.md` mit fertigem Pixel-Code (Theme-Events → GA4, `tp_bestellung_typ`, `sample_order`, kein zweites purchase), Ads-Conversion-Tabelle (Kauf primär nur mit Wert > 0), UTM-Vorlage, vierstufige Gegenprobe.
- **Dateien:** `domains/marketing/tracking-pixel-vorlage.md`
- **Auswirkungen:** keine, bis GA4-ID vorliegt und Pixel im Admin angelegt ist.
