# Teppich Paradies – Claude Code Konfiguration

## Was hier liegt

| Datei | Zweck |
|---|---|
| `settings.json` | registriert den SessionStart-Hook |
| `hooks/session-start.sh` | installiert Abhängigkeiten und zeigt den Projektzustand |

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

- die Ergebnisse von Liquid-, Schema- und Template-Guard,
- die Produktkarten-Blöcke je Kollektions-Template (macht Drift sichtbar),
- den Hinweis auf die gesperrte Storefront.

Der Hook greift für alle Sessions, sobald er auf `main` liegt.

Zum Testen:

```bash
CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR="$PWD" ./.claude/hooks/session-start.sh
```
