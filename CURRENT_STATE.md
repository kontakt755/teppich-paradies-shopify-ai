# Current State

Diese Datei speichert absichtlich keinen Branch, Commit, PASS-Status oder Human Approval. Solche Angaben veralten und dürfen keine Aktion autorisieren.

Verbindlichen aktuellen Zustand mit `npm run workflow:status` (kompatibel: `workflow:state`) aus Task, Git-Diff und commitgebundener Runtime-Evidence ermitteln. Die maschinenlesbare Ausgabe liegt nur lokal und unversioniert unter `.workflow/state.json`. Sie zeigt Task-Class, Implementer, Validation Scope, Review-Empfehlung, External Block, Protected Actions und die nächste Arbeitsaktion. Diese Datei nicht als laufendes Statusprotokoll manuell fortschreiben.

Wenn Evidence veraltet ist, wird erneut validiert. Unklassifizierte Testfehler werden zuerst diagnostiziert; nur konkrete geschützte externe Aktionen benötigen eine frische menschliche Freigabe.
