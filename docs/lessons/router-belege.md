# Laeuft der Router gerade? Zwei erfundene Pruefpfade

**Regel:** `npm run router:status` beantwortet das mit Belegen. Es gibt genau
zwei Laufzeit-Belege: `.router/ai-usage.jsonl` und `.router/manifest-run/`.

## Was passierte (2026-09-06)

Eine Sitzung nannte einem anderen Chat drei Pruefpfade, von denen zwei erfunden
waren — Namen wie `ai-routing-decisions.jsonl` klingen plausibel. Der andere
Chat meldete korrekt „existiert nicht", und daraus wurde der falsche Schluss,
der Router sei nie gestartet — obwohl das Ledger im selben Moment 23
Gemini-Aufrufe auswies.

## Warum ein Worktree das Bild verzerrt

`.router/` ist gitignored, und ein Worktree auf altem Stand kennt die Hooks
noch nicht. Eine Dispatch-Session dort meldet wahrheitsgemaess „existiert
nicht", waehrend der Router im Hauptverzeichnis laengst laeuft. Nur
`router:status` unterscheidet die beiden Faelle.

Dieselbe Falle in Remote-Sessions: `.env.local` und `.router/` fehlen dort
bewusst. Der SessionStart-Hook meldet das seit dem Vorfall in einer Zeile,
damit niemand mehr auf „Router defekt" schliesst.
