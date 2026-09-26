---
name: deploy
description: Theme-Aenderungen von main ueber Preview ins Live-Theme bringen (workflow:doctor, workflow:preview, workflow:live), Theme gegen Repository abgleichen (theme:diff), Wegwerf-Themes (workflow:scratch), Grenzen in Remote-Sessions. Verwenden bei "deploy", "live stellen", "push das raus", bei Gate-Abbruechen und bevor irgendetwas in ein Theme gepusht wird.
---

# Deploy-Kette

Ausgelagert aus CLAUDE.md (#670). Die Stolpersteine 4 und 5 dort gelten weiter; Live-Theme nur ueber `domains/shopify/live-theme.json` bestimmen.

## Deploy-Kette

```
Branch → PR → main → workflow:preview (unpublished Theme) → workflow:live
```

Preview und Live verlangen `branch === main && head === origin/main` und einen
sauberen Working Tree. Live zusaetzlich passende Preview-Evidence und explizite
Freigabe. **Die Kette darf der Agent eigenstaendig durchlaufen**, sobald der
Nutzer einen Deploy verlangt („deploy", „live stellen", „push das raus") — die
Freigabe-Flags sind Teil des Befehls, keine zweite Bestaetigung:

```
npm run workflow:doctor                     # zuerst - meldet alle Blocker auf einmal
node workflow/cli.mjs preview --theme-id <id> --approve-preview
node workflow/cli.mjs live --theme-id <id> --approve-live --approval-text "PUBLISH LIVE" --execute
```

**Pro Arbeitskopie laeuft nur ein Deploy.** `preview`, `live` und die volle
`validate` nehmen eine Sperre (`.workflow/lock.json`), QA ebenfalls; der
Kindprozess des Workflows erkennt die eigene und laeuft durch. Ein zweiter Lauf
bricht mit `WORKTREE_BUSY` ab und nennt, wer blockiert. Grund: am 2026-09-26
arbeiteten zwei Sitzungen gleichzeitig im selben Worktree — die
Theme-Check-Baseline wurde zwischen Schreiben und Lesen ueberschrieben, HEAD
sprang mitten im Lauf weg, und das freigegebene Preview-Theme wurde von der
anderen Sitzung publiziert. Eine verwaiste Sperre uebernimmt der naechste Lauf
selbst; sofort geht es mit Loeschen der Datei. `doctor`, `route` und
`validate --static` sind absichtlich frei und geben auch waehrend eines Deploys
Auskunft.

Bricht ein Gate ab, ist das ein echter Befund — Ursache beheben, niemals das
Gate ausbauen. Ein abgelehnter Push mit „fetch first" ist meist nur der
Dashboard-Bot (`dashboard-data.yml` committet stuendlich nach `main`):
`git pull --rebase origin main`, dann erneut pushen.

### In Remote-Sessions (claude.ai/code)

| | Status |
|---|---|
| GitHub, git push | geht |
| Shopify Admin API (Shopify MCP) | geht — liest Theme-Dateien und Produktdaten, schreibt in unpublished Themes |
| Storefront `teppich-paradies.net` / `*.myshopify.com` | **403 an der Egress-Policy** — keine Screenshots |
| Shopify CLI (`theme push/pull/list`) | kein Token + Domains blockiert |

Struktur und Syntax sind hier pruefbar, **das Aussehen nicht**. Browser-Schritte
(COMPARE, SEO, FULL_QA, SALES) schlagen fehl — deshalb `--static`. Deploys laufen lokal.

## Werkzeug-Details

**`theme:diff`** braucht ein Manifest aus der Admin API (`checksumMd5` = MD5 der
Rohbytes, rund 500 Dateien = zwei Seiten, bei `hasNextPage` mit `after` blaettern).
Ergebnis als `{themeId, themeName, files:[{filename, checksumMd5}]}` ablegen:

```graphql
query { theme(id: "gid://shopify/OnlineStoreTheme/<id>") {
  name files(first: 250) { pageInfo { hasNextPage endCursor }
  nodes { filename checksumMd5 } } } }
```

**`workflow:scratch`** laeuft aus jedem Branch, auch mit uncommitteten
Aenderungen, schreibt keine Evidence und verweigert das Live-Theme und das
Preview-Evidence-Theme. Zum Deployen bleibt es bei `preview` → `live`.
