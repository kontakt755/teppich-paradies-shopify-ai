---
name: deploy
description: Theme-Aenderungen von main ueber Preview ins Live-Theme bringen (workflow:doctor, workflow:preview, workflow:live), Theme gegen Repository abgleichen (theme:diff), Wegwerf-Themes (workflow:scratch), Grenzen in Remote-Sessions. Verwenden bei "deploy", "live stellen", "push das raus", bei Gate-Abbruechen und bevor irgendetwas in ein Theme gepusht wird.
---

# Deploy-Kette

Ausgelagert aus CLAUDE.md (#670). Die Punkte 4 und 5 aus `AGENTS.md` („Was hier immer wieder schiefging“) gelten weiter; Live-Theme nur ueber `domains/shopify/live-theme.json` bestimmen.

## Deploy-Kette

```
Branch → PR → main → workflow:preview (unpublished Theme) → workflow:live
```

Preview und Live verlangen `branch === main && head === origin/main` und einen
sauberen Working Tree. Dafuer gibt es **einen** Deploy-Worktree, der `main`
ausgecheckt hat (vor dem Lauf `git pull --ff-only`); vorhandenen nutzen
(`git worktree list | grep '\[main\]'`), sonst
`git worktree add ~/Developer/tp-deploy main`. Nie im Hauptcheckout deployen:
der steht losgelöst auf `origin/main`, und der Lauf schreibt Evidence-Dateien. Live zusaetzlich passende Preview-Evidence und explizite
Freigabe. **Die Kette darf der Agent eigenstaendig durchlaufen**, sobald der
Nutzer einen Deploy verlangt („deploy", „live stellen", „push das raus") — die
Freigabe-Flags sind Teil des Befehls, keine zweite Bestaetigung:

```
npm run workflow:doctor                     # zuerst - meldet alle Blocker auf einmal
node workflow/cli.mjs preview --theme-id <id> --approve-preview --p0 0 --p1 0
node workflow/cli.mjs live --theme-id <id> --approve-live --approval-text "PUBLISH LIVE" --execute --p0 0 --p1 0
```

**Deploy-Fenster: waehrend des Deploys merged niemand nach `main`.** `preview`
oeffnet `.workflow/deploy-fenster.json` in der Deploy-Arbeitskopie, `live`
schliesst es am Ende (auch bei Abbruch; eine gescheiterte Preview schliesst es
selbst). Solange es offen ist (hoechstens 60 Minuten) oder eine
`workflow preview|live`-Sperre laeuft, verweigert `.claude/hooks/git-gh-guard.mjs`
`gh pr merge` und `git push ... main`; `npm run -s deploy:frei` zeigt den Stand.
Grund: am 2026-10-08 brach Live dreimal mit `LIVE_SOURCE` ab, weil andere
Sitzungen waehrend der Preview gemergt hatten. Bleibt nach einem Abbruch ein
Fenster liegen und ist sicher kein Deploy mehr aktiv: Datei loeschen.

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

`--p0`/`--p1` sind die Zahl offener P0/P1-Befunde und haben bewusst keinen Standardwert – ohne sie bricht Preview wie Live mit `FINDINGS_BLOCK` ab. Wird zwischen Preview und Live ein fremder PR nach `main` gemergt, bricht Live mit `LIVE_SOURCE` ab: `main` nachziehen, Preview neu, dann Live.

Bricht ein Gate ab, ist das ein echter Befund — Ursache beheben, niemals das
Gate ausbauen. Ein abgelehnter Push mit „fetch first" heisst: jemand hat
parallel nach `main` gepusht (einen Dashboard-Bot gibt es seit 2026-09-30 nicht
mehr) — `git pull --rebase origin main`, dann erneut pushen.

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
