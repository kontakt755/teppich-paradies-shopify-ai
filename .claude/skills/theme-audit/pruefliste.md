# Pruefliste Theme-Audit

Kennungen wie im Upstream (Theme-Audit-Skill: `C`, `H`, `M`, `L`, `S-`, `R-`,
`AEO-`, `GEO-`, `APP-`; Schema-Audit-Skill: `SD-<Nr>`), damit Befunde
rueckverfolgbar bleiben. Spalte **Bei uns** sagt, welches Werkzeug den Punkt
schon prueft - dann nur dessen Ergebnis uebernehmen.

Schwere: K = kritisch, H = hoch, M = mittel, N = niedrig (Upstream: -10/-5/-2/-1).

## 1. Technik, Performance, Barrierefreiheit

| ID | Pruefen | Wo | Schwere | Bei uns |
|---|---|---|---|---|
| C1/H1 | `<script src>` ohne `defer`/`async`/`type="module"` (ausser ld+json, importmap) | `layout/theme.liquid`, `snippets/scripts.liquid`, Sections | K/H | Theme Check `ParserBlockingScript` (`themecheck:guard`) |
| C2 | veraltete Filter `img_url`, `img_tag`, `product_img_url`, `money_format`, Tag `include` | alle `.liquid` | K | Theme Check `DeprecatedFilter`/`DeprecatedTag` |
| C3 | Bilder unterhalb des sichtbaren Bereichs ohne `loading="lazy"`; LCP-Bild darf NICHT lazy sein | Sections, Karten | K | `seo:check` `IMAGE_EAGER_BELOW_FOLD` (nur Gegenrichtung) |
| C4 | Metafeld-Zugriffe in Schleifen ueber viele Produkte | Kollektions-Sections, Karten | K | `docs/lessons/renderzeit-kollektionsseite.md`, `teppich:basis-daten` |
| C5 | Skip-Link als erstes fokussierbares Element | `layout/theme.liquid` | K | - |
| C6 | `<img>` ohne `width`/`height` (CLS); auch per `echo` gebaute Tags, die Theme Check nicht sieht | Snippets | K | Theme Check `ImgWidthAndHeight` (nur statische Tags), `seo:check` `LAYOUT_SHIFT` |
| C7 | `json`-Metafelder ueber 128 KB (Schreibgrenze ab API 2026-04), in Functions ueber 10 000 Byte | Admin-API, nur lesend | K | - |
| H3 | LCP-Bild frueh auffindbar (`fetchpriority="high"`, ggf. `<link rel="preload">`), besonders wenn viel HTML davor steht | Hero-Sections | H | `lighthouse:messen` |
| H4 | globales CSS/JS gross; bei uns zusaetzlich: HTML-Gewicht vor `<main>` (Kopf, Mega-Menue) | Live-HTML | H | `seo:check` `LARGE_RESOURCE` (Ressourcen, nicht HTML) |
| H5 | Fokusfalle in Warenkorb-Drawer und Dialogen | `snippets/cart-drawer*`, Dialoge | H | - |
| H6/S-H7 | Canonical bei `?page=`: selbstreferenzierend ist Googles Empfehlung; auf Seite 1 nur mit Grund | `snippets/meta-tags.liquid` | H | `seo:check` `CANONICAL_*` |
| M2/S-H5 | `alt` fehlt; `alt=""` nur fuer Deko | alle Bilder | M | `seo:check` `IMAGE_ALT_MISSING` |
| M3 | feste Farben in `style=""` statt Einstellungen/Variablen | Sections | M | `schrift:guard` (nur Schriftgroessen) |
| M6 | Suche ohne Treffer: Vorschlaege statt leerer Seite | `sections/search*` | M | - |
| L1-L6 | `console.log` in Assets, grosse auskommentierte Bloecke, 404 ohne Suche, Footer ohne Vertrauenselemente | `assets/`, Sections | N | - |

## 2. Klassisches SEO

| ID | Pruefen | Schwere | Bei uns |
|---|---|---|---|
| S-C1/S-C2 | genau ein `<title>`, Meta-Description je Seitentyp (auch Richtlinienseiten `/policies/*`) | K | `seo:check` `TITLE_*`, `META_DESCRIPTION_*` |
| S-C3 | Canonical vorhanden, absolut, Hauptdomain | K | `seo:check` `CANONICAL_*` |
| S-C4 | `robots.txt.liquid` reicht `robots.default_groups` durch und sperrt die Sitemap nicht | K | - |
| S-H1/S-H2 | ein `<h1>`, Ueberschriften ohne Spruenge | H | `seo:check` `H1_COUNT` |
| S-H3/S-H4 | Open Graph (`og:title`, `og:description`, `og:url`, `og:type`, `og:image` samt Breite/Hoehe) und Twitter Card | H | - |
| S-H6 | `hreflang` nur bei mehreren Maerkten/Sprachen | H | - (vorher klaeren, ob mehr als ein Markt/eine Sprache veroeffentlicht ist) |
| S-M5 | `noindex`/Sperre fuer Suche, Warenkorb, Konto | M | `seo:check` `NOINDEX_UNCLEAR`, `UNEXPECTED_NOINDEX` |

## 3. Abrufbarkeit fuer KI-Suche (zuerst pruefen)

| ID | Pruefen | Schwere |
|---|---|---|
| R-C1 | Live-`/robots.txt`: Such-Crawler `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` nicht gesperrt (auch nicht ueber `User-agent: *`). Trainings-Crawler (`GPTBot`, `ClaudeBot`, `CCBot`) sind eine eigene Entscheidung des Inhabers, kein Befund. Ohne eigene Eintraege gilt `*` - das ist kein Fehler. | K |
| R-C2 | Jede Kauf-Frage hat eine eigene, als Text gerenderte Seite auf der Domain: Versand/Lieferzeit, Widerruf/Rueckgabe, Muster, Verlegung, Pflege, Rollenbreiten/Masse, Ueber uns. Nicht nur als Bild, PDF oder per Klick nachgeladenes Akkordeon. | K/H |
| R-C3/R-H2 | Bewertungen, Merkmale, Preise stehen im rohen HTML, nicht nur in einem Fremd-Widget per JavaScript | K/H |
| R-H1 | Sitemap in Bing Webmaster Tools eingereicht (Inhaber-Aufgabe, kein Theme-Code) | H |

## 4. Strukturierte Daten (JSON-LD)

Bei uns: `snippets/tp-product-structured-data.liquid` (ProductGroup),
`sections/header.liquid` (Organization/LocalBusiness, WebSite),
`snippets/tp-breadcrumb.liquid`, `snippets/product-information-content.liquid`
(BreadcrumbList), `snippets/tp-faq-*structured-data.liquid` (FAQPage),
`snippets/tp-ratgeber-structured-data.liquid` (Article). Gueltigkeit und
Offer-Felder prueft `seo:check` (`JSONLD_INVALID`, `OFFER_*`,
`PRODUCT_SCHEMA_*`, `BREADCRUMB_SCHEMA_DUPLICATE`); Tests unter
`qa/tests/produkt-jsonld-*`.

| ID | Pruefen | Schwere |
|---|---|---|
| SD-1 | `ProductGroup` mit `hasVariant` fuer Mehrvarianten-Produkte | K |
| SD-3 | `brand` als `@type: Brand`, Schreibweise wie die Marke im Shop | M |
| SD-5/6/9c | jedes Offer mit `price` als Zahl, `priceCurrency` aus `cart.currency.iso_code`, `availability` als schema.org-URL | K |
| SD-9b/31 | GTIN nur geprueft (Laenge, Pruefziffer) und mit passender Eigenschaft (`gtin8/12/13/14`) | N |
| SD-10..13 | `aggregateRating` nur mit echter Bewertung > 0, Werte numerisch; nie Google-Unternehmensbewertung am Produkt | K |
| SD-14..18 | FAQPage nur mit sichtbaren Fragen, Antwort als reiner Text (`metafield_text` statt `strip_html` auf Richtext), Kommas per `forloop.last` | K |
| SD-19..21 / GEO-H1 | Organization: `logo` dynamisch, `sameAs` ohne leere Eintraege, eine feste `@id`, auf die andere Knoten verweisen | H |
| SD-22..23c / GEO-H2 | BreadcrumbList auf Produkt, Kollektion, Seite, Artikel; Positionen fortlaufend; `item` absolut; Hierarchie mit Kategorie | H |
| SD-24 | `@context` ueberall `https://schema.org` | N |
| SD-25/29f | keine fest verdrahteten Domains, `@id` ohne doppelte Domain | H |
| SD-27 | dynamische Strings immer mit `| json` | K |
| SD-29a/29b | keine zweite Quelle fuer denselben Typ (SEO-App, Bewertungs-App, Microdata `itemscope` neben JSON-LD) | K |
| SD-39..42 / GEO-M1 | `hasMerchantReturnPolicy`, `shippingDetails` im Offer. Werte nur aus Rechtstexten/Versandeinstellungen; Merchant-Center-Einstellungen gehen bei Google vor | M |
| AEO-H1 / GEO-M2 | technische Merkmale als `additionalProperty` (PropertyValue) gleich der sichtbaren Tabelle | H |
| AEO-C2 | Produktseite beginnt mit sachlicher Ein-Satz-Beschreibung (Meta-Description, erster Absatz) | M |
| AEO-H4/AEO-M1 | Artikel mit `author`/`publisher` (Verweis auf Organization-`@id`) und `dateModified` | M |

Nicht uebernommen: `llms.txt` (kein messbarer Nutzen, Upstream selbst
zurueckgestuft), `Speakable`, `HowTo`-Pflicht, "FAQ-Schema ist das wichtigste
Signal".

## 5. Apps und Fremdskripte

Erkennung im Live-HTML ueber Fremd-Origins (`<script src>`, `<link href>`).
Shopify selbst (`cdn.shopify.com`, `shop.app`, `monorail-edge.shopifysvc.com`,
Web-Pixel-Manager in `content_for_header`) nicht als App-Last werten.

| ID | Pruefen | Schwere |
|---|---|---|
| APP-C1 | Fremdskript synchron im `<head>` | K |
| APP-C2/C3 | Chat- oder Popup-Skript sofort auf jeder Seite statt nach Interaktion | K |
| APP-C4 | mehr als fuenf Fremd-Origins beim ersten Laden (Schwelle des Upstream-Audits) | K |
| APP-C6 | Barrierefreiheits-Overlay (accessiBe, UserWay, AudioEye, EqualWeb) | K |
| APP-H1 | Bewertungs-Widget ohne reservierte Hoehe ueber dem Kaufbereich | H |
| APP-H2/H7 | zwei Apps fuer denselben Zweck; doppeltes Tracking (Web-Pixel und fest eingebautes Skript) | H |
| APP-L2 | Reste deinstallierter Apps in `layout/`, `snippets/`, `config/settings_data.json` | N |
