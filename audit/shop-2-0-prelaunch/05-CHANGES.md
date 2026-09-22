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

## 2026-09-22 · Produktdaten · Rapidia Teppichfliese Titelbild (PL-001)

- **Problem vorher:** Titelbild und Variantenbild „Grau Mittel Heller" war ein Piktogramm (Gebäude/Personen „33"), kein Produktfoto – im Feed, auf Karten und im Menü-Fallback sichtbar.
- **Änderung (Shop-Daten, Admin-API):** `productVariantDetachMedia` (Piktogramm von Variante 0580 gelöst), `productReorderMedia` (Piktogramm ans Ende); Titelbild jetzt echtes Foto 1127408. Datei nicht gelöscht.
- **Auswirkungen:** sofort live (Store-Daten sind theme-unabhängig). Variante 0580 hat jetzt kein Bild (ehrlich statt falsch).
- **Test:** Gegenprobe `featuredMedia` = 73747280331086, Variante 0580 `media: []`.

## 2026-09-22 · Produktseite · Reihenfolge (M3)

- **Problem vorher:** Nutzen-Block, Verlegen-lassen-Box und Vergleichsschalter standen vor dem Kaufen-Button (PL-022).
- **Änderung:** In `product.json`, `product.fliese.json`, `product.planken.json`, `product.teppich.json` per Skript `block_order` umgestellt: alles, was `tp-vorteile`/`tp-teppich-vorteile`/`tp-vertrauen`, `tp-verlegen-lassen`, `tp-compare-toggle` enthält, direkt hinter `buy-buttons`. Nur Reihenfolge, keine Inhalte.
- **Bewusst nicht:** `product.fixpreis.json` (Leisten-Kurzinfo = „klare Produktart", bleibt oben); `rolle`, `zubehoer`, `einfassung` waren bereits konform. H1-Vereinheitlichung (`tp-product-h1` überall) offen.
- **Test:** Arbeitstheme Piumera-PDP Desktop/Mobil, Kaufen-Button 800 px (Desktop) bzw. 863 px (375 px) von oben.

## 2026-09-22 · Performance · Diagnose (M10, keine Änderung)

Lighthouse 13.5 mobil simuliert, Live 22.09.: Start 65/LCP 9,0 s, PDP 64/7,9 s, Kollektion ~68/10 s. Befund:
- Start und Kollektion: LCP-Element ist ein `<p>` (Text), TTFB 126–140 ms, **Element-Render-Delay 2,3–3,3 s** → blockiert durch `compiled_assets/styles.css` (65 KB gz, 700–1058 ms, `unused-css-rules` 59 KB) und `base.css`; Fonts ohne Befund; Main-Thread 1,8 s (Script 0,54 s, Style/Layout 0,4 s).
- PDP: LCP = Produktbild 1196472 (fetchpriority high, nicht lazy, im HTML entdeckbar), Load-Delay 0,6 s, Render-Delay 1,8 s; Bild 832 px für 261 CSS-px (bei DPR 2,6 ≈ 686 px nötig, nächste Stufe – kein echter Fehler).
- Bildgröße/Kompression-Warnungen (Kollektion 352 px für 184 CSS-px) rechnen ohne Gerätedichte – bei DPR ≥ 2 korrekt.
- Größte Fremdlast: Shopify `checkout-web`/shop-js (Wallets, Login mit Shop), nicht Theme.
Hebel mit Wirkung: Größe des globalen Section-CSS (649 KB roh über 207 Dateien; die vier größten TP-eigenen: `tp-verlegeservice` 15,8 KB, `tp-einfass-konfigurator` 11,9 KB, `tp-ratgeber-beitrag` 11,8 KB, `tp-verlegegebiet` 11,2 KB) in Section-eigene Assets verschieben. Risiko laut Erfahrung: Section-CSS wirkt global, andere Seiten könnten sich darauf verlassen → nur mit Vorher/Nachher-Screenshots aller Seitentypen. Nicht in dieser Sitzung umgesetzt (P1, PL-020 bleibt offen).

## 2026-09-22 · Performance · Section-CSS ausgelagert (M10) und H1-Block (M3)

- **Problem vorher:** Alle `{% stylesheet %}`-Blöcke landen im globalen `compiled_assets/styles.css` (Live 22.09.: ca. 500 KB roh / 65 KB gz, render-blockend, ~90 % pro Seite ungenutzt). Die vier größten TP-eigenen gehören zu Sections, die nur auf 1–5 Seiten liegen.
- **Änderung:** CSS 1:1 (ohne Liquid) in `assets/tp-verlegeservice.css`, `assets/tp-einfass-konfigurator.css`, `assets/tp-ratgeber-beitrag.css`, `assets/tp-verlegegebiet.css` verschoben; die Section/der Block lädt es per `stylesheet_tag`. Globales Bundle im Arbeitstheme: 448 KB roh. Außerdem H1: `text`-Block mit `<h1>{{ closest.product.title }}</h1>` in 6 Produkt-Templates durch `tp-product-h1` ersetzt.
- **Dateien:** `sections/tp-verlegeservice.liquid`, `blocks/tp-einfass-konfigurator.liquid`, `sections/tp-ratgeber-beitrag.liquid`, `sections/tp-verlegegebiet.liquid`, 4 neue `assets/*.css`, 6 Templates.
- **Risiken:** Section-CSS wirkte bisher global – Seiten ohne die Section könnten Regeln daraus genutzt haben. Deshalb visuelle Regression (unten). Restrisiko: Seitentypen außerhalb der 10 geprüften (z. B. B2B-Seite, Suche).
- **Test:** Puppeteer-Fullpage-Screenshots vorher/nachher, 10 Seitentypen (Start, Kollektion, PDP Rolle, PDP Einfassung, Verlegeservice, Treppen, Ratgeber-Artikel, Muster, Warenkorb, Leisten) × 390/1366 px; Pixel-Diffs 0–4 %, alle größten Diffs per Sichtprüfung = vertikaler Scroll-Offset fixer Elemente (Cookie-Banner, Vorschauleiste), kein Layoutunterschied; Ratgeber und drei Desktop-Seiten 0 Diff. Asset-Links gemessen: Verlegeservice-Seite lädt tp-verlegeservice.css + tp-verlegegebiet.css, Einfassungs-PDP tp-einfass-konfigurator.css, Ratgeber tp-ratgeber-beitrag.css, Leisten-Kollektion keins davon.

## 2026-09-22 · Deploy · Livegang Shop 2.0 Pre-Launch

- **Ablauf:** Merge #454 → Preview scheiterte an FULL QA (Theme Check meldete die Benachrichtigungsvorlagen unter `domains/` als UndefinedObject, dazu eine ungenutzte Variable) → Fix #467 → Preview scheiterte am Sales-Check (Checkout ohne Beratungsantwort bewusst gesperrt) → Fix #468 (Check wählt „Nein") → Preview PASS → Live PASS.
- **Koordination:** parallele Livegänge #455/#463 der Sitzung „Produktseiten kompakt"; Konflikte in Templates und Rollenrechner zugunsten der kompakten Kaufstrecke gelöst, H1-Block und Buy-now-Sperre neu angewendet.
- **Test:** siehe 06-TESTS.md.
