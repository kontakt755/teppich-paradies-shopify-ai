> Automatischer Code-Review vom 2026-09-08 (Subagent, nur Code, keine Storefront).
> Einordnung und Korrekturen stehen in `docs/analyse/SHOP_ANALYSE_2026-09-09.md`, Abschnitt Theme.
> Wichtig: Die Befunde P0-2, P0-3 und P1-8 betreffen den cm-genauen Modus (`custom.preis_pro_001_qm`),
> der laut Admin-Abfrage vom 2026-09-09 bei keinem Produkt aktiv ist - sie sind latent, nicht live.

# Theme-Audit TeppichParadies (Horizon) — Code-Review

Basis: vollständige Lektüre von `layout/theme.liquid`, allen `templates/product.*.json`, `templates/index.json`, `collection.json`, `cart.json`, Header-/Footer-Groups, `config/settings_data.json`, `locales/de.json` sowie allen 25 `blocks/tp-*.liquid` und 19 `snippets/tp-*.liquid`.

---

## 1) Inventar der tp-Bausteine

**Blocks (`blocks/`)**
| Datei | Zweck |
|---|---|
| `tp-bewertungsbeleg.liquid` | Sternebewertung + Google-Link, Wert aus Block-Setting (hart gepflegt) |
| `tp-card-actions.liquid` | Kartenzeile „Vergleichen" + „Muster" |
| `tp-card-color-thumbs.liquid` | Farbthumbnails je Farbwert auf der Karte |
| `tp-card-specs.liquid` | max. 3 technische Kurzmerkmale (nur Paketware) |
| `tp-card-title.liquid` | gekürzter Kartentitel (Zusätze nach „–"/„Teppichboden" entfernt) |
| `tp-category-copy.liquid` | Kategorie-Dreizeiler (Label/Nutzen/Detail) |
| `tp-category-image.liquid` | Kategoriebild aus Asset-Dateiname |
| `tp-compare-toggle.liquid` | PDP-Button „Zum Vergleich hinzufügen" inkl. JSON-Snapshot |
| `tp-farbanzeige.liquid` | Zeile „Farbe [Swatch] Name", optional Farbnummer |
| `tp-footer-links.liquid` | Footer-Navigation Sortiment/Service |
| `tp-google-rating.liquid` | Google-Rating-Widget — **funktionslos** (Backend fehlt) |
| `tp-product-h1.liquid` | PDP-H1 mit Kürzung redundanter Stärkenangabe |
| `tp-roll-order-help.liquid` | Erklärtext zur Rollenware-Bestellung |
| `tp-rollware-anzeige.liquid` | Maßskizze/Rechenweg ohne Warenkorb-Logik (Alt-Variante) |
| `tp-rollware-rechner.liquid` | **Kaufpfad Rollenware**: Breite/Länge → Fläche → `/cart/add.js` |
| `tp-service-links.liquid` | Muster-Link, Lieferzeit, Versandaussage, Beratung/WhatsApp |
| `tp-step.liquid` | nummerierte Schrittüberschrift für fremde Bedienelemente |
| `tp-teppich-auf-einen-blick.liquid` | Merkmalsübersicht Teppiche |
| `tp-teppich-produktdetails.liquid` | vollständige Datentabelle Teppiche |
| `tp-teppich-versand.liquid` | Liefer-/Musterzone speziell für Teppiche |
| `tp-teppich-vorteile.liquid` | max. 3 Vorteile Teppiche aus Metafeldern |
| `tp-teppich-wunschmass.liquid` | **Kaufpfad Wunschmaß-Teppich** (Preis je 0,01 m²) |
| `tp-verkaufstext.liquid` | Nutzensätze aus Metafeldern |
| `tp-vertrauen.liquid` | statische Vertrauensliste + Telefonnummer |
| `tp-vorteile.liquid` | max. 3 Vorteile Bodenbelag aus Metafeldern |

**Snippets (`snippets/`)**
`tp-bewegung`, `tp-design-tokens`, `tp-farbwelt`, `tp-formular`, `tp-megamenu`, `tp-mobil`, `tp-schrift`, `tp-verlegeseite` = Design-/Mobil-/Formular-Feinschliff — **alle acht werden nirgends gerendert** (siehe P1-3).
Aktiv: `tp-card-roll-widths` (Rollenbreiten auf Karten), `tp-color-label-mapping` (Filterlabels), `tp-compare-bar` (globale Vergleichsleiste, `layout/theme.liquid:138`), `tp-farbe-daten`/`tp-farbe-properties` (Farbnummer → Line-Item-Properties), `tp-laufband`, `tp-price-per-sqm` (€/m² für Paketware), `tp-product-structured-data`, `tp-step-heading`, `tp-suche-leer`, `tp-zubehoer-icon`.

---

## 2) Befunde, priorisiert

### P0 — verhindert oder zerstört den Kauf

**P0-1 · Standard-„In den Warenkorb" + Shop-Pay auf Wunschmaß-Teppichen aktiv**
`templates/product.teppich.json:223` — der `buy-buttons`-Block ist **nicht** `disabled` (anders als in `product.rolle.json:239` und `product.planken.json:232`). Er wird nur per CSS aus `blocks/tp-teppich-wunschmass.liquid:60-64` (`display:none !important` über eine als Text gepflegte Block-ID) verborgen. Bei diesen Produkten ist `variant.price` der Preis pro **0,01 m²**. Greift der Selektor nicht (ID-Tippfehler, geänderter Key, Shopify-ID-Präfix), sieht der Kunde einen Preis wie „0,32 €", legt mit Menge 1 **0,01 m²** in den Warenkorb — und der `accelerated-checkout`-Block (`:249`) führt direkt in den Checkout.
*Fix:* `"disabled": true` in `product.teppich.json:223` setzen (wie bei rolle/planken) statt CSS-Ausblendung.

**P0-2 · Rollenware-PDP zeigt den Preis um Faktor 100 zu niedrig**
`blocks/price_custom.liquid:65` gibt `{{ current_price | money_without_currency }} €/m²` aus, **ohne** die `custom.preis_pro_001_qm`-Umrechnung. `snippets/price.liquid:155-160` macht sie korrekt (`| times: 100`). `templates/product.rolle.json:138` benutzt aber `price_custom`. Ergebnis auf cm-genauen Rollenprodukten: Überschrift „0,29 €/m²", Rechner „29,00 €/m²", Warenkorb 100× der genannte Preis. Nichts zerstört Kaufabsicht zuverlässiger.
*Fix:* in `price_custom.liquid` denselben `preis_pro_001_qm`-Zweig wie in `snippets/price.liquid:155` ergänzen — oder `price_custom` durch den regulären `price`-Block ersetzen.

**P0-3 · Warenkorb zeigt Menge „666" und Stückpreis „0,29 €"**
`snippets/cart-products.liquid:293-314` rendert für jede Position den Standard-Mengenwähler. Bei cm-genauer Abrechnung ist `quantity` die Fläche in 0,01-m²-Einheiten. Der Kunde sieht im Drawer eine Menge von mehreren hundert Stück zu Cent-Beträgen und einen „+"-Button, der 0,01 m² zufügt. Genau an dieser Stelle bricht die Konvertierung ab.
*Fix:* für Positionen mit `properties['Fläche']` die Menge als Fläche rendern und den Stepper durch „Menge ändern → zurück zum Rechner" ersetzen.

**P0-4 · Zwei konkurrierende Kauf-Buttons auf dem Standard-Produkttemplate**
`templates/product.json` enthält `paket-auswahl` (`:71`) **und** einen aktiven `buy-buttons`-Block (`:238`); `block_order` (`:324`) stellt den Paketrechner zudem **vor** Titel und Preis. Auf Paketware stehen damit zwei „In den Warenkorb"-Buttons mit unterschiedlicher Mengenlogik untereinander.
*Fix:* `buy_buttons_eYQEYi` in `product.json` auf `"disabled": true` und `paket_auswahl_xLTafR` in `block_order` hinter `group_icgrde` einsortieren.

**P0-5 · Kein Tracking im Theme**
In `layout/theme.liquid` (172 Zeilen, vollständig gelesen) gibt es weder GA4/`gtag`, GTM, Meta-Pixel noch eine Custom-Liquid-Einbindung; auch `config/settings_data.json` enthält keine Tracking-Keys. „5.100 Sessions, 0 Checkouts" ist deshalb **nicht verifizierbar** — es kann ein Messproblem statt eines Kaufproblems sein.
*Fix:* GA4 + Consent Mode über Shopify Customer Events (Web Pixels) anlegen und Checkout-Funnel gegenprüfen, bevor weitere Theme-Änderungen bewertet werden.

### P1 — kostet Conversion oder Vertrauen

**P1-1 · Musterbestellung führt ins Kontaktformular statt in den fertigen Konfigurator**
`sections/tp-sample-checkout.liquid` + `templates/page.muster.json` sind ein vollständiger, warenkorbbasierter Musterservice (max. 3 Farben, `assets/tp-sample-checkout-core.js:2` Handle `kostenloses-muster`). **Kein einziger Link im Theme zeigt darauf.** Alle Muster-CTAs gehen auf `/pages/kontakt?thema=muster`: `blocks/tp-service-links.liquid:17`, `blocks/tp-card-actions.liquid:86`, `blocks/tp-teppich-versand.liquid:21`.
*Fix:* die drei `href` auf `/pages/muster?produkt={{ handle }}` umstellen.

**P1-3 · Acht tp-Snippets sind toter Code**
`tp-mobil` (Trefferflächen/Schriftgrößen bei 375 px), `tp-formular` (Inline-Validierung + `aria-live` für den Rollenrechner), `tp-design-tokens`, `tp-farbwelt`, `tp-schrift`, `tp-bewegung`, `tp-megamenu`, `tp-verlegeseite` werden von keiner Datei gerendert — `layout/theme.liquid:28-32` lädt nur `meta-tags`, `stylesheets`, `fonts`, `scripts`, `theme-styles-variables`, `color-schemes`. Sämtliche Mobil- und Formularkorrekturen sind wirkungslos; bei einem Shop mit hohem Mobilanteil ist das direkt Conversion-relevant.
*Fix:* die benötigten Snippets in `theme.liquid` im `<head>` rendern (mindestens `tp-mobil` und `tp-formular`) — oder löschen, damit der Stand nicht weiter falsch dokumentiert ist.

**P1-4 · Kein Announcement-/USP-Band, dafür Länder- und Sprachwähler**
`sections/header-group.json` enthält nur `header_section` + `divider` (`:120-123`) — kein Vertrauensband („Versandkostenfrei", „Fachhandel seit …", „Muster kostenlos"). Gleichzeitig sind `show_country: true` (`:58`) und `show_language: true` (`:60`) aktiv. Ein Länderwechsel auf ein nicht bespieltes Market führt im Checkout zu „Versand an diese Adresse nicht möglich".
*Fix:* `show_country`/`show_language` auf `false`; stattdessen `header-announcements` mit 3 USPs in die Header-Group aufnehmen.

**P1-5 · „Geschätzter Gesamtbetrag" im Warenkorb**
`snippets/cart-summary.liquid:259` rendert `content.cart_estimated_total`; `locales/de.json` übersetzt das mit „Geschätzter Gesamtbetrag". Bei Festpreisen in EUR wirkt „geschätzt" unseriös.
*Fix:* Übersetzungsschlüssel auf „Gesamt (inkl. MwSt.)" ändern.

**P1-6 · Sie/Du-Mischung**
`locales/de.json` duzt (`actions.log_in_html`: „Hast du ein Konto?", `blocks.email_signup.success`: „Danke für deine Anmeldung!"), alle tp-Blöcke siezen (`tp-service-links.liquid:59` „Ihrer Lieferadresse", `tp-rollware-rechner.liquid:743` „beraten wir Sie"). Der Rollenrechner selbst duzt in den Überschriften („Wähle deine Breite", `:70`).
*Fix:* auf „Sie" vereinheitlichen — Locale und `tp-rollware-rechner.liquid:70/90`.

**P1-7 · Elfsight-Widget lädt ohne Consent**
`sections/google.liquid:3` bindet `https://static.elfsight.com/platform/platform.js` unbedingt ein — DSGVO-Risiko und Render-Kosten auf der Startseite. `blocks/tp-google-rating.liquid:40-46` ist die eigene, aber **dauerhaft inaktive** Alternative (Backend `/api/store/google-rating` nie gebaut).
*Fix:* Elfsight erst nach Consent laden; `tp-google-rating` entweder fertigstellen oder entfernen.

**P1-8 · Falschanzeige nach dem Hinzufügen im Rollenrechner**
`blocks/tp-rollware-rechner.liquid:835`: `cta.textContent = qty + ' m² hinzugefügt'` — im cm-genauen Modus ist `qty` die Menge in 0,01-m²-Einheiten. Der Button meldet „666 m² hinzugefügt" statt „6,66 m²". Zeile 735 macht es mit `fmtArea(billedArea)` richtig.
*Fix:* `fmtArea(billedArea)` auch in Zeile 835.

**P1-9 · Paketrechner überlebt keinen Variantenwechsel**
`blocks/paket-auswahl.liquid:245-246` schreibt `data-package-price-cents` und `data-variant-id` serverseitig; das IIFE (`:334`) läuft genau einmal. Der Rollenrechner löst dieses Problem explizit (`:788-796` liest `?variant=` bzw. lauscht auf Swatch-`change`), der Paketrechner nicht — nach einem Farbwechsel landet die zuerst geladene Variante zum alten Preis im Warenkorb.
*Fix:* `baseOptions()`-Muster aus `tp-rollware-rechner.liquid:788` übernehmen.

**P1-10 · Primärer Hero-CTA hängt an einem Sammel-Handle mit `-1`**
`sections/Startseite.liquid:427` verlinkt `collections['vinylboden-1'].url`. Existiert das Handle nicht, rendert Liquid `href=""` → der wichtigste Button der Startseite lädt die Startseite neu.
*Fix:* Handle gegen den Shop prüfen und auf `vinylboden` korrigieren.

### P2 — SEO / Qualität

**P2-1 · Keine Produkt-JSON-LD für das Kernsortiment.** `snippets/tp-product-structured-data.liquid:42` unterdrückt `structured_data` für *jedes* Produkt mit `custom.rollenbreite`, OPC-Variante oder Wunschmaß — also für Teppichboden und Rollenvinyl, das Hauptsortiment. Google sieht dort keinerlei Produkt-Markup. *Fix:* JSON-LD mit `priceSpecification` (`unitCode: "MTK"`, `referenceQuantity`) statt Komplettunterdrückung ausgeben.

**P2-2 · Englische Reste im `<title>`.** `snippets/meta-tags.liquid:158` `&ndash; tagged "…"`, `:159` `&ndash; Page {{ current_page }}` — erscheint auf getaggten Kollektionen und ab Seite 2. *Fix:* „– Seite {{ current_page }}" bzw. den Tag-Zusatz entfernen.

**P2-3 · Kein `hreflang`, kein `theme-color`, kein Favicon.** `meta-tags.liquid:20-23` gibt `content=""` aus; `settings_data.json` enthält keinen `favicon`-Key, `theme.liquid:9` rendert deshalb kein Icon. Canonical (`:164-167`) ist in Ordnung, `noindex` existiert nirgends.

**P2-4 · Bewertungsanspruch nur hart gepflegt und nur auf einem Template.** `templates/product.rolle.json:184` `"rating": "4.8"` in `tp-bewertungsbeleg`; kein `AggregateRating`-Markup, keine Bewertungszahl, und die anderen fünf Produkttemplates zeigen den Beleg gar nicht.

**P2-5 · `tp-rollware-anzeige.liquid` (345 Zeilen) ist die abgelöste Vorgängerversion des Rechners** und wird in keinem Template referenziert — Altlast.

### P3
`enable_sticky_add_to_cart: true` steht in **allen sechs** Produkttemplates (`product.json:347`, `rolle:352`, `teppich:320`, `planken:315`, `fixpreis:313`, `zubehoer:287`), obwohl `assets/sticky-add-to-cart.js:105` ohne `.buy-buttons-block` still aussteigt — die Leiste erscheint auf rolle/planken nie, das Markup inkl. falschem Preis liegt trotzdem im DOM. · `MAX_LENGTH_CM = 5000` (`tp-rollware-rechner.liquid:526`) blockt bei 50 m ohne sichtbaren Vorab-Hinweis. · Warenkorb-Beschleunigungsbuttons kommen aus `cart-summary.liquid:297`, Zahlungsikonen aus `blocks/payment-icons.liquid:21` (`shop.enabled_payment_types`, Footer-Group `:40`) — beides in Ordnung. · Keine Treffer für „Zollgebühren"/„customs"/„duties" außerhalb der Standard-`tax-info.liquid`; die englischen Reste wurden laut `git log` (`6550b2e`, `f149e21`) bereits bereinigt.

---

## 3) Unfertiges / Inkonsistentes über Templates hinweg

**Titel-Blöcke:** `product.planken.json:112` nutzt `tp-product-h1` (kürzt redundante Stärkeangaben), während `product.json:137`, `product.rolle.json:111` und `product.teppich.json:112` einen generischen `text`-Block mit `<h1>{{ closest.product.title }}</h1>` verwenden. Vier von fünf PDPs profitieren also nicht von der Kürzungslogik — und die H1 unterscheidet sich sichtbar zwischen Klickvinyl und Teppichboden.

**Karten-Titel:** `tp-card-title` ist auf Startseite (`index.json:135/343/551`), Kollektion (`collection.json:161`), Empfehlungen (`product.*.json`) und Suche gesetzt — **außer** in `templates/cart.json:184`, wo die Sektion „Passend dazu" noch den Standard-`product-title` verwendet. Dieselben Produkte tragen dort einen längeren Namen als zwei Klicks vorher, direkt an der kritischsten Stelle.

**Preis-Blöcke:** drei Varianten im Einsatz — `price` (teppich, zubehoer, alle Karten), `price_custom` (nur rolle) und `tp-price-per-sqm` innerhalb von `blocks/price.liquid`. Nur zwei davon kennen `preis_pro_001_qm` (P0-2).

**Kauf-Buttons:** rolle und planken deaktivieren `buy-buttons` sauber, teppich und product.json nicht (P0-1/P0-4) — dieselbe Entscheidung wurde viermal unterschiedlich getroffen.

**Versandaussagen:** `tp-service-links.liquid:47-51` verspricht „Versandkostenfrei" bzw. „4,99 €, ab 50 € kostenlos" anhand von Metafeldern, `tp-teppich-versand.liquid` bewusst nicht, `sections/tp-shipping-delivery.liquid:36` sagt „werden im Checkout angezeigt". Drei Aussagen für eine Frage.

**Empfehlung zur Reihenfolge:** erst P0-5 (Messung herstellen), dann P0-1/P0-2/P0-3 (Preis- und Mengenanzeige im Rollen-/Wunschmaß-Pfad), dann P1-1 und P1-3.
