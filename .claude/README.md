# Teppich Paradies – Claude Code Konfiguration

## Was hier liegt

| Datei | Zweck |
|---|---|
| `settings.json` | registriert die Hooks und die Freigaben (`permissions.allow`) |
| `hooks/session-start.sh` | zeigt den Kurzstand des Control Centers (immer) und in Remote-Sessions den Projektzustand samt Abhängigkeiten (siehe unten) |
| `hooks/gedaechtnis-sync.sh` | Gedächtnis-Ordner (Obsidian-Vault) per Git: pull bei SessionStart, push bei SessionEnd |
| `hooks/hauptcheckout-nachziehen.sh` | aus `session-start.sh`: zieht den Hauptcheckout still auf `origin/main`, nur wenn er losgelöst und sauber ist (nie Worktrees, Branches oder geänderte Dateien; ohne Netz nichts) |
| `hooks/git-gh-guard.mjs`, `theme-delete-guard.mjs` | harte Grenzen (`deny`) für Bash-Befehle |
| `hooks/deploy-command-guard.mjs` | Hinweis auf `workflow:doctor` bzw. die Troubleshooting-Datei, nur bei Befehlen, die wirklich deployen (`npm run workflow:preview\|live`, `node workflow/cli.mjs preview\|live`, `shopify theme push\|publish`), nicht bei grep/sed/echo/PR-Texten, die die Wörter enthalten |
| `hooks/shopify-mcp-guard.mjs` | harte Grenze (`deny`) für den Shopify-MCP (`mcp__*__graphql_mutation`): `themeDelete`, jede Mutation mit der Fallback-Theme-ID, Löschmutationen mit IDs (`productDelete`, `productVariantsBulkDelete`, `collectionDelete`, `menuDelete`, `discountCodeDelete`, `fileDelete`); Preise, `productSet`, Metafelder, Veröffentlichen laufen durch |
| `hooks/*.test.mjs` | Tests der Hooks (`npm run hooks:test`, Teil von `npm test`); weitere unter `qa/tests/` (`theme-delete-guard`, `shopify-mcp-guard`, `deploy-command-guard`, `git-hook-skripte`) |
| `skills/deploy/SKILL.md` | Deploy-Kette main → Preview → Live, Gates, Wegwerf-Themes |
| `skills/control-center/SKILL.md` | Regeln, Gestaltung, Ablauf und Fallstricke für das Control Center |
| `skills/produktimport/SKILL.md` | Ablauf für neue Produkte aus Lieferantenquellen (verweist auf `domains/shopify/produktimport-arbeitsweise.md`) |
| `skills/lieferant-a-recherche/SKILL.md` | Artikel- und Farbnummern bei Lieferant A belegt klären |
| `skills/shopify-massendaten/SKILL.md` | viele Metafelder/Tags auf einmal schreiben, mit Plan und Rollback |
| `skills/raumbilder-recherche/SKILL.md` | Produkte ohne Raumbild: Hersteller hinter dem Lieferantenprodukt finden, farbgenaue Raumbilder aus erlaubten Quellen suchen |
| `skills/theme-regeln/SKILL.md` | aus `AGENTS.md` ausgelagert (2026-10-16): Fallstricke 1–3, Shopify Theme, Produktkarten, UX/Design, Bilder, Tests, Schrift und Rot |
| `skills/preislogik/SKILL.md` | aus `AGENTS.md` ausgelagert (2026-10-16): Aktionen/Streichpreise Teppichboden, Fussleiste, Paketprodukte, Vinyl-Preisfilter |
| `skills/werkzeuge/SKILL.md` | aus `AGENTS.md` ausgelagert (2026-10-16): Werkzeugtabelle aller `npm run`-Befehle |
| `skills/theme-audit/` | nur lesendes Theme-Audit mit Pruefliste; uebernommen aus zwei MIT-Skills (Quellen in `QUELLEN.md`), Bericht nach `docs/audits/` |
| `hooks/pre-commit-unmerged-branch.sh`, `hooks/SETUP.md` | Git-Pre-Commit-Hook gegen Commits auf alten, nie gemergten Branches (warnt ab 7, blockiert ab 30 Tagen; AGENTS.md Fallstrick 6). Vergleicht seit 16.10. mit `origin/main` statt dem lokalen `main`. Wirkt nur, wenn er je Rechner installiert ist (`hooks/SETUP.md`; auf dem Mac seit 16.10.) |
| `agents/control-center.md` | Dashboard-Mitarbeiter (Subagent), arbeitet nach dem Skill oben |

## Was bewusst nicht mehr hier liegt

Bis 2026-09-30 hingen an jedem Prompt und jedem Stop ein Modell-Router
(Klassen A–D), eine Voranalyse durch ein Drittmodell, ein Codex-Pflichtreview,
ein Kontext-Wächter und Context Mode. Gemessen brachte das wenig (Klassifizierung
fast immer B, Voranalyse zu 76 % abgeschnitten, 84 % der Reviews mit P1/P2,
rund zwei Drittel davon Scope-Rauschen aus dem geteilten Checkout) und kostete
Stunden Wartezeit. Entfernt;
ein Modell pro Sitzung (Standard aus `~/.claude/settings.json`), Review gezielt
per `/code-review` oder Codex auf den PR-Diff.

## Berechtigungen: warum es keine `ask`-Liste gibt

Stand 2026-09-11, gegen die offizielle Doku geprüft
([Permission modes](https://code.claude.com/docs/en/permission-modes)):

- **Eine `permissions.ask`-Regel fragt in jedem Modus nach**, auch in Auto und
  „Umgehen“ (`bypassPermissions`). Bei einer Befehlskette reicht ein Teilbefehl,
  und „Immer erlauben“ hilft nicht, weil `ask` vor `allow` ausgewertet wird. Die
  frühere Liste (`git push`, `gh pr create` …) hat deshalb in der Desktop-App
  trotz Bypass laufend Rückfragen erzeugt. Sie ist entfernt.
- **`defaultMode` `auto` oder `bypassPermissions` wirkt aus Projektdateien nicht**
  (`.claude/settings.json`, `.claude/settings.local.json`). `bypassPermissions`
  dort lässt die Terminal-Session sogar im Manual-Modus starten. Der
  Standardmodus gehört nach `~/.claude/settings.json`; die Desktop-App merkt
  sich den im Modus-Wähler gewählten Modus pro Ordner.
- **`autoMode` wird aus Projektdateien nicht gelesen**, nur aus
  `~/.claude/settings.json`, und die Einträge sind Prosa-Regeln, keine
  Werkzeugnamen.

Harte Grenzen setzt `hooks/git-gh-guard.mjs` mit `deny` (force-push,
`reset --hard`, Branch löschen …). Das greift in jedem Modus und lässt sich
durch keine Freigabe aushebeln. Eine neue harte Grenze gehört dorthin, nicht
als `ask`-Regel in `settings.json`.

## Netzwerkzugriff wird NICHT hier konfiguriert

Eine frühere Fassung dieser Datei beschrieb eine Egress-Allowlist in
`settings.json`:

```json
{ "network": { "egressAllowlist": ["teppich-paradies.net", "..."] } }
```

**Das hat keine Wirkung.** Gegen die offizielle Dokumentation geprüft:

- In der [Settings-Referenz](https://code.claude.com/docs/en/settings) kommt
  „egress" nicht vor, und einen `network`-Schlüssel gibt es nicht.
- Gültige `permissions`-Unterschlüssel sind `allow`, `deny`, `ask`,
  `defaultMode` und `additionalDirectories` — ein `default` gibt es nicht.
- Laut [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
  läuft jede Cloud-Session in einer **Cloud-Environment**, und diese
  gespeicherte Konfiguration steuert Netzwerkzugriff, Umgebungsvariablen und
  Setup-Skripte.

Der Zugriff wird also in den **Environment-Einstellungen auf claude.ai**
gesetzt, nicht im Repository. Siehe
[Cloud environments](https://code.claude.com/docs/en/cloud-environments).

Solange das dort nicht freigegeben ist, antworten `teppich-paradies.net`,
`*.myshopify.com` und `admin.shopify.com` in Remote-Sessions mit 403 an der
Egress-Policy. Praktische Folge: **keine Screenshots der Storefront**, und die
Browser-Schritte der QA-Pipeline (COMPARE, SEO, FULL_QA, SALES) schlagen dort
zwangsläufig fehl. Deshalb dort `node workflow/cli.mjs validate --static`.

Die Shopify **Admin API** ist davon nicht betroffen — sie läuft über den
Shopify-MCP und funktioniert auch in Remote-Sessions (Theme-Dateien lesen,
Produktdaten abfragen, in unpublished Themes schreiben).

## SessionStart-Hook

Läuft in **jeder** Session zweistufig:

- **Immer lokal, zuerst:** Hauptcheckout still nachziehen
  (`hooks/hauptcheckout-nachziehen.sh`, siehe Tabelle oben).
- **Immer (auch lokal):** Sync-Pfad-Wächter (warnt, wenn der Checkout in einem
  Cloud-Ordner liegt) und die Kurzfassung des Control Centers
  (`scripts/dashboard-brief.mjs`, rund fünf Zeilen; ist
  `docs/ai-dashboard/issues.json` älter als eine Stunde, wird sie im
  Hintergrund neu erzeugt).
- **Nur in Remote-Sessions (`$CLAUDE_CODE_REMOTE`):** installiert fehlende
  npm-Abhängigkeiten und gibt aus:
  - die Ergebnisse von Liquid-, Schema-, Template- und Live-Theme-Guard,
  - welches Theme laut `domains/shopify/live-theme.json` live ist (samt Prüfdatum),
  - Drift der Produktkarten-Blöcke über die Kollektions-Templates (nur die
    `BLOCK_DRIFT`-Zeilen; volle Liste: `npm run theme:block list`),
  - den Hinweis auf die gesperrte Storefront.

Der Live-Theme-Guard steht in dieser Liste, weil eine veraltete Theme-ID in
CLAUDE.md dazu geführt hat, dass Sessions monatelang ein längst gelöschtes
Theme als Live-Stand nannten. Jetzt steht der geprüfte Stand in jeder Session
oben im Log.

Der Hook greift für alle Sessions, sobald er auf `main` liegt.

Zum Testen:

```bash
CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR="$PWD" ./.claude/hooks/session-start.sh
```
