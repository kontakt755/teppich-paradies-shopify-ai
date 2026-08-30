# Security-Kurzkontext

- Keine Secrets, Tokens, Sessions, Kundendaten oder Rohantworten in Modellkontext oder Memory.
- HIGH, Live-Publish, geschützte Themes und unbekannte Ressourcen nie autonom ausführen.
- Kein pauschales `bypassPermissions` für Agenten.
- Vor Modellreview: Allowlist, tatsächliche Operationen, Ressourcen und Diff-Budget prüfen.
- Vor Push bei neuen sensiblen Dateitypen: `npm run secret:scan`.
