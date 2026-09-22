# Bestandsaufnahme (Phase 0)

Stand 2026-09-22. Quellen: Repo `origin/main` e29037f, Shopify-Admin-API (MCP), Live-Storefront per curl, vier parallele read-only Analysen. Lieferanten nur als Pseudonyme (Lieferant A = Jordan-Seite, Lieferant B = M-Plus-Seite; Klarnamen nur lokal).

## 0. Shop-Stammdaten (Admin-API)

| Punkt | Wert |
|---|---|
| Plan | Basic |
| Domain | www.teppich-paradies.net, Live-Theme 204438208846 `preview-main-2026-09-15` (Ordner `/t/75/`) |
| Digital Wallets | Shopify Pay, Apple Pay, Google Pay (PayPal nicht in supportedDigitalWallets) |
| Policies | Kontakt, Impressum, Datenschutz, Widerruf, AGB vorhanden; **Versandrichtlinie fehlt** (`/policies/shipping-policy` 404, Blocker Merchant Center) |
| Aktive Produkte | > 250 (Seite 1: 85 Klickvinyl, 63 Vinyl Rolle, 49 Teppichboden, 49 Klebevinyl, 4 ohne Typ; Seite 2 folgt) |
| Vendor | 116 „TeppichParadies", Rest = Produktlinien-Namen (Odense, Alvora, Bergen, Verona, Porto …) – keine Lieferantennamen |
| Bestellungen | 9 gesamt (#1002–#1009), davon 4 Testbestellungen mit manuellem Tag `TESTBESTELLUNG`; keine automatischen Tags, keine Cart-Attribute (Beratung/Telefon) |
| Muster | zwei Modelle in Bestellungen: `TP-MUSTER-000` + Properties (bis #1008) und `M-<Lieferantennummer>` mit eigener Variante (#1009) |
| Metafelder Produkt | 55 Definitionen: `custom.*` (Technik), `lieferant.hersteller` (8 gefüllt), `lieferant.lieferant_a_produktname` (49), `lieferant_b_produktname` (9), `lieferant.match_status`, `grosshandel.sku` (250/250), `custom.marke` (134), `aktion.*`, `mm-google-shopping.custom_product` |
| Apps (laut Doku 2026-09-15) | Search & Discovery, Google & YouTube; **kein Shopify Flow**, kein E-Mail-Tool, keine Consent-App (Banner Shopify-nativ) |

## 1. Produktidentität, Lieferantentrennung, Datenkonsistenz

### 1.1 Lieferantennamen kundenseitig
Keine kundensichtbare Nennung von Lieferant A/B, Hersteller-Grosshandel, Astra oder Schöner Wohnen im Theme. Treffer sind Kommentare/Doku (`blocks/tp-rollware-rechner.liquid:19,95,222,549`, `assets/tp-rollware-art.js:15,122`, `snippets/tp-farbe-daten.liquid:9`, `snippets/tp-suche-ergebnisse.liquid:30`, `snippets/tp-product-structured-data.liquid:31`).
**Restlücke:** `variant.sku` wird gerendert (`blocks/sku.liquid:7`, `snippets/sku.liquid:9`, `sections/quick-order-list.liquid:178,187`) und steht im JSON-LD (`tp-product-structured-data.liquid:109-110`). SKUs tragen Lieferanten-Artikelmuster (z. B. `PVC…NEC_4381`) – darüber kann ein Lieferantenbezug lecken.

### 1.2 Metafelder, die das Theme liest
- `lieferant.*` nur Varianten, nur im Rollenrechner (`wunschmass`, `kettelung`, `blocks/tp-rollware-rechner.liquid:560-561`), nie ausgegeben. `grosshandel.sku` wird im Theme nirgends gelesen (nur interne Bestellmail).
- `custom.*` Produkt: belagsart, bandlaenge, brandverhalten, fasermaterial, florhohe, format_cm, fusbodenheizung, gesamtstarke, herstellungsland, indoor_outdoor, material, nutzschicht, nutzungsklassen, oeko_tex, pflegeleicht, preis_pro_001_qm, qm_pro_paket, rollenbreite, ruckenausstattung, stangenlaenge, stueck_bezeichnung, stueck_pro_paket, trittschallverbesserung, versandart, zimmer, wunschmass_{form, fertigungszuschlag, mindestpreis, mindestbreite_cm, mindestlaenge_cm, mindestflaeche_qm, maximalbreite_cm, maximallaenge_cm}.
- `custom.*` Variante: farbcode, farbe, rollenbreite. `service.*`: einfass_basis, einfass_gruppe, einfassung, formen, max_breite_cm, max_laenge_cm, mindestpreis (Produkt); einfassen, raummass (Variante). `reviews.rating/_count`, `aktion.start/ende`.
- **Risiko:** `custom.rollenbreite` existiert auf Produkt- und Variantenebene und wird gemischt gelesen (`snippets/cart-summary.liquid` produktseitig, `snippets/price.liquid` variantenseitig).

### 1.3 Hart codierte Angaben und Widersprüche
- **Wunschmaß-Grenzen** dreifach: `sections/tp-teppiche-faq.liquid:50`, `templates/collection.teppiche.json:275` („bis 400 cm, andere bis 600 cm") neben Metafeldern `wunschmass_maximalbreite_cm/-laenge_cm`.
- **Radius 15 km / 50 km:** 15 km = kostenlose Lieferung/lose Verlegung ab 649 € (`blocks/tp-verlegen-lassen.liquid:17-19`, `sections/tp-verlegegebiet.liquid:179-180`); kundensichtbar nur „50 km" in ≥ 12 Stellen (`sections/header-group.json:481`, `tp-topbar.liquid:77`, `tp-start-trust.liquid:79`, `tp-zwei-wege.liquid:328`, `tp-service-einstieg.liquid:150`, `tp-verlegegebiet.liquid:904`, `vinylboden-verlegen.liquid:379`, `treppenverlegun.liquid:525`, `templates/index.json:156,838,841`, `product.rolle.json:632`, `product.planken.json:303`, `product.json:332`, `page.boden-malerarbeiten.json:269`, `page.treppenverlegung.json:66`, `page.vinylboden-verlegen.json:20`). 649 € hart in `templates/index.json:840`. Keine Theme-Einstellung.
- **Google-Bewertung:** zentral über `settings.tp_google_wert/-anzahl/-link` (`blocks/tp-bewertungsbeleg.liquid:24-29`, Schema `config/settings_schema.json:2526-2540`), aber in `config/settings_data.json` **nicht gesetzt** → Repo-Stand rendert keinen Wert (Live zeigt 4,9 / 240, Wert liegt also nur im Theme-Editor).
- **Telefonnummer:** ~25 Fundstellen, vier Schreibweisen (`03301 573 37 20`, `03301 5733720`, `03301 / 573 37 20`, `03301 / 5733720`), `tel:+4933015733720` einheitlich; Zweitnummer 0176 … nur in `snippets/tp-kontakt-nav.liquid:25`. Keine zentrale Einstellung.
- **Öffnungszeiten:** vier Formate (`tp-topbar.liquid:58`, `header-group.json:462`, `tp-start-kontakt.liquid:111`, `templates/index.json:989`, `contact-form.liquid:191`, `header.liquid:322-323,358-359`).
- **Versandschwelle:** `settings.tp_versand_frei_ab` (`settings_schema.json:2320`) gelesen in `blocks/tp-service-links.liquid:49`, `snippets/cart-summary.liquid:259`, in `settings_data.json` leer; hart „50 €" in `blocks/tp-rollware-rechner.liquid:355`, `snippets/tp-preisangabe.liquid:5`; Platzhalter `[versandfrei]` an 11 Stellen (u. a. `header-group.json:468`, `templates/index.json:835`) – Live zeigt „ab 50 €", d. h. Auflösung passiert im Theme-Editor-Stand, nicht im Repo.
- **Lieferzeit:** „5–7 Werktage" (`product.json:81`, `product.rolle.json:534`, `product.fliese.json:211`, `product.planken.json:211`, `product.fixpreis.json:239`, `product.zubehoer.json:251`, AGB `page.agbs.json:93`) vs. „3–5 Werktage" (`product.teppich.json:266`).

### 1.4 „So rechnen wir" / interne Hinweise
- `blocks/tp-einfass-konfigurator.liquid:236-245` – Aufschlüsselung 2026-09-20 entfernt (sauber).
- `blocks/tp-rollware-anzeige.liquid:2,36-40` – Rechenweg B × L, Preis/m² weiterhin kundensichtbar (Block startet `hidden`).
- `blocks/tp-farbanzeige.liquid:76-85,205` – „Interne Farbnummer" als Tooltip im DOM (Setting `show_nummer`).
- `snippets/tp-farbe-properties.liquid:31-59` – interne Farbbezeichnung als Line-Item-Property; Prüfen, ob `_`-Präfix.

### 1.5 Produkt-Templates (8) und Blockreihenfolge
product.json (Paketware): text/price · tp-vorteile · tp-bewertungsbeleg · divider · color-swatch-picker · variant-picker · tp-farbanzeige · tp-muster-cta · paket-auswahl · tp-service-links · tp-compare-toggle · OPC-App-Rechner · tp-verlegen-lassen · buy-buttons · tp-teppich-groessenvorschau · tp-verkaufstext · tp-produktinfo-tabelle · text.
product.rolle.json: text/price_custom · bewertungsbeleg · divider · (tp-step, farbanzeige, swatch) · muster-cta · **tp-rollware-rechner** · buy-buttons · danach roll-order-help, service-links, verlegen-lassen, vorteile, vertrauen, produktinfo.
product.teppich.json: text/price · teppich-vorteile · bewertungsbeleg · swatch · variant-picker · farbanzeige · muster-cta · **tp-teppich-wunschmass** · OPC-App · buy-buttons · teppich-versand · auf-einen-blick.
product.planken.json / product.fliese.json: tp-product-h1 · price · vorteile · bewertungsbeleg · swatch · variant-picker · farbanzeige · muster-cta · paket-auswahl · service-links · compare · OPC-App · (planken: verlegen-lassen) · buy-buttons.
product.fixpreis.json (Leisten): text/price · leisten-kurzinfo · bewertungsbeleg · leisten-farbwahl · variant-picker · leisten-vorschau · muster-cta · OPC-App · zubehoer-menge · buy-buttons · service-links · leisten-details.
product.zubehoer.json: text/price · bewertungsbeleg · groessen-auswahl · swatch · variant-picker · farbanzeige · muster-cta · zubehoer-menge · buy-buttons · service-links.
product.einfassung.json: text/price_custom · bewertungsbeleg · tp-step · swatch · farbanzeige · teppich-struktur · muster-cta · **tp-einfass-konfigurator** · buy-buttons · einfass-wechsel · vertrauen · vorteile · service-links · produktinfo.
Inkonsistenz: `tp-product-h1` nur bei planken/fliese, sonst generischer `text`-Block als H1. Reihenfolge weicht von Auftrag § 9 ab (Bewertung vor Preis ok; Beratung/Verlegung liegen vor Kaufen; Nutzen/technische Daten/Lieferung/FAQ uneinheitlich).

### 1.6 Relevante Dokumente
`domains/shopify/produktimport-arbeitsweise.md` (Namensregeln vor Import), `farbverwaltung.md` (Kunde „Grau Anthrazit", intern „– 4381"; Option/Metafeld/SKU-Suffix), `invariants.json` (Fallback-Theme-Schutz), `google-feed-flaechenware.md` (Flächenware im Google-Kanal, nicht umgesetzt), `rechner-zuordnung.md` (welcher Rechner auf welcher PDP, 401 Produkte geprüft), `teppich-nach-mass.md`, `zubehoer-struktur.md`, `linoleum-rollenware-template.md`, `schnellsuche.md`, `aktionssystem-konzept.md`, `domains/lieferanten/README.md`+`AUSGELAGERT.md` (Pseudonyme, Rohdaten außerhalb Repo), `docs/MARKENSTRATEGIE.md` (eine Hausmarke), `docs/analyse/florhoehen-evidenzaudit-2026-09-21.md`.

## 2. Kaufprozess: Warenkorb, Muster, Beratung, Verlegeservice, Rechner, Mails

### 2.1 Warenkorb – vorhanden, stark angepasst
`templates/cart.json` → `sections/main-cart.liquid` mit `_cart-title/_cart-products/_cart-summary`; Kern `snippets/cart-products.liquid` (978 Z.), `snippets/cart-summary.liquid` (653 Z.); Drawer aktiv (`settings_data.json:58-59`). TP-Eigenbau: `tp-cart-artikelzahl` (eigene Artikelzahl), `tp-cart-flaeche` („10,00 m²" statt Menge 1000), `tp-cart-paketzeile` („4 Originalpakete · 20,00 m²"), `tp-cart-muster-bild` (`_Muster_ID`), `tp-cart-gruppe` + `tp-cart-gruppen.js` (Gruppen/Sperren, Checkout-Sperre bei Waisen/inkonsistentem Zuschnitt). Position zeigt Titel, Variante, Farbe/Farbnummer, Maße/Einfassung, Fläche, Paketzahl, Preis, Aktionsbadge.
Cart-Attribute: nur `Zuschnitt <Gruppe>` via `/cart/update.js` (`assets/tp-zuschnitt-abgleich.js:18,27-60`). **Notizfeld abgeschaltet** (`show_cart_note: false`). **Telefon-, Beratungs-, Maßprüfungs-, Verlegeanfrage-Felder: fehlen.**
Cross-Sell: Cart-Seite hat `product-list` „Passend dazu" (Kollektion bodenleisten, 4 Produkte); **Drawer ohne Empfehlung**; kein projektbezogener Vorschlag.

### 2.2 Express-Checkout – teilweise
Cart: `cart-summary.liquid:311-318` rendert `content_for_additional_checkout_buttons`, wenn `settings.show_accelerated_checkout_buttons` (nicht explizit gesetzt → Default). PDP: `blocks/accelerated-checkout.liquid:23` `payment_button`. Raten `blocks/price.liquid:106`, `price_custom.liquid:113`. Wallets aktiv: Shop Pay, Apple Pay, Google Pay. → Jede Pflichtabfrage im Cart wäre über Express umgehbar.

### 2.3 Muster – vorhanden
`/pages/muster` (`sections/tp-sample-checkout.liquid`, `assets/tp-sample-checkout-core.js`, `tp-sample-checkout.js`, `tp-sample-request.js`). Limit 3 (`core.js:3`, Zählung über `_Muster_ID`, Meldung `:137-145`). Properties `_Muster_ID`, `_Quellprodukt`, `_Quellprodukt_ID`, `_Quellvariante_ID`, `_Produktlink`, `_Bild`, `Farbe`. SKU-Modell: seit 2026-09-16 je Qualität ein Musterprodukt, Variante je Farbe, SKU `M-<Quell-SKU>`, 0,00 €, UNLISTED (`domains/shopify/benachrichtigungen/musterartikel.md`); Code unterstützt Altmodell `TP-MUSTER-000` als Fallback (`core.js:120-165`). Einstiege: `snippets/tp-musteroption.liquid` (Entscheidung Musterseite vs. Kontakt), aufgerufen aus `tp-muster-cta`, `tp-card-actions`, `color-swatch-picker`, `tp-teppich-versand`, `tp-leisten-farbwahl`, `tp-start-muster`. Tracking `tp-funnel-events.liquid:136`.

### 2.4 Verlegeservice / PLZ – vorhanden
`sections/tp-verlegegebiet.liquid` + `assets/tp-verlegegebiet.js`, Offline-Tabelle `assets/tp-verlegegebiet-orte.json` (Mittelpunkt Oranienburg, max 90 km), Radius 30–50 km (`:30`), Premium-Zonen `settings.tp_vs_radius_premium`. Außerhalb: keine Sackgasse – Hinweis „versenden wir trotzdem deutschlandweit" + Anfrage-Link (`:82`, `:206`). Weitere: `tp-vs-berechtigt`, `tp-vs-preis`, `tp-verlegeservice-stufen`, `blocks/tp-verlegeservice-hinweis`, `tp-verlegen-lassen`.

### 2.5 Rechner – vorhanden (`domains/shopify/rechner-zuordnung.md`)
| Rechner | Datei | Properties | Validierung |
|---|---|---|---|
| Rollenrechner | `blocks/tp-rollware-rechner.liquid` (2235 Z.) | Art, Ihre Breite, Aus Rolle, Rollenbreite, Gewünschte Länge, Fläche(/aufgerundet), Farbnummer, _Farbe intern, _Gruppe | Länge 100–5000 cm, Lagerprüfung |
| Paketrechner | `paket-auswahl`, `tp-paketinhalt`, `tp-cart-paketzeile` | keine (aus quantity × qm_pro_paket) | – |
| Einfass/Kettel | `assets/tp-einfass-konfigurator.js` (837 Z.) | Maße, Einfassung, Bandfarbe, Garn, Vlies, Farbnummer, Fläche (abgerechnet), Mindestpreis, _Zuschnitt…, _Gruppe | max_breite/laenge, Mindestpreis auftragsbezogen |
| Teppich nach Maß | `blocks/tp-teppich-wunschmass.liquid`, `assets/tp-masstepich-rechnung.js` | Durchmesser/Seitenlänge/Breite+Länge, Farbe | Länge ≤ 0 Fehler, Min/Max aus Metafeldern, Mindestpreis über Menge |
| Zubehör-Menge | `blocks/tp-zubehoer-menge.liquid` | keine | still ohne Mengenquelle |
| Zuschnitt-Abgleich | `assets/tp-zuschnitt-abgleich.js` | Cart-Attribut `Zuschnitt <Gruppe>` | fail-closed UI-Sperre |
Grenze (dokumentiert `tp-cart-gruppe.liquid:21-24`): Sperren wirken nur im UI, keine Checkout-Validation-Function (Inhaberentscheidung #357). Alte Audit-Befunde TP-001…TP-017 (Branch `audit/shop-audit`) betreffen genau diese Rechner/Cart-Pfade.

### 2.6 E-Mails – nur interne Mail im Repo
`domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid` (Mitarbeiterbenachrichtigung „Neue Bestellung": Telefon, Adresse, je Artikel SKU + Großhändler-ID, Maßprüfung `:29-41`), `README.md`, `musterartikel.md`, `bestelldokumente.md` (Lieferschein kennt keine Properties). **Fehlen:** eigene Musterbestätigung, angepasste Kunden-Bestellbestätigung, Versandbestätigung – Kundenvorlagen bewusst unberührt.

### 2.7 Flow / Tags – fehlt
Flow nicht installiert; kein `TYP-*`, `BERATUNG-*` im Repo; Planung nur in `docs/kundenbindung/automationen.md` (Kunden-Tags für Muster-Nachfassen).

### 2.8 Kundenkonto / Bestellstatus – Horizon-Standard, keine Anpassung
Kein `templates/customers/`, keine `sections/customer*`. Offen laut `domains/lieferanten/services/HANDOFF.md:91,104`.

## 3. Tracking, Consent, Ads, Feed

### 3.1 Dokumentierter Stand
| Baustein | Status | Beleg |
|---|---|---|
| Google-Tag GT-NBPR47T2 über Google-&-YouTube-Kanal | vorhanden | `domains/marketing/google-ads-startvorbereitung.md:14` |
| Consent Mode v2 (default + update) | vorhanden, gemessen 2026-09-16 | ebd. `:15-16,243` |
| GA4 Mess-ID | fehlt im Repo („kommt vom Inhaber") | `docs/shop-decisions.md:27`, `qa/TRACKING_READINESS.md:6` |
| Ads-Conversion-Aktionen | offen | `google-ads-startvorbereitung.md:39-40,104-117` |
| Google & YouTube App, 225 Produkte | vorhanden, **0 approved, 225 awaiting_review** | `docs/google/tracking-und-feed-validierung-2026-09-11.md:15,131-134` |
| Web Pixel | 1 App-Pixel + 1 Custom Pixel, Inhalt unbekannt (Scope fehlt) | `TRACKING_REPORT.md:18,27` |
| Consent-Banner | Shopify-nativ | `TRACKING_REPORT.md:20` |
| Purchase-Tracking | nicht belegt | `docs/google/…:14,50` |
Widersprüche im Repo: `automation/scripts/google-ads-phase-4-1-conversion-tracking.md` beschreibt GTM+GA4, GTM existiert nicht; `verify-google-ads-tracking.mjs` prüft nicht existierende Dateien (als wertlos markiert `docs/google/…:198-200`).

### 3.2 Theme-Events (eigene)
Kein gtag/GTM/fbq/ttq/hotjar/clarity im Theme. `snippets/tp-lead-events.liquid` (tp_lead_call, _whatsapp, _mail, _contact_click, _form_submit) und `snippets/tp-funnel-events.liquid` (tp_farbe_gewaehlt, tp_masse_eingegeben, tp_muster_cta_klick, tp_ratgeber_cta_klick, tp_muster_im_warenkorb, tp_in_den_warenkorb_konfiguriert, tp_rabattcode_eingegeben, tp_newsletter_*), beide via `Shopify.analytics.publish` + `dataLayer.push`, eingebunden `layout/theme.liquid:163-164`.
Soll-Abgleich: view_item/begin_checkout/purchase/add_to_cart nur Shopify-Standard; **fehlen ganz:** select_item, view_item_list, search (`assets/tp-suche.js:23-24` bewusst ohne Events), sample_order, measure_complete, consultation_yes/no, measurement_review, installation_request. Custom Pixel-Vorlage `docs/kundenbindung/funnel-events.md:48-60` mit Platzhalter `G-XXXXXXXXXX`, nicht eingerichtet.

### 3.3 Cookie-Banner
Shopify-nativ, Theme nutzt `consent-tracking-api` (`sections/google.liquid:21-40`, `tp-start-bewertungen.liquid:37-46`, `tp-funnel-events.liquid:57-72`). Doppelinstallation nicht ausgeschlossen (App-Pixel + Custom Pixel, Kauf-Conversion evtl. doppelt aus Google-App und GA4-Import).

### 3.4 Feed / Merchant Center
Feed-Preis = Variantenpreis = **Paketpreis**, €/m² als Einheitspreis (236 Paketvarianten). Rollenware/Wunschmaß bewusst aus dem Feed ausgeschlossen (`GOOGLE_ROLLENWARE_EXCLUSION_PLAN.md`, `google-feed-flaechenware.md:20-31`). Kein eigener Feed-Generator; Titel/Beschreibung 1:1 aus Shopify. `mm-google-shopping.*` im Theme ungenutzt. Mängel: 225/225 ohne GTIN und ohne `custom_product`-Kennzeichnung, 8 doppelte SKUs an 16 Produkten, 41 Klebevinyl ohne SKU, 2 Produkte mit falschem Einheitspreis-Maß (`verona-terrazzo-*`), Versandrichtlinie 404.

### 3.5 Strukturierte Daten
`snippets/tp-product-structured-data.liquid:143-170` ProductGroup/Product/Offer (brand = vendor = Produktlinie, sku, Preis nur als UnitPriceSpecification MTK, availability, seller); Fallback `structured_data` für Nicht-Flächenware; BreadcrumbList (`product-information-content.liquid:149-163`, `tp-breadcrumb.liquid:169-178`); LocalBusiness/Store + WebSite in `sections/header.liquid:325ff,397ff`. **gtin/mpn nie gesetzt**, shippingDetails/hasMerchantReturnPolicy bewusst weggelassen (`google-ads-startvorbereitung.md:42-51`). brand enthält keinen Lieferantennamen; 2 Klickvinyl mit Vendor „TeppichParadies" als Ausreißer.

### 3.6 UTM / Newsletter
UTM nur als Kampagnen-Vorlage dokumentiert (`automation/scripts/google-ads-phase-4-2-utm-parameters.md:30-80`), kein Theme-Code. Newsletter: Shopify-Formular, Double-Opt-in, Kunden-Tag `quelle-footer`, kein Versandtool (bewusst, `docs/shop-decisions.md:27`). Attributionslücke belegt (`docs/google/…:82-85`).

## 4. SEO, Performance, Mobile, vorhandene Audits

### 4.1 Vorhandener Audit (`audit/`, Stand main 20.09. / Branch `audit/shop-audit` 22.09.)
Ausschließlich Preis-/Rechner-/Cart-Pfade belastbar (PR-001…PR-023b, CART-002…004, VAR-001a). 17 bestätigte Issues TP-001…TP-017 (P2: 8, P3: 9, keine P0/P1), alle offen; Fix-Pack `FIX_PACK_02_PRICING_INPUTS` (TP-001/002) READY, keiner umgesetzt. `audit/SEO.md`, `PERFORMANCE.md`, `UX.md` sind Platzhalter. Live seit 19.09. dort nicht neu verifiziert. Kernpfade und Konfliktdateien: `blocks/paket-auswahl.liquid`, `blocks/tp-rollware-rechner.liquid`, `blocks/tp-einfass-konfigurator.liquid`, `assets/tp-einfass-konfigurator.js`, `blocks/tp-teppich-wunschmass.liquid`, `assets/tp-cart-gruppen.js` (HIGH RISK laut `audit/DEPENDENCY_MAP.md`).

### 4.2 Weitere Zustandsdokumente
`SHOPIFY_MASTER_ROADMAP.md`, `CURRENT_STATE.md`, `docs/shop-current-state.md`, `docs/shop-backlog.md`, `docs/shop-offene-fragen.md`, `qa/MERCHANT_READINESS_REPORT.md`, `QA_REPORT.md`, `SEO_REPORT.md` (11.09.: 0 ERROR / 20 WARN, v. a. TOUCH_TARGET 17–24 px), `docs/analyse/qualitaet-erstbefund-2026-09-11.md` (einziger Lighthouse-Bericht), `TRACKING_REPORT.md`.

### 4.3 SEO im Theme
`snippets/meta-tags.liquid` stark angepasst (Titelkürzung 45 Z., „online kaufen" bis 60 Z., Admin-SEO-Titel Vorrang, Cart gesiezt), Canonical `:278`, Blog-Tag-Seiten `noindex,follow`, OG-Image-Fallbackkette, keine `robots.txt.liquid`/Sitemap-Anpassung, keine Redirect-Doku. Breadcrumb `snippets/tp-breadcrumb.liquid` nur für collection/page (`layout/theme.liquid:147`), Ratgeber separat. H1 Produkt: `blocks/tp-product-h1.liquid` (nur planken/fliese), Kollektions-H1 verstreut in ~20 `sections/tp-*hero*.liquid`.

### 4.4 Performance (Lighthouse 13.4.1, 2026-09-11, je ein Lauf)
| Seite | Score Perf | LCP | CLS | Gewicht |
|---|---|---|---|---|
| Start Desktop live | 89 | 2,1 s | – | 4,8 MB |
| Start Desktop Entwurf | 87 | 1,3 s | 0,174 → 0,015 nach Lazy-Megamenü | |
| Start/Kategorie Mobil | 52–58 | 5,1–7,6 s | – | Kategorie 4,7 MB, 286 Requests, 452 img, DOM 4.455 |
Varianz derselben Seite 4,4–11,6 s LCP. Third-Party im Layout: keine; alles über `content_for_header` (Pixel/Apps). Eigene Scripts: `tp-carpet-navigation.js` defer + zwei Inline-Blöcke. Mobil geladene 832-px-Bilder (~1,4 MB Einsparpotenzial) dokumentiert.

### 4.5 Mobile / Sticky
`sections/tp-sticky-kontakt.liquid`: fixed bottom, z-index 55, nur ≤ 767 px, nach erstem Scroll, Telefon/WhatsApp/Anfrage, auf `cart`, `product`, `search` deaktiviert, `body padding-bottom 70px`. Weitere fixed/sticky: `tp-compare-bar`, Header, Header-Suche, `product-information` (Kaufleiste), `_cart-summary`, `filters`, Drawer, Search-Modal, `live-chat-widget.css`. Cookie-Banner nicht theme-eigen (über `content_for_header`); kein Befund zu Überdeckung dokumentiert – muss gemessen werden. Test `qa/tests/rechner-sticky-leiste.test.mjs` existiert.

### 4.6 Testsuiten
`npm test` (= `qa:unit:test` ~37 Node-Tests: Cart-Gruppen, Mengensperre, Paketvalidierung, Maßteppich, Rollware, Bestellmail-Maßprüfung, Guards + `dashboard:test`), `npm run qa` (Theme Check + Desktop/Mobile-Smoke gegen Live → `QA_REPORT.md`), `seo:check` → `SEO_REPORT.md`, `sales:check` (Paket/Rolle/Muster ohne Kaufabschluss), `compare:check`, `automation:test`, `workflow:test`, `control:center:test`, Guards `liquid/schema/template/theme/menu/farbcode/unmerged/essential/secret:scan/pr:doctor`.
