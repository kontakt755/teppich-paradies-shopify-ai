# Theme-Audit 2026-10-16

Erster Lauf des Projekt-Skills `theme-audit` (`.claude/skills/theme-audit/`),
dazu die Bewertung der vier auf GitHub gefundenen Kandidaten.

- **Stand:** `origin/main` bei `e08da36f`, Live-Shop am 2026-10-16 zwischen 06:45 und 07:00 UTC
- **Modus:** voll, nur lesend (kein Edit, kein Push, keine Shopify-Schreibzugriffe)
- **Live gemessen (rohes HTML per curl):** Startseite, `/collections/teppichboden`,
  zwei Produktseiten (Teppichboden-Meterware, Teppichfliese als Paketware),
  `/pages/versand-lieferung`, `/policies/refund-policy`, `/policies/shipping-policy`,
  `/robots.txt`, `/sitemap.xml`
- **Admin-API (nur lesend):** `json`-Metafelddefinitionen und Stichprobe ihrer Groesse

## 1. Kandidaten aus der GitHub-Suche

Alle vier mit `git clone --depth 1` in einen leeren Ordner ausserhalb des
Repositorys geholt und vollstaendig gelesen, bevor irgendetwas weiterverwendet
wurde. Ausgefuehrt wurde aus den Kandidaten nichts.

| Kandidat | Commit | Lizenz, Pflege | Inhalt und Risiko | Entscheidung |
|---|---|---|---|---|
| tanujrajputdev/shopify-theme-audit-skill | `dbc583de` (2026-08-21) | MIT, 41 Sterne, 17 Commits, aktiv korrigiert (v2.3) | Nur Markdown: Pruefliste Performance/Barrierefreiheit/CRO, SEO/AEO/GEO, App-Last, Bewertungsschema. Keine Skripte, Hooks, Netzzugriffe. Schwaechen: Werbung im README, unbelegte Zahlen zur ChatGPT-Suche (August 2026), Code-Vorlagen "woertlich einfuegen" mit Beispielwerten (30 Tage Rueckgabe, Versand 0 USD), Canonical-Empfehlung fuer `?page=` gegen Googles Empfehlung. | **Uebernommen** (angepasst) |
| yanpantoja/shopify-schema-audit | `6ac44c03` (2026-04-14) | MIT, 0 Sterne, 8 Commits | Nur Markdown: 47 Pruefpunkte fuer JSON-LD und Open Graph, nennt Horizon ausdruecklich, praxisnahe Fallen (Preis als Zahl, absolute `item`-URLs, doppelte Quellen durch Apps). Schwaechen: `llms.txt` als Pruefpunkt, "nur `structured_data`-Filter" pauschal als Mangel. Kein Risiko. | **Uebernommen** als Abschnitt 4 der Pruefliste (Kennungen `SD-`) |
| plazorax/shopify-theme-agent-kit | `5acd8812` (2026-10-13) | MIT, 0 Sterne, 4 Commits, v0.1.0, laut eigener Doku nie in einer echten Sitzung gelaufen | Plugin mit PostToolUse-Hook (startet nach jedem Edit `shopify theme check`, lokal, kein Netz), Reviewer-Agent, Section-Scaffolder, JSON-/Schema-Validator. Code sauber, keine Telemetrie. Ueberschneidet sich fast ganz mit `themecheck:guard` und `schema:guard`; Konventionen passen teils nicht (englische `t:`-Schluessel Pflicht, Inline-`<style>`). Hooks sind fuer diesen Auftrag ausgeschlossen. | **Abgelehnt.** Einziger neuer Gedanke: doppelte Setting-IDs in einem Schema, die Theme Check laut Autor nicht meldet - Kandidat fuer eine spaetere Erweiterung von `schema:guard` |
| cathrynlavery/shopify-developer-skill | `6bf203a8` (2026-02-14) | MIT, 16 Sterne, 3 Commits, seit Februar unveraendert | Statische Referenz zu Admin/Storefront-API, Functions, Webhooks. Prueft entgegen der Beschreibung keine aktuellen APIs. Arbeitet mit Tokens aus `~/.agents/.env` und `curl` (bei uns verboten: Admin-API nur ueber MCP/CLI), nennt veraltete Grenzwerte (100 Varianten, 512 KB je Metafeld, 25 Settings je Section) und `theme push --allow-live` am Deploy-Gate vorbei. | **Abgelehnt.** Aktuelle API-Pruefung leisten bereits der Shopify-MCP (`graphql_schema`, `search_docs_chunks`) und der Plugin-Skill `shopify-plugin:shopify` |

## 2. Ergebnis der vorhandenen Werkzeuge

| Werkzeug | Ergebnis |
|---|---|
| `liquid:guard` | 512 Dateien, 0 Fehler, 0 Warnungen |
| `schema:guard` | 268 Schemata, 0 Fehler, 0 Warnungen |
| `template:guard` | 34 Templates, 0 Fehler, 6 Warnungen |
| `theme:guard` | 0 Fehler, 0 Warnungen |
| `schrift:guard` | 496 Dateien, 0 Fehler |
| `themecheck:guard` | 907 Dateien, 0 Fehler, 54 Warnungen in 17 Dateien |
| `seo:check` (live, 40 Seiten-/Viewport-Pruefungen) | 0 Fehler, 31 Warnungen: 20x `DUPLICATE_SCRIPT` (Befund N4), 10x `TOUCH_TARGET` (Desktop-Stichprobe), 1x `NOINDEX_UNCLEAR` Warenkorb (durch `Disallow: /cart` in robots.txt abgedeckt) |
| `lighthouse:messen` | nicht gelaufen (25 min); fuer Befund M1 empfohlen |

## 3. Befunde

Keine kritischen, keine hohen Befunde. Punktzahl nach Upstream-Schema
(100 minus 2 je mittlerem, 1 je niedrigem Befund, plus 5 ohne kritische):
**96/100**. Nur zum Vergleich mit spaeteren Laeufen gedacht.

### Mittel

**M1 - HTML-Gewicht vor `<main>` (H3/H4, Schwelle dieses Audits)**
Ort: Live-HTML aller Seitentypen; `sections/header.liquid`, `snippets/mega-menu-list.liquid`, `snippets/tp-vinyl-nav.liquid`
Messwerte (roh / gzip): Startseite 734 KB / 108 KB, `/collections/teppichboden`
1,14 MB / 129 KB, Teppichboden-Produktseite 795 KB / 142 KB. Vor `<main>`
stehen auf jeder Seite 355-400 KB. Davon sind rund 137 KB der
Web-Pixel-Loader aus `content_for_header` (Shopify, nicht beeinflussbar), rund
50 KB Farbschemata und `@font-face` (7 Schemata, 10 Schriftschnitte), rund
150 KB Kopf und Mega-Menue (145 Links, 56 Bilder).
Wirkung: Das LCP-Bild steht erst nach etwa 400 KB HTML. Die Hero-Sections
setzen `fetchpriority="high"` richtig, aber der Browser entdeckt das Bild erst
beim Parsen dieser Stelle; ein `<link rel="preload">` gibt es nicht.
Vorschlag: zuerst `npm run lighthouse:messen` (mobil, LCP-Element und
"Discovery"-Zeit). Nur wenn das LCP-Bild spaet entdeckt wird: Preload fuer das
Startseiten-Hero in `layout/theme.liquid`, und pruefen, ob Mega-Menue-Inhalte
fuer Mobil erst beim Oeffnen nachgeladen werden koennen. Ohne Messung nichts
umbauen. Aufwand: Messung 30 min, Umbau halber Tag.

**M2 - Kein `hasMerchantReturnPolicy` / `shippingDetails` im Offer (SD-39..42, GEO-M1)**
Ort: `snippets/tp-product-structured-data.liquid:279-303`
Die Offers tragen Preis, Einheit, Zustand und Verfuegbarkeit, aber keine
Rueckgabe- und Versandangaben. Google bevorzugt die Einstellungen im Merchant
Center; sind Rueckgabe und Versand dort gepflegt, ist das Markup nur ein
Zusatz fuer andere Suchmaschinen und Antwortdienste.
Vorschlag: mit dem Inhaber klaeren. Werte nur aus den Rechtstexten
(Widerrufsfrist, Zuschnitt-Ausnahmen) und den Versandeinstellungen (Grenze
versandkostenfrei), nicht aus Beispielcode. Ob fuer Zuschnittware eine
abweichende Regel ausgezeichnet werden muss, entscheidet der Rechtstext, nicht
das Theme. Aufwand: 1-2 Stunden plus Freigabe.

### Niedrig

**N1 - Marke im Produkt-JSON-LD anders geschrieben als ueberall sonst (SD-3)**
Ort: `snippets/tp-product-structured-data.liquid:326-329` gegen `sections/header.liquid:346` und `snippets/meta-tags.liquid:30`
`brand.name` ist der rohe Vendor, bei Hausware "TeppichParadies". Organization,
Titel und `og:site_name` schreiben "Teppich Paradies" (gleiche `replace`-Regel
an zwei Stellen). Vorschlag: dieselbe Ersetzung auf den Vendor anwenden; der
Vendor in Shopify bleibt unveraendert. Aufwand: 10 min.

**N2 - `@context` mit `http://` (SD-24)**
Ort: `sections/header.liquid:337` - alle anderen Bloecke nutzen `https://schema.org`. Aufwand: 1 min.

**N3 - Zweiter Organization-Knoten ohne `@id` (SD-19..21)**
Ort: `sections/tp-verlegegebiet.liquid:357-361`
Der `provider` des Service-Knotens beschreibt das Unternehmen neu (Name, URL)
statt auf `{{ request.origin }}/#organization` zu verweisen, wie es
`snippets/tp-ratgeber-structured-data.liquid` tut. Vorschlag:
`"provider": { "@id": ... }`. Aufwand: 5 min.

**N4 - `tp-suche.js` zweimal eingebunden (seo:check `DUPLICATE_SCRIPT`)**
Ort: `sections/tp-header-suche.liquid:21` und `snippets/tp-kopf-suche.liquid:27`
Beide als `type="module"` mit gleicher URL - der Browser fuehrt das Modul nur
einmal aus, es kostet also nur Markup und 20 Warnungen je seo:check-Lauf.
Vorschlag: eine Stelle entfernen, wenn beide Suchleisten immer zusammen
rendern; sonst die Warnung im Check als bekannt fuehren. Aufwand: 15 min.

**N5 - Mega-Menue-Bilder ohne `width`/`height` (C6)**
Ort: `snippets/tp-menu-bild.liquid:57`
Das `<img>` wird per `echo` zusammengesetzt, Theme Check sieht es nicht; live
39 Bilder je Seite. Sie liegen im aufklappenden Menue und sind lazy, deshalb
kaum Layout-Verschiebung. Vorschlag: feste Masse der Kachel mitgeben.
Aufwand: 15 min.

**N6 - Richtlinienseiten ohne Meta-Description (S-C2)**
Ort: `/policies/refund-policy`, `/policies/shipping-policy` (von Shopify erzeugt, Kopf aus `snippets/meta-tags.liquid`)
Kein `<meta name="description">`. Vorschlag: Rueckfall in
`snippets/meta-tags.liquid` fuer `request.page_type == 'policy'` mit
neutralem Satz - der Rechtstext selbst bleibt unberuehrt. Aufwand: 15 min.

**N7 - Globo-Mega-Menu-Embed noch aktiv (APP-L2)**
Ort: `config/settings_data.json` (App-Embed `globo-mega-menu`, `disabled: false`)
Gibt live nichts aus (Startseite, Kollektion, Produktseite: kein Treffer im
HTML; deckt sich mit dem Hinweis in `AGENTS.md`). Vorschlag: Inhaber
entscheidet, ob Embed abgeschaltet bzw. App deinstalliert wird. Kein Theme-Code.

## 4. Was gut umgesetzt ist

Diese Punkte bei kuenftigen Umbauten nicht zurueckbauen.

- **Skripte:** kein synchrones Skript im `<head>`; alle Theme-Skripte als Modul
  oder `defer` (`snippets/scripts.liquid`). Keine veralteten Filter oder
  `include`-Tags.
- **Keine Fremd-Apps beim ersten Laden:** auf allen drei Seitentypen nur
  Shopify-Origins (`cdn.shopify.com`, `shop.app`, `monorail-edge`). Das
  Google-Bewertungs-Widget laedt verzoegert (`data-elfsight-app-lazy`) und hat
  einen Text-Rueckfall (`sections/tp-start-bewertungen.liquid`). Kein
  Barrierefreiheits-Overlay.
- **Abrufbarkeit fuer KI-Suche (R-C1/R-C2):** `templates/robots.txt.liquid`
  reicht Shopifys Standardgruppen durch und sperrt nur zusaetzlich `/search`;
  kein Such- oder Trainings-Crawler ist gesperrt. Antwortseiten zu Versand,
  Widerruf, Muster, Verlegung und Ratgeber existieren als Text.
- **Produkt-JSON-LD** (`snippets/tp-product-structured-data.liquid`):
  `ProductGroup` mit einem Offer je Variante, Preis als Zahl, m2-Umrechnung fuer
  Paket- und Rollenware deckungsgleich mit dem Seitenpreis, GTIN mit
  Pruefziffer, `aggregateRating` nur bei echter Bewertung, `additionalProperty`
  gleich der sichtbaren Merkmalstabelle, Service- und Musterprodukte
  ausgeschlossen, `LimitedAvailability` fuer Auslaufware. Live gueltig
  (Zafira: 20 Varianten, Yutona: 8 Varianten, 12 Merkmale).
- **Organization/LocalBusiness** mit fester `@id`, `sameAs` ohne leere
  Eintraege, bewusst ohne fremde Google-Bewertung; `WebSite` nur auf der
  Startseite (`sections/header.liquid:335-451`).
- **BreadcrumbList** mit absoluten URLs und fortlaufenden Positionen
  (`snippets/tp-breadcrumb.liquid`, `snippets/product-information-content.liquid`).
- **Seiten:** genau ein `<h1>`, kein Bild ohne `alt`, sachliche
  Meta-Descriptions ("Zafira Teppichboden in 9 Farben, 400 cm und 500 cm
  Breite ..."), Open Graph und Twitter Card vollstaendig
  (`snippets/meta-tags.liquid`), Skip-Link (`layout/theme.liquid:69`).
- **Canonical:** `?page=` wird nur fuer `teppich-nach-mass` auf Seite 1
  gefuehrt, mit Begruendung im Kommentar (`snippets/meta-tags.liquid:39-47`).
- **`json`-Metafelder (C7):** einzige Definition `custom.teppich_basis_daten`
  (226 Werte); Stichprobe von 50 Werten jeweils unter 1 KB, weit unter der
  128-KB-Grenze.

## 5. Nicht geprueft

- Fokusfalle in Warenkorb und Dialogen (H5) nur am Vorhandensein von
  `assets/dialog.js`/`assets/focus.js` gesehen, nicht bedient.
- Suche ohne Treffer (M6), 404-Seite (L5), Konto-Seiten.
- Lighthouse-Werte (siehe M1), Bing-Indexierung (R-H1, Inhaber-Aufgabe).
- Ratgeber-/Artikel-JSON-LD nur strukturell (Verweis auf Organization-`@id`),
  nicht live.
- Mobile Darstellung nur ueber `seo:check`, keine eigene Sichtpruefung.

## 6. Empfohlene Reihenfolge

1. `npm run lighthouse:messen` und LCP-Entdeckung pruefen (M1) - entscheidet, ob ein Umbau lohnt.
2. Ein kleiner PR fuer N1, N2, N3 (Marke, `https`, `@id`) - 20 min, kein Verhaltensrisiko.
3. N6 Meta-Description fuer Richtlinienseiten und N4 doppeltes Suchskript.
4. M2 mit dem Inhaber klaeren (Rueckgabe-/Versandangaben im Markup ja oder nein).
5. N5 und N7 bei naechster Gelegenheit.
