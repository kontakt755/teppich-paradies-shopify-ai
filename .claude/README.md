# Teppich Paradies – Claude Code Konfiguration

Diese Datei dokumentiert die Claude Code Konfiguration für das Shopify AI-Projekt.

## Egress-Allowlist (Netzwerk-Zugriff)

Die folgenden Domains sind erlaubt für Outbound-Requests:

- **teppich-paradies.net** – Eigene Website
- **\*.myshopify.com** – Shopify Admin API
- **admin.shopify.com** – Shopify Admin Panel

Diese Konfiguration ermöglicht:
- ✅ API-Zugriffe zur Shopify API
- ✅ Screenshots in Claude Code on the Web (ohne Berechtigungsfragen)
- ✅ Externe Ressourcen von teppich-paradies.net
- ✅ Nahtloses Arbeiten für das ganze Team

## Verwendung

Für lokale Sessions: Keine zusätzliche Konfiguration nötig.
Für Web-Sessions: Nutze "Cloud" statt "Lokal" in der Chat-Auswahl.

## Weitere Informationen

- [Claude Code Dokumentation](https://code.claude.com/docs)
- Remote Execution Environments: https://code.claude.com/docs/en/claude-code-on-the-web
