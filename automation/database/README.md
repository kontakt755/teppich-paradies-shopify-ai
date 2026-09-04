# Fehler-Datenbank

Automatisch generiert vom SessionStart-Hook in Remote-Sessions.

## Dateien

- **error-db.json** — Router-Klassifizierung aller offenen GitHub-Issues
  - Struktur: Array von Issues mit Router-Routing-Info (Klasse A/B/C/D, Implementer, etc.)
  - Generiert von: `automation/scripts/session-start-router.mjs`
  - Update-Trigger: Jeder SessionStart (Cloud-Sessions)

## Verwendung

```bash
# Manuelle Klassifizierung (wenn router.mjs allein gebraucht wird)
npm run workflow:router
```

Die Fehler-Datenbank wird **nicht** in Git getracked — sie ist Laufzeit-Output.
