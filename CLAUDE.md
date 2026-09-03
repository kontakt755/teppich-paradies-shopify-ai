# TeppichParadies — Shopify Horizon Theme

Shop: `www.teppich-paradies.net` · Theme: Horizon (Shopify 2.0, Blocks/Sections)

## Was hier immer wieder schiefging

Diese vier Punkte haben je eine komplette Sitzung gekostet. Vor dem Loslegen lesen.

**1. Der Theme-Editor ist nur eine Oberfläche über `templates/*.json`.**
Ein Block ist dort ein Eintrag in `blocks` plus einer in `block_order`. Blöcke
hinzufügen ist ein Code-Edit, kein Klickvorgang — und über 14 Collection-Templates
von Hand geklickt ist die Ursache dafür, dass die Templates auseinanderlaufen.

```
npm run theme:block list                                  # zeigt Drift sofort
npm run theme:block add tp-card-color-thumbs --after price
npm run theme:block remove tp-card-color-thumbs
```

**2. Ein Block ohne `"presets"` im Schema wird deployed und ist trotzdem unsichtbar.**
Shopify nimmt ihn nicht in die Block-Auswahl auf. Ebenso werden unbekannte
Schema-Keys (z. B. `"target"`) stillschweigend ignoriert. Vorlage ist das Schema
von `blocks/tp-card-specs.liquid`. `npm run schema:guard` fängt beides.

**3. `{% render 'x' ... as var %}` gibt es in Liquid nicht.**
Shopify verwirft die Datei beim Push **ohne Fehlermeldung**; zur Laufzeit kommt
dann „Could not find asset". `shopify theme check` sieht das nicht,
`npm run liquid:guard` schon. Korrekt ist `{% capture var %}{% render 'x' %}{% endcapture %}`.

**4. Nie von Hand ins Preview-Theme pushen.**
Das Live-Gate verlangt `previewDiffCount === 0`, also Preview exakt gleich
`origin/main`. Ein Direktpush über die Admin API erzeugt genau die Drift, die
`PREVIEW_DRIFT` abfangen soll, und macht die Live-Evidence wertlos.

## Vor jedem Commit

```
npm run liquid:guard && npm run schema:guard && npm run template:guard
node workflow/cli.mjs validate --static      # Flag heisst --static, nicht --static-only
```

Der volle Lauf (`validate` ohne `--static`) braucht die Storefront und läuft nur
lokal auf dem Mac. Unbekannte Flags brechen ab, statt still ignoriert zu werden.

## Werkzeuge

| Befehl | Zweck |
|---|---|
| `npm run theme:block list\|add\|remove` | Blöcke in Templates setzen, statt im Editor zu klicken |
| `npm run liquid:guard` | ungültiges Liquid, das Shopify still verwirft |
| `npm run schema:guard` | Block-Schemata, die deployen aber im Editor unsichtbar bleiben |
| `npm run template:guard` | Kollektions-Templates, deren Produktkarte abweicht |
| `npm run theme:diff -- --manifest <datei>` | Theme gegen Repository abgleichen |
| `npm run workflow:scratch -- --theme-id <id>` | Wegwerf-Theme zum Ausprobieren, ohne Evidence |

**`theme:diff`** braucht ein Manifest aus der Admin API. Über den Shopify-MCP:

```graphql
query { theme(id: "gid://shopify/OnlineStoreTheme/<id>") {
  name files(first: 250) { pageInfo { hasNextPage endCursor }
  nodes { filename checksumMd5 } } } }
```

`checksumMd5` ist die MD5-Summe der Rohbytes und damit direkt mit lokalen
Dateien vergleichbar. Bei `hasNextPage` mit `after: "<endCursor>"` weiterblättern
(das Theme hat rund 500 Dateien, also zwei Seiten). Ergebnis als
`{themeId, themeName, files:[{filename, checksumMd5}]}` ablegen.

**`workflow:scratch`** ist die Lane zum Ausprobieren: läuft aus jedem Branch,
auch mit uncommitteten Änderungen, und schreibt bewusst **keine** Evidence.
Sie verweigert das Live-Theme und das Theme, auf dem die Preview-Evidence
beruht. Zum Deployen bleibt es bei `preview` → `live`.

## In Remote-Sessions (claude.ai/code)

| | Status |
|---|---|
| GitHub, git push | geht |
| Shopify Admin API (Shopify MCP) | geht — liest Theme-Dateien und Produktdaten, schreibt in unpublished Themes |
| Storefront `teppich-paradies.net` / `*.myshopify.com` | **403 an der Egress-Policy** — keine Screenshots möglich |
| Shopify CLI (`theme push/pull/list`) | kein Token + Domains blockiert |

Praktische Folge: Struktur und Syntax sind hier prüfbar, **das Aussehen nicht**.
Browser-Schritte (COMPARE, SEO, FULL_QA, SALES) schlagen hier zwangsläufig fehl —
deshalb `--static`. Deploys laufen lokal.

## Produktdaten (bestimmt, was Blöcke rendern dürfen)

- Farben sind eine echte Produktoption `Farbe` mit Bild je Variante
  (z. B. Floresta: 8 Werte). Blöcke sollten auf die **Option** gehen, nicht auf
  `product.variants` — sonst erscheint dieselbe Farbe mehrfach, wenn zusätzlich
  Breiten-/Längenvarianten existieren.
- Fixpreis-/Rollenware-Produkte haben nur `Default Title` und kein Variantenbild.
  Blöcke müssen dort **still nichts rendern**, kein Fallback auf `product.images` —
  das zeigt sonst Detailfotos als vermeintliche Farben.
- Paketprodukte erkennt man am Metafeld `custom.qm_pro_paket`.

## Deploy-Kette

```
Branch → PR → main → workflow:preview (unpublished Theme) → workflow:live
```

Preview und Live verlangen beide `branch === main && head === origin/main` und
einen sauberen Working Tree. Live zusätzlich passende Preview-Evidence und
explizite Freigabe. Die Gates sind Absicht — nicht umgehen, sondern die Kette
durchlaufen.

## Konventionen

- Eigene Blöcke/Snippets tragen das Präfix `tp-`.
- Blöcke mit `_`-Präfix sind privat (nur verschachtelt, keine `presets` nötig).
- CSS gehört in `{% stylesheet %}`, nicht in ein inline `<style>` pro Karte —
  letzteres dupliziert die Regeln für jede Produktkarte im Raster.
- Kommentare und Commit-Messages auf Deutsch, ohne Umlaute in Liquid-Kommentaren.
- `AppBlockValidTags` aus `theme check` trifft ~140 Dateien inklusive
  Horizon-Kern — bekanntes False-Positive, kein Handlungsbedarf.
