# AI DISCOVERABILITY STATUS — teppich-paradies.net

Stand: 2026-09-23 · gemessen live gegen `www.teppich-paradies.net`
(Theme 204436144462, `server-timing: theme;desc=`) · Shopify-Tarif **Basic**

## Ergebnis

| System | Status | Begründung |
|---|---|---|
| **Google** (Search, Googlebot) | **OK** | `robots.txt` erlaubt `/`; Produktseite liefert Googlebot HTTP 200 mit vollem HTML (507 KB); kein `noindex`, kein `X-Robots-Tag`; Canonical gesetzt; `sitemap.xml` in `robots.txt` deklariert, 510 Produkte + 28 Kollektionen + 17 Seiten + 7 Blog-URLs |
| **Google AI / Gemini** (Google-Extended) | **OK** | `Google-Extended` ist kein eigener Crawler, sondern ein robots.txt-Token für die KI-Nutzung bereits gecrawlter Inhalte. Es gibt keine `Disallow`-Regel dafür → KI-Nutzung erlaubt. `adsbot-google` hat zusätzlich einen eigenen Allow-Block |
| **ChatGPT Search** (OAI-SearchBot, GPTBot, ChatGPT-User) | **OK** | alle drei User-Agents erhalten HTTP 200, identische Byte-Zahl wie Googlebot → kein Cloaking, keine Sperre |
| **Claude / Anthropic** (ClaudeBot, Claude-SearchBot, Claude-User) | **OK** | alle drei erhalten HTTP 200 mit vollem HTML |
| **Bing / Copilot** (bingbot) | **OK** | HTTP 200, keine Sonderregel in `robots.txt` |
| **Weitere** (PerplexityBot, Applebot, meta-externalagent, Amazonbot) | **OK** | alle HTTP 200 |

Kein Bot wird ausgesperrt, weder in `robots.txt` noch per Header, App oder
Firewall. `server: cloudflare` ist Shopifys eigenes CDN; es gab bei keinem
Testabruf eine Challenge oder ein abweichendes Dokument.

## robots.txt

`templates/robots.txt.liquid` existiert **nicht** — ausgeliefert wird Shopifys
Standard. Der ist für dieses Ziel bereits richtig und sollte nicht
überschrieben werden:

- `User-agent: *` / `Allow: /` — alle öffentlichen Inhalte crawlbar.
- Geschützt bleiben `/admin`, `/cart/`, `/checkout`, `/checkouts/`, `/orders`,
  `/account` (mit `Allow: /account/login`), `/services`, `/sf_*`.
- Crawl-Fallen ausgeschlossen: `/collections/*sort_by*`, Mehrfachfilter
  (`*filter*&*filter*`), `+`-URLs, `preview_theme_id`, `oseid`.
- `Sitemap: https://www.teppich-paradies.net/sitemap.xml` deklariert.

**Ein eigenes `robots.txt.liquid` mit „Allow: /" wäre eine Verschlechterung** —
es würde die Checkout- und Konto-Sperren sowie die Filter-Ausschlüsse
aufheben. Empfehlung: Datei nicht anlegen.

Shopify liefert zusätzlich von sich aus die Agenten-Schnittstellen
`/agents.md`, `/llms.txt`, `/.well-known/ucp` (alle HTTP 200) und listet
`/agents.md` in `sitemap_agentic_discovery.xml`.

## Indexierungssteuerung im Theme

- Kein `noindex`/`nofollow`-Meta außer einem bewusst gesetzten:
  `snippets/meta-tags.liquid` setzt `noindex,follow` auf Blog-Tag-Seiten
  (`/blogs/*/tagged/*`), damit sie nicht mit der Ratgeber-Themenseite
  konkurrieren. Richtig so.
- Canonical: `snippets/meta-tags.liquid` mit Shopifys `canonical_url`, keine
  Eigenlogik. Filter- und Sortier-URLs sind über `robots.txt` abgedeckt.
- `rel="next"`/`rel="prev"` gibt es nicht (von Google 2019 abgekündigt, kein
  Mangel).
- Keine `hreflang`-Tags — korrekt, der Shop hat nur eine Sprache.

## Strukturierte Daten

| Typ | Wo | Stand |
|---|---|---|
| `Organization` + `HomeAndConstructionBusiness` + `Store` | `sections/header.liquid`, jede Seite | Name, Logo, Telefon, E-Mail, PostalAddress, Öffnungszeiten, `geo`, `areaServed` (GeoCircle 50 km), `priceRange`. Bewusst ohne `aggregateRating` |
| `WebSite` | Startseite | vorhanden |
| `Service` | Verlegeservice-Section | `serviceType`, `provider`, `areaServed` |
| `BreadcrumbList` | Produktseiten, Blogartikel | vorhanden |
| `Product` + `Offer` | Produktseiten (Shopify-nativ) | Preis, Verfügbarkeit, Marke, Bild |
| `ProductGroup` + `Offer` je Variante | Flächenware (`snippets/tp-product-structured-data.liquid`) | `offers.price` **und** `UnitPriceSpecification` je m² (MTK); seit 2026-09-23 zusätzlich `additionalProperty` |
| `Article` + `WebPage` + `ImageObject` | Ratgeber-Artikel | vorhanden |
| `FAQPage` | Startseite, Teppiche-Kollektion | **neu 2026-09-23** (`snippets/tp-faq-structured-data.liquid`) |

### Was Antwortmaschinen jetzt zusätzlich lesen können

`snippets/tp-produkt-merkmale-json.liquid` gibt die Merkmale der sichtbaren
Tabelle als `additionalProperty` (PropertyValue) aus: Marke, Belagsart, Optik,
Material, Fasermaterial, Aufbau, Rückenausstattung, Florhöhe, Gesamtstärke,
Poleneinsatzgewicht, Nutzungsklassen, Komfortklasse, Fußbodenheizung,
Trittschallverbesserung, Brandverhalten, Zimmer, Einsatzbereich,
Herstellungsland, OEKO-TEX, Pflegeleicht sowie Rollenbreite, Inhalt je Paket,
Stück je Paket, Format und Stangenlänge mit Einheit.

Quelle sind ausschließlich dieselben `custom.*`-Metafelder, die die Seite
sichtbar zeigt — keine erfundenen Werte, keine Lieferantendaten.

**Offen (bewusst):** Der native Zweig (Paketware, Teppichfliesen, Klick- und
Klebevinyl) bleibt bei Shopifys `structured_data`. Dort hängt der Preis dran,
und ein zweiter `Product`-Knoten mit derselben `@id` lässt sich ohne Prüfung im
Rich-Results-Test nicht verantworten — siehe den Merchant-Center-Vorfall vom
2026-09-23 (`offers.price` fehlte bei Flächenware). Diese Produkte tragen ihre
Merkmale in der serverseitig gerenderten Tabelle; Crawler lesen sie, nur eben
nicht als JSON-LD. → eigener Arbeitsschritt mit Live-Prüfung.

## Serverseitig sichtbare Produktinformationen

Vollständig im HTML, ohne JavaScript lesbar: Titel, Beschreibung, Preis,
Merkmalstabelle (`blocks/tp-produktinfo-tabelle.liquid`,
`blocks/tp-teppich-produktdetails.liquid`), €/m² bei Paketware
(`snippets/tp-price-per-sqm.liquid`), Farbname der gewählten Variante,
Breadcrumb.

**Nur per JavaScript sichtbar** (`blocks/tp-rollware-rechner.liquid`): die
Breiten-Auswahlchips, der berechnete €/m²-Text und der Kaufbereich der
Rollenware. Die Rohwerte stehen als JSON im HTML und der m²-Preis im JSON-LD,
der Fließtext fehlt einem JS-losen Crawler aber. Betrifft Rollenware-Produkte.

## Meta-Descriptions

25 zufällig geprüfte Produktseiten hatten eine gepflegte SEO-Description.
Unter den 30 ältesten Produkten fehlt sie bei vier (Sylvara-655-Familie,
darunter ein `…-kopie`-Duplikat). Dort fällt Shopify auf den Produkttext
zurück — 324 Zeichen Emoji-Tabelle.

Behoben wurde die doppelte Maskierung: `escape` machte aus `&amp;` ein
`&amp;amp;`, in der Suchvorschau als `&amp;` zu lesen. Jetzt `escape_once`.

**Offen (Admin-Arbeit):** SEO-Description für die vier Produkte pflegen und
klären, ob `sylvara-655-design-klebevinyl-als-einzelplanken-kopie` überhaupt
im Shop stehen soll — ein indexiertes Duplikat.

## Interne Daten: sind sie öffentlich?

Im Storefront-HTML einer Produktseite kommen weder Lieferantennamen noch
Einkaufsdaten vor (geprüft gegen `einkauf`, `grosshandel`, `tp_lieferant`,
`lieferant`, `bestellweg`, `dropship`, `einkaufspreis`).

Das Theme liest aus dem Namespace `lieferant` genau zwei Booleans —
`wunschmass` und `kettelung` in `blocks/tp-rollware-rechner.liquid` — also
Service-Verfügbarkeiten, die der Kunde ohnehin an der Bedienoberfläche sieht.
`einkauf.*` kommt im Theme **nicht** vor.

**Befund mit Handlungsbedarf:** Fünf Metafeld-Definitionen stehen auf
`storefront: PUBLIC_READ` und sind damit über die Storefront API lesbar,
obwohl sie interne Beschaffungsdaten tragen:

| Ebene | Metafeld | Name |
|---|---|---|
| Produkt | `lieferant.hersteller` | Hersteller |
| Produkt | `lieferant.match_status` | „Abgleich <Lieferant A>/<Lieferant B>" — der Name nennt die Klarnamen |
| Produkt | `lieferant.abgleich_datum` | Abgleich vom |
| Variante | `lieferant.bevorzugt` | Bevorzugter Lieferant |
| Variante | `lieferant.alternativ` | Alternativer Lieferant |

Alle `einkauf.*`-Felder stehen korrekt auf `NONE`. Empfehlung: die fünf Felder
ebenfalls auf `NONE` setzen — vorher prüfen, ob Liquid sie liest (heute nein)
und ob eine App sie über die Storefront API bezieht.

## Nicht geprüft / nicht prüfbar von hier

- Google Search Console (Abdeckung, tatsächliche Indexierung) — Zugang fehlt.
- Rich-Results-Test für die neuen `additionalProperty`/`FAQPage`-Knoten —
  braucht eine öffentliche URL, also erst nach dem Livegang.
- Ob eine installierte App Bots blockt — es wurde kein solches Verhalten
  gemessen, aber die App-Liste wurde nicht einzeln durchgesehen.
