"""Patcht den jordanshop-Import-Skill mit den Erkenntnissen vom 2026-09-07.

Ersetzt gezielt die Stellen, die sich beim Linoleum-Import als falsch erwiesen haben.
Bricht ab, wenn ein Suchtext nicht exakt gefunden wird - dann hat sich der Skill
geaendert und der Patch muss angepasst werden.
"""
import sys, pathlib, shutil

SKILL = pathlib.Path(
    "/Users/tristan/Library/Application Support/Claude/local-agent-mode-sessions/"
    "skills-plugin/e15b03d2-f8bc-48c9-b950-166cf7c5b909/"
    "3ebea34e-519c-4a59-b173-eae0f2cec5f3/skills/"
    "teppichparadies-jordanshop-import/SKILL.md"
)

PATCHES = [

# --- 1. Datenerhebung: SSR-HTML per curl statt Browser -----------------------
(
"""## Collecting data from jordanshop.de

1. **Price**: ALWAYS verify live on the product page""",

"""## Collecting data from jordanshop.de

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
ATTR = re.compile(r'product-attribute-name">(.*?)</div>\\s*'
                  r'<div class="col-8 col-lg-9[^"]*">(.*?)</div>', re.S)
OPT  = re.compile(r'<option[^>]*value="(https://www\\.jordanshop\\.de/de-DE/product/\\d+)"'
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

1. **Price**: ALWAYS verify live on the product page""",
),

# --- 2. Farbnamen: Attribute unzuverlaessig, Farbe messen --------------------
(
"""5. **Real color names**: some lines expose an explicit "Farbe: {Name}" + "Farbintensität" field in the "Produktübersicht" accordion — but this is ONLY reliably visible via `mcp__workspace__web_fetch` on the raw page (full SSR HTML), NOT via Chrome's `get_page_text` (which only shows what's rendered/expanded, and JS strips this data client-side for unauthenticated users). Check ONE product via web_fetch before deciding. In practice most Sprint 027 lines have NO real color names, or only 1 of many colors does — when that happens, use the **"Farbe {code}"** fallback for ALL colors in that line (never mix named + coded) and disclose the limitation to the user afterward. `web_fetch` on jordanshop.de is rate-limited (~90–120s between calls) — prefer Chrome when it's connected.""",

"""5. **Real color names**: the SSR HTML exposes `Farbe` and `Farbintensität` per colour in the
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
   and `custom.farbcode`, never in the option value.""",
),

# --- 3. Namensregeln vor dem ersten Produkt ---------------------------------
(
"""## Building the Shopify product

**Combine widths into ONE product**""",

"""## Building the Shopify product

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

**Combine widths into ONE product**""",
),

# --- 4. Bilder: productCreateMedia statt productVariantAppendMedia ----------
(
"""**Images**: upload via `create-product`'s `images` array (direct `media.jordanshop.de` URLs work — Shopify re-hosts them). After creation, `get-product` to retrieve each image's `mediaId`, then `productVariantAppendMedia` to attach the correct color's image to BOTH its width variants (same image, two variant IDs). Batch as many `variantMedia` entries as possible into one mutation call via GraphQL aliases if doing many products, or just one call per product otherwise.""",

"""**Images**: on a **new** product pass them inside `productSet` as `files` plus
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
`originalSource` — reaching for it first costs a detour every time.""",
),

# --- 5. Gegenpruefung + productSet-Falle -----------------------------------
(
"""## After creating a product

Report to the user concisely:""",

"""## Editing an existing product

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

Report to the user concisely:""",
),
]


def main():
    if not SKILL.exists():
        sys.exit(f"Skill nicht gefunden: {SKILL}")
    text = SKILL.read_text(encoding="utf-8")
    shutil.copy(SKILL, str(SKILL) + ".bak")

    for i, (old, new) in enumerate(PATCHES, 1):
        if old not in text:
            sys.exit(f"Patch {i}: Suchtext nicht gefunden — Skill hat sich geaendert.\n"
                     f"Anfang war: {old[:90]!r}")
        if text.count(old) > 1:
            sys.exit(f"Patch {i}: Suchtext mehrfach vorhanden — nicht eindeutig.")
        text = text.replace(old, new)
        print(f"Patch {i}/{len(PATCHES)} angewendet")

    SKILL.write_text(text, encoding="utf-8")
    print(f"\nGeschrieben: {SKILL}")
    print(f"Backup:      {SKILL}.bak")

    kopie = pathlib.Path("/Users/tristan/teppich-paradies-shopify-ai/"
                         "domains/shopify/jordanshop-import-SKILL.md")
    kopie.write_text(text, encoding="utf-8")
    print(f"Projektkopie: {kopie}")


if __name__ == "__main__":
    main()
