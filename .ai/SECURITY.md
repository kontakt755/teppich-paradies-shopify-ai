# Security-Kurzkontext

- Keine Secrets, Tokens, Sessions, Kundendaten oder Rohantworten in Modellkontext oder Memory.
- HIGH, Live-Publish, geschützte Themes und unbekannte Ressourcen nie autonom ausführen.
- `bypassPermissions` ist seit 2026-09-11 bewusst der Arbeitsmodus (Entscheidung Ahmet: durcharbeiten ohne Rückfragen). Harte Grenzen setzen `deny` in `.claude/hooks/git-gh-guard.mjs` und die Sicherheitsgrenzen in `CLAUDE.md` – keine `permissions.ask`-Regeln, die fragen in jedem Modus nach.
- Vor Modellreview: Allowlist, tatsächliche Operationen, Ressourcen und Diff-Budget prüfen.
- Vor Push bei neuen sensiblen Dateitypen: `npm run secret:scan`.
