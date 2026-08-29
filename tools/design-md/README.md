# design-md — Headless DESIGN.md / SKILL.md extractor

Headless port of the Chrome extension
[bergside/design-md-chrome](https://github.com/bergside/design-md-chrome)
(the repo asked for as `rausbergside/design-md-chrome`; the real owner is `bergside`).

The extension reads computed styles from the active tab and turns them into a
TypeUI-format `DESIGN.md` (or an agent-ready `SKILL.md`). That needs a browser
with the extension loaded, so this directory drives the same code with
Playwright + Chromium instead — one command, no manual clicking.

## Contents

| File | Origin |
| --- | --- |
| `extract.mjs` | Driver. The `EXTRACTOR` page function is a port of the extension's `content-script.js` `extractStylesFromPage()` and helpers. |
| `lib/normalize.mjs` | Verbatim from the extension. |
| `lib/generate-design-md.mjs` | Verbatim from the extension. |
| `lib/generate-skill-md.mjs` | Verbatim from the extension. |

Upstream is MIT licensed.

## Usage

```bash
npm install playwright          # once
node tools/design-md/extract.mjs https://example.com/ https://example.com/shop
```

Per URL it writes into `tools/design-md/out/`:

- `<slug>.raw.json` — the sampled computed styles (up to 280 visible elements)
- `<slug>.normalized.json` — token maps, site profile, confidence, diagnostics
- `<slug>.DESIGN.md`
- `<slug>.SKILL.md`
- `<slug>.png` — above-the-fold screenshot for eyeballing

Set `PLAYWRIGHT_CHROMIUM_PATH` if Chromium is not where Playwright expects it
(on the Claude Code web sandbox: `/opt/pw-browsers/chromium`).

## Network requirement

The extractor needs to actually load the page. In sandboxes with an egress
allowlist, target domains must be permitted first — otherwise Chromium fails
with `ERR_TUNNEL_CONNECTION_FAILED` and nothing is extracted. Competitor
domains such as `teppichscheune.de` and `laminat-shop24.com` are not on the
default allowlist and have to be added to the environment's network policy.
