---
name: "teppichparadies-jordanshop-import"
description: "Use when importing/adding products to the Shopify store TeppichParadies from the wholesale supplier jordanshop.de (Jordan Onlineshop) — especially the Sprint 027 collection of Teppichboden (carpet) and Vinylboden von der Rolle (roll vinyl) lines. Covers the full workflow: collecting variant/color/image data from jordanshop.de, and creating the product correctly in Shopify with the right category, metafields, tags, description format, brand naming, and publishing steps."
---


# TeppichParadies — jordanshop.de Produktimport (Sprint 027 & Co.)

Store: **TeppichParadies**, Shopify Admin via connected MCP server (tool prefix `mcp__87afcfe9-ad55-49fd-b364-c250eb5ccf31__`, e.g. `create-product`, `get-product`, `add-to-collection`, `graphql_query`, `graphql_mutation`). Supplier: **jordanshop.de** (Jordan Onlineshop), B2B wholesale, product URLs `https://www.jordanshop.de/de-DE/product/{id}`.

## Workflow

User sends one or more jordanshop.de product links (sometimes noting which widths are available, e.g. "400cm und 500cm" or just "400cm"). Sitemap/category enumeration on jordanshop.de is unreliable — rely on links the user provides, or the site's own search (`https://www.jordanshop.de/de-DE/search?query=...`), which only works via the Chrome extension (client-rendered; empty via plain fetch). Process each product line fully (data collection → Shopify creation → publish) before moving to the next, unless told to batch several first.

Some jordanshop.de product IDs are "grouped" parent pages (shows "x 400,0" / "Bitte eine Variante auswählen" with a color dropdown, no direct price/EAN) rather than a specific color's detail page — pick any color from the dropdown to land on a real detail page with full specs.

## Collecting data from jordanshop.de

**Read the pages with `curl`, not the browser.** jordanshop.de renders server-side, so a
short Python script pulls every colour of a product line in one run: the colour-picker URLs,
the image URL, the article number and the full attribute table. Driving the browser
page-by-page is the slow path and was measured at roughly ten times the calls for the same
result. The browser stays right for the site search (client-rendered) and for visual checks.

The SSR HTML also carries **more than the rendered DOM**: the `product-attribute-name` table
holds Stärke, Breite, Brandverhalten, Nutzungsklasse, Raumeignung, Qualität, EAN and
`Art. Nr.` — collapsed in the accordion and partly stripped client-side for logged-out
visitors, but always present in the raw response.

```python
ATTR = re.compile(r'product-attribute-name">(.*?)</div>\s*'
                  r'<div class="col-8 col-lg-9[^"]*">(.*?)</div>', re.S)
OPT  = re.compile(r'<option[^>]*value="(https://www\.jordanshop\.de/de-DE/product/\d+)"'
                  r'[^>]*>(.*?)</option>', re.S)
```

Send a normal browser User-Agent. A working pair of scripts (fetch + colour measurement)
lives in `domains/shopify/linoleum-farbdaten/` in the TeppichParadies repo.

**Never guess colour-variant product IDs.** The IDs within one line are not sequential —
guessed ones silently land on the homepage and return `no-image`. Only use the values from
`<option value="...">`.

**Write the collected raw data straight to a file** and keep collection separate from
processing. Data that only lives in the conversation is gone after a context compaction and
has to be re-collected — that happened twice in one session.

1. **Price**: ALWAYS verify live on the product page (`XX,XX € / m²`) — never reuse a cached or remembered price, even for the "same" product line at a different width. Chrome shows price without login; it may show "Bitte warten.." briefly on first load, re-check if so.
2. **Colors + product IDs (same width)**: find the "Varianten" `<select>`/combobox on a product page, `read_page` with `filter: "all"` on it — options have `value="https://.../product/{id}"` for every color at that width. If the result is too large, it's dumped to a file — `Grep` that file for `Farbe \d+|product/\d+` instead of reading it whole.
3. **Colors + product IDs (other width)**: use site search `search?query={Line}%20Sprint%20027` (or similar collection name), paginate if needed. Near the bottom of results there are "grouped variant cards" per width (e.g. "Teppichboden X 400cm" and "Teppichboden X 500cm") each with their own combobox — read those to get the ID mapping for each width in one shot, rather than clicking through individual colors.
4. **Technical specs**: read directly off the product page (Gewicht, Stärke, Struktur, Polmaterial, Polhöhe, Rückenausstattung, Nutzungsklasse, Luxusklasse, Treppeneignung, Stuhlrolleneignung, Brandverhalten, Fußbodenheizung, etc.) — these are visible without login via Chrome's `get_page_text`.
5. **Real color names**: the SSR HTML exposes `Farbe` and `Farbintensität` per colour in the
   attribute table. **Do not trust these values — they are badly maintained.** Measured
   2026-09-07: `fresco blue` is listed as "Schwarz" but is `#708ca4`; `arabian pearl` is
   listed as "Grau" but is `#d9c8ad`; six Jokalino colours all carry "Grau / Mittel" and would
   be indistinguishable as option values, which Shopify rejects as duplicates. For LINOFLEX
   both fields are empty throughout.

   The reliable source is a **measurement of the product image**: median RGB of the image
   centre → HLS → base tone plus lightness step. Reproducible, consistent across products, and
   it does not conflict with the rule against inventing product properties — that one targets
   colour **codes** and technical data, which are still copied verbatim, never derived.

   Name colours in German as **base tone + step**, the scheme the finished Elastium product
   already uses: `Grau Hell`, `Grau Mittel`, `Beige Warm`, `Blau Dunkel`. Base tones in use:
   Creme · Sand · Beige · Ocker · Taupe · Braun · Gelb · Oliv · Grün · Blau · Grau. Values must
   be unique within a product; where several land on the same pair, a third qualifier separates
   them (`Grau Warm`, `Grau Oliv`, `Grau Anthrazit`). In the classifier, greys (`S < 0.10`) must
   be decided **before** any warm-tone rule, otherwise every neutral grey turns into "Taupe".

   Never use a `Farbe {code}` label as the customer-facing name — the number belongs in the SKU
   and `custom.farbcode`, never in the option value.
6. **Images**: on each product detail page, run via `javascript_tool`:
   `document.querySelector('main img')?.getAttribute('src')?.split('/').pop()`
   This returns a base64 (urlsafe, padded) string. Decode via Python:
   `base64.urlsafe_b64decode(v + '=' * (-len(v) % 4)).decode()` → yields `https://media.jordanshop.de/original/{ID}-8FXC-prod.JPG`.
   The SAME image is shared across both widths for a given color — only fetch it once per color, not once per SKU. If the image is a generic placeholder (`default-image/gallery_preview` instead of a real filename), that color has no real photo on jordanshop.de — omit that color/variant from the Shopify product entirely rather than uploading a placeholder, and mention the omission afterward.
   Batch navigate+extract calls via `browser_batch` (several colors per call) to save round trips.

## Building the Shopify product

**Settle the naming rules before creating the first product.** On 2026-09-07 seven Linoleum
products went live carrying the supplier's line name in the title (`Jokalino Vivace
Linoleumboden`) and English colour names with the number in them (`1032 green melody`). All of
it had to be torn down and rebuilt — two extra sessions — although the rule was already in this
skill and the two finished products in the shop demonstrated it.

| | Rule |
|---|---|
| Title | `{InventedBrand} {Category} {Widths}` — never the supplier's line name |
| Vendor | the same invented brand |
| Supplier line | goes in `grosshandel.sku`, nowhere else |
| Colour name | German, base tone + step, no number, no English, unique per product |
| Colour number | SKU (`{PREFIX}_{NUMBER}`) and `custom.farbcode` only |

**Query the nearest finished product before building a new one** — title, vendor, variant
titles, metafields — and build along it. It is the specification, and it costs one query
against a wasted session.

**Combine widths into ONE product** when a line has both 400cm and 500cm: use variant options `["Farbe", "Breite"]` (two-dimensional), never split into separate products or ignore a width. If a line genuinely only has one width, use a single option `["Farbe"]` (or `["Farbe", "Breite"]` isn't needed).

**Title**: `{ErfundenerMarkenname} Teppichboden {Breiten}` e.g. "Kalvea Teppichboden 400cm 500cm", or just `400cm` if single-width.

**Brand name**: invent one freely per product line — NOT the supplier's own line name (e.g. not "Lorna", "Astro", "Damos"). Style guidance (established after user feedback): avoid a repetitive/gimmicky suffix pattern across products (an earlier batch all ended in "-ano"/"-o" — Alvano, Verano, Velano, Solano, Corvano, Livano, Verdano, Marano, Traxano — and the user asked for a rename because it "sounds unspecial" and repetitive). Prefer varied, easy-to-pronounce names that evoke the product's character (material, softness, room) without being hard to say (Italian words like "Quercia" were rejected as too sperrig) or clashing with an existing name. **Already-used names — do not reuse or make something too similar-sounding:** Kontura, Amara, Serena, Velluna, Practiva, Kalvea, Landora, Eichwald, Terracora, Granitera (Vinylboden), plus older ones: Rohan, Norway, Saphir, Banta, Lando, Manda, Mellino, Solterra (these older ones were NOT renamed and are out of scope for future renames unless asked).

**SKU pattern**: match the supplier's own article-number scheme exactly as shown on jordanshop.de, e.g. `TEPLORN04_{code}` / `TEPLORN05_{code}` for 400/500cm — check the "Artikelnummer" field on the product page for the exact prefix and code padding (some use 2-digit codes as-is, some zero-pad to 3 digits — copy what jordanshop.de itself shows).

**Price**: flat, same value for every variant (color × width) — matches the live-verified €/m² price.

**Variant option "Farbe" naming**: `Farbe {code}` fallback unless real color names were confirmed for the whole line (see above).

**descriptionHtml** — simple, jargon-free customer German (avoid raw technical loanwords like "Cut Pile"/"Tuft"/"Velvet" without translating; "Schlingen-Teppichboden" for loop pile is fine, it's plain German). Fixed `pd-card` template:
```html
<div class="pd-card">
<h3>{Marke} Teppichboden</h3>
<p>{Marke} ist ein {Eigenschaft}-Teppichboden mit {Kurzbeschreibung}. {weitere Vorteile in 1-2 Sätzen}. {Marke} funktioniert mit Fußbodenheizung (Warmwasser und Elektro) und ist in {N} Farben sowie den Breiten {Breiten} erhältlich.</p>
<div class="pd-badges">
<span class="pd-badge">{Badge 1}</span>
<span class="pd-badge">{Badge 2}</span>
<span class="pd-badge">{Badge 3}</span>
<span class="pd-badge">{Badge 4}</span>
</div>
<table class="pd-specs">
<tr><th>Eignung</th><td>Wohnräume</td></tr>
<tr><th>Material</th><td>{z.B. 100% Polyamid}</td></tr>
<tr><th>Polhöhe</th><td>{X} mm</td></tr>
<tr><th>Verfügbare Breiten</th><td>{Breiten}</td></tr>
<tr><th>Rückenausstattung</th><td>{z.B. Textilrücken}</td></tr>
</table>
</div>
```
Use the same `pd-card` structure for Vinylboden von der Rolle products, adapting the spec rows (Nutzschicht, Rollenbreite, Brandverhalten etc. instead of Polhöhe).

**Tags** (exact lowercase format, colon-space separated):
`art: teppichboden`, `breite_boden: 400cm`, `breite_boden: 500cm` (one per width present), `material: {polyamid|polyester|polypropylen|...}`, `nutzungsklasse: {X}` (one tag per class number if multiple, e.g. both "31" and "22"), `raum: wohnzimmer`, `raum: schlafzimmer`, `raum: flur`, `raum: kinderzimmer` (standard set), plus `farbe: {farbe}` tags ONLY if real color names are known for the whole line (omit entirely otherwise, do not guess).

**Category** (standing rule, always): `gid://shopify/TaxonomyCategory/ha-2-5` ("Heimwerkerbedarf > Baumaterialien > Fußböden & Teppichböden") — NOT the decorative-rug category. Set via `productUpdate`.

**templateSuffix**: always `"rolle"`.

**Metafields to set via `productUpdate`** (namespace.key — type):
- `custom.arten` (list.metaobject_reference) — carpet construction type metaobject (type handle `teppich_art`), e.g. Schlinge=`1720949604686`, Velours=`1720949539150`, Hochflor=`1720949375310`, Kurzflor=`1720949473614`. Query `metaobjects(type:"teppich_art")` for the full list/current IDs if unsure.
- `custom.fasermaterial` (list.metaobject_reference) — fiber material metaobject (type handle `fasermaterial`), e.g. Polyamid=`1724735717710`, Polyester=`1727080857934`, Polypropylen=`1781612544334` (created because none existed before — reuse this one, don't recreate). Query `metaobjects(type:"fasermaterial")` if a new material is needed and create one via `metaobjectCreate` if genuinely missing (single field `fasermaterial`, type single_line_text_field).
- `custom.florhohe` (single_line_text_field) — e.g. `"2,3 mm"`.
- `custom.ruckenausstattung` (single_line_text_field) — e.g. `"Textilrücken"`. If it differs by width (has happened), write both: `"Textilrücken (500 cm) / Vliesrücken (400 cm)"`.
- `custom.zimmer` (list.metaobject_reference) — type handle `zimmer`. Standard set for residential carpet: Wohnzimmer=`1720806834510`, Schlafzimmer=`1720807031118`, Flur=`1720807293262`, Kinderzimmer=`1720806998350`. Add Treppeneignung=`1724382609742` if the source page says "Treppeneignung: Ja/WOHNRAUM". Omit Treppeneignung/Flur if source explicitly says Treppeneignung/Stuhlrolleneignung: Nein. Büro=`1749145616718` / Arbeitszimmer=`1724382544206` or `1749145387342` exist if ever relevant (e.g. high Nutzungsklasse + office chair suitability) but haven't been used yet — use judgment.
- `grosshandel.sku` (single_line_text_field) — `"Sprint 027 {Qualität}"` (the supplier's own "Qualität" field value, e.g. "Sprint 027 Riva").
- `shopify.allergy-friendly-features` (list.metaobject_reference) — **standing rule: ALWAYS set to `["gid://shopify/Metaobject/1724763144526"]`** ("Frei von Chemikalien") for every Teppichboden product (fitted carpets bind dust — reasoning already agreed with user, no need to re-ask).
- `shopify.pile-type` (list.metaobject_reference) — type handle `shopify--pile-type`. Kurzflor=`1724763111758`, Hochflor=`1761539522894`, Samt=`1724736012622`, Elektoralwolle strukturiert=`180115145038`. Pick by Polhöhe/Struktur: ~2–4mm short pile → Kurzflor (or Samt if Struktur says "Velvet" specifically); ~7–8mm+ → Hochflor.
- `shopify.suitable-space` (list.metaobject_reference) — always `["gid://shopify/Metaobject/180115210574"]` ("Drinnen").
- `shopify.color-pattern` (list.metaobject_reference) — ONLY if real color names are known for the whole line; map each to the closest existing `shopify--color-pattern` metaobject (query `metaobjects(type:"shopify--color-pattern")`), skip a color with no good match rather than mis-tagging it (documented precedent: "Rot" was left out for one line because no exact metaobject existed).
- `global.title_tag` (single_line_text_field) — `"{Marke} Teppichboden {Breiten} | TeppichParadies"`.
- `global.description_tag` (single_line_text_field) — 1-sentence SEO summary, e.g. `"{Marke} Teppichboden in {N} Farben, {Breiten} Breite. {2-3 Eigenschaften}."`.

**Images**: on a **new** product pass them inside `productSet` as `files` plus
`variants[].file` — then the per-variant assignment happens in the same call and nothing needs
attaching afterwards.

To add or fix images on an **existing** product, two mutations do it:

```graphql
mutation {
  m0: productCreateMedia(
    productId: "gid://shopify/Product/..."
    media: [{ mediaContentType: IMAGE
              originalSource: "https://media.jordanshop.de/original/1209405-8FXC-prod.JPG" }]
  ) { product { id } userErrors { field message } }
}
```

No `input` wrapper, no staged upload, and the supplier URL is accepted directly — Shopify
re-hosts it. Batch 15–20 aliased mutations per call. Then assign each image to its variant with
`productVariantsBulkUpdate` (`{id, mediaId}`), and remove wrongly attached media with
`productDeleteMedia`.

`productVariantAppendMedia` needs `mediaIds` that already exist and cannot take an
`originalSource` — reaching for it first costs a detour every time.

**Publish**: `publishablePublish` mutation to BOTH sales channel Publications — Onlineshop=`gid://shopify/Publication/239013396814` and Shop=`gid://shopify/Publication/239013462350`. Setting `status: ACTIVE` on the product alone is NOT enough — it must be explicitly published to these channels too.

**Collection**: `add-to-collection` with `gid://shopify/Collection/688863674702` (the manual "Teppichboden" overview collection) — required for every product, separate step from publishing.

## Editing an existing product

**`productSet` is for new products only.** On an existing product with `id:` it aborts as soon
as the payload carries a metafield that already exists there (`grosshandel.sku`,
`global.title_tag`): `Key must be unique within this namespace on this resource`. The abort is
treacherous because it **leaves the old variant structure in place** — one product ended up
carrying six variants belonging to a different product, and it went unnoticed for hours.

For corrections use the narrow mutations:

| Change | Mutation |
|---|---|
| Colour / option values | `productOptionUpdate` with `optionValuesToUpdate`, `variantStrategy: LEAVE_AS_IS` |
| Title, vendor, handle, SEO, description | `productUpdate` (handle change: `redirectNewHandle: true`) |
| Metafields | `metafieldsSet` |
| Upload image | `productCreateMedia` |
| Assign variant image | `productVariantsBulkUpdate` with `mediaId` |
| Remove wrong media | `productDeleteMedia` |

**Ask the schema instead of guessing the syntax.** One session burned four attempts on the
inventory mutations, three on `productVariantAppendMedia` and two on `productSet`, each
returning a multi-thousand-character error. A single `graphql_schema` call answers it.
Several mutations belong in one document with aliases — separate `mutation {}` blocks fail with
`Operation name is required when multiple operations are present`.

## After every write: verify

`userErrors: []` is not evidence that the result is right. Query variant count, SKU, option
value and `variant.image` after each step. Two faults survived for hours without this: a
product left with six foreign variants after an aborted `productSet`, and two products whose
media were **swapped** — which read as "images missing" and sent the search in the wrong
direction.

## After creating a product

Report to the user concisely: what was created (name, variant count, price), and proactively flag any data-quality caveats (missing color names → used code fallback; missing images → color omitted; ambiguous metafield mappings; anything guessed rather than confirmed). Then wait for the next link — don't start further products unless asked.

## Efficiency notes for future sessions

- **Collect with `curl` in a script, not through the browser.** One run pulls every colour of a
  product line including the full attribute table; the browser needs roughly three calls per
  colour and cannot see the collapsed attributes at all.
- Keep collection and processing in separate scripts with a JSON file between them. A mistake in
  processing then costs no re-collection, and the data survives a context compaction.
- Batch 15–20 aliased GraphQL mutations per call.
- The browser stays right for the site search (client-rendered) and for visual checks of the
  finished product page.
- Chrome extension connection can drop mid-session — if multiple browsers are connected and
  ambiguous, the system requires an `AskUserQuestion` before any browser action; ask the user
  which one when this happens rather than guessing.
- Issue Bash commands singly. Chained ones (`cd x && y | z`) are matched as one permission
  pattern, so an uncovered link triggers a prompt even when the user has allowed the same work
  many times before. Put multi-step logic in a file and start it with one call.

