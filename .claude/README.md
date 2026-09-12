# Teppich Paradies – Claude Code Konfiguration

## Was hier liegt

| Datei | Zweck |
|---|---|
| `settings.json` | registriert die Hooks und die Freigaben (`permissions.allow`) |
| `hooks/session-start.sh` | installiert Abhängigkeiten und zeigt den Projektzustand |

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

Läuft nur in Remote-Sessions (`$CLAUDE_CODE_REMOTE`); lokal ist die Umgebung
ohnehin eingerichtet. Er installiert fehlende npm-Abhängigkeiten und gibt aus:

- die Ergebnisse von Liquid-, Schema-, Template- und Live-Theme-Guard,
- welches Theme laut `domains/shopify/live-theme.json` live ist (samt Prüfdatum),
- die Produktkarten-Blöcke je Kollektions-Template (macht Drift sichtbar),
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
