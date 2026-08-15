# Current State

Diese Datei speichert absichtlich keinen Branch, Commit, PASS-Status oder Human Approval. Solche Angaben veralten und dürfen keine Aktion autorisieren.

Verbindlichen aktuellen Zustand mit `npm run workflow:status` (kompatibel: `workflow:state`) aus Task, Git-Diff und commitgebundener Runtime-Evidence ermitteln. Die maschinenlesbare Ausgabe liegt nur lokal und unversioniert unter `.workflow/state.json`. Sie zeigt Task-Class, Implementer, Reviewer, External Block, Local Runner, Human Gate und genau die nächste erlaubte Aktion. Diese Datei nicht als laufendes Statusprotokoll manuell fortschreiben.

Wenn die Ermittlung fehlt, veraltet ist oder `STOP_REVIEW` meldet: keine automatische Aktion; menschliche Prüfung erforderlich.
